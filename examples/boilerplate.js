// ─── Shared Boilerplate for Examples ──────────────────────────

import { AsciiIfy } from '../src/index.js';
export { AsciiIfy };

export function createApp({
  asciiConfig = {},
  layers = [],
  draw,
  onResize = null,
  onKeydown = null,
  showPanel = false,
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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') ascii.togglePanel();
    if (e.key === 'e' || e.key === 'E') ascii.set('enabled', !ascii.get('enabled'));
    if (onKeydown) onKeydown(e);
  });

  let lastTime = 0;

  function loop(time) {
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = time;

    draw(ctx, { time, dt, width: canvas.width, height: canvas.height });
    ascii.render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  const app = {
    canvas,
    ctx,
    ascii,
    get width() { return canvas.width; },
    get height() { return canvas.height; },
  };

  return app;
}
