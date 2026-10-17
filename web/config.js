// Gating logic for the Supabase credentials. The values themselves live in
// credentials.js, which the container entrypoint rewrites from the
// environment; keeping the logic here means the generated file stays two
// lines and cannot drift from this.
//
// Use the publishable key (sb_publishable_...) from Project Settings -> API.
// The legacy anon key (a JWT starting eyJ...) is equivalent but Supabase
// deprecates it at the end of 2026.
//
// Whatever key is used is served to the browser and readable in devtools. That
// is inherent to a static client calling Supabase directly; row-level security
// is what protects the data. Only the secret key (sb_secret_... /
// service_role) must never appear here, because it bypasses RLS.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './credentials.js';

export { SUPABASE_URL, SUPABASE_ANON_KEY };

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
