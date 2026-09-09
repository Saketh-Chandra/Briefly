import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LlmSetupStep from './LlmSetupStep'

vi.mock('@/lib/api', () => ({
  api: {
    testLlmConnection: vi.fn()
  }
}))

import { api } from '@/lib/api'

const props = {
  stepNumber: 2,
  totalSteps: 5,
  baseURL: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o',
  apiVersion: '',
  onBaseURLChange: vi.fn(),
  onApiKeyChange: vi.fn(),
  onModelChange: vi.fn(),
  onApiVersionChange: vi.fn()
}

describe('LlmSetupStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the step heading and copy', () => {
    render(<LlmSetupStep {...props} />)
    expect(screen.getByText(/step 2 of 5/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /connect your llm/i })).toBeInTheDocument()
    expect(screen.getByText(/openai-compatible endpoint/i)).toBeInTheDocument()
  })

  it('renders LLM fields without a Save button', () => {
    render(<LlmSetupStep {...props} />)
    expect(screen.getByLabelText(/base url/i)).toHaveValue('https://api.openai.com/v1')
    expect(screen.getByLabelText(/api key/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^model$/i })).toHaveValue('gpt-4o')
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /test connection/i })).toBeInTheDocument()
  })

  it('forwards field edits to the parent', () => {
    render(<LlmSetupStep {...props} />)
    fireEvent.change(screen.getByLabelText(/base url/i), {
      target: { value: 'https://example.openai.azure.com/openai/deployments/gpt-4o' }
    })
    expect(props.onBaseURLChange).toHaveBeenCalledWith(
      'https://example.openai.azure.com/openai/deployments/gpt-4o'
    )
  })

  it('can test the connection from the step', async () => {
    vi.mocked(api.testLlmConnection).mockResolvedValueOnce({ ok: true })
    render(<LlmSetupStep {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))
    await waitFor(() => expect(screen.getByText(/connected/i)).toBeInTheDocument())
  })
})
