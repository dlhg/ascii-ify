/**
 * Render ASCII characters onto a canvas context from a brightness buffer.
 * Pure function — no side effects beyond drawing.
 *
 * @param {CanvasRenderingContext2D} ctx - target canvas context
 * @param {Float32Array} brightness - brightness values [0-1], length = cols * rows
 * @param {{ cols: number, rows: number, cw: number, ch: number, ar: number }} grid
 * @param {string[]} colorLUT - color strings indexed by character index
 * @param {string} chars - character string (sparse → dense)
 * @param {number} fade - 0-1 spatial opacity fade amount
 * @param {number} time - current animation time (for fade field)
 */
export function renderLayer(ctx, brightness, grid, colorLUT, chars, fade, time) {
  const { cols, rows, cw, ch, ar } = grid;
  const clen = chars.length - 1;

  // Font is expected to be set by the caller before invoking renderLayer.
  ctx.textBaseline = 'top';

  for (let r = 0; r < rows; r++) {
    const py = r * ch;
    for (let c = 0; c < cols; c++) {
      let v = brightness[r * cols + c];
      v = v < 0 ? 0 : v > 1 ? 1 : v;

      const ci = (v * clen) | 0;
      if (ci === 0) continue;

      // Spatial fade field
      if (fade > 0) {
        const alpha = 1 - fade * (1 - fadeField(c, r, time, ar));
        if (alpha < 0.02) continue;
        ctx.globalAlpha = alpha;
      }

      ctx.fillStyle = colorLUT[ci];
      ctx.fillText(chars[ci], c * cw, py);
    }
  }

  ctx.globalAlpha = 1;
}

/**
 * Spatial opacity variation using 3 sine waves.
 * Returns 0-1 where 1 = full opacity, 0 = transparent.
 */
function fadeField(x, y, t, ar) {
  const sy = y * ar;
  let v = Math.sin(x * 0.06 - t * 0.8);
  v += Math.sin(sy * 0.05 + t * 1.1);
  v += Math.sin((x + sy) * 0.04 - t * 0.5);
  return (v + 3) / 6;
}
