import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { Provider } from 'jotai'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Journal from './Journal'

vi.mock('../components/JournalEntryCard', () => ({
  default: ({ meeting }: { meeting: { title: string | null } }) => (
    <div>{meeting.title ?? 'Untitled Meeting'}</div>
  )
}))

vi.mock('@/lib/api', () => ({
  api: {
    getMeetingsByDate: vi.fn()
  }
}))

import { api } from '@/lib/api'

function makeMeeting(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    session_id: 'sess-1',
    title: 'Afternoon Review',
    date: '2024-06-15T15:00:00.000Z',
    duration_s: 600,
    audio_path: '/tmp/audio.webm',
    status: 'done',
    created_at: '2024-06-15T15:00:00.000Z',
    updated_at: '2024-06-15T15:00:00.000Z',
    ...overrides
  }
}

async function renderJournal(path = '/journal/2024-06-15'): Promise<ReturnType<typeof render>> {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(
      <Provider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/journal/:date?" element={<Journal />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    )
  })
  return result
}

describe('Journal — rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getMeetingsByDate).mockResolvedValue([])
  })

  it('renders the page heading', async () => {
    await renderJournal()
    expect(screen.getByRole('heading', { name: /journal/i })).toBeInTheDocument()
  })

  it('loads meetings for the route date', async () => {
    await renderJournal('/journal/2024-06-15')
    expect(api.getMeetingsByDate).toHaveBeenCalledWith('2024-06-15')
  })

  it('shows empty state when the day has no meetings', async () => {
    await renderJournal()
    await waitFor(() =>
      expect(screen.getByText(/no meetings recorded on this day/i)).toBeInTheDocument()
    )
  })

  it('renders a card for each meeting on the day', async () => {
    vi.mocked(api.getMeetingsByDate).mockResolvedValue([
      makeMeeting({ id: 1, title: 'Standup' }) as never,
      makeMeeting({ id: 2, title: 'Retro' }) as never
    ])
    await renderJournal()
    await waitFor(() => {
      expect(screen.getByText('Standup')).toBeInTheDocument()
      expect(screen.getByText('Retro')).toBeInTheDocument()
    })
  })
})

describe('Journal — load states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the page chrome visible while getMeetingsByDate is in flight', async () => {
    let resolveMeetings!: (value: never[]) => void
    vi.mocked(api.getMeetingsByDate).mockReturnValue(
      new Promise((resolve) => {
        resolveMeetings = resolve
      })
    )
    await renderJournal()
    expect(screen.getByRole('heading', { name: /journal/i })).toBeInTheDocument()
    expect(screen.queryByText('Standup')).not.toBeInTheDocument()
    await act(async () => {
      resolveMeetings([])
    })
  })

  it('stays on the empty chrome when getMeetingsByDate rejects', async () => {
    vi.mocked(api.getMeetingsByDate).mockRejectedValue(new Error('db unavailable'))
    await renderJournal()
    expect(screen.getByRole('heading', { name: /journal/i })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByText(/no meetings recorded on this day/i)).toBeInTheDocument()
    )
  })
})
