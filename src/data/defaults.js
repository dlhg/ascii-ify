export const DEFAULTS = {
  enabled: true,
  fontSize: 16,
  density: 1,
  charset: 'density',
  colorScheme: 'rainbow',
  background: '#08080c',
  fade: 0,
  speed: 1,
  pattern: null,
  patternMix: 0,
  colorCycle: false,
  colorCycleRate: 0.5,
  sourceOpacity: 0,
  opacity: 1,
  blendMode: 'replace',
  offsetX: 0,
  offsetY: 0,
  zIndex: 0,

  // Edge detection (per-layer)
  edgeDetect: false,
  edgeThreshold: 0.15,
  edgeCharset: 'box-light',

  // Masking (per-layer)
  maskLayer: null,
  invertMask: false,

  // CRT post-processing (global)
  crtEnabled: false,
  crtScanlines: 0.3,
  crtGlow: 0,
  crtDistortion: 0,
  crtFlicker: 0,
};

export const PARAM_RANGES = {
  fontSize: { min: 1, max: 48, step: 0.5 },
  density: { min: 1, max: 4, step: 0.25 },
  fade: { min: 0, max: 1, step: 0.01 },
  speed: { min: 0.1, max: 5, step: 0.1 },
  patternMix: { min: 0, max: 1, step: 0.01 },
  colorCycleRate: { min: 0.1, max: 4, step: 0.1 },
  sourceOpacity: { min: 0, max: 1, step: 0.01 },
  opacity: { min: 0, max: 1, step: 0.01 },
  offsetX: { min: -2000, max: 2000, step: 1 },
  offsetY: { min: -2000, max: 2000, step: 1 },
  zIndex: { min: -100, max: 100, step: 1 },

  // Edge detection
  edgeThreshold: { min: 0, max: 1, step: 0.01 },

  // CRT
  crtScanlines: { min: 0, max: 1, step: 0.01 },
  crtGlow: { min: 0, max: 1, step: 0.01 },
  crtDistortion: { min: 0, max: 0.5, step: 0.01 },
  crtFlicker: { min: 0, max: 0.3, step: 0.01 },
};
