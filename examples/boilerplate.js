// ─── Shared Boilerplate for Examples ──────────────────────────

import { AsciiIfy } from '../src/index.js';
import { ScenePopup } from './scene-controls.js';
import { createAudioDock } from './audio-dock.js';
import { Reactivity, loadPatch } from './audio-reactivity.js';
import { AudioPanel } from './audio-panel.js';
import { profileFor, sceneName } from './audio-profiles.js';
import { registerSignal } from '../src/automation.js';
import { embeddedHost, idleAudio } from './embedded-host.js';
export { AsciiIfy };

export function createApp({
  asciiConfig = {},
  layers = [],
  draw,
  onResize = null,
  onKeydown = null,
  showPanel = false,
  sceneControls = true,
  audio = null,        // true/false, or omit to follow the ?audio URL flag
  audioRecipe = true,  // apply this scene's audio profile (see audio-profiles.js)
} = {}) {
  const host = embeddedHost();
  if (host) {
    // Prevent hidden, hard-coded audio routes from competing with the mapping UI.
    const automations = Object.fromEntries(Object.entries(asciiConfig.automations || {})
      .filter(([, value]) => !String(value.type).startsWith('audio:')));
    asciiConfig = { ...asciiConfig, automations };
  }
  const canvas = document.getElementById('source');
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (onResize) onResize(ctx, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  const ascii = new AsciiIfy(canvas, asciiConfig);

  for (const layerConfig of layers) {
    ascii.addLayer({ source: canvas, ...layerConfig });
  }

  if (showPanel && !host) ascii.showPanel();

  // Audio: one analyzer + dock, and (optionally) generic routes so any scene reacts.
  const useAudio = !host && (audio ?? new URLSearchParams(location.search).has('audio'));
  let reactivity = null;
  let audioPanel = null;
  const audioDock = useAudio
    ? createAudioDock({
        intensity: audioRecipe,
        onIntensity: (k) => reactivity?.setIntensity(k),
        onOpenPanel: audioRecipe ? () => audioPanel?.show() : null,
      })
    : null;

  // Global scene controls (brightness/contrast/etc + speed) applied to the
  // source canvas each frame — see scene-controls.js.
  const scene = sceneControls ? new ScenePopup(document.body) : null;
  if (host && scene) scene.setLauncherHidden(true);
  let scratch = null; // lazily-created buffer for the filter post-process

  document.addEventListener('keydown', (e) => {
    if (host?.onKeydown(e)) return;
    if (e.key === 'p' || e.key === 'P') ascii.togglePanel();
    if (e.key === 'e' || e.key === 'E') ascii.set('enabled', !ascii.get('enabled'));
    if (audioPanel && e.key === '`') audioPanel.toggle(); // backtick: A/S/D/W belong to the games
    if (scene && (e.key === 'g' || e.key === 'G')) scene.toggle();
    if (onKeydown) onKeydown(e);
  });

  if (audioDock && audioRecipe) {
    // A saved patch for this scene wins over the scene's default profile.
    const name = sceneName();
    const defaults = () => profileFor(name, ascii);
    const saved = loadPatch(name);
    reactivity = new Reactivity({ ascii, scene, audio: audioDock.audio });
    reactivity.load(saved ? saved.routes : defaults());
    audioDock.setIntensity(reactivity.intensity);
    audioPanel = new AudioPanel({ reactivity, dock: audioDock, sceneName: name, defaults, ascii, custom: !!saved });
  }

  let lastTime = 0;
  let sceneTime = 0;       // speed-scaled clock, so time- and dt-based scenes both obey Speed
  let filtered = false;    // did we leave a filtered image on the source canvas last frame?

  function ensureScratch(w, h) {
    if (!scratch) {
      scratch = document.createElement('canvas');
      scratch._ctx = scratch.getContext('2d');
    }
    if (scratch.width !== w || scratch.height !== h) {
      scratch.width = w;
      scratch.height = h;
    }
    return scratch;
  }

  // The scene filter must NOT feed back into the source canvas: trail-based
  // scenes (e.g. fireworks) accumulate onto it across frames, so a persisted
  // brightened image would compound each frame. We instead keep the source
  // pristine and apply the filter transiently — reverting before the next draw.
  function restorePristine() {
    const w = canvas.width, h = canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(scratch, 0, 0);
    ctx.restore();
    filtered = false;
  }

  function applySceneFilter() {
    const filter = scene && scene.filter;
    if (!filter) return;
    const w = canvas.width, h = canvas.height;
    ensureScratch(w, h);
    // Back up the pristine frame, then repaint the source through the filter.
    scratch._ctx.setTransform(1, 0, 0, 1, 0, 0);
    scratch._ctx.clearRect(0, 0, w, h);
    scratch._ctx.drawImage(canvas, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.filter = filter;
    ctx.drawImage(scratch, 0, 0);
    ctx.restore();
    filtered = true;
  }

  function loop(time) {
    const rawDt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = time;
    // Advance scene automations on unscaled time (so automating Speed can't
    // feed back into its own clock) before reading the resulting values.
    if (scene) scene.tick(rawDt);
    const speed = scene ? scene.speed : 1;
    const dt = rawDt * speed;
    sceneTime += dt * 1000;

    // Undo last frame's filter so the scene draws onto its own unaltered pixels.
    if (filtered) restorePristine();

    draw(ctx, { time: sceneTime, dt, width: canvas.width, height: canvas.height, audio: host ? idleAudio : audioDock?.audio ?? null });
    applySceneFilter();
    ascii.render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  const app = {
    canvas,
    ctx,
    ascii,
    scene,
    audio: host ? idleAudio : audioDock?.audio ?? null,
    reactivity,
    get audioPanel() { return audioPanel; },
    get width() { return canvas.width; },
    get height() { return canvas.height; },
  };

  if (host) {
    // Host sources can appear at any time (e.g. new Live tracks), so the host
    // registers each one as an engine signal when a mapping first uses it.
    const registered = new Map();
    app.useSignal = id => {
      if (!registered.has(id)) registered.set(id, registerSignal(`audio:${id}`, () => host.audio.value(id)));
    };
    (host.sourceIds ?? []).forEach(app.useSignal);
    // Let the example finish its synchronous setup before the host applies saved mappings.
    queueMicrotask(() => host.attach(app, window));
    window.addEventListener('pagehide', () => registered.forEach(fn => fn()), { once: true });
  }

  return app;
}
