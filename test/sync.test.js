import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../web/store.js';
import { syncNow } from '../web/sync.js';

function fakeStorage() {
  const data = {};
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
  };
}

// Minimal stand-in for the supabase-js query builder, recording what it was asked to do.
function fakeClient({ remoteRows = [], failUpsert = false, failSelect = false } = {}) {
  const calls = { upserted: [], selectedSince: null };
  return {
    calls,
    from() {
      return {
        upsert(rows) {
          calls.upserted.push(rows);
          return Promise.resolve(failUpsert ? { error: new Error('offline') } : { error: null });
        },
        select() {
          const builder = {
            gt(_column, value) { calls.selectedSince = value; return builder; },
            order() {
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

function newShot(store) {
  return store.addShot({
    dose_g: 18, yield_g: 36, time_s: 28, grind: 12, bean: 'Red Brick', taste: 'balanced',
  });
}

test('a successful push clears the dirty flags', async () => {
  const store = createStore(fakeStorage());
  newShot(store);
  const client = fakeClient();
  const result = await syncNow({ client, store, userId: 'user-1' });
  assert.equal(result.pushed, 1);
  assert.equal(store.dirtyShots().length, 0);
});

test('the pushed row carries no local-only fields', async () => {
  const store = createStore(fakeStorage());
  newShot(store);
  const client = fakeClient();
  await syncNow({ client, store, userId: 'user-1' });
  assert.equal('dirty' in client.calls.upserted[0][0], false);
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

test('signing in stamps existing local shots with the user id', async () => {
  const store = createStore(fakeStorage());
  newShot(store);
  const client = fakeClient();
  await syncNow({ client, store, userId: 'user-1' });
  assert.equal(client.calls.upserted[0][0].user_id, 'user-1');
});

test('pulled rows land in the store', async () => {
  const store = createStore(fakeStorage());
  const client = fakeClient({
    remoteRows: [{
      id: 'aaaaaaaa-0000-4000-8000-000000000001', user_id: 'user-1',
      pulled_at: '2026-10-17T09:00:00Z', dose_g: 20, yield_g: 40, time_s: 30,
      grind: null, bean: 'Jabali', taste: 'sour', deleted_at: null,
      updated_at: '2026-10-17T09:00:00Z',
    }],
  });
  const result = await syncNow({ client, store, userId: 'user-1' });
  assert.equal(result.pulled, 1);
  assert.equal(store.activeShots().length, 1);
});

test('the high-water mark comes from the server timestamps, never the local clock', async () => {
  const store = createStore(fakeStorage());
  const client = fakeClient({
    remoteRows: [
      { id: 'aaaaaaaa-0000-4000-8000-000000000001', pulled_at: '2026-10-17T09:00:00Z',
        dose_g: 20, yield_g: 40, time_s: 30, grind: null, bean: null, taste: 'sour',
        deleted_at: null, updated_at: '2026-10-17T09:00:00Z' },
      { id: 'aaaaaaaa-0000-4000-8000-000000000002', pulled_at: '2026-10-17T10:00:00Z',
        dose_g: 20, yield_g: 40, time_s: 30, grind: null, bean: null, taste: 'sour',
        deleted_at: null, updated_at: '2026-10-17T11:30:00Z' },
    ],
  });
  await syncNow({ client, store, userId: 'user-1' });
  assert.equal(store.lastSyncAt(), '2026-10-17T11:30:00Z');
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
    remoteRows: [{ ...shot, dirty: undefined, user_id: 'user-1',
      deleted_at: '2026-10-17T12:00:00Z', updated_at: '2026-10-17T12:00:00Z' }],
  });
  await syncNow({ client, store, userId: 'user-1' });
  assert.equal(store.activeShots().length, 0);
  assert.equal(client.calls.upserted.length, 0); // nothing dirty, nothing pushed
});
