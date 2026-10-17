import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyse } from '../web/advice.js';

test('analyse returns metrics alongside the advice', () => {
  const result = analyse({ doseGrams: 18, yieldGrams: 36, timeSeconds: 28, taste: 'balanced' });
  assert.equal(result.ratio, 2);
  assert.equal(result.verdict, 'Balanced: keep this recipe');
  assert.equal(result.step, 0);
});

test('analyse dispatches on taste', () => {
  const base = { doseGrams: 18, yieldGrams: 36, timeSeconds: 22 };
  assert.equal(analyse({ ...base, taste: 'sour' }).verdict, 'Under-extracted');
  assert.equal(analyse({ ...base, taste: 'bitter' }).verdict, 'Over-extracted');
  assert.equal(analyse({ ...base, taste: 'watery' }).verdict, 'Weak or thin');
});

test('a sour shot never reads as over-extracted on the gauge', () => {
  const result = analyse({ doseGrams: 18, yieldGrams: 36, timeSeconds: 60, taste: 'sour' });
  assert.ok(result.position <= -0.2);
});

test('a bitter shot never reads as under-extracted on the gauge', () => {
  const result = analyse({ doseGrams: 18, yieldGrams: 36, timeSeconds: 10, taste: 'bitter' });
  assert.ok(result.position >= 0.2);
});

test('analyse rejects a zero time', () => {
  assert.throws(
    () => analyse({ doseGrams: 18, yieldGrams: 36, timeSeconds: 0, taste: 'sour' }),
    RangeError,
  );
});

test('analyse rejects an unknown taste', () => {
  assert.throws(
    () => analyse({ doseGrams: 18, yieldGrams: 36, timeSeconds: 28, taste: 'smoky' }),
    TypeError,
  );
});
