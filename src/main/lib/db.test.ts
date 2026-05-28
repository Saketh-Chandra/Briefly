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

import {
  _setTestDbPath,
  _resetTestDb,
  insertMeeting,
  insertTranscript,
  getTranscript,
  resetMeetingForReprocessing,
  searchMeetings,
  getMeetingById
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
