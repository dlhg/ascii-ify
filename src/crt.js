/**
 * CRT post-processing effect applied to the final composited canvas.
 * Runs after all ASCII layers have been rendered.
 *
 * Sub-effects in order: glow → distortion → scanlines → flicker
 */
export class CRTEffect {
  constructor() {
    this._glowCanvas = null;
    this._glowCtx = null;
    this._distCanvas = null;
    this._distCtx = null;
  }

  /**
   * Apply CRT effects to the canvas.
   * @param {CanvasRenderingContext2D} ctx - the main overlay canvas context
   * @param {HTMLCanvasElement} canvas - the main overlay canvas element
   * @param {number} time - animation time
   * @param {{ scanlines: number, glow: number, distortion: number, flicker: number }} params
   */
  apply(ctx, canvas, time, params) {
    const pw = canvas.width;   // physical pixels
    const ph = canvas.height;

    if (params.glow > 0) this._applyGlow(ctx, canvas, pw, ph, params.glow);
    if (params.distortion > 0) this._applyDistortion(ctx, canvas, pw, ph, params.distortion);
    if (params.scanlines > 0) this._applyScanlines(ctx, pw, ph, params.scanlines);
    if (params.flicker > 0) this._applyFlicker(ctx, pw, ph, time, params.flicker);
  }

  /**
   * Phosphor glow / bloom — blur a copy and composite additively.
   */
  _applyGlow(ctx, canvas, pw, ph, intensity) {
    if (!this._glowCanvas) {
      this._glowCanvas = document.createElement('canvas');
      this._glowCtx = this._glowCanvas.getContext('2d');
    }

    // Work at half resolution for performance
    const gw = (pw / 2) | 0;
    const gh = (ph / 2) | 0;
    if (this._glowCanvas.width !== gw || this._glowCanvas.height !== gh) {
      this._glowCanvas.width = gw;
      this._glowCanvas.height = gh;
    }

    const gCtx = this._glowCtx;

    // Downscale source
    gCtx.clearRect(0, 0, gw, gh);
    gCtx.drawImage(canvas, 0, 0, gw, gh);

    // Blur
    const blurPx = Math.max(2, intensity * 12) | 0;
    gCtx.filter = `blur(${blurPx}px)`;
    gCtx.drawImage(this._glowCanvas, 0, 0);
    gCtx.filter = 'none';

    // Composite back — work in physical pixel space
    ctx.save();
    ctx.resetTransform();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = intensity * 0.6;
    ctx.drawImage(this._glowCanvas, 0, 0, pw, ph);
    ctx.restore();
  }

  /**
   * Barrel distortion — warp pixels radially from center.
   */
  _applyDistortion(ctx, canvas, pw, ph, strength) {
    // Work at reduced resolution for performance
    const scale = 0.5;
    const dw = (pw * scale) | 0;
    const dh = (ph * scale) | 0;

    if (!this._distCanvas) {
      this._distCanvas = document.createElement('canvas');
      this._distCtx = this._distCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (this._distCanvas.width !== dw || this._distCanvas.height !== dh) {
      this._distCanvas.width = dw;
      this._distCanvas.height = dh;
    }

    const dCtx = this._distCtx;

    // Downscale
    dCtx.clearRect(0, 0, dw, dh);
    dCtx.drawImage(canvas, 0, 0, dw, dh);

    const src = dCtx.getImageData(0, 0, dw, dh);
    const dst = dCtx.createImageData(dw, dh);
    const sd = src.data;
    const dd = dst.data;

    const cx = dw / 2;
    const cy = dh / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy);
    const k = strength * 2;

    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        // Normalise to [-1, 1]
        const nx = (x - cx) / maxR;
        const ny = (y - cy) / maxR;
        const r = Math.sqrt(nx * nx + ny * ny);

        // Barrel: undistort to find source coordinate
        const rDist = r * (1 + k * r * r);
        const sx = (nx / (r || 1)) * rDist * maxR + cx;
        const sy = (ny / (r || 1)) * rDist * maxR + cy;

        const di = (y * dw + x) * 4;

        // Nearest-neighbour sample
        const sxi = Math.round(sx);
        const syi = Math.round(sy);
        if (sxi >= 0 && sxi < dw && syi >= 0 && syi < dh) {
          const si = (syi * dw + sxi) * 4;
          dd[di] = sd[si];
          dd[di + 1] = sd[si + 1];
          dd[di + 2] = sd[si + 2];
          dd[di + 3] = sd[si + 3];
        }
      }
    }

    dCtx.putImageData(dst, 0, 0);

    // Draw back to main canvas
    ctx.save();
    ctx.resetTransform();
    ctx.clearRect(0, 0, pw, ph);
    ctx.drawImage(this._distCanvas, 0, 0, pw, ph);
    ctx.restore();
  }

  /**
   * Scanlines — semi-transparent dark horizontal bars.
   */
  _applyScanlines(ctx, pw, ph, intensity) {
    ctx.save();
    ctx.resetTransform();
    ctx.globalCompositeOperation = 'multiply';

    const lineSpacing = 3;
    const alpha = intensity * 0.5;
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;

    for (let y = 0; y < ph; y += lineSpacing) {
      ctx.fillRect(0, y, pw, 1);
    }

    ctx.restore();
  }

  /**
   * Flicker — deterministic brightness variation per frame.
   * Uses sine waves instead of Math.random() for reproducible output.
   */
  _applyFlicker(ctx, pw, ph, time, intensity) {
    const flick = (Math.sin(time * 47.3) * 0.5 + Math.sin(time * 73.1) * 0.5) * 0.5 + 0.5;
    const alpha = intensity * flick;
    if (alpha < 0.005) return;

    ctx.save();
    ctx.resetTransform();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, pw, ph);
    ctx.restore();
  }

  destroy() {
    this._glowCanvas = null;
    this._glowCtx = null;
    this._distCanvas = null;
    this._distCtx = null;
  }
}
