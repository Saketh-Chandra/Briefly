# Phase 2 — Processing Pipeline

> Objective: Given a recorded `.opus` file, produce a full transcript, structured summary, to-do list, and journal entry — all locally or via a user-configured OpenAI-compatible API.

---

## 2.1 Whisper Transcription — Transformers.js + WebGPU

### Why WebGPU in the Renderer

Transformers.js v3 runs Whisper as an ONNX model. In Electron's renderer process (Chromium), **WebGPU maps to Metal on Apple Silicon** — this gives near-native GPU performance without a Python runtime or native addon.

Running in a **Web Worker** keeps the UI thread free during transcription.

### Model Choice

| Model | Size | Speed on M2 | Use case |
|---|---|---|---|
| `whisper-tiny` | ~150MB | ~50x realtime | Dev/testing only |
| `whisper-base` | ~290MB | ~20x realtime | Fast, lower accuracy |
| `whisper-large-v3-turbo` | ~1.6GB | ~3-8x realtime | **Recommended default** |

Model stored at: `~/Library/Application Support/Briefly/models/`  
First-run: user sees download progress. Subsequent runs: loaded from cache.

### Web Worker (`src/renderer/src/workers/whisper.worker.ts`)

```typescript
import { pipeline, env } from '@huggingface/transformers'

// Point cache to app userData (passed from main via IPC on init)
env.localModelPath = '<userData>/models'
env.allowRemoteModels = true  // first download only

// Messages in:
//   { type: 'transcribe', audioPath: string, modelId: string, language?: string }
//   { type: 'cancel' }

// Messages out:
//   { type: 'progress', loaded: number, total: number }       -- model download
//   { type: 'chunk', text: string, start: number, end: number } -- streaming chunks
//   { type: 'done', text: string, chunks: Chunk[] }
//   { type: 'error', message: string }
```

### Opus → PCM Pipeline (renderer side)

Chromium's `AudioContext` decodes Opus natively — no ffmpeg needed:

```typescript
// In the Web Worker:
const response = await fetch(`file://${audioPath}`)
const arrayBuffer = await response.arrayBuffer()
const audioCtx = new OfflineAudioContext(1, 1, 16000)
const decoded = await audioCtx.decodeAudioData(arrayBuffer)
// decoded.getChannelData(0) → Float32Array at 16kHz mono
```

Pass the `Float32Array` directly to the Transformers.js pipeline — no intermediate file write.

### Transcription Pipeline Call

```typescript
const transcriber = await pipeline(
  'automatic-speech-recognition',
  'onnx-community/whisper-large-v3-turbo',
  {
    device: 'webgpu',         // falls back to 'wasm' if WebGPU unavailable
    dtype: {
      encoder_model: 'fp16', // Metal supports fp16
      decoder_model_merged: 'q4',
    },
  }
)

const result = await transcriber(float32Array, {
  language: 'english',        // or null for auto-detect
  task: 'transcribe',
  chunk_length_s: 30,
  stride_length_s: 5,
  return_timestamps: true,
})
// result.text → full transcript
// result.chunks → [{timestamp: [start, end], text}]
```

### WebGPU Availability Check

```typescript
const device = (await navigator.gpu?.requestAdapter()) ? 'webgpu' : 'wasm'
```

Inform the user via a settings badge if only WASM is available (older hardware).

### IPC Flow: Renderer ↔ Main ↔ Worker

```
Renderer page
  → window.api.startTranscription({ meetingId, audioPath })
  → IPC → main: transcription:start
  → main updates DB status to 'transcribing'
  → main sends IPC event back: transcription:ready
  → Renderer creates/reuses Web Worker
  → Worker streams chunks back via postMessage
  → Renderer shows live progress
  → Worker: done → window.api.saveTranscript({ meetingId, text, chunks })
  → IPC → main: storage:save-transcript
  → main updates DB, sets status = 'transcribed'
```

---

## 2.2 LLM Post-Processing

### Client (`src/main/lib/llm-client.ts`)

Simple fetch-based OpenAI-compatible client — no SDK dependency, keeps the bundle lean:

```typescript
interface LLMConfig {
  baseURL: string       // "https://<resource>.openai.azure.com/openai/deployments/<model>"
  apiKey: string        // from keytar
  model: string         // "gpt-4o"
  apiVersion?: string   // Azure: "2025-01-01-preview"
}

async function chatCompletion(
  config: LLMConfig,
  messages: ChatMessage[],
  responseFormat?: ResponseFormat
): Promise<string>
```

Config loaded from main process settings + keychain. Never exposed to renderer directly.

### Three LLM Calls Per Meeting

All three run sequentially after transcription completes. Each is an IPC call triggered by the renderer after status becomes `transcribed`.

---

#### Call 1 — Summary

**Prompt system message:**
```
You are a meeting assistant. Given a meeting transcript, produce a concise summary.
Output in JSON matching the provided schema.
```

**User message:** full transcript text (or chunked — see below)

**Response schema:**
```json
{
  "title": "short meeting title (5-8 words)",
  "summary": "3-5 bullet points as a markdown list",
  "key_decisions": ["decision 1", "decision 2"],
  "participants_mentioned": ["Alice", "Bob"]
}
```

---

#### Call 2 — To-Dos

**Prompt system message:**
```
Extract all action items and to-dos from the meeting transcript.
Output in JSON matching the provided schema. If no action items exist, return an empty array.
```

**Response schema:**
```json
{
  "todos": [
    {
      "text": "action item description",
      "owner": "person name or null",
      "deadline": "ISO 8601 date or null",
      "priority": "high | medium | low"
    }
  ]
}
```

---

#### Call 3 — Journal Entry

**Prompt system message:**
```
Write a concise first-person journal entry for this meeting as if you attended it.
2-3 sentences. Professional tone. Focus on what was accomplished and what comes next.
```

**Response:** plain text (no JSON schema needed)

---

### Long Meeting Chunking Strategy

For meetings > ~60 min, the transcript will exceed comfortable single-prompt size even for GPT-4o (128k). Use map-reduce:

```
Transcript
  → Split into 3000-token chunks with 200-token overlap
  → Parallel: summarize each chunk (Call 1 variant per chunk)
  → Reduce: feed chunk summaries into a final consolidation prompt
  → Same for to-dos (collect all, deduplicate in final prompt)
  → Journal: use the consolidated summary, not raw transcript
```

Threshold: if `transcript.length > 12000 characters`, use chunking path.

---

### IPC Flow: LLM Processing

```
Renderer (transcript done)
  → window.api.processTranscript({ meetingId })
  → IPC → main: llm:process
  → main: reads transcript from DB
  → main: calls llm-client 3x (summary, todos, journal)
  → main: saves to summaries table, updates meetings.status = 'done'
  → main: emits llm:progress events to renderer (1/3, 2/3, 3/3)
  → Renderer: navigates to Transcript page, shows results
```

---

## 2.3 Dependencies to Install

```bash
# Renderer (via npm, bundled by Vite)
npm install @huggingface/transformers

# Main process
# No new deps — LLM client uses native fetch (Node 18+)
# uuid already added in Phase 1
```

### electron-vite config change

The Web Worker file needs to be handled by Vite's worker bundling. Add to `electron.vite.config.ts`:

```typescript
renderer: {
  worker: {
    format: 'es'
  }
}
```

---

## 2.4 Settings Required (Phase 2)

| Setting | Storage | Notes |
|---|---|---|
| `whisperModel` | `settings.json` | Default: `onnx-community/whisper-large-v3-turbo` |
| `whisperLanguage` | `settings.json` | Default: `english` (null = auto-detect) |
| `llm.baseURL` | `settings.json` | User configured |
| `llm.model` | `settings.json` | Default: `gpt-4o` |
| `llm.apiVersion` | `settings.json` | Optional, for Azure |
| `llm.apiKey` | macOS Keychain (keytar) | Never written to disk as plaintext |

---

## Phase 2 Checklist

- [ ] `@huggingface/transformers` installed
- [ ] `whisper.worker.ts` implemented: loads model, decodes Opus, streams chunks
- [ ] WebGPU → WASM fallback implemented
- [ ] Model first-run download with progress reported to UI
- [ ] Model cache path set to `userData/models/`
- [ ] IPC: `transcription:start`, `storage:save-transcript` handlers in main
- [ ] `llm-client.ts` implemented: fetch-based, Azure + standard OpenAI compatible
- [ ] `llm:process` IPC handler: runs all 3 prompts, saves to DB
- [ ] Long transcript chunking (map-reduce) implemented
- [ ] API key read from keychain, never logged or sent to renderer
- [ ] Manual e2e test: `.opus` → full transcript → summary + todos + journal in DB
