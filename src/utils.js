export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpHue(a, b, t) {
  let d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return ((a + d * t) % 360 + 360) % 360;
}

export function h(tag, cls, content) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (typeof content === 'string') el.textContent = content;
  else if (content instanceof Node) el.appendChild(content);
  else if (Array.isArray(content)) content.forEach(c => { if (c) el.appendChild(c); });
  return el;
}
