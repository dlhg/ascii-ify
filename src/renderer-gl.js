import { ATLAS_SS, ATLAS_PAD } from './renderer.js';

/**
 * WebGL instanced glyph renderer for the 3D paths.
 *
 * Glyphs are drawn as textured quads in a single instanced draw call per
 * layer, sorted far-to-near so alpha blending composites correctly. The
 * atlas texture holds *white* glyphs; color and alpha come from per-instance
 * attributes, so the atlas is static per (charset, fontSize) and source
 * colors are used at full precision (no quantization).
 *
 * The result is rendered into a shared WebGL canvas which the caller blits
 * into its 2D context, so layer compositing (blend modes, masks, CRT)
 * stays in Canvas2D unchanged.
 */

const MAX_ATLAS_DIM = 4096;

const VERT_SRC = `
attribute vec2 aQuad;
attribute vec3 aPos;
attribute float aSlot;
attribute vec4 aColor;
uniform vec2 uRes;
uniform vec2 uGrid;
uniform float uInset;
varying vec2 vUV;
varying vec4 vColor;
void main() {
  vec2 p = aPos.xy + (aQuad - 0.5) * aPos.z;
  vec2 clip = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  float col = mod(aSlot, uGrid.x);
  float row = floor((aSlot + 0.5) / uGrid.x);
  vec2 q = aQuad * (1.0 - 2.0 * uInset) + uInset;
  vUV = vec2((col + q.x) / uGrid.x, (row + q.y) / uGrid.y);
  vColor = aColor;
}
`;

const FRAG_SRC = `
precision mediump float;
uniform sampler2D uAtlas;
varying vec2 vUV;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(uAtlas, vUV);
  gl_FragColor = t * vec4(vColor.rgb * vColor.a, vColor.a);
}
`;

const INSTANCE_STRIDE = 20; // px, py, size, slot (f32) + rgba (u8x4)

class GlyphGLRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1;
    this.canvas.height = 1;
    this.ok = false;
    this._atlases = new Map(); // `${fontSize}:${chars}` -> { tex, cols, rows, cell }
    this._instanceCap = 0;
    this._instanceBuf = null;
    this._f32 = null;
    this._u8 = null;
    this._lutCache = { lut: null, r: null, g: null, b: null };

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.ok = false;
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      try {
        this._init();
      } catch {
        this.ok = false;
      }
    });

    this._init();
  }

  _init() {
    const opts = {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    };
    let gl = this.canvas.getContext('webgl2', opts);
    let instExt = null;
    if (!gl) {
      gl = this.canvas.getContext('webgl', opts);
      if (gl) instExt = gl.getExtension('ANGLE_instanced_arrays');
      if (!instExt) gl = null;
    }
    if (!gl) throw new Error('WebGL unavailable');

    this.gl = gl;
    this._instExt = instExt; // null => WebGL2 core instancing
    this._maxTex = Math.min(MAX_ATLAS_DIM, gl.getParameter(gl.MAX_TEXTURE_SIZE));

    const program = gl.createProgram();
    gl.attachShader(program, this._compile(gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(program, this._compile(gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Shader link failed: ' + gl.getProgramInfoLog(program));
    }
    this._program = program;
    this._loc = {
      aQuad: gl.getAttribLocation(program, 'aQuad'),
      aPos: gl.getAttribLocation(program, 'aPos'),
      aSlot: gl.getAttribLocation(program, 'aSlot'),
      aColor: gl.getAttribLocation(program, 'aColor'),
      uRes: gl.getUniformLocation(program, 'uRes'),
      uGrid: gl.getUniformLocation(program, 'uGrid'),
      uInset: gl.getUniformLocation(program, 'uInset'),
      uAtlas: gl.getUniformLocation(program, 'uAtlas'),
    };

    // Static unit quad (triangle strip)
    this._quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

    this._instBuf = gl.createBuffer();

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Textures don't survive context loss — rebuild lazily
    this._atlases.clear();
    this.ok = true;
  }

  _compile(type, src) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  _getAtlas(chars, fontSize) {
    const key = `${fontSize}:${chars}`;
    let atlas = this._atlases.get(key);
    if (atlas) return atlas;

    if (this._atlases.size >= 8) {
      for (const a of this._atlases.values()) this.gl.deleteTexture(a.tex);
      this._atlases.clear();
    }

    const gl = this.gl;
    const cell = Math.ceil(fontSize * ATLAS_SS * ATLAS_PAD);
    const cols = Math.max(1, Math.min(chars.length, Math.floor(this._maxTex / cell)));
    const rows = Math.max(1, Math.ceil(chars.length / cols));

    // Draw white glyphs; per-instance color multiplies in the shader
    const c = document.createElement('canvas');
    c.width = cols * cell;
    c.height = rows * cell;
    const cctx = c.getContext('2d');
    cctx.font = `${fontSize * ATLAS_SS}px monospace`;
    cctx.textAlign = 'center';
    cctx.textBaseline = 'middle';
    cctx.fillStyle = '#fff';
    for (let i = 1; i < chars.length; i++) {
      cctx.fillText(chars[i], (i % cols) * cell + cell * 0.5, ((i / cols) | 0) * cell + cell * 0.5);
    }

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    atlas = { tex, cols, rows, cell };
    this._atlases.set(key, atlas);
    return atlas;
  }

  _ensureInstances(count) {
    if (count <= this._instanceCap) return;
    this._instanceCap = Math.max(count, this._instanceCap * 2, 4096);
    this._instanceBuf = new ArrayBuffer(this._instanceCap * INSTANCE_STRIDE);
    this._f32 = new Float32Array(this._instanceBuf);
    this._u8 = new Uint8Array(this._instanceBuf);
  }

  _lutRGB(colorLUT) {
    const cache = this._lutCache;
    if (cache.lut === colorLUT) return cache;
    const n = colorLUT.length;
    if (!cache.r || cache.r.length < n) {
      cache.r = new Uint8Array(n);
      cache.g = new Uint8Array(n);
      cache.b = new Uint8Array(n);
    }
    for (let i = 0; i < n; i++) {
      // buildColorLUT emits "hsl(H S% L%)"
      const parts = colorLUT[i].slice(4, -1).split(' ');
      const [r, g, b] = hslToRgb(parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]));
      cache.r[i] = r;
      cache.g[i] = g;
      cache.b[i] = b;
    }
    cache.lut = colorLUT;
    return cache;
  }

  /**
   * Render one sorted glyph batch and blit it into the target 2D context.
   * @returns {boolean} false if WebGL is unavailable (caller should fall back)
   */
  draw(ctx2d, w, h, params) {
    if (!this.ok || this.gl.isContextLost()) return false;
    const gl = this.gl;
    const { chars, fontSize, count, order, x, y, scale, alpha, charIndex, colorIndex, colorLUT, sourceColors, sourceIndex } = params;

    const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1;
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }

    const atlas = this._getAtlas(chars, fontSize);
    const baseSize = atlas.cell / ATLAS_SS;
    const lut = sourceColors ? null : this._lutRGB(colorLUT);

    // Fill instance data in depth order (far -> near)
    this._ensureInstances(count);
    const f32 = this._f32;
    const u8 = this._u8;
    for (let k = 0; k < count; k++) {
      const i = order[k];
      const fo = k * 5; // 5 floats of stride, last one aliased by u8 color
      const bo = k * INSTANCE_STRIDE + 16;
      f32[fo] = x[i];
      f32[fo + 1] = y[i];
      f32[fo + 2] = baseSize * scale[i];
      f32[fo + 3] = charIndex[i];
      if (sourceColors) {
        const p = sourceIndex[i] * 4;
        u8[bo] = sourceColors[p];
        u8[bo + 1] = sourceColors[p + 1];
        u8[bo + 2] = sourceColors[p + 2];
        u8[bo + 3] = (sourceColors[p + 3] * alpha[i]) | 0;
      } else {
        const ci = colorIndex ? colorIndex[i] : charIndex[i];
        u8[bo] = lut.r[ci];
        u8[bo + 1] = lut.g[ci];
        u8[bo + 2] = lut.b[ci];
        u8[bo + 3] = (255 * alpha[i]) | 0;
      }
    }

    gl.viewport(0, 0, pw, ph);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this._program);
    gl.uniform2f(this._loc.uRes, w, h);
    gl.uniform2f(this._loc.uGrid, atlas.cols, atlas.rows);
    gl.uniform1f(this._loc.uInset, 0.5 / atlas.cell);
    gl.uniform1i(this._loc.uAtlas, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlas.tex);

    const loc = this._loc;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf);
    gl.enableVertexAttribArray(loc.aQuad);
    gl.vertexAttribPointer(loc.aQuad, 2, gl.FLOAT, false, 0, 0);
    this._divisor(loc.aQuad, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this._u8.subarray(0, count * INSTANCE_STRIDE), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, INSTANCE_STRIDE, 0);
    this._divisor(loc.aPos, 1);
    gl.enableVertexAttribArray(loc.aSlot);
    gl.vertexAttribPointer(loc.aSlot, 1, gl.FLOAT, false, INSTANCE_STRIDE, 12);
    this._divisor(loc.aSlot, 1);
    gl.enableVertexAttribArray(loc.aColor);
    gl.vertexAttribPointer(loc.aColor, 4, gl.UNSIGNED_BYTE, true, INSTANCE_STRIDE, 16);
    this._divisor(loc.aColor, 1);

    if (this._instExt) {
      this._instExt.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, 4, count);
    } else {
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    }

    // Blit into the layer's 2D context (GPU-to-GPU on modern browsers)
    ctx2d.drawImage(this.canvas, 0, 0, w, h);
    return true;
  }

  _divisor(loc, n) {
    if (this._instExt) this._instExt.vertexAttribDivisorANGLE(loc, n);
    else this.gl.vertexAttribDivisor(loc, n);
  }
}

let _renderer;
function _getRenderer() {
  // Escape hatch: force the Canvas2D path (debugging / A-B comparison)
  if (typeof globalThis !== 'undefined' && globalThis.ASCIIIFY_DISABLE_WEBGL) return null;
  if (_renderer === undefined) {
    try {
      _renderer = typeof document !== 'undefined' ? new GlyphGLRenderer() : null;
    } catch {
      _renderer = null;
    }
  }
  return _renderer;
}

/**
 * Cheap availability probe so callers can skip building instance arrays
 * when the WebGL path can't run.
 */
export function glyphBatchAvailable() {
  const r = _getRenderer();
  return !!(r && r.ok && !r.gl.isContextLost());
}

/**
 * Draw a sorted glyph batch via WebGL into the given 2D context.
 *
 * @param {CanvasRenderingContext2D} ctx2d - target context (layer offscreen)
 * @param {number} w - logical width
 * @param {number} h - logical height
 * @param {object} params - { chars, fontSize, count, order, x, y, scale,
 *   alpha, charIndex, colorIndex, colorLUT, sourceColors, sourceIndex }
 * @returns {boolean} true if drawn; false means caller must use the
 *   Canvas2D fallback path
 */
export function drawGlyphBatch(ctx2d, w, h, params) {
  const r = _getRenderer();
  if (!r) return false;
  try {
    return r.draw(ctx2d, w, h, params);
  } catch {
    return false;
  }
}

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const xv = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = xv; }
  else if (hp < 2) { r = xv; g = c; }
  else if (hp < 3) { g = c; b = xv; }
  else if (hp < 4) { g = xv; b = c; }
  else if (hp < 5) { r = xv; b = c; }
  else { r = c; b = xv; }
  const m = l - c / 2;
  return [((r + m) * 255) | 0, ((g + m) * 255) | 0, ((b + m) * 255) | 0];
}
