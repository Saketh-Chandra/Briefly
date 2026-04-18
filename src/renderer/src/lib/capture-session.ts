/**
 * CaptureSession — renderer-side recording session using desktopCapturer.
 *
 * Flow:
 *   1. Main stores pendingSourceId (set during capture:start IPC)
 *   2. Renderer creates CaptureSession and calls start()
 *   3. getDisplayMedia() triggers setDisplayMediaRequestHandler in main, which
 *      picks the correct source and grants loopback audio
 *   4. Web Audio mixes system audio + optional mic
 *   5. MediaRecorder streams 1-second WebM/Opus chunks to main via IPC
 *   6. On stop, finalizeRecording IPC updates the DB
 *   7. Events are broadcast via BroadcastChannel so all subscribers
 *      (RecordingContext, Dashboard, Recordings, Transcript) receive them
 *      without any extra wiring.
 */

import type { CaptureEvent } from '../../../main/lib/types'

export type { CaptureEvent }

/** Channel name shared between CaptureSession (sender) and preload onCaptureEvent (receiver). */
export const CAPTURE_EVENT_CHANNEL = 'briefly-capture-events'

export interface CaptureSessionOpts {
  mixMic: boolean
}

export class CaptureSession {
  private mediaRecorder: MediaRecorder | null = null
  private displayStream: MediaStream | null = null
  private micStream: MediaStream | null = null
  private audioCtx: AudioContext | null = null
  private levelInterval: ReturnType<typeof setInterval> | null = null
  private startTime = 0
  private eventBus: BroadcastChannel

  constructor(
    private readonly sessionId: string,
    private readonly opts: CaptureSessionOpts
  ) {
    this.eventBus = new BroadcastChannel(CAPTURE_EVENT_CHANNEL)
  }

  /** Acquire media, start recording. Throws if permissions are denied. */
  async start(): Promise<void> {
    try {
      // System audio + low-framerate video track (video track required to get loopback audio)
      this.displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: { frameRate: 1 } as MediaTrackConstraints
      })

      // Microphone — non-fatal if unavailable
      if (this.opts.mixMic) {
        try {
          this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        } catch {
          console.warn('[CaptureSession] Mic unavailable — recording system audio only')
        }
      }

      // Web Audio mixing
      this.audioCtx = new AudioContext()
      const dest = this.audioCtx.createMediaStreamDestination()
      const analyser = this.audioCtx.createAnalyser()
      analyser.fftSize = 1024

      const systemAudioTracks = this.displayStream.getAudioTracks()
      if (systemAudioTracks.length > 0) {
        const sysSource = this.audioCtx.createMediaStreamSource(new MediaStream(systemAudioTracks))
        sysSource.connect(analyser)
        sysSource.connect(dest)
      }

      if (this.micStream) {
        const micSource = this.audioCtx.createMediaStreamSource(this.micStream)
        micSource.connect(analyser)
        micSource.connect(dest)
      }

      // RMS level metering via AnalyserNode
      const pcmBuf = new Float32Array(analyser.fftSize)
      this.levelInterval = setInterval(() => {
        analyser.getFloatTimeDomainData(pcmBuf)
        let sum = 0
        for (let i = 0; i < pcmBuf.length; i++) sum += pcmBuf[i] * pcmBuf[i]
        const rms = Math.sqrt(sum / pcmBuf.length)
        this.emit({ type: 'level', rms })
      }, 50)

      // MediaRecorder — prefer opus inside webm
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=opus')
        ? 'video/webm;codecs=opus'
        : 'video/webm'

      this.mediaRecorder = new MediaRecorder(dest.stream, { mimeType })

      this.mediaRecorder.ondataavailable = async (e: BlobEvent) => {
        if (e.data.size > 0) {
          const buffer = await e.data.arrayBuffer()
          await window.api.writeAudioChunk(this.sessionId, buffer)
        }
      }

      this.mediaRecorder.onstop = async () => {
        this.clearLevel()
        const duration_s = Math.round((Date.now() - this.startTime) / 1000)
        await window.api.finalizeRecording(this.sessionId, duration_s)
        this.emit({ type: 'stopped', duration_s, path: '' })
        this.dispose()
      }

      this.mediaRecorder.onerror = (e: Event) => {
        const msg = (e as ErrorEvent).message ?? 'MediaRecorder error'
        this.emit({ type: 'error', message: msg })
      }

      this.startTime = Date.now()
      this.mediaRecorder.start(1000) // 1-second timeslice
      this.emit({ type: 'status', state: 'recording' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.emit({ type: 'error', message })
      this.dispose()
      throw err
    }
  }

  /** Signal MediaRecorder to stop; DB finalization happens in onstop callback. */
  stop(): void {
    this.emit({ type: 'status', state: 'stopping' })
    this.clearLevel()
    this.mediaRecorder?.stop()
  }

  /** Capture a screenshot via main process (desktopCapturer high-res thumbnail). */
  async takeScreenshot(): Promise<void> {
    const path = await window.api.takeScreenshot()
    if (path) {
      this.emit({ type: 'screenshot_done', path })
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private emit(event: CaptureEvent): void {
    this.eventBus.postMessage(event)
  }

  private clearLevel(): void {
    if (this.levelInterval !== null) {
      clearInterval(this.levelInterval)
      this.levelInterval = null
    }
  }

  /** Release all resources. Called automatically after onstop. */
  private dispose(): void {
    this.clearLevel()
    this.eventBus.close()
    this.displayStream?.getTracks().forEach((t) => t.stop())
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.audioCtx?.close().catch(() => {})
    this.mediaRecorder = null
    this.displayStream = null
    this.micStream = null
    this.audioCtx = null
  }
}
