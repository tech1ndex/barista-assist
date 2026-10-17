import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFilledIn } from '../web/config.js';

// isConfigured() itself reads whatever values the project is currently set to,
// so it cannot be asserted against directly without the test breaking the
// moment real credentials are pasted in. The predicate behind it can.

test('a real publishable key counts as filled in', () => {
  assert.equal(isFilledIn('sb_publishable_AbC123xyz'), true);
});

test('a legacy JWT anon key counts as filled in', () => {
  assert.equal(isFilledIn('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def'), true);
});

test('an empty value is not filled in', () => {
  // Regression: an empty string previously passed the placeholder check, so
  // the app built a Supabase client with no key and crashed on load.
  assert.equal(isFilledIn(''), false);
});

test('whitespace alone is not filled in', () => {
  assert.equal(isFilledIn('   '), false);
});

test('an untouched placeholder is not filled in', () => {
  assert.equal(isFilledIn('YOUR-ANON-KEY'), false);
  assert.equal(isFilledIn('https://YOUR-PROJECT-REF.supabase.co'), false);
});

test('a missing value is not filled in', () => {
  assert.equal(isFilledIn(undefined), false);
  assert.equal(isFilledIn(null), false);
});
