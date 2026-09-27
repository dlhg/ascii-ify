cmake_minimum_required(VERSION 3.25)
set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "Minimum macOS")
file(READ "${CMAKE_CURRENT_SOURCE_DIR}/version.json" VERSION_JSON)
string(JSON ASCII_VERSION GET "${VERSION_JSON}" version)
project(AsciiVisuals VERSION ${ASCII_VERSION} LANGUAGES CXX OBJCXX)
configure_file(native/Version.h.in generated/Version.h @ONLY)
if(NOT APPLE)
    message(FATAL_ERROR "This first prototype uses a macOS editor and sockets.")
endif()
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(SMTG_ENABLE_VST3_PLUGIN_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SMTG_ENABLE_VST3_HOSTING_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SMTG_ENABLE_VSTGUI_SUPPORT OFF CACHE BOOL "" FORCE)
set(SMTG_CREATE_PLUGIN_LINK OFF CACHE BOOL "" FORCE)
set(SMTG_RUN_VST_VALIDATOR OFF CACHE BOOL "" FORCE)
set(SMTG_ENABLE_AUV2_BUILDS OFF CACHE BOOL "" FORCE)
set(SMTG_ENABLE_AUV3_BUILDS OFF CACHE BOOL "" FORCE)

if(NOT VST3_SDK_ROOT)
    include(FetchContent)
    FetchContent_Declare(vst3sdk
        GIT_REPOSITORY https://github.com/steinbergmedia/vst3sdk.git
        GIT_TAG 3cdf9ca5d1f5b1b21e0a86832aa4abe55607bd96
        GIT_SUBMODULES base cmake pluginterfaces public.sdk
        GIT_SUBMODULES_RECURSE OFF)
    FetchContent_MakeAvailable(vst3sdk)
    set(VST3_SDK_ROOT "${vst3sdk_SOURCE_DIR}")
else()
    add_subdirectory("${VST3_SDK_ROOT}" sdk)
endif()
smtg_enable_vst3_sdk()

# Ableton Link (GPLv2+) for Link Audio. Header-only; only its asio submodule is needed.
# See docs/link-audio.md before changing the pinned revision.
if(NOT LINK_ROOT)
    include(FetchContent)
    FetchContent_Declare(abletonlink
        GIT_REPOSITORY https://github.com/Ableton/link.git
        GIT_TAG 9c9091275e707ab09d09a5a608fcdb84bf0dec85
        GIT_SUBMODULES modules/asio-standalone
        SOURCE_SUBDIR do-not-add-link-examples)
    FetchContent_MakeAvailable(abletonlink)
    set(LINK_ROOT "${abletonlink_SOURCE_DIR}")
endif()
include("${LINK_ROOT}/AbletonLinkConfig.cmake")
if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/build/web/plugin/web/index.html")
    message(FATAL_ERROR "Build the bundled visuals first: npm run build:plugin-web")
endif()

smtg_add_vst3plugin(AsciiVisuals PACKAGE_NAME "ASCII Visuals" SOURCES_LIST
    native/Plugin.cpp native/Plugin.h native/Analysis.h native/Meter.h native/Bridge.cpp native/Bridge.h
    native/Hub.cpp native/Hub.h native/LinkReceiver.cpp native/LinkReceiver.h native/Editor.mm
    "${VST3_SDK_ROOT}/public.sdk/source/vst/vstsinglecomponenteffect.cpp")
target_include_directories(AsciiVisuals PRIVATE "${VST3_SDK_ROOT}" "${CMAKE_CURRENT_BINARY_DIR}/generated")
target_link_libraries(AsciiVisuals PRIVATE sdk Ableton::Link "-framework Cocoa")
set_source_files_properties(native/Editor.mm PROPERTIES COMPILE_FLAGS "-fobjc-arc")
smtg_target_set_bundle(AsciiVisuals
    BUNDLE_IDENTIFIER "com.ascii-ify.visuals"
    COMPANY_NAME "ascii-ify")
set_target_properties(AsciiVisuals PROPERTIES
    MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_SOURCE_DIR}/native/Info.plist.in"
    MACOSX_BUNDLE_GUI_IDENTIFIER "com.ascii-ify.visuals"
    MACOSX_BUNDLE_BUNDLE_NAME "ASCII Visuals"
    MACOSX_BUNDLE_BUNDLE_VERSION "${PROJECT_VERSION}"
    MACOSX_BUNDLE_SHORT_VERSION_STRING "${PROJECT_VERSION}")
file(GLOB_RECURSE WEB_ASSETS CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/build/web/*")
set_property(TARGET AsciiVisuals APPEND PROPERTY LINK_DEPENDS ${WEB_ASSETS})
add_custom_command(TARGET AsciiVisuals POST_BUILD
    COMMAND "${CMAKE_COMMAND}" -E rm -rf "$<TARGET_BUNDLE_DIR:AsciiVisuals>/Contents/Resources/Web"
    COMMAND "${CMAKE_COMMAND}" -E copy_directory "${CMAKE_CURRENT_SOURCE_DIR}/build/web" "$<TARGET_BUNDLE_DIR:AsciiVisuals>/Contents/Resources/Web"
    COMMAND "${CMAKE_COMMAND}" -E copy "${VST3_SDK_ROOT}/LICENSE.txt" "$<TARGET_BUNDLE_DIR:AsciiVisuals>/Contents/Resources/VST3-LICENSE.txt"
    COMMAND "${CMAKE_COMMAND}" -E copy "${CMAKE_CURRENT_SOURCE_DIR}/COPYING.md" "$<TARGET_BUNDLE_DIR:AsciiVisuals>/Contents/Resources/COPYING.md"
    COMMAND "${CMAKE_COMMAND}" -E copy "${LINK_ROOT}/LICENSE.md" "$<TARGET_BUNDLE_DIR:AsciiVisuals>/Contents/Resources/Link-LICENSE.md"
    COMMAND codesign --force --sign - "$<TARGET_BUNDLE_DIR:AsciiVisuals>"
    VERBATIM)

enable_testing()
add_executable(ascii-native-tests tests/native.cpp)
target_include_directories(ascii-native-tests PRIVATE native)
add_test(NAME ascii-native-tests COMMAND ascii-native-tests)
add_executable(ascii-link-tests tests/link.cpp native/Hub.cpp native/Bridge.cpp native/LinkReceiver.cpp)
target_include_directories(ascii-link-tests PRIVATE native "${CMAKE_CURRENT_BINARY_DIR}/generated")
target_link_libraries(ascii-link-tests PRIVATE Ableton::Link)
add_test(NAME ascii-link-tests COMMAND ascii-link-tests)
# Stands in for Live in browser tests: a Link peer that publishes named test tracks.
add_executable(ascii-link-sender tests/sender.cpp)
target_link_libraries(ascii-link-sender PRIVATE Ableton::Link)
add_executable(ascii-bridge-fixture tests/fixture.mm
    "${VST3_SDK_ROOT}/public.sdk/source/vst/hosting/module_mac.mm")
target_compile_options(ascii-bridge-fixture PRIVATE -fobjc-arc)
target_include_directories(ascii-bridge-fixture PRIVATE "${VST3_SDK_ROOT}")
target_link_libraries(ascii-bridge-fixture PRIVATE sdk_hosting "-framework Cocoa")
add_dependencies(ascii-bridge-fixture AsciiVisuals)
