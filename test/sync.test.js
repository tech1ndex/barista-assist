import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../web/store.js';
import { syncNow } from '../web/sync.js';

function fakeStorage(overrides = {}) {
  const data = {};
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    ...overrides,
  };
}

/**
 * Stand-in for the supabase-js query builder. Rows are upserted one at a time.
 * `rejectBeans` fails just those rows, modelling a server-side constraint
 * violation on one shot; `throwOnUpsert` models the library throwing rather
 * than resolving with an error, which the real client does on network failure.
 */
function fakeClient({
  remoteRows = [], failUpsert = false, failSelect = false,
  rejectBeans = [], throwOnUpsert = false, throwOnSelect = false,
} = {}) {
  const calls = { upserted: [], selectedSince: null };
  return {
    calls,
    from() {
      return {
        upsert(row) {
          calls.upserted.push(row);
          if (throwOnUpsert) return Promise.reject(new Error('network down'));
          if (failUpsert || rejectBeans.includes(row.bean)) {
            return Promise.resolve({ error: new Error('numeric field overflow') });
          }
          return Promise.resolve({ error: null });
        },
        select() {
          const builder = {
            gt(_column, value) { calls.selectedSince = value; return builder; },
            order() {
              if (throwOnSelect) return Promise.reject(new Error('network down'));
              return Promise.resolve(failSelect
                ? { data: null, error: new Error('offline') }
                : { data: remoteRows, error: null });
            },
          };
          return builder;
        },
      };
    },
  };
}

function newShot(store, overrides = {}) {
  return store.addShot({
    dose_g: 18, yield_g: 36, time_s: 28, grind: 12, bean: 'Red Brick', taste: 'balanced',
    ...overrides,
  });
}

function remoteRow(id, updatedAt, overrides = {}) {
  return {
    id, user_id: 'user-1', pulled_at: updatedAt, dose_g: 20, yield_g: 40,
    time_s: 30, grind: null, bean: null, taste: 'sour', deleted_at: null,
    updated_at: updatedAt, ...overrides,
  };
}

test('a successful push clears the dirty flags', async () => {
  const store = createStore(fakeStorage());
  newShot(store);
  const result = await syncNow({ client: fakeClient(), store, userId: 'user-1' });
  assert.equal(result.pushed, 1);
  assert.equal(store.dirtyShots().length, 0);
});

test('the pushed row carries no local-only fields', async () => {
  const store = createStore(fakeStorage());
  newShot(store);
  const client = fakeClient();
  await syncNow({ client, store, userId: 'user-1' });
  assert.equal('dirty' in client.calls.upserted[0], false);
  assert.equal('rev' in client.calls.upserted[0], false);
});

test('a failed push leaves the shot dirty and reports it pending', async () => {
  const store = createStore(fakeStorage());
  newShot(store);
  const result = await syncNow({ client: fakeClient({ failUpsert: true }), store, userId: 'user-1' });
  assert.equal(result.pushed, 0);
  assert.equal(result.pending, 1);
  assert.equal(store.dirtyShots().length, 1);
});

test('sync never throws when the project is unreachable', async () => {
  const store = createStore(fakeStorage());
  newShot(store);
  const client = fakeClient({ failUpsert: true, failSelect: true });
  await assert.doesNotReject(() => syncNow({ client, store, userId: 'user-1' }));
});

test('sync survives the client throwing rather than returning an error', async () => {
  const store = createStore(fakeStorage());
  newShot(store);
  const client = fakeClient({ throwOnUpsert: true, throwOnSelect: true });
  const result = await syncNow({ client, store, userId: 'user-1' });
  assert.equal(result.pushed, 0);
  assert.equal(result.pending, 1);
  assert.ok(result.problems.length > 0, 'the failure must be reported, not swallowed');
});

test('signing in stamps existing local shots with the user id', async () => {
  const store = createStore(fakeStorage());
  newShot(store);
  const client = fakeClient();
  await syncNow({ client, store, userId: 'user-1' });
  assert.equal(client.calls.upserted[0].user_id, 'user-1');
});

// --- I1: one bad row must not block the rest of the outbox -------------------

test('one rejected row does not stop the others from syncing', async () => {
  const store = createStore(fakeStorage());
  const good = newShot(store, { bean: 'Fine' });
  const bad = newShot(store, { bean: 'Rejected' });

  const result = await syncNow({
    client: fakeClient({ rejectBeans: ['Rejected'] }), store, userId: 'user-1',
  });

  assert.equal(result.pushed, 1);
  assert.deepEqual(store.dirtyShots().map((s) => s.id), [bad.id]);
  assert.equal(store.allShots().find((s) => s.id === good.id).dirty, undefined);
});

test('a permanently rejected row is reported rather than silently retried', async () => {
  const store = createStore(fakeStorage());
  newShot(store, { bean: 'Rejected' });
  const result = await syncNow({
    client: fakeClient({ rejectBeans: ['Rejected'] }), store, userId: 'user-1',
  });
  assert.ok(result.problems.some((p) => /could not sync shot/.test(p)));
});

// --- pull and the high-water mark -------------------------------------------

test('pulled rows land in the store', async () => {
  const store = createStore(fakeStorage());
  const client = fakeClient({
    remoteRows: [remoteRow('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-17T09:00:00Z', { bean: 'Jabali' })],
  });
  const result = await syncNow({ client, store, userId: 'user-1' });
  assert.equal(result.pulled, 1);
  assert.equal(store.activeShots().length, 1);
});

test('the high-water mark comes from the server timestamps, never the local clock', async () => {
  const store = createStore(fakeStorage());
  const client = fakeClient({
    remoteRows: [
      remoteRow('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-17T09:00:00Z'),
      remoteRow('aaaaaaaa-0000-4000-8000-000000000002', '2026-10-17T11:30:00Z'),
    ],
  });
  await syncNow({ client, store, userId: 'user-1' });
  // Newest server value, rewound by the commit-skew allowance.
  assert.equal(store.lastSyncAt(), '2026-10-17T11:29:30.000Z');
});

test('an empty pull leaves the previous high-water mark alone', async () => {
  const store = createStore(fakeStorage());
  store.setLastSyncAt('2026-10-17T08:00:00Z');
  await syncNow({ client: fakeClient({ remoteRows: [] }), store, userId: 'user-1' });
  assert.equal(store.lastSyncAt(), '2026-10-17T08:00:00Z');
});

test('the next pull asks only for rows newer than the high-water mark', async () => {
  const store = createStore(fakeStorage());
  store.setLastSyncAt('2026-10-17T08:00:00Z');
  const client = fakeClient();
  await syncNow({ client, store, userId: 'user-1' });
  assert.equal(client.calls.selectedSince, '2026-10-17T08:00:00Z');
});

test('a deletion on another device is not resurrected by a stale local copy', async () => {
  const store = createStore(fakeStorage());
  const shot = newShot(store);
  await syncNow({ client: fakeClient(), store, userId: 'user-1' }); // shot is now clean
  const client = fakeClient({
    remoteRows: [{ ...shot, dirty: undefined, rev: undefined, user_id: 'user-1',
      deleted_at: '2026-10-17T12:00:00Z', updated_at: '2026-10-17T12:00:00Z' }],
  });
  await syncNow({ client, store, userId: 'user-1' });
  assert.equal(store.activeShots().length, 0);
  assert.equal(client.calls.upserted.length, 0); // nothing dirty, nothing pushed
});

// --- I2: a row held back must stay reachable --------------------------------

test('the cursor does not advance past a row held back for local changes', async () => {
  const store = createStore(fakeStorage());
  const shot = newShot(store); // stays dirty: the push will fail

  const client = fakeClient({
    failUpsert: true,
    remoteRows: [
      { ...shot, dirty: undefined, rev: undefined, user_id: 'user-1',
        deleted_at: '2026-10-17T12:00:00Z', updated_at: '2026-10-17T12:00:00Z' },
      remoteRow('aaaaaaaa-0000-4000-8000-000000000009', '2026-10-17T13:00:00Z'),
    ],
  });

  await syncNow({ client, store, userId: 'user-1' });

  // The skipped tombstone is at 12:00. The mark must stay below it so a later
  // pull offers it again, rather than jumping to 13:00 and stranding it.
  assert.ok(
    store.lastSyncAt() < '2026-10-17T12:00:00Z',
    `expected a mark below the skipped row, got ${store.lastSyncAt()}`,
  );
});

// --- I4: never advance the cursor past rows that were not stored ------------

test('the cursor holds when merged rows could not be written to storage', async () => {
  let allowWrites = true;
  const store = createStore(fakeStorage({
    setItem: (key, value) => {
      if (!allowWrites && key.startsWith('barista-assist-shots')) {
        throw new Error('QuotaExceededError');
      }
      return undefined;
    },
  }));
  store.setLastSyncAt('2026-10-17T08:00:00Z');
  allowWrites = false;

  const client = fakeClient({
    remoteRows: [remoteRow('aaaaaaaa-0000-4000-8000-00000000000a', '2026-10-17T14:00:00Z')],
  });
  const result = await syncNow({ client, store, userId: 'user-1' });

  assert.equal(store.lastSyncAt(), '2026-10-17T08:00:00Z', 'cursor must not move');
  assert.ok(result.problems.some((p) => /could not be stored/.test(p)));
});
