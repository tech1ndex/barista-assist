// Values only — no logic. In a container this file is overwritten at startup
// by /docker-entrypoint.d/40-write-config.sh from the SUPABASE_URL and
// SUPABASE_ANON_KEY environment variables, so neither the repository nor the
// image carries credentials.
//
// Committed empty on purpose. For local development without Docker, fill these
// in and do not commit the change:
//
//     git update-index --skip-worktree web/credentials.js
//
// Leaving them empty is a valid state: the app runs local-only, storing shots
// in the browser with no sync and no sign-in control.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
