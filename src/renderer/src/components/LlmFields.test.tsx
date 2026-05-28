import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LlmFields from './LlmFields'

vi.mock('@/lib/api', () => ({
  api: {
    testLlmConnection: vi.fn()
  }
}))

import { api } from '@/lib/api'

const defaultProps = {
  baseURL: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o',
  apiVersion: '',
  onBaseURLChange: vi.fn(),
  onApiKeyChange: vi.fn(),
  onModelChange: vi.fn(),
  onApiVersionChange: vi.fn()
}

describe('LlmFields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all field labels', () => {
    render(<LlmFields {...defaultProps} />)
    expect(screen.getByLabelText(/base url/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/api key/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/model/i)).toBeInTheDocument()
  })

  it('renders the Test Connection button', () => {
    render(<LlmFields {...defaultProps} />)
    expect(screen.getByRole('button', { name: /test connection/i })).toBeInTheDocument()
  })

  it('hides Save button when showSave is false', () => {
    render(<LlmFields {...defaultProps} showSave={false} />)
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
  })

  it('calls api.testLlmConnection on Test Connection click', async () => {
    vi.mocked(api.testLlmConnection).mockResolvedValueOnce({ ok: true })
    render(<LlmFields {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))
    await waitFor(() => expect(api.testLlmConnection).toHaveBeenCalledOnce())
  })

  it('shows Connected state after successful test', async () => {
    vi.mocked(api.testLlmConnection).mockResolvedValueOnce({ ok: true })
    render(<LlmFields {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))
    await waitFor(() => expect(screen.getByText(/connected/i)).toBeInTheDocument())
  })

  it('shows error state when test fails', async () => {
    vi.mocked(api.testLlmConnection).mockRejectedValueOnce(new Error('401 Unauthorized'))
    render(<LlmFields {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))
    await waitFor(() => expect(screen.getByTitle('401 Unauthorized')).toBeInTheDocument())
  })
})
