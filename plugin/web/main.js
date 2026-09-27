import { AsciiIfy } from '../../src/index.js';
import { registerSignal } from '../../src/automation.js';
import { PluginConnection } from './connection.js';

const status = document.querySelector('#status');
const messages = {
  live: 'Connected · audio arriving', silent: 'Connected · waiting for sound',
  waiting: 'Connected · press play in Ableton', bypass: 'Device bypassed · enable it in Ableton',
  disconnected: 'Device disconnected · click Open Visuals in Ableton to reconnect',
};
const connection = new PluginConnection({ onChange(state) {
  status.textContent = messages[state];
  status.dataset.state = state;
} });
const canvas = document.querySelector('#source');
const ctx = canvas.getContext('2d');
const intensity = document.querySelector('#intensity');
const scene = document.querySelector('#scene');
const meters = Object.fromEntries(['bass', 'mid', 'high'].map(k => [k, document.getElementById(k)]));
function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
resize();
addEventListener('resize', resize);

// Reuse the engine's signal registry. No microphone or Web Audio permissions.
const normalized = key => Math.min(1, Math.sqrt(connection.levels[key]) * Number(intensity.value));
const unregister = ['rms', 'bass', 'mid', 'high'].map(key => registerSignal(`audio:${key}`, () => normalized(key)));
const ascii = new AsciiIfy(canvas, {
  fontSize: 9, colorScheme: 'source', background: '#06080d',
  crtEnabled: true, crtScanlines: 0.12, crtGlow: 0.15,
});
ascii.automate('crtGlow', { type: 'audio:high', min: 0.08, max: 0.55 });
ascii.automate('fontSize', { type: 'audio:bass', min: 7, max: 13 });
connection.start();

let frame;
function draw(time) {
  const w = canvas.width, h = canvas.height, size = Math.min(w, h);
  const bass = normalized('bass'), mid = normalized('mid'), high = normalized('high');
  const t = time / 1000;
  ctx.fillStyle = '#06080d';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  const hue = 150 + mid * 85;
  if (scene.value === 'bars') {
    [bass, mid, high].forEach((level, i) => {
      const height = size * (0.035 + level * 0.55);
      ctx.fillStyle = `hsl(${hue + i * 30} 85% 68%)`;
      ctx.fillRect((i - 1) * size * 0.2 - size * 0.06, -height / 2, size * 0.12, height);
    });
  } else {
    const radius = size * (0.085 + bass * 0.17);
    if (scene.value === 'orb') {
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      glow.addColorStop(0, '#ffffff');
      glow.addColorStop(0.45, `hsl(${hue} 90% 70%)`);
      glow.addColorStop(1, '#06080d');
      ctx.fillStyle = glow;
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    }
    for (let ring = 0; ring < 4; ring++) {
      ctx.save();
      ctx.rotate(t * (0.12 + ring * 0.04) * (ring % 2 ? -1 : 1));
      const r = radius + size * (0.04 + ring * 0.048);
      ctx.strokeStyle = `hsl(${hue + ring * 20} 80% ${48 + high * 30}%)`;
      ctx.lineWidth = 2 + mid * 10;
      for (let part = 0; part < 8; part++) {
        const angle = part / 8 * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(0, 0, r, angle, angle + Math.PI * (0.09 + high * 0.12));
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  ctx.restore();
  for (const key of Object.keys(meters)) meters[key].value = normalized(key);
  ascii.render();
  frame = requestAnimationFrame(draw);
}
frame = requestAnimationFrame(draw);

document.querySelector('#hide').onclick = () => document.body.classList.add('hidden');
addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'h' && !['INPUT', 'SELECT'].includes(event.target.tagName))
    document.body.classList.toggle('hidden');
});
document.querySelector('#fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { status.textContent = 'Use your browser’s fullscreen command.'; }
};
addEventListener('pagehide', () => {
  connection.stop();
  cancelAnimationFrame(frame);
  unregister.forEach(fn => fn());
  ascii.destroy();
});
