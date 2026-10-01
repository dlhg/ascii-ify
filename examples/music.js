// ─── Music helpers for scenes driven by sceneParams ───────────
// Scene controls are continuous values (see ScenePopup `controls`). These turn
// them into what a scene usually wants from music: a smoothed level that
// rises fast and falls slowly, or a one-off event on each hit.

/** Follows a value with separate rise and fall times (seconds). Call each frame. */
export function envelope(rise = 0.05, fall = 0.25) {
  let y = null;
  return (x, dt) => {
    if (y === null) return (y = x);
    const tau = x > y ? rise : fall;
    y += (x - y) * (tau > 0 ? 1 - Math.exp(-dt / tau) : 1);
    return y;
  };
}

/**
 * Detects hits in a control fed by a hit signal (kick, snare, …), which jumps
 * on each hit and then fades. Returns the hit's strength (0..1+) on the frame
 * it fires, otherwise 0. A hit is the value crossing `threshold` after falling
 * back below half of it, or a sudden `jump` while it is still fading.
 */
export function hits({ threshold = 0.3, jump = 0.25, minGap = 0.07 } = {}) {
  let prev = 0, armed = true, since = 1;
  return (x, dt) => {
    since += dt;
    const rise = x - prev;
    prev = x;
    if (x < threshold * 0.5) armed = true;
    if (since > minGap && rise > 0 && ((armed && x > threshold) || rise > jump)) {
      armed = false;
      since = 0;
      return x;
    }
    return 0;
  };
}
