import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CaptureSession, CAPTURE_EVENT_CHANNEL } from './capture-session'

vi.mock('@/lib/api', () => ({
  api: {
    writeAudioChunk: vi.fn().mockResolvedValue(undefined),
    finalizeRecording: vi.fn().mockResolvedValue(undefined),
    takeScreenshot: vi.fn()
  }
}))

import { api } from '@/lib/api'

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = []
  readonly name: string
  posted: unknown[] = []
  closed = false

  constructor(name: string) {
    this.name = name
    MockBroadcastChannel.instances.push(this)
  }

  postMessage(data: unknown): void {
    this.posted.push(data)
  }

  close(): void {
    this.closed = true
  }
}

function audioTrack(): { stop: ReturnType<typeof vi.fn> } {
  return { stop: vi.fn() }
}

function makeStream(tracks = [audioTrack()]): MediaStream {
  return {
    getAudioTracks: () => tracks,
    getTracks: () => tracks
  } as unknown as MediaStream
}

class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true)
  static last: MockMediaRecorder | null = null
  ondataavailable: ((e: BlobEvent) => void) | null = null
  onstop: (() => void) | null = null
  onerror: ((e: Event) => void) | null = null
  start = vi.fn()
  stop = vi.fn(() => {
    void this.onstop?.()
  })

  constructor(
    public stream: MediaStream,
    public options: { mimeType?: string }
  ) {
    MockMediaRecorder.last = this
  }
}

class MockAudioContext {
  createMediaStreamDestination = vi.fn(() => ({ stream: makeStream() }))
  createAnalyser = vi.fn(() => ({
    fftSize: 1024,
    getFloatTimeDomainData: (buf: Float32Array) => buf.fill(0)
  }))
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }))
  close = vi.fn().mockResolvedValue(undefined)
}

describe('CaptureSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockBroadcastChannel.instances = []
    MockMediaRecorder.last = null
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
    vi.stubGlobal('MediaRecorder', MockMediaRecorder)
    vi.stubGlobal('AudioContext', MockAudioContext)
    vi.stubGlobal(
      'MediaStream',
      class {
        constructor(public tracks: unknown[] = []) {}
      }
    )
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getDisplayMedia: vi.fn().mockResolvedValue(makeStream()),
        getUserMedia: vi.fn().mockResolvedValue(makeStream())
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts MediaRecorder and emits recording status', async () => {
    const session = new CaptureSession('sess-1', { mixMic: false })
    await session.start()
    expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalled()
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
    expect(MockMediaRecorder.last?.start).toHaveBeenCalledWith(1000)
    const bus = MockBroadcastChannel.instances[0]
    expect(bus.name).toBe(CAPTURE_EVENT_CHANNEL)
    expect(bus.posted).toContainEqual({ type: 'status', state: 'recording' })
    session.stop()
  })

  it('mixes microphone audio when mixMic is true', async () => {
    const session = new CaptureSession('sess-1', { mixMic: true })
    await session.start()
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false })
    session.stop()
  })

  it('writes audio chunks through the renderer adapter seam', async () => {
    const session = new CaptureSession('sess-1', { mixMic: false })
    await session.start()
    const blob = new Blob([new Uint8Array([1, 2, 3])])
    await MockMediaRecorder.last?.ondataavailable?.({ data: blob } as BlobEvent)
    expect(api.writeAudioChunk).toHaveBeenCalledWith('sess-1', expect.any(ArrayBuffer))
    session.stop()
  })

  it('finalizes the recording when MediaRecorder stops', async () => {
    const session = new CaptureSession('sess-1', { mixMic: false })
    await session.start()
    session.stop()
    await Promise.resolve()
    expect(api.finalizeRecording).toHaveBeenCalledWith('sess-1', expect.any(Number))
    const bus = MockBroadcastChannel.instances[0]
    expect(bus.posted).toContainEqual({ type: 'status', state: 'stopping' })
    expect(bus.posted.some((e) => (e as { type: string }).type === 'stopped')).toBe(true)
    expect(bus.closed).toBe(true)
  })

  it('emits screenshot_done when takeScreenshot returns a path', async () => {
    vi.mocked(api.takeScreenshot).mockResolvedValue('/tmp/shot.png')
    const session = new CaptureSession('sess-1', { mixMic: false })
    await session.takeScreenshot()
    expect(MockBroadcastChannel.instances[0].posted).toContainEqual({
      type: 'screenshot_done',
      path: '/tmp/shot.png'
    })
  })

  it('does not emit screenshot_done when takeScreenshot returns null', async () => {
    vi.mocked(api.takeScreenshot).mockResolvedValue(null)
    const session = new CaptureSession('sess-1', { mixMic: false })
    await session.takeScreenshot()
    expect(MockBroadcastChannel.instances[0].posted).toEqual([])
  })

  it('emits error and rethrows when getDisplayMedia fails', async () => {
    vi.mocked(navigator.mediaDevices.getDisplayMedia).mockRejectedValue(new Error('denied'))
    const session = new CaptureSession('sess-1', { mixMic: false })
    await expect(session.start()).rejects.toThrow('denied')
    expect(MockBroadcastChannel.instances[0].posted).toContainEqual({
      type: 'error',
      message: 'denied'
    })
    expect(MockBroadcastChannel.instances[0].closed).toBe(true)
  })

  it('continues without mic when getUserMedia fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new Error('mic denied'))
    const session = new CaptureSession('sess-1', { mixMic: true })
    await session.start()
    expect(MockMediaRecorder.last?.start).toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
    session.stop()
  })
})
