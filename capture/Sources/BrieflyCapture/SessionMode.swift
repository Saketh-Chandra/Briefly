import Foundation

class SessionMode {
    private var audioCapture: AudioCapture?

    // Emit a JSON object as a single line to stdout, flushing immediately
    private func emit(_ dict: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: dict),
           let line = String(data: data, encoding: .utf8) {
            print(line)
            fflush(stdout)
        }
    }

    func run() {
        // Signal readiness immediately
        emit(["type": "ready"])

        // Block reading lines from stdin
        while let line = readLine() {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }
            do {
                try handleCommand(trimmed)
            } catch {
                emit(["type": "error", "message": error.localizedDescription])
            }
        }
    }

    private func handleCommand(_ line: String) throws {
        guard let data = line.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let cmd = json["cmd"] as? String else {
            throw SessionError.invalidJSON(line)
        }

        switch cmd {
        case "start_recording":
            guard let output = json["output"] as? String else {
                throw SessionError.missingField("output")
            }
            let mixMic = json["mix_mic"] as? Bool ?? false

            audioCapture = AudioCapture(
                outputPath: output,
                mixMic: mixMic,
                onLevel: { [weak self] rms in
                    self?.emit(["type": "level", "rms": rms])
                }
            )
            try audioCapture!.start()
            emit(["type": "status", "state": "recording"])

        case "stop_recording":
            guard let capture = audioCapture else {
                throw SessionError.notRecording
            }
            capture.stop()
            emit([
                "type": "stopped",
                "duration_s": capture.durationSeconds,
                "path": capture.outputPath
            ])
            exit(0)

        case "take_screenshot":
            guard let output = json["output"] as? String else {
                throw SessionError.missingField("output")
            }
            Task {
                do {
                    try await ScreenshotCapture.capture(to: output)
                    self.emit(["type": "screenshot_done", "path": output])
                } catch {
                    self.emit(["type": "error", "message": error.localizedDescription])
                }
            }

        default:
            throw SessionError.unknownCommand(cmd)
        }
    }
}

enum SessionError: Error, LocalizedError {
    case invalidJSON(String)
    case missingField(String)
    case unknownCommand(String)
    case notRecording

    var errorDescription: String? {
        switch self {
        case .invalidJSON(let s): return "Invalid JSON: \(s)"
        case .missingField(let f): return "Missing required field: \(f)"
        case .unknownCommand(let c): return "Unknown command: \(c)"
        case .notRecording: return "stop_recording called but no recording is active"
        }
    }
}


