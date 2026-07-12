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
 * Render ASCII characters with a lightweight 3D projection.
 *
 * Brightness is treated as height above/below the source grid, then the glyphs
 * are rotated, projected, depth-sorted, and drawn back onto the 2D canvas.
 *
 * @param {CanvasRenderingContext2D} ctx - target canvas context
 * @param {Float32Array} brightness - brightness values [0-1], length = cols * rows
 * @param {{ cols: number, rows: number, cw: number, ch: number, ar: number }} grid
 * @param {string[]} colorLUT - color strings indexed by character index
 * @param {string} chars - character string (sparse -> dense)
 * @param {number} fade - 0-1 spatial opacity fade amount
 * @param {number} time - current animation time (for fade field)
 * @param {object} opts - projection options
 */
export function renderLayer3D(ctx, brightness, grid, colorLUT, chars, fade, time, opts = {}) {
  const { cols, rows, cw, ch, ar } = grid;
  const clen = chars.length - 1;
  const width = opts.width ?? cols * cw;
  const height = opts.height ?? rows * ch;
  const depthScale = opts.depthScale ?? 120;
  const perspective = Math.max(1, opts.perspective ?? 650);
  const baseZ = opts.cameraZ ?? 700;
  const scaleMin = opts.scaleMin ?? 0.45;
  const scaleMax = opts.scaleMax ?? 2.5;
  const opacityDepth = opts.opacityDepth ?? 0.35;
  const centerX = width * 0.5;
  const centerY = height * 0.5;

  const rx = opts.rotationX ?? 0;
  const ry = opts.rotationY ?? 0;
  const rz = opts.rotationZ ?? 0;
  const sx = Math.sin(rx);
  const cx = Math.cos(rx);
  const sy = Math.sin(ry);
  const cy = Math.cos(ry);
  const sz = Math.sin(rz);
  const cz = Math.cos(rz);

  const glyphs = [];

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      let v = brightness[i];
      v = v < 0 ? 0 : v > 1 ? 1 : v;

      const ci = (v * clen) | 0;
      if (ci === 0) continue;

      const x0 = c * cw + cw * 0.5 - centerX;
      const y0 = r * ch + ch * 0.5 - centerY;
      const z0 = (v - 0.5) * depthScale;

      // Rotate X, then Y, then Z.
      const y1 = y0 * cx - z0 * sx;
      const z1 = y0 * sx + z0 * cx;
      const x2 = x0 * cy + z1 * sy;
      const z2 = -x0 * sy + z1 * cy;
      const x3 = x2 * cz - y1 * sz;
      const y3 = x2 * sz + y1 * cz;

      const cameraDepth = baseZ - z2;
      if (cameraDepth <= 1) continue;

      const p = perspective / (perspective + cameraDepth - baseZ);
      if (p <= 0) continue;

      let alpha = 1;
      if (fade > 0) {
        alpha *= 1 - fade * (1 - fadeField(c, r, time, ar));
      }
      if (opacityDepth > 0) {
        const depthAlpha = 1 - opacityDepth * ((z2 / Math.max(1, depthScale)) + 0.5);
        alpha *= depthAlpha < 0 ? 0 : depthAlpha > 1 ? 1 : depthAlpha;
      }
      if (alpha < 0.02) continue;

      glyphs.push({
        char: chars[ci],
        color: colorLUT[ci],
        x: centerX + x3 * p,
        y: centerY + y3 * p,
        z: z2,
        scale: p < scaleMin ? scaleMin : p > scaleMax ? scaleMax : p,
        alpha,
      });
    }
  }

  glyphs.sort((a, b) => a.z - b.z);

  for (const g of glyphs) {
    ctx.globalAlpha = g.alpha;
    ctx.fillStyle = g.color;
    if (Math.abs(g.scale - 1) > 0.02) {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.scale(g.scale, g.scale);
      ctx.fillText(g.char, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(g.char, g.x, g.y);
    }
  }

  ctx.globalAlpha = 1;
  ctx.textAlign = 'start';
  ctx.textBaseline = 'top';
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
