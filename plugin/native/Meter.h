#pragma once

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>

namespace ascii_plugin {

// Features published for every source, in wire order. Keep in sync with FEATURES
// in web/sources.js.
enum Feature { Level, Bass, Mid, High, Kick, Snare, Hat, FeatureCount };
constexpr const char* featureNames[FeatureCount] = {"rms", "bass", "mid", "high", "kick", "snare", "hat"};

// Lock-free snapshot written by one analysis thread and read by the HTTP thread.
struct Features {
    std::array<std::atomic<float>, FeatureCount> values{};
    std::atomic<uint64_t> sequence{0};
    void clear() { for (auto& v : values) v.store(0, std::memory_order_relaxed); }
};
static_assert(std::atomic<float>::is_always_lock_free);
static_assert(std::atomic<uint64_t>::is_always_lock_free);

// Stereo-energy band meter with transient detection. Bands are smooth first-order
// crossovers at 150 Hz and 2 kHz. Hits compare a fast band envelope with a slow one
// and decay after triggering. Allocation- and lock-free; safe on audio threads.
class Meter {
public:
    void prepare(double sampleRate) {
        const double rate = std::max(8000.0, sampleRate);
        auto coefficient = [rate](double seconds) { return 1 - std::exp(-1 / (rate * seconds)); };
        lowCoefficient = 1 - std::exp(-2 * pi * 150 / rate);
        highCoefficient = 1 - std::exp(-2 * pi * 2000 / rate);
        attack = coefficient(0.01);
        release = coefficient(0.18);
        fastAttack = coefficient(0.001);
        fastRelease = coefficient(0.03);
        slow = coefficient(0.3);
        hitDecay = std::exp(-1 / (rate * 0.15));
        for (int h = 0; h < 3; ++h) cooldownSamples[h] = static_cast<int>(rate * cooldowns[h]);
        reset();
    }

    void reset() {
        low = {}; upper = {}; envelope = {}; fast = {}; average = {}; hit = {};
        sinceHit = {cooldownSamples[0], cooldownSamples[1], cooldownSamples[2]};
    }

    // sample(channel, frame) returns a finite or non-finite double; invalid input is
    // treated as silence so it cannot poison the meters.
    template<class Sample>
    void process(int frames, int channels, Sample&& sample) {
        channels = std::clamp(channels, 0, 2);
        for (int i = 0; i < frames; ++i) {
            std::array<double, 4> power{};
            for (int c = 0; c < channels; ++c) {
                double x = sample(c, i);
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
                fast[b] += (target > fast[b] ? fastAttack : fastRelease) * (target - fast[b]);
                if (fast[b] < 1e-20) fast[b] = 0;
                if (b == 0) continue;
                const int h = b - 1;
                average[h] += slow * (fast[b] - average[h]);
                if (average[h] < 1e-20) average[h] = 0;
                hit[h] *= hitDecay;
                if (sinceHit[h] < cooldownSamples[h]) ++sinceHit[h];
                // A hit is a jump in this band that also carries a real share of the
                // track's energy, so leakage from other bands does not trigger it.
                else if (fast[b] > hitFloor && fast[b] > average[h] * hitRatio && fast[b] > fast[0] * hitShare) {
                    hit[h] = 1;
                    sinceHit[h] = 0;
                }
            }
        }
    }

    float value(Feature feature) const {
        if (feature <= High) return static_cast<float>(std::min(1.0, std::sqrt(envelope[feature])));
        return static_cast<float>(hit[feature - Kick]);
    }

    void publish(Features& out) const {
        for (int f = 0; f < FeatureCount; ++f)
            out.values[f].store(value(static_cast<Feature>(f)), std::memory_order_relaxed);
        out.sequence.fetch_add(1, std::memory_order_release);
    }

private:
    static constexpr double pi = 3.14159265358979323846;
    // Fast band power must exceed the slow average by this factor (about 6 dB).
    static constexpr double hitRatio = 4, hitFloor = 1e-5, hitShare = 0.3;
    static constexpr std::array<double, 3> cooldowns{0.12, 0.1, 0.06};
    double lowCoefficient = 0, highCoefficient = 0, attack = 1, release = 1;
    double fastAttack = 1, fastRelease = 1, slow = 1, hitDecay = 0;
    std::array<double, 2> low{}, upper{};
    std::array<double, 4> envelope{};
    std::array<double, 4> fast{};
    std::array<double, 3> average{}, hit{};
    std::array<int, 3> sinceHit{}, cooldownSamples{};
};
}
