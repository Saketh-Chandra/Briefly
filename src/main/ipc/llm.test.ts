import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Capture ipcMain registrations before importing the module under test
// ---------------------------------------------------------------------------
const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
    on: vi.fn()
  },
  app: {
    getPath: vi.fn(() => '/tmp/briefly-llm-test'),
    isPackaged: false
  }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true, development: true }
}))

// Stub keychain — default returns a valid key; override per-test for error paths
const { mockGetApiKey } = vi.hoisted(() => ({
  mockGetApiKey: vi.fn<() => Promise<string | null>>().mockResolvedValue('test-api-key')
}))
vi.mock('../lib/keychain', () => ({ getApiKey: mockGetApiKey }))

// Stub settings — default returns empty baseURL (the real production default)
const { mockGetSettings } = vi.hoisted(() => ({
  mockGetSettings: vi.fn()
}))
vi.mock('../lib/settings', () => ({ getSettings: mockGetSettings }))

// Stub notifications so tests do not open Electron windows
vi.mock('../lib/notifications', () => ({
  notifySummaryReady: vi.fn(),
  notifyError: vi.fn()
}))

import {
  _setTestDbPath,
  _resetTestDb,
  insertMeeting,
  getMeetingById,
  insertTranscript,
  updateMeetingStatus
} from '../lib/db'
import {
  registerLlmHandlers,
  chunkText,
  CHUNK_SIZE_CHARS,
  CHUNK_OVERLAP_CHARS,
  CHUNK_THRESHOLD_CHARS
} from './llm'

const VALID_SETTINGS = {
  whisperModel: 'onnx-community/whisper-large-v3-turbo',
  whisperLanguage: 'english',
  llm: { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' }
}

const EMPTY_BASEURL_SETTINGS = {
  whisperModel: 'onnx-community/whisper-large-v3-turbo',
  whisperLanguage: 'english',
  llm: { baseURL: '', model: 'gpt-4o' }
}

function seedMeeting(): number {
  const id = insertMeeting({
    sessionId: `llm-test-${Date.now()}-${Math.random()}`,
    audioPath: '/tmp/audio.webm',
    date: '2024-06-15T10:00:00.000Z'
  })
  updateMeetingStatus(id, 'transcribed')
  return id
}

function makeMockSender(): { isDestroyed: () => boolean; send: ReturnType<typeof vi.fn> } {
  return { isDestroyed: vi.fn(() => false), send: vi.fn() }
}

function invoke(channel: string, ...args: unknown[]): unknown {
  const h = handlers.get(channel)
  if (!h) throw new Error(`No handler registered for channel: ${channel}`)
  return h(null, ...args)
}

// ---------------------------------------------------------------------------
// chunkText — pure unit tests
// ---------------------------------------------------------------------------

describe('chunkText — short transcript stays as single chunk', () => {
  it('returns a single-element array for text at or below the threshold', () => {
    const short = 'a'.repeat(CHUNK_THRESHOLD_CHARS)
    const result = chunkText(short)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(short)
  })

  it('returns a single-element array for an empty string', () => {
    expect(chunkText('')).toEqual([''])
  })

  it('returns a single-element array for text exactly one character below the threshold', () => {
    const text = 'x'.repeat(CHUNK_THRESHOLD_CHARS - 1)
    expect(chunkText(text)).toHaveLength(1)
  })
})

describe('chunkText — long transcript is split into overlapping chunks', () => {
  it('produces more than one chunk for text exceeding the threshold', () => {
    const long = 'a'.repeat(CHUNK_SIZE_CHARS * 2 + 1)
    const chunks = chunkText(long)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('each chunk is at most CHUNK_SIZE_CHARS characters', () => {
    const long = 'b'.repeat(CHUNK_SIZE_CHARS * 4)
    for (const chunk of chunkText(long)) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE_CHARS)
    }
  })

  it('covers the full text without losing content at chunk boundaries', () => {
    const body = 'hello '.repeat(Math.ceil((CHUNK_SIZE_CHARS * 2.5) / 6)) // > 2 chunks
    const chunks = chunkText(body)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    // First chunk starts at position 0
    expect(chunks[0]).toBe(body.slice(0, CHUNK_SIZE_CHARS))
    // Second chunk starts at CHUNK_SIZE - CHUNK_OVERLAP
    expect(chunks[1]).toBe(
      body.slice(CHUNK_SIZE_CHARS - CHUNK_OVERLAP_CHARS, CHUNK_SIZE_CHARS * 2 - CHUNK_OVERLAP_CHARS)
    )
  })

  it('last chunk ends exactly at the text boundary (no padding)', () => {
    const long = 'z'.repeat(CHUNK_SIZE_CHARS + 1000)
    const chunks = chunkText(long)
    const last = chunks[chunks.length - 1]
    expect(last).toBe(long.slice(long.length - last.length))
  })
})

// ---------------------------------------------------------------------------
// llm:process — error paths
// ---------------------------------------------------------------------------

describe('llm:process — missing API key', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    mockGetSettings.mockReturnValue(VALID_SETTINGS)
    registerLlmHandlers(() => makeMockSender() as never)
  })

  afterEach(() => {
    _resetTestDb()
    vi.clearAllMocks()
  })

  it('throws and sets meeting status to error when no API key is configured', async () => {
    mockGetApiKey.mockResolvedValueOnce(null)
    const id = seedMeeting()
    insertTranscript({ meetingId: id, content: 'hello world', chunks: null, model: 'whisper-tiny' })

    await expect(invoke('llm:process', id)).rejects.toThrow(/api key/i)
    expect(getMeetingById(id)?.status).toBe('error')
  })
})

describe('llm:process — empty base URL', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    mockGetSettings.mockReturnValue(EMPTY_BASEURL_SETTINGS)
    registerLlmHandlers(() => makeMockSender() as never)
  })

  afterEach(() => {
    _resetTestDb()
    vi.clearAllMocks()
  })

  it('throws and sets meeting status to error when LLM base URL is not configured', async () => {
    const id = seedMeeting()
    insertTranscript({ meetingId: id, content: 'hello world', chunks: null, model: 'whisper-tiny' })

    await expect(invoke('llm:process', id)).rejects.toThrow(/base url not configured/i)
    expect(getMeetingById(id)?.status).toBe('error')
  })
})

describe('llm:process — missing transcript', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    mockGetSettings.mockReturnValue(VALID_SETTINGS)
    registerLlmHandlers(() => makeMockSender() as never)
  })

  afterEach(() => {
    _resetTestDb()
    vi.clearAllMocks()
  })

  it('throws and sets meeting status to error when no transcript exists for the meeting', async () => {
    const id = seedMeeting()
    // Deliberately no transcript inserted

    await expect(invoke('llm:process', id)).rejects.toThrow(/no transcript found/i)
    expect(getMeetingById(id)?.status).toBe('error')
  })
})

describe('llm:process — LLM network failure', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    mockGetSettings.mockReturnValue(VALID_SETTINGS)
    registerLlmHandlers(() => makeMockSender() as never)
  })

  afterEach(() => {
    _resetTestDb()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('sets meeting status to error and throws when the LLM fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'upstream failure'
      })
    )

    const id = seedMeeting()
    insertTranscript({
      meetingId: id,
      content: 'brief transcript that fits in one pass',
      chunks: null,
      model: 'whisper-tiny'
    })

    await expect(invoke('llm:process', id)).rejects.toThrow()
    expect(getMeetingById(id)?.status).toBe('error')
  })
})
