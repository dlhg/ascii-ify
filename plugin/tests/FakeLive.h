#pragma once
#include <ableton/LinkAudio.hpp>
#include <atomic>
#include <cmath>
#include <memory>
#include <string>
#include <thread>
#include <vector>

// A Link Audio peer standing in for Live: publishes named stereo test tracks.
// Each track plays a sine at `hz`; `pulse` gates it into 50 ms bursts twice a second.
class FakeLive {
public:
    struct Track { std::string name; double hz; bool pulse; };
    FakeLive(std::string peerName, std::vector<Track> list, double tempo = 120)
        : link(tempo, std::move(peerName)), tracks(std::move(list)) {
        link.enable(true);
        link.enableLinkAudio(true);
        for (const auto& track : tracks) sinks.push_back(std::make_unique<ableton::LinkAudioSink>(link, track.name, 4096));
        worker = std::thread([this] { run(); });
    }
    ~FakeLive() {
        running = false;
        worker.join();
        sinks.clear();
        link.enable(false);
    }
    // Whether any subscriber currently receives this track.
    bool streaming(std::size_t index) { return ableton::LinkAudioSink::BufferHandle(*sinks[index]); }
    ableton::LinkAudio link;
private:
    void run() {
        constexpr uint32_t rate = 48000;
        constexpr std::size_t frames = 256;
        long sample = 0;
        auto next = std::chrono::steady_clock::now();
        while (running) {
            for (std::size_t t = 0; t < tracks.size(); ++t) {
                ableton::LinkAudioSink::BufferHandle buffer(*sinks[t]);
                if (!buffer) continue;
                for (std::size_t i = 0; i < frames; ++i) {
                    const long n = sample + long(i);
                    const bool on = !tracks[t].pulse || n % (rate / 2) < rate / 20;
                    const auto v = static_cast<int16_t>(on ? 12000 * std::sin(2 * M_PI * tracks[t].hz * n / rate) : 0);
                    buffer.samples[2 * i] = buffer.samples[2 * i + 1] = v;
                }
                const auto state = link.captureAppSessionState();
                buffer.commit(state, state.beatAtTime(link.clock().micros(), 4), 4, frames, 2, rate);
            }
            sample += frames;
            next += std::chrono::microseconds(1000000 * frames / rate);
            std::this_thread::sleep_until(next);
        }
    }
    std::vector<Track> tracks;
    std::vector<std::unique_ptr<ableton::LinkAudioSink>> sinks;
    std::atomic<bool> running{true};
    std::thread worker;
};
