import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, browserStorage, adoptAnonymousShots } from '../web/store.js';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
  };
}

function newShot(overrides = {}) {
  return {
    dose_g: 18, yield_g: 36, time_s: 28, grind: 12, bean: 'Red Brick', taste: 'balanced',
    ...overrides,
  };
}

test('a saved shot gets a uuid, a timestamp and a dirty flag', () => {
  const store = createStore(fakeStorage());
  const shot = store.addShot(newShot());
  assert.match(shot.id, /^[0-9a-f-]{36}$/);
  assert.equal(shot.dirty, true);
  assert.equal(shot.deleted_at, null);
  assert.ok(shot.pulled_at);
});

test('two shots saved in the same millisecond get different ids', () => {
  const store = createStore(fakeStorage());
  const first = store.addShot(newShot());
  const second = store.addShot(newShot());
  assert.notEqual(first.id, second.id);
});

test('shots survive a reload', () => {
  const storage = fakeStorage();
  createStore(storage).addShot(newShot());
  assert.equal(createStore(storage).activeShots().length, 1);
});

test('deleting a shot tombstones it rather than removing it', () => {
  const store = createStore(fakeStorage());
  const shot = store.addShot(newShot());
  store.deleteShot(shot.id);
  assert.equal(store.activeShots().length, 0);
  assert.equal(store.allShots().length, 1);
  assert.ok(store.allShots()[0].deleted_at);
  assert.equal(store.allShots()[0].dirty, true);
});

// Pins the storage key. Without this, the corrupt-data test below would pass
// even if the key were wrong, because a missing key also yields an empty list.
test('shots are read back from the documented storage key', () => {
  const stored = [{
    id: 'aaaaaaaa-0000-4000-8000-000000000001', user_id: null,
    pulled_at: '2026-10-17T09:00:00Z', dose_g: 18, yield_g: 36, time_s: 28,
    grind: null, bean: 'Jabali', taste: 'sour', deleted_at: null,
    updated_at: '2026-10-17T09:00:00Z',
  }];
  const store = createStore(fakeStorage({ 'barista-assist-shots-v1:anon': JSON.stringify(stored) }));
  assert.equal(store.activeShots().length, 1);
  assert.equal(store.activeShots()[0].bean, 'Jabali');
});

test('corrupt stored data resets to an empty list instead of throwing', () => {
  const store = createStore(fakeStorage({ 'barista-assist-shots-v1:anon': 'not json at all' }));
  assert.deepEqual(store.activeShots(), []);
});

test('storage that refuses to write still allows logging for the session', () => {
  const readOnly = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
  };
  const store = createStore(readOnly);
  assert.doesNotThrow(() => store.addShot(newShot()));
  assert.equal(store.activeShots().length, 1);
});

test('bean names are trimmed on save', () => {
  const store = createStore(fakeStorage());
  const shot = store.addShot(newShot({ bean: '  Red Brick  ' }));
  assert.equal(shot.bean, 'Red Brick');
});

test('an empty bean is stored as null', () => {
  const store = createStore(fakeStorage());
  assert.equal(store.addShot(newShot({ bean: '   ' })).bean, null);
});

test('distinctBeans is case-insensitively unique and skips blanks and tombstones', () => {
  const store = createStore(fakeStorage());
  store.addShot(newShot({ bean: 'Red Brick' }));
  store.addShot(newShot({ bean: 'red brick ' }));
  store.addShot(newShot({ bean: null }));
  const deleted = store.addShot(newShot({ bean: 'Jabali' }));
  store.deleteShot(deleted.id);
  assert.deepEqual(store.distinctBeans(), ['Red Brick']);
});

test('markClean clears the dirty flag only for the listed ids', () => {
  const store = createStore(fakeStorage());
  const first = store.addShot(newShot());
  const second = store.addShot(newShot());
  store.markClean([first.id]);
  assert.deepEqual(store.dirtyShots().map((shot) => shot.id), [second.id]);
});

test('mergeRemote adds unseen rows and overwrites local copies of the same id', () => {
  const store = createStore(fakeStorage());
  const local = store.addShot(newShot({ bean: 'Old' }));
  store.markClean([local.id]);
  store.mergeRemote([
    { ...local, bean: 'New', dirty: undefined, updated_at: '2026-10-17T10:00:00Z' },
    { id: 'aaaaaaaa-0000-4000-8000-000000000001', dose_g: 20, yield_g: 40, time_s: 30,
      grind: null, bean: 'Remote', taste: 'sour', deleted_at: null,
      pulled_at: '2026-10-17T09:00:00Z', updated_at: '2026-10-17T09:00:00Z' },
  ]);
  assert.equal(store.activeShots().length, 2);
  assert.equal(store.allShots().find((shot) => shot.id === local.id).bean, 'New');
});

test('a remote tombstone keeps a locally present shot deleted', () => {
  const store = createStore(fakeStorage());
  const shot = store.addShot(newShot());
  store.markClean([shot.id]);
  store.mergeRemote([{ ...shot, deleted_at: '2026-10-17T10:00:00Z', updated_at: '2026-10-17T10:00:00Z' }]);
  assert.equal(store.activeShots().length, 0);
});

test('mergeRemote never clobbers a shot with unpushed local changes', () => {
  const store = createStore(fakeStorage());
  const shot = store.addShot(newShot({ bean: 'Local edit' })); // still dirty
  store.mergeRemote([{ ...shot, bean: 'Stale remote', updated_at: '2020-01-01T00:00:00Z' }]);
  assert.equal(store.activeShots()[0].bean, 'Local edit');
});

test('stampUserId fills in missing owners and marks them for push', () => {
  const store = createStore(fakeStorage());
  const shot = store.addShot(newShot());
  store.markClean([shot.id]);
  store.stampUserId('user-1');
  assert.equal(store.allShots()[0].user_id, 'user-1');
  assert.equal(store.dirtyShots().length, 1);
});

test('stampUserId leaves shots that already have an owner alone', () => {
  const store = createStore(fakeStorage());
  const shot = store.addShot(newShot());
  store.stampUserId('user-1');
  store.markClean([shot.id]);
  store.stampUserId('user-2');
  assert.equal(store.allShots()[0].user_id, 'user-1');
  assert.equal(store.dirtyShots().length, 0);
});

// --- I8: localStorage property access can itself throw -----------------------

test('browserStorage falls back to memory when localStorage access throws', () => {
  // Chrome with "block all cookies" throws SecurityError on the property read
  // itself, before any getItem/setItem wrapper can catch it.
  const hostile = { get localStorage() { throw new Error('SecurityError'); } };
  const storage = browserStorage(hostile);
  assert.doesNotThrow(() => storage.setItem('k', 'v'));
  assert.equal(storage.getItem('k'), 'v');
  assert.equal(storage.getItem('absent'), null);
});

test('browserStorage uses the real localStorage when it is available', () => {
  const data = {};
  const real = {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
  assert.equal(browserStorage({ localStorage: real }), real);
});

// --- I6: foreign JSON that happens to be an array ----------------------------

test('an array of non-shots is discarded rather than crashing the render', () => {
  const store = createStore(fakeStorage({ 'barista-assist-shots-v1:anon': '["a","b"]' }));
  assert.doesNotThrow(() => store.activeShots());
  assert.deepEqual(store.activeShots(), []);
});

test('objects missing the fields the UI reads are discarded', () => {
  const store = createStore(fakeStorage({ 'barista-assist-shots-v1:anon': '[{"foo":1}]' }));
  assert.deepEqual(store.activeShots(), []);
});

test('valid shots survive alongside junk entries', () => {
  const good = {
    id: 'aaaaaaaa-0000-4000-8000-000000000001', user_id: null,
    pulled_at: '2026-10-17T09:00:00Z', dose_g: 18, yield_g: 36, time_s: 28,
    grind: null, bean: 'Jabali', taste: 'sour', deleted_at: null,
    updated_at: '2026-10-17T09:00:00Z', rev: 1,
  };
  const store = createStore(fakeStorage({
    'barista-assist-shots-v1:anon': JSON.stringify([good, 'junk', null, { foo: 1 }]),
  }));
  assert.equal(store.activeShots().length, 1);
  assert.equal(store.activeShots()[0].bean, 'Jabali');
});

// --- C2: a change made while a push is in flight must stay queued ------------

test('markClean does not clear a shot mutated since the payload was captured', () => {
  const store = createStore(fakeStorage());
  const shot = store.addShot(newShot());
  const captured = [{ id: shot.id, rev: shot.rev }]; // what the push sent

  store.deleteShot(shot.id);  // user deletes while the request is in flight
  store.markClean(captured);  // the push resolves

  assert.equal(store.dirtyShots().length, 1, 'tombstone must still be queued');
  assert.ok(store.allShots()[0].deleted_at);
});

test('markClean still clears a shot that was not touched', () => {
  const store = createStore(fakeStorage());
  const shot = store.addShot(newShot());
  store.markClean([{ id: shot.id, rev: shot.rev }]);
  assert.equal(store.dirtyShots().length, 0);
});

// --- C3: two accounts on one browser must not see or adopt each other's shots -

test('each scope keeps its own shots', () => {
  const storage = fakeStorage();
  createStore(storage, 'alice').addShot(newShot({ bean: 'Alice bean' }));
  const bob = createStore(storage, 'bob');
  assert.deepEqual(bob.activeShots(), [], "bob must not see alice's shots");
});

test('each scope keeps its own sync high-water mark', () => {
  const storage = fakeStorage();
  createStore(storage, 'alice').setLastSyncAt('2026-10-17T10:00:00Z');
  assert.equal(createStore(storage, 'bob').lastSyncAt(), null);
});

test('signing in adopts shots logged while signed out', () => {
  const storage = fakeStorage();
  const anon = createStore(storage);
  anon.addShot(newShot({ bean: 'Logged signed out' }));

  const owned = adoptAnonymousShots(storage, 'alice');

  assert.equal(owned.activeShots().length, 1);
  assert.equal(owned.allShots()[0].user_id, 'alice');
  assert.equal(owned.dirtyShots().length, 1, 'adopted shots must be queued for push');
  assert.deepEqual(createStore(storage).activeShots(), [], 'anon scope is emptied');
});

test('a second account does not adopt the first account\'s shots', () => {
  const storage = fakeStorage();
  createStore(storage).addShot(newShot({ bean: 'Alice signed-out shot' }));
  adoptAnonymousShots(storage, 'alice');

  const bob = adoptAnonymousShots(storage, 'bob');

  assert.deepEqual(bob.activeShots(), [], "bob must not inherit alice's shots");
  assert.equal(createStore(storage, 'alice').activeShots().length, 1);
});

test('adopting twice does not duplicate', () => {
  const storage = fakeStorage();
  createStore(storage).addShot(newShot());
  adoptAnonymousShots(storage, 'alice');
  const again = adoptAnonymousShots(storage, 'alice');
  assert.equal(again.activeShots().length, 1);
});

// --- remembering the advice that was given ----------------------------------

const ADVICE = {
  verdict: 'Under-extracted',
  lead: 'Go finer by 1–2 steps.',
  tips: ['Next grind setting to try: 11 (from 12).', 'A fast shot gives the water too little contact time.'],
};

test('a shot remembers the advice it was given', () => {
  const store = createStore(fakeStorage());
  const shot = store.addShot({ ...newShot(), advice: ADVICE });
  assert.deepEqual(shot.advice, ADVICE);
});

test('stored advice survives a reload', () => {
  const storage = fakeStorage();
  createStore(storage).addShot({ ...newShot(), advice: ADVICE });
  assert.deepEqual(createStore(storage).activeShots()[0].advice, ADVICE);
});

test('a shot saved without advice records null rather than undefined', () => {
  // undefined disappears through JSON.stringify, so the column would be absent
  // from the payload rather than explicitly empty.
  const store = createStore(fakeStorage());
  assert.equal(store.addShot(newShot()).advice, null);
});

test('advice is never rewritten once recorded', () => {
  // The whole point is that it is what you were told at the time.
  const store = createStore(fakeStorage());
  const shot = store.addShot({ ...newShot(), advice: ADVICE });
  store.deleteShot(shot.id);
  assert.deepEqual(store.allShots()[0].advice, ADVICE);
});

test('remote rows carry their advice into the local store', () => {
  const store = createStore(fakeStorage());
  store.mergeRemote([{
    id: 'aaaaaaaa-0000-4000-8000-0000000000ad', user_id: 'user-1',
    pulled_at: '2026-10-17T09:00:00Z', dose_g: 18, yield_g: 36, time_s: 22,
    grind: 12, bean: null, taste: 'sour', deleted_at: null,
    updated_at: '2026-10-17T09:00:00Z', advice: ADVICE,
  }]);
  assert.deepEqual(store.activeShots()[0].advice, ADVICE);
});
