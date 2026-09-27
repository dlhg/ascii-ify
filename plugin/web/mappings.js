import { knownTarget } from './targets.js';

export const INPUTS = [
  { id: 'rms', name: 'Loudness' }, { id: 'bass', name: 'Bass' },
  { id: 'mid', name: 'Mids' }, { id: 'high', name: 'Highs' },
];
const sourceIds = new Set(INPUTS.map(s => s.id));
const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
export function cleanPatch(patch) {
  if (!patch || !Array.isArray(patch.routes) || patch.routes.length > 64 || !finite(patch.intensity, 0, 4)
      || typeof patch.enabled !== 'boolean') throw new Error('Invalid mapping settings.');
  const pairs = new Set();
  const routes = patch.routes.map(r => {
    if (!r || !sourceIds.has(r.source) || !knownTarget(r.target)
        || !finite(r.depth, -1, 1) || !finite(r.smooth, 0, 3)
        || !['linear', 'exp', 'log'].includes(r.curve)
        || typeof r.enabled !== 'boolean' || typeof r.bipolar !== 'boolean')
      throw new Error('A mapping contains an unsupported signal, parameter, or value.');
    const pair = `${r.source}:${r.target}`;
    if (pairs.has(pair)) throw new Error('Duplicate signal-to-parameter mappings.');
    pairs.add(pair);
    return { source: r.source, target: r.target, depth: r.depth, smooth: r.smooth,
      curve: r.curve, enabled: r.enabled, bipolar: r.bipolar };
  });
  const bases = {};
  for (const [key, value] of Object.entries(patch.bases || {})) {
    if (!knownTarget(key) || !finite(value, -10000, 10000)) throw new Error('Invalid resting value.');
    bases[key] = value;
  }
  return { intensity: patch.intensity, enabled: patch.enabled, bases, routes };
}
export function cleanSetup(data, sceneIds) {
  if (!data || data.version !== 1 || !sceneIds.includes(data.scene) || !data.patches
      || typeof data.patches !== 'object' || Array.isArray(data.patches)) throw new Error('Not an ASCII Visuals mapping file.');
  const patches = {};
  for (const [id, patch] of Object.entries(data.patches)) {
    if (!sceneIds.includes(id)) throw new Error(`Unknown scene: ${id}`);
    patches[id] = cleanPatch(patch);
  }
  return { version: 1, scene: data.scene, patches };
}
export function defaultRoutes(profile) {
  const routes = profile.filter(r => sourceIds.has(r.source));
  return routes.length ? routes : [
    { target: 'scene.brightness', source: 'rms', depth: 0.2, smooth: 0.15 },
    { target: 'crtGlow', source: 'bass', depth: 0.3, smooth: 0.1 },
  ];
}
