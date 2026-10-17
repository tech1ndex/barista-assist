import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config.js';

const SUPABASE_MODULE = 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Loads supabase-js only when sync is actually possible.
 *
 * This import must stay dynamic. A static one is fetched while the module
 * graph is built — before any of this runs — so an unreachable CDN would stop
 * app.js instantiating at all: no listeners, no rendering, a dead page. The
 * whole point of the app is that it keeps working offline, so the one
 * dependency it has cannot be allowed to gate startup.
 */
export async function createClient() {
  if (!isConfigured()) return null;
  try {
    const { createClient: connect } = await import(SUPABASE_MODULE);
    return connect(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch {
    // Offline, CDN down, or blocked by a proxy. Local-only is the correct
    // outcome; the shot log must not care.
    return null;
  }
}

export async function signIn(client) {
  await client.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: window.location.origin },
  });
}

export async function signOut(client) {
  await client.auth.signOut();
}

export async function currentUser(client) {
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

export function onAuthChange(client, callback) {
  client.auth.onAuthStateChange((_event, session) => callback(session?.user ?? null));
}
