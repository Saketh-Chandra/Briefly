# Briefly — Architecture & Codebase Context

## Project Overview

Briefly is a macOS Electron desktop app that:
1. Captures system audio (and optionally microphone) via Electron `desktopCapturer` + Web Audio API + `MediaRecorder` (WebM/Opus)
2. Transcribes recordings locally using Whisper (via `@huggingface/transformers` in a Web Worker)
3. Summarises transcripts and generates journal entries using a configurable LLM API (OpenAI-compatible)
4. Displays recordings, transcripts, and daily journal summaries in a React UI

> There is no Swift binary. The capture pipeline is implemented entirely in Electron/Web APIs.

---

## Repo Tooling

- [../knip.jsonc](../knip.jsonc) configures Knip with explicit Electron-Vite entrypoints:
  [../electron.vite.config.ts](../electron.vite.config.ts), [../src/main/index.ts](../src/main/index.ts),
  [../src/preload/index.ts](../src/preload/index.ts), and [../src/renderer/src/main.tsx](../src/renderer/src/main.tsx).
- Run `bunx knip --include files` to audit unused source files without treating Electron-Vite
  bootstrap files as dead code.
- Ambient declaration files [../src/preload/index.d.ts](../src/preload/index.d.ts) and
  [../src/renderer/src/env.d.ts](../src/renderer/src/env.d.ts) remain part of the project, but are
  excluded from Knip's `unused files` report because they are type-only entry surfaces.

---

## Directory Structure

```
knip.jsonc           ← Knip config with explicit Electron-Vite entrypoints
src/
  main/               ← Electron main process (Node.js)
    index.ts          ← entry, window creation, IPC registration, deep links, tray, global shortcut
    ipc/
      capture.ts      ← desktopCapturer handlers, chunk writes, finalize, screenshot
      llm.ts          ← run summary pipeline, push progress/done events
      settings.ts     ← read/write app settings + hf:test-mirror
      storage.ts      ← meeting CRUD IPC handlers
      transcription.ts← transcription:start guard, model-status, delete-model
    lib/
      db.ts           ← Drizzle + SQLite setup, all DB query functions
      keychain.ts     ← macOS Keychain for LLM API key
      llm-client.ts   ← OpenAI-compatible LLM client (map-reduce for long transcripts)
      notifications.ts← Electron Notification helpers (main-process only)
      proxy.ts        ← Electron session proxy configuration
      schema.ts       ← Drizzle schema (meetings, transcripts, summaries, screenshots); summaries stores: summary, key_decisions, participants (JSON arrays), todos, journal; search_index FTS5 virtual table created in getDb() (outside Drizzle schema)
      settings.ts     ← read/write JSON settings file
      tray.ts         ← macOS menu bar Tray with dynamic context menu
      types.ts        ← shared TS types (Meeting, AppSettings, CaptureEvent, etc.)

  preload/
    index.ts          ← contextBridge implementation (window.api.*)
    index.d.ts        ← TypeScript types for window.api

  renderer/
    index.html        ← entry HTML; CSP: connect-src 'self' https: blob:
    src/
      App.tsx         ← Jotai Provider + React Router; renders AppShell
      main.tsx        ← React DOM root
      assets/
        main.css      ← Tailwind base + custom scrollbar + Briefly design tokens:
                          --briefly-accent/accent-dim (amber), --briefly-record/record-glow (red),
                          --briefly-warning/warning-bg/warning-border (amber warning banners),
                          --briefly-lightbox-bg/lightbox-fade (screenshot lightbox overlay)
      atoms/
        recording.ts  ← recording state (start/stop/status)
        transcription.ts ← full pipeline atom (model load → transcribe → LLM)
        pages.ts      ← meetingsAtom, liveMeetingsAtom, filteredMeetingsAtom, searchTermAtom, searchResultsAtom, isSearchingAtom, runSearchAtom, journal atoms
      components/
        layout/
          AppShell.tsx  ← sidebar nav + onNavigate + tray/shortcut subscriptions
        ui/           ← shadcn/ui components (Button, Input, etc.)
        AudioWaveform.tsx, MeetingCard.tsx, PipelineStatus.tsx, StatusBadge.tsx, etc.
        DeleteMeetingDialog.tsx ← shared delete confirmation dialog (replaces all window.confirm() calls)
        DateNavigator.tsx      ← local-date-aware prev/next day navigation (uses getFullYear/getMonth/getDate, not toISOString)
        FilterBar.tsx          ← status filter pills with aria-pressed
        MeetingList.tsx        ← meeting rows; accepts emptyMessage prop and flat prop (FTS results without date grouping)
        SourcePicker.tsx       ← screen/window source picker; uses Lucide <Check> for selected state
        onboarding/
          WelcomeStep.tsx
          LlmSetupStep.tsx     ← accepts stepNumber + totalSteps props
          WhisperSetupStep.tsx ← accepts stepNumber + totalSteps props
          PermissionsStep.tsx  ← accepts stepNumber + totalSteps props
          ReadyStep.tsx        ← accepts stepNumber + totalSteps props
      contexts/
        TranscriptionContext.tsx ← thin wrapper; exposes transcriptionAtom via hook
        RecordingContext.tsx     ← recording state context
      lib/
        capture-session.ts ← CaptureSession: getDisplayMedia + Web Audio mixing + MediaRecorder
        format.ts          ← shared formatDuration(seconds) utility (used by MeetingCard, MeetingList)
        platform.ts        ← shared isSupportedMacOSVersion(darwinVersion) utility (used by Dashboard, Onboarding)
      pages/
        Dashboard.tsx   ← today's meetings + RecordButton
        Recordings.tsx  ← all recordings with search/filter
        Journal.tsx     ← daily journal view
        Settings.tsx    ← LLM config, Whisper model download/manage, proxy, storage
        Transcript.tsx  ← single meeting view: transcript, summary, todos, journal tabs
      workers/
        whisper.worker.ts ← Web Worker: model loading + transcription

drizzle/              ← Drizzle migration SQL + snapshots
resources/            ← app icon, build entitlements
```

---

## Meeting Status State Machine

```
recording → recorded → transcribing → transcribed → processing → done
                  ↑                                              ↓
                  └─────────────── resetForReprocessing ────────┘
                                          ↓ (any state)
                                        error
```

`resetForReprocessing` deletes the transcript and summary rows, clears `search_index` rows for the meeting, and sets the meeting back to `recorded` so the full pipeline can re-run cleanly.

---

## IPC Channels (window.api → main)

### Capture

| Method | Channel | Notes |
|--------|---------|-------|
| `getSources()` | `capture:get-sources` | Filters out Briefly's own windows |
| `checkPermissions()` | `capture:check-permissions` | `{ screen, mic }` |
| `requestMicPermission()` | `capture:request-mic-permission` | |
| `startRecording(opts)` | `capture:start` | Stores `pendingSourceId`; creates DB row |
| `writeAudioChunk(id, buf)` | `capture:write-chunk` | 1s WebM/Opus chunks |
| `finalizeRecording(id, dur)` | `capture:finalize` | Status → `recorded` |
| `takeScreenshot()` | `capture:screenshot-save` | High-res thumbnail |
| `onCaptureEvent(cb)` | BroadcastChannel | No IPC round-trip |

### Storage

| Method | Channel | Notes |
|--------|---------|-------|
| `getMeetings()` | `storage:get-meetings` | |
| `getMeeting(id)` | `storage:get-meeting` | Includes transcript + summary |
| `getMeetingsByDate(date)` | `storage:get-meetings-by-date` | ISO date string |
| `searchMeetings(query)` | `storage:search` | FTS5 BM25 search across transcript, summary, decisions, journal + title LIKE; returns up to 50 `Meeting` rows ranked by relevance |
| `deleteMeeting(id)` | `storage:delete-meeting` | Deletes audio file too |
| `saveTranscript(params)` | `storage:save-transcript` | Idempotent; deletes old row first |
| `getTranscript(id)` | `storage:get-transcript` | |
| `resetForReprocessing(id)` | `storage:reset-for-reprocessing` | Deletes transcript + summary; status → `recorded` |
| `updateTodo(id, idx, done)` | `storage:update-todo` | |
| `updateJournal(id, text)` | `storage:update-journal` | |
| `getDiskUsage()` | `storage:disk-usage` | |
| `readAudio(path)` | `storage:read-audio` | Returns ArrayBuffer |
| `revealInFinder()` | `storage:reveal-in-finder` | |
| `clearAllRecordings()` | `storage:clear-all` | |

### Transcription

| Method | Channel | Notes |
|--------|---------|-------|
| `getPaths()` | `transcription:get-paths` | `{ userData, modelCachePath }` |
| `startTranscription(id)` | `transcription:start` | Accepts `recorded/transcribed/done/error/transcribing/processing`; normalises to `recorded` |
| `getModelStatus(modelId)` | `transcription:model-status` | `{ present, sizeBytes }` |
| `deleteModel(modelId)` | `transcription:delete-model` | |
| `onTranscriptionStatus(cb)` | `transcription:status` (listen) | |

### LLM

| Method | Channel | Notes |
|--------|---------|-------|
| `processTranscript(id)` | `llm:process` | Produces title, summary, key decisions, participants, todos, journal; map-reduce for transcripts > 8000 chars |
| `testLlmConnection()` | `llm:test-connection` | |
| `onLlmProgress(cb)` | `llm:progress` (listen) | `{ meetingId, step, total, label }` |
| `onLlmDone(cb)` | `llm:done` (listen) | `{ meetingId }` |

### Settings & Notifications

| Method | Channel | Notes |
|--------|---------|-------|
| `getSettings()` | `settings:get` | Includes `llm.hasApiKey` flag |
| `saveSettings(partial)` | `settings:save` | `llmApiKey` → Keychain; rest → JSON |
| `testMirror(url)` | `hf:test-mirror` | `electron.net.fetch` HEAD (bypasses CSP) |
| `showNotification(t, b)` | `notify:show` | |
| `onNavigate(cb)` | `navigate` (listen) | Notification click routing |
| `onTrayCommand(cb)` | `tray:command` (listen) | `start \| stop \| screenshot` |
| `onToggleRecordingShortcut(cb)` | `shortcut:toggle-recording` (listen) | Global `⌘⇧R` |

---

## AppSettings Type (`src/main/lib/types.ts`)

```typescript
interface AppSettings {
  whisperModel: string       // e.g. 'onnx-community/whisper-large-v3-turbo'
  whisperLanguage: string    // e.g. 'english'
  hfEndpoint?: string        // HuggingFace mirror URL (no trailing slash stored)
  proxy?: ProxySettings      // none | system | auto_detect | manual | pac
  llm: {
    baseURL: string
    model: string            // e.g. 'gpt-4o'
    apiVersion?: string      // for Azure OpenAI
  }
}
```

---

## Whisper Worker (`src/renderer/src/workers/whisper.worker.ts`)

Messages IN (renderer → worker):
- `{ type: 'init', modelId, modelCachePath, hfEndpoint? }` — configure env + preload model
- `{ type: 'transcribe', pcmData: Float32Array, modelId, language }` — run transcription (PCM decoded in main thread before sending)
- `{ type: 'cancel' }` — set cancelled flag

Messages OUT (worker → renderer):
- `{ type: 'model_loading', progress }` — download progress 0–100
- `{ type: 'model_ready' }` — model fully loaded
- `{ type: 'chunk', text, start, end }` — incremental transcript chunk
- `{ type: 'done', text }` — full transcript text
- `{ type: 'error', message }` — any error

**Critical env flags:**
```typescript
env.allowLocalModels = false   // MUST be false — avoids Vite 404 HTML poisoning cache
env.allowRemoteModels = true
env.useBrowserCache = false
env.cacheKey = 'briefly-transformers-v2'
env.cacheDir = modelCachePath  // from main process getPaths()
env.remoteHost = 'https://hf-mirror.com/'  // trailing slash required
```

**PCM decoding happens in the renderer main thread** (not in the Worker) because `OfflineAudioContext` is unavailable inside Web Workers. The decoded `Float32Array` is transferred zero-copy into the worker via `postMessage(..., [pcmData.buffer])`.

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
})
// Usage:
const doSomething = useSetAtom(doSomethingAtom)
void doSomething(arg)
```

**Module-level refs (survive re-renders and navigation):**
```typescript
let workerRef: Worker | null = null       // outside the atom factory
let unsubLlmRef: (() => void) | null = null
let unsubDoneRef: (() => void) | null = null
```

**Derived atom with live overlay pattern (`liveMeetingsAtom`):**
```typescript
export const liveMeetingsAtom = atom((get) => {
  const list = get(meetingsAtom)        // DB data
  const txState = get(transcriptionAtom) // live in-memory state
  // overlay the active meeting's status with the live pipeline stage
})
```

---

## Search Index Architecture (`src/main/lib/db.ts`)

Briefly uses a **standalone FTS5 virtual table** (`search_index`) decoupled from the source table schema — no triggers, no `content=` content table coupling.

```sql
CREATE VIRTUAL TABLE search_index
USING fts5(meeting_id UNINDEXED, source UNINDEXED, content, tokenize='unicode61')
```

**Why standalone (not a content table):** allows the `transcripts` schema to evolve freely without breaking the FTS index. Triggers would need manual maintenance on every column rename.

**Write path — explicit app-level calls:**

| Call site | source value | Content written |
|---|---|---|
| `insertTranscript()` | `'transcript'` | Full Whisper transcript text |
| `insertSummary()` | `'summary'` | LLM summary paragraph |
| `insertSummary()` | `'decisions'` | Key decisions joined as plain text |
| `insertSummary()` | `'journal'` | Journal entry text |
| `resetMeetingForReprocessing()` | — | Deletes all rows for meeting |

Meeting titles are **not** stored in `search_index` — they are searched via `LIKE` on the `meetings` table directly and boosted to rank first (score −999 vs BM25 for content).

**Backfill:** `rebuildSearchIndex()` is called once in `getDb()` on first boot after migration. It is a no-op if `search_index` already has rows.

**Adding new content types:** call `indexForSearch(meetingId, 'newSource', text)` from the relevant write function — no migration or schema change needed.

---

## Recordings Search (renderer)

- `searchTermAtom` — current query string
- `isSearchingAtom` — true while IPC call is in flight
- `searchResultsAtom` — `Meeting[] | null` from last completed FTS call
- `runSearchAtom` — write atom: sets `isSearchingAtom`, calls `window.api.searchMeetings(query)`, stores results
- `filteredMeetingsAtom` — uses FTS results when available; falls back to title-only `.includes()` while in flight
- `MeetingList` `flat` prop — when `true`, renders results in array order (preserves BM25 rank) without date grouping; date shown inline per row

---

The transcription + LLM pipeline is designed to survive page navigation:

- `workerRef` and IPC unsub handles are **module-level** in `transcription.ts` — not tied to any React component
- `reset()` (from `resetTranscriptionAtom`) is the **only** thing that terminates the Worker — it is not called on unmount
- `startPipelineAtom` cancels and restarts cleanly if called while a pipeline is already running
- `liveMeetingsAtom` overlays the live stage onto the DB meeting list so Dashboard/Recordings show correct status without a DB round-trip

---

## UI/UX & Accessibility Conventions

### Design tokens (always use these — never raw Tailwind colour utilities)
| Token | Value | Usage |
|---|---|---|
| `--briefly-accent` | `oklch(0.78 0.16 60)` | Primary amber; maps to `--primary` in dark mode |
| `--briefly-accent-dim` | `oklch(0.65 0.13 60)` | Dimmed accent |
| `--briefly-record` | `oklch(0.62 0.22 25)` | Recording red; maps to `--destructive` |
| `--briefly-warning` | `oklch(0.78 0.18 75)` | Amber warning text |
| `--briefly-warning-bg` | `oklch(0.78 0.18 75 / 7%)` | Warning banner fill |
| `--briefly-warning-border` | `oklch(0.78 0.18 75 / 25%)` | Warning banner border |
| `--briefly-lightbox-bg` | `oklch(0.05 0.006 60 / 0.96)` | Lightbox overlay background |
| `--briefly-lightbox-fade` | `oklch(0.04 0.006 60 / 0.85)` | Lightbox HUD gradient start |

Use `text-[--briefly-warning]`, `bg-[--briefly-warning-bg]`, `border-[--briefly-warning-border]` etc.
Do **not** use `text-amber-400`, `bg-amber-500/[0.07]`, `text-green-500`, or inline `oklch()` style values.
Use `text-foreground/80` for "success" / "connected" states instead of `text-green-500`.

### Shared utilities
- **`lib/format.ts`** — `formatDuration(seconds: number | null): string` → `"2m 15s"` / `"45s"` / `"—"`
- **`lib/platform.ts`** — `isSupportedMacOSVersion(darwinVersion: string): boolean` — true for macOS 14.2+ (Darwin 23.2+)

### Shared components
- **`DeleteMeetingDialog`** — always use for destructive delete confirmation; never `window.confirm()`.
  ```tsx
  <DeleteMeetingDialog open={deleteOpen} onOpenChange={setDeleteOpen} onConfirm={handleDelete} />
  ```

### Accessibility patterns
- All icon-only buttons must have `aria-label`.
- Delete buttons use `aria-label={\`Delete ${meeting.title ?? 'recording'}\`}`.
- Toggle buttons use `aria-pressed={boolean}`.
- Collapsible sections: toggle button gets `aria-expanded` + `aria-controls="<id>"`, controlled region gets matching `id`.
- `<Label>` components must be linked to their input via `htmlFor` + `id` on the control.
- `<Select>` components: put `id` on `<SelectTrigger>`, not the `<Select>` wrapper.
- Checkboxes that are siblings of their label text should be wrapped in `<label>` for click-area association.
- Pipeline status text that updates dynamically: `<p aria-live="polite" aria-atomic="true">`.
- Full-screen overlays (lightbox): wrap content in `<FocusScope trapped loop asChild>` from `@radix-ui/react-focus-scope`.

### Date handling
- Always derive "today" from local calendar date: `new Date().getFullYear()` / `.getMonth()` / `.getDate()`. **Do not** use `new Date().toISOString().slice(0, 10)` — that returns UTC date and breaks in positive-offset timezones.

### Onboarding step components
Each step component (`LlmSetupStep`, `WhisperSetupStep`, `PermissionsStep`, `ReadyStep`) accepts `stepNumber: number` and `totalSteps: number` props. Pass them from `Onboarding.tsx` using the `TOTAL_STEPS` constant.

---

## Capture Session (`src/renderer/src/lib/capture-session.ts`)

`CaptureSession` runs in the renderer:
1. Calls `getDisplayMedia({ video: true, audio: true })` — main process intercepts via `setDisplayMediaRequestHandler` to inject the chosen source ID and `audio: 'loopback'`
2. Mixes system audio + optional microphone via Web Audio `AudioContext`
3. Feeds mixed output into `MediaRecorder` (WebM/Opus, 1s timeslice)
4. On each `dataavailable` chunk → `capture:write-chunk` IPC to main (appended to disk)
5. On stop → `capture:finalize` IPC → status `recorded` → pipeline auto-starts

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

Notification click routing: main fires `navigate` event → `AppShell.tsx` subscribes via `window.api.onNavigate` → calls React Router `navigate('/recordings/123')`.

---

## Build & Dev Commands

```bash
bun install          # install / update dependencies (always use bun, not npm install)
bun add <pkg>        # add a dependency
bun add -d <pkg>     # add a dev dependency

npm run dev          # start electron-vite dev server
npm run build        # typecheck + build
npm run typecheck    # must exit 0 before committing
npm run lint         # eslint
npm run rebuild      # rebuild native modules (better-sqlite3, keytar) against Electron ABI
```

Drizzle:
```bash
npx drizzle-kit generate  # generate migration from schema changes
npx drizzle-kit migrate   # apply migrations
```

