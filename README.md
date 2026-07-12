# ascii-ify

> **Early development** — API may change.

ASCII-ify any canvas. Drop-in library that overlays real-time ASCII art rendering on top of your canvas-based web application. Supports layered compositing, procedural pattern overlays, and an optional visual control panel.

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

## API

### Constructor

```js
new AsciiIfy(sourceCanvas, options?)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `fontSize` | number | 16 | Character size in pixels |
| `density` | number | 1 | Spacing multiplier (1=tight, 4=loose) |
| `charset` | string | 'density' | Preset name or raw character string |
| `colorScheme` | string | 'rainbow' | Color scheme name |
| `background` | string | '#08080c' | Output canvas background color |
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

### Methods

```js
ascii.render()          // Render one frame
ascii.start()           // Start rAF loop
ascii.stop()            // Stop rAF loop
ascii.get(key)          // Read parameter
ascii.set(key, value)   // Write parameter
ascii.set({ ... })      // Batch write
ascii.destroy()         // Cleanup everything
```

### Events

```js
ascii.on('render', ({ time, dt }) => {});
ascii.on('resize', ({ cols, rows }) => {});
ascii.on('paramchange', ({ key, value }) => {});
```

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
| `density` | number | 1 | Per-layer spacing |
| `charset` | string\|null | inherit | Override charset |
| `colorScheme` | string\|null | inherit | Override color scheme |
| `pattern` | string\|null | null | Pattern overlay |
| `patternMix` | number | 0 | Pattern blend |
| `opacity` | number | 1 | Layer opacity |
| `blendMode` | string | 'replace' | 'replace' or 'add' |

When `charset` or `colorScheme` is `null`, the layer inherits from the parent instance.

## Control Panel

A built-in visual control panel for live parameter tweaking during development. Lives in shadow DOM — no style conflicts with your app.

```js
ascii.showPanel();    // Open panel
ascii.hidePanel();    // Close panel
ascii.togglePanel();  // Toggle
```

The panel auto-generates sliders and selectors for all parameters on the instance and each layer. Use it to explore settings, then hardcode the values you like.

## Presets

### Charsets

| Name | Characters |
|------|------------|
| `density` | ` .·:;=+*#%@` |
| `blocks` | ` ░▒▓█` |
| `braille` | `⠀⠁⠃⠇⠏⠟⠿⣿` |
| `minimal` | ` ·+*#` |
| `binary` | ` 01` |

You can also pass a raw character string: `charset: ' .:-=+*#%@'`

### Color Schemes

`rainbow`, `neon`, `fire`, `ocean`, `acid`, `vapor`, `mono`

### Patterns

`plasma`, `spiral`, `tunnel`, `waves`, `kaleidoscope`, `diamond`, `moiré`, `breathing`

## How It Works

1. **Sample** — The source canvas is drawn onto a tiny offscreen canvas (one pixel per ASCII cell) using hardware-accelerated `drawImage` downscaling
2. **Brightness** — Each pixel is converted to YUV luminance (0-1)
3. **Pattern blend** — If a pattern is set, procedural values are blended with source brightness
4. **Character map** — Brightness maps to a character from the active charset
5. **Color** — A per-frame color LUT maps brightness to HSL strings via the active color scheme
6. **Render** — Characters are drawn to the overlay canvas via `fillText`
7. **Composite** — When using layers, each renders to its own offscreen canvas, then composites via `drawImage` with alpha and blend modes

## License

MIT
