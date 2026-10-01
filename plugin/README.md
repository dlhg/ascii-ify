# ASCII Visuals for Ableton — local prototype

A macOS VST3 audio effect that drives the existing ASCII renderer from Live's audio.
One device can react to any track in the Set: it receives tracks over Ableton
Link Audio (Live 12.4+) and meters the track it sits on. No Max for Live, Apple membership, virtual audio driver, microphone permission, or
separate server is needed to use the built plugin. This build is ad hoc signed for
local testing; it is not notarized for public distribution.

## Try it

1. Put `ASCII Visuals.vst3` in `~/Library/Audio/Plug-Ins/VST3/`.
2. In Ableton's Settings → Plug-ins, enable **Use VST3 Plug-In System Folders**.
   Restart Live or rescan if the plugin doesn't appear. Option-click **Rescan**
   for a full scan if needed.
3. Add **ASCII Visuals** to any track, e.g. the end of the Main track's effects chain.
4. To use other tracks, turn on **Link** and **Link Audio** in Live's Settings → Link.
   Live then shares every track by name; nothing else needs to be routed.
5. Open the plugin window and click **Open Visuals**. Press play in Live.
6. Choose from **55 library scenes**, edit **Audio mappings**, and use Fullscreen.
   Press **H** to hide/show the controls.

## Control what the audio changes

Each scene starts with an editable mapping preset. Open **Audio mappings** to:

- Choose an input. The picker lists this device's track, every track Live shares
  over Link Audio, and **Song** signals. Each track offers **Level, Bass, Mids,
  Highs** and **Kick, Snare and Hat hits**; Song offers **Pulse, Ramp** and
  **Playing**, following Live's tempo, time signature and transport. A pulse or
  ramp's mapping sets its length (e.g. 4 bars or 3 8ths) and which bar or beat it
  starts on. Type to search
  (e.g. "drums kick"); opening a track group previews its live meters.
- Choose a destination: scene brightness/hue/speed, glyph size, glow, 3D rotation,
  and other numeric parameters. Some scenes add controls that change the animation
  itself: in **Spectral Terrain**, bass, mids and highs raise its mountains, ridges
  and crags, and the land flows away so the horizon shows what you just heard. **Layer 1**, **Layer 2**, etc. destinations control
  individual layers in layered scenes; their glyph sizes override the global size.
- Choose **All layers · Glyph size** (or another layer property) to control every
  layer together. Each layer keeps its own resting value; the field shows **Mixed**
  when they differ. Enter a value to give them all the same resting value.
  All-layer and individual mappings add together, even with the same input signal.
  Layer destinations include size, size smoothing, spacing, fade, pattern mix,
  edge threshold, opacity, horizontal/vertical offset, and stack order.
  Layered scenes hide global size/spacing/pattern-mix/edge-threshold destinations
  that their layers override. Older mappings to those globals automatically move
  to All layers. New mappings in layered scenes start with All layers · Glyph size.
- Adjust the amount (negative reverses it), smoothing, response curve, and resting
  value. Enable **Swing both sides** to move below and above that value.
- Add, disable, or remove mappings; combine several signals on one parameter.
  **Audio control on** toggles all mappings, and **Intensity** scales their amounts.

Live meters and result values show what each mapping is doing. A hint identifies
parameters that need an effect enabled in **Appearance** first. **Appearance**
opens the library's full rendering/layer controls; **Scene look** opens its source
image controls. **Reset scene** reloads that scene's original look and mappings.

Link Audio tracks are only streamed while a mapping or the open picker uses them,
so unused tracks cost Live nothing. Mappings refer to tracks by name, so they
survive track reordering and reopening the Set; renaming a track in Live breaks
its mappings until it is renamed back or remapped. **Group by input** or **by
parameter** organises long mapping lists.

Mappings are remembered separately for each scene within this connection.
Use **Export mappings** / **Import mappings** to save and reuse them in later
sessions: each plugin instance gets a new local address, and browser settings
are not stored in the Ableton Set. Exports contain mappings and their resting
values, not all Appearance settings. Older (version 1) exports still import and
map onto this device's track. Library scenes retain their normal animation
and interaction; audio changes only the editable mappings. The webcam example
is excluded from this gallery.

The browser can be moved onto another display. Closing the plugin editor does
not disconnect it. Removing the device or closing the Live Set disconnects it;
after reopening the Set, click Open Visuals again to get the new instance link.
All ASCII Visuals devices in a Live Set share one connection and one Link peer;
extra devices add their own tracks to the picker. The plugin passes audio through at
unity gain with zero added latency. Bypass stops analysis without altering audio.

The web page shows **Web v… · Plugin v…** beneath the title. Hover over this line
to see the web build timestamp. The plugin window in Ableton also shows its
version. Different versions are highlighted; older plugins that cannot report
their version show **plugin version unavailable**. Version numbers come from
`plugin/version.json` for both builds.

After installing an update, fully quit Live, reopen it, and click **Open Visuals**
to open the current device's page. An already-open browser tab keeps its old page
until refreshed or replaced. Removing the device is normally unnecessary. If
the plugin window still shows an older version, check for another plugin copy
in Live's custom VST3 folder and rescan.

## Build

Requires macOS, Xcode command-line tools, Node dependencies (`npm ci`), Git, and
CMake 3.25 or newer. From the repository root:

```sh
npm run build:plugin
```

This builds the web assets, fetches a pinned Steinberg SDK, compiles the VST3,
runs native audio tests and Steinberg's validator, and applies a free ad hoc signature.
The artifact is `plugin/build/native/VST3/Release/ASCII Visuals.vst3`.
Build output and downloaded SDK sources are ignored by Git.

Optional environment variables:

- `CMAKE`: path to a CMake executable if it isn't on PATH.
- `VST3_SDK_ROOT`: an existing recursive checkout of SDK revision
  `3cdf9ca5d1f5b1b21e0a86832aa4abe55607bd96` (VST3 3.8.1).
- `LINK_ROOT`: an existing checkout of Ableton Link revision
  `9c9091275e707ab09d09a5a608fcdb84bf0dec85` with its `modules/asio-standalone`
  submodule. Otherwise it is fetched at configure time.
- `ASCII_PLUGIN_ARCHS`: defaults to `arm64`; use `arm64;x86_64` for a universal build.
  Only the native Apple Silicon build has been exercised so far.

```sh
npm run test:plugin
```

The integration tests need a built plugin and Google Chrome installed. The native
build also runs `ascii-link-tests`, which starts a stand-in Link Audio peer
(`tests/FakeLive.h`) and checks discovery, tempo safety, track names,
subscribe/unsubscribe and metering over loopback; `ascii-link-sender` plays the
same role for the browser tests. A small
test host loads the actual VST3 bundle, attaches and closes its native editor, and
feeds synthetic audio through the VST3 processor while checking unchanged output.
The tests check instance isolation,
stale data, bypass and request restrictions, then exercise all 55 scenes and
mapping edits, toggles, layer destinations, persistence and export/import in
headless Chrome. A screenshot is written to `plugin/build/preview.png`.

## Implementation

- `native/Plugin.cpp`: VST3 mono/stereo effect; 32/64-bit audio passthrough,
  bypass state, zero latency. Combined processor/controller for an in-process host.
- `native/Meter.h`: stereo-energy metering with approximate bands below
  150 Hz, 150–2000 Hz, and above 2000 Hz, plus overall level. These are smooth
  first-order crossovers, not FFT bins or isolated instruments. Anti-phase stereo
  does not cancel the meters. Attack is 10 ms and release is 180 ms on energy.
  Kick/snare/hat hits are jumps in the bass/mid/high band that also carry a real
  share of the track's energy; they are heuristics, not instrument detection.
  `native/Analysis.h` runs it on the device's own track.
- `native/Hub.cpp`: one per Live process, shared by every device. Owns the
  browser connection and the Link peer, and builds the `/signals` response
  (version 2: song position, Link status, and each track's features).
- `native/LinkReceiver.cpp`: the Link Audio receiver. Subscribes only to the
  tracks pages have asked for in the last 2 s, meters them on Link's thread, and
  works around a Link Audio subscription race (see `docs/link-audio.md`). It never
  changes Live's tempo: while alone it mirrors the host's tempo and beat so Live
  keeps its own timeline when it joins.
- `native/Bridge.cpp`: HTTP worker on `127.0.0.1`, OS-assigned port and random
  per-process URL. Starts when an editor first opens. Serves only preloaded bundled
  assets and meter values, never raw audio. No filesystem/network calls,
  allocations, locks, or UI calls in the audio callback.
- `web/`: `sources.js` names inputs, `picker.js` is the searchable picker;
  same-origin polling at up to 30 Hz, bundled library scenes in a
  same-origin frame, editable per-scene modulation, layer destinations, JSON
  export/import, intensity, fullscreen and connection status.

The connection stays on this computer and works offline. It is not a remote
control interface. Meter snapshots can span adjacent audio blocks, which is fine
for visual modulation; this is not a sample-accurate visualization transport.
Offline rendering passes audio through and suppresses analysis.

Current limits: macOS only, no AU/Windows build, no MIDI, no video recording.
Link Audio has been exercised with a stand-in peer, not yet inside Live itself
(see open questions in `docs/link-audio.md`). Browser settings are not saved in the
Live Set. Loading and audio-driven visuals have been checked manually in Live;
SDK validation and synthetic/browser tests cover the expanded gallery and mappings.

## License

The plugin (everything under `plugin/`) is licensed under the GNU General Public
License, version 2 or (at your option) any later version; see [COPYING.md](COPYING.md).
This is required because it links [Ableton Link](https://github.com/Ableton/link),
which is GPLv2+. The rest of this repository, including the ascii-ify library the
plugin bundles, remains [MIT](../LICENSE). The bundled plugin includes Steinberg's
VST 3 SDK license (MIT) in its Resources directory. No third-party plugin framework
is required.
