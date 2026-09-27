#pragma once

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstring>

namespace ascii_plugin {

// Single audio-thread writer. Readers only use lock-free atomics; no audio buffers
// or host pointers ever cross into the HTTP thread.
struct Signals {
    std::atomic<float> rms{0}, bass{0}, mid{0}, high{0};
    std::atomic<uint64_t> sequence{0};
    std::atomic<bool> active{false}, bypass{false};
};
static_assert(std::atomic<float>::is_always_lock_free);
static_assert(std::atomic<uint64_t>::is_always_lock_free);
static_assert(std::atomic<bool>::is_always_lock_free);

class Analysis {
public:
    void prepare(double sampleRate) {
        const double rate = std::max(8000.0, sampleRate);
        lowCoefficient = 1 - std::exp(-2 * pi * 150 / rate);
        highCoefficient = 1 - std::exp(-2 * pi * 2000 / rate);
        attack = 1 - std::exp(-1 / (rate * 0.01));
        release = 1 - std::exp(-1 / (rate * 0.18));
        reset();
    }

    void reset() { low = {}; upper = {}; envelope = {}; }

    // Supports mono/stereo, in-place and separate output, float and double.
    // Host silence flags take precedence over stale data in an input buffer.
    template<class Sample>
    void process(Sample* const* inputs, int inputChannels, Sample* const* outputs,
                 int outputChannels, int frames, uint64_t silence, bool analyze,
                 Signals& signals) {
        if (frames <= 0) return;
        if (analyze) {
            const int channels = std::min(inputChannels, 2);
            for (int i = 0; i < frames; ++i) {
                std::array<double, 4> power{};
                for (int c = 0; c < channels; ++c) {
                    double x = inputs && inputs[c] && !(silence & (uint64_t{1} << c))
                        ? static_cast<double>(inputs[c][i]) : 0;
                    // Protect metering from invalid/extreme input, without altering audio.
                    x = std::isfinite(x) ? std::clamp(x, -16.0, 16.0) : 0;
                    low[c] += lowCoefficient * (x - low[c]);
                    upper[c] += highCoefficient * (x - upper[c]);
                    if (std::abs(low[c]) < 1e-20) low[c] = 0;
                    if (std::abs(upper[c]) < 1e-20) upper[c] = 0;
                    const double bands[] = {x, low[c], upper[c] - low[c], x - upper[c]};
                    for (int b = 0; b < 4; ++b) power[b] += bands[b] * bands[b];
                }
                for (int b = 0; b < 4; ++b) {
                    const double target = power[b] / std::max(1, channels);
                    envelope[b] += (target > envelope[b] ? attack : release) * (target - envelope[b]);
                    if (envelope[b] < 1e-20) envelope[b] = 0;
                }
            }
        } else {
            reset();
        }
        // Analyze before copying/clearing so in-place silent buffers are handled.
        for (int c = 0; c < outputChannels; ++c) {
            if (!outputs || !outputs[c]) continue;
            if (c >= inputChannels || !inputs || !inputs[c] || (silence & (uint64_t{1} << c)))
                std::memset(outputs[c], 0, frames * sizeof(Sample));
            else if (outputs[c] != inputs[c])
                std::memcpy(outputs[c], inputs[c], frames * sizeof(Sample));
        }
        signals.rms.store(level(0), std::memory_order_relaxed);
        signals.bass.store(level(1), std::memory_order_relaxed);
        signals.mid.store(level(2), std::memory_order_relaxed);
        signals.high.store(level(3), std::memory_order_relaxed);
        signals.sequence.fetch_add(1, std::memory_order_release);
    }

private:
    float level(int band) const { return static_cast<float>(std::min(1.0, std::sqrt(envelope[band]))); }
    static constexpr double pi = 3.14159265358979323846;
    double lowCoefficient = 0, highCoefficient = 0, attack = 1, release = 1;
    std::array<double, 2> low{}, upper{};
    std::array<double, 4> envelope{};
};
}
