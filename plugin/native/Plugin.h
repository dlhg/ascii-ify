#pragma once
#include "Hub.h"
#include "pluginterfaces/vst/ivstchannelcontextinfo.h"
#include "public.sdk/source/vst/vstsinglecomponenteffect.h"
#include <memory>

namespace ascii_plugin {
// A combined component so all instances in the host process can share one Hub.
// This prototype targets in-process desktop hosts, not distributed processing.
class Plugin final : public Steinberg::Vst::SingleComponentEffect,
                     public Steinberg::Vst::ChannelContext::IInfoListener {
public:
    Plugin() : hub(Hub::acquire()), local(hub->addLocal()) {}
    ~Plugin() override { hub->removeLocal(local); }
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
    // Live reports the track name, index and color through this.
    Steinberg::tresult PLUGIN_API setChannelContextInfos(Steinberg::Vst::IAttributeList*) override;

    OBJ_METHODS(Plugin, SingleComponentEffect)
    Steinberg::tresult PLUGIN_API queryInterface(const Steinberg::TUID iid, void** obj) override;
    REFCOUNT_METHODS(SingleComponentEffect)
private:
    std::shared_ptr<Hub> hub;
    std::shared_ptr<LocalSource> local;
    Analysis analysis;
};

Steinberg::IPlugView* makeEditor(std::shared_ptr<Hub>);
}
