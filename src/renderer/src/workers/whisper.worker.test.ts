import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitFor } from '@testing-library/react'

const { mockPipeline, mockEnv } = vi.hoisted(() => ({
  mockPipeline: vi.fn(),
  mockEnv: {
    cacheDir: '',
    allowRemoteModels: false,
    allowLocalModels: true,
    useBrowserCache: false,
    cacheKey: '',
    remoteHost: ''
  }
}))

vi.mock('@huggingface/transformers', () => ({
  pipeline: mockPipeline,
  env: mockEnv
}))

const posted: unknown[] = []
let onMessage: ((event: MessageEvent) => Promise<void> | void) | null = null

function emitOfType(type: string): unknown[] {
  return posted.filter((m) => (m as { type: string }).type === type)
}

async function send(data: unknown): Promise<void> {
  if (!onMessage) throw new Error('worker message handler was not registered')
  await onMessage({ data } as MessageEvent)
}

function mockLoadedTranscriber(
  result: {
    text: string
    chunks?: { timestamp: [number | null, number | null]; text: string }[]
  } = { text: 'hello world', chunks: [] }
): ReturnType<typeof vi.fn> {
  const transcriber = vi.fn().mockResolvedValue(result)
  mockPipeline.mockImplementation(
    async (
      _task: unknown,
      _model: unknown,
      opts?: { progress_callback?: (progress: Record<string, unknown>) => void }
    ) => {
      opts?.progress_callback?.({
        status: 'progress',
        file: 'model.onnx',
        loaded: 50,
        total: 100
      })
      return transcriber
    }
  )
  return transcriber
}

describe('whisper.worker', () => {
  beforeEach(async () => {
    posted.length = 0
    onMessage = null
    mockPipeline.mockReset()
    mockEnv.cacheDir = ''
    mockEnv.allowRemoteModels = false
    mockEnv.allowLocalModels = true
    mockEnv.useBrowserCache = false
    mockEnv.cacheKey = ''
    mockEnv.remoteHost = ''

    vi.spyOn(self, 'addEventListener').mockImplementation((type, handler) => {
      if (type === 'message') onMessage = handler as typeof onMessage
    })
    vi.spyOn(self, 'postMessage').mockImplementation((msg: unknown) => {
      posted.push(msg)
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})

    vi.resetModules()
    await import('./whisper.worker')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    if ('gpu' in navigator) {
      delete (navigator as { gpu?: unknown }).gpu
    }
  })

  it('configures the transformers env and emits model_ready on init', async () => {
    mockLoadedTranscriber()
    await send({
      type: 'init',
      modelId: 'onnx-community/whisper-tiny',
      modelCachePath: '/tmp/models'
    })

    expect(mockEnv.cacheDir).toBe('/tmp/models')
    expect(mockEnv.allowRemoteModels).toBe(true)
    expect(mockEnv.allowLocalModels).toBe(false)
    expect(mockEnv.useBrowserCache).toBe(true)
    expect(mockEnv.cacheKey).toBe('briefly-transformers-v2')
    expect(mockEnv.remoteHost).toBe('https://huggingface.co/')
    expect(mockPipeline).toHaveBeenCalledWith(
      'automatic-speech-recognition',
      'onnx-community/whisper-tiny',
      expect.objectContaining({ device: 'wasm' })
    )
    expect(posted).toContainEqual({
      type: 'model_loading',
      progress: 50,
      total: 100,
      file: 'model.onnx'
    })
    expect(posted).toContainEqual({ type: 'model_ready' })
  })

  it('appends a trailing slash to a custom HuggingFace mirror', async () => {
    mockLoadedTranscriber()
    await send({
      type: 'init',
      modelId: 'onnx-community/whisper-tiny',
      modelCachePath: '/tmp/models',
      hfEndpoint: 'https://hf-mirror.com'
    })
    expect(mockEnv.remoteHost).toBe('https://hf-mirror.com/')
  })

  it('selects webgpu when an adapter is available', async () => {
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: { requestAdapter: vi.fn().mockResolvedValue({}) }
    })
    mockLoadedTranscriber()
    await send({
      type: 'init',
      modelId: 'onnx-community/whisper-tiny',
      modelCachePath: '/tmp/models'
    })
    expect(mockPipeline).toHaveBeenCalledWith(
      'automatic-speech-recognition',
      'onnx-community/whisper-tiny',
      expect.objectContaining({
        device: 'webgpu',
        dtype: { encoder_model: 'fp16', decoder_model_merged: 'q4' }
      })
    )
  })

  it('rewrites HTML/JSON errors into a huggingface.co blocked message', async () => {
    mockPipeline.mockRejectedValueOnce(new Error('Unexpected token < in JSON: <!doctype html>'))
    await send({
      type: 'init',
      modelId: 'onnx-community/whisper-tiny',
      modelCachePath: '/tmp/models'
    })
    expect(emitOfType('error')[0]).toEqual({
      type: 'error',
      message: expect.stringMatching(/huggingface\.co appears to be blocked/i)
    })
  })

  it('rewrites HTML errors to mention the configured mirror', async () => {
    mockPipeline.mockRejectedValueOnce(new Error('not valid JSON'))
    await send({
      type: 'init',
      modelId: 'onnx-community/whisper-tiny',
      modelCachePath: '/tmp/models',
      hfEndpoint: 'https://hf-mirror.com'
    })
    expect(emitOfType('error')[0]).toEqual({
      type: 'error',
      message: expect.stringMatching(/mirror https:\/\/hf-mirror\.com returned an error page/i)
    })
  })

  it('rewrites fetch failures into a network hint', async () => {
    mockPipeline.mockRejectedValueOnce(new Error('Failed to fetch'))
    await send({
      type: 'init',
      modelId: 'onnx-community/whisper-tiny',
      modelCachePath: '/tmp/models'
    })
    expect(emitOfType('error')[0]).toEqual({
      type: 'error',
      message: expect.stringMatching(/cannot reach huggingface\.co/i)
    })
  })

  it('reuses a loaded model on a second init with the same id', async () => {
    mockLoadedTranscriber()
    const init = {
      type: 'init' as const,
      modelId: 'onnx-community/whisper-tiny',
      modelCachePath: '/tmp/models'
    }
    await send(init)
    mockPipeline.mockClear()
    posted.length = 0
    await send(init)
    expect(mockPipeline).not.toHaveBeenCalled()
    expect(emitOfType('model_ready')).toHaveLength(0)
  })

  it('transcribes PCM and emits chunks then done', async () => {
    const transcriber = mockLoadedTranscriber({
      text: ' Hello world ',
      chunks: [
        { timestamp: [0.5, 1.2], text: ' Hello ' },
        { timestamp: [null, null], text: ' world ' }
      ]
    })
    await send({
      type: 'init',
      modelId: 'onnx-community/whisper-tiny',
      modelCachePath: '/tmp/models'
    })
    posted.length = 0
    const pcm = new Float32Array([0, 0.1, 0.2])
    await send({
      type: 'transcribe',
      pcmData: pcm,
      modelId: 'onnx-community/whisper-tiny',
      language: 'english'
    })

    expect(transcriber).toHaveBeenCalledWith(
      pcm,
      expect.objectContaining({
        language: 'english',
        task: 'transcribe',
        return_timestamps: true
      })
    )
    expect(posted[0]).toEqual({ type: 'transcribing' })
    expect(posted).toContainEqual({ type: 'chunk', start: 0.5, end: 1.2, text: 'Hello' })
    expect(posted).toContainEqual({ type: 'chunk', start: 0, end: 0, text: 'world' })
    expect(posted.at(-1)).toEqual({
      type: 'done',
      text: 'Hello world',
      chunks: [
        { start: 0.5, end: 1.2, text: 'Hello' },
        { start: 0, end: 0, text: 'world' }
      ]
    })
  })

  it('skips done output when cancelled mid-transcription', async () => {
    let release!: (value: unknown) => void
    const transcriber = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve
        })
    )
    mockPipeline.mockResolvedValue(transcriber)

    await send({
      type: 'init',
      modelId: 'onnx-community/whisper-tiny',
      modelCachePath: '/tmp/models'
    })
    posted.length = 0

    const pending = send({
      type: 'transcribe',
      pcmData: new Float32Array([0]),
      modelId: 'onnx-community/whisper-tiny',
      language: null
    })
    await waitFor(() => expect(posted).toContainEqual({ type: 'transcribing' }))
    await send({ type: 'cancel' })
    release({ text: 'late result', chunks: [] })
    await pending

    expect(emitOfType('done')).toHaveLength(0)
    expect(emitOfType('chunk')).toHaveLength(0)
  })
})
