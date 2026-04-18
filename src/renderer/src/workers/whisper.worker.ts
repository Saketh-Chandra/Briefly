import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

// ---------------------------------------------------------------------------
// Types — messages IN (renderer → worker)
// ---------------------------------------------------------------------------
type WorkerInMessage =
  | {
      type: 'init'
      modelId: string // model to preload
      modelCachePath: string // absolute path to userData/models/
      hfEndpoint?: string // optional HuggingFace mirror URL
    }
  | {
      type: 'transcribe'
      pcmData: Float32Array // decoded 16kHz mono PCM — AudioContext is renderer-only
      modelId: string // e.g. 'onnx-community/whisper-large-v3-turbo'
      language: string | null // null = auto-detect
    }
  | { type: 'cancel' }

// ---------------------------------------------------------------------------
// Types — messages OUT (worker → renderer)
// ---------------------------------------------------------------------------
export type WorkerOutMessage =
  | { type: 'ready' }
  | { type: 'model_loading'; progress: number; total: number; file: string }
  | { type: 'model_ready' }
  | { type: 'transcribing' }
  | { type: 'chunk'; text: string; start: number; end: number }
  | { type: 'done'; text: string; chunks: { start: number; end: number; text: string }[] }
  | { type: 'error'; message: string }

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let transcriber: AutomaticSpeechRecognitionPipeline | null = null
let currentModelId: string | null = null
let cancelled = false
let configuredHost: string | null = null // set by init; used in error messages

function emit(msg: WorkerOutMessage): void {
  self.postMessage(msg)
}

// ---------------------------------------------------------------------------
// WebGPU availability check
// ---------------------------------------------------------------------------
async function getDevice(): Promise<'webgpu' | 'wasm'> {
  try {
    const adapter = await (
      navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }
    ).gpu?.requestAdapter()
    return adapter ? 'webgpu' : 'wasm'
  } catch {
    return 'wasm'
  }
}

// ---------------------------------------------------------------------------
// Load / reuse the transcription pipeline
// ---------------------------------------------------------------------------
async function loadModel(modelId: string): Promise<void> {
  if (transcriber && currentModelId === modelId) return // already loaded

  transcriber = null
  currentModelId = null

  const device = await getDevice()
  console.log(`[whisper-worker] device: ${device}`)

  try {
    transcriber = await pipeline('automatic-speech-recognition', modelId, {
      device,
      dtype:
        device === 'webgpu'
          ? { encoder_model: 'fp16', decoder_model_merged: 'q4' }
          : { encoder_model: 'q8', decoder_model_merged: 'q8' },
      progress_callback: (progress: {
        status: string
        file?: string
        loaded?: number
        total?: number
      }) => {
        if (progress.status === 'initiate') {
          console.log('[whisper-worker] fetching:', progress.file)
        }
        if (
          (progress.status === 'downloading' || progress.status === 'loading') &&
          progress.total
        ) {
          const pct = Math.round(((progress.loaded ?? 0) / progress.total) * 100)
          emit({
            type: 'model_loading',
            progress: pct,
            total: progress.total,
            file: progress.file ?? ''
          })
        }
      }
    })
  } catch (err) {
    // Log the raw error in full before any transformation
    console.error('[whisper-worker] loadModel raw error:', err)
    console.error('[whisper-worker] env.remoteHost at time of error:', env.remoteHost)
    // Transformers.js receives an HTML error page instead of JSON when the
    // endpoint is blocked by a firewall or geo-restriction.
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('<!doctype') || msg.includes('not valid JSON') || msg.includes('<!DOCTYPE')) {
      const host = configuredHost ?? 'huggingface.co'
      throw new Error(
        configuredHost
          ? `The mirror ${host} returned an error page (HTML instead of model files). Check the URL is correct and reachable.`
          : 'huggingface.co appears to be blocked. Set a HuggingFace Mirror URL in Advanced settings (e.g. https://hf-mirror.com) and try again.'
      )
    }
    // Plain network failure — proxy down, no internet, DNS failure, etc.
    if (
      msg.toLowerCase().includes('failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('net::ERR_') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ETIMEDOUT')
    ) {
      const host = configuredHost ?? 'huggingface.co'
      throw new Error(
        configuredHost
          ? `Cannot reach mirror ${host} — your proxy may be down or the URL is wrong. Check Settings → Advanced and try downloading the model again.`
          : 'Cannot reach huggingface.co — check your network connection. If you use a proxy, set it in Settings → Proxy, or add a HuggingFace Mirror URL in Settings → Advanced.'
      )
    }
    throw err
  }

  currentModelId = modelId
  emit({ type: 'model_ready' })
}

// ---------------------------------------------------------------------------
// Run transcription
// ---------------------------------------------------------------------------
async function runTranscription(
  pcmData: Float32Array,
  _modelId: string,
  language: string | null
): Promise<void> {
  cancelled = false
  emit({ type: 'transcribing' })

  const pcm = pcmData
  if (cancelled) return

  if (!transcriber) throw new Error('Model not loaded')

  const chunks: { start: number; end: number; text: string }[] = []

  const result = (await transcriber(pcm, {
    language: language ?? undefined,
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
    // Stream chunks as they come
    callback_function: (beams: { output_token_ids: number[] }[]) => {
      // Called after each decoded chunk — not directly usable as streaming here,
      // but kept for future streaming support when Transformers.js exposes it.
      void beams
    }
  })) as {
    text: string
    chunks?: { timestamp: [number | null, number | null]; text: string }[]
  }

  if (cancelled) return

  // Emit individual chunks for the UI to display incrementally
  if (result.chunks) {
    for (const chunk of result.chunks) {
      const start = chunk.timestamp[0] ?? 0
      const end = chunk.timestamp[1] ?? 0
      const chunkData = { start, end, text: chunk.text.trim() }
      chunks.push(chunkData)
      emit({ type: 'chunk', ...chunkData })
    }
  }

  emit({ type: 'done', text: result.text.trim(), chunks })
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
self.addEventListener('message', async (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data

  try {
    switch (msg.type) {
      case 'init':
        // Configure Transformers.js cache and mirror, then preload the model
        env.cacheDir = msg.modelCachePath
        env.allowRemoteModels = true
        // allowLocalModels MUST be false in a web worker — the default localModelPath
        // ('/models/') resolves to a Vite dev-server URL that returns an HTML 404,
        // causing JSON.parse to fail before any remote fetch is ever attempted.
        // Filesystem caching is handled by useFSCache + cacheDir instead.
        env.allowLocalModels = false
        // Use browser Cache API to persist model files across sessions.
        // (Previously disabled to avoid stale HTML responses during CSP-blocked runs;
        // safe to re-enable now that the proxy is working correctly.)
        env.useBrowserCache = true
        env.cacheKey = 'briefly-transformers-v2'
        if (msg.hfEndpoint) {
          // env.remoteHost must have a trailing slash (matches the default 'https://huggingface.co/')
          const withSlash = msg.hfEndpoint.endsWith('/') ? msg.hfEndpoint : msg.hfEndpoint + '/'
          env.remoteHost = withSlash
          configuredHost = msg.hfEndpoint
        } else {
          env.remoteHost = 'https://huggingface.co/'
          configuredHost = null
        }

        // Install a fetch interceptor so every remote request is logged with
        // its actual URL, status, and content-type — and HTML responses are
        // surfaced immediately with a body preview before JSON.parse fails.
        {
          const underlying = self.fetch.bind(self)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(env as any).fetch = async (
            input: string | URL,
            init?: RequestInit
          ): Promise<Response> => {
            const urlStr = typeof input === 'string' ? input : (input as URL).href
            const isRemote = urlStr.startsWith('http')
            if (isRemote) console.log('[whisper-worker] fetch →', urlStr)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response = await underlying(input as any, init)
            if (isRemote) {
              const ct = response.headers.get('content-type') ?? ''
              console.log('[whisper-worker] fetch ←', response.status, ct)
              if (ct.includes('text/html')) {
                const preview = await response.clone().text()
                console.error(
                  '[whisper-worker] ← HTML body (first 500 chars):\n',
                  preview.slice(0, 500)
                )
              }
            }
            return response
          }
        }

        console.log('[whisper-worker] env after init:', {
          remoteHost: env.remoteHost,
          remotePathTemplate: env.remotePathTemplate,
          cacheDir: env.cacheDir,
          cacheKey: env.cacheKey,
          allowRemoteModels: env.allowRemoteModels,
          allowLocalModels: env.allowLocalModels,
          useFSCache: env.useFSCache,
          useBrowserCache: env.useBrowserCache
        })
        console.log(
          '[whisper-worker] first file URL will be:',
          `${env.remoteHost}${msg.modelId}/resolve/main/config.json`
        )
        // loadModel emits model_loading progress + model_ready when done
        await loadModel(msg.modelId)
        break

      case 'transcribe':
        await loadModel(msg.modelId)
        if (cancelled) return
        await runTranscription(msg.pcmData, msg.modelId, msg.language)
        break

      case 'cancel':
        cancelled = true
        break
    }
  } catch (err) {
    emit({
      type: 'error',
      message: err instanceof Error ? err.message : String(err)
    })
  }
})
