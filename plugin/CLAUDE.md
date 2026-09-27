# plugin/

- Before writing or reviewing any Ableton Link / Link Audio code, read
  `plugin/docs/link-audio.md`. Link Audio is new (Live 12.4, 2026) and thinly documented;
  do not rely on memory for its API. When the notes are insufficient, read the headers in
  the pinned Link checkout (`include/ableton/LinkAudio.hpp`, `Link.hpp`) and update the notes.
- The plugin is GPL-2.0-or-later because it links Ableton Link; the rest of the repo is MIT.
- Audio-thread code (`native/Analysis.h`, `Plugin::process`) must stay allocation-, lock-
  and syscall-free.
