#include "FakeLive.h"
#include <iostream>

// Publishes test tracks until stdin closes or receives 'q'. Prints "ready" once
// announced. Used by the browser tests in place of Live.
int main(int argc, char** argv) {
    const std::string peer = argc > 1 ? argv[1] : "ASCII Test Live";
    FakeLive live(peer, {{"Kick Drum", 60, true}, {"Hats", 8000, false}, {"Pad \"Wide\"", 700, false}});
    std::cout << "ready" << std::endl;
    char command;
    while (std::cin.get(command) && command != 'q') {}
    return 0;
}
