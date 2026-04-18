import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { getTranscript, insertSummary, updateMeetingStatus } from '../lib/db'
import { getSettings } from '../lib/settings'
import { getApiKey } from '../lib/keychain'
import { chatCompletion, LLMClientError } from '../lib/llm-client'
import type { LLMConfig, ChatMessage } from '../lib/llm-client'
import type { Todo } from '../lib/types'
import { notifySummaryReady, notifyError } from '../lib/notifications'

// Threshold: if transcript is longer than this, use chunked map-reduce
const CHUNK_THRESHOLD_CHARS = 12000
// Each chunk is ~3000 tokens; 4 chars ≈ 1 token
const CHUNK_SIZE_CHARS = 12000
const CHUNK_OVERLAP_CHARS = 800

// ---------------------------------------------------------------------------
// Chunking helpers
// ---------------------------------------------------------------------------

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_THRESHOLD_CHARS) return [text]
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE_CHARS, text.length)
    chunks.push(text.slice(start, end))
    start += CHUNK_SIZE_CHARS - CHUNK_OVERLAP_CHARS
  }
  return chunks
}

// ---------------------------------------------------------------------------
// LLM prompt functions
// ---------------------------------------------------------------------------

async function runSummaryCall(
  config: LLMConfig,
  transcript: string
): Promise<{
  title: string
  summary: string
  key_decisions: string[]
  participants_mentioned: string[]
}> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a meeting assistant. Given a meeting transcript, produce a concise summary. Output valid JSON only.'
    },
    { role: 'user', content: transcript }
  ]

  const raw = await chatCompletion(config, messages, {
    type: 'json_schema',
    json_schema: {
      name: 'meeting_summary',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          key_decisions: { type: 'array', items: { type: 'string' } },
          participants_mentioned: { type: 'array', items: { type: 'string' } }
        },
        required: ['title', 'summary', 'key_decisions', 'participants_mentioned'],
        additionalProperties: false
      }
    }
  })
  return JSON.parse(raw)
}

async function runTodosCall(config: LLMConfig, transcript: string): Promise<Todo[]> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'Extract all action items and to-dos from the meeting transcript. Output valid JSON only. If no action items exist, return an empty array.'
    },
    { role: 'user', content: transcript }
  ]

  const raw = await chatCompletion(config, messages, {
    type: 'json_schema',
    json_schema: {
      name: 'meeting_todos',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                owner: { type: ['string', 'null'] },
                deadline: { type: ['string', 'null'] },
                priority: { type: 'string', enum: ['high', 'medium', 'low'] }
              },
              required: ['text', 'owner', 'deadline', 'priority'],
              additionalProperties: false
            }
          }
        },
        required: ['todos'],
        additionalProperties: false
      }
    }
  })
  const result = JSON.parse(raw) as { todos: Omit<Todo, 'done'>[] }
  return result.todos.map((t) => ({ ...t, done: false }))
}

async function runJournalCall(config: LLMConfig, content: string): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'Write a concise first-person journal entry for this meeting as if you attended it. 2-3 sentences. Professional tone. Focus on what was accomplished and what comes next.'
    },
    { role: 'user', content }
  ]
  return chatCompletion(config, messages)
}

// ---------------------------------------------------------------------------
// Map-reduce for long transcripts
// ---------------------------------------------------------------------------

async function processLongTranscript(
  config: LLMConfig,
  transcript: string
): Promise<{
  summaryResult: Awaited<ReturnType<typeof runSummaryCall>>
  todos: Todo[]
  journal: string
}> {
  const chunks = chunkText(transcript)

  // Map: summarize + extract todos per chunk in parallel
  const [chunkSummaries, chunkTodos] = await Promise.all([
    Promise.all(chunks.map((c) => runSummaryCall(config, c))),
    Promise.all(chunks.map((c) => runTodosCall(config, c)))
  ])

  // Reduce: consolidate chunk summaries into a final summary
  const combinedSummaryText = chunkSummaries
    .map((s, i) => `Segment ${i + 1}: ${s.summary}`)
    .join('\n\n')

  const [finalSummary, deduplicatedTodos, journal] = await Promise.all([
    runSummaryCall(config, combinedSummaryText),
    runTodosCall(
      config,
      `Deduplicate and consolidate these action items from a long meeting:\n${JSON.stringify(chunkTodos.flat())}`
    ),
    runJournalCall(config, combinedSummaryText)
  ])

  return { summaryResult: finalSummary, todos: deduplicatedTodos, journal }
}

// ---------------------------------------------------------------------------
// IPC handler registration
// ---------------------------------------------------------------------------

export function registerLlmHandlers(getSender: () => WebContents | null): void {
  ipcMain.handle('llm:process', async (_event, meetingId: number) => {
    const sender = getSender()

    const emitProgress = (step: 1 | 2 | 3, label: string): void => {
      if (sender && !sender.isDestroyed()) {
        sender.send('llm:progress', { meetingId, step, total: 3, label })
      }
    }

    // Mark as processing
    updateMeetingStatus(meetingId, 'processing')

    // Load API key from keychain
    const apiKey = await getApiKey('llm-api-key')
    if (!apiKey) {
      updateMeetingStatus(meetingId, 'error')
      throw new Error('LLM API key not configured. Set it in Settings.')
    }

    const settings = getSettings()
    const config: LLMConfig = {
      baseURL: settings.llm.baseURL,
      apiKey,
      model: settings.llm.model,
      apiVersion: settings.llm.apiVersion
    }

    if (!config.baseURL) {
      updateMeetingStatus(meetingId, 'error')
      throw new Error('LLM base URL not configured. Set it in Settings.')
    }

    // Get transcript
    const transcriptData = getTranscript(meetingId)
    if (!transcriptData) {
      updateMeetingStatus(meetingId, 'error')
      throw new Error(`No transcript found for meeting ${meetingId}`)
    }

    const transcript = transcriptData.content
    const isLong = transcript.length > CHUNK_THRESHOLD_CHARS

    try {
      let summaryResult: Awaited<ReturnType<typeof runSummaryCall>>
      let todos: Todo[]
      let journal: string

      if (isLong) {
        // Map-reduce path
        emitProgress(1, 'Summarizing (chunked)…')
        const result = await processLongTranscript(config, transcript)
        summaryResult = result.summaryResult
        todos = result.todos
        journal = result.journal
        emitProgress(3, 'Done')
      } else {
        // Single-pass path
        emitProgress(1, 'Summarizing…')
        summaryResult = await runSummaryCall(config, transcript)

        emitProgress(2, 'Extracting to-dos…')
        todos = await runTodosCall(config, transcript)

        emitProgress(3, 'Writing journal…')
        journal = await runJournalCall(config, transcript)
      }

      // Persist to DB — also sets status='done' and updates meeting title
      insertSummary({
        meetingId,
        summary: summaryResult.summary,
        todos,
        journal,
        llmModel: config.model,
        meetingTitle: summaryResult.title
      })

      // Notify renderer
      if (sender && !sender.isDestroyed()) {
        sender.send('llm:done', { meetingId })
      }

      notifySummaryReady(summaryResult.title, meetingId)

      return {
        title: summaryResult.title,
        summary: summaryResult.summary,
        todos,
        journal
      }
    } catch (err) {
      updateMeetingStatus(meetingId, 'error')
      const message =
        err instanceof LLMClientError
          ? `LLM error (${err.status}): ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err)
      notifyError('Summarisation', message)
      throw new Error(message)
    }
  })

  ipcMain.handle('llm:test-connection', async () => {
    const apiKey = await getApiKey('llm-api-key')
    if (!apiKey) throw new Error('API key not set.')
    const settings = getSettings()
    if (!settings.llm.baseURL) throw new Error('Base URL not configured.')
    const config: LLMConfig = {
      baseURL: settings.llm.baseURL,
      apiKey,
      model: settings.llm.model,
      apiVersion: settings.llm.apiVersion
    }
    await chatCompletion(config, [{ role: 'user', content: 'Say "ok"' }])
    return { ok: true }
  })
}
