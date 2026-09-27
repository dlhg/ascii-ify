import scenes from 'virtual:plugin-scenes';
import { PluginConnection } from './connection.js';
import { INPUTS, cleanSetup, defaultRoutes } from './mappings.js';
import { Reactivity } from '../../examples/audio-reactivity.js';
import { listTargets, targetInfo, targetHint, destination, destinations, baseTargets, numericValue, routingEngine } from './targets.js';
import { profileFor, sceneKind } from '../../examples/audio-profiles.js';
import { PARAM_RANGES } from '../../src/data/defaults.js';

const $ = selector => document.querySelector(selector);
const frame = $('#scene-frame'), picker = $('#scene'), status = $('#status');
const intensity = $('#intensity'), enabled = $('#react-enabled'), routes = $('#routes');
const sceneIds = scenes.map(s => s.id);
const storageKey = 'ascii-plugin-mappings-v1';
let setup = { version: 1, scene: 'galaxy', patches: {} }, session = null, saveTimer;
try { const saved = localStorage.getItem(storageKey); if (saved) setup = cleanSetup(JSON.parse(saved), sceneIds); } catch { /* Use defaults for an old/invalid save. */ }
const messages = {
  live: 'Connected · audio arriving', silent: 'Connected · waiting for sound',
  waiting: 'Connected · press play in Ableton', bypass: 'Device bypassed · enable it in Ableton',
  disconnected: 'Device disconnected · click Open Visuals in Ableton to reconnect',
};
const connection = new PluginConnection({ onChange(state) {
  status.textContent = messages[state]; status.dataset.state = state;
} });
const audio = { value: id => Math.min(1, Math.sqrt(connection.levels[id] || 0)) };
const groups = { ambient: 'Atmosphere & nature', flow: 'Flow & motion', geometry: 'Geometry & dashboards', impact: 'Light & energy', gentle: 'Games & interactive', custom: 'Audio study' };
for (const [kind, name] of Object.entries(groups)) {
  const group = document.createElement('optgroup'); group.label = name;
  for (const scene of scenes.filter(s => sceneKind(s.id) === kind)) group.append(new Option(scene.name, scene.id));
  if (group.children.length) picker.append(group);
}
$('#scene-count').textContent = `${scenes.length} library scenes`;

function note(text) { $('#mapping-note').textContent = text; }
function getRest(target) {
  const info = targetInfo(target);
  if (info.kind === 'scene') return session.app.scene.values[info.key];
  const values = destinations(session.app.ascii, target).map(({ owner, key }) => owner.getAutomation(key)?.base ?? numericValue(session.app.ascii, owner, key));
  return values.every(value => value === values[0]) ? values[0] : undefined;
}
function setRest(target, value) {
  const info = targetInfo(target);
  if (info.kind === 'scene') session.app.scene.setBase(info.key, value);
  else for (const { owner, key } of destinations(session.app.ascii, target)) owner.set(key, value);
}
function snapshot() {
  if (!session) return;
  const patch = session.rx.toJSON();
  patch.intensity = Number(intensity.value);
  patch.enabled = enabled.checked;
  patch.bases = Object.fromEntries([...new Set(patch.routes.flatMap(r => baseTargets(session.app.ascii, r.target)))].map(target => [target, getRest(target)]));
  setup.patches[session.id] = patch;
}
function save() {
  snapshot();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(setup)); }
    catch { note('Browser storage is unavailable. Export mappings to keep your changes.'); }
  }, 150);
}
function selectScene(id) {
  if (!sceneIds.includes(id)) return;
  snapshot();
  session?.unsubscribe();
  session = null;
  setup.scene = id; picker.value = id;
  $('#mapping-title').textContent = scenes.find(s => s.id === id).name;
  routes.replaceChildren();
  note('Loading scene…');
  $('#mapping-fields').disabled = true;
  frame.src = new URL(`../../examples/${id}.html?plugin`, location.href).href;
}

window.asciiIfyHost = {
  version: 1, sourceIds: INPUTS.map(s => s.id), audio,
  get current() { return session; },
  attach(app, child) {
    if (child !== frame.contentWindow || !child.location.pathname.endsWith(`/${setup.scene}.html`)) return;
    const engine = routingEngine(app.ascii);
    const rx = new Reactivity({ ascii: engine, scene: app.scene, audio });
    session = { id: setup.scene, app, rx, engine, unsubscribe: () => {} };
    const patch = setup.patches[setup.scene];
    intensity.value = patch?.intensity ?? 1;
    enabled.checked = patch?.enabled ?? true;
    if (patch) for (const [target, value] of Object.entries(patch.bases)) setRest(target, value);
    rx.load(patch?.routes ?? defaultRoutes(profileFor(setup.scene, app.ascii)), {
      intensity: enabled.checked ? Number(intensity.value) : 0,
    });
    session.unsubscribe = rx.onChange((_, kind) => { if (kind === 'structure') renderRoutes(); save(); });
    $('#mapping-fields').disabled = false;
    renderRoutes(); save();
    note('Changes are kept for this connection. Export mappings to reuse them in another session.');
  },
  onKeydown(event) {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return false;
    if (event.key.toLowerCase() === 'h') { hideControls(); event.preventDefault(); return true; }
    return false;
  },
};

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}
function select(items, selected, label) {
  const el = element('select'); el.setAttribute('aria-label', label);
  items.forEach(({ id, name }) => el.append(new Option(name, id)));
  el.value = selected;
  return el;
}
function field(label, input) {
  const el = element('label', 'field'); el.append(element('span', '', label), input); return el;
}
function slider(label, value, min, max, step, change, format = n => n.toFixed(2)) {
  const input = element('input'); input.type = 'range';
  Object.assign(input, { min, max, step, value }); input.setAttribute('aria-label', label);
  const output = element('output', '', format(value));
  input.oninput = () => { const n = Number(input.value); output.textContent = format(n); change(n); };
  const row = field(label, input); row.append(output); return row;
}
function renderRoutes() {
  routes.replaceChildren();
  if (!session) return;
  const { rx, app } = session;
  $('#mapping-total').textContent = `${rx.routes.length} mappings`;
  if (!rx.routes.length) routes.append(element('p', 'empty', 'No audio mappings. Add one to choose what sound controls.'));
  for (const route of rx.routes) {
    const card = element('article', `route${route.enabled ? '' : ' off'}`); card.dataset.id = route.id;
    const top = element('div', 'route-top');
    const toggle = element('input'); toggle.type = 'checkbox'; toggle.checked = route.enabled;
    toggle.setAttribute('aria-label', 'Enable mapping');
    toggle.onchange = () => rx.updateRoute(route.id, { enabled: toggle.checked });
    const source = select(INPUTS, route.source, 'Input signal');
    const target = select(listTargets(app.ascii, app.scene).map(id => ({ id, name: `${targetInfo(id).group} · ${targetInfo(id).label}` })), route.target, 'Visual parameter');
    function changePair() {
      if (rx.routes.some(r => r.id !== route.id && r.source === source.value && r.target === target.value)) {
        source.value = route.source; target.value = route.target;
        note('That signal already controls this parameter. Edit its existing mapping.'); return;
      }
      rx.updateRoute(route.id, { source: source.value, target: target.value });
    }
    source.onchange = target.onchange = changePair;
    const remove = element('button', 'remove', '×'); remove.setAttribute('aria-label', 'Remove mapping');
    remove.onclick = () => rx.removeRoute(route.id);
    top.append(toggle, source, element('span', '', '→'), target, remove); card.append(top);
    card.append(slider('Amount', route.depth, -1, 1, 0.01, n => rx.updateRoute(route.id, { depth: n }), n => `${n > 0 ? '+' : ''}${Math.round(n * 100)}%`));
    card.append(slider('Smoothing', route.smooth, 0, 3, 0.01, n => rx.updateRoute(route.id, { smooth: n }), n => `${n.toFixed(2)} s`));
    const detail = element('div', 'route-detail');
    const curve = select([{ id: 'linear', name: 'Linear' }, { id: 'exp', name: 'Stronger peaks' }, { id: 'log', name: 'Lift quiet sounds' }], route.curve, 'Response curve');
    curve.onchange = () => rx.updateRoute(route.id, { curve: curve.value });
    const rest = element('input'); rest.type = 'number'; rest.setAttribute('aria-label', 'Resting value');
    const range = targetInfo(route.target).kind === 'scene' ? app.scene.range(targetInfo(route.target).key) : PARAM_RANGES[destination(app.ascii, route.target).key];
    Object.assign(rest, { value: getRest(route.target) ?? '', placeholder: 'Mixed', min: range.min, max: range.max, step: range.step });
    rest.onchange = () => {
      if (rest.value === '') return;
      const n = Number(rest.value);
      if (!Number.isFinite(n)) return;
      setRest(route.target, Math.max(range.min, Math.min(range.max, n))); rest.value = getRest(route.target); save();
    };
    detail.append(field('Response', curve), field('Resting value', rest)); card.append(detail);
    const bipolar = element('input'); bipolar.type = 'checkbox'; bipolar.checked = route.bipolar;
    bipolar.onchange = () => rx.updateRoute(route.id, { bipolar: bipolar.checked });
    card.append(field('Swing both sides of resting value', bipolar));
    const live = element('div', 'route-live');
    const meter = element('meter'); meter.min = 0; meter.max = 1; meter.dataset.source = route.source;
    meter.setAttribute('aria-label', 'Mapping input level');
    const value = element('output'); value.dataset.target = route.target;
    live.append(element('span', '', 'Input'), meter, element('span', '', 'Result'), value); card.append(live);
    const hint = element('p', 'route-hint'); hint.dataset.target = route.target; card.append(hint);
    routes.append(card);
  }
}

picker.onchange = () => selectScene(picker.value);
$('#add-mapping').onclick = () => {
  if (!session || session.rx.routes.length >= 64) return;
  for (const target of [session.app.ascii.layers.length ? 'layer.0.fontSize' : 'fontSize', ...listTargets(session.app.ascii, session.app.scene)])
    for (const source of INPUTS)
      if (!session.rx.routes.some(r => r.target === target && r.source === source.id)) {
        session.rx.addRoute({ source: source.id, target, depth: 0.1, smooth: 0.15 }); return;
      }
};
function updateIntensity() {
  $('#intensity-value').textContent = `${Number(intensity.value).toFixed(2)}×`;
  session?.rx.setIntensity(enabled.checked ? Number(intensity.value) : 0);
}
intensity.oninput = enabled.onchange = updateIntensity;
$('#reset-mappings').onclick = () => {
  if (!session) return;
  const id = session.id;
  session.unsubscribe(); session = null;
  delete setup.patches[id]; selectScene(id);
};
$('#clear-mappings').onclick = () => session?.rx.load([]);
$('#appearance').onclick = () => { $('#mapping-panel').hidden = true; session?.app.ascii.togglePanel(); };
$('#scene-look').onclick = () => session?.app.scene?.toggle();
$('#mappings').onclick = () => {
  $('#mapping-panel').hidden = !$('#mapping-panel').hidden;
  session?.app.ascii.hidePanel();
};
$('#close-mappings').onclick = () => { $('#mapping-panel').hidden = true; };
function hideControls() {
  document.body.classList.toggle('hidden');
  if (document.body.classList.contains('hidden')) { session?.app.ascii.hidePanel(); session?.app.scene?.close(); }
}
$('#hide').onclick = hideControls;
addEventListener('keydown', event => window.asciiIfyHost.onKeydown(event));
$('#fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { status.textContent = 'Use your browser’s fullscreen command.'; }
};
$('#export-mappings').onclick = () => {
  snapshot();
  const url = URL.createObjectURL(new Blob([JSON.stringify(cleanSetup(setup, sceneIds), null, 2)], { type: 'application/json' }));
  const link = element('a'); link.href = url; link.download = 'ascii-visuals-mappings.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('#import-mappings').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('Mapping files must be smaller than 1 MB.');
    const next = cleanSetup(JSON.parse(await file.text()), sceneIds);
    session?.unsubscribe(); session = null;
    setup = next; selectScene(setup.scene);
  } catch (error) { note(error.message); }
  event.target.value = '';
};
let timer;
function tick() {
  if (session?.engine.syncLayers()) { renderRoutes(); save(); }
  for (const input of INPUTS) $(`#${input.id}`).value = audio.value(input.id);
  $('#intensity-value').textContent = `${Number(intensity.value).toFixed(2)}×`;
  if (session && !$('#mapping-panel').hidden && !document.body.classList.contains('hidden')) {
    routes.querySelectorAll('meter').forEach(el => { el.value = audio.value(el.dataset.source); });
    routes.querySelectorAll('output[data-target]').forEach(el => {
      const target = el.dataset.target, info = targetInfo(target);
      const values = info.kind === 'scene' ? [session.app.scene.effective(info.key)]
        : destinations(session.app.ascii, target).map(({ owner, key }) => numericValue(session.app.ascii, owner, key));
      const min = Math.min(...values), max = Math.max(...values);
      el.textContent = !values.length ? '—' : min === max ? min.toFixed(2) : `${min.toFixed(2)}–${max.toFixed(2)}`;
    });
    routes.querySelectorAll('.route-hint').forEach(el => {
      el.textContent = targetHint(el.dataset.target, session.app.ascii);
    });
  }
  timer = setTimeout(tick, 60);
}
connection.start(); selectScene(setup.scene); tick();
addEventListener('pagehide', () => {
  snapshot(); clearTimeout(saveTimer); clearTimeout(timer); connection.stop(); session?.unsubscribe();
  try { localStorage.setItem(storageKey, JSON.stringify(setup)); } catch { /* Export remains available. */ }
});
