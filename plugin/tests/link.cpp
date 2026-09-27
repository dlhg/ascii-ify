#include "FakeLive.h"
#include "Hub.h"
#include <filesystem>
#include <fstream>
#include <functional>
#include <iostream>
#include <regex>
#include <sstream>
#include <unistd.h>

using namespace ascii_plugin;
using namespace std::chrono_literals;
void check(bool value, const char* message) { if (!value) throw std::runtime_error(message); }
bool waitFor(const std::function<bool()>& condition, std::chrono::milliseconds limit = 5000ms) {
    const auto deadline = std::chrono::steady_clock::now() + limit;
    while (std::chrono::steady_clock::now() < deadline) {
        if (condition()) return true;
        std::this_thread::sleep_for(20ms);
    }
    return condition();
}
// Pulls one source object for a named track out of the /signals JSON.
std::smatch source(const std::string& json, const std::string& peer, const std::string& name) {
    std::smatch match;
    const std::regex pattern("\\{\"id\":\"link:([0-9a-f]{16})\",\"kind\":\"link\",\"name\":\"" + name +
        "\",\"peer\":\"" + peer + "\",\"subscribed\":(true|false),\"live\":(true|false),\"values\":\\[([^\\]]*)\\]\\}");
    std::regex_search(json, match, pattern);
    return match;
}
std::vector<double> values(const std::string& list) {
    std::vector<double> out;
    std::istringstream in(list);
    std::string item;
    while (std::getline(in, item, ',')) out.push_back(std::stod(item));
    return out;
}

int main() {
    try {
        const auto web = std::filesystem::temp_directory_path() / ("ascii-link-test-" + std::to_string(getpid()));
        std::filesystem::create_directories(web / "plugin/web");
        std::ofstream(web / "plugin/web/index.html") << "<!doctype html>";
        const std::string peer = "Link Test " + std::to_string(getpid());

        Hub hub;
        auto local = hub.addLocal();
        local->setName("Main");
        local->tempo = 133; local->beat = 8; local->playing = true; local->transportValid = true;
        local->transportMicros = std::chrono::duration_cast<std::chrono::microseconds>(
            std::chrono::steady_clock::now().time_since_epoch()).count();
        check(hub.start(web.string()), "Hub must start");
        check(hub.url().rfind("http://127.0.0.1:", 0) == 0, "Hub must serve on loopback");
        const auto first = hub.signals("");
        check(first.find("\"version\":2") != std::string::npos, "Signals must use version 2");
        check(first.find("\"features\":[\"rms\",\"bass\",\"mid\",\"high\",\"kick\",\"snare\",\"hat\"]") != std::string::npos, "Feature list");
        check(first.find("\"name\":\"Main\"") != std::string::npos, "Local track name must be reported");
        check(first.find("\"song\":{\"valid\":true,\"tempo\":133.000000") != std::string::npos, "Song tempo from host");

        // A peer that joins later adopts our (older) session: it must get the host
        // tempo, never our constructor default, so Live keeps its own tempo. Link
        // breaks ties between sessions under 0.5 s apart randomly, so wait first.
        std::this_thread::sleep_for(1200ms);
        hub.signals("");
        FakeLive live(peer, {{"Kick Drum", 60, true}, {"Hats", 8000, false}, {"Say \"hi\" \\ bye", 700, false}});
        check(waitFor([&] { return live.link.numPeers() > 0; }), "Fake Live must discover the hub");
        check(waitFor([&] { return std::abs(live.link.captureAppSessionState().tempo() - 133) < 0.01; }),
            "A joining peer must adopt the host tempo");

        std::string json;
        check(waitFor([&] { json = hub.signals(""); return !source(json, peer, "Hats").empty(); }), "Tracks must be listed");
        check(json.find("\"name\":\"Say \\\"hi\\\" \\\\ bye\"") != std::string::npos, "Track names must be JSON-escaped");
        auto kick = source(json, peer, "Kick Drum");
        auto hats = source(json, peer, "Hats");
        check(!kick.empty() && kick[2] == "false", "Unrequested tracks are not subscribed");
        check(!live.streaming(0), "Live must not send unsubscribed tracks");
        const std::string query = "sub=" + kick[1].str() + "," + hats[1].str() + ",zz,../../x";
        bool sawKick = false;
        check(waitFor([&] {
            json = hub.signals(query);
            kick = source(json, peer, "Kick Drum");
            hats = source(json, peer, "Hats");
            if (kick.empty() || hats.empty() || kick[3] != "true" || hats[3] != "true") return false;
            const auto k = values(kick[4]), h = values(hats[4]);
            if (k[Kick] > 0.5) sawKick = true;
            return sawKick && h[High] > h[Bass] * 4 && h[High] > 0.1;
        }, 10000ms) || (std::cerr << json << "\nsawKick=" << sawKick << '\n', false), "Subscribed tracks must be metered with the right bands and hits");
        check(live.streaming(0) && live.streaming(1), "Subscribed tracks must stream");
        check(!live.streaming(2), "Only requested tracks may stream");

        // Pages stop asking → Live stops sending within the subscription window.
        check(waitFor([&] { json = hub.signals(""); return source(json, peer, "Kick Drum")[2] == "false"; }, 4000ms),
            "Tracks nobody requests must be unsubscribed");
        check(waitFor([&] { return !live.streaming(0); }), "Unsubscribed tracks must stop streaming");
        std::filesystem::remove_all(web);
        std::cout << "Link checks passed: discovery, names, tempo safety, subscribe/unsubscribe, metering.\n";
        return 0;
    } catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
}
