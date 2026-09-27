# ascii-ify

> **Early development** — API may change.

ASCII-ify any canvas. Drop-in library that overlays real-time ASCII art rendering on top of your canvas-based web application. Supports layered compositing, procedural pattern overlays, and an optional visual control panel.

For audio-reactive visuals from Ableton, see the [macOS VST3 prototype](plugin/README.md).

## Install

```bash
npm install ascii-ify
```

## Quick Start

```js
import { AsciiIfy } from 'ascii-ify';

const ascii = new AsciiIfy(myCanvas, {
  fontSize: 12,
  charset: 'density',
  colorScheme: 'rainbow',
});

// Option A: Manual render (call from your existing render loop)
function gameLoop() {
  drawMyGame();
  ascii.render();
  requestAnimationFrame(gameLoop);
}

// Option B: Auto render (library owns the rAF loop)
ascii.start();
```

The library creates an overlay canvas on top of your source canvas, samples the source at ASCII grid resolution, and renders colored characters.

### 3D Projection

Set `renderMode: '3d'` to project the ASCII grid into a lightweight 3D space. Brightness controls each character's z-position, then the grid is rotated, perspective-projected, depth-sorted, and drawn back onto the overlay canvas.

```js
const ascii = new AsciiIfy(myCanvas, {
  renderMode: '3d',
  depthScale: 220,
  perspective: 520,
  rotationX: -0.6,
  rotationY: 0.4,
});
```

For fast, high-contrast sources such as lightning flashes, raise `depthSmoothing` to damp z-position jitter without slowing the visible glyph brightness or colors:

```js
ascii.set('depthSmoothing', 0.65);
```

## API

### Constructor

```js
new AsciiIfy(sourceCanvas, options?)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `fontSize` | number | 16 | Character size in pixels |
| `fontSizeSmoothing` | number | 0 | Seconds to crossfade font-size grid jumps (`0` disables) |
| `density` | number | 1 | Spacing multiplier (1=tight, 4=loose) |
| `charset` | string | 'density' | Preset name or raw character string |
| `colorScheme` | string | 'rainbow' | Color scheme name, or `'source'` to color glyphs from sampled source pixels |
| `background` | string | '#08080c' | Output canvas background color |
| `enabled` | boolean | true | Toggle the overlay (fades in/out over 700ms and restores the source) |
| `fade` | number | 0 | Spatial opacity variation (0-1) |
| `speed` | number | 1 | Time multiplier for patterns/cycling |
| `pattern` | string\|null | null | Procedural pattern overlay name |
| `patternMix` | number | 0 | Pattern blend amount (0=source, 1=pattern) |
| `colorCycle` | boolean | false | Auto-cycle through color schemes |
| `colorCycleRate` | number | 0.5 | Color cycling speed |
| `sourceOpacity` | number | 0 | CSS opacity of the original canvas |
| `renderMode` | `'2d'\|'3d'` | `'2d'` | Render flat ASCII or projected 3D ASCII |
| `depthScale` | number | 120 | Z displacement used by 3D mode |
| `perspective` | number | 650 | Perspective strength used by 3D mode |
| `rotationX` | number | -0.45 | 3D mode X rotation in radians |
| `rotationY` | number | 0.35 | 3D mode Y rotation in radians |
| `rotationZ` | number | 0 | 3D mode Z rotation in radians |
| `cameraZ` | number | 700 | Virtual camera distance used by 3D mode |
| `depthOpacity` | number | 0.35 | Depth-based opacity variation in 3D mode |
| `depthSmoothing` | number | 0 | Temporal smoothing for the 3D depth signal (0-0.95) |
| `edgeDetect` | boolean | false | Draw Sobel edge outlines with line-drawing glyphs instead of brightness glyphs |
| `edgeThreshold` | number | 0.15 | Edge magnitudes below this are dropped (0-1) |
| `edgeCharset` | string | 'box-light' | Edge glyph set: `box-light`, `box-heavy`, `box-double`, `ascii` |
| `crtEnabled` | boolean | false | Enable CRT post-processing on the final output |
| `crtScanlines` | number | 0.3 | Scanline darkness (0-1) |
| `crtGlow` | number | 0 | Phosphor bloom (0-1) |
| `crtDistortion` | number | 0 | Barrel distortion (0-0.5) |
| `crtFlicker` | number | 0 | Brightness flicker (0-0.3) |

Values passed to `set()` are clamped to the ranges the control panel uses (e.g. `fontSize` 1-48). The 3D and CRT options are global; everything else also works per-layer.

You can also pass `automations` (see [Parameter Automation](#parameter-automation)) to start with parameters already animating.

### Methods

```js
ascii.render()          // Render one frame
ascii.start()           // Start rAF loop
ascii.stop()            // Stop rAF loop
ascii.get(key)          // Read parameter
ascii.set(key, value)   // Write parameter
ascii.set({ ... })      // Batch write
ascii.automate(key, options)
ascii.stopAutomation(key)
ascii.clearAutomations()
ascii.getAutomation(key)   // Normalized definition, or null
ascii.getAutomations()     // { key: definition, ... }
ascii.addLayer(options)    // → Layer (see Layers)
ascii.removeLayer(layer)
ascii.soloLayer(layer)     // Render only this layer; call again (or with null) to unsolo
ascii.showPanel() / hidePanel() / togglePanel()
ascii.destroy()         // Cleanup everything

ascii.canvas            // The overlay <canvas> element
ascii.layers            // Copy of the layer array (bottom-to-top insertion order)
```

The overlay is inserted as the next sibling of your source canvas, absolutely positioned over it. If the parent is `position: static`, it's switched to `relative`.

### Parameter Automation

Numeric parameters can be automated without changing your render loop. Automation runs from the library's internal clock and is applied before each frame is rendered.

```js
ascii.automate('rotationY', {
  type: 'sine',      // 'sine', 'triangle', or 'noise'
  amount: 0.35,      // range around the current value
  rate: 0.25,        // cycles per second
});

ascii.automate('depthScale', {
  type: 'triangle',
  min: 80,
  max: 260,
  rate: 0.1,
});

ascii.stopAutomation('rotationY'); // restores the manual/base value

// Drive a parameter from input instead of time (normalized 0-1 across min..max)
ascii.automate('patternMix', { type: 'mouseX', min: 0, max: 1 });
```

| Option | Default | Description |
|--------|---------|-------------|
| `type` | 'sine' | `sine`, `triangle`, `noise`, or input-driven `mouseX`, `mouseY` (up = max), `scroll` (wheel up = max) |
| `amount` | 10% of the param's range | Swing around the base value (ignored when `min`/`max` given) |
| `min`, `max` | — | Absolute bounds instead of `amount` |
| `rate` | 1 | Cycles per second (unused by input types) |
| `phase` | 0 | Cycle offset (0-1 = one full cycle) |
| `seed` | hash of key | Noise seed |

Manual `set()` calls remain meaningful while automation is active: they update the base value that the automation moves around. Layers support the same API:

```js
overlay.automate('opacity', { type: 'noise', min: 0.2, max: 0.9, rate: 0.6 });
overlay.clearAutomations();
```

Snapshots copied from the control panel include `automations`, and those definitions can be passed back into the constructor or `addLayer()` options.

### Events

```js
ascii.on('render', ({ time, dt }) => {});
ascii.on('resize', ({ cols, rows }) => {});
ascii.on('paramchange', ({ key, value }) => {});
ascii.on('layeradd', (layer) => {});
ascii.on('layerremove', (layer) => {});
ascii.off(event, fn);
```

`resize` fires when the implicit grid's column/row count changes. `paramchange` fires for manual changes only, not for per-frame automation updates.

## Layers

Each layer independently ASCII-ifies a source canvas with its own parameters. Layers can have different font sizes, charsets, and color schemes — they render to separate offscreen canvases and composite onto the output.

```js
// Layer 1: Large blocky base
const base = ascii.addLayer({
  source: myCanvas,
  fontSize: 24,
  charset: 'blocks',
  colorScheme: 'ocean',
  blendMode: 'replace',
});

// Layer 2: Small detailed overlay with pattern
const overlay = ascii.addLayer({
  source: myCanvas,
  fontSize: 8,
  charset: 'density',
  colorScheme: 'fire',
  pattern: 'plasma',
  patternMix: 0.6,
  blendMode: 'add',
  opacity: 0.5,
});

// Modify layers at runtime
overlay.set('patternMix', 0.8);
overlay.set('pattern', 'kaleidoscope');
```

### Layer Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `source` | Canvas | parent source | Canvas to sample |
| `fontSize` | number | 16 | Per-layer font size |
| `fontSizeSmoothing` | number | 0 | Per-layer crossfade duration for font-size grid jumps |
| `density` | number | 1 | Per-layer spacing |
| `charset` | string\|null | inherit | Override charset |
| `colorScheme` | string\|null | inherit | Override color scheme |
| `pattern` | string\|null | null | Pattern overlay |
| `patternMix` | number | 0 | Pattern blend |
| `fade` | number\|null | inherit | Spatial opacity variation |
| `opacity` | number | 1 | Layer opacity |
| `blendMode` | string | 'replace' | 'replace' or 'add' |
| `offsetX`, `offsetY` | number | 0 | Pixel offset when compositing |
| `zIndex` | number | 0 | Stacking order (higher draws on top; ties keep insertion order) |
| `visible` | boolean | true | Hide without removing |
| `edgeDetect`, `edgeThreshold`, `edgeCharset` | | | Same as the global options, per layer |
| `maskLayer` | number\|null | null | `id` of another layer to use as an alpha mask |
| `invertMask` | boolean | false | Show this layer only where the mask is empty |
| `automations` | object | — | Initial automations, same shape as `automate()` options |

When `charset`, `colorScheme` or `fade` is `null`, the layer inherits from the parent instance. Set `colorScheme` to `'source'` to use each layer's sampled source canvas colors instead of a generated color scheme.

Layers have the same `get`, `set`, `automate`, `stopAutomation`, `clearAutomations`, `getAutomation(s)` methods as the main instance, plus a numeric `id`.

The first `addLayer()` call promotes the implicit single-layer render into an explicit base layer (with the instance's current settings), then adds your layer above it. After that, instance-level options like `fontSize` no longer affect existing layers — set them per layer.

### Masking

A layer can be clipped by another layer's rendered glyphs. The mask layer is still rendered every frame even if you hide it, so a hidden layer makes a clean mask source:

```js
const maskCanvas = document.createElement('canvas'); // draw a spotlight shape here each frame
const shape = ascii.addLayer({ source: maskCanvas, visible: false });
const revealed = ascii.addLayer({ colorScheme: 'fire', maskLayer: shape.id });
ascii.layers[0].set('visible', false); // hide the auto-created base layer (it's unmasked)
```

Masks are applied at alpha level (`destination-in`, or `destination-out` with `invertMask`). Use an opaque background (e.g. black) on mask canvases — dark cells produce no glyphs, so they mask out.

## Control Panel

A built-in visual control panel for live parameter tweaking during development. Lives in shadow DOM — no style conflicts with your app.

```js
ascii.showPanel();    // Open panel
ascii.hidePanel();    // Close panel
ascii.togglePanel();  // Toggle
```

The panel auto-generates sliders and selectors for all parameters on the instance and each layer. Use it to explore settings, then hardcode the values you like.

Numeric sliders include a compact `~` button. Click it to toggle automation for that parameter, then choose the wave type, amount, and rate inline.

## Presets

### Charsets

| Name | Characters |
|------|------------|
| `density` | ` .·:;=+*#%@` |
| `blocks` | ` ░▒▓█` |
| `braille` | `⠀⠁⠃⠇⠏⠟⠿⣿` |
| `minimal` | ` ·+*#` |
| `binary` | ` 01` |

You can also pass a raw character string, ordered sparse → dense: `charset: ' .:-=+*#%@'`. The first character is always treated as blank (those cells are skipped), so start custom strings with a space.

### Color Schemes

`rainbow`, `neon`, `fire`, `ocean`, `acid`, `vapor`, `mono`, `sakura` — or `'source'` to use the source canvas's own colors.

### Patterns

`plasma`, `spiral`, `tunnel`, `waves`, `kaleidoscope`, `diamond`, `moiré`, `breathing`

### Custom presets

The preset lists are exported as arrays and looked up by name at render time, so you can add your own:

```js
import { COLOR_SCHEMES, PATTERNS, CHARSETS } from 'ascii-ify';

// brightness v (0-1), time t → [hue, saturation %, lightness %]
COLOR_SCHEMES.push({ name: 'toxic', fn: (v, t) => [110 + Math.sin(t) * 10, 90, 10 + v * 60] });

// (col, row, time, cols, rows, aspectRatio) → 0-1
PATTERNS.push({ name: 'stripes', fn: (x, y, t) => (Math.sin(x * 0.3 + t * 2) + 1) / 2 });

CHARSETS.push({ name: 'dots', chars: ' .oO@' });
```

`EDGE_CHARSETS` is exported too (`{ name, chars: { h, v, dr, dl, ur, ul, cross, diagR, diagL } }`).
## How It Works

1. **Sample** — The source canvas is drawn onto a tiny offscreen canvas (one pixel per ASCII cell) using hardware-accelerated `drawImage` downscaling
2. **Brightness** — Each pixel is converted to YUV luminance (0-1)
3. **Pattern blend** — If a pattern is set, procedural values are blended with source brightness
4. **Character map** — Brightness maps to a character from the active charset (or, with edge detection, a Sobel pass picks a line glyph per edge direction)
5. **Color** — A per-frame color LUT maps brightness to colors via the active color scheme, or source pixel colors are used directly
6. **Render** — Glyphs are drawn in a single instanced WebGL call from a glyph atlas, then blitted to the 2D overlay. If WebGL isn't available it falls back to Canvas2D (`fillText` / atlas sprites)
7. **Composite** — When using layers, each renders to its own offscreen canvas, then composites via `drawImage` with masks, alpha and blend modes. Layers sharing a source share one pixel readback per frame
8. **Post** — Optional CRT effects run on the final output

## Browser support

Modern evergreen browsers. Requires Canvas2D and `ResizeObserver`; WebGL is used when available for speed.

## Examples

The repo ships 80+ demos (games, simulations, dashboards, generative scenes) in `examples/`, with a gallery at the root `index.html`:

```bash
git clone https://github.com/dlhg/ascii-ify.git
cd ascii-ify
npm install
npm run dev   # then open the printed URL
```

Most examples open with the control panel available — tweak settings live, then use **Copy** to grab a JSON snapshot of the config.

## Development

```bash
npm run dev               # Vite dev server (examples + src with HMR)
npm run build             # Library build → dist/ (ESM + CJS)
npm run test:perf:current # Playwright render benchmark (needs `npx playwright install chromium` once)
npm run test:perf         # Benchmark working tree vs. HEAD (temporary git worktree)
```

Source layout:

| Path | What |
|------|------|
| `src/ascii-ify.js` | Main class: params, layers, frame loop |
| `src/layer.js` | Layer class |
| `src/sampler.js`, `src/edge-detect.js` | Source readback, downsampling, Sobel |
| `src/renderer.js`, `src/renderer-gl.js`, `src/edge-renderer.js` | 2D/3D glyph rendering (Canvas2D + WebGL) |
| `src/automation.js` | Parameter automation |
| `src/crt.js` | CRT post-processing |
| `src/panel/` | Shadow-DOM control panel (lazy-loaded) |
| `src/data/`, `src/color/`, `src/patterns.js` | Presets |

See [ROADMAP.md](ROADMAP.md) for what's planned.

## License

[MIT](LICENSE)
