import Foundation

/// OpusEncoder writes an .opus file from 16kHz mono Float32 PCM.
///
/// Strategy: buffer system and mic PCM samples to separate temp .raw files during
/// recording, then on flush() call ffmpeg to produce the final .opus file.
/// When both sources are present, ffmpeg's amix filter properly blends them.
class OpusEncoder {
    let outputPath: String
    private let tempPCMPathSystem: String
    private let tempPCMPathMic: String
    private var fileHandleSystem: FileHandle?
    private var fileHandleMic: FileHandle?
    private var hasMicData = false

    init(outputPath: String) throws {
        self.outputPath = outputPath
        self.tempPCMPathSystem = outputPath + ".sys.raw"
        self.tempPCMPathMic = outputPath + ".mic.raw"
        FileManager.default.createFile(atPath: tempPCMPathSystem, contents: nil)
        fileHandleSystem = FileHandle(forWritingAtPath: tempPCMPathSystem)
        guard fileHandleSystem != nil else {
            throw OpusEncoderError.cannotOpenFile(tempPCMPathSystem)
        }
    }

    /// Accept system-audio PCM samples. Buffers them to disk as raw Float32 LE.
    func encode(pcm: [Float]) throws {
        var mutablePCM = pcm
        let data = Data(bytes: &mutablePCM, count: pcm.count * MemoryLayout<Float>.size)
        fileHandleSystem?.write(data)
    }

    /// Accept microphone PCM samples. Buffers them to a separate raw file.
    func encodeMic(pcm: [Float]) throws {
        if fileHandleMic == nil {
            FileManager.default.createFile(atPath: tempPCMPathMic, contents: nil)
            fileHandleMic = FileHandle(forWritingAtPath: tempPCMPathMic)
            guard fileHandleMic != nil else {
                throw OpusEncoderError.cannotOpenFile(tempPCMPathMic)
            }
        }
        hasMicData = true
        var mutablePCM = pcm
        let data = Data(bytes: &mutablePCM, count: pcm.count * MemoryLayout<Float>.size)
        fileHandleMic?.write(data)
    }

    /// Close the raw PCM files and encode to Opus using ffmpeg.
    /// When mic data is present, uses amix to blend both sources.
    func flush() throws {
        fileHandleSystem?.closeFile()
        fileHandleSystem = nil
        fileHandleMic?.closeFile()
        fileHandleMic = nil

        // Electron apps don't inherit the login shell PATH, so /usr/bin/env may not
        // find Homebrew binaries. Probe known install locations explicitly.
        let ffmpegCandidates = [
            "/opt/homebrew/bin/ffmpeg",  // Apple Silicon Homebrew
            "/usr/local/bin/ffmpeg",     // Intel Homebrew
            "/usr/bin/ffmpeg",
        ]
        guard let ffmpegPath = ffmpegCandidates.first(where: { FileManager.default.fileExists(atPath: $0) }) else {
            try? FileManager.default.removeItem(atPath: tempPCMPathSystem)
            try? FileManager.default.removeItem(atPath: tempPCMPathMic)
            throw OpusEncoderError.encodingFailed("ffmpeg not found. Install with: brew install ffmpeg")
        }

        let result: Int32
        if hasMicData && FileManager.default.fileExists(atPath: tempPCMPathMic) {
            // Mix system + mic, then explicitly resample/reset timestamps before
            // libopus so the output stream has stable 48k timing for playback.
            result = shell(
                ffmpegPath,
                args: [
                    "-y",
                    "-f", "f32le", "-ar", "16000", "-ac", "1", "-i", tempPCMPathSystem,
                    "-f", "f32le", "-ar", "16000", "-ac", "1", "-i", tempPCMPathMic,
                    "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=longest:normalize=1,aresample=48000,asetpts=N/SR/TB[aout]",
                    "-map", "[aout]",
                    "-c:a", "libopus", "-b:a", "32k", outputPath
                ],
                logStderr: true
            )
        } else {
            result = shell(
                ffmpegPath,
                args: [
                    "-y",
                    "-f", "f32le", "-ar", "16000", "-ac", "1",
                    "-i", tempPCMPathSystem,
                    "-af", "aresample=48000,asetpts=N/SR/TB",
                    "-c:a", "libopus", "-b:a", "32k", outputPath
                ],
                logStderr: true
            )
        }

        // Clean up temp files regardless
        try? FileManager.default.removeItem(atPath: tempPCMPathSystem)
        try? FileManager.default.removeItem(atPath: tempPCMPathMic)

        guard result == 0 else {
            throw OpusEncoderError.encodingFailed("ffmpeg exited with code \(result)")
        }
    }

    @discardableResult
    private func shell(_ command: String, args: [String], logStderr: Bool = false) -> Int32 {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: command)
        process.arguments = args
        process.standardOutput = FileHandle.nullDevice
        process.standardError = logStderr ? FileHandle.standardError : FileHandle.nullDevice
        try? process.run()
        process.waitUntilExit()
        return process.terminationStatus
    }
}

enum OpusEncoderError: Error, LocalizedError {
    case cannotOpenFile(String)
    case encodingFailed(String)

    var errorDescription: String? {
        switch self {
        case .cannotOpenFile(let p): return "Cannot open file for writing: \(p)"
        case .encodingFailed(let msg): return "Opus encoding failed: \(msg)"
        }
    }
}
