/**
 * Sobel edge detection at grid resolution.
 * Returns per-cell edge magnitude (0-1) and direction (radians).
 *
 * @param {HTMLCanvasElement} source - the canvas to analyse
 * @param {number} cols - grid columns
 * @param {number} rows - grid rows
 * @param {CanvasRenderingContext2D} [offCtx] - reusable offscreen context
 * @param {number} threshold - magnitude below this is zeroed (0-1)
 * @returns {{ magnitude: Float32Array, direction: Float32Array, ctx: CanvasRenderingContext2D }}
 */
export function detectEdges(source, cols, rows, offCtx, threshold) {
  if (cols <= 0 || rows <= 0) {
    return { magnitude: new Float32Array(0), direction: new Float32Array(0), ctx: offCtx };
  }

  if (!offCtx) {
    const c = document.createElement('canvas');
    offCtx = c.getContext('2d', { willReadFrequently: true });
  }

  const c = offCtx.canvas;
  if (c.width !== cols || c.height !== rows) {
    c.width = cols;
    c.height = rows;
  }

  // Hardware-accelerated downscale
  offCtx.drawImage(source, 0, 0, cols, rows);
  const imageData = offCtx.getImageData(0, 0, cols, rows);
  const pixels = imageData.data;

  // Build grayscale buffer
  const len = cols * rows;
  const gray = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const idx = i * 4;
    gray[i] = (pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114) / 255;
  }

  // Sobel kernels
  const magnitude = new Float32Array(len);
  const direction = new Float32Array(len);
  let maxMag = 0;

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      // Sample 3x3 neighbourhood (zero-pad borders)
      const tl = (r > 0 && col > 0) ? gray[(r - 1) * cols + col - 1] : 0;
      const tc = (r > 0) ? gray[(r - 1) * cols + col] : 0;
      const tr = (r > 0 && col < cols - 1) ? gray[(r - 1) * cols + col + 1] : 0;
      const ml = (col > 0) ? gray[r * cols + col - 1] : 0;
      const mr = (col < cols - 1) ? gray[r * cols + col + 1] : 0;
      const bl = (r < rows - 1 && col > 0) ? gray[(r + 1) * cols + col - 1] : 0;
      const bc = (r < rows - 1) ? gray[(r + 1) * cols + col] : 0;
      const br = (r < rows - 1 && col < cols - 1) ? gray[(r + 1) * cols + col + 1] : 0;

      // Gx = [-1 0 1; -2 0 2; -1 0 1]
      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      // Gy = [-1 -2 -1; 0 0 0; 1 2 1]
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;

      const mag = Math.sqrt(gx * gx + gy * gy);
      magnitude[r * cols + col] = mag;
      direction[r * cols + col] = Math.atan2(gy, gx);

      if (mag > maxMag) maxMag = mag;
    }
  }

  // Normalize magnitude to 0-1 and apply threshold
  if (maxMag > 0) {
    const invMax = 1 / maxMag;
    for (let i = 0; i < len; i++) {
      magnitude[i] *= invMax;
      if (magnitude[i] < threshold) magnitude[i] = 0;
    }
  }

  return { magnitude, direction, ctx: offCtx };
}
