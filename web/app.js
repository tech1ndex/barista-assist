import { analyse, nextGrindSetting } from './advice.js';
import { createStore, browserStorage, adoptAnonymousShots, ANONYMOUS_SCOPE } from './store.js';
import { createClient, signIn, signOut, currentUser, onAuthChange, displayName } from './auth.js';
import { syncNow } from './sync.js';

const storage = browserStorage();
const element = (id) => document.getElementById(id);

// Rebound on sign-in and sign-out: each account gets its own scope, so two
// people sharing a browser cannot read or upload each other's shots.
let store = createStore(storage, ANONYMOUS_SCOPE);
let client = null;
let signedInUser = null;
let syncInFlight = false;

let selectedTaste = 'balanced';
let beanFilter = '';
let lastProblem = '';
let expandedShotId = null;

function readForm() {
  const grindValue = element('grind').value.trim();
  return {
    doseGrams: Number(element('dose').value),
    yieldGrams: Number(element('yield').value),
    timeSeconds: Number(element('time').value),
    grind: grindValue === '' ? null : Number(grindValue),
    bean: element('bean').value,
    taste: selectedTaste,
  };
}

function showFormError(message) {
  const error = element('formerror');
  error.textContent = message;
  error.hidden = message === '';
}

/**
 * The tips exactly as the user reads them, including the grind suggestion.
 * That line depends on the grinder-direction dropdown, which is not stored
 * anywhere — so it has to be captured here rather than recomputed later,
 * when the dropdown may say something different.
 */
function tipsFor(result, grind) {
  const finerDirection = Number(element('dir').value);
  const suggestion = nextGrindSetting(grind, result.step, finerDirection);
  return suggestion === null
    ? result.tips
    : [`Next grind setting to try: ${suggestion} (from ${grind}).`, ...result.tips];
}

function renderTips(list, tips) {
  list.replaceChildren(...tips.map((text) => {
    const item = document.createElement('li');
    item.textContent = text; // textContent, so no escaping is needed
    return item;
  }));
}

function renderAdvice(result, tips) {
  element('mR').textContent = `1:${result.ratio.toFixed(1)}`;
  element('mT').textContent = `${result.timeSeconds}s`;
  element('mF').textContent = `${result.flow.toFixed(1)} g/s`;
  element('pin').style.left = `${((result.position + 1) / 2) * 100}%`;
  element('vd').textContent = result.verdict;
  element('ld').textContent = result.lead;
  renderTips(element('tp'), tips);
  element('advice').hidden = false;
}

/**
 * Shots logged before advice was recorded still have useful numbers, so the
 * advice is regenerated for them. Marked as such, because once the thresholds
 * are tuned this will no longer be what the app said at the time.
 */
function recallAdvice(shot) {
  if (shot.advice) return { ...shot.advice, recomputed: false };
  try {
    const result = analyse({
      doseGrams: Number(shot.dose_g),
      yieldGrams: Number(shot.yield_g),
      timeSeconds: Number(shot.time_s),
      taste: shot.taste,
    });
    return { verdict: result.verdict, lead: result.lead, tips: result.tips, recomputed: true };
  } catch {
    return null;
  }
}

function describeShot(shot) {
  const when = new Date(shot.pulled_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const grind = shot.grind === null ? '' : `, grind ${shot.grind}`;
  const bean = shot.bean ? ` · ${shot.bean}` : '';
  return `${when}: ${shot.dose_g}g in, ${shot.yield_g}g out, ${shot.time_s}s${grind}${bean}`;
}

function matchesFilter(shot) {
  // Case-folded, because distinctBeans folds too: an exact comparison would
  // hide "red brick" from the "Red Brick" filter, losing it from its own
  // coffee's history with no sign it exists.
  if (beanFilter === '') return true;
  return (shot.bean ?? '').toLowerCase() === beanFilter.toLowerCase();
}

function pastAdviceFor(shot) {
  const panel = document.createElement('div');
  panel.className = 'past';

  const advice = recallAdvice(shot);
  if (advice === null) {
    panel.append(Object.assign(document.createElement('p'), {
      className: 'empty',
      textContent: 'No advice recorded for this shot.',
    }));
    return panel;
  }

  panel.append(
    Object.assign(document.createElement('p'), {
      className: 'past-verdict', textContent: advice.verdict,
    }),
    Object.assign(document.createElement('p'), {
      className: 'lead', textContent: advice.lead,
    }),
  );

  const list = document.createElement('ul');
  list.className = 'tips';
  renderTips(list, advice.tips);
  panel.append(list);

  if (advice.recomputed) {
    panel.append(Object.assign(document.createElement('p'), {
      className: 'past-note',
      textContent: 'Worked out from the numbers — this shot predates saved advice.',
    }));
  }

  return panel;
}

function renderHistory() {
  const shots = store.activeShots().filter(matchesFilter);
  const history = element('hist');

  if (shots.length === 0) {
    history.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'empty',
      textContent: 'No shots yet. Your first one will appear here.',
    }));
    return;
  }

  history.replaceChildren(...shots.flatMap((shot) => {
    const row = document.createElement('div');
    row.className = 'shot';

    const open = shot.id === expandedShotId;

    // A button, not a div with a click handler: it has to be reachable by
    // keyboard and announce its expanded state to a screen reader.
    const summary = document.createElement('button');
    summary.className = 'shot-summary';
    summary.type = 'button';
    summary.setAttribute('aria-expanded', String(open));
    summary.textContent = `${describeShot(shot)} `;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = shot.taste;
    summary.append(chip);
    summary.addEventListener('click', () => {
      expandedShotId = open ? null : shot.id;
      renderHistory();
    });

    const remove = document.createElement('button');
    remove.className = 'del';
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', 'Delete shot');
    remove.addEventListener('click', () => {
      store.deleteShot(shot.id);
      if (expandedShotId === shot.id) expandedShotId = null;
      renderAll();
      // A tombstone is a local change like any other and has to reach the
      // other devices, or the shot stays visible on them indefinitely.
      runSync();
    });

    row.append(summary, remove);
    return open ? [row, pastAdviceFor(shot)] : [row];
  }));
}

function renderBeanControls() {
  const beans = store.distinctBeans();

  element('beanlist').replaceChildren(...beans.map((bean) => {
    const option = document.createElement('option');
    option.value = bean;
    return option;
  }));

  const filter = element('beanfilter');
  filter.replaceChildren(
    Object.assign(document.createElement('option'), { value: '', textContent: 'All beans' }),
    ...beans.map((bean) => Object.assign(document.createElement('option'), {
      value: bean, textContent: bean,
    })),
  );
  filter.value = beans.includes(beanFilter) ? beanFilter : '';
  beanFilter = filter.value;
}

function renderSyncState(result) {
  const pending = result ? result.pending : store.dirtyShots().length;
  const state = element('syncstate');

  if (lastProblem !== '') {
    state.textContent = pending === 0 ? lastProblem : `${lastProblem} — ${pending} not synced`;
    return;
  }
  if (!signedInUser || pending === 0) {
    state.textContent = '';
    return;
  }
  state.textContent = pending === 1 ? '1 shot not synced' : `${pending} shots not synced`;
}

function renderAuth() {
  const button = element('auth');
  // With no client the app is local-only by design, so there is nothing to
  // sign into and the control stays hidden.
  button.hidden = client === null;
  if (client === null) return;

  button.textContent = signedInUser ? 'Sign out' : 'Sign in with GitHub';
  element('who').textContent = signedInUser
    ? `Signed in as ${displayName(signedInUser)} — shots sync across your devices.`
    : 'Not signed in — shots are saved on this device only.';
}

function renderAll() {
  renderBeanControls();
  renderHistory();
  renderAuth();
  renderSyncState();
}

async function runSync() {
  // Without this, a save and the online handler can start overlapping syncs
  // that push the same rows twice and race on the cursor.
  if (!client || !signedInUser || syncInFlight) return;
  syncInFlight = true;
  try {
    const result = await syncNow({
      client,
      store,
      userId: signedInUser.id,
      onProblem: (message) => { lastProblem = message; },
    });
    if (result.problems.length === 0) lastProblem = '';
    renderSyncState(result);
    renderAll();
  } catch {
    lastProblem = 'sync failed';
    renderSyncState();
  } finally {
    syncInFlight = false;
  }
}

function useScopeFor(user) {
  signedInUser = user;
  store = user
    ? adoptAnonymousShots(storage, user.id)
    : createStore(storage, ANONYMOUS_SCOPE);
  lastProblem = '';
  renderAll();
}

function saveShot() {
  const form = readForm();

  let result;
  try {
    result = analyse(form);
  } catch (error) {
    showFormError(error instanceof RangeError
      ? 'Enter a dose, yield and time greater than zero.'
      : 'Pick how the shot tasted.');
    return;
  }
  showFormError('');

  // Captured once and used for both the panel and the stored record, so
  // what you read now is byte-for-byte what you will read back tomorrow.
  const tips = tipsFor(result, form.grind);

  store.addShot({
    dose_g: form.doseGrams,
    yield_g: form.yieldGrams,
    time_s: form.timeSeconds,
    grind: form.grind,
    bean: form.bean,
    taste: form.taste,
    advice: { verdict: result.verdict, lead: result.lead, tips },
  });

  renderAdvice({ ...result, timeSeconds: form.timeSeconds }, tips);
  renderAll();
  element('advice').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Deliberately not awaited: the shot is already saved locally and the UI
  // must never wait on the network to acknowledge it.
  runSync();
}

for (const button of document.querySelectorAll('.taste button')) {
  button.addEventListener('click', () => {
    selectedTaste = button.dataset.taste;
    for (const other of document.querySelectorAll('.taste button')) {
      other.setAttribute('aria-pressed', String(other === button));
    }
  });
}

element('beanfilter').addEventListener('change', (event) => {
  beanFilter = event.target.value;
  renderHistory();
});

element('go').addEventListener('click', saveShot);

element('auth').addEventListener('click', async () => {
  try {
    if (signedInUser) {
      await signOut(client);
      useScopeFor(null);
    } else {
      await signIn(client);
    }
  } catch {
    lastProblem = 'sign-in failed — check your connection';
    renderSyncState();
  }
});

// Render immediately from local storage. Everything below is sync, which is
// allowed to be slow, to fail, or never to happen at all.
renderAll();

(async function connect() {
  client = await createClient();
  renderAll();
  if (!client) return;

  onAuthChange(client, (user) => {
    useScopeFor(user);
    runSync();
  });

  try {
    useScopeFor(await currentUser(client));
    runSync();
  } catch {
    // No session to restore; stay local-only.
  }

  window.addEventListener('online', runSync);
}());
