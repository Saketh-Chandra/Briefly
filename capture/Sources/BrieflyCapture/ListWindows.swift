import ScreenCaptureKit
import Foundation

struct ListWindows {
    static func run() {
        let semaphore = DispatchSemaphore(value: 0)
        Task {
            defer { semaphore.signal() }
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(
                    false, onScreenWindowsOnly: true
                )
                let windows: [[String: Any]] = content.windows.compactMap { win in
                    guard let app = win.owningApplication else { return nil }
                    return [
                        "id": win.windowID,
                        "title": win.title ?? "",
                        "app": app.bundleIdentifier
                    ]
                }
                if let data = try? JSONSerialization.data(withJSONObject: windows),
                   let str = String(data: data, encoding: .utf8) {
                    print(str)
                    fflush(stdout)
                }
            } catch {
                fputs("Error listing windows: \(error.localizedDescription)\n", stderr)
                exit(1)
            }
        }
        semaphore.wait()
    }
}
