import { analyse, nextGrindSetting } from './advice.js';
import { createStore } from './store.js';

const store = createStore(window.localStorage);
const element = (id) => document.getElementById(id);

let selectedTaste = 'balanced';
let beanFilter = '';

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

function renderAdvice(result, grind) {
  element('mR').textContent = `1:${result.ratio.toFixed(1)}`;
  element('mT').textContent = `${element('time').value}s`;
  element('mF').textContent = `${result.flow.toFixed(1)} g/s`;
  element('pin').style.left = `${((result.position + 1) / 2) * 100}%`;
  element('vd').textContent = result.verdict;
  element('ld').textContent = result.lead;

  const finerDirection = Number(element('dir').value);
  const suggestion = nextGrindSetting(grind, result.step, finerDirection);
  const tips = suggestion === null
    ? result.tips
    : [`Next grind setting to try: ${suggestion} (from ${grind}).`, ...result.tips];

  const list = element('tp');
  list.replaceChildren(...tips.map((text) => {
    const item = document.createElement('li');
    item.textContent = text; // textContent, so no escaping is needed
    return item;
  }));

  element('advice').hidden = false;
}

function describeShot(shot) {
  const when = new Date(shot.pulled_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const grind = shot.grind === null ? '' : `, grind ${shot.grind}`;
  const bean = shot.bean ? ` · ${shot.bean}` : '';
  return `${when}: ${shot.dose_g}g in, ${shot.yield_g}g out, ${shot.time_s}s${grind}${bean}`;
}

function renderHistory() {
  const shots = store.activeShots()
    .filter((shot) => beanFilter === '' || shot.bean === beanFilter);
  const history = element('hist');

  if (shots.length === 0) {
    history.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'empty',
      textContent: 'No shots yet. Your first one will appear here.',
    }));
    return;
  }

  history.replaceChildren(...shots.map((shot) => {
    const row = document.createElement('div');
    row.className = 'shot';

    const summary = document.createElement('span');
    summary.textContent = `${describeShot(shot)} `;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = shot.taste;
    summary.append(chip);

    const remove = document.createElement('button');
    remove.className = 'del';
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', 'Delete shot');
    remove.addEventListener('click', () => {
      store.deleteShot(shot.id);
      renderAll();
    });

    row.append(summary, remove);
    return row;
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

function renderAll() {
  renderBeanControls();
  renderHistory();
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

  store.addShot({
    dose_g: form.doseGrams,
    yield_g: form.yieldGrams,
    time_s: form.timeSeconds,
    grind: form.grind,
    bean: form.bean,
    taste: form.taste,
  });

  renderAdvice(result, form.grind);
  renderAll();
  element('advice').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

renderAll();
