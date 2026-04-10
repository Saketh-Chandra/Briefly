import AVFoundation
import ScreenCaptureKit
import CoreMedia
import Foundation

class AudioCapture: NSObject, SCStreamDelegate, SCStreamOutput {
    let outputPath: String
    let mixMic: Bool
    let onLevel: (Float) -> Void

    private var stream: SCStream?
    private var audioEngine: AVAudioEngine?
    private var encoder: OpusEncoder?
    private var startTime: Date?
    var durationSeconds: Int = 0

    private let targetFormat = AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: 16000,
        channels: 1,
        interleaved: false
    )!

    // Serial queue for feeding PCM into the encoder from both sources
    private let encodeQueue = DispatchQueue(label: "com.briefly.encode")

    init(outputPath: String, mixMic: Bool, onLevel: @escaping (Float) -> Void) {
        self.outputPath = outputPath
        self.mixMic = mixMic
        self.onLevel = onLevel
    }

    func start() throws {
        encoder = try OpusEncoder(outputPath: outputPath)

        // ScreenCaptureKit setup requires async context; use a semaphore to block
        let semaphore = DispatchSemaphore(value: 0)
        var captureError: Error?

        Task {
            defer { semaphore.signal() }
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(
                    false, onScreenWindowsOnly: false
                )
                guard let display = content.displays.first else {
                    throw AudioCaptureError.noDisplay
                }

                let filter = SCContentFilter(
                    display: display,
                    excludingApplications: [],
                    exceptingWindows: []
                )

                let config = SCStreamConfiguration()
                config.capturesAudio = true
                config.excludesCurrentProcessAudio = true
                config.sampleRate = 48000
                config.channelCount = 2

                self.stream = SCStream(filter: filter, configuration: config, delegate: self)
                try self.stream!.addStreamOutput(
                    self,
                    type: .audio,
                    sampleHandlerQueue: self.encodeQueue
                )
                try await self.stream!.startCapture()
            } catch {
                captureError = error
            }
        }

        semaphore.wait()
        if let error = captureError { throw error }

        // Microphone tap
        if mixMic {
            let engine = AVAudioEngine()
            let inputNode = engine.inputNode
            do {
                try inputNode.setVoiceProcessingEnabled(true)
                if #available(macOS 14.0, *) {
                    inputNode.voiceProcessingOtherAudioDuckingConfiguration =
                        AVAudioVoiceProcessingOtherAudioDuckingConfiguration(
                            enableAdvancedDucking: false,
                            duckingLevel: .min
                        )
                }
            } catch {
                fputs("[AudioCapture] Voice processing unavailable: \(error.localizedDescription)\n", stderr)
            }
            let inputFormat = inputNode.outputFormat(forBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, _ in
                guard let self = self else { return }
                self.encodeQueue.async {
                    if let resampled = self.resample(buffer, to: self.targetFormat) {
                        self.feedToEncoder(resampled, source: "mic")
                    }
                }
            }
            try engine.start()
            audioEngine = engine
        }

        startTime = Date()
    }

    func stop() {
        // Stop mic tap
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine?.stop()
        audioEngine = nil

        // Stop SCStream synchronously
        let semaphore = DispatchSemaphore(value: 0)
        Task {
            try? await stream?.stopCapture()
            semaphore.signal()
        }
        semaphore.wait()
        stream = nil

        // Flush and close encoder — surface errors to stderr so they appear in Electron logs
        encodeQueue.sync {
            do {
                try encoder?.flush()
            } catch {
                fputs("[AudioCapture] Opus encoding failed: \(error.localizedDescription)\n", stderr)
            }
            encoder = nil
        }

        if let start = startTime {
            durationSeconds = Int(Date().timeIntervalSince(start))
        }
    }

    // MARK: - SCStreamOutput

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of type: SCStreamOutputType
    ) {
        guard type == .audio else { return }
        guard let pcmBuffer = sampleBuffer.asPCMBuffer() else { return }
        guard let resampled = resample(pcmBuffer, to: targetFormat) else { return }
        feedToEncoder(resampled, source: "system")
    }

    // MARK: - SCStreamDelegate

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        fputs("[AudioCapture] Stream stopped with error: \(error.localizedDescription)\n", stderr)
    }

    // MARK: - Helpers

    private func feedToEncoder(_ buffer: AVAudioPCMBuffer, source: String) {
        guard let channelData = buffer.floatChannelData else { return }
        let frameCount = Int(buffer.frameLength)
        let samples = Array(UnsafeBufferPointer(start: channelData[0], count: frameCount))

        // Compute RMS (~10x/sec throttle based on frame count at 16kHz)
        let rms = computeRMS(samples)
        onLevel(rms)

        do {
            if source == "mic" {
                try encoder?.encodeMic(pcm: samples)
            } else {
                try encoder?.encode(pcm: samples)
            }
        } catch {
            fputs("[AudioCapture] Encode error (\(source)): \(error.localizedDescription)\n", stderr)
        }
    }

    private func resample(_ buffer: AVAudioPCMBuffer, to format: AVAudioFormat) -> AVAudioPCMBuffer? {
        guard let converter = AVAudioConverter(from: buffer.format, to: format) else { return nil }

        let targetFrameCount = AVAudioFrameCount(
            Double(buffer.frameLength) * format.sampleRate / buffer.format.sampleRate
        )
        guard targetFrameCount > 0,
              let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: targetFrameCount) else {
            return nil
        }

        var error: NSError?
        var inputConsumed = false
        converter.convert(to: output, error: &error) { _, outStatus in
            if inputConsumed {
                outStatus.pointee = .noDataNow
                return nil
            }
            inputConsumed = true
            outStatus.pointee = .haveData
            return buffer
        }
        return error == nil ? output : nil
    }

    private func computeRMS(_ samples: [Float]) -> Float {
        guard !samples.isEmpty else { return 0 }
        let sumSquares = samples.reduce(Float(0)) { $0 + $1 * $1 }
        return sqrt(sumSquares / Float(samples.count))
    }
}

// MARK: - CMSampleBuffer extension

extension CMSampleBuffer {
    func asPCMBuffer() -> AVAudioPCMBuffer? {
        guard let formatDescription = CMSampleBufferGetFormatDescription(self) else { return nil }
        let audioStreamDesc = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription)
        guard var streamDesc = audioStreamDesc?.pointee else { return nil }
        guard let format = AVAudioFormat(streamDescription: &streamDesc) else { return nil }

        var blockBuffer: CMBlockBuffer?
        var bufferListSize: Int = 0

        CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            self, bufferListSizeNeededOut: &bufferListSize,
            bufferListOut: nil, bufferListSize: 0,
            blockBufferAllocator: nil, blockBufferMemoryAllocator: nil,
            flags: 0, blockBufferOut: nil
        )

        let rawBufferList = UnsafeMutableRawPointer.allocate(
            byteCount: bufferListSize,
            alignment: MemoryLayout<AudioBufferList>.alignment
        )
        defer { rawBufferList.deallocate() }
        let ptr = rawBufferList.assumingMemoryBound(to: AudioBufferList.self)

        CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            self, bufferListSizeNeededOut: nil,
            bufferListOut: ptr, bufferListSize: bufferListSize,
            blockBufferAllocator: nil, blockBufferMemoryAllocator: nil,
            flags: 0, blockBufferOut: &blockBuffer
        )

        let frameCount = AVAudioFrameCount(CMSampleBufferGetNumSamples(self))
        guard let pcmBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { return nil }
        pcmBuffer.frameLength = frameCount

        let srcBuffers = UnsafeMutableAudioBufferListPointer(ptr)
        let dstBuffers = UnsafeMutableAudioBufferListPointer(pcmBuffer.mutableAudioBufferList)
        guard srcBuffers.count == dstBuffers.count else { return nil }

        for i in 0..<srcBuffers.count {
            let src = srcBuffers[i]
            let dst = dstBuffers[i]
            guard let srcData = src.mData, let dstData = dst.mData else { continue }
            let byteCount = min(Int(src.mDataByteSize), Int(dst.mDataByteSize))
            memcpy(dstData, srcData, byteCount)
            dstBuffers[i].mDataByteSize = UInt32(byteCount)
        }
        return pcmBuffer
    }
}

enum AudioCaptureError: Error, LocalizedError {
    case noDisplay

    var errorDescription: String? { "No display found for audio capture" }
}
