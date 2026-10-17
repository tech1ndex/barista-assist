import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics, extractionPosition, nextGrindSetting } from '../web/advice.js';

test('computeMetrics returns the brew ratio and flow rate', () => {
  const metrics = computeMetrics(18, 36, 28);
  assert.equal(metrics.ratio, 2);
  assert.ok(Math.abs(metrics.flow - 36 / 28) < 1e-9);
});

test('computeMetrics rejects a zero time rather than dividing by zero', () => {
  assert.throws(() => computeMetrics(18, 36, 0), RangeError);
});

test('computeMetrics rejects non-numeric input', () => {
  assert.throws(() => computeMetrics(18, 36, Number.NaN), RangeError);
  assert.throws(() => computeMetrics('18', 36, 28), RangeError);
});

test('extractionPosition centres a balanced shot at the reference time', () => {
  assert.equal(extractionPosition('balanced', 28), 0);
});

test('extractionPosition puts sour below zero and bitter above', () => {
  assert.ok(extractionPosition('sour', 28) < 0);
  assert.ok(extractionPosition('bitter', 28) > 0);
});

test('extractionPosition shifts with time away from the reference', () => {
  assert.ok(extractionPosition('balanced', 40) > extractionPosition('balanced', 20));
});

test('extractionPosition clamps the time nudge at plus or minus 0.3', () => {
  // 28 + 0.3 * 40 = 40s reaches the cap; beyond that nothing moves.
  assert.equal(extractionPosition('balanced', 400), extractionPosition('balanced', 40));
});

test('extractionPosition never leaves the gauge', () => {
  assert.ok(extractionPosition('bitter', 400) <= 0.95);
  assert.ok(extractionPosition('sour', 1) >= -0.95);
});

test('going finer moves toward the finer end of the dial', () => {
  // Grinder where finer is a lower number.
  assert.equal(nextGrindSetting(12, -1, -1), 11);
  // Grinder where finer is a higher number.
  assert.equal(nextGrindSetting(12, -1, 1), 13);
});

test('going coarser moves away from the finer end of the dial', () => {
  assert.equal(nextGrindSetting(12, 1, -1), 13);
  assert.equal(nextGrindSetting(12, 1, 1), 11);
});

test('no suggestion when the advice does not call for a grind change', () => {
  assert.equal(nextGrindSetting(12, 0, -1), null);
});

test('no suggestion when the grinder setting was left blank', () => {
  assert.equal(nextGrindSetting(null, -1, -1), null);
});

test('fractional grind settings are preserved', () => {
  assert.equal(nextGrindSetting(12.5, -1, -1), 11.5);
});
