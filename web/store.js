const SHOTS_KEY = 'dialin-shots-v2';
const LAST_SYNC_KEY = 'dialin-last-sync-v2';

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

export function createStore(storage) {
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
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // Written through to `storage` when it accepts writes; otherwise this
  // in-memory copy carries the session. Safari private mode throws on setItem.
  const shots = readShots();
  let lastSync = readString(LAST_SYNC_KEY);

  function write(key, value) {
    try {
      storage.setItem(key, value);
    } catch {
      // Storage is full or unavailable. The in-memory copy still serves
      // this session, and losing history is better than losing the shot.
    }
  }

  function persist() {
    write(SHOTS_KEY, JSON.stringify(shots));
  }

  function byId(id) {
    return shots.find((shot) => shot.id === id);
  }

  return {
    allShots() {
      return shots.slice();
    },

    activeShots() {
      return shots
        .filter((shot) => !shot.deleted_at)
        .sort((left, right) => right.pulled_at.localeCompare(left.pulled_at));
    },

    addShot({ dose_g, yield_g, time_s, grind, bean, taste }) {
      const now = new Date().toISOString();
      const shot = {
        id: newId(),
        user_id: null,
        pulled_at: now,
        dose_g,
        yield_g,
        time_s,
        grind: grind ?? null,
        bean: cleanBean(bean),
        taste,
        deleted_at: null,
        updated_at: now,
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
      shot.dirty = true;
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

    markClean(ids) {
      const wanted = new Set(ids);
      for (const shot of shots) {
        if (wanted.has(shot.id)) delete shot.dirty;
      }
      persist();
    },

    mergeRemote(rows) {
      for (const row of rows) {
        const existing = byId(row.id);
        // A dirty local shot has changes the server has not seen yet.
        // Overwriting it would discard them; the next push settles it.
        if (existing?.dirty) continue;
        const incoming = { ...row };
        delete incoming.dirty;
        if (existing) {
          Object.assign(existing, incoming);
        } else {
          shots.push(incoming);
        }
      }
      persist();
    },

    stampUserId(userId) {
      for (const shot of shots) {
        if (!shot.user_id) {
          shot.user_id = userId;
          shot.dirty = true;
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
