#!/bin/sh
set -eu

# nginx:alpine runs every executable script in /docker-entrypoint.d/ before
# starting nginx. This one writes credentials.js from the environment, so the
# image ships with no credentials baked in.
#
# What this does NOT do: hide the key from users. Whatever is written here is
# served to the browser and visible in devtools. The publishable key is
# designed for that, and row-level security is what protects the data. This
# keeps the key out of git and out of the image.

target=/usr/share/nginx/html/credentials.js

url="${SUPABASE_URL:-}"
key="${SUPABASE_ANON_KEY:-}"

if [ -z "$url" ] && [ -z "$key" ]; then
  echo "$0: SUPABASE_URL and SUPABASE_ANON_KEY unset; leaving credentials.js empty (local-only mode)"
  exit 0
fi

# Half-configured is always a mistake, and it fails confusingly at runtime:
# isConfigured() returns false and the app silently runs local-only, looking
# like the credentials were ignored. Fail loudly at startup instead.
if [ -z "$url" ] || [ -z "$key" ]; then
  echo "$0: set both SUPABASE_URL and SUPABASE_ANON_KEY, or neither" >&2
  exit 1
fi

# These are interpolated into single-quoted JS string literals. Refuse anything
# that could terminate the literal rather than attempting to escape it.
case "$url$key" in
  *\'*|*\\*)
    echo "$0: SUPABASE_URL and SUPABASE_ANON_KEY must not contain quotes or backslashes" >&2
    exit 1
    ;;
esac

cat > "$target" <<EOF
// Generated at container start by 40-write-config.sh. Do not edit.
export const SUPABASE_URL = '$url';
export const SUPABASE_ANON_KEY = '$key';
EOF

echo "$0: wrote credentials.js for $url"
