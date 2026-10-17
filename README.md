# Barista Assist

Log espresso shots, record how each tasted, get the next adjustment to try.
Shots are stored locally and sync across devices when signed in.

The app is local-first: `localStorage` is what the interface reads and writes,
and Supabase is a replica synced in the background. Logging a shot never waits
on the network, and never fails because of it.

## Running locally

    python3 -m http.server 8000 --directory web

The app works with no Supabase project configured: shots are saved in the
browser only, and no sign-in control appears.

## Tests

    npm test

No dependencies. Uses Node's built-in test runner. The dial-in rules in
`web/advice.js` are the thing worth protecting — their tests are the
specification of the advice, so change them deliberately.

## Enabling sync

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Create a GitHub OAuth app with callback
   `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Enable the GitHub provider in Supabase and paste the client id and secret.
5. Add the app's public origin to Authentication → URL Configuration.
6. Put the project URL and anon key in `web/config.js`.

The anon key is safe to commit. Row-level security is what protects the data:
every query is scoped by Postgres to the signed-in user, and the key only
identifies the project.

Until step 6 is done, `isConfigured()` returns false, no client is created, and
the app stays local-only. That is the same code path as being offline, so it
gets exercised constantly rather than rotting.

## Deploying

    docker build -t barista-assist .

Manifests to copy into the infrastructure repo are in `docs/deploy/k8s.yaml`.

## Manual smoke checklist

Not covered by unit tests, because mocking OAuth would test the mock rather
than the auth. Run these once after enabling sync.

- [ ] Sign in with GitHub; the control changes to "Sign out".
- [ ] Log a shot; it appears in history.
- [ ] Open the app on a second device, sign in, and confirm the shot appears.
- [ ] Delete the shot on one device; confirm it disappears on the other and
      does not come back.
- [ ] Go offline, log a shot, confirm "1 shot not synced", go back online and
      confirm the message clears.
- [ ] Sign out; confirm shots logged while signed out stay local, then sign in
      and confirm they upload without duplicating.
- [ ] Type a bean name, save, and confirm it is offered as a suggestion next
      time; confirm the history filter narrows to it.

## Layout

    web/        the app: static files, no build step
      advice.js   pure dial-in rules, no DOM, no storage
      store.js    local persistence, tombstones, outbox
      sync.js     push/pull against Supabase
      auth.js     GitHub sign-in
      app.js      DOM wiring
    supabase/   schema.sql
    test/       unit tests, never shipped in the image
    docs/       deployment manifests
