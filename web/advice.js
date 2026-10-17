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

const FAST_BELOW_SECONDS = 25;
const SLOW_ABOVE_SECONDS = 32;

function isFast(timeSeconds) {
  return timeSeconds < FAST_BELOW_SECONDS;
}

function isSlow(timeSeconds) {
  return timeSeconds > SLOW_ABOVE_SECONDS;
}

export function adviceForSour({ yieldGrams, timeSeconds, ratio }) {
  let lead;
  let step;
  const tips = [];

  if (isSlow(timeSeconds)) {
    lead = 'Slow but sour usually means channeling or water that is too cool, '
      + 'not a grind that is too coarse.';
    step = 0;
    tips.push('Do not go finer. Check puck prep: even distribution, level tamp, no clumps.');
    tips.push('Try 1–2°C hotter, or add a short pre-infusion.');
  } else if (isFast(timeSeconds)) {
    lead = 'Go finer by 1–2 steps.';
    step = -1;
    tips.push('A fast shot gives the water too little contact time.');
    tips.push('If it is still sour at 25–30s, raise the yield slightly.');
  } else {
    lead = 'Time is fine, so go finer by 1 step or let the shot run longer.';
    step = -1;
    tips.push(`Try a yield about 10–15% higher (e.g. ${Math.round(yieldGrams * 1.12)}g out).`);
    tips.push('Or raise the temperature 1–2°C.');
  }

  if (ratio < 1.7) {
    tips.push(`Your ratio of 1:${ratio.toFixed(1)} is short. A longer ratio extracts more.`);
  }

  return { verdict: 'Under-extracted', lead, tips, step };
}

export function adviceForBitter({ yieldGrams, timeSeconds, ratio }) {
  let lead;
  let step;
  const tips = [];

  if (isFast(timeSeconds)) {
    lead = 'Fast but bitter points to a ratio or temperature issue, or channeling.';
    step = 0;
    tips.push(`Stop the shot earlier (try ${Math.round(yieldGrams * 0.88)}g out).`);
    tips.push('Try 1–2°C cooler and check puck prep.');
  } else if (isSlow(timeSeconds)) {
    lead = 'Go coarser by 1–2 steps.';
    step = 1;
    tips.push('A long shot pulls out the harsh compounds.');
    tips.push('Aim for 25–32s at about 1:2.');
  } else {
    lead = 'Time is fine, so go coarser by 1 step or stop the shot sooner.';
    step = 1;
    tips.push(`Try a yield about 10% lower (e.g. ${Math.round(yieldGrams * 0.9)}g out).`);
    tips.push('Or drop the temperature 1–2°C.');
  }

  if (ratio > 2.5) {
    tips.push(`Your ratio of 1:${ratio.toFixed(1)} is long. A shorter ratio often removes bitterness.`);
  }

  return { verdict: 'Over-extracted', lead, tips, step };
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
