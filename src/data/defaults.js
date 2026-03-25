export const DEFAULTS = {
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
};
