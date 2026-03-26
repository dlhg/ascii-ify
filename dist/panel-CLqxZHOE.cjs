"use strict";Object.defineProperty(exports,Symbol.toStringTag,{value:"Module"});const g=require("./index-faP_uxei.cjs"),_=`
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

.close-btn {
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

.close-btn:hover {
  color: var(--text-1);
  border-color: var(--border-3);
  background: var(--bg-track);
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
`;function o(c,e,t){const r=document.createElement(c);return e&&(r.className=e),typeof t=="string"?r.textContent=t:t instanceof Node?r.appendChild(t):Array.isArray(t)&&t.forEach(i=>{i&&r.appendChild(i)}),r}class d{constructor(e){this.min=e.min,this.max=e.max,this.step=e.step??null,this.get=e.get,this.set=e.set,this.format=e.format||(r=>String(Math.round(r*100)/100)),this._lastValue=this.get(),this.el=o("div","bar-ctrl");const t=o("div","bar-ctrl-header");t.appendChild(o("span","ctrl-label",e.label)),this.valueEl=o("span","ctrl-value",this.format(this.get())),t.appendChild(this.valueEl),this.el.appendChild(t),this.track=o("div","bar-track"),this.fill=o("div","bar-fill"),this.track.appendChild(this.fill),this.el.appendChild(this.track),this._updateFill(),this._bindDrag()}_bindDrag(){const e=t=>{t.preventDefault(),this.track.classList.add("dragging"),this._setFromPointer(t);const r=a=>{a.preventDefault(),this._setFromPointer(a)},i=()=>{this.track.classList.remove("dragging"),document.removeEventListener("mousemove",r),document.removeEventListener("mouseup",i),document.removeEventListener("touchmove",r),document.removeEventListener("touchend",i)};document.addEventListener("mousemove",r),document.addEventListener("mouseup",i),document.addEventListener("touchmove",r,{passive:!1}),document.addEventListener("touchend",i)};this.track.addEventListener("mousedown",e),this.track.addEventListener("touchstart",t=>{t.preventDefault(),e(t.touches[0])},{passive:!1})}_setFromPointer(e){var l,s;const t=e.clientX??((s=(l=e.touches)==null?void 0:l[0])==null?void 0:s.clientX)??0,r=this.track.getBoundingClientRect();let i=(t-r.left)/r.width;i=Math.max(0,Math.min(1,i));let a=this.min+i*(this.max-this.min);this.step!=null&&(a=Math.round(a/this.step)*this.step,a=Math.max(this.min,Math.min(this.max,a))),this.set(a),this.update()}_updateFill(){const e=this.get(),t=this.max-this.min,r=t>0?(e-this.min)/t:0;this.fill.style.width=Math.max(0,Math.min(1,r))*100+"%"}update(){this._updateFill(),this.valueEl.textContent=this.format(this.get()),this._lastValue=this.get()}sync(){this.get()!==this._lastValue&&this.update()}}class p{constructor(e){this.options=e.options,this.get=e.get,this.set=e.set,this._lastValue=this.get(),this.el=o("div","ctrl-selector"),e.label&&this.el.appendChild(o("div","ctrl-label",e.label));const t=o("div","selector"),r=o("button","sel-arrow","‹");this.display=o("span","sel-display",this.options[this.get()]||"");const i=o("button","sel-arrow","›");r.addEventListener("click",()=>{const a=(this.get()-1+this.options.length)%this.options.length;this.set(a),this.update()}),i.addEventListener("click",()=>{const a=(this.get()+1)%this.options.length;this.set(a),this.update()}),t.appendChild(r),t.appendChild(this.display),t.appendChild(i),this.el.appendChild(t)}update(){this.display.textContent=this.options[this.get()]||"",this._lastValue=this.get()}sync(){this.get()!==this._lastValue&&this.update()}}class v{constructor(e){this.get=e.get,this.set=e.set,this._lastValue=this.get(),this.el=o("div","toggle-row"),this.pill=o("div","toggle-pill"),this.get()&&this.pill.classList.add("on"),this.pill.addEventListener("click",()=>{this.set(!this.get()),this.update()}),this.el.appendChild(this.pill),this.el.appendChild(o("span","toggle-label",e.label))}update(){this.pill.classList.toggle("on",this.get()),this._lastValue=this.get()}sync(){this.get()!==this._lastValue&&this.update()}}const b=g.CHARSETS.map(c=>c.name),f=g.EDGE_CHARSETS.map(c=>c.name),u=g.COLOR_SCHEMES.map(c=>c.name),m=["none",...g.PATTERNS.map(c=>c.name)],x=["replace","add"];class y{constructor(e,t={}){this._ascii=e,this._controls=[],this._layerTabs=new Map,this._activeLayer=null,this._visible=!1,this._rafId=null,this._host=document.createElement("div"),this._host.style.cssText="position:absolute;top:0;left:0;right:0;bottom:0;z-index:10000;pointer-events:none;",this._shadow=this._host.attachShadow({mode:"closed"});const r=document.createElement("style");r.textContent=_,this._shadow.appendChild(r),this._surface=o("div","control-surface hidden"),this._shadow.appendChild(this._surface),this._buildDrawer(),this._onLayerAdd=a=>this._addLayerTab(a),this._onLayerRemove=a=>this._removeLayerTab(a),e.on("layeradd",this._onLayerAdd),e.on("layerremove",this._onLayerRemove);const i=e._source.parentElement;i&&i.appendChild(this._host)}get visible(){return this._visible}show(){this._visible=!0,this._surface.classList.remove("hidden"),this._startSync()}hide(){this._visible=!1,this._surface.classList.add("hidden"),this._stopSync()}toggle(){this._visible?this.hide():this.show()}destroy(){this._stopSync(),this._ascii.off("layeradd",this._onLayerAdd),this._ascii.off("layerremove",this._onLayerRemove),this._host.parentElement&&this._host.parentElement.removeChild(this._host),this._controls=[],this._layerTabs.clear()}_buildDrawer(){this._surface.innerHTML="";const e=o("div","edge-tab");e.appendChild(o("span","edge-tab-icon","›")),e.addEventListener("click",()=>this.toggle()),this._surface.appendChild(e);const t=o("div","drawer"),r=o("div","drawer-header");r.appendChild(o("span","drawer-title","Controls"));const i=o("div","header-btn-group"),a=o("div","close-btn","×");a.addEventListener("click",()=>this.hide()),i.appendChild(a),r.appendChild(i),t.appendChild(r),this._scroll=o("div","drawer-scroll"),this._buildAsciiSection(),this._buildCRTSection(),this._tabBar=o("div","layer-tabs");const l=o("button","add-layer-btn","+");l.title="Add layer",l.addEventListener("click",()=>{this._ascii.addLayer({source:this._ascii._source,blendMode:"add",opacity:.5})}),this._tabBar.appendChild(l),this._layerContent=o("div",""),this._noLayersMsg=o("div","no-layers-msg","No layers added"),this._scroll.appendChild(this._asciiSection),this._scroll.appendChild(this._crtSection),this._scroll.appendChild(this._tabBar),this._scroll.appendChild(this._layerContent),this._scroll.appendChild(this._noLayersMsg),t.appendChild(this._scroll),this._surface.appendChild(t);for(const s of this._ascii._layers)this._addLayerTab(s)}_buildAsciiSection(){const e=o("div","section"),t=this._ascii,r=g.PARAM_RANGES,i=o("div","section-title");i.appendChild(o("span","","ASCII")),i.appendChild(o("span","section-chevron","▼")),i.addEventListener("click",()=>e.classList.toggle("collapsed")),e.appendChild(i);const a=o("div","section-body");this._register(new v({label:"Enabled",get:()=>t.get("enabled"),set:n=>t.set("enabled",n)}),a),this._register(new d({label:"Font Size",...r.fontSize,get:()=>t.get("fontSize"),set:n=>t.set("fontSize",n),format:n=>n.toFixed(1)+"px"}),a),this._register(new d({label:"Density",...r.density,get:()=>t.get("density"),set:n=>t.set("density",n),format:n=>n.toFixed(2)}),a),this._register(new p({label:"Charset",options:b,get:()=>b.indexOf(t.get("charset")),set:n=>t.set("charset",b[n])}),a),this._register(new v({label:"Edge Detect",get:()=>t.get("edgeDetect"),set:n=>t.set("edgeDetect",n)}),a),this._register(new d({label:"Edge Threshold",...r.edgeThreshold,get:()=>t.get("edgeThreshold"),set:n=>t.set("edgeThreshold",n),format:n=>Math.round(n*100)+"%"}),a),this._register(new p({label:"Edge Charset",options:f,get:()=>f.indexOf(t.get("edgeCharset")),set:n=>t.set("edgeCharset",f[n])}),a),this._register(new p({label:"Color",options:u,get:()=>u.indexOf(t.get("colorScheme")),set:n=>t.set("colorScheme",u[n])}),a),this._register(new p({label:"Pattern",options:m,get:()=>{const n=t.get("pattern");return n?m.indexOf(n):0},set:n=>t.set("pattern",n===0?null:m[n])}),a),this._register(new d({label:"Pattern Mix",...r.patternMix,get:()=>t.get("patternMix"),set:n=>t.set("patternMix",n),format:n=>Math.round(n*100)+"%"}),a),this._register(new d({label:"Fade",...r.fade,get:()=>t.get("fade"),set:n=>t.set("fade",n),format:n=>Math.round(n*100)+"%"}),a),this._register(new d({label:"Speed",...r.speed,get:()=>t.get("speed"),set:n=>t.set("speed",n),format:n=>n.toFixed(1)+"x"}),a),this._register(new d({label:"Source Opacity",...r.sourceOpacity,get:()=>t.get("sourceOpacity"),set:n=>t.set("sourceOpacity",n),format:n=>Math.round(n*100)+"%"}),a),this._register(new v({label:"Color Cycle",get:()=>t.get("colorCycle"),set:n=>t.set("colorCycle",n)}),a),this._register(new d({label:"Cycle Rate",...r.colorCycleRate,get:()=>t.get("colorCycleRate"),set:n=>t.set("colorCycleRate",n),format:n=>n.toFixed(1)+"/s"}),a);const l=o("div","action-row"),s=o("button","ctrl-btn randomize-btn","Randomize");s.title="Randomize all parameters",s.addEventListener("click",()=>this._randomize()),l.appendChild(s);const h=o("button","ctrl-btn copy-btn","Copy");h.title="Copy all values as JSON",h.addEventListener("click",()=>this._copySnapshot()),l.appendChild(h),a.appendChild(l),e.appendChild(a),this._asciiSection=e}_buildCRTSection(){const e=o("div","section collapsed"),t=this._ascii,r=g.PARAM_RANGES,i=o("div","section-title");i.appendChild(o("span","","CRT")),i.appendChild(o("span","section-chevron","▼")),i.addEventListener("click",()=>e.classList.toggle("collapsed")),e.appendChild(i);const a=o("div","section-body");this._register(new v({label:"CRT Enabled",get:()=>t.get("crtEnabled"),set:l=>t.set("crtEnabled",l)}),a),this._register(new d({label:"Scanlines",...r.crtScanlines,get:()=>t.get("crtScanlines"),set:l=>t.set("crtScanlines",l),format:l=>Math.round(l*100)+"%"}),a),this._register(new d({label:"Glow",...r.crtGlow,get:()=>t.get("crtGlow"),set:l=>t.set("crtGlow",l),format:l=>Math.round(l*100)+"%"}),a),this._register(new d({label:"Distortion",...r.crtDistortion,get:()=>t.get("crtDistortion"),set:l=>t.set("crtDistortion",l),format:l=>l.toFixed(2)}),a),this._register(new d({label:"Flicker",...r.crtFlicker,get:()=>t.get("crtFlicker"),set:l=>t.set("crtFlicker",l),format:l=>Math.round(l*100)+"%"}),a),e.appendChild(a),this._crtSection=e}_addLayerTab(e){const t=o("div","layer-row"),r=o("span","layer-row-label",`Layer ${e.id}`);r.addEventListener("click",()=>this._activateLayer(e));const i=o("div","layer-row-btns"),a=o("button","ctrl-btn layer-hide-btn","Hide");a.addEventListener("click",h=>{h.stopPropagation(),e.set("visible",!e.get("visible"))});const l=o("button","ctrl-btn layer-solo-btn","Solo");l.addEventListener("click",h=>{h.stopPropagation(),this._ascii.soloLayer(e),this._updateSoloBtns()}),i.appendChild(a),i.appendChild(l),t.appendChild(r),t.appendChild(i),this._tabBar.appendChild(t);const s=o("div","layer-tab-content");this._buildLayerContent(e,s),this._layerContent.appendChild(s),this._layerTabs.set(e,{tab:t,content:s,hideBtn:a,soloBtn:l}),this._noLayersMsg.style.display="none",this._activateLayer(e)}_removeLayerTab(e){const t=this._layerTabs.get(e);if(t){if(t.tab.remove(),t.content.remove(),this._layerTabs.delete(e),this._activeLayer===e){this._activeLayer=null;const r=this._layerTabs.keys().next().value;r&&this._activateLayer(r)}this._layerTabs.size===0&&(this._noLayersMsg.style.display="")}}_activateLayer(e){this._activeLayer=e;for(const[t,r]of this._layerTabs){const i=t===e;r.tab.classList.toggle("active",i),r.content.classList.toggle("active",i)}this._updateSoloBtns()}_buildLayerContent(e,t){const r=g.PARAM_RANGES,i=o("div","layer-header");i.appendChild(o("span","layer-title",`Layer ${e.id}`));const a=o("div","layer-btn-group"),l=o("button","ctrl-btn danger","Remove");l.addEventListener("click",()=>this._ascii.removeLayer(e)),a.appendChild(l),i.appendChild(a),t.appendChild(i),t._layer=e,this._register(new d({label:"Font Size",...r.fontSize,get:()=>e.get("fontSize"),set:s=>e.set("fontSize",s),format:s=>s.toFixed(1)+"px"}),t),this._register(new d({label:"Density",...r.density,get:()=>e.get("density"),set:s=>e.set("density",s),format:s=>s.toFixed(2)}),t),this._register(new p({label:"Charset",options:["inherit",...b],get:()=>{const s=e.get("charset");return s?b.indexOf(s)+1:0},set:s=>e.set("charset",s===0?null:b[s-1])}),t),this._register(new v({label:"Edge Detect",get:()=>e.get("edgeDetect"),set:s=>e.set("edgeDetect",s)}),t),this._register(new d({label:"Edge Threshold",...g.PARAM_RANGES.edgeThreshold,get:()=>e.get("edgeThreshold"),set:s=>e.set("edgeThreshold",s),format:s=>Math.round(s*100)+"%"}),t),this._register(new p({label:"Edge Charset",options:f,get:()=>f.indexOf(e.get("edgeCharset")),set:s=>e.set("edgeCharset",f[s])}),t),this._register(new p({label:"Color",options:["inherit",...u],get:()=>{const s=e.get("colorScheme");return s?u.indexOf(s)+1:0},set:s=>e.set("colorScheme",s===0?null:u[s-1])}),t),this._register(new p({label:"Pattern",options:m,get:()=>{const s=e.get("pattern");return s?m.indexOf(s):0},set:s=>e.set("pattern",s===0?null:m[s])}),t),this._register(new d({label:"Pattern Mix",...r.patternMix,get:()=>e.get("patternMix"),set:s=>e.set("patternMix",s),format:s=>Math.round(s*100)+"%"}),t),this._register(new d({label:"Opacity",...r.opacity,get:()=>e.get("opacity"),set:s=>e.set("opacity",s),format:s=>Math.round(s*100)+"%"}),t),this._register(new d({label:"Fade",...r.fade,get:()=>e.get("fade"),set:s=>e.set("fade",s),format:s=>Math.round(s*100)+"%"}),t),this._register(new p({label:"Blend",options:x,get:()=>x.indexOf(e.get("blendMode")),set:s=>e.set("blendMode",x[s])}),t),this._register(new d({label:"Offset X",...r.offsetX,get:()=>e.get("offsetX"),set:s=>e.set("offsetX",s),format:s=>Math.round(s)+"px"}),t),this._register(new d({label:"Offset Y",...r.offsetY,get:()=>e.get("offsetY"),set:s=>e.set("offsetY",s),format:s=>Math.round(s)+"px"}),t),this._register(new d({label:"Z-Index",...r.zIndex,get:()=>e.get("zIndex"),set:s=>e.set("zIndex",s),format:s=>String(Math.round(s))}),t)}_updateSoloBtns(){const e=this._ascii._soloLayer;for(const[t,r]of this._layerTabs)r.soloBtn&&r.soloBtn.classList.toggle("active",e===t)}_register(e,t){return this._controls.push(e),t.appendChild(e.el),e}_randomize(){const e=this._ascii,t=g.PARAM_RANGES,r=(a,l,s)=>{const h=Math.round((l-a)/s);return a+Math.round(Math.random()*h)*s},i=a=>a[Math.floor(Math.random()*a.length)];e.set("fontSize",r(t.fontSize.min,t.fontSize.max,t.fontSize.step)),e.set("density",r(t.density.min,t.density.max,t.density.step)),e.set("charset",i(b)),e.set("colorScheme",i(u)),e.set("pattern",Math.random()<.3?null:i(m.slice(1))),e.set("patternMix",r(t.patternMix.min,t.patternMix.max,t.patternMix.step)),e.set("fade",r(t.fade.min,t.fade.max,t.fade.step)),e.set("speed",r(t.speed.min,t.speed.max,t.speed.step)),e.set("sourceOpacity",r(t.sourceOpacity.min,t.sourceOpacity.max,t.sourceOpacity.step)),e.set("colorCycle",Math.random()<.3),e.set("colorCycleRate",r(t.colorCycleRate.min,t.colorCycleRate.max,t.colorCycleRate.step)),e.set("edgeDetect",Math.random()<.2),e.set("edgeThreshold",r(t.edgeThreshold.min,t.edgeThreshold.max,t.edgeThreshold.step)),e.set("edgeCharset",i(f)),e.set("crtEnabled",Math.random()<.25),e.set("crtScanlines",r(t.crtScanlines.min,t.crtScanlines.max,t.crtScanlines.step)),e.set("crtGlow",r(t.crtGlow.min,t.crtGlow.max,t.crtGlow.step)),e.set("crtDistortion",r(t.crtDistortion.min,t.crtDistortion.max,t.crtDistortion.step)),e.set("crtFlicker",r(t.crtFlicker.min,t.crtFlicker.max,t.crtFlicker.step));for(const a of e._layers)a.set("fontSize",r(t.fontSize.min,t.fontSize.max,t.fontSize.step)),a.set("density",r(t.density.min,t.density.max,t.density.step)),a.set("charset",i(b)),a.set("colorScheme",i(u)),a.set("pattern",Math.random()<.3?null:i(m.slice(1))),a.set("patternMix",r(t.patternMix.min,t.patternMix.max,t.patternMix.step)),a.set("fade",r(t.fade.min,t.fade.max,t.fade.step)),a.set("opacity",r(t.opacity.min,t.opacity.max,t.opacity.step)),a.set("blendMode",i(x)),a.set("edgeDetect",Math.random()<.2),a.set("edgeThreshold",r(t.edgeThreshold.min,t.edgeThreshold.max,t.edgeThreshold.step)),a.set("edgeCharset",i(f))}_copySnapshot(){const e=this._ascii,t=["enabled","fontSize","density","charset","colorScheme","background","fade","speed","pattern","patternMix","colorCycle","colorCycleRate","sourceOpacity","opacity","blendMode","offsetX","offsetY","zIndex","edgeDetect","edgeThreshold","edgeCharset","crtEnabled","crtScanlines","crtGlow","crtDistortion","crtFlicker"],r=["visible","fontSize","density","charset","colorScheme","pattern","patternMix","fade","opacity","blendMode","offsetX","offsetY","zIndex","edgeDetect","edgeThreshold","edgeCharset"],i={};for(const l of t)i[l]=e.get(l);e._layers.length>0&&!e._implicitMode&&(i.layers=e._layers.map(l=>{const s={};for(const h of r)s[h]=l.get(h);return s}));const a=JSON.stringify(i,null,2);navigator.clipboard.writeText(a).then(()=>{this._flashCopyBtn("Copied!")},()=>{this._flashCopyBtn("Failed")})}_flashCopyBtn(e){const t=this._shadow.querySelector(".copy-btn");if(!t)return;const r=t.textContent;t.textContent=e,t.classList.add("flash"),setTimeout(()=>{t.textContent=r,t.classList.remove("flash")},1200)}_startSync(){if(this._rafId)return;const e=()=>{for(const t of this._controls)t.sync();this._syncEyeIcons(),this._rafId=requestAnimationFrame(e)};this._rafId=requestAnimationFrame(e)}_syncEyeIcons(){for(const[e,t]of this._layerTabs)if(t.hideBtn){const r=e.get("visible");t.hideBtn.textContent=r?"Hide":"Show",t.tab.classList.toggle("layer-hidden",!r)}}_stopSync(){this._rafId&&(cancelAnimationFrame(this._rafId),this._rafId=null)}}exports.ControlPanel=y;
//# sourceMappingURL=panel-CLqxZHOE.cjs.map
