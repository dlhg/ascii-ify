export const PANEL_CSS = `
/* ═══════════════════════════════════════════════════════
   DESIGN TOKENS
   ═══════════════════════════════════════════════════════ */
:host {
  --bg-void: #08080f;
  --bg-surface: #0c0c16;
  --bg-panel: #12121e;
  --bg-raised: #181826;
  --bg-track: #14142a;
  --bg-track-hover: #1a1a30;

  --accent: #ff6b35;
  --accent-dim: #cc5529;
  --accent-soft: rgba(255, 107, 53, 0.12);
  --accent-glow: rgba(255, 107, 53, 0.3);

  --text-1: #d0d0e0;
  --text-2: #8888a8;
  --text-3: #555578;
  --text-4: #3a3a55;

  --border-1: rgba(255, 255, 255, 0.04);
  --border-2: rgba(255, 255, 255, 0.07);
  --border-3: rgba(255, 255, 255, 0.12);

  --ui-font: ui-monospace, 'Cascadia Code', 'Fira Code', Consolas, monospace;
  --radius: 5px;
  --radius-sm: 3px;
}

/* ═══════════════════════════════════════════════════════
   CONTROL SURFACE CONTAINER
   ═══════════════════════════════════════════════════════ */
.control-surface {
  position: relative;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-2);
  display: flex;
  justify-content: space-between;
  gap: 5px;
  padding: 5px;
  font-family: var(--ui-font);
  user-select: none;
  transform: translateY(0);
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.control-surface::before {
  content: '';
  position: absolute;
  top: 0;
  left: 10%;
  right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent-glow), transparent);
  pointer-events: none;
}

.control-surface.hidden {
  transform: translateY(100%);
}

/* ═══════════════════════════════════════════════════════
   PANELS
   ═══════════════════════════════════════════════════════ */
.panel {
  flex: 1;
  min-width: 0;
  background: linear-gradient(180deg, var(--bg-panel) 0%, #10101c 100%);
  border: 1px solid var(--border-2);
  border-radius: var(--radius);
  padding: 10px 11px;
  position: relative;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.02);
  overflow: hidden;
  max-height: 300px;
}

.panel::before {
  content: '';
  position: absolute;
  top: 0;
  left: 10%;
  right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.04), transparent);
  pointer-events: none;
}

.panel-title {
  font: 700 8.5px/1 var(--ui-font);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--text-4);
  margin-bottom: 10px;
  padding-bottom: 7px;
  border-bottom: 1px solid var(--border-1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: color 0.15s;
}

.panel-title:hover {
  color: var(--text-3);
}

.panel-chevron {
  font-size: 10px;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  color: var(--text-4);
}

.panel.collapsed .panel-chevron {
  transform: rotate(-90deg);
}

.panel-body {
  overflow-y: auto;
  max-height: 260px;
}

.panel.collapsed {
  flex: 0 0 auto;
  overflow: hidden;
  max-height: none;
}

.panel.collapsed .panel-body {
  display: none;
}

.panel.collapsed .panel-title {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

/* ═══════════════════════════════════════════════════════
   BAR CONTROL
   ═══════════════════════════════════════════════════════ */
.bar-ctrl {
  margin-bottom: 8px;
}

.bar-ctrl:last-child {
  margin-bottom: 0;
}

.bar-ctrl-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}

.ctrl-label {
  font: 500 8px/1 var(--ui-font);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-3);
}

.ctrl-value {
  font: 600 10px/1 var(--ui-font);
  color: var(--text-2);
}

.bar-track {
  height: 14px;
  background: var(--bg-track);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-sm);
  position: relative;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s, background 0.15s;
}

.bar-track:hover {
  border-color: var(--border-3);
  background: var(--bg-track-hover);
}

.bar-track.dragging {
  border-color: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
}

.bar-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  background: linear-gradient(90deg, var(--accent-dim), var(--accent));
  border-radius: var(--radius-sm);
  pointer-events: none;
  transition: width 0.06s ease-out;
}

/* ═══════════════════════════════════════════════════════
   SELECTOR (Arrow style)
   ═══════════════════════════════════════════════════════ */
.ctrl-selector {
  margin-bottom: 8px;
}

.selector {
  display: flex;
  align-items: center;
  gap: 0;
  margin-top: 4px;
}

.sel-arrow {
  font: 600 13px/1 var(--ui-font);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-raised);
  border: 1px solid var(--border-1);
  color: var(--text-3);
  cursor: pointer;
  transition: all 0.15s;
  padding: 0;
}

.sel-arrow:first-child {
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}

.sel-arrow:last-child {
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.sel-arrow:hover {
  color: var(--accent);
  border-color: var(--border-3);
  background: var(--bg-track);
}

.sel-arrow:active {
  background: var(--accent-soft);
}

.sel-display {
  flex: 1;
  text-align: center;
  font: 600 10px/24px var(--ui-font);
  color: var(--text-1);
  background: var(--bg-raised);
  border-top: 1px solid var(--border-1);
  border-bottom: 1px solid var(--border-1);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 4px;
}

/* ═══════════════════════════════════════════════════════
   TOGGLE
   ═══════════════════════════════════════════════════════ */
.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.toggle-pill {
  width: 32px;
  height: 16px;
  background: var(--bg-raised);
  border: 1px solid var(--border-2);
  border-radius: 8px;
  position: relative;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.toggle-pill::after {
  content: '';
  position: absolute;
  width: 10px;
  height: 10px;
  background: var(--text-4);
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-pill.on {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
}

.toggle-pill.on::after {
  left: 18px;
  background: #fff;
  box-shadow: 0 0 4px rgba(255, 255, 255, 0.3);
}

.toggle-pill:hover {
  border-color: var(--border-3);
}

.toggle-label {
  font: 500 8px/1 var(--ui-font);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-3);
}

/* ═══════════════════════════════════════════════════════
   BUTTONS
   ═══════════════════════════════════════════════════════ */
.ctrl-btn {
  font: 600 9px/1 var(--ui-font);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 6px 12px;
  background: var(--bg-raised);
  color: var(--text-3);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}

.ctrl-btn:hover {
  color: var(--text-1);
  border-color: var(--border-3);
  background: var(--bg-track);
}

.ctrl-btn:active {
  background: var(--accent-soft);
}

.ctrl-btn.danger {
  color: #e63946;
  border-color: rgba(230, 57, 70, 0.2);
}

.ctrl-btn.danger:hover {
  background: rgba(230, 57, 70, 0.1);
  border-color: rgba(230, 57, 70, 0.4);
}

/* ═══════════════════════════════════════════════════════
   LAYER SECTION
   ═══════════════════════════════════════════════════════ */
.layer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.layer-title {
  font: 600 9px/1 var(--ui-font);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-2);
}

/* ═══════════════════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════════════════ */
.ctrl-spacer {
  height: 4px;
}

.ctrl-divider {
  height: 1px;
  background: var(--border-1);
  margin: 6px 0;
}

/* Scrollbar styling */
.panel-body::-webkit-scrollbar {
  width: 4px;
}
.panel-body::-webkit-scrollbar-track {
  background: transparent;
}
.panel-body::-webkit-scrollbar-thumb {
  background: var(--border-2);
  border-radius: 2px;
}
`;
