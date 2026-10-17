const TABLE = 'shots';
const EPOCH = '1970-01-01T00:00:00Z';

// now() in Postgres is transaction-start, not commit order, so a slow
// transaction can commit with an updated_at earlier than a mark we have
// already stored. Rewinding the cursor by this much re-delivers those rows;
// mergeRemote is idempotent, so the only cost is a slightly larger pull.
const COMMIT_SKEW_ALLOWANCE_MS = 30_000;

function forServer(shot) {
  const { dirty, rev, ...row } = shot;
  return row;
}

function rewind(iso, milliseconds) {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed - milliseconds).toISOString();
}

/**
 * Pushes one row at a time. A batch upsert fails whole: a single row the
 * server rejects — a value outside a column's precision, say — would block
 * every other shot from ever syncing, and the error would be invisible.
 */
async function push(client, store, report) {
  const pending = store.dirtyShots();
  if (pending.length === 0) return 0;

  // Capture id and rev now. markClean compares against these so a shot the
  // user changes while the request is in flight stays queued.
  const sent = pending.map((shot) => ({ id: shot.id, rev: shot.rev }));
  const payloads = pending.map(forServer);

  const accepted = [];
  for (let index = 0; index < payloads.length; index += 1) {
    try {
      const { error } = await client.from(TABLE).upsert(payloads[index]);
      if (error) {
        report(`could not sync shot ${payloads[index].id}`, error);
        continue;
      }
      accepted.push(sent[index]);
    } catch (thrown) {
      report(`could not sync shot ${payloads[index].id}`, thrown);
    }
  }

  store.markClean(accepted);
  return accepted.length;
}

async function pull(client, store, report) {
  const since = store.lastSyncAt() ?? EPOCH;

  let data;
  try {
    const response = await client
      .from(TABLE)
      .select('*')
      .gt('updated_at', since)
      .order('updated_at', { ascending: true });
    if (response.error) {
      report('could not fetch remote shots', response.error);
      return 0;
    }
    data = response.data;
  } catch (thrown) {
    report('could not fetch remote shots', thrown);
    return 0;
  }

  if (!data || data.length === 0) return 0;

  const { persisted, skipped } = store.mergeRemote(data);

  // If the merge could not be written, advancing the cursor would lose these
  // rows for good: the next pull asks only for newer ones.
  if (!persisted) {
    report('merged shots could not be stored; holding the sync cursor', null);
    return data.length;
  }

  // The high-water mark must come from server-assigned updated_at values,
  // never the local clock: a fast clock would store a future mark and skip
  // every row written before it caught up.
  let newest = data.reduce(
    (latest, row) => (row.updated_at > latest ? row.updated_at : latest),
    since,
  );

  // Rows held back because the local copy had unpushed changes must stay
  // reachable. Without this the cursor moves past them and they are never
  // offered again, stranding the remote version permanently.
  for (const row of skipped) {
    const justBefore = rewind(row.updated_at, 1);
    if (justBefore < newest) newest = justBefore;
  }

  store.setLastSyncAt(rewind(newest, COMMIT_SKEW_ALLOWANCE_MS));

  return data.length;
}

export async function syncNow({ client, store, userId, onProblem }) {
  const problems = [];
  const report = (message, cause) => {
    problems.push(message);
    onProblem?.(message, cause);
  };

  try {
    store.stampUserId(userId);

    // Push first, so local work is durable server-side before remote state
    // merges over it.
    const pushed = await push(client, store, report);
    const pulled = await pull(client, store, report);

    return { pushed, pulled, pending: store.dirtyShots().length, problems };
  } catch (thrown) {
    report('sync failed', thrown);
    return { pushed: 0, pulled: 0, pending: store.dirtyShots().length, problems };
  }
}
