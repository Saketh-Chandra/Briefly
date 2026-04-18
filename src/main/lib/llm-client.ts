export interface LLMConfig {
  baseURL: string // OpenAI: 'https://api.openai.com/v1'
  // Azure:  'https://<resource>.openai.azure.com/openai/deployments/<model>'
  apiKey: string
  model: string // 'gpt-4o' — for Azure this is already in the URL, still pass it
  apiVersion?: string // Azure only: '2025-01-01-preview'
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// response_format for structured JSON output
export interface JsonSchemaFormat {
  type: 'json_schema'
  json_schema: {
    name: string
    strict: boolean
    schema: Record<string, unknown>
  }
}

export type ResponseFormat = JsonSchemaFormat | { type: 'text' }

export class LLMClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string
  ) {
    super(message)
    this.name = 'LLMClientError'
  }
}

export async function chatCompletion(
  config: LLMConfig,
  messages: ChatMessage[],
  responseFormat?: ResponseFormat
): Promise<string> {
  // Build URL — Azure uses query param, OpenAI uses /chat/completions path
  const isAzure = config.apiVersion !== undefined
  const url = isAzure
    ? `${config.baseURL.replace(/\/$/, '')}/chat/completions?api-version=${config.apiVersion}`
    : `${config.baseURL.replace(/\/$/, '')}/chat/completions`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(isAzure ? { 'api-key': config.apiKey } : { Authorization: `Bearer ${config.apiKey}` })
  }

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: 0.3
  }
  if (responseFormat) {
    body.response_format = responseFormat
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new LLMClientError(
      `LLM request failed: ${response.status} ${response.statusText}`,
      response.status,
      text
    )
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[]
  }

  const content = data.choices?.[0]?.message?.content
  if (!content) throw new LLMClientError('Empty response from LLM')
  return content
}
