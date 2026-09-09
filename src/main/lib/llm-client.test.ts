import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { chatCompletion, LLMClientError } from './llm-client'
import type { LLMConfig, ChatMessage } from './llm-client'

const openAIConfig: LLMConfig = {
  baseURL: 'https://api.openai.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-4o'
}

const azureConfig: LLMConfig = {
  baseURL: 'https://myresource.openai.azure.com/openai/deployments/gpt-4o',
  apiKey: 'azure-key',
  model: 'gpt-4o',
  apiVersion: '2025-01-01-preview'
}

const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }]

describe('chatCompletion — URL construction', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'OK' } }] })
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls OpenAI chat/completions endpoint', async () => {
    await chatCompletion(openAIConfig, messages)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
  })

  it('strips trailing slash from baseURL', async () => {
    await chatCompletion({ ...openAIConfig, baseURL: 'https://api.openai.com/v1/' }, messages)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
  })

  it('appends api-version query param for Azure', async () => {
    await chatCompletion(azureConfig, messages)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('?api-version=2025-01-01-preview')
  })
})

describe('chatCompletion — header construction', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'OK' } }] })
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses Authorization Bearer for OpenAI', async () => {
    await chatCompletion(openAIConfig, messages)
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer sk-test')
    expect(headers['api-key']).toBeUndefined()
  })

  it('uses api-key header for Azure', async () => {
    await chatCompletion(azureConfig, messages)
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['api-key']).toBe('azure-key')
    expect(headers['Authorization']).toBeUndefined()
  })
})

describe('chatCompletion — error handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws LLMClientError for non-ok responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'invalid api key'
      })
    )
    await expect(chatCompletion(openAIConfig, messages)).rejects.toBeInstanceOf(LLMClientError)
  })

  it('includes status code in the error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => ''
      })
    )
    await expect(chatCompletion(openAIConfig, messages)).rejects.toMatchObject({ status: 429 })
  })

  it('throws LLMClientError when response has no choices', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [] })
      })
    )
    await expect(chatCompletion(openAIConfig, messages)).rejects.toBeInstanceOf(LLMClientError)
  })
})
