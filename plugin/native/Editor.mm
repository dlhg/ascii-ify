#import <Cocoa/Cocoa.h>
#include "Plugin.h"
#include "Version.h"
#include "public.sdk/source/common/pluginview.h"

// Unique Objective-C class name: several VST bundles share the host runtime.
@interface ASCIIIfyVisualsPanel : NSView
@property(nonatomic, copy) NSString* visualsURL;
@end
@implementation ASCIIIfyVisualsPanel
- (BOOL)isFlipped { return YES; }
- (void)openVisuals:(id)sender {
    if (self.visualsURL.length) [[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:self.visualsURL]];
}
- (void)copyLink:(id)sender {
    if (!self.visualsURL.length) return;
    [[NSPasteboard generalPasteboard] clearContents];
    [[NSPasteboard generalPasteboard] setString:self.visualsURL forType:NSPasteboardTypeString];
}
@end

namespace ascii_plugin {
namespace {
void label(NSView* view, NSString* text, NSRect rect, CGFloat size, NSColor* color) {
    auto* field = [NSTextField wrappingLabelWithString:text];
    field.frame = rect;
    field.font = [NSFont systemFontOfSize:size];
    field.textColor = color;
    [view addSubview:field];
}
class Editor final : public Steinberg::CPluginView {
public:
    explicit Editor(std::shared_ptr<Hub> connection) : hub(std::move(connection)) {
        setRect({0, 0, 460, 230});
    }
    ~Editor() override { removed(); }
    Steinberg::tresult PLUGIN_API isPlatformTypeSupported(Steinberg::FIDString type) override {
        return type && Steinberg::FIDStringsEqual(type, Steinberg::kPlatformTypeNSView)
            ? Steinberg::kResultTrue : Steinberg::kResultFalse;
    }
    Steinberg::tresult PLUGIN_API attached(void* parent, Steinberg::FIDString type) override {
        if (!parent || isPlatformTypeSupported(type) != Steinberg::kResultTrue) return Steinberg::kResultFalse;
        if (panel) removed();
        NSBundle* bundle = [NSBundle bundleForClass:[ASCIIIfyVisualsPanel class]];
        NSString* directory = [bundle.resourcePath stringByAppendingPathComponent:@"Web"];
        const bool ready = directory && hub->start(directory.UTF8String);
        panel = [[ASCIIIfyVisualsPanel alloc] initWithFrame:NSMakeRect(0, 0, 460, 230)];
        panel.wantsLayer = YES;
        panel.layer.backgroundColor = [NSColor colorWithWhite:0.055 alpha:1].CGColor;
        panel.visualsURL = [NSString stringWithUTF8String:hub->url().c_str()];
        label(panel, @"ASCII VISUALS", NSMakeRect(24, 20, 412, 32), 24, NSColor.whiteColor);
        label(panel, @"v" ASCII_VISUALS_VERSION, NSMakeRect(360, 27, 80, 24), 12, NSColor.lightGrayColor);
        label(panel, @"One device reaches every track: turn on Link and Link Audio in Live's Settings → Link, then open the visuals.",
            NSMakeRect(24, 62, 412, 44), 14, NSColor.lightGrayColor);
        auto* button = [NSButton buttonWithTitle:@"Open Visuals" target:panel action:@selector(openVisuals:)];
        button.frame = NSMakeRect(20, 116, 174, 36);
        button.bezelStyle = NSBezelStyleRounded;
        button.enabled = ready;
        [panel addSubview:button];
        auto* copy = [NSButton buttonWithTitle:@"Copy link" target:panel action:@selector(copyLink:)];
        copy.frame = NSMakeRect(200, 116, 106, 36);
        copy.bezelStyle = NSBezelStyleRounded;
        copy.enabled = ready;
        [panel addSubview:copy];
        label(panel, ready ? @"Audio passes through unchanged.\nKeep this device in your set while using the visuals."
                          : [NSString stringWithUTF8String:hub->error().c_str()],
            NSMakeRect(24, 170, 412, 50), 12, NSColor.lightGrayColor);
        [(__bridge NSView*)parent addSubview:panel];
        return CPluginView::attached(parent, type);
    }
    Steinberg::tresult PLUGIN_API removed() override {
        [panel removeFromSuperview];
        panel = nil;
        // The connection lives with the device, not the editor window.
        return CPluginView::removed();
    }
private:
    std::shared_ptr<Hub> hub;
    ASCIIIfyVisualsPanel* __strong panel = nil;
};
}
Steinberg::IPlugView* makeEditor(std::shared_ptr<Hub> hub) { return new Editor(std::move(hub)); }
}
