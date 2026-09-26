// ─── Shared Audio Dock for Examples ───────────────────────────
// Small bottom-center bar: load a file, use the mic, transport controls.
// Returns the AudioAnalyzer so scenes can read audio.levels / audio.on().

import { AudioAnalyzer } from '../src/index.js';

const CSS = `
#audio-dock { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
  display: flex; gap: 10px; align-items: center; padding: 8px 12px;
  font: 12px/1 ui-monospace, Menlo, monospace; color: #cfd3e6;
  background: rgba(10, 10, 20, 0.78); border: 1px solid #2a2c44; border-radius: 8px;
  backdrop-filter: blur(6px); z-index: 10; transition: opacity 0.4s;
  white-space: nowrap; max-width: calc(100vw - 24px); }
#audio-dock.hidden { opacity: 0; pointer-events: none; }
#audio-dock button, #audio-dock label.btn { font: inherit; color: inherit; cursor: pointer;
  padding: 6px 10px; background: #171830; border: 1px solid #34375a; border-radius: 5px; }
#audio-dock button:hover, #audio-dock label.btn:hover { background: #22244a; }
#audio-dock input[type=file] { display: none; }
#audio-dock audio { height: 30px; width: 220px; }
#audio-dock .react { display: flex; gap: 6px; align-items: center; color: #8b90b8; }
#audio-dock .react input { width: 80px; accent-color: #7f86ff; }
#audio-dock .status { min-width: 96px; overflow: hidden; text-overflow: ellipsis; color: #8b90b8; }
#audio-dock button.on { background: #3a1626; border-color: #ff5a7a; color: #ffd0da; }
#audio-dock button.on::before { content: '● '; color: #ff5a7a; animation: audio-blink 1.2s infinite; }
@keyframes audio-blink { 50% { opacity: 0.3; } }
#audio-dock .meter { display: flex; gap: 2px; align-items: flex-end; height: 26px; width: 44px; }
#audio-dock .meter i { flex: 1; background: #7f86ff; min-height: 2px; height: 2px; border-radius: 1px; }
#audio-dock .meter i.hit { background: #ff5a7a; }
body.audio-drag #audio-dock { border-color: #7f86ff; }
`;

export function createAudioDock({ audio = new AudioAnalyzer(), parent = document.body, intensity = false, onIntensity = null, onOpenPanel = null } = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'audio-dock';
  el.innerHTML = `
    <label class="btn">Load audio<input type="file" accept="audio/*" /></label>
    <button data-mic>Use mic</button>
    <audio controls></audio>
    ${onOpenPanel ? '<button data-panel title="Open the audio controls (`)">Controls</button>' : ''}
    <span class="meter" title="bass · mid · high · kick"><i></i><i></i><i></i><i class="hit"></i></span>
    ${intensity ? '<label class="react" title="How strongly scenes react to sound">React <input type="range" min="0" max="3" step="0.05" value="1" /></label>' : ''}
    <span class="status">drop a file · H hides</span>`;
  parent.appendChild(el);

  const player = el.querySelector('audio');
  const status = el.querySelector('.status');

  async function useFile(file) {
    if (!file) return;
    setMic(false);
    player.src = URL.createObjectURL(file);
    await audio.connectElement(player);
    await player.play();
    status.textContent = file.name.slice(0, 22);
  }

  el.querySelector('input[type=file]').addEventListener('change', (e) => useFile(e.target.files[0]));
  el.querySelector('[data-panel]')?.addEventListener('click', () => onOpenPanel?.());
  const micBtn = el.querySelector('[data-mic]');
  let micOn = false;
  function setMic(on) {
    micOn = on;
    micBtn.classList.toggle('on', on);
    micBtn.textContent = on ? 'Mic on' : 'Use mic';
  }
  async function toggleMic() {
    if (micOn) {
      audio.stop();
      setMic(false);
      status.textContent = 'mic off';
      return;
    }
    try {
      player.pause();
      await audio.connectMic();
      setMic(true);
      status.textContent = 'listening…';
    } catch {
      status.textContent = 'mic blocked — allow it in the address bar';
    }
  }
  micBtn.addEventListener('click', toggleMic);
  // Loading a file replaces the mic input
  // Starting playback from the element's own controls needs the context awake
  player.addEventListener('play', () => audio.resume());

  const slider = el.querySelector('.react input');
  if (slider) {
    try { slider.value = localStorage.getItem('ascii-audio-react-v2') ?? slider.value; } catch { /* storage unavailable */ }
    slider.addEventListener('input', () => {
      try { localStorage.setItem('ascii-audio-react-v2', slider.value); } catch { /* storage unavailable */ }
      onIntensity?.(Number(slider.value));
    });
  }

  // Live meters: proof the signal is arriving, and what the analyzer hears
  const bars = [...el.querySelectorAll('.meter i')];
  (function tick() {
    const lv = audio.connected ? audio.levels : null;
    const vals = lv ? [lv.bass, lv.mid, lv.high, lv.kick] : [0, 0, 0, 0];
    bars.forEach((b, i) => { b.style.height = `${2 + vals[i] * 24}px`; });
    requestAnimationFrame(tick);
  })();

  window.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('audio-drag'); });
  window.addEventListener('dragleave', () => document.body.classList.remove('audio-drag'));
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('audio-drag');
    useFile(e.dataTransfer.files[0]);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') el.classList.toggle('hidden');
  });

  // The recipe reports its starting intensity; a saved slider position wins over it.
  function setIntensity(k) {
    if (!slider) return;
    let saved = null;
    try { saved = localStorage.getItem('ascii-audio-react-v2'); } catch { /* storage unavailable */ }
    if (saved == null) slider.value = k;
    onIntensity?.(Number(slider.value));
  }

  // Used by the audio panel, which shows the same controls in its own layout.
  function setReactivity(k) {
    if (slider) slider.value = k;
    try { localStorage.setItem('ascii-audio-react-v2', String(k)); } catch { /* storage unavailable */ }
    onIntensity?.(k);
  }

  return {
    audio, el, player, useFile, toggleMic, setIntensity, setReactivity,
    get micOn() { return micOn; },
    get status() { return status.textContent; },
    get reactivity() { return slider ? Number(slider.value) : 1; },
    setHidden: (hide) => el.classList.toggle('hidden', hide),
    toggle: () => el.classList.toggle('hidden'),
  };
}
