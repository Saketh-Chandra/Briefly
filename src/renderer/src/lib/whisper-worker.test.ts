import { describe, it, expect, vi } from 'vitest'
import { initWhisperWorker } from './whisper-worker'

function makeWorker(): {
  onmessage: ((e: MessageEvent) => void) | null
  onerror: ((e: ErrorEvent) => void) | null
  postMessage: ReturnType<typeof vi.fn>
} {
  return {
    onmessage: null,
    onerror: null,
    postMessage: vi.fn()
  }
}

describe('initWhisperWorker', () => {
  it('posts an init message and resolves on model_ready', async () => {
    const worker = makeWorker()
    const onProgress = vi.fn()
    const pending = initWhisperWorker(worker as unknown as Worker, 'model-id', '/cache', {
      onProgress
    })
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'init',
      modelId: 'model-id',
      modelCachePath: '/cache'
    })
    worker.onmessage?.({ data: { type: 'model_ready' } } as MessageEvent)
    await expect(pending).resolves.toBeUndefined()
    expect(onProgress).not.toHaveBeenCalled()
  })

  it('forwards model_loading progress', async () => {
    const worker = makeWorker()
    const onProgress = vi.fn()
    const pending = initWhisperWorker(worker as unknown as Worker, 'model-id', '/cache', {
      onProgress
    })
    worker.onmessage?.({ data: { type: 'model_loading', progress: 42 } } as MessageEvent)
    worker.onmessage?.({ data: { type: 'model_ready' } } as MessageEvent)
    await pending
    expect(onProgress).toHaveBeenCalledWith(42)
  })

  it('includes hfEndpoint in the init payload when provided', async () => {
    const worker = makeWorker()
    const pending = initWhisperWorker(worker as unknown as Worker, 'model-id', '/cache', {
      hfEndpoint: 'https://hf-mirror.com',
      onProgress: vi.fn()
    })
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'init',
      modelId: 'model-id',
      modelCachePath: '/cache',
      hfEndpoint: 'https://hf-mirror.com'
    })
    worker.onmessage?.({ data: { type: 'model_ready' } } as MessageEvent)
    await pending
  })

  it('rejects when the worker reports an error message', async () => {
    const worker = makeWorker()
    const pending = initWhisperWorker(worker as unknown as Worker, 'model-id', '/cache', {
      onProgress: vi.fn()
    })
    worker.onmessage?.({ data: { type: 'error', message: 'download failed' } } as MessageEvent)
    await expect(pending).rejects.toThrow('download failed')
  })

  it('rejects on worker.onerror', async () => {
    const worker = makeWorker()
    const pending = initWhisperWorker(worker as unknown as Worker, 'model-id', '/cache', {
      onProgress: vi.fn()
    })
    worker.onerror?.({ message: 'script error' } as ErrorEvent)
    await expect(pending).rejects.toThrow('script error')
  })
})
