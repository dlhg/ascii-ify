/**
 * Sample a source canvas into a brightness buffer at grid resolution.
 * Uses hardware-accelerated drawImage to downsample, then reads pixels.
 *
 * @param {HTMLCanvasElement} source - the canvas to sample
 * @param {number} cols - grid columns
 * @param {number} rows - grid rows
 * @param {CanvasRenderingContext2D} [offCtx] - optional reusable offscreen context
 * @returns {{ brightness: Float32Array, ctx: CanvasRenderingContext2D }}
 */
export function sampleCanvas(source, cols, rows, offCtx) {
  if (cols <= 0 || rows <= 0) {
    return { brightness: new Float32Array(0), ctx: offCtx };
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

  // Hardware-accelerated downscale — one pixel per ASCII cell
  offCtx.drawImage(source, 0, 0, cols, rows);
  const imageData = offCtx.getImageData(0, 0, cols, rows);
  const pixels = imageData.data;
  const len = cols * rows;
  const brightness = new Float32Array(len);

  for (let i = 0; i < len; i++) {
    const idx = i * 4;
    // YUV luminance
    brightness[i] = (pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114) / 255;
  }

  return { brightness, ctx: offCtx };
}
