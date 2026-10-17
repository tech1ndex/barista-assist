// Replace with your Supabase project values. The anon key is safe to commit:
// row-level security is what protects the data, not the secrecy of this key.
export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';

export function isConfigured() {
  return !SUPABASE_URL.includes('YOUR-PROJECT-REF')
    && !SUPABASE_ANON_KEY.includes('YOUR-ANON-KEY');
}
