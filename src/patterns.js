// (col, row, time, cols, rows, aspectRatio) → 0..1
export const PATTERNS = [
  {
    name: 'plasma',
    fn(x, y, t, w, h, ar) {
      const sy = y * ar;
      const cx = w / 2, cy = (h * ar) / 2;
      let v = Math.sin(x * 0.04 + t);
      v += Math.sin(sy * 0.03 + t * 1.3);
      v += Math.sin((x + sy) * 0.025 + t * 0.7);
      v += Math.sin(Math.sqrt((x - cx) ** 2 + (sy - cy) ** 2) * 0.04 + t * 1.1);
      return (v + 4) / 8;
    },
  },
  {
    name: 'spiral',
    fn(x, y, t, w, h, ar) {
      const dx = x - w / 2, dy = y * ar - (h * ar) / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      return (Math.sin(angle * 3 + dist * 0.12 - t * 2) + 1) / 2;
    },
  },
  {
    name: 'tunnel',
    fn(x, y, t, w, h, ar) {
      const dx = x - w / 2, dy = y * ar - (h * ar) / 2;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.5);
      const angle = Math.atan2(dy, dx);
      return (Math.sin(30 / dist + angle * 2 + t * 3) + 1) / 2;
    },
  },
  {
    name: 'waves',
    fn(x, y, t, w, h, ar) {
      const sy = y * ar;
      const pts = [
        [w * 0.2, h * ar * 0.3],
        [w * 0.8, h * ar * 0.3],
        [w * 0.5, h * ar * 0.8],
      ];
      let v = 0;
      for (const [px, py] of pts) {
        v += Math.sin(Math.sqrt((x - px) ** 2 + (sy - py) ** 2) * 0.2 - t * 3);
      }
      return (v / 3 + 1) / 2;
    },
  },
  {
    name: 'kaleidoscope',
    fn(x, y, t, w, h, ar) {
      const dx = Math.abs(x - w / 2);
      const dy = Math.abs(y * ar - (h * ar) / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const seg = Math.PI / 6;
      const a = ((Math.atan2(dy, dx) % seg) + seg) % seg;
      const nx = Math.cos(a) * dist, ny = Math.sin(a) * dist;
      let v = Math.sin(nx * 0.08 + t) * Math.cos(ny * 0.08 + t * 0.7);
      v += Math.sin(dist * 0.06 - t * 1.5);
      return (v + 2) / 4;
    },
  },
  {
    name: 'diamond',
    fn(x, y, t, w, h, ar) {
      const d = Math.abs(x - w / 2) + Math.abs(y * ar - (h * ar) / 2);
      return (Math.sin(d * 0.1 - t * 2) + Math.sin(d * 0.06 + t) + 2) / 4;
    },
  },
  {
    name: 'moiré',
    fn(x, y, t, w, h, ar) {
      const sy = y * ar;
      const a = Math.sin(x * 0.1 + t * 0.5) + Math.sin(sy * 0.1);
      const b = Math.sin((x * Math.cos(t * 0.3) + sy * Math.sin(t * 0.3)) * 0.1);
      const c = Math.sin((x * Math.cos(t * 0.3 + 2) + sy * Math.sin(t * 0.3 + 2)) * 0.08);
      return (a + b + c + 3) / 6;
    },
  },
  {
    name: 'breathing',
    fn(x, y, t, w, h, ar) {
      const dx = x - w / 2, dy = y * ar - (h * ar) / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const pulse = Math.sin(t * 1.2) * 8 + 20;
      const wobble = Math.sin(angle * 5 + t * 2) * 3;
      const ring = Math.exp(-((dist - pulse - wobble) ** 2) / 60);
      const bg = (Math.sin(x * 0.1 + t * 0.5) * Math.sin(y * ar * 0.08 + t * 0.3) + 1) * 0.08;
      return Math.min(1, ring + bg);
    },
  },
];
