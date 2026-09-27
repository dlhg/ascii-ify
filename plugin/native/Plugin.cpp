#include "Plugin.h"
#include "base/source/fstreamer.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"
#include "public.sdk/source/main/pluginfactory.h"

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace ascii_plugin {
constexpr ParamID bypassID = 0;
tresult PLUGIN_API Plugin::initialize(FUnknown* context) {
    const auto result = SingleComponentEffect::initialize(context);
    if (result != kResultOk) return result;
    addAudioInput(STR16("Audio In"), SpeakerArr::kStereo);
    addAudioOutput(STR16("Audio Out"), SpeakerArr::kStereo);
    parameters.addParameter(STR16("Bypass"), nullptr, 1, 0,
        ParameterInfo::kCanAutomate | ParameterInfo::kIsBypass, bypassID);
    return kResultOk;
}
tresult PLUGIN_API Plugin::terminate() {
    bridge->signals.active = false;
    bridge->stop();
    return SingleComponentEffect::terminate();
}
tresult PLUGIN_API Plugin::setBusArrangements(SpeakerArrangement* inputs, int32 numInputs,
    SpeakerArrangement* outputs, int32 numOutputs) {
    if (numInputs != 1 || numOutputs != 1 || !inputs || !outputs || inputs[0] != outputs[0] ||
        (inputs[0] != SpeakerArr::kMono && inputs[0] != SpeakerArr::kStereo)) return kResultFalse;
    return SingleComponentEffect::setBusArrangements(inputs, numInputs, outputs, numOutputs);
}
tresult PLUGIN_API Plugin::canProcessSampleSize(int32 size) {
    return size == kSample32 || size == kSample64 ? kResultTrue : kResultFalse;
}
tresult PLUGIN_API Plugin::setupProcessing(ProcessSetup& setup) {
    if (canProcessSampleSize(setup.symbolicSampleSize) != kResultTrue ||
        !std::isfinite(setup.sampleRate) || setup.sampleRate < 8000) return kResultFalse;
    analysis.prepare(setup.sampleRate);
    return SingleComponentEffect::setupProcessing(setup);
}
tresult PLUGIN_API Plugin::setActive(TBool state) {
    // Host calls this outside processing. Reactivate with clean envelopes.
    if (state) analysis.reset();
    bridge->signals.active = state;
    return kResultOk;
}
tresult PLUGIN_API Plugin::setProcessing(TBool state) {
    bridge->signals.active = state;
    return kResultOk;
}
tresult PLUGIN_API Plugin::process(ProcessData& data) {
    if (data.inputParameterChanges) {
        for (int32 i = 0; i < data.inputParameterChanges->getParameterCount(); ++i) {
            auto* queue = data.inputParameterChanges->getParameterData(i);
            if (!queue || queue->getParameterId() != bypassID || queue->getPointCount() == 0) continue;
            int32 offset; ParamValue value;
            if (queue->getPoint(queue->getPointCount() - 1, offset, value) == kResultTrue)
                bridge->signals.bypass.store(value >= 0.5, std::memory_order_relaxed);
        }
    }
    if (data.numSamples <= 0 || data.numOutputs < 1 || !data.outputs) return kResultOk;
    auto& out = data.outputs[0];
    const auto* in = data.numInputs > 0 && data.inputs ? &data.inputs[0] : nullptr;
    const int channels = in ? in->numChannels : 0;
    const uint64 silence = in ? in->silenceFlags : ~uint64{0};
    const bool analyze = !bridge->signals.bypass.load(std::memory_order_relaxed) && data.processMode != kOffline;
    if (data.symbolicSampleSize == kSample32)
        analysis.process(in ? in->channelBuffers32 : nullptr, channels, out.channelBuffers32,
            out.numChannels, data.numSamples, silence, analyze, bridge->signals);
    else if (data.symbolicSampleSize == kSample64)
        analysis.process(in ? in->channelBuffers64 : nullptr, channels, out.channelBuffers64,
            out.numChannels, data.numSamples, silence, analyze, bridge->signals);
    else return kResultFalse;
    out.silenceFlags = 0;
    for (int c = 0; c < out.numChannels; ++c)
        if (c >= channels || (silence & (uint64{1} << c))) out.silenceFlags |= uint64{1} << c;
    return kResultOk;
}
tresult PLUGIN_API Plugin::setState(IBStream* stream) {
    if (!stream) return kInvalidArgument;
    IBStreamer reader(stream, kLittleEndian);
    int32 version = 0, bypass = 0;
    if (!reader.readInt32(version) || version != 1 || !reader.readInt32(bypass)) return kResultFalse;
    bridge->signals.bypass = bypass != 0;
    setParamNormalized(bypassID, bypass != 0 ? 1 : 0);
    return kResultOk;
}
tresult PLUGIN_API Plugin::getState(IBStream* stream) {
    if (!stream) return kInvalidArgument;
    IBStreamer writer(stream, kLittleEndian);
    return writer.writeInt32(1) && writer.writeInt32(bridge->signals.bypass ? 1 : 0) ? kResultOk : kResultFalse;
}
IPlugView* PLUGIN_API Plugin::createView(FIDString name) {
    return name && FIDStringsEqual(name, ViewType::kEditor) ? makeEditor(bridge) : nullptr;
}
}

bool InitModule() { return true; }
bool DeinitModule() { return true; }

BEGIN_FACTORY_DEF("ascii-ify", "https://github.com/dlhg/ascii-ify", "")
DEF_CLASS2(INLINE_UID(0xA548E728, 0xD1AD4F2C, 0xBD808BC3, 0x9EF79D11),
    PClassInfo::kManyInstances, kVstAudioEffectClass, "ASCII Visuals", 0,
    "Fx|Analyzer", "0.2.1", kVstVersionString, ascii_plugin::Plugin::createInstance)
END_FACTORY
