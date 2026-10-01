import { TARGETS, listTargets as globalTargets, targetInfo as globalInfo, targetActive as globalActive } from '../../examples/audio-reactivity.js';

const layerProperties = {
  fontSize: 'Glyph size', fontSizeSmoothing: 'Glyph size smoothing', density: 'Glyph spacing',
  fade: 'Fade', patternMix: 'Pattern mix', edgeThreshold: 'Edge threshold',
  opacity: 'Opacity', offsetX: 'Horizontal offset', offsetY: 'Vertical offset', zIndex: 'Stack order',
};
const layerKeys = Object.keys(layerProperties);
// These globals are replaced by each layer's own value when layers are present.
const overriddenGlobals = new Set(['fontSize', 'density', 'patternMix', 'edgeThreshold']);
export function sceneTarget(ascii, id) {
  return ascii.layers.length && overriddenGlobals.has(id) ? `layer.all.${id}` : id;
}
export function layerTarget(id) {
  const match = /^layer\.(all|\d{1,2})\.([a-zA-Z]+)$/.exec(id);
  return match && Object.hasOwn(layerProperties, match[2])
    ? { index: match[1] === 'all' ? 'all' : Number(match[1]), key: match[2] } : null;
}
// Scene-specific controls (`scene.<key>`) are declared by each scene, so saved
// patches only check their shape; a scene without that control skips the route.
const sceneControl = id => /^scene\.[a-zA-Z]\w{0,31}$/.test(id);
export const knownTarget = id => typeof id === 'string' && (Object.hasOwn(TARGETS, id) || !!layerTarget(id) || sceneControl(id));
export function targetInfo(id, scene) {
  const layer = layerTarget(id);
  return layer ? { ...globalInfo(layer.key), label: layerProperties[layer.key], group: layer.index === 'all' ? 'All layers' : `Layer ${layer.index + 1}`, key: layer.key } : globalInfo(id, scene);
}
export function numericValue(ascii, owner, key) {
  return owner?.get(key) ?? (key === 'fade' && owner ? ascii.get(key) : undefined);
}
export function baseTargets(ascii, id) {
  const layer = layerTarget(id);
  if (layer?.index !== 'all') return [id];
  return ascii.layers.flatMap((owner, index) => typeof numericValue(ascii, owner, layer.key) === 'number' ? [`layer.${index}.${layer.key}`] : []);
}
export function destinations(ascii, id) {
  return baseTargets(ascii, id).map(target => {
    const layer = layerTarget(target);
    return layer ? { owner: ascii.layers[layer.index], key: layer.key } : { owner: ascii, key: target };
  }).filter(d => d.owner);
}
export function destination(ascii, id) {
  return destinations(ascii, id)[0] || { owner: undefined, key: layerTarget(id)?.key ?? id };
}
export function listTargets(ascii, scene) {
  const all = layerKeys.map(key => `layer.all.${key}`).filter(id => baseTargets(ascii, id).length);
  return [...globalTargets(ascii, scene).filter(id => sceneTarget(ascii, id) === id), ...all, ...ascii.layers.flatMap((layer, index) =>
    layerKeys.filter(key => typeof numericValue(ascii, layer, key) === 'number').map(key => `layer.${index}.${key}`))];
}
export function targetHint(id, ascii) {
  const layer = layerTarget(id), list = destinations(ascii, id);
  const inactive = list.filter(({ owner, key }) => !globalActive(key, owner)).length;
  if (inactive) return `Enable ${globalInfo(list[0].key).needs} in Appearance${layer?.index === 'all' ? ` on ${inactive} layer(s)` : ''} to use this parameter.`;
  if (layer?.index === 'all') return 'Moves every layer from its own resting value. Enter a resting value to set them all alike. Individual mappings add to this.';
  return '';
}
// Keep logical mappings separate even when All layers and Layer 1 use the same
// signal. The engine sums their routes, and removing one must retain the other.
// `useSource(id)` is told about every source a route reads, so the scene frame can
// register it as an engine signal (sources such as Live tracks appear at runtime).
export function routingEngine(ascii, useSource = () => {}) {
  const routes = new Map();
  let applied = [];
  let layers = ascii.layers;
  function rebuild() {
    for (const { owner, key, source } of applied) owner.unroute(key, source);
    applied = [];
    for (const { id, route } of routes.values()) {
      for (const { owner, key } of destinations(ascii, id)) {
        owner.route(key, route);
        applied.push({ owner, key, source: route.source });
      }
    }
    layers = ascii.layers;
  }
  return {
    get: id => { const { owner, key } = destination(ascii, id); return numericValue(ascii, owner, key); },
    set: (...args) => ascii.set(...args),
    route(id, route) {
      useSource(route.source.replace(/^audio:/, ''));
      routes.set(`${id}:${route.source}`, { id, route }); rebuild();
    },
    unroute(id, source) { if (routes.delete(`${id}:${source}`)) rebuild(); },
    syncLayers() {
      const current = ascii.layers;
      if (current.length === layers.length && current.every((layer, i) => layer === layers[i])) return false;
      rebuild(); return true;
    },
  };
}
