import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Capture ipcMain registrations before the module under test runs
// ---------------------------------------------------------------------------
const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()

const { mockShowOpenDialog } = vi.hoisted(() => ({
  mockShowOpenDialog: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
    on: vi.fn()
  },
  app: {
    getPath: vi.fn(() => '/tmp/briefly-capture-test'),
    isPackaged: false
  },
  dialog: {
    showOpenDialog: mockShowOpenDialog
  },
  desktopCapturer: {
    getSources: vi.fn().mockResolvedValue([])
  },
  systemPreferences: {
    getMediaAccessStatus: vi.fn(() => 'granted'),
    askForMediaAccess: vi.fn().mockResolvedValue(true)
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true, development: true }
}))

vi.mock('../lib/notifications', () => ({
  notifyRecordingSaved: vi.fn()
}))

vi.mock('../lib/tray', () => ({
  updateTrayState: vi.fn()
}))

const { mockCopyFileSync, mockMkdirSync } = vi.hoisted(() => ({
  mockCopyFileSync: vi.fn(),
  mockMkdirSync: vi.fn()
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, copyFileSync: mockCopyFileSync, mkdirSync: mockMkdirSync }
})

vi.mock('uuid', () => ({ v4: vi.fn(() => 'test-uuid-1234') }))

import { _setTestDbPath, _resetTestDb, getMeetingById } from '../lib/db'
import { registerCaptureHandlers } from './capture'

function invoke(channel: string, ...args: unknown[]): unknown {
  const h = handlers.get(channel)
  if (!h) throw new Error(`No handler registered for channel: ${channel}`)
  return h(null, ...args)
}

describe('capture:import-audio — user cancels dialog', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    registerCaptureHandlers()
  })

  afterEach(() => {
    _resetTestDb()
    vi.clearAllMocks()
  })

  it('returns null when the open dialog is cancelled', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    const result = await invoke('capture:import-audio')
    expect(result).toBeNull()
  })

  it('returns null when filePaths is empty', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] })
    const result = await invoke('capture:import-audio')
    expect(result).toBeNull()
  })
})

describe('capture:import-audio — file selected', () => {
  beforeEach(() => {
    handlers.clear()
    _setTestDbPath(':memory:')
    registerCaptureHandlers()
  })

  afterEach(() => {
    _resetTestDb()
    vi.clearAllMocks()
  })

  it('creates a meeting row with status recorded', async () => {
    mockShowOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/Users/alice/Downloads/meeting.webm']
    })

    const result = (await invoke('capture:import-audio')) as {
      meetingId: number
      audioPath: string
    }

    expect(result).not.toBeNull()
    const meeting = getMeetingById(result.meetingId)
    expect(meeting?.status).toBe('recorded')
  })

  it('returns the meetingId and the copied audio path', async () => {
    mockShowOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/Users/alice/Downloads/recording.mp3']
    })

    const result = (await invoke('capture:import-audio')) as {
      meetingId: number
      audioPath: string
    }

    expect(result.meetingId).toBeTypeOf('number')
    expect(result.audioPath).toMatch(/audio\.mp3$/)
  })

  it('copies the source file into the recordings directory', async () => {
    mockShowOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/Users/alice/Downloads/call.wav']
    })

    await invoke('capture:import-audio')

    expect(mockCopyFileSync).toHaveBeenCalledWith(
      '/Users/alice/Downloads/call.wav',
      expect.stringContaining('audio.wav')
    )
  })
})
