/**
 * Calculate the ASCII character grid dimensions for a given viewport.
 * @param {number} width - viewport width in CSS pixels
 * @param {number} height - viewport height in CSS pixels
 * @param {number} fontSize - font size in px
 * @param {number} density - spacing multiplier (1 = tight)
 * @returns {{ cols: number, rows: number, cw: number, ch: number, ar: number }}
 */
export function calculateGrid(width, height, fontSize, density) {
  // We need a canvas context to measure text — use a shared offscreen context
  if (!_measureCtx) {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    _measureCtx = c.getContext('2d');
  }

  _measureCtx.font = `${fontSize}px monospace`;
  const charW = _measureCtx.measureText('M').width * density;
  const charH = fontSize * 1.35 * density;
  const ar = charH / charW;
  const cols = Math.floor(width / charW);
  const rows = Math.floor(height / charH);

  return { cols, rows, cw: charW, ch: charH, ar };
}

let _measureCtx = null;
