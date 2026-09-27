#include "Hub.h"
#include <algorithm>
#include <chrono>
#include <iomanip>
#include <locale>
#include <sstream>

namespace ascii_plugin {
namespace {
constexpr int64_t liveWindow = 400000, subscriptionWindow = 2000000; // microseconds
constexpr std::size_t maxSubscriptions = 64;
int64_t now() {
    return std::chrono::duration_cast<std::chrono::microseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count();
}
std::string quote(const std::string& text) {
    std::ostringstream out;
    out << '"';
    for (const unsigned char c : text) {
        if (c == '"' || c == '\\') out << '\\' << c;
        else if (c < 0x20) out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << int(c) << std::dec;
        else out << c;
    }
    out << '"';
    return out.str();
}
// `sub=<id>,<id>` where each id is 16 lowercase hex characters. Anything else is ignored.
std::vector<std::string> subscriptionsIn(const std::string& query) {
    std::vector<std::string> ids;
    std::istringstream pairs(query);
    std::string pair;
    while (std::getline(pairs, pair, '&')) {
        if (pair.rfind("sub=", 0) != 0) continue;
        std::istringstream list(pair.substr(4));
        std::string id;
        while (std::getline(list, id, ',') && ids.size() < maxSubscriptions)
            if (id.size() == 16 && id.find_first_not_of("0123456789abcdef") == std::string::npos) ids.push_back(id);
    }
    return ids;
}
template<class Values> void writeValues(std::ostringstream& out, const Values& values) {
    out << "\"values\":[";
    for (int f = 0; f < FeatureCount; ++f) out << (f ? "," : "") << values[f];
    out << ']';
}
}

std::shared_ptr<Hub> Hub::acquire() {
    static std::mutex mutex;
    static std::weak_ptr<Hub> shared;
    std::lock_guard lock(mutex);
    auto hub = shared.lock();
    if (!hub) shared = hub = std::make_shared<Hub>();
    return hub;
}
Hub::Hub() : bridge([this](const std::string& query) { return signals(query); }) {}
Hub::~Hub() {
    stopping = true;
    if (follower.joinable()) follower.join();
    bridge.stop(); // The worker calls into link; stop it first.
    link.stop();
}
std::shared_ptr<LocalSource> Hub::addLocal() {
    std::lock_guard lock(mutex);
    auto source = std::make_shared<LocalSource>();
    source->id = nextLocal++;
    locals.push_back(source);
    return source;
}
void Hub::removeLocal(const std::shared_ptr<LocalSource>& source) {
    std::lock_guard lock(mutex);
    locals.erase(std::remove(locals.begin(), locals.end(), source), locals.end());
}
bool Hub::start(const std::string& directory) {
    if (!bridge.running() && !bridge.start(directory)) return false;
    link.start();
    if (!follower.joinable()) follower = std::thread([this] { follow(); });
    return true;
}
void Hub::follow() {
    while (!stopping.load()) {
        if (const auto song = transport(); song.valid) link.followHost(song.tempo, song.beat, song.playing, song.observed);
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
}
Hub::Transport Hub::transport() {
    std::lock_guard lock(mutex);
    std::shared_ptr<LocalSource> clock;
    for (const auto& source : locals)
        if (source->transportValid && (!clock || source->transportMicros > clock->transportMicros)) clock = source;
    if (!clock) return {};
    return {true, clock->playing, clock->tempo, clock->beat, clock->barStart,
        clock->sigNumerator, clock->sigDenominator, clock->transportMicros};
}

std::string Hub::signals(const std::string& query) {
    const auto time = now();
    std::vector<std::shared_ptr<LocalSource>> sources;
    std::vector<std::string> subscribe;
    {
        std::lock_guard lock(mutex);
        sources = locals;
        for (const auto& id : subscriptionsIn(query)) {
            auto found = std::find_if(requested.begin(), requested.end(), [&](auto& r) { return r.first == id; });
            if (found != requested.end()) found->second = time;
            else if (requested.size() < maxSubscriptions) requested.emplace_back(id, time);
        }
        // Several pages may be open; keep any channel requested recently by any of them.
        requested.erase(std::remove_if(requested.begin(), requested.end(),
            [&](auto& r) { return time - r.second > subscriptionWindow; }), requested.end());
        for (const auto& r : requested) subscribe.push_back(r.first);
    }
    link.subscribe(subscribe);

    const auto song = transport();
    double beat = song.beat;
    if (song.playing) beat += static_cast<double>(time - song.observed) / 1e6 * song.tempo / 60;

    std::ostringstream out;
    out.imbue(std::locale::classic());
    out << std::fixed << std::setprecision(6) << "{\"version\":2,\"features\":[";
    for (int f = 0; f < FeatureCount; ++f) out << (f ? "," : "") << '"' << featureNames[f] << '"';
    out << "],\"song\":{\"valid\":" << (song.valid ? "true" : "false") << ",\"tempo\":" << song.tempo
        << ",\"beat\":" << beat << ",\"playing\":" << (song.playing ? "true" : "false")
        << ",\"num\":" << song.numerator << ",\"den\":" << song.denominator << ",\"barStart\":" << song.barStart << '}'
        << ",\"link\":{\"running\":" << (link.running() ? "true" : "false") << ",\"peers\":" << link.peers() << '}'
        << ",\"sources\":[";
    bool first = true;
    for (const auto& source : sources) {
        auto& signals = source->signals;
        const auto sequence = signals.features.sequence.load(std::memory_order_acquire);
        if (sequence != source->lastSequence) { source->lastSequence = sequence; source->lastChange = time; }
        const bool bypass = signals.bypass.load();
        const bool live = signals.active.load() && !bypass && time - source->lastChange < liveWindow;
        std::array<float, FeatureCount> values{};
        if (live) for (int f = 0; f < FeatureCount; ++f) values[f] = signals.features.values[f].load(std::memory_order_relaxed);
        out << (first ? "" : ",") << "{\"id\":\"local:" << source->id << "\",\"kind\":\"local\",\"name\":"
            << quote(source->getName()) << ",\"live\":" << (live ? "true" : "false")
            << ",\"bypass\":" << (bypass ? "true" : "false") << ',';
        writeValues(out, values);
        out << '}';
        first = false;
    }
    for (const auto& channel : link.channels()) {
        out << (first ? "" : ",") << "{\"id\":\"link:" << channel.id << "\",\"kind\":\"link\",\"name\":"
            << quote(channel.name) << ",\"peer\":" << quote(channel.peer)
            << ",\"subscribed\":" << (channel.subscribed ? "true" : "false")
            << ",\"live\":" << (channel.live ? "true" : "false") << ',';
        writeValues(out, channel.values);
        out << '}';
        first = false;
    }
    out << "]}";
    return out.str();
}
}
