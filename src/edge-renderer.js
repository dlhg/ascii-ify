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
 */
export function renderEdgeLayer(ctx, magnitude, direction, grid, colorLUT, edgeChars, fade, time) {
  const { cols, rows, cw, ch, ar } = grid;
  const lutMax = colorLUT.length - 1;

  ctx.textBaseline = 'top';

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
        ctx.globalAlpha = alpha;
      }

      // Pick character based on direction and neighbours
      const ch_ = pickEdgeChar(magnitude, direction, c, r, cols, rows, edgeChars);

      // Color from magnitude
      const ci = (mag * lutMax) | 0;
      ctx.fillStyle = colorLUT[ci];
      ctx.fillText(ch_, c * cw, py);
    }
  }

  ctx.globalAlpha = 1;
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
