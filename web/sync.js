const TABLE = 'shots';
const EPOCH = '1970-01-01T00:00:00Z';

function forServer(shot) {
  const { dirty, ...row } = shot;
  return row;
}

async function push(client, store) {
  const pending = store.dirtyShots();
  if (pending.length === 0) return 0;

  const { error } = await client.from(TABLE).upsert(pending.map(forServer));
  if (error) return 0;

  store.markClean(pending.map((shot) => shot.id));
  return pending.length;
}

async function pull(client, store) {
  const since = store.lastSyncAt() ?? EPOCH;

  const { data, error } = await client
    .from(TABLE)
    .select('*')
    .gt('updated_at', since)
    .order('updated_at', { ascending: true });

  if (error || !data || data.length === 0) return 0;

  store.mergeRemote(data);

  // The high-water mark must be a server-assigned updated_at, never the local
  // clock: a device running fast would otherwise store a future mark and
  // silently skip every row written before it caught up.
  const newest = data.reduce(
    (latest, row) => (row.updated_at > latest ? row.updated_at : latest),
    since,
  );
  store.setLastSyncAt(newest);

  return data.length;
}

export async function syncNow({ client, store, userId }) {
  store.stampUserId(userId);

  // Push first, so local work is safe before remote state overwrites anything.
  const pushed = await push(client, store);
  const pulled = await pull(client, store);

  return { pushed, pulled, pending: store.dirtyShots().length };
}
