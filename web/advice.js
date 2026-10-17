function requirePositiveNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a number greater than zero`);
  }
}

export function computeMetrics(doseGrams, yieldGrams, timeSeconds) {
  requirePositiveNumber(doseGrams, 'dose');
  requirePositiveNumber(yieldGrams, 'yield');
  requirePositiveNumber(timeSeconds, 'time');
  return {
    ratio: yieldGrams / doseGrams,
    flow: yieldGrams / timeSeconds,
  };
}
