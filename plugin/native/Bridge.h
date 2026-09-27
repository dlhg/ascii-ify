#pragma once
#include <atomic>
#include <functional>
#include <map>
#include <string>
#include <thread>

namespace ascii_plugin {
// Local HTTP server for the bundled visuals. One per process (owned by Hub).
class Bridge {
public:
    // Answers GET <token>/signals?<query> on the worker thread with a JSON body.
    using SignalsHandler = std::function<std::string(const std::string& query)>;
    explicit Bridge(SignalsHandler handler) : signals(std::move(handler)) {}
    ~Bridge();
    // Main-thread lifecycle only. The worker never touches any host/UI objects.
    bool start(const std::string& webDirectory);
    void stop();
    bool running() const { return worker.joinable(); }
    std::string url() const;
    const std::string& error() const { return lastError; }
private:
    void run();
    void serve(int client);
    struct Asset { std::string body, mime; };
    SignalsHandler signals;
    std::map<std::string, Asset> assets;
    std::atomic<bool> stopping{false};
    std::thread worker;
    int listener = -1;
    uint16_t port = 0;
    std::string token, lastError;
};
}
