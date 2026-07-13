import { buildAtlas, buildSourceAtlas, ATLAS_SS, ATLAS_PAD } from './renderer.js';
import { drawGlyphBatch, glyphBatchAvailable } from './renderer-gl.js';

/**
 * Render edge-detected ASCII characters onto a canvas context.
 * Uses edge direction to select box-drawing / directional characters
 * and magnitude for color intensity.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Float32Array} magnitude - edge magnitude [0-1], length = cols * rows
 * @param {Float32Array} direction - edge direction in radians, length = cols * rows
 * @param {{ cols: number, rows: number, cw: number, ch: number, ar: number }} grid
 * @param {string[]} colorLUT - color strings indexed 0-255
 * @param {object} edgeChars - { h, v, dr, dl, ur, ul, cross, diagR, diagL }
 * @param {number} fade - 0-1 spatial opacity fade amount
 * @param {number} time - current animation time
 * @param {Uint8ClampedArray} [sourceColors] - optional per-cell source RGBA values
 */
export function renderEdgeLayer(ctx, magnitude, direction, grid, colorLUT, edgeChars, fade, time, sourceColors = null) {
  const { cols, rows, cw, ch, ar } = grid;
  const lutMax = colorLUT ? colorLUT.length - 1 : 255;

  // Fast path: batch every glyph into one instanced WebGL draw call
  if (glyphBatchAvailable()) {
    const fontSize = parseFloat(ctx.font) || 12;
    const adv = grid.adv ?? cw;
    const { charMap, charsStr } = buildEdgeCharMap(edgeChars);

    _ensureCapacity3D(cols * rows);
    let count = 0;
    for (let r = 0; r < rows; r++) {
      const py = r * ch + fontSize * 0.5;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const mag = magnitude[i];
        if (mag < 0.02) continue;

        let alpha = 1;
        if (fade > 0) {
          alpha = 1 - fade * (1 - fadeField(c, r, time, ar));
          if (alpha < 0.02) continue;
        }

        const ch_ = pickEdgeChar(magnitude, direction, c, r, cols, rows, edgeChars);
        _gx3d[count] = c * cw + adv * 0.5;
        _gy3d[count] = py;
        _gs3d[count] = 1;
        _ga3d[count] = alpha;
        _gci3d[count] = charMap[ch_];
        _gsi3d[count] = i;
        _gco3d[count] = (mag * lutMax) | 0;
        _order3d[count] = count;
        count++;
      }
    }
    if (count === 0) return;
    const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1;
    if (drawGlyphBatch(ctx, ctx.canvas.width / dpr, ctx.canvas.height / dpr, {
      chars: charsStr, fontSize, count, order: _order3d,
      x: _gx3d, y: _gy3d, scale: _gs3d, alpha: _ga3d,
      charIndex: _gci3d, colorIndex: colorLUT ? _gco3d : null, colorLUT,
      sourceColors, sourceIndex: _gsi3d,
    })) return;
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Only touch canvas state when the quantized value actually changes
  let lastAlpha = 1;
  let lastStyle = null;

  for (let r = 0; r < rows; r++) {
    const py = r * ch;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const mag = magnitude[i];
      if (mag < 0.02) continue;

      // Spatial fade field
      if (fade > 0) {
        const alpha = 1 - fade * (1 - fadeField(c, r, time, ar));
        if (alpha < 0.02) continue;
        const qa = ((alpha * 64) | 0) / 64;
        if (qa !== lastAlpha) {
          ctx.globalAlpha = qa;
          lastAlpha = qa;
        }
      }

      // Pick character based on direction and neighbours
      const ch_ = pickEdgeChar(magnitude, direction, c, r, cols, rows, edgeChars);

      // Color from magnitude
      const ci = (mag * lutMax) | 0;
      const style = sourceColors ? sourceColorAt(sourceColors, i) : colorLUT[ci];
      if (style !== lastStyle) {
        ctx.fillStyle = style;
        lastStyle = style;
      }
      ctx.fillText(ch_, c * cw, py);
    }
  }

  ctx.globalAlpha = 1;
}

/**
 * Render edge-detected ASCII characters with 3D projection.
 *
 * @param {CanvasRenderingContext2D} ctx - target canvas context
 * @param {Float32Array} magnitude - edge magnitude [0-1], length = cols * rows
 * @param {Float32Array} direction - edge direction in radians, length = cols * rows
 * @param {{ cols: number, rows: number, cw: number, ch: number, ar: number }} grid
 * @param {string[]} colorLUT - color strings indexed by character index
 * @param {object} edgeChars - { h, v, dr, dl, ur, ul, cross, diagR, diagL }
 * @param {number} fade - 0-1 spatial opacity fade amount
 * @param {number} time - current animation time
 * @param {object} opts - projection options
 * @param {Uint8ClampedArray} [sourceColors] - optional per-cell source RGBA values
 */
export function renderEdgeLayer3D(ctx, magnitude, direction, grid, colorLUT, edgeChars, fade, time, opts = {}, sourceColors = null) {
  const { cols, rows, cw, ch, ar } = grid;
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

  const depthA = 1 - opacityDepth * 0.5;
  const depthB = opacityDepth / Math.max(1, Math.abs(depthScale));
  const halfGlyph = fontSize * ATLAS_PAD * 0.5;

  // Create char index mapping and char string for atlas
  const { charMap, charsStr } = buildEdgeCharMap(edgeChars);

  _ensureCapacity3D(cols * rows);
  let count = 0;
  let zmin = Infinity;
  let zmax = -Infinity;

  // Pass 1: Pick characters and project to 3D
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const mag = magnitude[i];
      if (mag < 0.02) continue;

      // Pick edge character
      const ch_ = pickEdgeChar(magnitude, direction, c, r, cols, rows, edgeChars);
      const ci = charMap[ch_];

      // Color from magnitude
      const colorIdx = colorLUT ? (mag * (colorLUT.length - 1)) | 0 : 0;

      const x0 = c * cw + cw * 0.5 - centerX;
      const y0 = r * ch + ch * 0.5 - centerY;
      let depthMag = depthValues ? depthValues[i] : mag;
      depthMag = depthMag < 0 ? 0 : depthMag > 1 ? 1 : depthMag;
      const z0 = (depthMag - 0.5) * depthScale;

      // Rotate X, then Y, then Z
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

      _gx3d[count] = px;
      _gy3d[count] = py;
      _gz3d[count] = z2;
      _gs3d[count] = scale;
      _ga3d[count] = alpha;
      _gci3d[count] = ci;
      _gsi3d[count] = i;
      _gco3d[count] = colorIdx;
      if (z2 < zmin) zmin = z2;
      if (z2 > zmax) zmax = z2;
      count++;
    }
  }

  if (count === 0) return;

  // Depth sort
  const zscale = zmax > zmin ? 255 / (zmax - zmin) : 0;
  _counts.fill(0);
  for (let i = 0; i < count; i++) {
    const b = ((_gz3d[i] - zmin) * zscale) | 0;
    _gb3d[i] = b;
    _counts[b + 1]++;
  }
  for (let b = 1; b <= 256; b++) _counts[b] += _counts[b - 1];
  for (let i = 0; i < count; i++) _order3d[_counts[_gb3d[i]]++] = i;

  // Fast path: one instanced WebGL draw call for the whole batch.
  // Colors by edge magnitude (matching the 2D edge path) via colorIndex.
  if (drawGlyphBatch(ctx, width, height, {
    chars: charsStr, fontSize, count, order: _order3d,
    x: _gx3d, y: _gy3d, scale: _gs3d, alpha: _ga3d,
    charIndex: _gci3d, colorIndex: colorLUT ? _gco3d : null, colorLUT,
    sourceColors, sourceIndex: _gsi3d,
  })) return;

  let lastAlpha = -1;

  if (sourceColors) {
    const atlas = buildSourceAtlas(charsStr, sourceColors, _gci3d, _gsi3d, count, fontSize, _gai3d);
    const cell = atlas.cell;
    const baseSize = cell / ATLAS_SS;
    for (let k = 0; k < count; k++) {
      const i = _order3d[k];
      const size = baseSize * _gs3d[i];
      const ai = _gai3d[i];
      const qa = ((_ga3d[i] * 64) | 0) / 64;
      if (qa !== lastAlpha) {
        ctx.globalAlpha = qa;
        lastAlpha = qa;
      }
      ctx.drawImage(
        atlas.canvas,
        (ai % atlas.cols) * cell, ((ai / atlas.cols) | 0) * cell, cell, cell,
        _gx3d[i] - size * 0.5, _gy3d[i] - size * 0.5, size, size
      );
    }
    ctx.globalAlpha = 1;
    return;
  }

  // Build atlas with edge characters
  const atlas = buildAtlas(charsStr, colorLUT, fontSize);
  const cell = atlas.cell;
  const baseSize = cell / ATLAS_SS;

  for (let k = 0; k < count; k++) {
    const i = _order3d[k];
    const size = baseSize * _gs3d[i];
    const qa = ((_ga3d[i] * 64) | 0) / 64;
    if (qa !== lastAlpha) {
      ctx.globalAlpha = qa;
      lastAlpha = qa;
    }
    ctx.drawImage(
      atlas.canvas,
      _gci3d[i] * cell, 0, cell, cell,
      _gx3d[i] - size * 0.5, _gy3d[i] - size * 0.5, size, size
    );
  }

  ctx.globalAlpha = 1;
}

// ─── renderEdgeLayer3D scratch buffers ───
let _cap3d = 0;
let _gx3d = null, _gy3d = null, _gz3d = null, _gs3d = null, _ga3d = null;
let _gci3d = null, _gsi3d = null, _gai3d = null, _gco3d = null, _gb3d = null, _order3d = null;
const _counts = new Uint32Array(257);

function _ensureCapacity3D(n) {
  if (n <= _cap3d) return;
  _cap3d = n;
  _gx3d = new Float32Array(n);
  _gy3d = new Float32Array(n);
  _gz3d = new Float32Array(n);
  _gs3d = new Float32Array(n);
  _ga3d = new Float32Array(n);
  _gci3d = new Uint16Array(n);
  _gsi3d = new Uint32Array(n);
  _gai3d = new Uint32Array(n);
  _gco3d = new Uint16Array(n);
  _gb3d = new Uint8Array(n);
  _order3d = new Uint32Array(n);
}

function sourceColorAt(colors, i) {
  const p = i * 4;
  const a = colors[p + 3];
  if (a === 255) return `rgb(${colors[p]}, ${colors[p + 1]}, ${colors[p + 2]})`;
  return `rgba(${colors[p]}, ${colors[p + 1]}, ${colors[p + 2]}, ${a / 255})`;
}

/** Map edge characters to atlas indices (index 0 is reserved/blank). */
function buildEdgeCharMap(edgeChars) {
  const charMap = {};
  const charArray = ['\0'];
  for (const ch of Object.values(edgeChars)) {
    if (!charMap[ch]) {
      charMap[ch] = charArray.length;
      charArray.push(ch);
    }
  }
  return { charMap, charsStr: charArray.join('') };
}

/**
 * Select an edge character based on direction at (c, r) and neighbouring edges.
 * Checks for corners/junctions where two perpendicular edges meet.
 */
function pickEdgeChar(magnitude, direction, c, r, cols, rows, chars) {
  const dir = quantizeDirection(direction[r * cols + c]);

  // Check neighbours for junction detection
  const hasUp = r > 0 && magnitude[(r - 1) * cols + c] > 0.02;
  const hasDown = r < rows - 1 && magnitude[(r + 1) * cols + c] > 0.02;
  const hasLeft = c > 0 && magnitude[r * cols + c - 1] > 0.02;
  const hasRight = c < cols - 1 && magnitude[r * cols + c + 1] > 0.02;

  const vNeighbours = (hasUp ? 1 : 0) + (hasDown ? 1 : 0);
  const hNeighbours = (hasLeft ? 1 : 0) + (hasRight ? 1 : 0);

  // 4-way cross
  if (vNeighbours >= 1 && hNeighbours >= 1 && hasUp && hasDown && hasLeft && hasRight) {
    return chars.cross;
  }

  // Corners — two perpendicular neighbours meeting
  if (hasDown && hasRight && !hasUp && !hasLeft) return chars.dr;
  if (hasDown && hasLeft && !hasUp && !hasRight) return chars.dl;
  if (hasUp && hasRight && !hasDown && !hasLeft) return chars.ur;
  if (hasUp && hasLeft && !hasDown && !hasRight) return chars.ul;

  // Default: direction-based
  // dir: 0 = horizontal, 1 = diagR, 2 = vertical, 3 = diagL
  switch (dir) {
    case 0: return chars.h;
    case 1: return chars.diagR;
    case 2: return chars.v;
    case 3: return chars.diagL;
    default: return chars.h;
  }
}

/**
 * Quantize angle (radians) into 4 direction bins.
 * Note: Sobel direction is perpendicular to the edge, so we rotate 90deg
 * to get the edge's orientation.
 *
 * Returns: 0=horizontal, 1=diagR (╱), 2=vertical, 3=diagL (╲)
 */
function quantizeDirection(angle) {
  // Rotate 90deg to get edge orientation (Sobel gives gradient direction)
  let deg = ((angle * 180 / Math.PI) + 90 + 180) % 180;

  // 4 bins centred on 0, 45, 90, 135
  if (deg < 22.5 || deg >= 157.5) return 0;  // horizontal
  if (deg < 67.5) return 1;                    // diagonal /
  if (deg < 112.5) return 2;                   // vertical
  return 3;                                     // diagonal \
}

/**
 * Spatial opacity variation using 3 sine waves.
 * (Duplicated from renderer.js to keep modules independent.)
 */
function fadeField(x, y, t, ar) {
  const sy = y * ar;
  let v = Math.sin(x * 0.06 - t * 0.8);
  v += Math.sin(sy * 0.05 + t * 1.1);
  v += Math.sin((x + sy) * 0.04 - t * 0.5);
  return (v + 3) / 6;
}
