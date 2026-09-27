#pragma once

#include "Meter.h"
#include <cstring>

namespace ascii_plugin {

// Per-instance state for the track the plugin sits on. Single audio-thread writer;
// readers only use lock-free atomics. No audio buffers or host pointers cross into
// the HTTP thread.
struct Signals {
    Features features;
    std::atomic<bool> active{false}, bypass{false};
};
static_assert(std::atomic<bool>::is_always_lock_free);

class Analysis {
public:
    void prepare(double sampleRate) { meter.prepare(sampleRate); }
    void reset() { meter.reset(); }

    // Supports mono/stereo, in-place and separate output, float and double.
    // Host silence flags take precedence over stale data in an input buffer.
    template<class Sample>
    void process(Sample* const* inputs, int inputChannels, Sample* const* outputs,
                 int outputChannels, int frames, uint64_t silence, bool analyze,
                 Signals& signals) {
        if (frames <= 0) return;
        if (analyze) {
            meter.process(frames, std::min(inputChannels, 2), [&](int c, int i) {
                return inputs && inputs[c] && !(silence & (uint64_t{1} << c))
                    ? static_cast<double>(inputs[c][i]) : 0.0;
            });
        } else {
            meter.reset();
        }
        // Analyze before copying/clearing so in-place silent buffers are handled.
        for (int c = 0; c < outputChannels; ++c) {
            if (!outputs || !outputs[c]) continue;
            if (c >= inputChannels || !inputs || !inputs[c] || (silence & (uint64_t{1} << c)))
                std::memset(outputs[c], 0, frames * sizeof(Sample));
            else if (outputs[c] != inputs[c])
                std::memcpy(outputs[c], inputs[c], frames * sizeof(Sample));
        }
        meter.publish(signals.features);
    }

private:
    Meter meter;
};
}
