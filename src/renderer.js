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
 * @param {Uint8ClampedArray} [sourceColors] - optional per-cell source RGBA values
 */
export function renderLayer(ctx, brightness, grid, colorLUT, chars, fade, time, sourceColors = null) {
  const { cols, rows, cw, ch, ar } = grid;
  const clen = chars.length - 1;

  // Font is expected to be set by the caller before invoking renderLayer.
  ctx.textAlign = 'left';
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

      ctx.fillStyle = sourceColors ? sourceColorAt(sourceColors, r * cols + c) : colorLUT[ci];
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
 * @param {Uint8ClampedArray} [sourceColors] - optional per-cell source RGBA values
 */
export function renderLayer3D(ctx, brightness, grid, colorLUT, chars, fade, time, opts = {}, sourceColors = null) {
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
  const depthValues = opts.depthValues || null;
  const fontSize = opts.fontSize ?? (parseFloat(ctx.font) || 12);
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

  // Depth alpha is linear in z: alpha = depthA - depthB * z
  const depthA = 1 - opacityDepth * 0.5;
  const depthB = opacityDepth / Math.max(1, Math.abs(depthScale));
  // Cull margin: half the logical glyph quad at scale 1
  const halfGlyph = fontSize * ATLAS_PAD * 0.5;

  _ensureCapacity(cols * rows);
  let count = 0;
  let zmin = Infinity;
  let zmax = -Infinity;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      let v = brightness[i];
      v = v < 0 ? 0 : v > 1 ? 1 : v;

      const ci = (v * clen) | 0;
      if (ci === 0) continue;

      const x0 = c * cw + cw * 0.5 - centerX;
      const y0 = r * ch + ch * 0.5 - centerY;
      let depthV = depthValues ? depthValues[i] : v;
      depthV = depthV < 0 ? 0 : depthV > 1 ? 1 : depthV;
      const z0 = (depthV - 0.5) * depthScale;

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

      const scale = p < scaleMin ? scaleMin : p > scaleMax ? scaleMax : p;
      const px = centerX + x3 * p;
      const py = centerY + y3 * p;

      const m = halfGlyph * scale;
      if (px + m < 0 || px - m > width || py + m < 0 || py - m > height) continue;

      let alpha = 1;
      if (fade > 0) {
        alpha *= 1 - fade * (1 - fadeField(c, r, time, ar));
      }
      if (opacityDepth > 0) {
        const depthAlpha = depthA - depthB * z2;
        alpha *= depthAlpha < 0 ? 0 : depthAlpha > 1 ? 1 : depthAlpha;
      }
      if (alpha < 0.02) continue;

      _gx[count] = px;
      _gy[count] = py;
      _gz[count] = z2;
      _gs[count] = scale;
      _ga[count] = alpha;
      _gci[count] = ci;
      _gsi[count] = i;
      if (z2 < zmin) zmin = z2;
      if (z2 > zmax) zmax = z2;
      count++;
    }
  }

  if (count === 0) return;

  // Depth order (far -> near) via counting sort over 256 z-buckets.
  const zscale = zmax > zmin ? 255 / (zmax - zmin) : 0;
  _counts.fill(0);
  for (let i = 0; i < count; i++) {
    const b = ((_gz[i] - zmin) * zscale) | 0;
    _gb[i] = b;
    _counts[b + 1]++;
  }
  for (let b = 1; b <= 256; b++) _counts[b] += _counts[b - 1];
  for (let i = 0; i < count; i++) _order[_counts[_gb[i]]++] = i;

  if (sourceColors) {
    const atlas = buildSourceAtlas(chars, sourceColors, _gci, _gsi, count, fontSize, _gai);
    const cell = atlas.cell;
    const baseSize = cell / ATLAS_SS;
    for (let k = 0; k < count; k++) {
      const i = _order[k];
      const size = baseSize * _gs[i];
      const ai = _gai[i];
      ctx.globalAlpha = _ga[i];
      ctx.drawImage(
        atlas.canvas,
        (ai % atlas.cols) * cell, ((ai / atlas.cols) | 0) * cell, cell, cell,
        _gx[i] - size * 0.5, _gy[i] - size * 0.5, size, size
      );
    }
    ctx.globalAlpha = 1;
    return;
  }

  // Draw pre-rendered glyph sprites — one drawImage per glyph, no text
  // shaping or per-glyph save/transform/restore.
  const atlas = _buildAtlas(chars, colorLUT, fontSize);
  const cell = atlas.cell;
  const baseSize = cell / ATLAS_SS;
  for (let k = 0; k < count; k++) {
    const i = _order[k];
    const size = baseSize * _gs[i];
    ctx.globalAlpha = _ga[i];
    ctx.drawImage(
      atlas.canvas,
      _gci[i] * cell, 0, cell, cell,
      _gx[i] - size * 0.5, _gy[i] - size * 0.5, size, size
    );
  }

  ctx.globalAlpha = 1;
}

// ─── renderLayer3D scratch buffers (module-level, reused across frames) ───
let _cap = 0;
let _gx = null, _gy = null, _gz = null, _gs = null, _ga = null;
let _gci = null, _gsi = null, _gai = null, _gb = null, _order = null;
const _counts = new Uint32Array(257);

function _ensureCapacity(n) {
  if (n <= _cap) return;
  _cap = n;
  _gx = new Float32Array(n);
  _gy = new Float32Array(n);
  _gz = new Float32Array(n);
  _gs = new Float32Array(n);
  _ga = new Float32Array(n);
  _gci = new Uint16Array(n);
  _gsi = new Uint32Array(n);
  _gai = new Uint32Array(n);
  _gb = new Uint8Array(n);
  _order = new Uint32Array(n);
}

// ─── Glyph atlas: one sprite per (char, LUT color), rebuilt per frame ───
export const ATLAS_SS = 2;    // supersample factor so upscaled glyphs stay crisp
export const ATLAS_PAD = 1.5; // cell size relative to fontSize (glyphs overhang the em box)
const _atlases = new Map(); // fontSize -> { canvas, ctx, cell } (one per active layer size)

export function buildAtlas(chars, colorLUT, fontSize) {
  let atlas = _atlases.get(fontSize);
  if (!atlas) {
    if (_atlases.size >= 8) _atlases.clear();
    const canvas = document.createElement('canvas');
    atlas = { canvas, ctx: canvas.getContext('2d'), cell: 0 };
    _atlases.set(fontSize, atlas);
  }
  const cell = Math.ceil(fontSize * ATLAS_SS * ATLAS_PAD);
  const w = cell * chars.length;
  const actx = atlas.ctx;
  if (atlas.canvas.width !== w || atlas.canvas.height !== cell) {
    atlas.canvas.width = w;
    atlas.canvas.height = cell;
  } else {
    actx.clearRect(0, 0, w, cell);
  }
  atlas.cell = cell;
  actx.font = `${fontSize * ATLAS_SS}px monospace`;
  actx.textAlign = 'center';
  actx.textBaseline = 'middle';
  for (let i = 1; i < chars.length; i++) {
    actx.fillStyle = colorLUT[i];
    actx.fillText(chars[i], i * cell + cell * 0.5, cell * 0.5);
  }
  return atlas;
}

const _sourceAtlases = new Map(); // fontSize -> reusable source-color atlas
const SOURCE_ATLAS_MAX_DIM = 8192;

export function buildSourceAtlas(chars, sourceColors, charIndices, sourceIndices, count, fontSize, atlasIndices) {
  let atlas = _sourceAtlases.get(fontSize);
  if (!atlas) {
    if (_sourceAtlases.size >= 8) _sourceAtlases.clear();
    const canvas = document.createElement('canvas');
    atlas = { canvas, ctx: canvas.getContext('2d'), cell: 0, cols: 1 };
    _sourceAtlases.set(fontSize, atlas);
  }

  const entries = [];
  const entryMap = new Map();
  for (let i = 0; i < count; i++) {
    const ci = charIndices[i];
    const si = sourceIndices[i];
    const colorKey = quantizedSourceColorKey(sourceColors, si);
    const key = ci * 65536 + colorKey;
    let ai = entryMap.get(key);
    if (ai === undefined) {
      ai = entries.length;
      entryMap.set(key, ai);
      entries.push({ ci, color: sourceColorFromKey(colorKey) });
    }
    atlasIndices[i] = ai;
  }

  const cell = Math.ceil(fontSize * ATLAS_SS * ATLAS_PAD);
  const cols = Math.max(1, Math.min(entries.length, Math.floor(SOURCE_ATLAS_MAX_DIM / cell)));
  const rows = Math.max(1, Math.ceil(entries.length / cols));
  const w = cols * cell;
  const h = rows * cell;
  const actx = atlas.ctx;

  if (atlas.canvas.width !== w || atlas.canvas.height !== h) {
    atlas.canvas.width = w;
    atlas.canvas.height = h;
  } else {
    actx.clearRect(0, 0, w, h);
  }

  atlas.cell = cell;
  atlas.cols = cols;
  actx.font = `${fontSize * ATLAS_SS}px monospace`;
  actx.textAlign = 'center';
  actx.textBaseline = 'middle';

  for (let i = 0; i < entries.length; i++) {
    const x = (i % cols) * cell + cell * 0.5;
    const y = ((i / cols) | 0) * cell + cell * 0.5;
    actx.fillStyle = entries[i].color;
    actx.fillText(chars[entries[i].ci], x, y);
  }

  return atlas;
}

// ─── Internal helper used by renderLayer3D ───
function _buildAtlas(chars, colorLUT, fontSize) {
  return buildAtlas(chars, colorLUT, fontSize);
}

function sourceColorAt(colors, i) {
  const p = i * 4;
  const a = colors[p + 3];
  if (a === 255) return `rgb(${colors[p]}, ${colors[p + 1]}, ${colors[p + 2]})`;
  return `rgba(${colors[p]}, ${colors[p + 1]}, ${colors[p + 2]}, ${a / 255})`;
}

function quantizedSourceColorKey(colors, i) {
  const p = i * 4;
  const r = colors[p] >> 4;
  const g = colors[p + 1] >> 4;
  const b = colors[p + 2] >> 4;
  const a = colors[p + 3] >> 4;
  return (r << 12) | (g << 8) | (b << 4) | a;
}

function sourceColorFromKey(key) {
  const r = ((key >> 12) & 15) * 17;
  const g = ((key >> 8) & 15) * 17;
  const b = ((key >> 4) & 15) * 17;
  const a = (key & 15) / 15;
  if (a >= 1) return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
  return `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${a})`;
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
