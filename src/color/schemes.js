// Each fn returns [h, s, l] for blending
export const COLOR_SCHEMES = [
  {
    name: 'rainbow',
    fn: (v, t) => [(v * 360 + t * 40) % 360, 85, 35 + v * 40],
  },
  {
    name: 'neon',
    fn: (v, t) => {
      const hue = [300, 180, 60][Math.floor(v * 2.99)] + Math.sin(t) * 20;
      return [hue, 100, 40 + v * 30];
    },
  },
  {
    name: 'fire',
    fn: (v, t) => [v * 60 + Math.sin(t) * 10, 80 + v * 20, 15 + v * 55],
  },
  {
    name: 'ocean',
    fn: (v, t) => [180 + v * 60 + Math.sin(t * 0.5) * 20, 75, 20 + v * 50],
  },
  {
    name: 'acid',
    fn: (v, t) => [80 + v * 80 + Math.sin(t * 2) * 30, 100, 25 + v * 45],
  },
  {
    name: 'vapor',
    fn: (v, t) => [260 + v * 100 + t * 25, 80, 35 + v * 40],
  },
  {
    name: 'mono',
    fn: (v) => [0, 0, v * 85],
  },
];
