import { createClient as createSupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config.js';

export function createClient() {
  if (!isConfigured()) return null;
  return createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
