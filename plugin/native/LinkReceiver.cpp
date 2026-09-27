#include "LinkReceiver.h"
#include <ableton/LinkAudio.hpp>
#include <chrono>
#include <cmath>
#include <map>
#include <mutex>

namespace ascii_plugin {
namespace {
constexpr double quantum = 4;
// A subscribed channel counts as live while buffers keep arriving.
constexpr auto liveWindow = std::chrono::milliseconds(400);
// Link Audio senders resolve where to send when a request arrives, and receivers
// repeat requests only every 5 s. A request sent before the sender has seen our
// announcement is accepted but delivers nothing until the next one. So: wait for a
// new channel to settle before subscribing; if a subscription is still silent after
// a full request cycle, drop it and pause so the stop message lands before the new
// request. See docs/link-audio.md.
constexpr int64_t settleTime = 1500000, silentLimit = 6000000, retryPause = 1000000;
int64_t steadyMicros() {
    return std::chrono::duration_cast<std::chrono::microseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count();
}
std::string hex(const ableton::ChannelId& id) {
    static constexpr char digits[] = "0123456789abcdef";
    std::string out;
    for (const auto byte : id) { out += digits[byte >> 4]; out += digits[byte & 15]; }
    return out;
}
// Written only on Link's audio-receive thread; read through atomics elsewhere.
struct ChannelState {
    Meter meter;
    uint32_t rate = 0;
    Features features;
    std::atomic<int64_t> lastBuffer{0};
};
struct Subscription {
    std::shared_ptr<ChannelState> state;
    std::unique_ptr<ableton::LinkAudioSource> source;
    int64_t since = 0;
};
}

struct LinkReceiver::Impl {
    std::mutex mutex;
    std::unique_ptr<ableton::LinkAudio> link;
    std::map<std::string, Subscription> subscriptions;
    std::map<std::string, int64_t> firstSeen, retryAt;
};

LinkReceiver::LinkReceiver() : impl(std::make_unique<Impl>()) {}
LinkReceiver::~LinkReceiver() { stop(); }

void LinkReceiver::start() {
    std::lock_guard lock(impl->mutex);
    if (impl->link) return;
    impl->link = std::make_unique<ableton::LinkAudio>(120.0, "ASCII Visuals");
    impl->link->enable(true);
    impl->link->enableLinkAudio(true);
}
void LinkReceiver::stop() {
    std::lock_guard lock(impl->mutex);
    impl->subscriptions.clear(); // Sources must go before the LinkAudio they use.
    impl->firstSeen.clear();
    impl->retryAt.clear();
    if (impl->link) impl->link->enable(false);
    impl->link.reset();
}
bool LinkReceiver::running() const {
    std::lock_guard lock(impl->mutex);
    return impl->link != nullptr;
}
std::size_t LinkReceiver::peers() const {
    std::lock_guard lock(impl->mutex);
    return impl->link ? impl->link->numPeers() : 0;
}

void LinkReceiver::subscribe(const std::vector<std::string>& ids) {
    std::lock_guard lock(impl->mutex);
    if (!impl->link) return;
    const auto now = steadyMicros();
    const auto channels = impl->link->channels();
    std::map<std::string, int64_t> seen;
    for (const auto& channel : channels) {
        const auto id = hex(channel.id);
        const auto found = impl->firstSeen.find(id);
        seen[id] = found == impl->firstSeen.end() ? now : found->second;
    }
    impl->firstSeen = std::move(seen);
    for (auto it = impl->subscriptions.begin(); it != impl->subscriptions.end();) {
        const auto& sub = it->second;
        const bool wanted = std::find(ids.begin(), ids.end(), it->first) != ids.end();
        const bool silent = now - std::max(sub.since, sub.state->lastBuffer.load(std::memory_order_relaxed)) > silentLimit;
        if (wanted && !silent) { ++it; continue; }
        if (silent) impl->retryAt[it->first] = now + retryPause;
        it = impl->subscriptions.erase(it);
    }
    for (auto it = impl->retryAt.begin(); it != impl->retryAt.end();)
        it = it->second <= now ? impl->retryAt.erase(it) : std::next(it);
    for (const auto& channel : channels) {
        const auto id = hex(channel.id);
        if (impl->subscriptions.count(id) || impl->retryAt.count(id) || now - impl->firstSeen[id] < settleTime
            || std::find(ids.begin(), ids.end(), id) == ids.end()) continue;
        auto state = std::make_shared<ChannelState>();
        auto source = std::make_unique<ableton::LinkAudioSource>(*impl->link, channel.id,
            [state](ableton::LinkAudioSource::BufferHandle buffer) {
                const auto& info = buffer.info;
                if (!buffer.samples || info.numChannels < 1 || info.numChannels > 2 || info.sampleRate == 0) return;
                if (info.sampleRate != state->rate) { state->rate = info.sampleRate; state->meter.prepare(info.sampleRate); }
                const auto channels = static_cast<int>(info.numChannels);
                const int16_t* samples = buffer.samples;
                state->meter.process(static_cast<int>(info.numFrames), channels,
                    [samples, channels](int c, int i) { return samples[i * channels + c] / 32768.0; });
                state->meter.publish(state->features);
                state->lastBuffer.store(steadyMicros(), std::memory_order_relaxed);
            });
        impl->subscriptions.emplace(id, Subscription{std::move(state), std::move(source), now});
    }
}

std::vector<LinkReceiver::Channel> LinkReceiver::channels() {
    std::lock_guard lock(impl->mutex);
    std::vector<Channel> out;
    if (!impl->link) return out;
    const auto now = steadyMicros();
    for (const auto& channel : impl->link->channels()) {
        Channel entry{hex(channel.id), channel.name, channel.peerName};
        if (const auto found = impl->subscriptions.find(entry.id); found != impl->subscriptions.end()) {
            const auto& state = *found->second.state;
            entry.subscribed = true;
            entry.live = now - state.lastBuffer.load(std::memory_order_relaxed)
                < std::chrono::duration_cast<std::chrono::microseconds>(liveWindow).count();
            for (int f = 0; f < FeatureCount; ++f)
                entry.values[f] = entry.live ? state.features.values[f].load(std::memory_order_relaxed) : 0;
        }
        out.push_back(std::move(entry));
    }
    return out;
}

void LinkReceiver::followHost(double tempo, double beat, bool playing, int64_t observedMicros) {
    std::lock_guard lock(impl->mutex);
    if (!impl->link || impl->link->numPeers() != 0 || !std::isfinite(tempo) || !std::isfinite(beat)
        || tempo < 20 || tempo > 999) return;
    auto state = impl->link->captureAppSessionState();
    const auto now = impl->link->clock().micros();
    bool changed = false;
    if (std::abs(state.tempo() - tempo) > 0.001) { state.setTempo(tempo, now); changed = true; }
    if (playing) {
        const double elapsed = static_cast<double>(steadyMicros() - observedMicros) / 1e6;
        const double target = beat + elapsed * tempo / 60;
        if (std::abs(state.beatAtTime(now, quantum) - target) > 0.02) {
            state.forceBeatAtTime(target, now, quantum);
            changed = true;
        }
    }
    if (changed) impl->link->commitAppSessionState(state);
}
}
