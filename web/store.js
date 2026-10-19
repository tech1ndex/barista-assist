const SHOTS_KEY_PREFIX = 'barista-assist-shots-v1';
const LAST_SYNC_KEY_PREFIX = 'barista-assist-last-sync-v1';

export const ANONYMOUS_SCOPE = 'anon';

function newId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  // Older browsers without randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function cleanBean(bean) {
  const trimmed = (bean ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

function isShot(value) {
  return value !== null
    && typeof value === 'object'
    && typeof value.id === 'string'
    && typeof value.pulled_at === 'string';
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
  };
}


export function browserStorage(global = globalThis) {
  try {
    const storage = global.localStorage;
    storage.getItem(`${SHOTS_KEY_PREFIX}:probe`);
    return storage;
  } catch {
    return memoryStorage();
  }
}


export function createStore(storage, scope = ANONYMOUS_SCOPE) {
  const SHOTS_KEY = `${SHOTS_KEY_PREFIX}:${scope}`;
  const LAST_SYNC_KEY = `${LAST_SYNC_KEY_PREFIX}:${scope}`;

  function readString(key) {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  function readShots() {
    try {
      const parsed = JSON.parse(storage.getItem(SHOTS_KEY));
      return Array.isArray(parsed) ? parsed.filter(isShot) : [];
    } catch {
      return [];
    }
  }

  const shots = readShots();
  let lastSync = readString(LAST_SYNC_KEY);

  // Returns false when the write did not land, so callers that must not get
  // ahead of what is durably stored can hold back.
  function write(key, value) {
    try {
      storage.setItem(key, value);
      return true;
    } catch {
      // Storage is full or unavailable. The in-memory copy still serves this
      // session, and losing history is better than losing the shot.
      return false;
    }
  }

  function persist() {
    return write(SHOTS_KEY, JSON.stringify(shots));
  }

  function byId(id) {
    return shots.find((shot) => shot.id === id);
  }

  function touch(shot) {
    shot.rev = (shot.rev ?? 1) + 1;
    shot.dirty = true;
  }

  return {
    scope,

    allShots() {
      return shots.slice();
    },

    activeShots() {
      return shots
        .filter((shot) => !shot.deleted_at)
        .sort((left, right) => (left.pulled_at < right.pulled_at ? 1 : -1));
    },

    addShot({ dose_g, yield_g, time_s, grind, bean, taste, advice }) {
      const now = new Date().toISOString();
      const shot = {
        id: newId(),
        user_id: scope === ANONYMOUS_SCOPE ? null : scope,
        pulled_at: now,
        dose_g,
        yield_g,
        time_s,
        grind: grind ?? null,
        bean: cleanBean(bean),
        taste,
        advice: advice ?? null,
        deleted_at: null,
        updated_at: now,
        rev: 1,
        dirty: true,
      };
      shots.push(shot);
      persist();
      return shot;
    },

    deleteShot(id) {
      const shot = byId(id);
      if (!shot || shot.deleted_at) return;
      shot.deleted_at = new Date().toISOString();
      shot.updated_at = shot.deleted_at;
      touch(shot);
      persist();
    },

    distinctBeans() {
      const seen = new Map();
      for (const shot of shots) {
        if (shot.deleted_at || !shot.bean) continue;
        const key = shot.bean.toLowerCase();
        if (!seen.has(key)) seen.set(key, shot.bean);
      }
      return [...seen.values()].sort((left, right) => left.localeCompare(right));
    },

    dirtyShots() {
      return shots.filter((shot) => shot.dirty);
    },


    markClean(pushed) {
      for (const entry of pushed) {
        const id = typeof entry === 'string' ? entry : entry.id;
        const shot = byId(id);
        if (!shot) continue;
        // Mutated since the payload was captured: the server has not seen the
        // current state, so it must stay queued.
        if (typeof entry === 'object' && shot.rev !== entry.rev) continue;
        delete shot.dirty;
      }
      persist();
    },

    mergeRemote(rows) {
      const skipped = [];
      for (const row of rows) {
        if (!isShot(row)) continue;
        const existing = byId(row.id);
        // A dirty local shot has changes the server has not seen yet.
        // Overwriting it would discard them; the next push settles it.
        if (existing?.dirty) {
          skipped.push(row);
          continue;
        }
        const incoming = { ...row };
        delete incoming.dirty;
        delete incoming.rev;
        if (existing) {
          Object.assign(existing, incoming, { rev: existing.rev });
        } else {
          shots.push({ ...incoming, rev: 1 });
        }
      }
      return { persisted: persist(), skipped };
    },

    absorb(incoming) {
      for (const shot of incoming) {
        if (!isShot(shot) || byId(shot.id)) continue;
        shots.push({ ...shot, rev: (shot.rev ?? 1) + 1, dirty: true });
      }
      persist();
    },

    clear() {
      shots.length = 0;
      lastSync = null;
      write(SHOTS_KEY, '[]');
      write(LAST_SYNC_KEY, '');
    },

    stampUserId(userId) {
      for (const shot of shots) {
        if (!shot.user_id) {
          shot.user_id = userId;
          touch(shot);
        }
      }
      persist();
    },

    lastSyncAt() {
      return lastSync;
    },

    setLastSyncAt(iso) {
      lastSync = iso;
      write(LAST_SYNC_KEY, iso);
    },
  };
}

export function adoptAnonymousShots(storage, userId) {
  const owned = createStore(storage, userId);
  const anonymous = createStore(storage, ANONYMOUS_SCOPE);
  const carried = anonymous.allShots();
  if (carried.length > 0) {
    owned.absorb(carried.map((shot) => ({ ...shot, user_id: userId })));
    anonymous.clear();
  }
  return owned;
}
