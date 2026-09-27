#include "Analysis.h"
#include <limits>
#include <iostream>
#include <stdexcept>
#include <vector>

using namespace ascii_plugin;
float rms(const Signals& s) { return s.features.values[Level].load(); }
void check(bool value, const char* message) { if (!value) throw std::runtime_error(message); }

template<class Sample> void passthrough() {
    Analysis analysis;
    Signals signals;
    analysis.prepare(48000);
    std::vector<Sample> left(257), right(257), outL(257), outR(257);
    for (int i = 0; i < 257; ++i) { left[i] = Sample(std::sin(i * 0.13)); right[i] = -left[i]; }
    Sample* in[] = {left.data(), right.data()};
    Sample* out[] = {outL.data(), outR.data()};
    analysis.process(in, 2, out, 2, 257, 0, true, signals);
    check(left == outL && right == outR, "Audio must pass through bit-for-bit");
    check(rms(signals) > 0.1f, "Opposite-phase stereo must not cancel the meter");
    const auto beforeL = left, beforeR = right;
    analysis.process(in, 2, in, 2, 257, 0, true, signals);
    check(left == beforeL && right == beforeR, "In-place processing must preserve audio");
    analysis.process(in, 2, out, 2, 257, 0, false, signals);
    check(left == outL && right == outR && rms(signals) == 0, "Bypass must preserve audio and clear meters");
    analysis.process(in, 2, out, 2, 257, 1, true, signals);
    check(outL == std::vector<Sample>(257) && outR == right, "Per-channel silence flags must be respected");
    analysis.process<Sample>(nullptr, 0, out, 2, 257, 0, true, signals);
    check(outL == std::vector<Sample>(257) && outR == outL, "Missing inputs must clear outputs");
    const auto sequence = signals.features.sequence.load();
    analysis.process<Sample>(nullptr, 0, nullptr, 0, 0, 0, true, signals);
    check(signals.features.sequence == sequence, "Parameter-only blocks must not publish stale audio");
}

std::array<float, 4> tone(double hz, double rate, int block, int channels) {
    Analysis analysis;
    Signals signals;
    analysis.prepare(rate);
    std::vector<float> left(block), right(block);
    float* input[] = {left.data(), right.data()};
    int sample = 0;
    while (sample < rate) {
        for (int i = 0; i < block; ++i, ++sample) {
            left[i] = 0.5f * std::sin(2 * 3.141592653589793 * hz * sample / rate);
            right[i] = -left[i];
        }
        analysis.process(input, channels, input, channels, block, 0, true, signals);
    }
    return {rms(signals), signals.features.values[Bass].load(), signals.features.values[Mid].load(), signals.features.values[High].load()};
}

// Bursts of a tone every half second should fire the matching hit about twice a
// second; a steady tone should fire only at its start.
struct Hits { int kick = 0, snare = 0, hat = 0; };
Hits hits(double hz, bool bursts) {
    Meter meter;
    Features features;
    const double rate = 48000;
    meter.prepare(rate);
    Hits count;
    std::array<float, FeatureCount> previous{};
    for (int block = 0; block < 4 * rate / 128; ++block) {
        meter.process(128, 1, [&](int, int i) {
            const long n = long(block) * 128 + i;
            const bool on = !bursts || n % long(rate / 2) < rate * 0.05;
            return on ? 0.5 * std::sin(2 * 3.141592653589793 * hz * n / rate) : 0.0;
        });
        meter.publish(features);
        for (int f = Kick; f <= Hat; ++f) {
            const float v = features.values[f].load();
            if (v > 0.9f && previous[f] < 0.9f) (f == Kick ? count.kick : f == Snare ? count.snare : count.hat)++;
            previous[f] = v;
        }
    }
    return count;
}
int main() {
    try {
        passthrough<float>();
        passthrough<double>();
        for (const double rate : {44100, 48000, 96000}) {
            for (const int block : {1, 64, 257, 1024}) {
                for (const int channels : {1, 2}) {
                    const auto low = tone(60, rate, block, channels);
                    const auto mid = tone(750, rate, block, channels);
                    const auto high = tone(10000, rate, block, channels);
                    check(low[1] > low[2] * 1.5f && low[1] > low[3] * 4, "Low tone must drive bass");
                    check(mid[2] > mid[1] * 2 && mid[2] > mid[3] * 1.5f, "Mid tone must drive mid");
                    check(high[3] > high[2] * 2 && high[3] > high[1] * 4, "High tone must drive treble");
                }
            }
        }
        Analysis analysis;
        Signals signals;
        analysis.prepare(48000);
        float samples[512];
        std::fill_n(samples, 512, 0.8f);
        float* inputs[] = {samples};
        analysis.process(inputs, 1, inputs, 1, 512, 0, true, signals);
        const auto peak = rms(signals);
        std::fill_n(samples, 512, 0.f);
        analysis.process(inputs, 1, inputs, 1, 512, 0, true, signals);
        check(rms(signals) > peak * 0.8, "Envelope must release smoothly");
        for (int i = 0; i < 400; ++i) analysis.process(inputs, 1, inputs, 1, 512, 0, true, signals);
        check(rms(signals) < 0.0001f, "Silence must settle to zero");
        std::fill_n(samples, 512, std::numeric_limits<float>::quiet_NaN());
        analysis.process(inputs, 1, inputs, 1, 512, 0, true, signals);
        check(std::isfinite(rms(signals)), "Invalid samples must not poison metering");
        const auto kicks = hits(60, true), snares = hits(1000, true), hats = hits(8000, true);
        check(kicks.kick >= 7 && kicks.kick <= 9 && kicks.hat == 0, "Low bursts must fire kicks only");
        check(snares.snare >= 7 && snares.snare <= 9 && snares.kick == 0, "Mid bursts must fire snares");
        check(hats.hat >= 7 && hats.hat <= 9 && hats.kick == 0, "High bursts must fire hats");
        const auto steady = hits(60, false);
        check(steady.kick <= 1, "A steady tone must not keep firing");
        std::cout << "Native checks passed: float/double passthrough, in-place, silence, bypass,\n"
                     "mono/stereo, opposite phase, 3 rates, 4 block sizes, bands, release and hits.\n";
        return 0;
    } catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
}
