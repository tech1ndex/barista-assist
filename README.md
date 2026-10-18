<pre>   ( (&#10;    ) )      ____             _     _             _            _     _   &#10; ........   | __ )  __ _ _ __(_)___| |_ __ _     / \   ___ ___(_)___| |_ &#10; |      |]  |  _ \ / _` | '__| / __| __/ _` |   / _ \ / __/ __| / __| __|&#10; \      /   | |_) | (_| | |  | \__ \ || (_| |  / ___ \\__ \__ \ \__ \ |_ &#10;  `----'    |____/ \__,_|_|  |_|___/\__\__,_| /_/   \_\___/___/_|___/\__| </pre>

Try it out: https://barista-assist.app 🤎

Log espresso shots, record how each tasted, get the next adjustment to try.
Shots are stored locally and sync across devices when signed in.

The app is local-first: `localStorage` is what the interface reads and writes,
and Supabase is a replica synced in the background. Logging a shot never waits
on the network, and never fails because of it.

## Running locally

    python3 -m http.server 8000 --directory web

The app works with no Supabase project configured: shots are saved in the
browser only, and no sign-in control appears.

Alternatively, you can skip to the [Deploying](#Deploying) section and just build and run locally with Docker.

## Tests

    npm test

No dependencies. Uses Node's built-in test runner. The advice rules in
`web/advice.js` are the thing worth protecting — their tests are the
specification of the advice, so change them deliberately.

## Enabling sync

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Create a GitHub OAuth app with callback
   `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Enable the GitHub provider in Supabase and paste the client id and secret.
5. Add the app's public origin to Authentication → URL Configuration.
6. Supply the project URL and publishable key — see Credentials below.

Use the publishable key (`sb_publishable_...`) from Project Settings → API.
The legacy anon key (a JWT starting `eyJ...`) is equivalent but Supabase
deprecates it at the end of 2026. Never use the secret key: it bypasses
row-level security.

Until step 6 is done, `isConfigured()` returns false, no client is created, and
the app stays local-only. That is the same code path as being offline, so it
gets exercised constantly rather than rotting.

## Credentials

Neither the repository nor the image carries credentials. `web/credentials.js`
is committed empty and holds values only.

**In a container**, the entrypoint writes it from the environment at startup:

    docker run --rm -d --name barista-assist -p 8080:80 \
      -e SUPABASE_URL='https://<project-ref>.supabase.co' \
      -e SUPABASE_ANON_KEY='sb_publishable_...' \
      barista-assist

Set both or neither. Setting only one exits 1 at startup rather than silently
falling back to local-only, which looks like the credentials were ignored.

**Locally without Docker**, simply fill in `web/credentials.js` and build.

## Deploying

    docker build -t barista-assist .

Supply `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the container from whatever
your platform uses for configuration — a Kubernetes Secret or ConfigMap fed
into the Deployment's `env`, for instance.
