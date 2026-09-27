import scenes from 'virtual:plugin-scenes';
import buildInfo from 'virtual:plugin-build';
import { PluginConnection } from './connection.js';
import { cleanSetup, defaultRoutes, patchForScene } from './mappings.js';
import { FEATURES, SONG, UNITS, MAX_COUNT, THIS_TRACK, sourceKey, parseSource, sourceValue, sourceLabel, sourceProblem, channelsFor, trackGroups } from './sources.js';
import { openPicker, openPickerNow } from './picker.js';
import { Reactivity } from '../../examples/audio-reactivity.js';
import { listTargets, targetInfo, targetHint, destination, destinations, baseTargets, numericValue, routingEngine } from './targets.js';
import { profileFor, sceneKind } from '../../examples/audio-profiles.js';
import { PARAM_RANGES } from '../../src/data/defaults.js';

const $ = selector => document.querySelector(selector);
const frame = $('#scene-frame'), picker = $('#scene'), status = $('#status');
const intensity = $('#intensity'), enabled = $('#react-enabled'), routes = $('#routes');
const sceneIds = scenes.map(s => s.id);
const storageKey = 'ascii-plugin-mappings-v1';
let setup = { version: 2, scene: 'galaxy', patches: {} }, session = null, saveTimer, groupBy = 'added';
let sourcePicker = null; // open input picker: its tracks' meters stream while it is open
try { const saved = localStorage.getItem(storageKey); if (saved) setup = cleanSetup(JSON.parse(saved), sceneIds); } catch { /* Use defaults for an old/invalid save. */ }
const messages = {
  live: 'Connected · audio arriving', silent: 'Connected · waiting for sound',
  waiting: 'Connected · press play in Ableton', bypass: 'Device bypassed · enable it in Ableton',
  disconnected: 'Device disconnected · click Open Visuals in Ableton to reconnect',
};
// Stream the Link tracks that mappings use, plus every track while the input
// picker is open so its meters move.
function wantedChannels() {
  const packet = connection.packet;
  const keys = session ? session.rx.routes.map(r => r.source) : [];
  if (sourcePicker) for (const group of trackGroups(packet)) for (const t of group.tracks) keys.push(`${t.prefix}/rms`);
  return channelsFor(packet, keys);
}
const connection = new PluginConnection({ channels: wantedChannels, onChange(state) {
  status.textContent = messages[state]; status.dataset.state = state;
} });
const audio = { value: id => sourceValue(connection.packet, id) };
const thisTrack = feature => sourceKey.plugin(THIS_TRACK, feature);
const groups = { ambient: 'Atmosphere & nature', flow: 'Flow & motion', geometry: 'Geometry & dashboards', impact: 'Light & energy', gentle: 'Games & interactive', custom: 'Audio study' };
for (const [kind, name] of Object.entries(groups)) {
  const group = document.createElement('optgroup'); group.label = name;
  for (const scene of scenes.filter(s => sceneKind(s.id) === kind)) group.append(new Option(scene.name, scene.id));
  if (group.children.length) picker.append(group);
}
$('#scene-count').textContent = `${scenes.length} library scenes`;
const versionLabel = $('#build-version');
versionLabel.textContent = `Web v${buildInfo.version} · checking plugin version…`;
versionLabel.title = `Web build: ${buildInfo.builtAt}`;
fetch(new URL('../../info', location.href), { cache: 'no-store', signal: AbortSignal.timeout(3000) })
  .then(response => { if (!response.ok) throw new Error('Unavailable'); return response.json(); })
  .then(info => {
    if (typeof info.pluginVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(info.pluginVersion)) throw new Error('Invalid version');
    const mismatch = info.pluginVersion !== buildInfo.version;
    versionLabel.textContent = `Web v${buildInfo.version} · Plugin v${info.pluginVersion}${mismatch ? ' · versions differ' : ''}`;
    versionLabel.dataset.mismatch = String(mismatch);
    if (mismatch) versionLabel.title += '\nQuit and reopen Ableton, then click Open Visuals for a fresh connection.';
  })
  .catch(() => { versionLabel.textContent = `Web v${buildInfo.version} · plugin version unavailable`; });

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
  openPickerNow()?.close();
  setup.scene = id; picker.value = id;
  $('#mapping-title').textContent = scenes.find(s => s.id === id).name;
  routes.replaceChildren();
  note('Loading scene…');
  $('#mapping-fields').disabled = true;
  frame.src = new URL(`../../examples/${id}.html?plugin`, location.href).href;
}

window.asciiIfyHost = {
  version: 1, sourceIds: [], audio,
  get current() { return session; },
  attach(app, child) {
    if (child !== frame.contentWindow || !child.location.pathname.endsWith(`/${setup.scene}.html`)) return;
    const engine = routingEngine(app.ascii, id => app.useSignal?.(id));
    const rx = new Reactivity({ ascii: engine, scene: app.scene, audio });
    session = { id: setup.scene, app, rx, engine, unsubscribe: () => {} };
    const patch = patchForScene(setup.patches[setup.scene] ?? { routes: defaultRoutes(profileFor(setup.scene, app.ascii)), bases: {} }, app.ascii);
    intensity.value = patch?.intensity ?? 1;
    enabled.checked = patch?.enabled ?? true;
    if (patch) for (const [target, value] of Object.entries(patch.bases)) setRest(target, value);
    rx.load(patch.routes, {
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
// Input picker: tracks (this device's, then each Link peer's), then the song.
function inputGroups(packet) {
  const groups = trackGroups(packet).flatMap(section => section.tracks.map(t => ({
    id: t.prefix, name: t.label, section: section.name, meter: `${t.prefix}/rms`,
    items: FEATURES.map(f => ({ key: `${t.prefix}/${f.id}`, name: f.name, meter: `${t.prefix}/${f.id}`,
      detail: f.kind === 'hit' ? 'Jumps on each hit, then fades' : '' })),
  })));
  groups.push({ id: 'song', name: 'Song', section: 'Live transport', items: SONG.map(s => ({
    key: sourceKey.song(s.id), name: s.name, detail: s.detail, meter: sourceKey.song(s.id) })) });
  return groups;
}
// Timed song signals keep their length when switching between pulse and ramp.
const timed = key => { const p = parseSource(key); return p?.count ? p : null; };
const pickerKey = key => { const p = timed(key); return p ? sourceKey.song(p.signal) : key; };
function pickedSource(key, current) {
  const next = timed(key), now = timed(current);
  return next && now ? sourceKey.song(next.signal, now) : key;
}
// Length, unit and first cycle for a pulse or ramp, e.g. every 4 bars from bar 3.
function timingFields(length, change) {
  const unit = UNITS.find(u => u.id === length.unit);
  const count = element('input'); count.type = 'number'; count.setAttribute('aria-label', 'Length');
  Object.assign(count, { min: 1, max: MAX_COUNT, step: 1, value: length.count });
  count.onchange = () => {
    const n = Math.round(Number(count.value));
    if (!Number.isFinite(n) || n < 1) { count.value = length.count; return; }
    const next = Math.min(MAX_COUNT, n);
    change({ ...length, count: next, start: Math.min(length.start, next) });
  };
  const units = select(UNITS.map(u => ({ id: u.id, name: length.count === 1 ? u.one : u.many })), length.unit, 'Length unit');
  units.onchange = () => change({ ...length, unit: units.value });
  const start = select(Array.from({ length: length.count }, (_, i) => ({ id: String(i + 1), name: `${unit.one} ${i + 1}` })), String(length.start), 'Starts on');
  start.onchange = () => change({ ...length, start: Number(start.value) });
  const row = element('div', 'route-detail route-timing');
  row.append(field('Length', count), field('Unit', units), field('Starts on', start));
  return row;
}
function linkNote(packet) {
  const tracks = packet.sources.filter(s => s.kind === 'link').length;
  if (tracks) return `${tracks} Live track${tracks === 1 ? '' : 's'} available over Link Audio.`;
  if (packet.link.peers) return 'Connected over Link, but no tracks are shared. Turn on Link Audio in Live’s Settings → Link.';
  return 'Only this device’s track is available. To use any Live track, turn on Link and Link Audio in Live’s Settings → Link.';
}
const sectionFor = group => (group === 'Scene look' ? 'Scene' : group === 'All layers' || group.startsWith('Layer ') ? 'Layers' : 'Rendering');
function parameterGroups(app) {
  const byGroup = new Map();
  for (const id of listTargets(app.ascii, app.scene)) {
    const info = targetInfo(id);
    if (!byGroup.has(info.group)) byGroup.set(info.group, []);
    const hint = targetHint(id, app.ascii);
    byGroup.get(info.group).push({ key: id, name: info.label, detail: hint.startsWith('Enable') ? hint.replace(' to use this parameter.', ' first') : '' });
  }
  const order = ['Scene', 'Rendering', 'Layers'];
  return [...byGroup].map(([name, items]) => ({ id: name, name, section: sectionFor(name), items }))
    .sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
}
function pickButton(label, text, onClick) {
  const button = element('button', 'pick', text);
  button.type = 'button';
  button.title = text;
  button.setAttribute('aria-label', label);
  button.onclick = onClick;
  return button;
}
const groupLabel = {
  input: route => sourceLabel(route.source, connection.packet).split(' · ')[0],
  parameter: route => targetInfo(route.target).group,
};
function renderRoutes() {
  routes.replaceChildren();
  if (!session) return;
  const { rx, app } = session;
  $('#mapping-total').textContent = `${rx.routes.length} mappings`;
  if (!rx.routes.length) routes.append(element('p', 'empty', 'No audio mappings. Add one to choose what sound controls.'));
  let ordered = rx.routes;
  if (groupBy !== 'added') ordered = [...rx.routes].sort((a, b) => groupLabel[groupBy](a).localeCompare(groupLabel[groupBy](b)));
  let heading;
  for (const route of ordered) {
    if (groupBy !== 'added' && groupLabel[groupBy](route) !== heading) {
      heading = groupLabel[groupBy](route);
      routes.append(element('h2', 'route-group', heading));
    }
    const card = element('article', `route${route.enabled ? '' : ' off'}`); card.dataset.id = route.id;
    const top = element('div', 'route-top');
    const toggle = element('input'); toggle.type = 'checkbox'; toggle.checked = route.enabled;
    toggle.setAttribute('aria-label', 'Enable mapping');
    toggle.onchange = () => rx.updateRoute(route.id, { enabled: toggle.checked });
    function changePair(change) {
      const next = { source: route.source, target: route.target, ...change };
      if (rx.routes.some(r => r.id !== route.id && r.source === next.source && r.target === next.target)) {
        note('That signal already controls this parameter. Edit its existing mapping.'); return;
      }
      rx.updateRoute(route.id, change);
    }
    const source = pickButton('Input signal', sourceLabel(route.source, connection.packet), () => {
      sourcePicker = openPicker({ title: 'Choose an input', searchLabel: 'Search tracks and signals',
        groups: inputGroups(connection.packet), selected: pickerKey(route.source), note: linkNote(connection.packet),
        onPick: key => changePair({ source: pickedSource(key, route.source) }) });
    });
    source.dataset.source = route.source;
    const target = pickButton('Visual parameter', `${targetInfo(route.target).group} · ${targetInfo(route.target).label}`, () => {
      openPicker({ title: 'Choose a parameter', searchLabel: 'Search parameters', groups: parameterGroups(app),
        selected: route.target, onPick: key => changePair({ target: key }) });
    });
    const remove = element('button', 'remove', '×'); remove.setAttribute('aria-label', 'Remove mapping');
    remove.onclick = () => rx.removeRoute(route.id);
    top.append(toggle, source, element('span', '', '→'), target, remove); card.append(top);
    const length = timed(route.source);
    if (length) card.append(timingFields(length, next => changePair({ source: sourceKey.song(length.signal, next) })));
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
    const hint = element('p', 'route-hint'); hint.dataset.target = route.target; hint.dataset.source = route.source; card.append(hint);
    routes.append(card);
  }
}

// Keep an open picker's meters moving and its track list current.
let pickerTracks = '';
function updatePicker() {
  const open = openPickerNow();
  if (!open) { sourcePicker = null; return; }
  const packet = connection.packet;
  open.meters().forEach(el => { el.value = audio.value(el.dataset.meter); });
  if (open !== sourcePicker) return;
  const tracks = packet.sources.map(s => `${s.id}:${s.peer ?? ''}:${s.name}`).join('|');
  if (tracks !== pickerTracks) { pickerTracks = tracks; open.update(inputGroups(packet), linkNote(packet)); }
}
$('#group-by').onchange = event => { groupBy = event.target.value; renderRoutes(); };
picker.onchange = () => selectScene(picker.value);
$('#add-mapping').onclick = () => {
  if (!session || session.rx.routes.length >= 64) return;
  for (const target of [session.app.ascii.layers.length ? 'layer.all.fontSize' : 'fontSize', ...listTargets(session.app.ascii, session.app.scene)])
    for (const feature of FEATURES)
      if (!session.rx.routes.some(r => r.target === target && r.source === thisTrack(feature.id))) {
        session.rx.addRoute({ source: thisTrack(feature.id), target, depth: 0.1, smooth: 0.15 }); return;
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
  if ($('#mapping-panel').hidden) openPickerNow()?.close();
  session?.app.ascii.hidePanel();
};
$('#close-mappings').onclick = () => { $('#mapping-panel').hidden = true; openPickerNow()?.close(); };
function hideControls() {
  document.body.classList.toggle('hidden');
  if (document.body.classList.contains('hidden')) { session?.app.ascii.hidePanel(); session?.app.scene?.close(); openPickerNow()?.close(); }
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
  for (const id of ['rms', 'bass', 'mid', 'high']) $(`#${id}`).value = audio.value(thisTrack(id));
  updatePicker();
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
      el.textContent = sourceProblem(el.dataset.source, connection.packet) || targetHint(el.dataset.target, session.app.ascii);
    });
    routes.querySelectorAll('button[data-source]').forEach(el => {
      const label = sourceLabel(el.dataset.source, connection.packet);
      if (el.textContent !== label) el.textContent = el.title = label;
    });
    $('#link-note').textContent = linkNote(connection.packet);
  }
  timer = setTimeout(tick, 60);
}
connection.start(); selectScene(setup.scene); tick();
addEventListener('pagehide', () => {
  snapshot(); clearTimeout(saveTimer); clearTimeout(timer); connection.stop(); session?.unsubscribe();
  try { localStorage.setItem(storageKey, JSON.stringify(setup)); } catch { /* Export remains available. */ }
});
