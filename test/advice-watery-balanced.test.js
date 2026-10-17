import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adviceForWatery, adviceForBalanced } from '../web/advice.js';

function shot(doseGrams, yieldGrams, timeSeconds) {
  return { doseGrams, yieldGrams, timeSeconds, ratio: yieldGrams / doseGrams };
}

test('watery with a long ratio says cut the yield', () => {
  const result = adviceForWatery(shot(18, 50, 28)); // 1:2.8
  assert.equal(result.verdict, 'Weak or thin');
  assert.equal(result.step, 0);
  assert.match(result.lead, /Cut the yield/);
  assert.match(result.tips.join(' '), /36g out for a 1:2 ratio/);
});

test('watery with a normal ratio says go finer', () => {
  const result = adviceForWatery(shot(18, 36, 28)); // 1:2.0
  assert.equal(result.step, -1);
  assert.match(result.lead, /finer/i);
});

test('watery always warns about stale coffee', () => {
  assert.match(adviceForWatery(shot(18, 36, 28)).tips.join(' '), /stale/i);
  assert.match(adviceForWatery(shot(18, 50, 28)).tips.join(' '), /stale/i);
});

test('balanced keeps the recipe and suggests no grind change', () => {
  const result = adviceForBalanced(shot(18, 36, 28));
  assert.match(result.verdict, /Balanced/);
  assert.equal(result.step, 0);
  assert.match(result.tips.join(' '), /Change nothing else/);
});

test('balanced outside the window keeps the recipe but warns about drift', () => {
  const result = adviceForBalanced(shot(18, 36, 40));
  assert.equal(result.step, 0);
  assert.match(result.tips.join(' '), /outside the usual 25–32s window/);
  assert.match(result.tips.join(' '), /40s/);
});

test('balanced inside the window does not warn', () => {
  const result = adviceForBalanced(shot(18, 36, 28));
  assert.doesNotMatch(result.tips.join(' '), /outside the usual/);
});
