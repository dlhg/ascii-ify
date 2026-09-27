#include "Analysis.h"
#include <iostream>
#include <stdexcept>
#include <vector>

using namespace ascii_plugin;
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
    check(signals.rms > 0.1f, "Opposite-phase stereo must not cancel the meter");
    const auto beforeL = left, beforeR = right;
    analysis.process(in, 2, in, 2, 257, 0, true, signals);
    check(left == beforeL && right == beforeR, "In-place processing must preserve audio");
    analysis.process(in, 2, out, 2, 257, 0, false, signals);
    check(left == outL && right == outR && signals.rms == 0, "Bypass must preserve audio and clear meters");
    analysis.process(in, 2, out, 2, 257, 1, true, signals);
    check(outL == std::vector<Sample>(257) && outR == right, "Per-channel silence flags must be respected");
    analysis.process<Sample>(nullptr, 0, out, 2, 257, 0, true, signals);
    check(outL == std::vector<Sample>(257) && outR == outL, "Missing inputs must clear outputs");
    const auto sequence = signals.sequence.load();
    analysis.process<Sample>(nullptr, 0, nullptr, 0, 0, 0, true, signals);
    check(signals.sequence == sequence, "Parameter-only blocks must not publish stale audio");
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
    return {signals.rms.load(), signals.bass.load(), signals.mid.load(), signals.high.load()};
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
        const auto peak = signals.rms.load();
        std::fill_n(samples, 512, 0.f);
        analysis.process(inputs, 1, inputs, 1, 512, 0, true, signals);
        check(signals.rms > peak * 0.8, "Envelope must release smoothly");
        for (int i = 0; i < 400; ++i) analysis.process(inputs, 1, inputs, 1, 512, 0, true, signals);
        check(signals.rms < 0.0001f, "Silence must settle to zero");
        std::fill_n(samples, 512, std::numeric_limits<float>::quiet_NaN());
        analysis.process(inputs, 1, inputs, 1, 512, 0, true, signals);
        check(std::isfinite(signals.rms.load()), "Invalid samples must not poison metering");
        std::cout << "Native checks passed: float/double passthrough, in-place, silence, bypass,\n"
                     "mono/stereo, opposite phase, 3 rates, 4 block sizes, bands and release.\n";
        return 0;
    } catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
}
