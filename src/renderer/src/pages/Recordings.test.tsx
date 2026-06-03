import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { Provider } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
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

describe('Recordings — rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getMeetings).mockResolvedValue([])
    vi.mocked(api.onCaptureEvent).mockReturnValue(() => {})
    vi.mocked(api.onTranscriptionStatus).mockReturnValue(() => {})
    vi.mocked(api.onLlmDone).mockReturnValue(() => {})
  })

  it('renders the page heading', async () => {
    await renderRecordings()
    expect(screen.getByRole('heading', { name: /recordings/i })).toBeInTheDocument()
  })

  it('shows empty state when no meetings exist', async () => {
    await renderRecordings()
    await waitFor(() => expect(screen.getByText(/no recordings yet/i)).toBeInTheDocument())
  })

  it('calls getMeetings on mount', async () => {
    await renderRecordings()
    expect(api.getMeetings).toHaveBeenCalledOnce()
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

  it('subscribes to capture events and transcription status on mount', async () => {
    await renderRecordings()
    expect(api.onCaptureEvent).toHaveBeenCalledOnce()
    expect(api.onTranscriptionStatus).toHaveBeenCalledOnce()
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

  it('calls searchMeetings when user types in the search bar', async () => {
    vi.mocked(api.searchMeetings).mockResolvedValue([])
    await renderRecordings()
    const input = screen.getByPlaceholderText(/search recordings/i)
    fireEvent.change(input, { target: { value: 'standup' } })
    // SearchBar debounces 300ms — waitFor polls until the assertion passes
    await waitFor(() => expect(api.searchMeetings).toHaveBeenCalledWith('standup'), {
      timeout: 2000
    })
  })

  it('shows result count text after search returns', async () => {
    const results = [makeMeeting({ id: 10, title: 'Weekly Standup' })]
    vi.mocked(api.searchMeetings).mockResolvedValue(results as never)
    await renderRecordings()
    const input = screen.getByPlaceholderText(/search recordings/i)
    fireEvent.change(input, { target: { value: 'standup' } })
    await waitFor(() => expect(screen.getByText(/1 result.*standup/i)).toBeInTheDocument(), {
      timeout: 2000
    })
  })

  it('shows no-results message when search returns empty', async () => {
    vi.mocked(api.searchMeetings).mockResolvedValue([])
    await renderRecordings()
    const input = screen.getByPlaceholderText(/search recordings/i)
    fireEvent.change(input, { target: { value: 'xyznotfound' } })
    await waitFor(
      () => expect(screen.getByText(/no results for "xyznotfound"/i)).toBeInTheDocument(),
      { timeout: 2000 }
    )
  })
})
