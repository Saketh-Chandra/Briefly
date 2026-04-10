// swift-tools-version: 5.9
import PackageDescription

// Audio capture links only Apple frameworks at build time.
// Final Opus encoding happens at runtime in OpusEncoder.swift via ffmpeg/libopus.
let package = Package(
    name: "BrieflyCapture",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "BrieflyCapture",
            dependencies: [],
            path: "Sources/BrieflyCapture",
            linkerSettings: [
                .linkedFramework("ScreenCaptureKit"),
                .linkedFramework("AVFoundation"),
                .linkedFramework("CoreMedia"),
                .linkedFramework("CoreAudio"),
            ]
        )
    ]
)
