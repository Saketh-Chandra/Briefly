# Briefly — Architecture & Codebase Context

## Project Overview

Briefly is a macOS Electron desktop app that:
1. Captures system audio via a native Swift binary (`resources/briefly-capture`)
2. Transcribes recordings locally using Whisper (via `@huggingface/transformers` in a Web Worker)
3. Summarises transcripts and generates journal entries using a configurable LLM API (OpenAI-compatible)
4. Displays recordings, transcripts, and daily journal summaries in a React UI

---

## Directory Structure

```
src/
  main/               ← Electron main process (Node.js)
    index.ts          ← entry, window creation, IPC registration
    ipc/
      capture.ts      ← start/stop recording, notify on save
      llm.ts          ← run summary pipeline, notify on done
      settings.ts     ← read/write app settings + hf:test-mirror
      storage.ts      ← meeting CRUD IPC handlers
      transcription.ts← transcription IPC (kicks off worker via renderer message)
    lib/
      capture-cli.ts  ← spawn briefly-capture binary
      db.ts           ← Drizzle + SQLite setup
      keychain.ts     ← macOS keychain for API key
      llm-client.ts   ← OpenAI-compatible LLM client
      notifications.ts← Electron Notification helpers (main-process only)
      schema.ts       ← Drizzle schema (meetings, transcripts, etc.)
      settings.ts     ← read/write JSON settings file
      types.ts        ← shared TS types including AppSettings

  preload/
    index.ts          ← contextBridge implementation (window.api.*)
    index.d.ts        ← TypeScript types for window.api

  renderer/
    index.html        ← entry HTML; contains CSP meta tag
    src/
      App.tsx         ← Jotai Provider + React Router; renders AppShell
      main.tsx        ← React DOM root
      assets/
        main.css      ← Tailwind base + custom scrollbar
      atoms/
        recording.ts  ← recording state (start/stop/status)
        transcription.ts ← full pipeline atom (model load → transcribe → LLM)
        pages.ts      ← meetings list, search/filter, journal atoms
      components/
        layout/
          AppShell.tsx  ← sidebar nav + onNavigate subscription
        ui/           ← shadcn/ui components (Button, Input, etc.)
        AudioWaveform.tsx, MeetingCard.tsx, PipelineStatus.tsx, etc.
      contexts/
        TranscriptionContext.tsx ← thin wrapper (exposes transcriptionAtom via hook)
        RecordingContext.tsx     ← recording state context
      pages/
        Dashboard.tsx   ← recent meetings list
        Recordings.tsx  ← all recordings with search/filter
        Journal.tsx     ← daily journal view
        Settings.tsx    ← all settings + model download UI
        Transcript.tsx  ← single meeting transcript view
      workers/
        whisper.worker.ts ← Web Worker: model loading + transcription

capture/              ← Swift package (separate build)
  Sources/BrieflyCapture/
    main.swift        ← CLI entry, reads args
    AudioCapture.swift
    ScreenshotCapture.swift
    OpusEncoder.swift
    ListWindows.swift
    SessionMode.swift

resources/
  briefly-capture     ← compiled Swift binary (committed)

drizzle/              ← Drizzle migration SQL + snapshots
```

---

## IPC Channels (window.api → main)

| Method | Channel | Description |
|--------|---------|-------------|
| `getSettings()` | `settings:get` | Returns full `AppSettings` |
| `saveSettings(s)` | `settings:save` | Persists settings |
| `getPaths()` | `paths:get` | `{ userData, modelCachePath }` |
| `getDiskUsage()` | `storage:disk-usage` | `{ audioBytes, userData }` |
| `testLlm()` | `llm:test` | Ping LLM endpoint |
| `testMirror(url)` | `hf:test-mirror` | HEAD request via `electron.net` |
| `showNotification(t, b)` | `notify:show` | Show Electron notification |
| `onNavigate(cb)` | `navigate` (listen) | Notification click routing |
| `getMeeting(id)` | `storage:get-meeting` | Single meeting by ID |
| `listMeetings()` | `storage:list-meetings` | All meetings |
| `startRecording(opts)` | `capture:start` | Launch capture binary |
| `stopRecording()` | `capture:stop` | Stop capture binary |
| `onLlmProgress(cb)` | `llm:progress` (listen) | LLM step events |
| `onLlmDone(cb)` | `llm:done` (listen) | LLM completion event |

---

## AppSettings Type (`src/main/lib/types.ts`)

```typescript
interface AppSettings {
  llm: {
    baseURL: string
    model: string
    apiVersion?: string    // for Azure
  }
  whisperModel: string     // e.g. 'onnx-community/whisper-large-v3-turbo'
  whisperLanguage: string  // e.g. 'english'
  hfEndpoint?: string      // HuggingFace mirror URL (no trailing slash stored)
  // ... storage paths etc.
}
```

---

## Whisper Worker Important Details

**File:** `src/renderer/src/workers/whisper.worker.ts`

Messages IN (renderer → worker):
- `{ type: 'init', modelId, modelCachePath, hfEndpoint? }` — configure env + preload model
- `{ type: 'transcribe', audioPath, modelId, language }` — run transcription
- `{ type: 'cancel' }` — set cancelled flag

Messages OUT (worker → renderer):
- `{ type: 'ready' }` — (not used currently, init emits model_ready instead)
- `{ type: 'model_loading', progress, total, file }` — download progress 0-100
- `{ type: 'model_ready' }` — model fully loaded, ready to transcribe
- `{ type: 'transcribing' }` — transcription started
- `{ type: 'chunk', text, start, end }` — incremental transcript chunk
- `{ type: 'done', text, chunks }` — full transcript
- `{ type: 'error', message }` — any error

**Critical env flags:**
```typescript
env.allowLocalModels = false   // MUST be false in web worker context
env.allowRemoteModels = true
env.useBrowserCache = false     // avoid stale HTML entries from earlier CSP blocks
env.cacheKey = 'briefly-transformers-v2'
env.cacheDir = modelCachePath  // from main process getPaths()
env.remoteHost = 'https://hf-mirror.com/'  // trailing slash required; or huggingface.co
```

---

## Jotai Patterns

**Read atom:**
```typescript
const value = useAtomValue(myAtom)
```

**Write atom (async action):**
```typescript
export const doSomethingAtom = atom(null, async (get, set, arg: ArgType) => {
  const current = get(otherAtom)
  set(myAtom, newValue)
  // ...
})
// Usage:
const doSomething = useSetAtom(doSomethingAtom)
doSomething(arg)
```

**Module-level refs (survives re-renders):**
```typescript
let workerRef: Worker | null = null  // outside the atom factory
```

---

## Notifications Pattern

From renderer:
```typescript
window.api.showNotification('Title', 'Body text')
```

From main process directly:
```typescript
import { notifyRecordingSaved, notifySummaryReady, notifyError } from '../lib/notifications'
notifySummaryReady('Meeting Title', meetingId)
```

Notification click routing: main process fires `navigate` event → `AppShell.tsx` subscribes via `window.api.onNavigate` → calls React Router's `navigate('/recordings/123')`.

---

## Build & Dev Commands

```bash
npm run dev          # start electron-vite dev server
npm run build        # production build
npm run typecheck    # must exit 0 before committing
npm run lint         # eslint
```

Drizzle:
```bash
npx drizzle-kit generate  # generate migration from schema changes
npx drizzle-kit migrate   # apply migrations
```
