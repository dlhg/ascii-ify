import { knownTarget, sceneTarget, baseTargets } from './targets.js';
import { validSource, sourceKey, THIS_TRACK } from './sources.js';

// Older presets offered globals which are overridden in layered scenes. Move
// those mappings to the visible layers; an existing explicit All layers route wins.
export function patchForScene(patch, ascii) {
  const explicit = new Set(patch.routes.filter(r => sceneTarget(ascii, r.target) === r.target).map(r => `${r.source}:${r.target}`));
  const routes = patch.routes.filter(r => sceneTarget(ascii, r.target) === r.target || !explicit.has(`${r.source}:${sceneTarget(ascii, r.target)}`))
    .map(r => ({ ...r, target: sceneTarget(ascii, r.target) }));
  const bases = {};
  for (const [target, value] of Object.entries(patch.bases || {})) {
    const mapped = sceneTarget(ascii, target);
    if (mapped !== target) for (const key of baseTargets(ascii, mapped)) bases[key] = value;
  }
  // Explicit layer resting values take priority over migrated global values.
  for (const [target, value] of Object.entries(patch.bases || {}))
    if (sceneTarget(ascii, target) === target) bases[target] = value;
  return { ...patch, routes, bases };
}

// Version 1 files only knew the device's own track and four levels.
const v1Sources = new Set(['rms', 'bass', 'mid', 'high']);
const migrateSource = source => (v1Sources.has(source) ? sourceKey.plugin(THIS_TRACK, source) : null);
const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
export function cleanPatch(patch, version = 2) {
  if (!patch || !Array.isArray(patch.routes) || patch.routes.length > 64 || !finite(patch.intensity, 0, 4)
      || typeof patch.enabled !== 'boolean') throw new Error('Invalid mapping settings.');
  const pairs = new Set();
  const routes = patch.routes.map(raw => {
    const r = raw && version === 1 ? { ...raw, source: migrateSource(raw.source) } : raw;
    if (!r || !validSource(r.source) || !knownTarget(r.target)
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
  if (!data || ![1, 2].includes(data.version) || !sceneIds.includes(data.scene) || !data.patches
      || typeof data.patches !== 'object' || Array.isArray(data.patches)) throw new Error('Not an ASCII Visuals mapping file.');
  const patches = {};
  for (const [id, patch] of Object.entries(data.patches)) {
    if (!sceneIds.includes(id)) throw new Error(`Unknown scene: ${id}`);
    patches[id] = cleanPatch(patch, data.version);
  }
  return { version: 2, scene: data.scene, patches };
}
// Scene presets (examples/audio-profiles.js) use the browser analyser's signal
// names. Map them onto this device's track; signals the plugin lacks are dropped.
const presetFeatures = { rms: 'rms', bass: 'bass', lowmid: 'mid', mid: 'mid', high: 'high', kick: 'kick', snare: 'snare', hat: 'hat', onset: 'kick' };
export function defaultRoutes(profile) {
  const seen = new Set();
  const routes = profile.flatMap(r => {
    const feature = presetFeatures[r.source];
    if (!feature) return [];
    const route = { ...r, source: sourceKey.plugin(THIS_TRACK, feature) };
    const pair = `${route.source}:${route.target}`;
    if (seen.has(pair)) return [];
    seen.add(pair);
    return [route];
  });
  return routes.length ? routes : [
    { target: 'scene.brightness', source: sourceKey.plugin(THIS_TRACK, 'rms'), depth: 0.2, smooth: 0.15 },
    { target: 'crtGlow', source: sourceKey.plugin(THIS_TRACK, 'bass'), depth: 0.3, smooth: 0.1 },
  ];
}
