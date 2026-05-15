export interface WhisperWorkerInitOptions {
  hfEndpoint?: string
  onProgress: (progress: number) => void
}

/**
 * Initialise a Whisper Web Worker by sending an `init` message and waiting
 * for `model_ready`. Handles progress callbacks and errors uniformly.
 *
 * The caller is responsible for creating the Worker (so Vite can statically
 * analyse the `new URL(...)` literal and bundle it correctly).
 */
export function initWhisperWorker(
  worker: Worker,
  modelId: string,
  modelCachePath: string,
  options: WhisperWorkerInitOptions
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    worker.onmessage = (e) => {
      const msg = e.data as { type: string; progress?: number; message?: string }
      if (msg.type === 'model_loading') options.onProgress(msg.progress ?? 0)
      if (msg.type === 'model_ready') resolve()
      if (msg.type === 'error') reject(new Error(msg.message))
    }
    worker.onerror = (e) => reject(new Error(e.message))
    worker.postMessage({
      type: 'init',
      modelId,
      modelCachePath,
      ...(options.hfEndpoint ? { hfEndpoint: options.hfEndpoint } : {})
    })
  })
}
