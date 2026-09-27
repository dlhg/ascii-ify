# ASCII Visuals for Ableton — local prototype

A macOS VST3 audio effect that drives the existing ASCII renderer from track audio.
No Max for Live, Apple membership, virtual audio driver, microphone permission, or
separate server is needed to use the built plugin. This build is ad hoc signed for
local testing; it is not notarized for public distribution.

## Try it

1. Put `ASCII Visuals.vst3` in `~/Library/Audio/Plug-Ins/VST3/`.
2. In Ableton's Settings → Plug-ins, enable **Use VST3 Plug-In System Folders**.
   Restart Live or rescan if the plugin doesn't appear. Option-click **Rescan**
   for a full scan if needed.
3. Add **ASCII Visuals** to the end of the Main/Master track's effects chain.
4. Open its plugin window and click **Open Visuals**. Press play in Live.
5. Choose Pulse, Orbit, or Spectrum, adjust Intensity, and use Fullscreen.
   Press **H** to hide/show the controls.

The browser can be moved onto another display. Closing the plugin editor does
not disconnect it. Removing the device or closing the Live Set disconnects it;
after reopening the Set, click Open Visuals again to get the new instance link.
Each device instance has its own connection. The plugin passes audio through at
unity gain with zero added latency. Bypass stops analysis without altering audio.

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
- `ASCII_PLUGIN_ARCHS`: defaults to `arm64`; use `arm64;x86_64` for a universal build.
  Only the native Apple Silicon build has been exercised so far.

```sh
npm run test:plugin
```

The integration tests need a built plugin and Google Chrome installed. A small
test host loads the actual VST3 bundle, attaches and closes its native editor, and
feeds synthetic audio through the VST3 processor while checking unchanged output.
The tests check instance isolation,
stale data, bypass and request restrictions, then exercise the bundled page in
headless Chrome. A screenshot is written to `plugin/build/preview.png`.

## Implementation

- `native/Plugin.cpp`: VST3 mono/stereo effect; 32/64-bit audio passthrough,
  bypass state, zero latency. Combined processor/controller for an in-process host.
- `native/Analysis.h`: stereo-energy metering with approximate bands below
  150 Hz, 150–2000 Hz, and above 2000 Hz, plus overall level. These are smooth
  first-order crossovers, not FFT bins or isolated instruments. Anti-phase stereo
  does not cancel the meters. Attack is 10 ms and release is 180 ms on energy.
- `native/Bridge.cpp`: HTTP worker on `127.0.0.1`, OS-assigned port and random
  per-instance URL. Starts when the editor opens. Serves only preloaded bundled
  assets and four meter values, never raw audio. No filesystem/network calls,
  allocations, locks, or UI calls in the audio callback.
- `web/`: same-origin polling at up to 30 Hz, existing ASCII engine and automation
  registry, three scenes, intensity, fullscreen and connection status.

The connection stays on this computer and works offline. It is not a remote
control interface. Meter snapshots can span adjacent audio blocks, which is fine
for visual modulation; this is not a sample-accurate visualization transport.
Offline rendering passes audio through and suppresses analysis.

Current limits: macOS only, no AU/Windows build, no beat clock/MIDI, no video
recording, and browser scene/intensity settings are not saved in the Live Set.
Live's real-world loading and playback still need a hands-on check; SDK validation
and synthetic/browser tests don't replace that check.

The project remains MIT licensed. The bundled plugin includes Steinberg's SDK
license in its Resources directory. No third-party plugin framework is required.
