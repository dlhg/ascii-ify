import { lerp, lerpHue } from '../utils.js';

// Hypsometric tint: deep water, shallows, sand, grass, forest, ochre, rock, snow
const TOPO = [
  [0.00, 224, 75, 30], [0.08, 214, 80, 42], [0.17, 190, 80, 56], [0.23, 45, 70, 72],
  [0.31, 84, 55, 52], [0.42, 120, 50, 44], [0.54, 76, 48, 50], [0.63, 40, 62, 54],
  [0.72, 24, 58, 50], [0.80, 16, 30, 56], [0.88, 30, 10, 70], [1.00, 200, 40, 97],
];

function topo(v) {
  let i = 1;
  while (i < TOPO.length - 1 && TOPO[i][0] < v) i++;
  const [v0, h0, s0, l0] = TOPO[i - 1], [v1, h1, s1, l1] = TOPO[i];
  const t = Math.max(0, Math.min(1, (v - v0) / (v1 - v0)));
  return [lerpHue(h0, h1, t), lerp(s0, s1, t), lerp(l0, l1, t)];
}

// Each fn returns [h, s, l] for blending
export const COLOR_SCHEMES = [
  {
    name: 'rainbow',
    fn: (v, t) => [(v * 360 + t * 40) % 360, 85, 35 + v * 40],
  },
  {
    name: 'neon',
    fn: (v, t) => {
      const hue = [300, 180, 60][Math.floor(v * 2.99)] + Math.sin(t) * 20;
      return [hue, 100, 40 + v * 30];
    },
  },
  {
    name: 'fire',
    fn: (v, t) => [v * 60 + Math.sin(t) * 10, 80 + v * 20, 15 + v * 55],
  },
  {
    name: 'ocean',
    fn: (v, t) => [180 + v * 60 + Math.sin(t * 0.5) * 20, 75, 20 + v * 50],
  },
  {
    name: 'acid',
    fn: (v, t) => [80 + v * 80 + Math.sin(t * 2) * 30, 100, 25 + v * 45],
  },
  {
    name: 'vapor',
    fn: (v, t) => [260 + v * 100 + t * 25, 80, 35 + v * 40],
  },
  {
    name: 'mono',
    fn: (v) => [0, 0, v * 85],
  },
  {
    name: 'sakura',
    fn: (v, t) => [340 + v * 30 + Math.sin(t * 0.6) * 10, 60 + v * 30, 40 + v * 45],
  },
  {
    name: 'topo',
    fn: (v) => topo(v),
  },
];
