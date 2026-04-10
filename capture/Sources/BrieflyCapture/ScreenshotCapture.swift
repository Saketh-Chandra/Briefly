import ScreenCaptureKit
import AppKit
import Foundation

struct ScreenshotCapture {
    static func capture(to path: String) async throws {
        if #available(macOS 14.0, *) {
            try await captureViaSCKit(to: path)
        } else {
            try captureViaCLI(to: path)
        }
    }

    @available(macOS 14.0, *)
    private static func captureViaSCKit(to path: String) async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(
            false, onScreenWindowsOnly: false
        )
        guard let display = content.displays.first else {
            throw ScreenshotError.noDisplay
        }

        let filter = SCContentFilter(
            display: display,
            excludingApplications: [],
            exceptingWindows: []
        )

        let config = SCStreamConfiguration()
        config.width = display.width
        config.height = display.height

        let cgImage = try await SCScreenshotManager.captureImage(
            contentFilter: filter,
            configuration: config
        )

        let nsImage = NSImage(cgImage: cgImage, size: NSSize(width: cgImage.width, height: cgImage.height))
        guard let tiffData = nsImage.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiffData),
              let pngData = bitmap.representation(using: NSBitmapImageRep.FileType.png, properties: [:]) else {
            throw ScreenshotError.encodingFailed
        }

        try pngData.write(to: URL(fileURLWithPath: path))
    }

    private static func captureViaCLI(to path: String) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        process.arguments = ["-x", "-t", "png", path]
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            throw ScreenshotError.encodingFailed
        }
    }
}

enum ScreenshotError: Error, LocalizedError {
    case noDisplay
    case encodingFailed

    var errorDescription: String? {
        switch self {
        case .noDisplay: return "No display available for screenshot"
        case .encodingFailed: return "Failed to capture or encode screenshot"
        }
    }
}

