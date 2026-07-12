// ─── Shared Boilerplate for Examples ──────────────────────────

import { AsciiIfy } from '../src/index.js';
import { ScenePopup } from './scene-controls.js';
export { AsciiIfy };

export function createApp({
  asciiConfig = {},
  layers = [],
  draw,
  onResize = null,
  onKeydown = null,
  showPanel = false,
  sceneControls = true,
} = {}) {
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

  if (showPanel) ascii.showPanel();

  // Global scene controls (brightness/contrast/etc + speed) applied to the
  // source canvas each frame — see scene-controls.js.
  const scene = sceneControls ? new ScenePopup(document.body) : null;
  let scratch = null; // lazily-created buffer for the filter post-process

  document.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') ascii.togglePanel();
    if (e.key === 'e' || e.key === 'E') ascii.set('enabled', !ascii.get('enabled'));
    if (scene && (e.key === 'g' || e.key === 'G')) scene.toggle();
    if (onKeydown) onKeydown(e);
  });

  let lastTime = 0;
  let sceneTime = 0; // speed-scaled clock, so time- and dt-based scenes both obey Speed

  function applySceneFilter() {
    const filter = scene && scene.filter;
    if (!filter) return;
    const w = canvas.width, h = canvas.height;
    if (!scratch) {
      scratch = document.createElement('canvas');
      scratch._ctx = scratch.getContext('2d');
    }
    if (scratch.width !== w || scratch.height !== h) {
      scratch.width = w;
      scratch.height = h;
    }
    scratch._ctx.clearRect(0, 0, w, h);
    scratch._ctx.drawImage(canvas, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.filter = filter;
    ctx.drawImage(scratch, 0, 0);
    ctx.restore();
  }

  function loop(time) {
    const rawDt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = time;
    const speed = scene ? scene.speed : 1;
    const dt = rawDt * speed;
    sceneTime += dt * 1000;

    draw(ctx, { time: sceneTime, dt, width: canvas.width, height: canvas.height });
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
    get width() { return canvas.width; },
    get height() { return canvas.height; },
  };

  return app;
}
