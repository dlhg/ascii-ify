// Optional same-origin host for bundled galleries. Standalone examples keep
// their normal microphone/file controls and keyboard behavior.
export function embeddedHost() {
  if (!new URLSearchParams(location.search).has('plugin') || window.parent === window) return null;
  try {
    const host = window.parent.asciiIfyHost;
    return host?.version === 1 ? host : null;
  } catch { return null; }
}

// Scenes with intrinsic audio reactions run their idle animation in the gallery.
// All live-audio modulation is then controlled by the host's editable mappings.
export const idleAudio = {
  connected: false,
  value: () => 0,
  on: () => () => {},
  levels: { rms: 0, bass: 0, lowmid: 0, mid: 0, high: 0, centroid: 0.5, kick: 0, snare: 0, hat: 0, onset: 0 },
};
