import { createApp } from './boilerplate.js';
import { clamp, lerp, mulberry32, rgb, smoothstep } from './utils.js';

const TAU = Math.PI * 2;

const THEMES = {
  navigation: {
    bg: '#04070b',
    primary: [84, 220, 230],
    secondary: [92, 128, 255],
    accent: [255, 190, 88],
    warning: [255, 88, 104],
    soft: [80, 140, 170],
  },
  tactical: {
    bg: '#050806',
    primary: [92, 230, 132],
    secondary: [70, 170, 255],
    accent: [255, 210, 78],
    warning: [255, 78, 70],
    soft: [75, 150, 105],
  },
  telemetry: {
    bg: '#08060c',
    primary: [208, 126, 255],
    secondary: [88, 220, 235],
    accent: [255, 160, 82],
    warning: [255, 76, 126],
    soft: [150, 110, 180],
  },
};

function color(c, a = 1) {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}

function clear(ctx, w, h, theme) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, theme.bg);
  g.addColorStop(0.55, '#050912');
  g.addColorStop(1, '#020305');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawBackground(ctx, w, h, t, theme) {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = color(theme.soft, 0.45);
  ctx.lineWidth = 1;
  const step = Math.max(28, Math.min(w, h) * 0.055);
  const ox = (t * 12) % step;
  const oy = (t * 7) % step;
  for (let x = -step + ox; x < w + step; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - h * 0.12, h);
    ctx.stroke();
  }
  for (let y = -step + oy; y < h + step; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y - w * 0.04);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = color(theme.primary, 1);
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  ctx.restore();
}

function drawVignette(ctx, w, h) {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.48, 0, w * 0.5, h * 0.48, Math.max(w, h) * 0.7);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawHeader(ctx, w, h, t, title, theme) {
  const hh = Math.max(42, h * 0.07);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(0, 0, w, hh);
  ctx.strokeStyle = color(theme.primary, 0.45);
  ctx.beginPath();
  ctx.moveTo(0, hh);
  ctx.lineTo(w, hh);
  ctx.stroke();

  ctx.font = `700 ${Math.max(14, Math.min(22, w * 0.018))}px monospace`;
  ctx.fillStyle = color(theme.primary, 0.94);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 18, hh * 0.52);

  const status = `T+${String(Math.floor(t * 10)).padStart(5, '0')}  LINK ${92 + Math.floor(Math.sin(t * 1.4) * 5)}%`;
  ctx.font = `600 ${Math.max(10, Math.min(14, w * 0.011))}px monospace`;
  ctx.fillStyle = color(theme.accent, 0.85);
  ctx.textAlign = 'right';
  ctx.fillText(status, w - 18, hh * 0.52);
  ctx.restore();
  return hh;
}

function layout(w, h, top) {
  const pad = Math.max(8, Math.min(14, w * 0.012));
  const usableH = h - top - pad * 2;
  if (w < 760) {
    const rowH = usableH / 4;
    return [
      rect(pad, top + pad, w - pad * 2, rowH * 1.45 - pad),
      rect(pad, top + pad + rowH * 1.45, w - pad * 2, rowH * 0.85 - pad),
      rect(pad, top + pad + rowH * 2.3, w - pad * 2, rowH * 0.85 - pad),
      rect(pad, top + pad + rowH * 3.15, w - pad * 2, rowH * 0.85 - pad),
    ];
  }
  const leftW = w * 0.29;
  const rightW = w * 0.28;
  const midW = w - leftW - rightW - pad * 4;
  const x1 = pad;
  const x2 = x1 + leftW + pad;
  const x3 = x2 + midW + pad;
  const row = usableH / 3;
  return [
    rect(x2, top + pad, midW, usableH),
    rect(x1, top + pad, leftW, row - pad),
    rect(x1, top + pad + row, leftW, row - pad),
    rect(x1, top + pad + row * 2, leftW, row - pad),
    rect(x3, top + pad, rightW, row - pad),
    rect(x3, top + pad + row, rightW, row - pad),
    rect(x3, top + pad + row * 2, rightW, row - pad),
  ];
}

function rect(x, y, w, h) {
  return { x, y, w, h };
}

function panel(ctx, r, label, theme, t, pulse = 0) {
  ctx.save();
  const glow = 0.22 + pulse * 0.35;
  ctx.fillStyle = 'rgba(2,5,10,0.34)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = color(theme.primary, glow);
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

  const c = Math.min(16, r.w * 0.08, r.h * 0.16);
  ctx.strokeStyle = color(theme.accent, 0.42 + pulse * 0.25);
  ctx.beginPath();
  ctx.moveTo(r.x, r.y + c);
  ctx.lineTo(r.x, r.y);
  ctx.lineTo(r.x + c, r.y);
  ctx.moveTo(r.x + r.w - c, r.y);
  ctx.lineTo(r.x + r.w, r.y);
  ctx.lineTo(r.x + r.w, r.y + c);
  ctx.moveTo(r.x, r.y + r.h - c);
  ctx.lineTo(r.x, r.y + r.h);
  ctx.lineTo(r.x + c, r.y + r.h);
  ctx.moveTo(r.x + r.w - c, r.y + r.h);
  ctx.lineTo(r.x + r.w, r.y + r.h);
  ctx.lineTo(r.x + r.w, r.y + r.h - c);
  ctx.stroke();

  ctx.fillStyle = color(theme.primary, 0.78);
  ctx.font = `700 ${Math.max(9, Math.min(12, r.w * 0.045))}px monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(label, r.x + 8, r.y + 6);

  ctx.globalAlpha = 0.15 + pulse * 0.12;
  ctx.fillStyle = color(theme.primary, 1);
  const scanY = r.y + 24 + ((t * 46) % Math.max(1, r.h - 28));
  ctx.fillRect(r.x + 1, scanY, r.w - 2, 1);
  ctx.restore();
}

function clipContent(ctx, r) {
  ctx.beginPath();
  ctx.rect(r.x + 8, r.y + 24, Math.max(1, r.w - 16), Math.max(1, r.h - 32));
  ctx.clip();
}

function drawNavigationScene(ctx, w, h, t, state, theme) {
  const boxes = layout(w, h, drawHeader(ctx, w, h, t, 'LONG RANGE NAVIGATION', theme));
  const main = boxes[0];
  panel(ctx, main, 'ORBITAL TRANSFER MAP', theme, t, 0.35 + Math.sin(t * 2) * 0.2);
  drawStarMap(ctx, main, t, state, theme);
  panel(ctx, boxes[1], 'VECTOR LOCK', theme, t);
  drawVectorBars(ctx, boxes[1], t, theme);
  panel(ctx, boxes[2], 'ROUTE QUEUE', theme, t);
  drawRouteQueue(ctx, boxes[2], t, theme);
  panel(ctx, boxes[3], 'GRAVITY WELLS', theme, t);
  drawGravityWells(ctx, boxes[3], t, theme);
  if (boxes[4]) {
    panel(ctx, boxes[4], 'SENSOR ARC', theme, t);
    drawRadar(ctx, boxes[4], t, state, theme);
    panel(ctx, boxes[5], 'DELTA-V BUDGET', theme, t);
    drawStackedReadout(ctx, boxes[5], t, theme, ['MAIN', 'RCS', 'RESV', 'THERM']);
    panel(ctx, boxes[6], 'FLIGHT WINDOW', theme, t);
    drawTimeline(ctx, boxes[6], t, theme);
  }
}

function drawTacticalScene(ctx, w, h, t, state, theme) {
  const boxes = layout(w, h, drawHeader(ctx, w, h, t, 'TACTICAL SENSOR GRID', theme));
  const main = boxes[0];
  panel(ctx, main, 'TARGET FIELD', theme, t, 0.45);
  drawTacticalMap(ctx, main, t, state, theme);
  panel(ctx, boxes[1], 'IFF TRACKS', theme, t);
  drawTrackList(ctx, boxes[1], t, theme);
  panel(ctx, boxes[2], 'SIGNATURE BANDS', theme, t);
  drawWaveBands(ctx, boxes[2], t, theme);
  panel(ctx, boxes[3], 'THREAT SOLUTION', theme, t);
  drawThreatGauge(ctx, boxes[3], t, theme);
  if (boxes[4]) {
    panel(ctx, boxes[4], 'CONTACT RADAR', theme, t);
    drawRadar(ctx, boxes[4], t * 1.3, state, theme);
    panel(ctx, boxes[5], 'COUNTERMEASURES', theme, t);
    drawStackedReadout(ctx, boxes[5], t, theme, ['CHAF', 'DECOY', 'JAM', 'FLARE']);
    panel(ctx, boxes[6], 'ENGAGEMENT LOG', theme, t);
    drawRouteQueue(ctx, boxes[6], t * 1.4, theme);
  }
}

function drawTelemetryScene(ctx, w, h, t, state, theme) {
  const boxes = layout(w, h, drawHeader(ctx, w, h, t, 'VESSEL TELEMETRY WALL', theme));
  const main = boxes[0];
  panel(ctx, main, 'REACTOR AND DRIVE CORE', theme, t, 0.5);
  drawReactorCore(ctx, main, t, theme);
  panel(ctx, boxes[1], 'THERMAL LOAD', theme, t);
  drawHeatMatrix(ctx, boxes[1], t, theme);
  panel(ctx, boxes[2], 'BUS VOLTAGE', theme, t);
  drawWaveBands(ctx, boxes[2], t * 0.8, theme);
  panel(ctx, boxes[3], 'CREW SYSTEMS', theme, t);
  drawStackedReadout(ctx, boxes[3], t, theme, ['O2', 'H2O', 'CO2', 'PRESS']);
  if (boxes[4]) {
    panel(ctx, boxes[4], 'COMMS ARRAY', theme, t);
    drawConstellation(ctx, boxes[4], t, state, theme);
    panel(ctx, boxes[5], 'STRUCTURAL STRAIN', theme, t);
    drawVectorBars(ctx, boxes[5], t * 1.2, theme);
    panel(ctx, boxes[6], 'EVENT STREAM', theme, t);
    drawTimeline(ctx, boxes[6], t * 1.6, theme);
  }
}

function drawStarMap(ctx, r, t, state, theme) {
  ctx.save();
  clipContent(ctx, r);
  const cx = r.x + r.w * 0.5;
  const cy = r.y + r.h * 0.52;
  const radius = Math.min(r.w, r.h) * 0.37;

  ctx.strokeStyle = color(theme.soft, 0.25);
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius * i / 4, radius * i / 5, Math.sin(t * 0.18) * 0.4, 0, TAU);
    ctx.stroke();
  }

  ctx.strokeStyle = color(theme.primary, 0.55);
  ctx.beginPath();
  for (let i = 0; i < state.route.length; i++) {
    const p = state.route[i];
    const a = p.a + t * 0.045;
    const rr = radius * p.r;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a * 1.17) * rr * 0.56;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  for (let i = 0; i < state.stars.length; i++) {
    const p = state.stars[i];
    const a = p.a + t * p.v;
    const x = cx + Math.cos(a) * radius * p.r;
    const y = cy + Math.sin(a * 1.2) * radius * p.r * 0.62;
    const blink = 0.45 + 0.45 * Math.sin(t * 2.4 + p.a * 8);
    ctx.fillStyle = color(i % 7 === 0 ? theme.accent : theme.primary, 0.25 + blink * 0.55);
    ctx.fillRect(x - p.s * 0.5, y - p.s * 0.5, p.s, p.s);
  }

  const shipA = t * 0.34;
  const sx = cx + Math.cos(shipA) * radius * 0.66;
  const sy = cy + Math.sin(shipA * 1.2) * radius * 0.41;
  ctx.strokeStyle = color(theme.accent, 0.9);
  ctx.beginPath();
  ctx.moveTo(sx + 13, sy);
  ctx.lineTo(sx - 7, sy - 7);
  ctx.lineTo(sx - 3, sy);
  ctx.lineTo(sx - 7, sy + 7);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawTacticalMap(ctx, r, t, state, theme) {
  ctx.save();
  clipContent(ctx, r);
  const cx = r.x + r.w * 0.5;
  const cy = r.y + r.h * 0.52;
  const s = Math.min(r.w, r.h) * 0.42;

  ctx.strokeStyle = color(theme.soft, 0.25);
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - s, cy + i * s / 4);
    ctx.lineTo(cx + s, cy + i * s / 4);
    ctx.moveTo(cx + i * s / 4, cy - s);
    ctx.lineTo(cx + i * s / 4, cy + s);
    ctx.stroke();
  }

  for (let i = 0; i < state.targets.length; i++) {
    const p = state.targets[i];
    const x = cx + Math.sin(t * p.v + p.a) * s * p.r;
    const y = cy + Math.cos(t * p.v * 0.73 + p.a) * s * p.r;
    const hostile = i % 4 === 0;
    ctx.strokeStyle = color(hostile ? theme.warning : theme.primary, hostile ? 0.95 : 0.7);
    ctx.beginPath();
    ctx.moveTo(x - 8, y);
    ctx.lineTo(x + 8, y);
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x, y + 8);
    ctx.stroke();
    ctx.fillStyle = color(hostile ? theme.warning : theme.secondary, 0.35);
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
  ctx.strokeStyle = color(theme.accent, 0.7);
  ctx.strokeRect(cx - s * 0.25, cy - s * 0.18, s * 0.5, s * 0.36);
  ctx.restore();
}

function drawReactorCore(ctx, r, t, theme) {
  ctx.save();
  clipContent(ctx, r);
  const cx = r.x + r.w * 0.5;
  const cy = r.y + r.h * 0.52;
  const rad = Math.min(r.w, r.h) * 0.28;
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + t * 0.4;
    ctx.strokeStyle = color(i % 2 ? theme.primary : theme.secondary, 0.35);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rad * (1.2 + i * 0.04), rad * 0.42, a, 0, TAU);
    ctx.stroke();
  }
  const pulse = 0.55 + 0.45 * Math.sin(t * 3);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
  g.addColorStop(0, color(theme.accent, 0.75));
  g.addColorStop(0.35, color(theme.primary, 0.28 + pulse * 0.2));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, TAU);
  ctx.fill();

  for (let i = 0; i < 24; i++) {
    const a = i / 24 * TAU + t * 0.7;
    const len = rad * (1.45 + Math.sin(t * 2 + i) * 0.14);
    ctx.strokeStyle = color(theme.primary, 0.28);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * rad * 0.72, cy + Math.sin(a) * rad * 0.72);
    ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRadar(ctx, r, t, state, theme) {
  ctx.save();
  clipContent(ctx, r);
  const cx = r.x + r.w * 0.5;
  const cy = r.y + r.h * 0.58;
  const rad = Math.min(r.w, r.h) * 0.32;
  ctx.strokeStyle = color(theme.primary, 0.25);
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, rad * i / 3, 0, TAU);
    ctx.stroke();
  }
  const a = t * 1.8;
  ctx.strokeStyle = color(theme.accent, 0.85);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  ctx.stroke();
  for (let i = 0; i < state.targets.length; i += 2) {
    const p = state.targets[i];
    const x = cx + Math.cos(p.a + t * p.v) * rad * p.r;
    const y = cy + Math.sin(p.a + t * p.v * 0.8) * rad * p.r;
    ctx.fillStyle = color(i % 6 === 0 ? theme.warning : theme.primary, 0.75);
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
  ctx.restore();
}

function drawVectorBars(ctx, r, t, theme) {
  ctx.save();
  clipContent(ctx, r);
  const rows = 6;
  for (let i = 0; i < rows; i++) {
    const y = r.y + 34 + i * ((r.h - 44) / rows);
    const v = 0.35 + 0.55 * smoothstep(-1, 1, Math.sin(t * (0.7 + i * 0.13) + i));
    ctx.fillStyle = color(theme.soft, 0.18);
    ctx.fillRect(r.x + 12, y, r.w - 24, 5);
    ctx.fillStyle = color(i % 3 === 0 ? theme.accent : theme.primary, 0.75);
    ctx.fillRect(r.x + 12, y, (r.w - 24) * v, 5);
    ctx.fillStyle = color(theme.primary, 0.65);
    ctx.font = '10px monospace';
    ctx.fillText(`${['X', 'Y', 'Z', 'P', 'R', 'D'][i]} ${Math.round(v * 999).toString().padStart(3, '0')}`, r.x + 12, y - 11);
  }
  ctx.restore();
}

function drawRouteQueue(ctx, r, t, theme) {
  ctx.save();
  clipContent(ctx, r);
  const labels = ['BURN', 'SYNC', 'SCAN', 'DRIFT', 'LOCK', 'TRIM'];
  ctx.font = '10px monospace';
  for (let i = 0; i < labels.length; i++) {
    const y = r.y + 34 + i * 18;
    const active = (Math.floor(t * 1.3) + i) % 5 === 0;
    ctx.fillStyle = color(active ? theme.accent : theme.primary, active ? 0.9 : 0.52);
    ctx.fillText(labels[i], r.x + 12, y);
    ctx.fillText(`${(Math.abs(Math.sin(t + i)) * 89 + 10).toFixed(1)}%`, r.x + r.w - 68, y);
  }
  ctx.restore();
}

function drawGravityWells(ctx, r, t, theme) {
  ctx.save();
  clipContent(ctx, r);
  const cx = r.x + r.w * 0.5;
  const cy = r.y + r.h * 0.58;
  for (let i = 0; i < 5; i++) {
    const rad = (i + 1) * Math.min(r.w, r.h) * 0.07;
    ctx.strokeStyle = color(i % 2 ? theme.secondary : theme.primary, 0.22 + i * 0.05);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rad * (1.7 + Math.sin(t + i) * 0.12), rad, t * 0.2 + i, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStackedReadout(ctx, r, t, theme, labels) {
  ctx.save();
  clipContent(ctx, r);
  const baseY = r.y + 36;
  const gap = Math.max(17, (r.h - 48) / labels.length);
  ctx.font = '10px monospace';
  for (let i = 0; i < labels.length; i++) {
    const v = 0.2 + 0.75 * smoothstep(-1, 1, Math.sin(t * (0.8 + i * 0.21) + i * 1.7));
    const y = baseY + i * gap;
    ctx.fillStyle = color(theme.primary, 0.65);
    ctx.fillText(labels[i], r.x + 12, y);
    ctx.fillStyle = color(theme.soft, 0.2);
    ctx.fillRect(r.x + 58, y - 8, r.w - 82, 8);
    ctx.fillStyle = color(v > 0.82 ? theme.warning : theme.accent, 0.78);
    ctx.fillRect(r.x + 58, y - 8, (r.w - 82) * v, 8);
  }
  ctx.restore();
}

function drawTimeline(ctx, r, t, theme) {
  ctx.save();
  clipContent(ctx, r);
  const x0 = r.x + 16;
  const x1 = r.x + r.w - 16;
  const y = r.y + r.h * 0.56;
  ctx.strokeStyle = color(theme.primary, 0.35);
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const x = lerp(x0, x1, i / 6);
    const hit = (Math.floor(t * 1.2) + i) % 4 === 0;
    ctx.strokeStyle = color(hit ? theme.accent : theme.primary, hit ? 0.85 : 0.45);
    ctx.beginPath();
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x, y + 18);
    ctx.stroke();
    ctx.fillStyle = color(hit ? theme.accent : theme.primary, hit ? 0.9 : 0.48);
    ctx.fillRect(x - 3, y - 3, 6, 6);
  }
  ctx.restore();
}

function drawTrackList(ctx, r, t, theme) {
  ctx.save();
  clipContent(ctx, r);
  const ids = ['K-19', 'V-02', 'R-77', 'M-31', 'T-64', 'Q-08'];
  ctx.font = '10px monospace';
  for (let i = 0; i < ids.length; i++) {
    const y = r.y + 34 + i * 17;
    const hot = i === (Math.floor(t * 0.9) % ids.length);
    ctx.fillStyle = color(hot ? theme.warning : theme.primary, hot ? 0.9 : 0.58);
    ctx.fillText(ids[i], r.x + 12, y);
    ctx.fillText(`${Math.floor(1200 + Math.sin(t + i) * 600)}M`, r.x + r.w - 58, y);
  }
  ctx.restore();
}

function drawWaveBands(ctx, r, t, theme) {
  ctx.save();
  clipContent(ctx, r);
  const x0 = r.x + 12;
  const x1 = r.x + r.w - 12;
  const rows = 4;
  for (let band = 0; band < rows; band++) {
    const cy = r.y + 38 + band * ((r.h - 50) / rows);
    ctx.strokeStyle = color(band % 2 ? theme.secondary : theme.primary, 0.62);
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const u = i / 80;
      const x = lerp(x0, x1, u);
      const y = cy + Math.sin(u * TAU * (2 + band) + t * (1.2 + band * 0.2)) * (7 + band * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawThreatGauge(ctx, r, t, theme) {
  ctx.save();
  clipContent(ctx, r);
  const cx = r.x + r.w * 0.5;
  const cy = r.y + r.h * 0.66;
  const rad = Math.min(r.w, r.h) * 0.36;
  const v = 0.48 + 0.4 * smoothstep(-1, 1, Math.sin(t * 0.65));
  ctx.strokeStyle = color(theme.soft, 0.25);
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, rad, Math.PI, TAU, false);
  ctx.stroke();
  ctx.strokeStyle = color(v > 0.78 ? theme.warning : theme.accent, 0.8);
  ctx.beginPath();
  ctx.arc(cx, cy, rad, Math.PI, Math.PI + Math.PI * v, false);
  ctx.stroke();
  ctx.fillStyle = color(theme.primary, 0.82);
  ctx.font = '700 20px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(v * 100)}`, cx, cy - 8);
  ctx.restore();
}

function drawHeatMatrix(ctx, r, t, theme) {
  ctx.save();
  clipContent(ctx, r);
  const cols = 9;
  const rows = 6;
  const pad = 3;
  const x0 = r.x + 12;
  const y0 = r.y + 32;
  const cell = Math.min((r.w - 24) / cols, (r.h - 42) / rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = smoothstep(-1, 1, Math.sin(t * 0.9 + x * 0.7 + y * 1.3));
      ctx.fillStyle = color(v > 0.78 ? theme.warning : lerpColor(theme.secondary, theme.primary, v), 0.24 + v * 0.6);
      ctx.fillRect(x0 + x * cell + pad, y0 + y * cell + pad, cell - pad * 2, cell - pad * 2);
    }
  }
  ctx.restore();
}

function lerpColor(a, b, t) {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}

function drawConstellation(ctx, r, t, state, theme) {
  ctx.save();
  clipContent(ctx, r);
  const pts = state.stars.slice(0, 16).map((p) => ({
    x: r.x + 18 + ((Math.sin(p.a * 3.1) * 0.5 + 0.5) * (r.w - 36)),
    y: r.y + 34 + ((Math.cos(p.a * 2.7) * 0.5 + 0.5) * (r.h - 48)),
  }));
  ctx.strokeStyle = color(theme.secondary, 0.25);
  for (let i = 1; i < pts.length; i++) {
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  pts.forEach((p, i) => {
    const a = 0.35 + 0.5 * smoothstep(-1, 1, Math.sin(t * 2 + i));
    ctx.fillStyle = color(i % 5 === 0 ? theme.accent : theme.primary, a);
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  });
  ctx.restore();
}

function buildState(seed) {
  const rand = mulberry32(seed);
  return {
    stars: Array.from({ length: 84 }, () => ({
      a: rand() * TAU,
      r: 0.15 + rand() * 0.86,
      v: 0.01 + rand() * 0.045,
      s: 1 + rand() * 3,
    })),
    route: Array.from({ length: 10 }, (_, i) => ({
      a: i / 9 * TAU * 0.86 - 0.5,
      r: 0.28 + i * 0.065 + rand() * 0.03,
    })),
    targets: Array.from({ length: 28 }, () => ({
      a: rand() * TAU,
      r: 0.15 + rand() * 0.86,
      v: 0.12 + rand() * 0.42,
    })),
  };
}

export function createVfxDashboard({ kind, title, seed = 1, asciiConfig, layers }) {
  const theme = THEMES[kind] || THEMES.navigation;
  const state = buildState(seed);
  let paused = false;
  let pauseAlpha = 0;

  return createApp({
    asciiConfig: {
      enabled: true,
      fontSize: 16,
      density: 1,
      charset: 'density',
      colorScheme: 'rainbow',
      background: theme.bg,
      fade: 0,
      speed: 0.75,
      sourceOpacity: 0,
      renderMode: '3d',
      depthScale: 360,
      perspective: 1450,
      rotationX: -0.16,
      rotationY: 0.42,
      rotationZ: 0.02,
      cameraZ: 700,
      depthOpacity: 0.35,
      ...asciiConfig,
    },
    layers,
    draw(ctx, { time, dt, width, height }) {
      const t = time / 1000;
      if (!paused) {
        clear(ctx, width, height, theme);
        drawBackground(ctx, width, height, t, theme);
        if (kind === 'tactical') drawTacticalScene(ctx, width, height, t, state, theme);
        else if (kind === 'telemetry') drawTelemetryScene(ctx, width, height, t, state, theme);
        else drawNavigationScene(ctx, width, height, t, state, theme);
        drawVignette(ctx, width, height);
      }

      if (pauseAlpha > 0.01) {
        pauseAlpha -= dt * 0.7;
        ctx.save();
        ctx.globalAlpha = clamp(pauseAlpha, 0, 1);
        ctx.font = '700 22px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = rgb(theme.accent);
        ctx.fillText(paused ? 'HOLD' : 'LIVE', width / 2, height / 2);
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.font = '11px monospace';
      ctx.fillStyle = color(theme.primary, 0.75);
      ctx.textAlign = 'center';
      ctx.fillText('space hold - P panel - E toggle - G filters', width / 2, height - 12);
      ctx.restore();
    },
    onKeydown(e) {
      if (e.key === ' ') {
        e.preventDefault();
        paused = !paused;
        pauseAlpha = 1;
      }
    },
    showPanel: true,
  });
}

