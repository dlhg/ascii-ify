# ascii-ify Roadmap

## Current (v0.1)

- Canvas input adapter
- Layered compositing with per-layer font size, charset, color scheme
- 8 procedural pattern overlays
- 7 color schemes, 5 charsets
- Optional shadow DOM control panel
- Static parameters (direct get/set)

## Planned

### Input Adapters
- **DOM adapter** — `AsciiIfy.fromDOM(element)` — rasterize DOM elements via `html2canvas` or OffscreenCanvas
- **WebGL / Three.js adapter** — `AsciiIfy.fromWebGL(renderer)` — hook into WebGL render pipeline as post-processing pass
- **MediaStream adapter** — `AsciiIfy.fromStream(stream)` — accept any MediaStream (screen capture, video element, etc.)

### Modulation System (v0.2)
- LFO engine — sine, triangle, square, saw, sample-and-hold waveforms
- Audio analyzer — microphone/file input, frequency band extraction, envelope following
- Modulation matrix — route LFOs and audio bands to any parameter with configurable depth
- Visual mod routing in control panel (patch points)

### Custom Presets
- User-defined color schemes via `(brightness, time) => [h, s, l]`
- User-defined patterns via `(col, row, time, cols, rows, ar) => 0-1`
- User-defined charsets beyond string input

### Rendering Backends
- WebGL renderer for higher performance at large grid sizes
- WebGPU renderer (experimental)

### Developer Experience
- TypeScript type definitions
- Framework bindings (React hook, Vue composable, Svelte action)
- Preset library / sharing
