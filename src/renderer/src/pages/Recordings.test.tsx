import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { Provider } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import type { CaptureEvent } from '../../../main/lib/types'
import Recordings from './Recordings'

vi.mock('@/lib/api', () => ({
  api: {
    getMeetings: vi.fn(),
    onCaptureEvent: vi.fn(() => () => {}),
    onTranscriptionStatus: vi.fn(() => () => {}),
    onLlmDone: vi.fn(() => () => {}),
    searchMeetings: vi.fn(),
    deleteMeeting: vi.fn()
  }
}))

import { api } from '@/lib/api'

async function renderRecordings(): Promise<ReturnType<typeof render>> {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(
      <Provider>
        <MemoryRouter>
          <Recordings />
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

describe('Recordings — load and list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getMeetings).mockResolvedValue([])
    vi.mocked(api.onCaptureEvent).mockReturnValue(() => {})
    vi.mocked(api.onTranscriptionStatus).mockReturnValue(() => {})
    vi.mocked(api.onLlmDone).mockReturnValue(() => {})
  })

  it('loads meetings on mount and shows the empty chrome when none exist', async () => {
    await renderRecordings()
    expect(api.getMeetings).toHaveBeenCalledOnce()
    expect(screen.getByRole('heading', { name: /recordings/i })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/no recordings yet/i)).toBeInTheDocument())
  })

  it('renders meeting titles when meetings exist', async () => {
    const meetings = [
      makeMeeting({ id: 1, title: 'Retro', status: 'done' }),
      makeMeeting({ id: 2, title: 'Planning', status: 'recorded' })
    ]
    vi.mocked(api.getMeetings).mockResolvedValue(meetings as never)
    await renderRecordings()
    await waitFor(() => {
      expect(screen.getByText('Retro')).toBeInTheDocument()
      expect(screen.getByText('Planning')).toBeInTheDocument()
    })
  })

  it('filters the list when a status chip is pressed', async () => {
    vi.mocked(api.getMeetings).mockResolvedValue([
      makeMeeting({ id: 1, title: 'Retro', status: 'done' }),
      makeMeeting({ id: 2, title: 'Broken', status: 'error' })
    ] as never)
    await renderRecordings()
    await waitFor(() => expect(screen.getByText('Retro')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^error$/i }))
    expect(screen.getByText('Broken')).toBeInTheDocument()
    expect(screen.queryByText('Retro')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^all$/i }))
    expect(screen.getByText('Retro')).toBeInTheDocument()
    expect(screen.getByText('Broken')).toBeInTheDocument()
  })
})

describe('Recordings — search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getMeetings).mockResolvedValue([])
    vi.mocked(api.onCaptureEvent).mockReturnValue(() => {})
    vi.mocked(api.onTranscriptionStatus).mockReturnValue(() => {})
    vi.mocked(api.onLlmDone).mockReturnValue(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function typeSearch(value: string): Promise<void> {
    const input = screen.getByPlaceholderText(/search recordings/i)
    vi.useFakeTimers()
    fireEvent.change(input, { target: { value } })
    // SearchBar debounces 300ms — fake timers skip the wall-clock wait.
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    vi.useRealTimers()
  }

  it('calls searchMeetings when the user types in the search bar', async () => {
    vi.mocked(api.searchMeetings).mockResolvedValue([])
    await renderRecordings()
    await typeSearch('standup')
    expect(api.searchMeetings).toHaveBeenCalledWith('standup')
  })

  it('shows result count text after search returns', async () => {
    const results = [makeMeeting({ id: 10, title: 'Weekly Standup' })]
    vi.mocked(api.searchMeetings).mockResolvedValue(results as never)
    await renderRecordings()
    await typeSearch('standup')
    expect(screen.getByText(/1 result.*standup/i)).toBeInTheDocument()
  })

  it('shows no-results message when search returns empty', async () => {
    vi.mocked(api.searchMeetings).mockResolvedValue([])
    await renderRecordings()
    await typeSearch('xyznotfound')
    expect(screen.getByText(/no results for "xyznotfound"/i)).toBeInTheDocument()
  })
})

describe('Recordings — load states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.onCaptureEvent).mockReturnValue(() => {})
    vi.mocked(api.onTranscriptionStatus).mockReturnValue(() => {})
    vi.mocked(api.onLlmDone).mockReturnValue(() => {})
  })

  it('keeps the page chrome visible while getMeetings is in flight', async () => {
    let resolveMeetings!: (value: never[]) => void
    vi.mocked(api.getMeetings).mockReturnValue(
      new Promise((resolve) => {
        resolveMeetings = resolve
      })
    )
    await renderRecordings()
    expect(screen.getByRole('heading', { name: /recordings/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/search recordings/i)).toBeInTheDocument()
    expect(screen.queryByText('Retro')).not.toBeInTheDocument()
    await act(async () => {
      resolveMeetings([])
    })
  })

  it('does not crash when getMeetings rejects — empty chrome stays (silent swallow)', async () => {
    vi.mocked(api.getMeetings).mockRejectedValue(new Error('db unavailable'))
    await renderRecordings()
    expect(screen.getByRole('heading', { name: /recordings/i })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/no recordings yet/i)).toBeInTheDocument())
  })
})

describe('Recordings — IPC reload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getMeetings).mockResolvedValue([])
  })

  it('reloads the list when a capture session stops', async () => {
    let captureCb: ((event: CaptureEvent) => void) | undefined
    vi.mocked(api.onCaptureEvent).mockImplementation((cb) => {
      captureCb = cb
      return () => {}
    })
    vi.mocked(api.onTranscriptionStatus).mockReturnValue(() => {})
    vi.mocked(api.onLlmDone).mockReturnValue(() => {})
    await renderRecordings()
    expect(api.getMeetings).toHaveBeenCalledTimes(1)
    await act(async () => {
      captureCb?.({ type: 'stopped', duration_s: 8, path: '/tmp/audio.webm' })
    })
    await waitFor(() => expect(api.getMeetings).toHaveBeenCalledTimes(2))
  })

  it('reloads the list on transcription status events', async () => {
    let statusCb: ((event: { meetingId: number; status: string }) => void) | undefined
    vi.mocked(api.onCaptureEvent).mockReturnValue(() => {})
    vi.mocked(api.onTranscriptionStatus).mockImplementation((cb) => {
      statusCb = cb
      return () => {}
    })
    vi.mocked(api.onLlmDone).mockReturnValue(() => {})
    await renderRecordings()
    await act(async () => {
      statusCb?.({ meetingId: 1, status: 'done' })
    })
    await waitFor(() => expect(api.getMeetings).toHaveBeenCalledTimes(2))
  })

  it('reloads the list when LLM processing finishes', async () => {
    let doneCb: ((event: { meetingId: number }) => void) | undefined
    vi.mocked(api.onCaptureEvent).mockReturnValue(() => {})
    vi.mocked(api.onTranscriptionStatus).mockReturnValue(() => {})
    vi.mocked(api.onLlmDone).mockImplementation((cb) => {
      doneCb = cb
      return () => {}
    })
    await renderRecordings()
    await act(async () => {
      doneCb?.({ meetingId: 1 })
    })
    await waitFor(() => expect(api.getMeetings).toHaveBeenCalledTimes(2))
  })

  it('reloads on repeated IPC events and detaches listeners on unmount', async () => {
    let captureCb: ((event: CaptureEvent) => void) | undefined
    let statusCb: ((event: { meetingId: number; status: string }) => void) | undefined
    let doneCb: ((event: { meetingId: number }) => void) | undefined
    const unsubCapture = vi.fn(() => {
      captureCb = undefined
    })
    const unsubStatus = vi.fn(() => {
      statusCb = undefined
    })
    const unsubDone = vi.fn(() => {
      doneCb = undefined
    })
    vi.mocked(api.onCaptureEvent).mockImplementation((cb) => {
      captureCb = cb
      return unsubCapture
    })
    vi.mocked(api.onTranscriptionStatus).mockImplementation((cb) => {
      statusCb = cb
      return unsubStatus
    })
    vi.mocked(api.onLlmDone).mockImplementation((cb) => {
      doneCb = cb
      return unsubDone
    })

    const view = await renderRecordings()
    expect(api.getMeetings).toHaveBeenCalledTimes(1)

    await act(async () => {
      for (let i = 0; i < 3; i++) {
        captureCb?.({ type: 'stopped', duration_s: 8, path: '/tmp/audio.webm' })
        statusCb?.({ meetingId: 1, status: 'transcribing' })
        doneCb?.({ meetingId: 1 })
      }
    })
    await waitFor(() => expect(api.getMeetings).toHaveBeenCalledTimes(10))

    view.unmount()
    expect(unsubCapture).toHaveBeenCalledOnce()
    expect(unsubStatus).toHaveBeenCalledOnce()
    expect(unsubDone).toHaveBeenCalledOnce()

    await act(async () => {
      captureCb?.({ type: 'stopped', duration_s: 8, path: '/tmp/audio.webm' })
      statusCb?.({ meetingId: 1, status: 'done' })
      doneCb?.({ meetingId: 1 })
    })
    expect(api.getMeetings).toHaveBeenCalledTimes(10)
  })
})
