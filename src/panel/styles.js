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

  --drawer-w: 260px;
}

/* ═══════════════════════════════════════════════════════
   CONTROL SURFACE (positioning wrapper)
   ═══════════════════════════════════════════════════════ */
.control-surface {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: var(--drawer-w);
  font-family: var(--ui-font);
  user-select: none;
  transform: translateX(0);
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.control-surface.hidden {
  transform: translateX(100%);
}

/* ═══════════════════════════════════════════════════════
   EDGE TAB (toggle handle, visible when drawer is hidden)
   ═══════════════════════════════════════════════════════ */
.edge-tab {
  position: absolute;
  left: -28px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 56px;
  background: rgba(12, 12, 22, 0.82);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-2);
  border-right: none;
  border-radius: 6px 0 0 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  pointer-events: auto;
  transition: background 0.15s, border-color 0.15s;
}

.edge-tab:hover {
  background: rgba(18, 18, 30, 0.92);
  border-color: var(--border-3);
}

.edge-tab-icon {
  font-size: 14px;
  color: var(--text-4);
  transition: color 0.15s, transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  line-height: 1;
}

.edge-tab:hover .edge-tab-icon {
  color: var(--text-2);
}

.control-surface.hidden .edge-tab-icon {
  transform: rotate(180deg);
}

/* ═══════════════════════════════════════════════════════
   DRAWER (glassmorphism container)
   ═══════════════════════════════════════════════════════ */
.drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: var(--drawer-w);
  background: rgba(12, 12, 22, 0.78);
  backdrop-filter: blur(20px) saturate(1.2);
  -webkit-backdrop-filter: blur(20px) saturate(1.2);
  border-left: 1px solid var(--border-2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3);
  pointer-events: auto;
}

.drawer::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 1px;
  background: linear-gradient(180deg, transparent, var(--accent-glow), transparent);
  pointer-events: none;
}

/* ═══════════════════════════════════════════════════════
   DRAWER HEADER
   ═══════════════════════════════════════════════════════ */
.drawer-header {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.drawer-title {
  font: 700 9px/1 var(--ui-font);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--text-3);
}

.header-btn-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-row {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.action-row .ctrl-btn {
  flex: 1;
  font: 600 9px/1 var(--ui-font);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 8px 12px;
  background: var(--bg-raised);
  color: var(--text-3);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s;
}

.action-row .ctrl-btn:hover {
  color: var(--text-1);
  border-color: var(--border-3);
  background: var(--bg-track);
}

.copy-btn.flash {
  color: var(--accent);
  border-color: var(--accent-dim);
}

.close-btn,
.popout-btn {
  width: 22px;
  height: 22px;
  background: var(--bg-raised);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-sm);
  color: var(--text-4);
  font: 400 14px/1 var(--ui-font);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}

.close-btn:hover,
.popout-btn:hover {
  color: var(--text-1);
  border-color: var(--border-3);
  background: var(--bg-track);
}

.popout-btn {
  font-size: 12px;
}

/* ═══════════════════════════════════════════════════════
   DRAWER SCROLLABLE CONTENT
   ═══════════════════════════════════════════════════════ */
.drawer-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.drawer-scroll::-webkit-scrollbar { width: 4px; }
.drawer-scroll::-webkit-scrollbar-track { background: transparent; }
.drawer-scroll::-webkit-scrollbar-thumb {
  background: var(--border-2);
  border-radius: 2px;
}

/* ═══════════════════════════════════════════════════════
   SECTIONS
   ═══════════════════════════════════════════════════════ */
.section {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-1);
}

.section-title {
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

.section-title:hover {
  color: var(--text-3);
}

.section-chevron {
  font-size: 10px;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  color: var(--text-4);
}

.section.collapsed .section-chevron {
  transform: rotate(-90deg);
}

.section.collapsed .section-body {
  display: none;
}

.section.collapsed .section-title {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

/* ═══════════════════════════════════════════════════════
   LAYER TABS
   ═══════════════════════════════════════════════════════ */
.layer-tabs {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-1);
  flex-shrink: 0;
}

.layer-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-raised);
  border: 1px solid var(--border-1);
  transition: all 0.15s;
}

.layer-row.active {
  border-color: var(--accent-dim);
  background: var(--accent-soft);
  box-shadow: 0 0 6px var(--accent-glow);
}

.layer-row.layer-hidden {
  opacity: 0.55;
}

.layer-row-label {
  flex: 1;
  font: 600 9px/1 var(--ui-font);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-4);
  cursor: pointer;
  padding: 2px 0;
}

.layer-row.active .layer-row-label {
  color: var(--accent);
}

.layer-row-btns {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.layer-hide-btn,
.layer-solo-btn {
  font: 600 8px/1 var(--ui-font) !important;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 4px 8px !important;
}

.layer-solo-btn.active {
  color: var(--accent);
  border-color: var(--accent-dim);
  background: var(--accent-soft);
  box-shadow: 0 0 6px var(--accent-glow);
}

.add-layer-btn {
  font: 600 9px/1 var(--ui-font);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-raised);
  border: 1px solid var(--border-1);
  color: var(--text-4);
  cursor: pointer;
  transition: all 0.15s;
  align-self: flex-start;
}

.add-layer-btn:hover {
  color: var(--accent);
  border-color: var(--border-3);
}

.layer-tab-content {
  display: none;
  padding: 12px 14px;
}

.layer-tab-content.active {
  display: block;
}

.no-layers-msg {
  padding: 16px 14px;
  font: 500 9px/1.5 var(--ui-font);
  color: var(--text-4);
  text-align: center;
  letter-spacing: 0.05em;
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

.layer-btn-group {
  display: flex;
  gap: 4px;
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

/* ═══════════════════════════════════════════════════════
   RESIZE HANDLE
   ═══════════════════════════════════════════════════════ */
.resize-handle {
  position: absolute;
  left: -4px;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  z-index: 2;
  pointer-events: auto;
}

.resize-handle::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 0;
  bottom: 0;
  width: 2px;
  transition: background 0.15s;
}

.resize-handle:hover::after,
.resize-handle.dragging::after {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
}

/* ═══════════════════════════════════════════════════════
   POPPED-OUT MODE
   ═══════════════════════════════════════════════════════ */
:host(.popped-out) .control-surface {
  width: 100% !important;
  transform: none !important;
}

:host(.popped-out) .drawer {
  width: 100%;
}

:host(.popped-out) .edge-tab,
:host(.popped-out) .resize-handle {
  display: none;
}
`;
