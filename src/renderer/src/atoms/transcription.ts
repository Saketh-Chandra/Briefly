import { atom } from 'jotai'
import type { TranscriptChunk } from '../../../main/lib/types'

// ---------------------------------------------------------------------------
// Audio decode helper — must run in renderer main thread (OfflineAudioContext
// is not available inside Web Workers)
// ---------------------------------------------------------------------------
async function decodeAudioToPcm(arrayBuffer: ArrayBuffer): Promise<Float32Array> {
  const audioCtx = new OfflineAudioContext(1, 1, 16000)
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)

  if (decoded.sampleRate === 16000 && decoded.numberOfChannels === 1) {
    return decoded.getChannelData(0)
  }

  const targetLength = Math.round(decoded.duration * 16000)
  const resampleCtx = new OfflineAudioContext(1, targetLength, 16000)
  const source = resampleCtx.createBufferSource()
  source.buffer = decoded
  source.connect(resampleCtx.destination)
  source.start()
  const resampled = await resampleCtx.startRendering()
  return resampled.getChannelData(0)
}

export type TranscriptionStage =
  | 'idle'
  | 'downloading-model'
  | 'transcribing'
  | 'processing-llm'
  | 'done'
  | 'error'

export interface TranscriptionState {
  meetingId: number | null
  stage: TranscriptionStage
  failedStage: TranscriptionStage | null
  progress: number // 0–100
  chunks: TranscriptChunk[]
  error: string | null
  llmStep: number // 0–3
  llmLabel: string
}

export const initialTranscriptionState: TranscriptionState = {
  meetingId: null,
  stage: 'idle',
  failedStage: null,
  progress: 0,
  chunks: [],
  error: null,
  llmStep: 0,
  llmLabel: ''
}

/** Module-level Worker ref — survives re-renders without living in React state */
let workerRef: Worker | null = null

/** Module-level IPC unsub handles — cleaned up on reset to avoid stale callbacks */
let unsubLlmRef: (() => void) | null = null
let unsubDoneRef: (() => void) | null = null

/** Base state atom for the transcription pipeline */
export const transcriptionAtom = atom<TranscriptionState>(initialTranscriptionState)

/** Derived atom — stage only, for granular subscriptions that avoid progress noise */
export const transcriptionStageAtom = atom((get) => get(transcriptionAtom).stage)

/** Derived atom — progress value only */
export const transcriptionProgressAtom = atom((get) => get(transcriptionAtom).progress)

/** Derived atom — LLM step index only */
export const transcriptionLlmStepAtom = atom((get) => get(transcriptionAtom).llmStep)

/** Start the full transcription + LLM pipeline for the given meetingId.
 *  Manages the Whisper Worker via the module-level workerRef so the Worker
 *  lifecycle is not tied to any specific component mount/unmount cycle. */
export const startPipelineAtom = atom(null, async (get, set, meetingId: number): Promise<void> => {
  // Terminate any previous worker and clean up stale callbacks before starting
  if (get(transcriptionAtom).stage !== 'idle') {
    unsubLlmRef?.()
    unsubLlmRef = null
    unsubDoneRef?.()
    unsubDoneRef = null
    workerRef?.terminate()
    workerRef = null
  }

  set(transcriptionAtom, { ...initialTranscriptionState, meetingId, stage: 'downloading-model' })

  const unsubLlm = window.api.onLlmProgress((event) => {
    if (event.meetingId === meetingId) {
      set(
        transcriptionAtom,
        (prev): TranscriptionState => ({
          ...prev,
          llmStep: event.step,
          llmLabel: event.label,
          progress: Math.round((event.step / 3) * 100)
        })
      )
    }
  })

  const unsubDone = window.api.onLlmDone((event) => {
    if (event.meetingId === meetingId) {
      set(
        transcriptionAtom,
        (prev): TranscriptionState => ({
          ...prev,
          stage: 'done',
          progress: 100
        })
      )
      unsubLlm()
      unsubDone()
      unsubLlmRef = null
      unsubDoneRef = null
    }
  })
  unsubLlmRef = unsubLlm
  unsubDoneRef = unsubDone

  try {
    const { modelCachePath } = await window.api.getPaths()
    const settings = await window.api.getSettings()

    // Pre-flight: ensure the model is cached before spinning up the worker.
    // transformers.js uses the browser Cache API (key: 'briefly-transformers-v2')
    // exclusively because allowLocalModels=false. If the model is absent and the
    // network/proxy is unavailable, the worker would only surface a cryptic
    // "Failed to fetch" — so we fail fast here with an actionable message.
    let modelCached = false
    if ('caches' in window) {
      try {
        const cache = await caches.open('briefly-transformers-v2')
        const keys = await cache.keys()
        modelCached = keys.some((req) => req.url.includes(settings.whisperModel))
      } catch {
        // Cache API unavailable — let the worker proceed and surface its own error
        modelCached = true
      }
    } else {
      modelCached = true // non-browser env, let worker handle it
    }

    if (!modelCached) {
      throw new Error(
        'Whisper model not downloaded. Open Settings → Whisper Model and click Download, then try again.'
      )
    }

    if (workerRef) workerRef.terminate()
    const worker = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), {
      type: 'module'
    })
    workerRef = worker

    // Initialise model — wait for model_ready before proceeding
    await new Promise<void>((resolve, reject) => {
      worker.onmessage = (e) => {
        const msg = e.data
        if (msg.type === 'model_loading') {
          set(
            transcriptionAtom,
            (prev): TranscriptionState => ({
              ...prev,
              progress: msg.progress ?? 0
            })
          )
        }
        if (msg.type === 'model_ready') {
          set(
            transcriptionAtom,
            (prev): TranscriptionState => ({
              ...prev,
              stage: 'transcribing',
              progress: 0
            })
          )
          resolve()
        }
        if (msg.type === 'error') reject(new Error(msg.message))
      }
      worker.onerror = (e) => reject(new Error(e.message))
      worker.postMessage({
        type: 'init',
        modelId: settings.whisperModel,
        modelCachePath,
        ...(settings.hfEndpoint ? { hfEndpoint: settings.hfEndpoint } : {})
      })
    })

    const { audioPath } = await window.api.startTranscription(meetingId)

    // Read audio in main process after the main process has validated the file.
    const audioData = await window.api.readAudio(audioPath)

    // Decode Opus → 16kHz mono Float32 PCM in the renderer main thread.
    // OfflineAudioContext is NOT available in Web Workers; it must run here.
    const pcmData = await decodeAudioToPcm(audioData)

    const chunks: TranscriptChunk[] = []
    const transcriptText = await new Promise<string>((resolve, reject) => {
      worker.onmessage = (e) => {
        const msg = e.data
        if (msg.type === 'chunk') {
          const chunk: TranscriptChunk = { text: msg.text, start: msg.start, end: msg.end }
          chunks.push(chunk)
          set(
            transcriptionAtom,
            (prev): TranscriptionState => ({
              ...prev,
              chunks: [...prev.chunks, chunk]
            })
          )
        }
        if (msg.type === 'done') resolve(msg.text)
        if (msg.type === 'error') reject(new Error(msg.message))
      }
      worker.onerror = (e) => reject(new Error(e.message))
      // Transfer Float32Array buffer zero-copy into the worker
      worker.postMessage(
        {
          type: 'transcribe',
          pcmData,
          modelId: settings.whisperModel,
          language: settings.whisperLanguage
        },
        [pcmData.buffer]
      )
    })

    await window.api.saveTranscript({
      meetingId,
      content: transcriptText,
      chunks,
      model: settings.whisperModel
    })

    set(
      transcriptionAtom,
      (prev): TranscriptionState => ({
        ...prev,
        stage: 'processing-llm',
        progress: 0
      })
    )

    await window.api.processTranscript(meetingId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    set(
      transcriptionAtom,
      (prev): TranscriptionState => ({
        ...prev,
        stage: 'error',
        failedStage: prev.stage,
        error: message
      })
    )
    unsubLlm()
    unsubDone()
  }
})

/** Terminate any active Worker, clean up IPC listeners, and reset state to idle. */
export const resetTranscriptionAtom = atom(null, (_get, set): void => {
  unsubLlmRef?.()
  unsubLlmRef = null
  unsubDoneRef?.()
  unsubDoneRef = null
  workerRef?.terminate()
  workerRef = null
  set(transcriptionAtom, initialTranscriptionState)
})
