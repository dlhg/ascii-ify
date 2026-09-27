#include "Plugin.h"
#include "Version.h"
#include "base/source/fstreamer.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"
#include "pluginterfaces/vst/ivstprocesscontext.h"
#include <chrono>
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
    processContextRequirements.needTempo().needProjectTimeMusic().needTransportState();
    local->setName("Plugin track");
    return kResultOk;
}
tresult PLUGIN_API Plugin::terminate() {
    local->signals.active = false;
    local->transportValid = false;
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
    local->signals.active = state;
    return kResultOk;
}
tresult PLUGIN_API Plugin::setProcessing(TBool state) {
    local->signals.active = state;
    return kResultOk;
}
tresult PLUGIN_API Plugin::process(ProcessData& data) {
    if (data.inputParameterChanges) {
        for (int32 i = 0; i < data.inputParameterChanges->getParameterCount(); ++i) {
            auto* queue = data.inputParameterChanges->getParameterData(i);
            if (!queue || queue->getParameterId() != bypassID || queue->getPointCount() == 0) continue;
            int32 offset; ParamValue value;
            if (queue->getPoint(queue->getPointCount() - 1, offset, value) == kResultTrue)
                local->signals.bypass.store(value >= 0.5, std::memory_order_relaxed);
        }
    }
    if (const auto* context = data.processContext) {
        constexpr uint32 needed = ProcessContext::kTempoValid | ProcessContext::kProjectTimeMusicValid;
        if ((context->state & needed) == needed) {
            local->tempo.store(context->tempo, std::memory_order_relaxed);
            local->beat.store(context->projectTimeMusic, std::memory_order_relaxed);
            local->playing.store((context->state & ProcessContext::kPlaying) != 0, std::memory_order_relaxed);
            local->transportMicros.store(std::chrono::duration_cast<std::chrono::microseconds>(
                std::chrono::steady_clock::now().time_since_epoch()).count(), std::memory_order_relaxed);
            local->transportValid.store(true, std::memory_order_relaxed);
        }
    }
    if (data.numSamples <= 0 || data.numOutputs < 1 || !data.outputs) return kResultOk;
    auto& out = data.outputs[0];
    const auto* in = data.numInputs > 0 && data.inputs ? &data.inputs[0] : nullptr;
    const int channels = in ? in->numChannels : 0;
    const uint64 silence = in ? in->silenceFlags : ~uint64{0};
    const bool analyze = !local->signals.bypass.load(std::memory_order_relaxed) && data.processMode != kOffline;
    if (data.symbolicSampleSize == kSample32)
        analysis.process(in ? in->channelBuffers32 : nullptr, channels, out.channelBuffers32,
            out.numChannels, data.numSamples, silence, analyze, local->signals);
    else if (data.symbolicSampleSize == kSample64)
        analysis.process(in ? in->channelBuffers64 : nullptr, channels, out.channelBuffers64,
            out.numChannels, data.numSamples, silence, analyze, local->signals);
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
    local->signals.bypass = bypass != 0;
    setParamNormalized(bypassID, bypass != 0 ? 1 : 0);
    return kResultOk;
}
tresult PLUGIN_API Plugin::getState(IBStream* stream) {
    if (!stream) return kInvalidArgument;
    IBStreamer writer(stream, kLittleEndian);
    return writer.writeInt32(1) && writer.writeInt32(local->signals.bypass ? 1 : 0) ? kResultOk : kResultFalse;
}
IPlugView* PLUGIN_API Plugin::createView(FIDString name) {
    return name && FIDStringsEqual(name, ViewType::kEditor) ? makeEditor(hub) : nullptr;
}
tresult PLUGIN_API Plugin::setChannelContextInfos(IAttributeList* list) {
    if (!list) return kInvalidArgument;
    String128 name{};
    if (list->getString(ChannelContext::kChannelNameKey, name, sizeof(name)) == kResultTrue) {
        std::string utf8;
        for (int i = 0; i < 128 && name[i]; ++i) {
            // Track names are UTF-16; encode the BMP as UTF-8 (surrogates become '?').
            const auto c = static_cast<uint32_t>(name[i]);
            if (c < 0x80) utf8 += static_cast<char>(c);
            else if (c < 0x800) { utf8 += char(0xC0 | c >> 6); utf8 += char(0x80 | (c & 0x3F)); }
            else if (c >= 0xD800 && c < 0xE000) utf8 += '?';
            else { utf8 += char(0xE0 | c >> 12); utf8 += char(0x80 | (c >> 6 & 0x3F)); utf8 += char(0x80 | (c & 0x3F)); }
        }
        if (!utf8.empty()) local->setName(utf8);
    }
    return kResultOk;
}
tresult PLUGIN_API Plugin::queryInterface(const TUID _iid, void** obj) {
    DEF_INTERFACE(ChannelContext::IInfoListener)
    return SingleComponentEffect::queryInterface(_iid, obj);
}
}

bool InitModule() { return true; }
bool DeinitModule() { return true; }

BEGIN_FACTORY_DEF("ascii-ify", "https://github.com/dlhg/ascii-ify", "")
DEF_CLASS2(INLINE_UID(0xA548E728, 0xD1AD4F2C, 0xBD808BC3, 0x9EF79D11),
    PClassInfo::kManyInstances, kVstAudioEffectClass, "ASCII Visuals", 0,
    "Fx|Analyzer", ASCII_VISUALS_VERSION, kVstVersionString, ascii_plugin::Plugin::createInstance)
END_FACTORY
