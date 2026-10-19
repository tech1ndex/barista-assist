import { test } from 'node:test';
import assert from 'node:assert/strict';

// Node cannot resolve https: import specifiers at all. That makes it a precise
// detector for the bug this guards: if the supabase-js import is ever made
// static again, importing auth.js fails here with ERR_UNSUPPORTED_ESM_URL_SCHEME
// — which is the same class of failure a browser hits offline, where a static
// CDN import stops app.js instantiating and leaves a dead page.
test('auth.js loads without reaching the network', async () => {
  const auth = await import('../web/auth.js');
  assert.equal(typeof auth.createClient, 'function');
  assert.equal(typeof auth.signIn, 'function');
  assert.equal(typeof auth.onAuthChange, 'function');
});

test('createClient returns null when no project is configured', async () => {
  const { createClient } = await import('../web/auth.js');
  // credentials.js ships empty, so this must not attempt the dynamic import.
  assert.equal(await createClient(), null);
});

test('displayName prefers the GitHub username and falls back sensibly', async () => {
  const { displayName } = await import('../web/auth.js');
  assert.equal(displayName({ user_metadata: { user_name: 'octocat', name: 'Mona' }, email: 'a@b.c' }), 'octocat');
  assert.equal(displayName({ user_metadata: { name: 'Mona' }, email: 'a@b.c' }), 'Mona');
  assert.equal(displayName({ email: 'a@b.c' }), 'a@b.c');
  assert.equal(displayName({}), 'unknown user');
});

test('createClient never throws, even when the module cannot be fetched', async () => {
  const { createClient } = await import('../web/auth.js');
  await assert.doesNotReject(() => createClient());
});
