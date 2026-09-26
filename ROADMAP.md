# ascii-ify Roadmap

## Current (v0.0.x)

- Canvas input adapter
- Layered compositing with per-layer font size, charset, color scheme, offsets, z-order
- Layer masking (normal + inverted), solo/hide
- 8 procedural pattern overlays
- 8 color schemes + source-color mode, 5 charsets
- Sobel edge detection with 4 line-drawing glyph sets
- Lightweight 3D projection mode (depth from brightness, rotation, perspective, depth smoothing)
- CRT post-processing (scanlines, glow, barrel distortion, flicker)
- Parameter automation — sine, triangle, noise, and mouse X/Y / scroll input
- Font-size crossfade smoothing
- Instanced WebGL glyph renderer with Canvas2D fallback
- Optional shadow DOM control panel with pop-out window and JSON snapshot copy/paste

## Planned

### Input Adapters
- **DOM adapter** — `AsciiIfy.fromDOM(element)` — rasterize DOM elements via `html2canvas` or OffscreenCanvas
- **WebGL / Three.js adapter** — `AsciiIfy.fromWebGL(renderer)` — hook into WebGL render pipeline as post-processing pass
- **MediaStream adapter** — `AsciiIfy.fromStream(stream)` — accept any MediaStream (screen capture, video element, etc.)

### Modulation System
- ~~Sine / triangle / noise LFOs~~ (done)
- ~~Mouse and scroll input sources~~ (done)
- Square, saw, sample-and-hold waveforms
- Audio analyzer — microphone/file input, frequency band extraction, envelope following
- Modulation matrix — route multiple sources to one parameter with configurable depth
- Visual mod routing in control panel (patch points)

### Custom Presets
- First-class registration API (today: push onto the exported `COLOR_SCHEMES` / `PATTERNS` / `CHARSETS` arrays)
- User-defined charsets beyond string input (e.g. weighted / multi-codepoint glyphs)

### Rendering Backends
- ~~WebGL glyph renderer~~ (done, instanced)
- Full-GPU pipeline (sampling + mapping in shaders) for very large grids
- WebGPU renderer (experimental)

### Developer Experience
- TypeScript type definitions
- Unit tests for sampler, automation, and layer compositing
- Framework bindings (React hook, Vue composable, Svelte action)
- Preset library / sharing
