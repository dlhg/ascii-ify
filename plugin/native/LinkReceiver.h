#pragma once
#include "Meter.h"
#include <memory>
#include <string>
#include <vector>

namespace ascii_plugin {
// Receives Live's tracks over Ableton Link Audio and meters the ones that are
// subscribed. See plugin/docs/link-audio.md. Methods are called from one non-audio
// thread (the HTTP worker) plus start/stop from the main thread; Link delivers audio
// on its own thread.
class LinkReceiver {
public:
    struct Channel {
        std::string id, name, peer;
        bool subscribed = false, live = false;
        std::array<float, FeatureCount> values{};
    };
    LinkReceiver();
    ~LinkReceiver();
    void start();
    void stop();
    bool running() const;
    std::size_t peers() const;
    // Subscribe to exactly these channel ids (16 hex chars); others are dropped so
    // Live stops sending them.
    void subscribe(const std::vector<std::string>& ids);
    std::vector<Channel> channels();
    // While no other peer is connected, keep our session on the host's tempo and
    // beat so Live never adopts our timeline when it enables Link. `beat` was
    // observed at `steadyMicros` (std::chrono::steady_clock).
    void followHost(double tempo, double beat, bool playing, int64_t steadyMicros);
private:
    struct Impl;
    std::unique_ptr<Impl> impl;
};
}
