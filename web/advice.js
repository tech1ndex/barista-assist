const REFERENCE_TIME_SECONDS = 28;

const TASTE_BASE_POSITION = {
  sour: -0.55,
  balanced: 0,
  bitter: 0.55,
  watery: -0.3,
};

function clamp(value, lowest, highest) {
  return Math.max(lowest, Math.min(highest, value));
}

export function extractionPosition(taste, timeSeconds) {
  const base = TASTE_BASE_POSITION[taste];
  const timeNudge = clamp((timeSeconds - REFERENCE_TIME_SECONDS) / 40, -0.3, 0.3);
  return clamp(base + timeNudge, -0.95, 0.95);
}

/**
 * step: -1 finer, 1 coarser, 0 no change.
 * finerDirection: the change in dial number that makes the grind finer.
 * Going finer therefore adds finerDirection; going coarser subtracts it.
 */
export function nextGrindSetting(currentGrind, step, finerDirection) {
  if (step === 0 || currentGrind === null || currentGrind === undefined) {
    return null;
  }
  return currentGrind - step * finerDirection;
}

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
