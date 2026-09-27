#pragma once
#include "Analysis.h"
#include <chrono>
#include <map>
#include <string>
#include <thread>

namespace ascii_plugin {
class Bridge {
public:
    Signals signals;
    ~Bridge();
    // Main-thread lifecycle only. The worker never touches any host/UI objects.
    bool start(const std::string& webDirectory);
    void stop();
    std::string url() const;
    const std::string& error() const { return lastError; }
private:
    void run();
    void serve(int client);
    std::string levels();
    struct Asset { std::string body, mime; };
    std::map<std::string, Asset> assets;
    std::atomic<bool> stopping{false};
    std::thread worker;
    int listener = -1;
    uint16_t port = 0;
    std::string token, lastError;
    uint64_t lastSequence = 0;
    std::chrono::steady_clock::time_point lastAudio{};
};
}
