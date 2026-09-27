#pragma once
#include "Bridge.h"
#include "public.sdk/source/vst/vstsinglecomponenteffect.h"
#include <memory>

namespace ascii_plugin {
// A combined component keeps the local browser connection instance-specific.
// This prototype targets in-process desktop hosts, not distributed processing.
class Plugin final : public Steinberg::Vst::SingleComponentEffect {
public:
    Plugin() : bridge(std::make_shared<Bridge>()) {}
    static Steinberg::FUnknown* createInstance(void*) {
        return static_cast<Steinberg::Vst::IComponent*>(new Plugin);
    }
    Steinberg::tresult PLUGIN_API initialize(Steinberg::FUnknown*) override;
    Steinberg::tresult PLUGIN_API terminate() override;
    Steinberg::tresult PLUGIN_API setBusArrangements(Steinberg::Vst::SpeakerArrangement*, Steinberg::int32,
        Steinberg::Vst::SpeakerArrangement*, Steinberg::int32) override;
    Steinberg::tresult PLUGIN_API canProcessSampleSize(Steinberg::int32) override;
    Steinberg::tresult PLUGIN_API setupProcessing(Steinberg::Vst::ProcessSetup&) override;
    Steinberg::tresult PLUGIN_API setActive(Steinberg::TBool) override;
    Steinberg::tresult PLUGIN_API setProcessing(Steinberg::TBool) override;
    Steinberg::tresult PLUGIN_API process(Steinberg::Vst::ProcessData&) override;
    Steinberg::tresult PLUGIN_API setState(Steinberg::IBStream*) override;
    Steinberg::tresult PLUGIN_API getState(Steinberg::IBStream*) override;
    Steinberg::IPlugView* PLUGIN_API createView(Steinberg::FIDString) override;
private:
    std::shared_ptr<Bridge> bridge;
    Analysis analysis;
};

Steinberg::IPlugView* makeEditor(std::shared_ptr<Bridge>);
}
