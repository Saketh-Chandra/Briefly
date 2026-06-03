import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Capture ipcMain.handle registrations before importing the module under test
const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
    on: vi.fn()
  },
  app: {
    getPath: vi.fn(() => '/tmp/briefly-storage-test'),
    isPackaged: false
  },
  shell: {
    openPath: vi.fn().mockResolvedValue('')
  },
  clipboard: {
    writeImage: vi.fn()
  },
  nativeImage: {
    createFromDataURL: vi.fn(() => ({}))
  }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true, development: true }
}))

// Keep existsSync returning false so the delete handler never touches the fs
const { mockExistsSync } = vi.hoisted(() => ({ mockExistsSync: vi.fn(() => false) }))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, existsSync: mockExistsSync }
})

import {
  _setTestDbPath,
  _resetTestDb,
  insertMeeting,
  updateMeetingStatus,
  insertTranscript,
  insertSummary,
  getMeetingById,
  getDb
} from '../lib/db'
import { meetings } from '../lib/schema'
import { eq, sql } from 'drizzle-orm'
import { registerStorageHandlers } from './storage'

function seedMeeting(overrides: { title?: string; date?: string; status?: string } = {}): number {
  const id = insertMeeting({
    sessionId: `storage-test-${Date.now()}-${Math.random()}`,
    audioPath: '/tmp/audio.webm',
    date: overrides.date ?? '2024-06-15T10:00:00.000Z'
  })
  updateMeetingStatus(id, (overrides.status as never) ?? 'recorded')
  if (overrides.title) {
    getDb()
      .update(meetings)
      .set({ title: overrides.title, updated_at: sql`(datetime('now'))` })
      .where(eq(meetings.id, id))
      .run()
  }
  return id
}

function invoke(channel: string, ...args: unknown[]): unknown {
  const h = handlers.get(channel)
  if (!h) throw new Error(`No handler registered for channel: ${channel}`)
  return h(null, ...args)
}

describe('storage IPC — meeting listing', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    registerStorageHandlers()
  })

  afterEach(() => {
    _resetTestDb()
    vi.clearAllMocks()
  })

  it('storage:get-meetings returns empty array when no meetings', async () => {
    const result = await invoke('storage:get-meetings')
    expect(result).toEqual([])
  })

  it('storage:get-meetings returns all inserted meetings', async () => {
    seedMeeting()
    seedMeeting()
    const result = (await invoke('storage:get-meetings')) as unknown[]
    expect(result).toHaveLength(2)
  })

  it('storage:get-meetings-by-date returns meetings matching the date', async () => {
    seedMeeting({ date: '2024-06-15T09:00:00.000Z' })
    seedMeeting({ date: '2024-06-15T14:00:00.000Z' })
    seedMeeting({ date: '2024-06-16T10:00:00.000Z' })
    const result = (await invoke('storage:get-meetings-by-date', '2024-06-15')) as unknown[]
    expect(result).toHaveLength(2)
  })

  it('storage:get-meetings-by-date returns empty for a date with no meetings', async () => {
    seedMeeting({ date: '2024-06-15T10:00:00.000Z' })
    const result = (await invoke('storage:get-meetings-by-date', '2024-06-20')) as unknown[]
    expect(result).toHaveLength(0)
  })
})

describe('storage IPC — meeting detail', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    registerStorageHandlers()
  })

  afterEach(() => {
    _resetTestDb()
    vi.clearAllMocks()
  })

  it('storage:get-meeting returns null for unknown id', async () => {
    expect(await invoke('storage:get-meeting', 9999)).toBeNull()
  })

  it('storage:get-meeting returns meeting with null transcript when no transcript exists', async () => {
    const id = seedMeeting()
    const detail = (await invoke('storage:get-meeting', id)) as { transcript: unknown }
    expect(detail).not.toBeNull()
    expect(detail.transcript).toBeNull()
  })

  it('storage:get-meeting includes transcript when one exists', async () => {
    const id = seedMeeting()
    insertTranscript({
      meetingId: id,
      content: 'Meeting content',
      chunks: null,
      model: 'whisper-base'
    })
    const detail = (await invoke('storage:get-meeting', id)) as { transcript: { content: string } }
    expect(detail.transcript?.content).toBe('Meeting content')
  })

  it('storage:get-meeting includes summary when one exists', async () => {
    const id = seedMeeting()
    insertTranscript({ meetingId: id, content: 'text', chunks: null, model: 'whisper-tiny' })
    insertSummary({
      meetingId: id,
      summary: 'Great meeting',
      todos: null,
      keyDecisions: ['ship it'],
      participants: null,
      journal: null,
      llmModel: 'gpt-4o'
    })
    const detail = (await invoke('storage:get-meeting', id)) as {
      summary: { summary: string; key_decisions: string[] }
    }
    expect(detail.summary?.summary).toBe('Great meeting')
    expect(detail.summary?.key_decisions).toContain('ship it')
  })
})

describe('storage IPC — transcript persistence', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    registerStorageHandlers()
  })

  afterEach(() => {
    _resetTestDb()
    vi.clearAllMocks()
  })

  it('storage:save-transcript persists transcript content', async () => {
    const id = seedMeeting()
    await invoke('storage:save-transcript', {
      meetingId: id,
      content: 'Hello world',
      chunks: null,
      model: 'whisper-large'
    })
    const result = (await invoke('storage:get-transcript', id)) as { content: string } | null
    expect(result?.content).toBe('Hello world')
  })

  it('storage:save-transcript is idempotent — second write replaces first', async () => {
    const id = seedMeeting()
    await invoke('storage:save-transcript', {
      meetingId: id,
      content: 'first version',
      chunks: null,
      model: 'whisper-tiny'
    })
    await invoke('storage:save-transcript', {
      meetingId: id,
      content: 'second version',
      chunks: null,
      model: 'whisper-base'
    })
    const result = (await invoke('storage:get-transcript', id)) as { content: string }
    expect(result.content).toBe('second version')
  })

  it('storage:get-transcript returns null when no transcript exists', async () => {
    const id = seedMeeting()
    expect(await invoke('storage:get-transcript', id)).toBeNull()
  })
})

describe('storage IPC — delete and reset', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    registerStorageHandlers()
  })

  afterEach(() => {
    _resetTestDb()
    vi.clearAllMocks()
  })

  it('storage:delete-meeting removes the meeting row', async () => {
    const id = seedMeeting()
    await invoke('storage:delete-meeting', id)
    expect(getMeetingById(id)).toBeNull()
  })

  it('storage:reset-for-reprocessing resets status to recorded', async () => {
    const id = seedMeeting()
    insertTranscript({ meetingId: id, content: 'text', chunks: null, model: 'whisper-tiny' })
    // status advances to 'transcribed' after insert
    await invoke('storage:reset-for-reprocessing', id)
    const meeting = getMeetingById(id)
    expect(meeting?.status).toBe('recorded')
  })

  it('storage:reset-for-reprocessing removes the transcript', async () => {
    const id = seedMeeting()
    insertTranscript({ meetingId: id, content: 'text', chunks: null, model: 'whisper-tiny' })
    await invoke('storage:reset-for-reprocessing', id)
    expect(await invoke('storage:get-transcript', id)).toBeNull()
  })

  it('storage:clear-all removes all meetings', async () => {
    seedMeeting()
    seedMeeting()
    await invoke('storage:clear-all')
    const result = (await invoke('storage:get-meetings')) as unknown[]
    expect(result).toHaveLength(0)
  })
})

describe('storage IPC — search', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    registerStorageHandlers()
  })

  afterEach(() => {
    _resetTestDb()
    vi.clearAllMocks()
  })

  it('storage:search returns meetings matching transcript content', async () => {
    const id = seedMeeting()
    insertTranscript({
      meetingId: id,
      content: 'quarterly budget review forecast',
      chunks: null,
      model: 'whisper-base'
    })
    const results = (await invoke('storage:search', 'budget')) as unknown[]
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it('storage:search returns empty for a query with no matches', async () => {
    const id = seedMeeting()
    insertTranscript({ meetingId: id, content: 'hello world', chunks: null, model: 'whisper-tiny' })
    const results = (await invoke('storage:search', 'xyznotpresent')) as unknown[]
    expect(results).toHaveLength(0)
  })

  it('storage:search matches meeting title via LIKE', async () => {
    seedMeeting({ title: 'Product Roadmap Q3' })
    const results = (await invoke('storage:search', 'Roadmap')) as { title: string }[]
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].title).toContain('Roadmap')
  })

  it('storage:search returns results from multiple meetings when both match', async () => {
    const id1 = seedMeeting()
    const id2 = seedMeeting()
    insertTranscript({
      meetingId: id1,
      content: 'architecture review session',
      chunks: null,
      model: 'whisper-tiny'
    })
    insertTranscript({
      meetingId: id2,
      content: 'architecture planning notes',
      chunks: null,
      model: 'whisper-tiny'
    })
    const results = (await invoke('storage:search', 'architecture')) as { id: number }[]
    const ids = results.map((r) => r.id)
    expect(ids).toContain(id1)
    expect(ids).toContain(id2)
  })

  it('storage:search returns empty array for an empty query string', async () => {
    seedMeeting()
    const results = (await invoke('storage:search', '')) as unknown[]
    expect(results).toHaveLength(0)
  })
})

describe('storage IPC — todo update persistence', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    registerStorageHandlers()
  })

  afterEach(() => {
    _resetTestDb()
    vi.clearAllMocks()
  })

  it('storage:update-todo marks a todo as done and round-trips through get-meeting', async () => {
    const id = seedMeeting()
    insertTranscript({ meetingId: id, content: 'text', chunks: null, model: 'whisper-tiny' })
    insertSummary({
      meetingId: id,
      summary: 'summary',
      todos: [
        { text: 'Buy milk', owner: null, deadline: null, priority: 'low', done: false },
        { text: 'Write tests', owner: null, deadline: null, priority: 'high', done: false }
      ],
      keyDecisions: null,
      participants: null,
      journal: null,
      llmModel: 'gpt-4o'
    })

    await invoke('storage:update-todo', id, 1, true)

    const detail = (await invoke('storage:get-meeting', id)) as {
      summary: { todos: { text: string; done: boolean }[] }
    }
    expect(detail.summary.todos[0].done).toBe(false)
    expect(detail.summary.todos[1].done).toBe(true)
  })

  it('storage:update-todo is a no-op when the index is out of range', async () => {
    const id = seedMeeting()
    insertTranscript({ meetingId: id, content: 'text', chunks: null, model: 'whisper-tiny' })
    insertSummary({
      meetingId: id,
      summary: 'summary',
      todos: [{ text: 'Only task', owner: null, deadline: null, priority: 'low', done: false }],
      keyDecisions: null,
      participants: null,
      journal: null,
      llmModel: 'gpt-4o'
    })

    // index 99 is out of range — should not throw and should not mutate data
    expect(() => invoke('storage:update-todo', id, 99, true)).not.toThrow()
    const detail = (await invoke('storage:get-meeting', id)) as {
      summary: { todos: { done: boolean }[] }
    }
    expect(detail.summary.todos[0].done).toBe(false)
  })
})

describe('storage IPC — journal update persistence', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    registerStorageHandlers()
  })

  afterEach(() => {
    _resetTestDb()
    vi.clearAllMocks()
  })

  it('storage:update-journal replaces journal text and is visible in get-meeting', async () => {
    const id = seedMeeting()
    insertTranscript({ meetingId: id, content: 'text', chunks: null, model: 'whisper-tiny' })
    insertSummary({
      meetingId: id,
      summary: 'summary',
      todos: null,
      keyDecisions: null,
      participants: null,
      journal: 'original journal entry',
      llmModel: 'gpt-4o'
    })

    await invoke('storage:update-journal', id, 'updated journal entry')

    const detail = (await invoke('storage:get-meeting', id)) as {
      summary: { journal: string }
    }
    expect(detail.summary.journal).toBe('updated journal entry')
  })

  it('storage:update-journal replaces previous journal text on repeated calls', async () => {
    const id = seedMeeting()
    insertTranscript({ meetingId: id, content: 'text', chunks: null, model: 'whisper-tiny' })
    insertSummary({
      meetingId: id,
      summary: 'summary',
      todos: null,
      keyDecisions: null,
      participants: null,
      journal: 'first entry',
      llmModel: 'gpt-4o'
    })

    await invoke('storage:update-journal', id, 'second entry')
    await invoke('storage:update-journal', id, 'third entry')

    const detail = (await invoke('storage:get-meeting', id)) as {
      summary: { journal: string }
    }
    expect(detail.summary.journal).toBe('third entry')
  })
})
