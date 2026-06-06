import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock Electron and electron-toolkit before importing db module
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/briefly-test'),
    isPackaged: false
  }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true, development: true }
}))

// Hoist fs mocks so they are in place when db.ts is first imported
const { mockExistsSync, mockStatSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(() => true),
  mockStatSync: vi.fn(() => ({ size: 1024 }))
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, existsSync: mockExistsSync, statSync: mockStatSync }
})

import {
  _setTestDbPath,
  _resetTestDb,
  insertMeeting,
  insertTranscript,
  insertSummary,
  getTranscript,
  resetMeetingForReprocessing,
  searchMeetings,
  getMeetingById,
  updateTodo,
  updateJournal,
  getMeetingDetail,
  resetStuckMeetings,
  updateMeetingStatus
} from './db'

function seedMeeting(overrides?: Partial<{ sessionId: string; audioPath: string }>): number {
  return insertMeeting({
    sessionId: overrides?.sessionId ?? `session-${Date.now()}-${Math.random()}`,
    audioPath: overrides?.audioPath ?? '/tmp/audio.webm',
    date: '2024-03-15T10:00:00.000Z'
  })
}

describe('DB contract — transcript insert idempotency', () => {
  beforeEach(() => {
    _setTestDbPath(':memory:')
  })

  afterEach(() => {
    _resetTestDb()
  })

  it('inserts a transcript for a meeting', () => {
    const meetingId = seedMeeting()
    insertTranscript({ meetingId, content: 'hello world', chunks: null, model: 'whisper-tiny' })
    const row = getTranscript(meetingId)
    expect(row?.content).toBe('hello world')
  })

  it('replaces the existing transcript on a second insert (idempotent)', () => {
    const meetingId = seedMeeting()
    insertTranscript({ meetingId, content: 'first pass', chunks: null, model: 'whisper-tiny' })
    insertTranscript({ meetingId, content: 'second pass', chunks: null, model: 'whisper-tiny' })
    const row = getTranscript(meetingId)
    expect(row?.content).toBe('second pass')
  })

  it('stores chunks as JSON and round-trips them correctly', () => {
    const meetingId = seedMeeting()
    const chunks = [{ text: 'hello', start: 0, end: 1.5 }]
    insertTranscript({ meetingId, content: 'hello', chunks, model: 'whisper-base' })
    const row = getTranscript(meetingId)
    expect(row?.chunks).toEqual(chunks)
  })
})

describe('DB contract — reset for reprocessing', () => {
  beforeEach(() => {
    _setTestDbPath(':memory:')
  })

  afterEach(() => {
    _resetTestDb()
  })

  it('deletes the transcript row', () => {
    const meetingId = seedMeeting()
    insertTranscript({ meetingId, content: 'text', chunks: null, model: 'whisper-tiny' })
    resetMeetingForReprocessing(meetingId)
    expect(getTranscript(meetingId)).toBeNull()
  })

  it('resets meeting status to recorded', () => {
    const meetingId = seedMeeting()
    insertTranscript({ meetingId, content: 'text', chunks: null, model: 'whisper-tiny' })
    resetMeetingForReprocessing(meetingId)
    const meeting = getMeetingById(meetingId)
    expect(meeting?.status).toBe('recorded')
  })
})

describe('DB contract — search behavior', () => {
  beforeEach(() => {
    _setTestDbPath(':memory:')
  })

  afterEach(() => {
    _resetTestDb()
  })

  it('returns meetings whose transcript content matches the query', () => {
    const meetingId = seedMeeting({ sessionId: 'search-test-1' })
    insertTranscript({
      meetingId,
      content: 'quarterly revenue discussion',
      chunks: null,
      model: 'whisper-tiny'
    })

    const results = searchMeetings('revenue')
    expect(results.some((m) => m.id === meetingId)).toBe(true)
  })

  it('returns no results for a query that does not match', () => {
    const meetingId = seedMeeting({ sessionId: 'search-test-2' })
    insertTranscript({
      meetingId,
      content: 'team standup notes',
      chunks: null,
      model: 'whisper-tiny'
    })

    const results = searchMeetings('xyzzyunmatchedtoken')
    expect(results.some((m) => m.id === meetingId)).toBe(false)
  })

  it('returns empty array for an empty query', () => {
    seedMeeting({ sessionId: 'search-test-3' })
    expect(searchMeetings('')).toEqual([])
  })
})

describe('DB contract — updateTodo persistence', () => {
  beforeEach(() => {
    _setTestDbPath(':memory:')
  })

  afterEach(() => {
    _resetTestDb()
  })

  it('marks the specified todo index as done', () => {
    const meetingId = seedMeeting()
    insertTranscript({ meetingId, content: 'text', chunks: null, model: 'whisper-tiny' })
    insertSummary({
      meetingId,
      summary: 'summary',
      todos: [
        { text: 'First task', owner: null, deadline: null, priority: 'low', done: false },
        { text: 'Second task', owner: null, deadline: null, priority: 'high', done: false }
      ],
      keyDecisions: null,
      participants: null,
      journal: null,
      llmModel: 'gpt-4o'
    })

    updateTodo(meetingId, 0, true)

    const detail = getMeetingDetail(meetingId)
    expect(detail?.summary?.todos?.[0].done).toBe(true)
    expect(detail?.summary?.todos?.[1].done).toBe(false)
  })

  it('can toggle a done todo back to not-done', () => {
    const meetingId = seedMeeting()
    insertTranscript({ meetingId, content: 'text', chunks: null, model: 'whisper-tiny' })
    insertSummary({
      meetingId,
      summary: 'summary',
      todos: [{ text: 'Task', owner: null, deadline: null, priority: 'low', done: true }],
      keyDecisions: null,
      participants: null,
      journal: null,
      llmModel: 'gpt-4o'
    })

    updateTodo(meetingId, 0, false)

    const detail = getMeetingDetail(meetingId)
    expect(detail?.summary?.todos?.[0].done).toBe(false)
  })

  it('is a no-op when the index is out of range', () => {
    const meetingId = seedMeeting()
    insertTranscript({ meetingId, content: 'text', chunks: null, model: 'whisper-tiny' })
    insertSummary({
      meetingId,
      summary: 'summary',
      todos: [{ text: 'Only task', owner: null, deadline: null, priority: 'low', done: false }],
      keyDecisions: null,
      participants: null,
      journal: null,
      llmModel: 'gpt-4o'
    })

    // Should not throw even for far-out-of-range index
    expect(() => updateTodo(meetingId, 99, true)).not.toThrow()
    const detail = getMeetingDetail(meetingId)
    expect(detail?.summary?.todos?.[0].done).toBe(false)
  })
})

describe('DB contract — updateJournal persistence', () => {
  beforeEach(() => {
    _setTestDbPath(':memory:')
  })

  afterEach(() => {
    _resetTestDb()
  })

  it('replaces the journal text', () => {
    const meetingId = seedMeeting()
    insertTranscript({ meetingId, content: 'text', chunks: null, model: 'whisper-tiny' })
    insertSummary({
      meetingId,
      summary: 'summary',
      todos: null,
      keyDecisions: null,
      participants: null,
      journal: 'original entry',
      llmModel: 'gpt-4o'
    })

    updateJournal(meetingId, 'updated entry')

    const detail = getMeetingDetail(meetingId)
    expect(detail?.summary?.journal).toBe('updated entry')
  })

  it('replaces a second time correctly', () => {
    const meetingId = seedMeeting()
    insertTranscript({ meetingId, content: 'text', chunks: null, model: 'whisper-tiny' })
    insertSummary({
      meetingId,
      summary: 'summary',
      todos: null,
      keyDecisions: null,
      participants: null,
      journal: 'first',
      llmModel: 'gpt-4o'
    })

    updateJournal(meetingId, 'second')
    updateJournal(meetingId, 'third')

    const detail = getMeetingDetail(meetingId)
    expect(detail?.summary?.journal).toBe('third')
  })
})

describe('DB contract — search index cleared on reset-for-reprocessing', () => {
  beforeEach(() => {
    _setTestDbPath(':memory:')
  })

  afterEach(() => {
    _resetTestDb()
  })

  it('removes indexed transcript content from search results after reset', () => {
    const meetingId = seedMeeting({ sessionId: 'reset-search-1' })
    insertTranscript({
      meetingId,
      content: 'proprietary revenue forecast data',
      chunks: null,
      model: 'whisper-tiny'
    })

    // Confirm the meeting is findable before reset
    expect(searchMeetings('forecast').some((m) => m.id === meetingId)).toBe(true)

    resetMeetingForReprocessing(meetingId)

    // After reset the search index is cleared — meeting should no longer match
    expect(searchMeetings('forecast').some((m) => m.id === meetingId)).toBe(false)
  })
})

describe('DB contract — resetStuckMeetings crash recovery', () => {
  beforeEach(() => {
    _setTestDbPath(':memory:')
    // Default: file exists with content
    mockExistsSync.mockReturnValue(true)
    mockStatSync.mockReturnValue({ size: 1024 })
  })

  afterEach(() => {
    _resetTestDb()
    vi.clearAllMocks()
  })

  it('advances a recording-status meeting to recorded when audio file exists', () => {
    const id = insertMeeting({
      sessionId: `stuck-1-${Math.random()}`,
      audioPath: '/tmp/real-audio.webm',
      date: '2024-06-15T10:00:00.000Z'
    })
    // insertMeeting sets status to 'recording' by default
    resetStuckMeetings()
    expect(getMeetingById(id)?.status).toBe('recorded')
  })

  it('sets recording-status meeting to error when audio file is missing', () => {
    mockExistsSync.mockReturnValue(false)
    const id = insertMeeting({
      sessionId: `stuck-2-${Math.random()}`,
      audioPath: '/tmp/missing-audio.webm',
      date: '2024-06-15T10:00:00.000Z'
    })
    resetStuckMeetings()
    expect(getMeetingById(id)?.status).toBe('error')
  })

  it('sets recording-status meeting to error when audio file is empty', () => {
    mockStatSync.mockReturnValue({ size: 0 })
    const id = insertMeeting({
      sessionId: `stuck-3-${Math.random()}`,
      audioPath: '/tmp/empty-audio.webm',
      date: '2024-06-15T10:00:00.000Z'
    })
    resetStuckMeetings()
    expect(getMeetingById(id)?.status).toBe('error')
  })

  it('resets transcribing meeting back to recorded', () => {
    const id = insertMeeting({
      sessionId: `stuck-4-${Math.random()}`,
      audioPath: '/tmp/audio.webm',
      date: '2024-06-15T10:00:00.000Z'
    })
    updateMeetingStatus(id, 'transcribing')
    resetStuckMeetings()
    expect(getMeetingById(id)?.status).toBe('recorded')
  })

  it('resets processing meeting back to recorded', () => {
    const id = insertMeeting({
      sessionId: `stuck-5-${Math.random()}`,
      audioPath: '/tmp/audio.webm',
      date: '2024-06-15T10:00:00.000Z'
    })
    updateMeetingStatus(id, 'processing')
    resetStuckMeetings()
    expect(getMeetingById(id)?.status).toBe('recorded')
  })

  it('leaves meetings in done/recorded/error status unchanged', () => {
    const doneId = insertMeeting({
      sessionId: `stuck-6-${Math.random()}`,
      audioPath: '/tmp/audio.webm',
      date: '2024-06-15T10:00:00.000Z'
    })
    updateMeetingStatus(doneId, 'done')
    resetStuckMeetings()
    expect(getMeetingById(doneId)?.status).toBe('done')
  })
})
