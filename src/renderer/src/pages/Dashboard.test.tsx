import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import { Provider } from 'jotai'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import type { CaptureEvent } from '../../../main/lib/types'
import Dashboard from './Dashboard'

// Mock RecordButton — it pulls in RecordingContext and AudioWaveform (browser-media).
// Page tests must not treat the stub test id as coverage of recording start/stop.
vi.mock('../components/RecordButton', () => ({
  default: () => <div data-testid="record-button" />
}))

vi.mock('@/lib/api', () => ({
  api: {
    getMeetings: vi.fn(),
    getOsInfo: vi.fn(),
    onCaptureEvent: vi.fn(() => () => {}),
    importAudioFile: vi.fn(),
    deleteMeeting: vi.fn()
  }
}))

import { api } from '@/lib/api'

const SUPPORTED_DARWIN = '23.2.0' // macOS 14.2+
const UNSUPPORTED_DARWIN = '22.0.0' // macOS 13 — no system audio

function ImportedMeeting(): React.JSX.Element {
  const { id } = useParams()
  return <div>Imported meeting {id}</div>
}

async function renderDashboard(): Promise<ReturnType<typeof render>> {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(
      <Provider>
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/recordings/:id" element={<ImportedMeeting />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    )
  })
  return result
}

function makeMeeting(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    session_id: 'sess-1',
    title: 'Sprint Standup',
    date: new Date().toISOString(),
    duration_s: 120,
    audio_path: '/tmp/audio.webm',
    status: 'done',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  }
}

describe('Dashboard — load and empty', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getMeetings).mockResolvedValue([])
    vi.mocked(api.getOsInfo).mockResolvedValue({ darwinVersion: SUPPORTED_DARWIN })
    vi.mocked(api.onCaptureEvent).mockReturnValue(() => {})
    vi.mocked(api.importAudioFile).mockResolvedValue(null)
  })

  it('loads meetings on mount and shows the empty chrome when none exist', async () => {
    await renderDashboard()
    expect(api.getMeetings).toHaveBeenCalledOnce()
    expect(screen.getByText(/ready when you are/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/no recordings yet/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /import an audio file/i })).toBeInTheDocument()
  })
})

describe("Dashboard — today's meetings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getOsInfo).mockResolvedValue({ darwinVersion: SUPPORTED_DARWIN })
    vi.mocked(api.onCaptureEvent).mockReturnValue(() => {})
    vi.mocked(api.importAudioFile).mockResolvedValue(null)
  })

  it('renders a Today section when a meeting exists today', async () => {
    const todayMeeting = makeMeeting({ title: 'Morning Sync', date: new Date().toISOString() })
    vi.mocked(api.getMeetings).mockResolvedValue([todayMeeting as never])
    await renderDashboard()
    await waitFor(() => expect(screen.getByText('Morning Sync')).toBeInTheDocument())
    expect(screen.getByText(/^today$/i)).toBeInTheDocument()
  })
})

describe('Dashboard — OS version warning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getMeetings).mockResolvedValue([])
    vi.mocked(api.onCaptureEvent).mockReturnValue(() => {})
    vi.mocked(api.importAudioFile).mockResolvedValue(null)
  })

  it('shows unsupported OS warning for macOS 13 (Darwin 22)', async () => {
    vi.mocked(api.getOsInfo).mockResolvedValue({ darwinVersion: UNSUPPORTED_DARWIN })
    await renderDashboard()
    await waitFor(() =>
      expect(screen.getByText(/system audio capture requires macOS 14\.2/i)).toBeInTheDocument()
    )
  })

  it('does not show OS warning for supported macOS 14.2+ (Darwin 23.2)', async () => {
    vi.mocked(api.getOsInfo).mockResolvedValue({ darwinVersion: SUPPORTED_DARWIN })
    await renderDashboard()
    expect(screen.queryByText(/system audio capture requires/i)).not.toBeInTheDocument()
  })
})

describe('Dashboard — load states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getOsInfo).mockResolvedValue({ darwinVersion: SUPPORTED_DARWIN })
    vi.mocked(api.onCaptureEvent).mockReturnValue(() => {})
    vi.mocked(api.importAudioFile).mockResolvedValue(null)
  })

  it('keeps the hero chrome visible while getMeetings is in flight', async () => {
    let resolveMeetings!: (value: never[]) => void
    vi.mocked(api.getMeetings).mockReturnValue(
      new Promise((resolve) => {
        resolveMeetings = resolve
      })
    )
    await renderDashboard()
    expect(screen.getByText(/ready when you are/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /import an audio file/i })).toBeInTheDocument()
    expect(screen.queryByText('Morning Sync')).not.toBeInTheDocument()
    await act(async () => {
      resolveMeetings([])
    })
  })

  it('does not crash when getMeetings rejects — empty chrome stays (silent swallow)', async () => {
    vi.mocked(api.getMeetings).mockRejectedValue(new Error('db unavailable'))
    await renderDashboard()
    expect(screen.getByText(/ready when you are/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /import an audio file/i })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/no recordings yet/i)).toBeInTheDocument())
  })

  it('does not show the OS warning when getOsInfo rejects', async () => {
    vi.mocked(api.getMeetings).mockResolvedValue([])
    vi.mocked(api.getOsInfo).mockRejectedValue(new Error('ipc failed'))
    await renderDashboard()
    expect(screen.queryByText(/system audio capture requires/i)).not.toBeInTheDocument()
    expect(screen.getByText(/ready when you are/i)).toBeInTheDocument()
  })
})

describe('Dashboard — capture reload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getOsInfo).mockResolvedValue({ darwinVersion: SUPPORTED_DARWIN })
    vi.mocked(api.importAudioFile).mockResolvedValue(null)
  })

  it('reloads meetings when a capture session stops', async () => {
    let captureCb: ((event: CaptureEvent) => void) | undefined
    vi.mocked(api.onCaptureEvent).mockImplementation((cb) => {
      captureCb = cb
      return () => {}
    })
    vi.mocked(api.getMeetings).mockResolvedValue([])
    await renderDashboard()
    expect(api.getMeetings).toHaveBeenCalledTimes(1)
    const stopped: CaptureEvent = { type: 'stopped', duration_s: 12, path: '/tmp/audio.webm' }
    await act(async () => {
      captureCb?.(stopped)
    })
    await waitFor(() => expect(api.getMeetings).toHaveBeenCalledTimes(2))
  })

  it('does not reload on non-stopped capture events', async () => {
    let captureCb: ((event: CaptureEvent) => void) | undefined
    vi.mocked(api.onCaptureEvent).mockImplementation((cb) => {
      captureCb = cb
      return () => {}
    })
    vi.mocked(api.getMeetings).mockResolvedValue([])
    await renderDashboard()
    await act(async () => {
      captureCb?.({ type: 'screenshot_done', path: '/tmp/shot.png' })
    })
    expect(api.getMeetings).toHaveBeenCalledTimes(1)
  })

  it('reloads on repeated stopped events and detaches the listener on unmount', async () => {
    let captureCb: ((event: CaptureEvent) => void) | undefined
    const unsub = vi.fn(() => {
      captureCb = undefined
    })
    vi.mocked(api.onCaptureEvent).mockImplementation((cb) => {
      captureCb = cb
      return unsub
    })
    vi.mocked(api.getMeetings).mockResolvedValue([])
    const view = await renderDashboard()
    expect(api.getMeetings).toHaveBeenCalledTimes(1)

    const stopped: CaptureEvent = { type: 'stopped', duration_s: 12, path: '/tmp/audio.webm' }
    await act(async () => {
      for (let i = 0; i < 5; i++) captureCb?.(stopped)
    })
    await waitFor(() => expect(api.getMeetings).toHaveBeenCalledTimes(6))

    view.unmount()
    expect(unsub).toHaveBeenCalledOnce()
    await act(async () => {
      captureCb?.(stopped)
    })
    expect(api.getMeetings).toHaveBeenCalledTimes(6)
  })
})

describe('Dashboard — import audio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getMeetings).mockResolvedValue([])
    vi.mocked(api.getOsInfo).mockResolvedValue({ darwinVersion: SUPPORTED_DARWIN })
    vi.mocked(api.onCaptureEvent).mockReturnValue(() => {})
  })

  it('navigates to the imported meeting when the file dialog returns a meeting', async () => {
    vi.mocked(api.importAudioFile).mockResolvedValue({
      meetingId: 77,
      audioPath: '/tmp/imported.webm'
    })
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /import an audio file/i }))
    expect(await screen.findByText('Imported meeting 77')).toBeInTheDocument()
  })

  it('stays on the dashboard when the import dialog is cancelled', async () => {
    vi.mocked(api.importAudioFile).mockResolvedValue(null)
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /import an audio file/i }))
    await waitFor(() => expect(api.importAudioFile).toHaveBeenCalledOnce())
    expect(screen.getByText(/ready when you are/i)).toBeInTheDocument()
    expect(screen.queryByText(/imported meeting/i)).not.toBeInTheDocument()
  })
})
