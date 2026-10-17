// Replace with your Supabase project values.
//
// Use the publishable key (sb_publishable_...) from Project Settings -> API.
// The legacy anon key (a JWT starting eyJ...) also works and is equivalent,
// but Supabase deprecates it at the end of 2026.
//
// This key is safe to commit. It ships to every browser that loads the app, so
// it was never secret; row-level security is what protects the data. Only the
// secret key (sb_secret_... / service_role) must stay out of this file.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// A value counts as supplied only if it is a non-blank string that is not the
// shipped placeholder. Checking for the placeholder alone is not enough: an
// empty string would pass, the app would build a client with no key, and
// supabase-js throws on construction — taking the whole page down rather than
// degrading to local-only.
export function isFilledIn(value) {
  return typeof value === 'string'
    && value.trim() !== ''
    && !value.includes('YOUR-');
}

export function isConfigured() {
  return isFilledIn(SUPABASE_URL) && isFilledIn(SUPABASE_ANON_KEY);
}
