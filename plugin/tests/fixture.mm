#import <Cocoa/Cocoa.h>
#include "public.sdk/source/vst/hosting/module.h"
#include "public.sdk/source/vst/hosting/hostclasses.h"
#include "public.sdk/source/vst/hosting/parameterchanges.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/gui/iplugview.h"
#include <poll.h>
#include <unistd.h>
#include <cmath>
#include <iostream>
#include <thread>

using namespace Steinberg;
using namespace Steinberg::Vst;
void check(bool value, const char* text) { if (!value) throw std::runtime_error(text); }

// A tiny test host loads the actual built bundle, attaches its native editor,
// then sends synthetic audio through the VST3 interface. No Ableton state changes.
int main(int argc, char** argv) {
    @autoreleasepool {
        if (argc != 2) { std::cerr << "Usage: ascii-bridge-fixture <plugin-bundle>\n"; return 1; }
        try {
            [NSApplication sharedApplication];
            std::string error;
            auto module = VST3::Hosting::Module::create(argv[1], error);
            if (!module) throw std::runtime_error(error);
            const auto& factory = module->getFactory();
            auto component = factory.createInstance<IComponent>(factory.classInfos().at(0).ID());
            check(bool(component), "Could not instantiate the plugin");
            HostApplication host;
            check(component->initialize(&host) == kResultOk, "Could not initialize");
            FUnknownPtr<IAudioProcessor> processor(component);
            FUnknownPtr<IEditController> controller(component);
            check(processor && controller, "Missing VST3 interfaces");
            SpeakerArrangement stereo = SpeakerArr::kStereo;
            check(processor->setBusArrangements(&stereo, 1, &stereo, 1) == kResultOk, "Stereo rejected");
            ProcessSetup setup{kRealtime, kSample32, 256, 48000};
            check(processor->setupProcessing(setup) == kResultOk, "Could not prepare audio");
            component->activateBus(kAudio, kInput, 0, true);
            component->activateBus(kAudio, kOutput, 0, true);
            component->setActive(true);
            processor->setProcessing(true);
            auto view = owned(controller->createView(ViewType::kEditor));
            check(bool(view), "Missing editor");
            NSView* parent = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 460, 230)];
            check(view->attached((__bridge void*)parent, kPlatformTypeNSView) == kResultOk, "Could not attach editor");
            auto* panel = parent.subviews.firstObject;
            NSString* url = [panel valueForKey:@"visualsURL"];
            check(url.length > 0, "Editor could not start its bundled visuals");
            std::cout << url.UTF8String << std::endl;
            // Closing the editor must leave the browser connection alive.
            view->removed();
            view = nullptr;

            uint64_t sample = 0;
            bool pause = false, bypass = false;
            float frequency = 60;
            float left[256], right[256], outLeft[256], outRight[256];
            float* inputs[] = {left, right};
            float* outputs[] = {outLeft, outRight};
            AudioBusBuffers input{}, output{};
            input.numChannels = output.numChannels = 2;
            input.channelBuffers32 = inputs;
            output.channelBuffers32 = outputs;
            ParameterChanges changes(1);
            ProcessData data{};
            data.processMode = kRealtime;
            data.symbolicSampleSize = kSample32;
            data.numSamples = 256;
            data.numInputs = data.numOutputs = 1;
            data.inputs = &input;
            data.outputs = &output;
            data.inputParameterChanges = &changes;
            while (true) {
                pollfd inputEvent{STDIN_FILENO, POLLIN, 0};
                if (poll(&inputEvent, 1, 0) > 0 && (inputEvent.revents & POLLIN)) {
                    char command;
                    if (read(STDIN_FILENO, &command, 1) != 1 || command == 'q') break;
                    if (command == 'p') pause = true;
                    if (command == 'r') { pause = false; frequency = 60; bypass = false; }
                    if (command == 'b') bypass = true;
                    if (command == 's') frequency = 0;
                    if (command == 'h') frequency = 10000;
                }
                if (!pause) {
                    changes.clearQueue();
                    int32 index;
                    changes.addParameterData(0, index)->addPoint(0, bypass ? 1 : 0, index);
                    for (int i = 0; i < 256; ++i, ++sample) {
                        left[i] = 0.5f * std::sin(2 * 3.141592653589793 * frequency * sample / 48000);
                        right[i] = -left[i];
                    }
                    check(processor->process(data) == kResultOk, "Processing failed");
                    check(std::memcmp(left, outLeft, sizeof(left)) == 0 &&
                          std::memcmp(right, outRight, sizeof(right)) == 0, "Plugin altered audio");
                }
                std::this_thread::sleep_for(std::chrono::microseconds(5333));
            }
            processor->setProcessing(false);
            component->setActive(false);
            component->terminate();
            return 0;
        } catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
    }
}
