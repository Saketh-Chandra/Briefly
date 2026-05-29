import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { Provider } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import Dashboard from './Dashboard'

// Mock RecordButton — it pulls in RecordingContext and AudioWaveform (browser-media)
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

async function renderDashboard(): Promise<ReturnType<typeof render>> {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(
      <Provider>
        <MemoryRouter>
          <Dashboard />
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

describe('Dashboard — rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getMeetings).mockResolvedValue([])
    vi.mocked(api.getOsInfo).mockResolvedValue({ darwinVersion: SUPPORTED_DARWIN })
    vi.mocked(api.onCaptureEvent).mockReturnValue(() => {})
  })

  it('renders the record button', async () => {
    await renderDashboard()
    expect(screen.getByTestId('record-button')).toBeInTheDocument()
  })

  it('renders the page heading', async () => {
    await renderDashboard()
    expect(screen.getByText(/ready when you are/i)).toBeInTheDocument()
  })

  it('shows empty state when no meetings exist', async () => {
    vi.mocked(api.getMeetings).mockResolvedValue([])
    await renderDashboard()
    await waitFor(() =>
      expect(
        screen.getByText(/no recordings yet/i)
      ).toBeInTheDocument()
    )
  })

  it('calls getMeetings on mount', async () => {
    await renderDashboard()
    expect(api.getMeetings).toHaveBeenCalledOnce()
  })
})

describe('Dashboard — today\'s meetings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getOsInfo).mockResolvedValue({ darwinVersion: SUPPORTED_DARWIN })
    vi.mocked(api.onCaptureEvent).mockReturnValue(() => {})
  })

  it('renders a meeting card when a meeting exists today', async () => {
    const todayMeeting = makeMeeting({ title: 'Morning Sync', date: new Date().toISOString() })
    vi.mocked(api.getMeetings).mockResolvedValue([todayMeeting as never])
    await renderDashboard()
    await waitFor(() =>
      expect(screen.getByText('Morning Sync')).toBeInTheDocument()
    )
  })

  it('shows "Today" section heading when meetings exist today', async () => {
    const todayMeeting = makeMeeting({ title: 'Stand-up', date: new Date().toISOString() })
    vi.mocked(api.getMeetings).mockResolvedValue([todayMeeting as never])
    await renderDashboard()
    await waitFor(() =>
      expect(screen.getByText(/^today$/i)).toBeInTheDocument()
    )
  })
})

describe('Dashboard — OS version warning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getMeetings).mockResolvedValue([])
    vi.mocked(api.onCaptureEvent).mockReturnValue(() => {})
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
