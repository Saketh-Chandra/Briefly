import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createStore } from 'jotai'

const { mockInitWhisperWorker } = vi.hoisted(() => ({
  mockInitWhisperWorker: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../lib/whisper-worker', () => ({
  initWhisperWorker: mockInitWhisperWorker
}))

vi.mock('@/lib/api', () => ({
  api: {
    onLlmProgress: vi.fn(() => () => {}),
    onLlmDone: vi.fn(() => () => {}),
    getPaths: vi.fn(),
    getSettings: vi.fn(),
    startTranscription: vi.fn(),
    readAudio: vi.fn(),
    saveTranscript: vi.fn(),
    processTranscript: vi.fn()
  }
}))

import { api } from '@/lib/api'
import {
  transcriptionAtom,
  transcriptionStageAtom,
  transcriptionProgressAtom,
  transcriptionLlmStepAtom,
  startPipelineAtom,
  resetTranscriptionAtom,
  initialTranscriptionState
} from './transcription'

const SETTINGS = {
  whisperModel: 'onnx-community/whisper-large-v3-turbo',
  whisperLanguage: 'english',
  llm: { baseURL: '', model: 'gpt-4o', hasApiKey: false }
}

function stubCaches(urls: string[]): void {
  vi.stubGlobal('caches', {
    open: vi.fn().mockResolvedValue({
      keys: vi.fn().mockResolvedValue(urls.map((url) => ({ url })))
    })
  })
}

describe('transcription derived atoms', () => {
  it('exposes stage, progress, and llm step', () => {
    const store = createStore()
    store.set(transcriptionAtom, {
      ...initialTranscriptionState,
      stage: 'transcribing',
      progress: 40,
      llmStep: 2
    })
    expect(store.get(transcriptionStageAtom)).toBe('transcribing')
    expect(store.get(transcriptionProgressAtom)).toBe(40)
    expect(store.get(transcriptionLlmStepAtom)).toBe(2)
  })
})

describe('resetTranscriptionAtom', () => {
  it('returns state to the initial idle snapshot', () => {
    const store = createStore()
    store.set(transcriptionAtom, {
      ...initialTranscriptionState,
      meetingId: 9,
      stage: 'error',
      failedStage: 'transcribing',
      error: 'boom'
    })
    store.set(resetTranscriptionAtom)
    expect(store.get(transcriptionAtom)).toEqual(initialTranscriptionState)
  })
})

describe('startPipelineAtom — LLM events', () => {
  let llmProgressCb:
    | ((event: { meetingId: number; step: number; total: number; label: string }) => void)
    | undefined
  let llmDoneCb: ((event: { meetingId: number }) => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    llmProgressCb = undefined
    llmDoneCb = undefined
    vi.mocked(api.onLlmProgress).mockImplementation((cb) => {
      llmProgressCb = cb
      return vi.fn()
    })
    vi.mocked(api.onLlmDone).mockImplementation((cb) => {
      llmDoneCb = cb
      return vi.fn()
    })
    vi.mocked(api.getPaths).mockReturnValue(new Promise(() => {}))
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('applies LLM progress for the active meeting', async () => {
    const store = createStore()
    void store.set(startPipelineAtom, 11)
    await Promise.resolve()
    llmProgressCb?.({ meetingId: 11, step: 2, total: 3, label: 'Extracting to-dos' })
    expect(store.get(transcriptionAtom)).toMatchObject({
      meetingId: 11,
      llmStep: 2,
      llmLabel: 'Extracting to-dos',
      progress: Math.round((2 / 3) * 100)
    })
  })

  it('ignores LLM progress for a different meeting', async () => {
    const store = createStore()
    void store.set(startPipelineAtom, 11)
    await Promise.resolve()
    llmProgressCb?.({ meetingId: 99, step: 3, total: 3, label: 'other' })
    expect(store.get(transcriptionAtom).llmLabel).toBe('')
  })

  it('marks the pipeline done when onLlmDone fires for the active meeting', async () => {
    const store = createStore()
    void store.set(startPipelineAtom, 11)
    await Promise.resolve()
    llmDoneCb?.({ meetingId: 11 })
    expect(store.get(transcriptionAtom).stage).toBe('done')
    expect(store.get(transcriptionAtom).progress).toBe(100)
  })
})

describe('startPipelineAtom — model cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.onLlmProgress).mockReturnValue(() => {})
    vi.mocked(api.onLlmDone).mockReturnValue(() => {})
    vi.mocked(api.getPaths).mockResolvedValue({ userData: '/tmp', modelCachePath: '/tmp/models' })
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('errors when the Whisper model is not in the browser cache', async () => {
    stubCaches([])
    const store = createStore()
    await store.set(startPipelineAtom, 5)
    expect(store.get(transcriptionAtom).stage).toBe('error')
    expect(store.get(transcriptionAtom).failedStage).toBe('downloading-model')
    expect(store.get(transcriptionAtom).error).toMatch(/whisper model not downloaded/i)
  })
})

describe('startPipelineAtom — transcribe and process', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInitWhisperWorker.mockResolvedValue(undefined)
    vi.mocked(api.onLlmProgress).mockReturnValue(() => {})
    vi.mocked(api.onLlmDone).mockReturnValue(() => {})
    vi.mocked(api.getPaths).mockResolvedValue({ userData: '/tmp', modelCachePath: '/tmp/models' })
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS)
    vi.mocked(api.startTranscription).mockResolvedValue({ audioPath: '/tmp/a.webm' })
    vi.mocked(api.readAudio).mockResolvedValue(new ArrayBuffer(8))
    vi.mocked(api.saveTranscript).mockResolvedValue(undefined)
    vi.mocked(api.processTranscript).mockResolvedValue({
      title: 'Standup',
      summary: 'Notes',
      todos: [],
      journal: 'Journal'
    })
    stubCaches([`https://huggingface.co/${SETTINGS.whisperModel}/config.json`])

    class MockOfflineAudioContext {
      decodeAudioData = vi.fn().mockResolvedValue({
        sampleRate: 16000,
        numberOfChannels: 1,
        duration: 1,
        getChannelData: () => new Float32Array(16)
      })
    }
    vi.stubGlobal('OfflineAudioContext', MockOfflineAudioContext)

    class MockWorker {
      onmessage: ((e: MessageEvent) => void) | null = null
      onerror: ((e: ErrorEvent) => void) | null = null
      terminate = vi.fn()
      postMessage(): void {
        queueMicrotask(() => {
          this.onmessage?.({
            data: { type: 'chunk', text: 'hello', start: 0, end: 1 }
          } as MessageEvent)
          this.onmessage?.({ data: { type: 'done', text: 'hello' } } as MessageEvent)
        })
      }
    }
    vi.stubGlobal('Worker', MockWorker)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves the transcript and starts LLM processing after the worker finishes', async () => {
    const store = createStore()
    await store.set(startPipelineAtom, 8)
    expect(api.startTranscription).toHaveBeenCalledWith(8)
    expect(api.saveTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId: 8,
        content: 'hello',
        model: SETTINGS.whisperModel
      })
    )
    expect(api.processTranscript).toHaveBeenCalledWith(8)
    expect(store.get(transcriptionAtom).stage).toBe('processing-llm')
    expect(store.get(transcriptionAtom).chunks).toHaveLength(1)
  })
})
