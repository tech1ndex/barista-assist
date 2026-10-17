import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../web/store.js';

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

test('corrupt stored data resets to an empty list instead of throwing', () => {
  const store = createStore(fakeStorage({ 'dialin-shots-v2': 'not json at all' }));
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
