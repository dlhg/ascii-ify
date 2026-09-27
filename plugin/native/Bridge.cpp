#include "Bridge.h"
#include "Version.h"
#include <arpa/inet.h>
#include <sys/socket.h>
#include <poll.h>
#include <unistd.h>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <locale>
#include <sstream>

namespace ascii_plugin {
namespace {
std::string mimeFor(const std::string& ext) {
    if (ext == ".html") return "text/html; charset=utf-8";
    if (ext == ".js") return "text/javascript; charset=utf-8";
    if (ext == ".css") return "text/css; charset=utf-8";
    if (ext == ".svg") return "image/svg+xml";
    return "application/octet-stream";
}
void reply(int fd, int status, const std::string& mime, const std::string& body) {
    std::string response = "HTTP/1.1 " + std::to_string(status) +
        (status == 200 ? " OK\r\n" : " Error\r\n") +
        "Content-Type: " + mime + "\r\nContent-Length: " + std::to_string(body.size()) +
        "\r\nConnection: close\r\nCache-Control: no-store\r\n"
        "X-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\n"
        "Content-Security-Policy: default-src 'self'; connect-src 'self'; "
        "script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
        "frame-ancestors 'self'; base-uri 'none'\r\n\r\n" + body;
    size_t sent = 0;
    while (sent < response.size()) {
        const auto count = send(fd, response.data() + sent, response.size() - sent, 0);
        if (count <= 0) break;
        sent += static_cast<size_t>(count);
    }
}
}

Bridge::~Bridge() { stop(); }
bool Bridge::start(const std::string& directory) {
    if (worker.joinable()) return true;
    lastError.clear();
    assets.clear();
    try {
        for (const auto& entry : std::filesystem::recursive_directory_iterator(directory)) {
            if (!entry.is_regular_file() || entry.is_symlink() || entry.file_size() > 4 * 1024 * 1024) continue;
            std::ifstream file(entry.path(), std::ios::binary);
            if (!file) continue;
            assets.emplace(entry.path().lexically_relative(directory).generic_string(),
                Asset{std::string(std::istreambuf_iterator<char>(file), {}), mimeFor(entry.path().extension())});
        }
        if (!assets.count("plugin/web/index.html")) throw std::runtime_error("Bundled visuals are missing. Rebuild the plugin.");
        unsigned char bytes[16];
        arc4random_buf(bytes, sizeof(bytes));
        std::ostringstream hex;
        for (auto byte : bytes) hex << std::hex << std::setw(2) << std::setfill('0') << int(byte);
        token = hex.str();
        listener = socket(AF_INET, SOCK_STREAM, 0);
        if (listener < 0) throw std::runtime_error("Could not create the local connection.");
        sockaddr_in address{};
        address.sin_family = AF_INET;
        address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
        address.sin_port = 0; // OS-assigned port: multiple instances never contend.
        if (bind(listener, reinterpret_cast<sockaddr*>(&address), sizeof(address)) != 0 || listen(listener, 8) != 0)
            throw std::runtime_error("Could not open the local connection.");
        socklen_t size = sizeof(address);
        if (getsockname(listener, reinterpret_cast<sockaddr*>(&address), &size) != 0)
            throw std::runtime_error("Could not find the local connection address.");
        port = ntohs(address.sin_port);
        stopping = false;
        worker = std::thread([this] { run(); });
        return true;
    } catch (const std::exception& e) {
        lastError = e.what();
        stop();
        return false;
    }
}
void Bridge::stop() {
    stopping = true;
    if (worker.joinable()) worker.join(); // poll/read/write have bounded timeouts.
    if (listener >= 0) close(listener);
    listener = -1;
    port = 0;
}
std::string Bridge::url() const {
    return port ? "http://127.0.0.1:" + std::to_string(port) + "/" + token + "/plugin/web/index.html" : "";
}
void Bridge::run() {
    while (!stopping.load()) {
        pollfd event{listener, POLLIN, 0};
        if (poll(&event, 1, 100) <= 0 || !(event.revents & POLLIN)) continue;
        const int client = accept(listener, nullptr, nullptr);
        if (client < 0) continue;
        timeval timeout{0, 200000};
        setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
        setsockopt(client, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
        const int noSigPipe = 1;
        setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &noSigPipe, sizeof(noSigPipe));
        try { serve(client); } catch (...) { /* A malformed request must not escape into the host. */ }
        close(client);
    }
}
void Bridge::serve(int client) {
    std::string request;
    char buffer[2048];
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(400);
    while (request.find("\r\n\r\n") == std::string::npos) {
        if (stopping.load() || request.size() >= 8192 || std::chrono::steady_clock::now() >= deadline) return;
        const auto count = recv(client, buffer, sizeof(buffer), 0);
        if (count <= 0) return;
        request.append(buffer, static_cast<size_t>(count));
    }
    std::istringstream lines(request);
    std::string method, path, version;
    lines >> method >> path >> version;
    std::string line, host, origin;
    std::getline(lines, line);
    while (std::getline(lines, line) && line != "\r") {
        const auto colon = line.find(':');
        if (colon == std::string::npos) continue;
        auto key = line.substr(0, colon);
        for (char& c : key) if (c >= 'A' && c <= 'Z') c += 'a' - 'A';
        auto value = line.substr(colon + 1);
        const auto first = value.find_first_not_of(" \t");
        value = first == std::string::npos ? "" : value.substr(first);
        const auto last = value.find_last_not_of(" \t\r");
        value = last == std::string::npos ? "" : value.substr(0, last + 1);
        if (key == "host") host = value;
        if (key == "origin") origin = value;
    }
    const std::string expectedHost = "127.0.0.1:" + std::to_string(port);
    if (method != "GET" || host != expectedHost || (!origin.empty() && origin != "http://" + expectedHost)) {
        reply(client, 403, "text/plain", "Local visuals only.");
        return;
    }
    const auto question = path.find('?');
    const auto query = question == std::string::npos ? "" : path.substr(question + 1);
    path = path.substr(0, question);
    const auto prefix = "/" + token + "/";
    if (path.compare(0, prefix.size(), prefix) != 0) {
        reply(client, 404, "text/plain", "Open Visuals from the plugin to connect.");
        return;
    }
    auto key = path.substr(prefix.size());
    if (key.empty()) key = "plugin/web/index.html";
    if (key == "signals") reply(client, 200, "application/json", signals(query));
    else if (key == "info") reply(client, 200, "application/json", "{\"pluginVersion\":\"" ASCII_VISUALS_VERSION "\"}");
    else if (const auto found = assets.find(key); found != assets.end())
        reply(client, 200, found->second.mime, found->second.body);
    else reply(client, 404, "text/plain", "Not found.");
}
}
