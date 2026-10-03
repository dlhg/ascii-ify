// ─── Shared GPU Shader Scenes for Examples ────────────────────
// Raymarched scenes render a full-screen fragment shader at low resolution
// (the ASCII grid is coarser still) and draw the result into the source
// canvas, where ascii-ify reads it like any other frame.

/** GLSL shared by every shader scene; prepended to each fragment shader. */
export const GLSL_COMMON = `
  precision highp float;
  uniform vec2 uRes;
  uniform float uTime;
  const float PI = 3.14159265;
  const float TAU = 6.2831853;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float hash(vec2 p) { return hash(vec3(p, 0.71)); }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
                   mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                   mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
    return s;
  }
  float fbm3(vec3 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
    return s / 0.875;
  }
  mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

  // Ray through this pixel for a camera at ro looking at ta.
  vec3 cameraRay(vec3 ro, vec3 ta, float focal) {
    vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
    vec3 fw = normalize(ta - ro);
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    return normalize(fw * focal + rt * uv.x + up * uv.y);
  }

  // Filmic exposure, gamma and a soft vignette. ASCII reads brightness as
  // glyph density, so scenes run hot: dark backgrounds, bright subjects.
  vec3 finish(vec3 col, float exposure, float gamma) {
    col = vec3(1.0) - exp(-max(col, 0.0) * exposure);
    col = pow(col, vec3(gamma));
    vec2 q = gl_FragCoord.xy / uRes;
    return col * (0.35 + 0.65 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.2));
  }
`;

const VERT = 'attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }';

/**
 * Compiles a full-screen fragment shader. `draw(ctx, w, h, time, setUniforms)`
 * renders it at `scale` of the screen (capped at `maxWidth`) and stretches it
 * over the source canvas; `setUniforms(set)` receives typed setters.
 */
export function shaderScene(fragment, { scale = 0.5, maxWidth = 760 } = {}) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, GLSL_COMMON + fragment));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const locs = new Map();
  const loc = (name) => {
    if (!locs.has(name)) locs.set(name, gl.getUniformLocation(prog, name));
    return locs.get(name);
  };
  const set = {
    f: (name, x) => gl.uniform1f(loc(name), x),
    v2: (name, v) => gl.uniform2fv(loc(name), v),
    v3: (name, v) => gl.uniform3fv(loc(name), v),
    v4: (name, v) => gl.uniform4fv(loc(name), v),
    m3: (name, m) => gl.uniformMatrix3fv(loc(name), false, m),
  };

  return {
    canvas,
    draw(ctx, w, h, time, setUniforms) {
      const s = Math.min(scale, maxWidth / w);
      const rw = Math.max(64, Math.round(w * s)), rh = Math.max(36, Math.round(h * s));
      if (canvas.width !== rw || canvas.height !== rh) {
        canvas.width = rw;
        canvas.height = rh;
      }
      gl.viewport(0, 0, rw, rh);
      set.v2('uRes', [rw, rh]);
      set.f('uTime', time);
      setUniforms(set);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Plain bilinear: ascii-ify resamples this straight back down to the
      // glyph grid, so a 'high' quality upscale only costs GPU time.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'low';
      ctx.drawImage(canvas, 0, 0, w, h);
    },
  };
}

/**
 * Drag to orbit, scroll to zoom. Returns live offsets { yaw, pitch, zoom }
 * that a scene adds to its own camera path.
 */
export function orbitControls({ pitch = [-0.2, 0.9], zoom = [-4, 8], zoomRate = 0.004 } = {}) {
  const state = { yaw: 0, pitch: 0, zoom: 0 };
  const container = document.querySelector('.container');
  let last = null;
  window.addEventListener('pointerdown', (e) => {
    if (!(e.target instanceof HTMLCanvasElement)) return;
    last = { x: e.clientX, y: e.clientY };
    container?.classList.add('dragging');
  });
  window.addEventListener('pointermove', (e) => {
    if (!last) return;
    state.yaw -= (e.clientX - last.x) * 0.005;
    state.pitch = Math.min(pitch[1], Math.max(pitch[0], state.pitch + (e.clientY - last.y) * 0.003));
    last = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointerup', () => {
    last = null;
    container?.classList.remove('dragging');
  });
  window.addEventListener('wheel', (e) => {
    state.zoom = Math.min(zoom[1], Math.max(zoom[0], state.zoom + e.deltaY * zoomRate));
  }, { passive: true });
  return state;
}

// ── 3x3 rotations, column-major as GLSL wants them ──────────────
export const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, s, 0, -s, c]; };
export const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 1, 0, s, 0, c]; };
export const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, -s, c, 0, 0, 0, 1]; };

export function mul3(a, b) {
  const out = new Array(9);
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) out[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2];
  }
  return out;
}

export const apply3 = (m, v) => [0, 1, 2].map(r => m[r] * v[0] + m[3 + r] * v[1] + m[6 + r] * v[2]);

/** Camera position orbiting `target` at yaw/pitch/distance. */
export function orbitCamera(target, yaw, pitch, dist) {
  return [
    target[0] + dist * Math.cos(pitch) * Math.sin(yaw),
    target[1] + dist * Math.sin(pitch),
    target[2] + dist * Math.cos(pitch) * Math.cos(yaw),
  ];
}

/** The ASCII look shader scenes start from: fine glyphs coloured by the scene itself. */
export const SHADER_ASCII = {
  fontSize: 8,
  density: 1,
  charset: ' .·:;+*oO%@█',
  colorScheme: 'source',
  sourceOpacity: 0,
  fade: 0,
};
