import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import TodoList from './TodoList'

vi.mock('@/lib/api', () => ({
  api: {
    updateTodo: vi.fn()
  }
}))

import { api } from '@/lib/api'

const TODOS = [
  { text: 'Ship the fix', owner: 'Alex', deadline: null, priority: 'high' as const, done: false },
  { text: 'Write notes', owner: null, deadline: 'Friday', priority: 'low' as const, done: false }
]

describe('TodoList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.updateTodo).mockResolvedValue(undefined)
  })

  it('shows an empty message when there are no action items', () => {
    render(<TodoList meetingId={4} todos={[]} />)
    expect(screen.getByText(/no action items found/i)).toBeInTheDocument()
  })

  it('persists a toggle through updateTodo and strikes through the item', async () => {
    render(<TodoList meetingId={4} todos={TODOS} />)
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    await waitFor(() => expect(api.updateTodo).toHaveBeenCalledWith(4, 0, true))
    expect(screen.getByText('Ship the fix')).toHaveClass('line-through')
    expect(screen.getAllByRole('checkbox')[0]).toBeChecked()
  })
})
