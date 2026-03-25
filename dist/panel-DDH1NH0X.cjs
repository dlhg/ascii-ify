"use strict";Object.defineProperty(exports,Symbol.toStringTag,{value:"Module"});const g=require("./index-Bb_h5dSz.cjs"),m=`
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
  overflow-y: auto;
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
.panel::-webkit-scrollbar {
  width: 4px;
}
.panel::-webkit-scrollbar-track {
  background: transparent;
}
.panel::-webkit-scrollbar-thumb {
  background: var(--border-2);
  border-radius: 2px;
}
`;function a(n,t,e){const s=document.createElement(n);return t&&(s.className=t),typeof e=="string"?s.textContent=e:e instanceof Node?s.appendChild(e):Array.isArray(e)&&e.forEach(r=>{r&&s.appendChild(r)}),s}class l{constructor(t){this.min=t.min,this.max=t.max,this.step=t.step??null,this.get=t.get,this.set=t.set,this.format=t.format||(s=>String(Math.round(s*100)/100)),this._lastValue=this.get(),this.el=a("div","bar-ctrl");const e=a("div","bar-ctrl-header");e.appendChild(a("span","ctrl-label",t.label)),this.valueEl=a("span","ctrl-value",this.format(this.get())),e.appendChild(this.valueEl),this.el.appendChild(e),this.track=a("div","bar-track"),this.fill=a("div","bar-fill"),this.track.appendChild(this.fill),this.el.appendChild(this.track),this._updateFill(),this._bindDrag()}_bindDrag(){const t=e=>{e.preventDefault(),this.track.classList.add("dragging"),this._setFromPointer(e);const s=o=>{o.preventDefault(),this._setFromPointer(o)},r=()=>{this.track.classList.remove("dragging"),document.removeEventListener("mousemove",s),document.removeEventListener("mouseup",r),document.removeEventListener("touchmove",s),document.removeEventListener("touchend",r)};document.addEventListener("mousemove",s),document.addEventListener("mouseup",r),document.addEventListener("touchmove",s,{passive:!1}),document.addEventListener("touchend",r)};this.track.addEventListener("mousedown",t),this.track.addEventListener("touchstart",e=>{e.preventDefault(),t(e.touches[0])},{passive:!1})}_setFromPointer(t){var i,u;const e=t.clientX??((u=(i=t.touches)==null?void 0:i[0])==null?void 0:u.clientX)??0,s=this.track.getBoundingClientRect();let r=(e-s.left)/s.width;r=Math.max(0,Math.min(1,r));let o=this.min+r*(this.max-this.min);this.step!=null&&(o=Math.round(o/this.step)*this.step,o=Math.max(this.min,Math.min(this.max,o))),this.set(o),this.update()}_updateFill(){const t=this.get(),e=this.max-this.min,s=e>0?(t-this.min)/e:0;this.fill.style.width=Math.max(0,Math.min(1,s))*100+"%"}update(){this._updateFill(),this.valueEl.textContent=this.format(this.get()),this._lastValue=this.get()}sync(){this.get()!==this._lastValue&&this.update()}}class d{constructor(t){this.options=t.options,this.get=t.get,this.set=t.set,this._lastValue=this.get(),this.el=a("div","ctrl-selector"),t.label&&this.el.appendChild(a("div","ctrl-label",t.label));const e=a("div","selector"),s=a("button","sel-arrow","‹");this.display=a("span","sel-display",this.options[this.get()]||"");const r=a("button","sel-arrow","›");s.addEventListener("click",()=>{const o=(this.get()-1+this.options.length)%this.options.length;this.set(o),this.update()}),r.addEventListener("click",()=>{const o=(this.get()+1)%this.options.length;this.set(o),this.update()}),e.appendChild(s),e.appendChild(this.display),e.appendChild(r),this.el.appendChild(e)}update(){this.display.textContent=this.options[this.get()]||"",this._lastValue=this.get()}sync(){this.get()!==this._lastValue&&this.update()}}class v{constructor(t){this.get=t.get,this.set=t.set,this._lastValue=this.get(),this.el=a("div","toggle-row"),this.pill=a("div","toggle-pill"),this.get()&&this.pill.classList.add("on"),this.pill.addEventListener("click",()=>{this.set(!this.get()),this.update()}),this.el.appendChild(this.pill),this.el.appendChild(a("span","toggle-label",t.label))}update(){this.pill.classList.toggle("on",this.get()),this._lastValue=this.get()}sync(){this.get()!==this._lastValue&&this.update()}}const c=g.CHARSETS.map(n=>n.name),h=g.COLOR_SCHEMES.map(n=>n.name),p=["none",...g.PATTERNS.map(n=>n.name)],b=["replace","add"];class f{constructor(t,e={}){this._ascii=t,this._controls=[],this._layerSections=new Map,this._visible=!1,this._rafId=null,this._host=document.createElement("div"),this._host.style.cssText="position:absolute;bottom:0;left:0;right:0;z-index:10000;pointer-events:none;",this._shadow=this._host.attachShadow({mode:"closed"});const s=document.createElement("style");s.textContent=m,this._shadow.appendChild(s),this._surface=a("div","control-surface hidden"),this._surface.style.pointerEvents="auto",this._shadow.appendChild(this._surface),this._buildPanels(),this._onLayerAdd=o=>this._addLayerSection(o),this._onLayerRemove=o=>this._removeLayerSection(o),t.on("layeradd",this._onLayerAdd),t.on("layerremove",this._onLayerRemove);const r=t._source.parentElement;r&&r.appendChild(this._host)}get visible(){return this._visible}show(){this._visible=!0,this._surface.classList.remove("hidden"),this._startSync()}hide(){this._visible=!1,this._surface.classList.add("hidden"),this._stopSync()}destroy(){this._stopSync(),this._ascii.off("layeradd",this._onLayerAdd),this._ascii.off("layerremove",this._onLayerRemove),this._host.parentElement&&this._host.parentElement.removeChild(this._host),this._controls=[],this._layerSections.clear()}_buildPanels(){this._surface.innerHTML="",this._instancePanel=this._buildInstancePanel(),this._surface.appendChild(this._instancePanel),this._layersContainer=a("div","panel"),this._layersContainer.appendChild(a("div","panel-title","Layers")),this._layersContent=a("div",""),this._layersContainer.appendChild(this._layersContent);for(const t of this._ascii._layers)this._addLayerSection(t);this._surface.appendChild(this._layersContainer)}_buildInstancePanel(){const t=a("div","panel");t.appendChild(a("div","panel-title","ASCII"));const e=this._ascii,s=g.PARAM_RANGES;return this._register(new l({label:"Font Size",...s.fontSize,get:()=>e.get("fontSize"),set:r=>e.set("fontSize",r),format:r=>r.toFixed(1)+"px"}),t),this._register(new l({label:"Density",...s.density,get:()=>e.get("density"),set:r=>e.set("density",r),format:r=>r.toFixed(2)}),t),this._register(new d({label:"Charset",options:c,get:()=>c.indexOf(e.get("charset")),set:r=>e.set("charset",c[r])}),t),this._register(new d({label:"Color",options:h,get:()=>h.indexOf(e.get("colorScheme")),set:r=>e.set("colorScheme",h[r])}),t),this._register(new d({label:"Pattern",options:p,get:()=>{const r=e.get("pattern");return r?p.indexOf(r):0},set:r=>e.set("pattern",r===0?null:p[r])}),t),this._register(new l({label:"Pattern Mix",...s.patternMix,get:()=>e.get("patternMix"),set:r=>e.set("patternMix",r),format:r=>Math.round(r*100)+"%"}),t),this._register(new l({label:"Fade",...s.fade,get:()=>e.get("fade"),set:r=>e.set("fade",r),format:r=>Math.round(r*100)+"%"}),t),this._register(new l({label:"Speed",...s.speed,get:()=>e.get("speed"),set:r=>e.set("speed",r),format:r=>r.toFixed(1)+"x"}),t),this._register(new l({label:"Source Opacity",...s.sourceOpacity,get:()=>e.get("sourceOpacity"),set:r=>e.set("sourceOpacity",r),format:r=>Math.round(r*100)+"%"}),t),this._register(new v({label:"Color Cycle",get:()=>e.get("colorCycle"),set:r=>e.set("colorCycle",r)}),t),this._register(new l({label:"Cycle Rate",...s.colorCycleRate,get:()=>e.get("colorCycleRate"),set:r=>e.set("colorCycleRate",r),format:r=>r.toFixed(1)+"/s"}),t),t}_addLayerSection(t){const e=a("div",""),s=g.PARAM_RANGES,r=a("div","layer-header");r.appendChild(a("span","layer-title",`Layer ${t.id}`));const o=a("button","ctrl-btn danger","Remove");o.addEventListener("click",()=>this._ascii.removeLayer(t)),r.appendChild(o),e.appendChild(r),this._register(new v({label:"Visible",get:()=>t.get("visible"),set:i=>t.set("visible",i)}),e),this._register(new l({label:"Font Size",...s.fontSize,get:()=>t.get("fontSize"),set:i=>t.set("fontSize",i),format:i=>i.toFixed(1)+"px"}),e),this._register(new l({label:"Density",...s.density,get:()=>t.get("density"),set:i=>t.set("density",i),format:i=>i.toFixed(2)}),e),this._register(new d({label:"Charset",options:["inherit",...c],get:()=>{const i=t.get("charset");return i?c.indexOf(i)+1:0},set:i=>t.set("charset",i===0?null:c[i-1])}),e),this._register(new d({label:"Color",options:["inherit",...h],get:()=>{const i=t.get("colorScheme");return i?h.indexOf(i)+1:0},set:i=>t.set("colorScheme",i===0?null:h[i-1])}),e),this._register(new d({label:"Pattern",options:p,get:()=>{const i=t.get("pattern");return i?p.indexOf(i):0},set:i=>t.set("pattern",i===0?null:p[i])}),e),this._register(new l({label:"Pattern Mix",...s.patternMix,get:()=>t.get("patternMix"),set:i=>t.set("patternMix",i),format:i=>Math.round(i*100)+"%"}),e),this._register(new l({label:"Opacity",...s.opacity,get:()=>t.get("opacity"),set:i=>t.set("opacity",i),format:i=>Math.round(i*100)+"%"}),e),this._register(new d({label:"Blend",options:b,get:()=>b.indexOf(t.get("blendMode")),set:i=>t.set("blendMode",b[i])}),e),e.appendChild(a("div","ctrl-divider")),this._layersContent.appendChild(e),this._layerSections.set(t,e)}_removeLayerSection(t){const e=this._layerSections.get(t);e&&e.parentElement&&e.parentElement.removeChild(e),this._layerSections.delete(t)}_register(t,e){return this._controls.push(t),e.appendChild(t.el),t}_startSync(){if(this._rafId)return;const t=()=>{for(const e of this._controls)e.sync();this._rafId=requestAnimationFrame(t)};this._rafId=requestAnimationFrame(t)}_stopSync(){this._rafId&&(cancelAnimationFrame(this._rafId),this._rafId=null)}}exports.ControlPanel=f;
//# sourceMappingURL=panel-DDH1NH0X.cjs.map
