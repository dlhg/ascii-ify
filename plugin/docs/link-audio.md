# Ableton Link Audio — working notes

Reference for integrating Link Audio into the plugin. Facts are marked **verified**
(read in source or Ableton docs) or **unverified** (inferred; test before relying on it).
Last researched: 2026-09-27.

- Source of truth: <https://github.com/Ableton/link>, researched at commit
  `9c9091275e707ab09d09a5a608fcdb84bf0dec85` (2026-09-23). Pin this in CMake.
- Public API docs live in the headers: `include/ableton/Link.hpp` (tempo/beat/transport)
  and `include/ableton/LinkAudio.hpp` (audio). Read those before guessing at an API.
- Live side: Live 12.4+ ([release notes](https://www.ableton.com/en/release-notes/live-12/),
  [manual](https://www.ableton.com/en/live-manual/12/synchronizing-with-link-tempo-follower-and-midi/)).

## Model

- **Peer**: one participant in a Link session (Live, our plugin, TouchDesigner…). A
  `LinkAudio` object is a peer; it has a display name (`setPeerName`).
- **Session**: all enabled peers on the LAN, including over loopback on one machine.
  Shares tempo, beat grid/phase and (optionally) start/stop. Audio is layered on top.
- **Channel**: a named mono/stereo audio stream announced by a peer. On the sending side it
  is a `LinkAudioSink`; a receiver subscribes with a `LinkAudioSource`.
  `Channel { ChannelId id; std::string name; PeerId peerId; std::string peerName; }`.
  IDs are stable only "for the lifetime of a channel"; names can change (display only).

## What Live does (verified from Ableton release notes / manual)

- User enables **Link** (Control Bar) and **Link Audio** (Settings → Link → Audio).
- "Once enabled, all tracks with audio output can be received by Link peers." No per-track
  opt-in. Receivers pick a peer, then a track ("Main" or an individual track).
- Live's Link settings: peer **Name** field, input **Latency** slider, **Sync to Incoming
  Audio**. Those affect Live as a *receiver*; irrelevant when we only receive from Live.
- Ableton recommends lower buffer sizes on receiving peers, higher on sending peers.

### Unverified — test with LinkAudioHut before designing around these

- Tap point: post-FX/post-fader track output? (If post-fader, a faded-out track is silent
  to us.)
- Which track types appear: groups, returns, Main — and are channel names the track names?
- Whether channel IDs survive a Set reload / Live restart (store the name as a fallback).
- Live's CPU cost when many tracks are subscribed.
- A receiving peer inside Live's own process (our VST3). Two peers in one process work
  (verified with our tests), but not yet observed inside Live itself.
- Whether Live keeps sending (silent) buffers while its transport is stopped.

## Receiving API (verified from `LinkAudio.hpp`)

```cpp
#include <ableton/LinkAudio.hpp>   // defines LINK_AUDIO; use LinkAudio *instead of* Link
ableton::LinkAudio link(120.0, "ASCII Visuals");
link.enable(true);             // join the Link session (not realtime-safe)
link.enableLinkAudio(true);    // audio on top (not realtime-safe)
link.setChannelsChangedCallback([&] { /* Link thread: re-read link.channels() */ });
for (auto& ch : link.channels()) { /* ch.id, ch.name, ch.peerName */ }
ableton::LinkAudioSource src(link, ch.id, [](ableton::LinkAudioSource::BufferHandle b) {
  // Link-managed thread. b.samples: interleaved int16. b.info: numChannels (1|2),
  // numFrames, sampleRate, count (sequence), sessionBeatTime, tempo, sessionId.
  // Copy out quickly; don't block this thread.
});
// Destroying `src` unsubscribes; the sender stops streaming when no source remains.
```

- Senders only transmit while at least one source subscribes → subscribe only to tracks
  that have mappings.
- Format: int16 PCM, 1 or 2 channels, any sample rate. UDP messages ≤ 1200 bytes
  (`link_audio/v1/Messages.hpp`), so buffers arrive in small chunks (~170/s per stereo
  48 kHz track, ~192 KB/s). Use `count` to detect drops.
- Beat alignment (`info.beginBeats(sessionState, quantum)`) is only needed to render audio
  in time. For metering/analysis we can process buffers as they arrive.
- Reference receiver: `examples/linkaudio/LinkAudioRenderer.hpp` (queue + beat-aligned
  resampling) and `examples/linkaudiohut/main.cpp` (CLI that lists channels and picks one).

## Behaviors found by testing (verified 2026-09-27 with `plugin/tests/link.cpp`)

- **Subscription timing.** A source re-sends its request only every 5 s
  (`SourceProcessor.hpp`, `kTtl = 5`). The sink looks up where to send when the request
  arrives (`Receivers.hpp`, `forPeer`); if it hasn't seen the receiver's announcement yet,
  it marks itself connected (`BufferHandle` is valid) but delivers nothing until the next
  request. Subscribing right after a channel appears failed about half the time. Fix in
  `LinkReceiver.cpp`: wait 1.5 s after a channel first appears; if a subscription is silent
  for 6 s, drop it and wait 1 s before resubscribing. Recreating immediately is worse: the
  old source's stop request can land after the new request and cancel it.
- **Two peers in one process** exchange audio over loopback fine (first buffer ~6 ms after
  a settled subscription). Buffers arrive in ~125-frame chunks.
- **Session merging** (`link/Sessions.hpp`): each session's clock starts at 0 when created.
  When sessions meet, everyone joins the *older* one (larger clock), and if they're within
  0.5 s of each other, the lower session ID wins. So if our peer is running before the user
  enables Link in Live, **Live adopts our tempo and beat**. `LinkReceiver::followHost`
  keeps our solo session on the host's tempo/beat (from the VST3 `ProcessContext`) to make
  that a no-op; it never touches the session once another peer is present.

## Tempo / beat / transport (verified from `Link.hpp`)

- `captureAppSessionState()` from non-audio threads; `captureAudioSessionState()` only
  from a realtime audio thread. Never mix them up.
- `SessionState`: `tempo()`, `beatAtTime(t, quantum)`, `phaseAtTime(t, quantum)`,
  `isPlaying()` (needs `enableStartStopSync(true)`), time from `link.clock().micros()`.
- **We are a listener.** Never call `setTempo`, `forceBeatAtTime`, `setIsPlaying` or
  commit session state while other peers are present. Link's `TEST-PLAN.md` requires
  peers not to hijack an existing session's tempo or beat when joining. The one exception
  is mirroring the host while alone (see Session merging above).

## Networking (verified from source)

- Discovery: UDP multicast 224.76.78.75:20808 (IPv4) and ff12::8080 (IPv6 link-local),
  `include/ableton/discovery/IpInterface.hpp`.
- IPv4 interfaces are scanned including loopback, and multicast loopback is enabled
  (`platforms/posix/ScanIpIfAddrs.hpp`, `platforms/asio/Context.hpp`) → works on one
  machine with no network.
- macOS may prompt for Local Network access on first use (unverified for a plugin inside
  Live; Live itself already uses Link).

## Build integration

- Header-only. Needs the asio submodule (`modules/asio-standalone`).
- CMake: `include(<link>/AbletonLinkConfig.cmake)` → `target_link_libraries(x Ableton::Link)`.
  It sets `LINK_PLATFORM_MACOSX`/`LINK_PLATFORM_UNIX` definitions.
- Build `LinkAudioHut` from `examples/` for manual testing against Live.

## License

- Link is GPLv2-or-later (or a proprietary license from link-devs@ableton.com). We chose
  GPL: the plugin (`plugin/`) is GPL-2.0-or-later; the rest of the repo stays MIT.
- Follow the branding guidelines (`Ableton Link Guidelines.pdf` in the repo) for any UI
  that says "Link".
