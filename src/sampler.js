/**
 * Sample a source canvas into a brightness buffer at grid resolution.
 * Uses hardware-accelerated drawImage to downsample, then reads pixels.
 *
 * @param {HTMLCanvasElement} source - the canvas to sample
 * @param {number} cols - grid columns
 * @param {number} rows - grid rows
 * @param {CanvasRenderingContext2D} [offCtx] - optional reusable offscreen context
 * @param {Float32Array} [buf] - optional reusable brightness buffer
 * @param {Uint8ClampedArray} [colorBuf] - optional reusable RGBA buffer
 * @returns {{ brightness: Float32Array, colors?: Uint8ClampedArray, ctx: CanvasRenderingContext2D }}
 */
export function sampleCanvas(source, cols, rows, offCtx, buf, colorBuf) {
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
  const brightness = (buf && buf.length === len) ? buf : new Float32Array(len);
  let colors = null;

  if (colorBuf !== undefined) {
    colors = colorBuf && colorBuf.length === pixels.length ? colorBuf : new Uint8ClampedArray(pixels.length);
    colors.set(pixels);
  }

  for (let i = 0; i < len; i++) {
    const idx = i * 4;
    // YUV luminance
    brightness[i] = (pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114) / 255;
  }

  return { brightness, colors, ctx: offCtx };
}

/**
 * Box-downsample a brightness buffer to a coarser grid.
 * Each destination cell averages the source cells it covers, so layers at
 * different font sizes can share a single getImageData readback per frame.
 *
 * @param {Float32Array} src - source brightness, length = sw * sh
 * @param {number} sw - source columns
 * @param {number} sh - source rows
 * @param {Float32Array} dst - destination brightness, length = dw * dh
 * @param {number} dw - destination columns
 * @param {number} dh - destination rows
 */
export function downsampleBrightness(src, sw, sh, dst, dw, dh) {
  for (let r = 0; r < dh; r++) {
    const y0 = (r * sh / dh) | 0;
    let y1 = ((r + 1) * sh / dh) | 0;
    if (y1 <= y0) y1 = y0 + 1;
    for (let c = 0; c < dw; c++) {
      const x0 = (c * sw / dw) | 0;
      let x1 = ((c + 1) * sw / dw) | 0;
      if (x1 <= x0) x1 = x0 + 1;
      let sum = 0;
      for (let y = y0; y < y1; y++) {
        const off = y * sw;
        for (let x = x0; x < x1; x++) sum += src[off + x];
      }
      dst[r * dw + c] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
}

/**
 * Box-downsample an RGBA buffer to a coarser grid (per-channel average).
 *
 * @param {Uint8ClampedArray} src - source RGBA, length = sw * sh * 4
 * @param {number} sw - source columns
 * @param {number} sh - source rows
 * @param {Uint8ClampedArray} dst - destination RGBA, length = dw * dh * 4
 * @param {number} dw - destination columns
 * @param {number} dh - destination rows
 */
export function downsampleColors(src, sw, sh, dst, dw, dh) {
  for (let r = 0; r < dh; r++) {
    const y0 = (r * sh / dh) | 0;
    let y1 = ((r + 1) * sh / dh) | 0;
    if (y1 <= y0) y1 = y0 + 1;
    for (let c = 0; c < dw; c++) {
      const x0 = (c * sw / dw) | 0;
      let x1 = ((c + 1) * sw / dw) | 0;
      if (x1 <= x0) x1 = x0 + 1;
      let sr = 0, sg = 0, sb = 0, sa = 0;
      for (let y = y0; y < y1; y++) {
        const off = (y * sw + x0) * 4;
        for (let x = 0, p = off; x < x1 - x0; x++, p += 4) {
          sr += src[p];
          sg += src[p + 1];
          sb += src[p + 2];
          sa += src[p + 3];
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const d = (r * dw + c) * 4;
      dst[d] = sr / n;
      dst[d + 1] = sg / n;
      dst[d + 2] = sb / n;
      dst[d + 3] = sa / n;
    }
  }
}
