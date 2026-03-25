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
  const clen = charCount - 1;

  if (!cycleState.cycling) {
    const scheme = COLOR_SCHEMES[schemeIndex];
    for (let i = 0; i < charCount; i++) {
      const v = clen > 0 ? i / clen : 0;
      const [h, s, l] = scheme.fn(v, time);
      lut[i] = `hsl(${h} ${s}% ${l}%)`;
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
    }
  }

  return lut;
}
