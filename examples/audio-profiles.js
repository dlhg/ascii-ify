// ─── Per-Scene Audio Profiles ─────────────────────────────────
// Sensible starting routes for each scene, as data (see audio-reactivity.js).
// A profile = a KIND (shared behaviour for a family of scenes) plus optional
// per-scene tweaks. Nothing here touches scene code: these all act on the
// ASCII layer and the scene's image filter. Reactions inside a scene (fireworks
// on a kick, etc.) live in that scene's own file.
//
// Route shorthand: [target, source, depth, options?]
//   depth is a fraction of the target's span; negative inverts.

const r = (target, source, depth, o = {}) => ({ target, source, depth, ...o });
const S = 'scene.';

// Each kind says what "reacting" means for that family.
const KINDS = {
  // Dark, ambient, drifting: swell with loudness, shimmer with highs, breathe slowly.
  ambient: () => [
    r(S + 'brightness', 'rms', 0.3, { smooth: 0.15 }),
    r(S + 'brightness', 'kick', 0.15, { smooth: 0.06 }),
    r(S + 'saturate', 'high', 0.5, { smooth: 0.1 }),
    r(S + 'hue', 'centroid', 0.35, { smooth: 1.2, bipolar: true }),
    r(S + 'speed', 'bass', 0.12, { smooth: 0.4 }),
    r('crtGlow', 'rms', 0.25, { smooth: 0.15 }),
    r('crtGlow', 'kick', 0.25, { smooth: 0.08 }),
  ],
  // Bright, procedural, flowing: motion and colour more than brightness.
  flow: () => [
    r(S + 'brightness', 'rms', 0.18, { smooth: 0.15 }),
    r(S + 'contrast', 'mid', 0.25, { smooth: 0.1 }),
    r(S + 'hue', 'centroid', 0.5, { smooth: 1.0, bipolar: true }),
    r(S + 'speed', 'bass', 0.25, { smooth: 0.4 }),
    r('patternMix', 'mid', 0.2, { smooth: 0.15, when: 'pattern' }),
    r('colorCycleRate', 'centroid', 0.3, { smooth: 0.6, when: 'colorCycle' }),
    r('crtGlow', 'kick', 0.3, { smooth: 0.08 }),
  ],
  // Geometry and 3D: depth and rotation follow the low end, edges tighten with volume.
  geometry: () => [
    r(S + 'brightness', 'kick', 0.2, { smooth: 0.06 }),
    r(S + 'brightness', 'rms', 0.12, { smooth: 0.15 }),
    r(S + 'contrast', 'snare', 0.15, { smooth: 0.08 }),
    r(S + 'saturate', 'high', 0.35, { smooth: 0.1 }),
    r('crtGlow', 'kick', 0.4, { smooth: 0.08 }),
    r('crtGlow', 'rms', 0.2, { smooth: 0.15 }),
    r('depthScale', 'bass', 0.08, { smooth: 0.15, when: '3d' }),
    r('rotationY', 'lowmid', 0.02, { smooth: 0.6, when: '3d' }),
  ],
  // Things that flash, burst or glow: hits carry it.
  impact: () => [
    r(S + 'brightness', 'kick', 0.3, { smooth: 0.05 }),
    r(S + 'brightness', 'rms', 0.1, { smooth: 0.2 }),
    r(S + 'contrast', 'snare', 0.2, { smooth: 0.08 }),
    r(S + 'saturate', 'high', 0.3, { smooth: 0.1 }),
    r('crtGlow', 'kick', 0.45, { smooth: 0.08 }),
    r('crtGlow', 'rms', 0.15, { smooth: 0.15 }),
  ],
  // Games and toys: never touch their clock; keep it subtle so play stays readable.
  gentle: () => [
    r(S + 'brightness', 'rms', 0.12, { smooth: 0.2 }),
    r(S + 'saturate', 'high', 0.3, { smooth: 0.15 }),
    r('crtGlow', 'kick', 0.2, { smooth: 0.1 }),
    r('crtGlow', 'rms', 0.15, { smooth: 0.2 }),
  ],
};

// Scenes that draw outlines: louder sound tightens the edge threshold (more lines).
const EDGE_ROUTE = r('edgeThreshold', 'rms', -0.1, { smooth: 0.2, when: 'edge' });

// scene file name → kind (+ tweaks)
//   add:    extra routes         drop: targets to remove (all routes to them)
//   scale:  { target: factor } multiplies depths for that target
const SCENES = {
  // ambient
  galaxy: { kind: 'ambient' }, 'galaxy-2': { kind: 'ambient' }, 'galaxy-3': { kind: 'ambient' }, 'galaxy-4': { kind: 'ambient' },
  constellations: { kind: 'ambient' }, starfield: { kind: 'ambient', scale: { [S + 'speed']: 2 } },
  bioluminescent: { kind: 'ambient', scale: { [S + 'brightness']: 1.3 } }, aquarium: { kind: 'ambient' },
  'coral-reef': { kind: 'ambient' }, mycelium: { kind: 'ambient' }, 'cherry-blossoms': { kind: 'ambient' },
  'neural-ignition': { kind: 'ambient', add: [r(S + 'brightness', 'onset', 0.2, { smooth: 0.05 })] },
  landscape: { kind: 'ambient', drop: [S + 'speed'] },
  // flow
  'plasma-vortex': { kind: 'flow' }, 'plasma-bloom': { kind: 'flow' }, fluid: { kind: 'flow' },
  'reaction-diffusion': { kind: 'flow' }, tidal: { kind: 'flow' }, 'ripple-tank': { kind: 'flow' },
  ridgeline: { kind: 'flow' }, spotlight: { kind: 'flow' }, 'text-reveal': { kind: 'flow' },
  'text-portal': { kind: 'flow' }, idle2: { kind: 'flow' }, 'audio-reactive': null,
  // geometry
  'cube-rain': { kind: 'geometry' }, 'cube-trace': { kind: 'geometry' }, hypercube: { kind: 'geometry' },
  'impossible-cube': { kind: 'geometry' }, 'depth-map': { kind: 'geometry' }, dashboard: { kind: 'geometry' },
  maze: { kind: 'geometry', drop: [S + 'contrast'] }, 'circuit-board': { kind: 'geometry' },
  xray: { kind: 'geometry' }, cityscape: { kind: 'geometry', add: [r(S + 'speed', 'bass', 0.1, { smooth: 0.5 })] },
  // impact
  fireworks: { kind: 'impact', scale: { [S + 'brightness']: 1.3 } },
  lightning: { kind: 'impact', scale: { [S + 'brightness']: 1.6, crtGlow: 1.2 } },
  rainstorm: { kind: 'impact' }, campfire: { kind: 'impact', add: [r(S + 'speed', 'bass', 0.1, { smooth: 0.5 })] },
  'city-night': { kind: 'impact' }, subway: { kind: 'impact' }, 'sim-city': { kind: 'impact' },
  pachinko: { kind: 'impact' }, asteroids: { kind: 'impact' },
  // gentle (games / toys)
  snake: { kind: 'gentle' }, flappy: { kind: 'gentle' }, life: { kind: 'gentle' }, chess: { kind: 'gentle' },
  pendulum: { kind: 'gentle' }, 'art-studio': { kind: 'gentle' }, 'particle-painter': { kind: 'gentle' },
  playground: { kind: 'gentle' },
};

/** Current name of the running scene, from its file name (e.g. 'fireworks'). */
export function sceneName() {
  return (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
}

/** Which optional conditions this scene meets (drives `when` on routes). */
function traits(ascii) {
  return {
    pattern: !!ascii.get('pattern') && ascii.get('patternMix') > 0,
    colorCycle: !!ascii.get('colorCycle'),
    '3d': ascii.get('renderMode') === '3d',
    edge: !!ascii.get('edgeDetect'),
  };
}

/** Routes for a scene: its profile, filtered to what the scene actually has. */
export function profileFor(name, ascii) {
  const entry = SCENES[name];
  if (entry === null) return [];                       // scene handles its own reactivity
  const spec = entry || { kind: 'ambient' };           // unknown scenes: a safe, pretty default
  const has = traits(ascii);

  let routes = KINDS[spec.kind]();
  if (has.edge) routes.push(EDGE_ROUTE);
  if (spec.add) routes.push(...spec.add);
  if (spec.drop) routes = routes.filter((x) => !spec.drop.includes(x.target));
  if (spec.scale) {
    routes = routes.map((x) => (spec.scale[x.target] ? { ...x, depth: x.depth * spec.scale[x.target] } : x));
  }
  return routes
    .filter((x) => !x.when || has[x.when])
    .map(({ when, ...rest }) => rest);
}

export function sceneKind(name) {
  const entry = SCENES[name];
  return entry === null ? 'custom' : (entry?.kind ?? 'ambient');
}
