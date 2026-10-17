import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adviceForSour } from '../web/advice.js';

function sour(timeSeconds, { doseGrams = 18, yieldGrams = 36 } = {}) {
  return adviceForSour({
    doseGrams,
    yieldGrams,
    timeSeconds,
    ratio: yieldGrams / doseGrams,
  });
}

test('sour and fast means grind finer', () => {
  const result = sour(22);
  assert.equal(result.verdict, 'Under-extracted');
  assert.equal(result.step, -1);
  assert.match(result.lead, /finer/i);
});

test('sour and slow must never say go finer', () => {
  const result = sour(35);
  assert.equal(result.step, 0);
  assert.doesNotMatch(result.lead, /go finer/i);
  assert.match(result.tips.join(' '), /puck prep/i);
  assert.match(result.lead, /channel/i);
});

test('sour at a normal time suggests finer or a longer yield', () => {
  const result = sour(28);
  assert.equal(result.step, -1);
  assert.match(result.tips.join(' '), /yield/i);
});

test('a short ratio adds a ratio tip', () => {
  const result = sour(28, { doseGrams: 18, yieldGrams: 27 }); // 1:1.5
  assert.match(result.tips.join(' '), /ratio of 1:1\.5 is short/);
});

test('a normal ratio adds no ratio tip', () => {
  const result = sour(28);
  assert.doesNotMatch(result.tips.join(' '), /is short/);
});

test('25 and 32 seconds are inside the normal window', () => {
  assert.equal(sour(25).step, -1);
  assert.match(sour(25).lead, /Time is fine/);
  assert.match(sour(32).lead, /Time is fine/);
});
