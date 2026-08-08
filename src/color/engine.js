import { COLOR_SCHEMES } from './schemes.js';
import { lerpHue } from '../utils.js';

/**
 * Build a color lookup table — one HSL string per character index.
 * @param {number} schemeIndex - index into COLOR_SCHEMES
 * @param {number} charCount - number of characters in the active charset
 * @param {number} time - current animation time
 * @param {{ cycling: boolean, phase: number }} cycleState - color cycling state
 * @returns {string[]} array of "hsl(...)" strings, length = charCount
 */
export function buildColorLUT(schemeIndex, charCount, time, cycleState) {
  const lut = new Array(charCount);
  const rgb = {
    r: new Uint8Array(charCount),
    g: new Uint8Array(charCount),
    b: new Uint8Array(charCount),
  };
  const clen = charCount - 1;

  if (!cycleState.cycling) {
    const scheme = COLOR_SCHEMES[schemeIndex];
    for (let i = 0; i < charCount; i++) {
      const v = clen > 0 ? i / clen : 0;
      const [h, s, l] = scheme.fn(v, time);
      lut[i] = `hsl(${h} ${s}% ${l}%)`;
      setRgb(rgb, i, h, s, l);
    }
  } else {
    const phase = cycleState.phase;
    const iA = Math.floor(phase) % COLOR_SCHEMES.length;
    const iB = (iA + 1) % COLOR_SCHEMES.length;
    const blend = phase - Math.floor(phase);
    const schemeA = COLOR_SCHEMES[iA];
    const schemeB = COLOR_SCHEMES[iB];

    for (let i = 0; i < charCount; i++) {
      const v = clen > 0 ? i / clen : 0;
      const [h1, s1, l1] = schemeA.fn(v, time);
      const [h2, s2, l2] = schemeB.fn(v, time);
      const h = lerpHue(h1, h2, blend);
      const s = s1 + (s2 - s1) * blend;
      const l = l1 + (l2 - l1) * blend;
      lut[i] = `hsl(${h} ${s}% ${l}%)`;
      setRgb(rgb, i, h, s, l);
    }
  }

  Object.defineProperty(lut, '_rgb', { value: rgb });
  return lut;
}

function setRgb(rgb, i, h, s, l) {
  s /= 100;
  l /= 100;
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const xv = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = xv; }
  else if (hp < 2) { r = xv; g = c; }
  else if (hp < 3) { g = c; b = xv; }
  else if (hp < 4) { g = xv; b = c; }
  else if (hp < 5) { r = xv; b = c; }
  else { r = c; b = xv; }
  const m = l - c / 2;
  rgb.r[i] = ((r + m) * 255) | 0;
  rgb.g[i] = ((g + m) * 255) | 0;
  rgb.b[i] = ((b + m) * 255) | 0;
}
