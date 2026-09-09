import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import JournalPanel from './JournalPanel'

vi.mock('@/lib/api', () => ({
  api: {
    updateJournal: vi.fn()
  }
}))

import { api } from '@/lib/api'

describe('JournalPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.updateJournal).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows an empty message when there is no journal yet', () => {
    render(<JournalPanel meetingId={3} journal={null} />)
    expect(screen.getByText(/no journal entry yet/i)).toBeInTheDocument()
  })

  it('debounces updateJournal after the textarea changes', async () => {
    render(<JournalPanel meetingId={3} journal="original" />)
    const area = screen.getByPlaceholderText(/write your journal entry/i)
    vi.useFakeTimers()
    fireEvent.change(area, { target: { value: 'edited notes' } })
    expect(api.updateJournal).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(599)
    })
    expect(api.updateJournal).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(api.updateJournal).toHaveBeenCalledWith(3, 'edited notes')
  })

  it('resets the debounce when the user keeps typing', async () => {
    render(<JournalPanel meetingId={3} journal="original" />)
    const area = screen.getByPlaceholderText(/write your journal entry/i)
    vi.useFakeTimers()
    fireEvent.change(area, { target: { value: 'first' } })
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    fireEvent.change(area, { target: { value: 'second' } })
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(api.updateJournal).toHaveBeenCalledTimes(1)
    expect(api.updateJournal).toHaveBeenCalledWith(3, 'second')
  })
})
