#pragma once
#include "Analysis.h"
#include "Bridge.h"
#include "LinkReceiver.h"
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace ascii_plugin {
// The track one plugin instance sits on. The audio thread writes `signals` and the
// transport atomics; the host's main thread writes `name`.
struct LocalSource {
    Signals signals;
    std::atomic<double> tempo{0}, beat{0};
    std::atomic<int64_t> transportMicros{0};
    std::atomic<bool> playing{false}, transportValid{false};
    int id = 0;
    void setName(std::string value) { std::lock_guard lock(nameMutex); name = std::move(value); }
    std::string getName() { std::lock_guard lock(nameMutex); return name; }
    // HTTP worker only: when metering last changed.
    uint64_t lastSequence = 0;
    int64_t lastChange = 0;
private:
    std::mutex nameMutex;
    std::string name;
};
static_assert(std::atomic<double>::is_always_lock_free);
static_assert(std::atomic<int64_t>::is_always_lock_free);

// One per process: Live loads every plugin instance into its own process, so all
// instances share one browser connection and one Link peer.
class Hub {
public:
    static std::shared_ptr<Hub> acquire();
    Hub();
    ~Hub();
    std::shared_ptr<LocalSource> addLocal();
    void removeLocal(const std::shared_ptr<LocalSource>&);
    // Main thread. Starts the browser connection and the Link peer; idempotent.
    bool start(const std::string& webDirectory);
    std::string url() const { return bridge.url(); }
    const std::string& error() const { return bridge.error(); }
    // Builds the /signals response. Public for tests.
    std::string signals(const std::string& query);
private:
    struct Transport { bool valid = false, playing = false; double tempo = 0, beat = 0; int64_t observed = 0; };
    // Song position from whichever instance the host updated most recently.
    Transport transport();
    void follow();
    std::mutex mutex;
    std::vector<std::shared_ptr<LocalSource>> locals;
    int nextLocal = 1;
    std::vector<std::pair<std::string, int64_t>> requested; // Link channel id, last request time
    LinkReceiver link;
    Bridge bridge;
    // Keeps our Link session on the host's tempo/beat even while no page is polling,
    // so Live never adopts a stale timeline when it enables Link later.
    std::thread follower;
    std::atomic<bool> stopping{false};
};
}
