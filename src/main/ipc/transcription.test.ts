import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Capture ipcMain.handle registrations before the module under test runs
const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
    on: vi.fn()
  },
  app: {
    getPath: vi.fn(() => '/tmp/briefly-test'),
    isPackaged: false
  }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true, development: true }
}))

// Hoist mock functions so they are available when vi.mock factory runs
const { mockExistsSync, mockStatSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(() => true),
  mockStatSync: vi.fn(() => ({ size: 1024 }))
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    existsSync: mockExistsSync,
    statSync: mockStatSync
  }
})

import { _setTestDbPath, _resetTestDb, insertMeeting, getMeetingById, updateMeetingStatus } from '../lib/db'
import { registerTranscriptionHandlers } from './transcription'

function seedMeeting(audioPath = '/tmp/real-audio.webm'): number {
  const id = insertMeeting({
    sessionId: `ipc-test-${Date.now()}-${Math.random()}`,
    audioPath,
    date: '2024-03-15T10:00:00.000Z'
  })
  // insertMeeting defaults to 'recording'; advance to 'recorded' so the handler accepts it
  updateMeetingStatus(id, 'recorded')
  return id
}

function makeNullSender(): null {
  return null
}

function makeMockSender(): { isDestroyed: () => boolean; send: ReturnType<typeof vi.fn> } {
  return { isDestroyed: vi.fn(() => false), send: vi.fn() }
}

describe('IPC transcription:start — retriable statuses', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    registerTranscriptionHandlers(makeNullSender)
  })

  afterEach(() => {
    _resetTestDb()
    vi.clearAllMocks()
  })

  const retriable = ['recorded', 'transcribed', 'done', 'error', 'transcribing', 'processing']

  for (const status of retriable) {
    it(`accepts a meeting in '${status}' status`, async () => {
      const meetingId = seedMeeting()
      // Force the meeting into the desired status via a direct DB update
      const { getDb } = await import('../lib/db')
      const { meetings } = await import('../lib/schema')
      const { eq, sql } = await import('drizzle-orm')
      getDb()
        .update(meetings)
        .set({ status: status as never, updated_at: sql`(datetime('now'))` })
        .where(eq(meetings.id, meetingId))
        .run()

      const handler = handlers.get('transcription:start')
      expect(handler).toBeDefined()
      const result = await handler!(null, meetingId)
      expect(result).toHaveProperty('audioPath')
    })
  }

  it('throws for an unrecognised status', async () => {
    const meetingId = seedMeeting()
    const { getDb } = await import('../lib/db')
    const { meetings } = await import('../lib/schema')
    const { eq, sql } = await import('drizzle-orm')
    getDb()
      .update(meetings)
      .set({ status: 'recording' as never, updated_at: sql`(datetime('now'))` })
      .where(eq(meetings.id, meetingId))
      .run()

    const handler = handlers.get('transcription:start')!
    await expect(handler(null, meetingId)).rejects.toThrow()
  })
})

describe('IPC transcription:start — status normalisation', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    registerTranscriptionHandlers(makeNullSender)
  })

  afterEach(() => {
    _resetTestDb()
    vi.clearAllMocks()
  })

  it('normalises a non-recorded retriable status to recorded then transcribing', async () => {
    const meetingId = seedMeeting()
    const { getDb } = await import('../lib/db')
    const { meetings } = await import('../lib/schema')
    const { eq, sql } = await import('drizzle-orm')
    getDb()
      .update(meetings)
      .set({ status: 'done' as never, updated_at: sql`(datetime('now'))` })
      .where(eq(meetings.id, meetingId))
      .run()

    const handler = handlers.get('transcription:start')!
    await handler(null, meetingId)

    // After the handler the meeting should be in 'transcribing' state
    const meeting = getMeetingById(meetingId)
    expect(meeting?.status).toBe('transcribing')
  })
})

describe('IPC transcription:start — emitted status events', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
  })

  afterEach(() => {
    _resetTestDb()
    vi.clearAllMocks()
  })

  it('emits transcribing status via sender.send', async () => {
    const sender = makeMockSender()
    registerTranscriptionHandlers(() => sender as never)
    const meetingId = seedMeeting()

    const handler = handlers.get('transcription:start')!
    await handler(null, meetingId)

    expect(sender.send).toHaveBeenCalledWith(
      'transcription:status',
      expect.objectContaining({ meetingId, status: 'transcribing' })
    )
  })
})

describe('IPC transcription:start — missing audio file', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
  })

  afterEach(() => {
    _resetTestDb()
    vi.clearAllMocks()
  })

  it('emits error status and throws when audio file is missing', async () => {
    // Make existsSync return false so the audio file appears missing
    mockExistsSync.mockReturnValue(false)

    const sender = makeMockSender()
    registerTranscriptionHandlers(() => sender as never)
    // Use a path that genuinely doesn't exist; real existsSync returns false
    const meetingId = seedMeeting('/tmp/briefly-test-nonexistent-audio-99999.webm')

    const handler = handlers.get('transcription:start')!
    await expect(handler(null, meetingId)).rejects.toThrow(/audio file not found/i)

    expect(sender.send).toHaveBeenCalledWith(
      'transcription:status',
      expect.objectContaining({ meetingId, status: 'error' })
    )
  })
})
