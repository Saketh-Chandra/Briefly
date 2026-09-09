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
  getSummary,
  updateMeetingStatus
} from '../lib/db'
import { notifySummaryReady, notifyError } from '../lib/notifications'
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

const SUMMARY_JSON = JSON.stringify({
  title: 'Standup',
  summary: 'We discussed the sprint.',
  key_decisions: ['Ship Friday'],
  participants_mentioned: ['Alex']
})
const TODOS_JSON = JSON.stringify({
  todos: [{ text: 'Follow up', owner: 'Alex', deadline: null, priority: 'high' }]
})
const JOURNAL_TEXT = 'Good meeting today.'

function stubSuccessfulLlmFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: SUMMARY_JSON } }] })
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: TODOS_JSON } }] })
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JOURNAL_TEXT } }] })
    })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('llm:process — OpenAI-compatible happy path', () => {
  const sender = { isDestroyed: vi.fn(() => false), send: vi.fn() }

  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    mockGetSettings.mockReturnValue(VALID_SETTINGS)
    mockGetApiKey.mockResolvedValue('sk-test')
    sender.send.mockClear()
    registerLlmHandlers(() => sender as never)
  })

  afterEach(() => {
    _resetTestDb()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('uses a Bearer token, emits progress, and persists the summary', async () => {
    const fetchMock = stubSuccessfulLlmFetch()
    const id = seedMeeting()
    insertTranscript({
      meetingId: id,
      content: 'brief transcript that fits in one pass',
      chunks: null,
      model: 'whisper-tiny'
    })

    const result = await invoke('llm:process', id)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer sk-test')
    expect(init.headers['api-key']).toBeUndefined()

    expect(result).toMatchObject({
      title: 'Standup',
      summary: 'We discussed the sprint.',
      journal: JOURNAL_TEXT
    })
    expect(getMeetingById(id)?.status).toBe('done')
    expect(getMeetingById(id)?.title).toBe('Standup')
    expect(getSummary(id)?.journal).toBe(JOURNAL_TEXT)
    expect(sender.send).toHaveBeenCalledWith(
      'llm:progress',
      expect.objectContaining({ meetingId: id, step: 1, total: 3 })
    )
    expect(sender.send).toHaveBeenCalledWith('llm:done', { meetingId: id })
    expect(notifySummaryReady).toHaveBeenCalledWith('Standup', id)
  })
})

describe('llm:process — Azure OpenAI', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    mockGetSettings.mockReturnValue({
      whisperModel: 'onnx-community/whisper-large-v3-turbo',
      whisperLanguage: 'english',
      llm: {
        baseURL: 'https://myresource.openai.azure.com/openai/deployments/gpt-4o',
        model: 'gpt-4o',
        apiVersion: '2025-01-01-preview'
      }
    })
    mockGetApiKey.mockResolvedValue('azure-key')
    registerLlmHandlers(() => makeMockSender() as never)
  })

  afterEach(() => {
    _resetTestDb()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('sends the api-key header and api-version query param', async () => {
    const fetchMock = stubSuccessfulLlmFetch()
    const id = seedMeeting()
    insertTranscript({
      meetingId: id,
      content: 'azure path transcript',
      chunks: null,
      model: 'whisper-tiny'
    })

    await invoke('llm:process', id)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://myresource.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview'
    )
    expect(init.headers['api-key']).toBe('azure-key')
    expect(init.headers.Authorization).toBeUndefined()
    expect(getMeetingById(id)?.status).toBe('done')
  })
})

describe('llm:process — retryable HTTP failures', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    mockGetSettings.mockReturnValue(VALID_SETTINGS)
    mockGetApiKey.mockResolvedValue('sk-test')
    registerLlmHandlers(() => makeMockSender() as never)
  })

  afterEach(() => {
    _resetTestDb()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('wraps a 429 as LLMClientError and marks the meeting as error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'rate limited'
      })
    )
    const id = seedMeeting()
    insertTranscript({
      meetingId: id,
      content: 'brief transcript that fits in one pass',
      chunks: null,
      model: 'whisper-tiny'
    })

    await expect(invoke('llm:process', id)).rejects.toThrow(/LLM error \(429\)/)
    expect(getMeetingById(id)?.status).toBe('error')
    expect(notifyError).toHaveBeenCalledWith('Summarisation', expect.stringMatching(/429/))
  })
})

describe('llm:process — partial progress then failure', () => {
  const sender = { isDestroyed: vi.fn(() => false), send: vi.fn() }

  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    mockGetSettings.mockReturnValue(VALID_SETTINGS)
    mockGetApiKey.mockResolvedValue('sk-test')
    sender.send.mockClear()
    registerLlmHandlers(() => sender as never)
  })

  afterEach(() => {
    _resetTestDb()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('emits summary progress then marks the meeting error when the to-dos call fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ choices: [{ message: { content: SUMMARY_JSON } }] })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
          text: async () => 'todos failed'
        })
    )

    const id = seedMeeting()
    insertTranscript({
      meetingId: id,
      content: 'brief transcript that fits in one pass',
      chunks: null,
      model: 'whisper-tiny'
    })

    await expect(invoke('llm:process', id)).rejects.toThrow(/LLM error \(502\)/)
    expect(sender.send).toHaveBeenCalledWith(
      'llm:progress',
      expect.objectContaining({ meetingId: id, step: 1, label: 'Summarizing…' })
    )
    expect(sender.send).toHaveBeenCalledWith(
      'llm:progress',
      expect.objectContaining({ meetingId: id, step: 2, label: 'Extracting to-dos…' })
    )
    expect(sender.send).not.toHaveBeenCalledWith('llm:done', expect.anything())
    expect(getMeetingById(id)?.status).toBe('error')
    expect(getSummary(id)).toBeNull()
    expect(notifyError).toHaveBeenCalledWith('Summarisation', expect.stringMatching(/502/))
  })
})

function stubLlmFetchBySchema(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as {
      response_format?: { json_schema?: { name?: string } }
    }
    const name = body.response_format?.json_schema?.name
    if (name === 'meeting_summary') {
      return { ok: true, json: async () => ({ choices: [{ message: { content: SUMMARY_JSON } }] }) }
    }
    if (name === 'meeting_todos') {
      return { ok: true, json: async () => ({ choices: [{ message: { content: TODOS_JSON } }] }) }
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content: JOURNAL_TEXT } }] }) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('llm:process — long transcript map-reduce', () => {
  const sender = { isDestroyed: vi.fn(() => false), send: vi.fn() }

  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    mockGetSettings.mockReturnValue(VALID_SETTINGS)
    mockGetApiKey.mockResolvedValue('sk-test')
    sender.send.mockClear()
    registerLlmHandlers(() => sender as never)
  })

  afterEach(() => {
    _resetTestDb()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('uses the chunked path, emits chunked progress, and persists the reduced summary', async () => {
    const fetchMock = stubLlmFetchBySchema()
    const id = seedMeeting()
    const long = 'x'.repeat(CHUNK_THRESHOLD_CHARS + 1)
    insertTranscript({ meetingId: id, content: long, chunks: null, model: 'whisper-tiny' })

    const result = await invoke('llm:process', id)

    expect(chunkText(long).length).toBeGreaterThan(1)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(3)
    expect(sender.send).toHaveBeenCalledWith(
      'llm:progress',
      expect.objectContaining({ meetingId: id, label: 'Summarizing (chunked)…' })
    )
    expect(result).toMatchObject({
      title: 'Standup',
      summary: 'We discussed the sprint.',
      journal: JOURNAL_TEXT
    })
    expect(getMeetingById(id)?.status).toBe('done')
    expect(getSummary(id)?.journal).toBe(JOURNAL_TEXT)
    expect(sender.send).toHaveBeenCalledWith('llm:done', { meetingId: id })
  })

  it('marks the meeting error when a reduce-step fetch fails after the map phase', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body) as {
          response_format?: { json_schema?: { name?: string } }
        }
        const name = body.response_format?.json_schema?.name
        if (name === 'meeting_summary') {
          return {
            ok: true,
            json: async () => ({ choices: [{ message: { content: SUMMARY_JSON } }] })
          }
        }
        if (name === 'meeting_todos') {
          return {
            ok: true,
            json: async () => ({ choices: [{ message: { content: TODOS_JSON } }] })
          }
        }
        return {
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
          text: async () => 'journal failed'
        }
      })
    )

    const id = seedMeeting()
    insertTranscript({
      meetingId: id,
      content: 'x'.repeat(CHUNK_THRESHOLD_CHARS + 1),
      chunks: null,
      model: 'whisper-tiny'
    })

    await expect(invoke('llm:process', id)).rejects.toThrow()
    expect(getMeetingById(id)?.status).toBe('error')
  })
})

describe('llm:test-connection', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    mockGetSettings.mockReturnValue(VALID_SETTINGS)
    mockGetApiKey.mockResolvedValue('sk-test')
    registerLlmHandlers(() => makeMockSender() as never)
  })

  afterEach(() => {
    _resetTestDb()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('throws when no API key is set', async () => {
    mockGetApiKey.mockResolvedValueOnce(null)
    await expect(invoke('llm:test-connection')).rejects.toThrow(/api key not set/i)
  })

  it('throws when the base URL is empty', async () => {
    mockGetSettings.mockReturnValue(EMPTY_BASEURL_SETTINGS)
    await expect(invoke('llm:test-connection')).rejects.toThrow(/base url not configured/i)
  })

  it('returns ok after a successful chat completion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] })
      })
    )
    await expect(invoke('llm:test-connection')).resolves.toEqual({ ok: true })
  })
})
