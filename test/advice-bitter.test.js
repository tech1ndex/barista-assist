import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adviceForBitter } from '../web/advice.js';

function bitter(timeSeconds, { doseGrams = 18, yieldGrams = 36 } = {}) {
  return adviceForBitter({
    doseGrams,
    yieldGrams,
    timeSeconds,
    ratio: yieldGrams / doseGrams,
  });
}

test('bitter and slow means grind coarser', () => {
  const result = bitter(35);
  assert.equal(result.verdict, 'Over-extracted');
  assert.equal(result.step, 1);
  assert.match(result.lead, /coarser/i);
});

test('bitter and fast is a ratio or temperature problem, not a grind one', () => {
  const result = bitter(22);
  assert.equal(result.step, 0);
  assert.doesNotMatch(result.lead, /coarser/i);
  assert.match(result.tips.join(' '), /Stop the shot earlier/);
});

test('bitter at a normal time suggests coarser or a smaller yield', () => {
  const result = bitter(28);
  assert.equal(result.step, 1);
  assert.match(result.tips.join(' '), /10% lower/);
});

test('a long ratio adds a ratio tip', () => {
  const result = bitter(28, { doseGrams: 18, yieldGrams: 54 }); // 1:3.0
  assert.match(result.tips.join(' '), /ratio of 1:3\.0 is long/);
});

test('25 and 32 seconds are inside the normal window', () => {
  assert.match(bitter(25).lead, /Time is fine/);
  assert.match(bitter(32).lead, /Time is fine/);
});
