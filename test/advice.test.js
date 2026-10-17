import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics } from '../web/advice.js';

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
