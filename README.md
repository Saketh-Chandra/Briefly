# Briefly

Briefly is a macOS desktop app that records meeting audio, transcribes it locally with Whisper, and generates summaries, to-dos, and journal entries using a configurable LLM endpoint — entirely on your machine, with no audio sent to any cloud service.

## Current Status

Under active development. The end-to-end pipeline is working:

- System audio + microphone capture via Electron `desktopCapturer` and the Web Audio API
- Renderer UI: Dashboard, Recordings, Transcript, Journal, and Settings pages
- Local Whisper model download and transcription in a Web Worker (runs in the background — safe to navigate away)
- OpenAI-compatible LLM processing for titles, summaries, to-dos, and journal entries
- SQLite-backed meeting storage, Electron notifications, macOS menu bar tray
- Keyboard shortcut (`⌘⇧R`) and deep link (`briefly://`) support
- Re-run pipeline from any finished or errored state

For the latest implementation snapshot see [docs/current-state.md](docs/current-state.md).

---

## What Briefly Does

1. Records system audio (and optionally microphone) for the current screen or a chosen window.
2. Saves audio locally as WebM/Opus chunks streamed to disk in real time.
3. Downloads and caches a Whisper ONNX model locally on first use.
4. Transcribes the recording locally in a Web Worker — no audio leaves the machine.
5. Calls a user-configured OpenAI-compatible LLM endpoint to produce a title, summary, to-do list, and journal entry.
6. Presents all meetings, transcripts, and the daily journal in the desktop UI.
7. Supports re-running the full pipeline (transcription + LLM) on any past recording.

---

## Tech Stack

| Area | Technology |
| --- | --- |
| Desktop shell | Electron 35 + electron-vite |
| Renderer | React 19 + TypeScript |
| State management | Jotai |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Audio capture | `desktopCapturer` + Web Audio API + `MediaRecorder` (WebM/Opus) |
| Local transcription | `@huggingface/transformers` in a Web Worker |
| Storage | SQLite + `better-sqlite3` + Drizzle ORM |
| Secrets | macOS Keychain via `keytar` |
| Proxy support | Electron `session` proxy via configurable settings |
| Code hygiene | ESLint + Knip |

---

## Platform Notes

- **macOS 14.2 (Sonoma) or later** is required for loopback audio capture (CoreAudio Tap). The app will launch on earlier versions but system audio capture will not work.
- Apple Silicon is strongly preferred for good Whisper ONNX performance.
- Windows support is partially implemented — the UI and pipeline work, but loopback audio uses WASAPI and has not been extensively tested.
- Linux is not currently supported.

---

## Prerequisites

- macOS 14.2+
- Node.js 20+
- [Bun](https://bun.sh) (used for installing and managing dependencies)
- Screen Recording and Microphone permissions granted to the app

> **No Xcode or native toolchain is needed.** The capture pipeline is implemented entirely in Electron/Web APIs — there is no Swift binary.

---

## Getting Started

### Install dependencies

```bash
bun install
```

### Run in development

```bash
npm run dev
```

### Type-check

```bash
npm run typecheck
```

### Lint

```bash
npm run lint
```

### Audit unused files

```bash
bunx knip --include files
```

Knip is configured in [knip.jsonc](knip.jsonc) with explicit Electron-Vite entrypoints:
[electron.vite.config.ts](electron.vite.config.ts), [src/main/index.ts](src/main/index.ts),
[src/preload/index.ts](src/preload/index.ts), and [src/renderer/src/main.tsx](src/renderer/src/main.tsx).
That keeps the unused-file report focused on real unreachable code instead of framework-owned wiring.
Ambient declaration files [src/preload/index.d.ts](src/preload/index.d.ts) and
[src/renderer/src/env.d.ts](src/renderer/src/env.d.ts) are excluded from the `unused files`
report only.

### Build the app

```bash
npm run build
```

### Package for distribution

```bash
npm run build:mac     # macOS .dmg / .app
npm run build:win     # Windows NSIS installer
npm run build:linux   # Linux AppImage
```

### Rebuild native modules (after Electron version bump)

```bash
npm run rebuild
```

---

## First-Run Flow

1. Launch the app.
2. Open **Settings**.
3. Under **LLM**, enter your OpenAI-compatible base URL, model name, and API key.
4. Under **Whisper**, choose a model (Whisper Tiny is fastest, ~38 MB) and click **Download Model**.
5. Wait for the download to complete.
6. Return to the Dashboard and click **Record** (or press `⌘⇧R`).
7. When you stop recording, the transcription + LLM pipeline starts automatically.
8. You can navigate to other pages while processing — the pipeline runs in the background.

---

## Keyboard Shortcuts & Deep Links

### Keyboard Shortcut

| Shortcut | Action |
| --- | --- |
| `⌘⇧R` | Toggle recording start / stop |

### Deep Links

`briefly://` is registered as a URL scheme on first launch. You can trigger actions from Raycast, Alfred, a terminal, or any URL launcher:

| URL | Action |
| --- | --- |
| `briefly://record/start` | Start recording |
| `briefly://record/stop` | Stop recording |
| `briefly://record/screenshot` | Take a screenshot |
| `briefly://app/open` | Show and focus the window |

---

## IPC Channel Reference

All channels are invoked via `window.api.*` from the renderer (typed in `src/preload/index.d.ts`).

### Capture

| `window.api` method | IPC channel | Description |
| --- | --- | --- |
| `getSources()` | `capture:get-sources` | List available screen/window sources |
| `checkPermissions()` | `capture:check-permissions` | Returns `{ screen, mic }` permission states |
| `requestMicPermission()` | `capture:request-mic-permission` | Prompt for microphone access |
| `startRecording(opts)` | `capture:start` | Create session + DB row, store pending source ID |
| `writeAudioChunk(id, buf)` | `capture:write-chunk` | Append WebM chunk to disk |
| `finalizeRecording(id, dur)` | `capture:finalize` | Close session, update duration + status |
| `takeScreenshot()` | `capture:screenshot-save` | Save high-res screenshot for the active session |
| `onCaptureEvent(cb)` | BroadcastChannel | Real-time recording events (no IPC round-trip) |

### Storage

| `window.api` method | IPC channel | Description |
| --- | --- | --- |
| `getMeetings()` | `storage:get-meetings` | All meetings |
| `getMeeting(id)` | `storage:get-meeting` | Single meeting with transcript + summary |
| `getMeetingsByDate(date)` | `storage:get-meetings-by-date` | Meetings for a given ISO date |
| `deleteMeeting(id)` | `storage:delete-meeting` | Delete meeting + audio file |
| `saveTranscript(params)` | `storage:save-transcript` | Persist Whisper output, set status `transcribed` |
| `getTranscript(id)` | `storage:get-transcript` | Fetch transcript for a meeting |
| `resetForReprocessing(id)` | `storage:reset-for-reprocessing` | Delete transcript + summary, reset to `recorded` |
| `updateTodo(id, idx, done)` | `storage:update-todo` | Toggle a to-do item |
| `updateJournal(id, text)` | `storage:update-journal` | Edit the journal entry |
| `getDiskUsage()` | `storage:disk-usage` | Audio bytes + userData path |
| `readAudio(path)` | `storage:read-audio` | Read audio file as ArrayBuffer |
| `revealInFinder()` | `storage:reveal-in-finder` | Open userData in Finder |
| `clearAllRecordings()` | `storage:clear-all` | Delete all meetings and audio files |

### Transcription

| `window.api` method | IPC channel | Description |
| --- | --- | --- |
| `getPaths()` | `transcription:get-paths` | `{ userData, modelCachePath }` |
| `startTranscription(id)` | `transcription:start` | Validate meeting + audio, set status `transcribing` |
| `getModelStatus(modelId)` | `transcription:model-status` | `{ present, sizeBytes }` |
| `deleteModel(modelId)` | `transcription:delete-model` | Remove cached model files |
| `onTranscriptionStatus(cb)` | `transcription:status` (listen) | Status push events from main |

### LLM

| `window.api` method | IPC channel | Description |
| --- | --- | --- |
| `processTranscript(id)` | `llm:process` | Run summary + todos + journal pipeline |
| `testLlmConnection()` | `llm:test-connection` | Ping the configured LLM endpoint |
| `onLlmProgress(cb)` | `llm:progress` (listen) | Step events `{ meetingId, step, label }` |
| `onLlmDone(cb)` | `llm:done` (listen) | Completion event `{ meetingId }` |

### Settings & Notifications

| `window.api` method | IPC channel | Description |
| --- | --- | --- |
| `getSettings()` | `settings:get` | Returns `AppSettings` + `llm.hasApiKey` flag |
| `saveSettings(partial)` | `settings:save` | Persists settings; `llmApiKey` goes to Keychain |
| `testMirror(url)` | `hf:test-mirror` | HEAD request to HF mirror via `electron.net` |
| `showNotification(t, b)` | `notify:show` | Trigger an Electron system notification |
| `onNavigate(cb)` | `navigate` (listen) | Notification click → React Router navigation |
| `onTrayCommand(cb)` | `tray:command` (listen) | Menu bar tray action |
| `onToggleRecordingShortcut(cb)` | `shortcut:toggle-recording` (listen) | Global `⌘⇧R` shortcut |

---

## Project Structure

```
knip.jsonc           Knip config with explicit Electron-Vite entrypoints
drizzle/              SQL migrations and Drizzle metadata
docs/                 Architecture docs, plans, and current-state snapshot
resources/            Bundled assets (app icon, entitlements)
src/
  main/               Electron main process
    ipc/              IPC handler modules (capture, storage, transcription, llm, settings)
    lib/              DB, schema, settings, LLM client, keychain, tray, notifications, proxy
    index.ts          Entry: window creation, deep links, tray, global shortcut
  preload/
    index.ts          contextBridge implementation (window.api.*)
    index.d.ts        TypeScript types for window.api
  renderer/
    index.html        Entry HTML + CSP meta tag
    src/
      atoms/          Jotai atoms (transcription pipeline, meetings, journal)
      components/     UI components (shadcn/ui + custom)
      contexts/       React context wrappers
      lib/            Capture session, utilities
      pages/          Dashboard, Recordings, Transcript, Journal, Settings
      workers/        whisper.worker.ts — model download + transcription
```

---

## Architecture Overview

```
Renderer (React)
  CaptureSession (Web Audio + MediaRecorder)
    → IPC → Main: capture:write-chunk   (1s WebM/Opus chunks streamed to disk)
    → IPC → Main: capture:finalize      (status → 'recorded')

  startPipelineAtom (Jotai — module-level Worker, survives navigation)
    → IPC → Main: transcription:start   (validate meeting + audio)
    → whisper.worker.ts: load ONNX model → transcribe PCM → chunks
    → IPC → Main: storage:save-transcript  (status → 'transcribed')
    → IPC → Main: llm:process           (title + summary + todos + journal)
    → IPC → Main: storage:insert-summary   (status → 'done')

  liveMeetingsAtom (derived — overlays live pipeline stage on DB data)
    → Dashboard + Recordings always show correct in-flight status
```

---

## Documentation

- [docs/current-state.md](docs/current-state.md) — latest implementation snapshot and pending work
- [docs/context.md](docs/context.md) — full architecture and codebase reference
- [docs/plans/README.md](docs/plans/README.md) — phased implementation plan

---

## Contributing

1. Fork the repo and create a feature branch.
2. Install dependencies with `bun install`.
3. Run `npm run typecheck`, `npm run lint`, and `bunx knip --include files` before opening a PR.
4. Keep PRs focused; one concern per PR.
5. API keys and audio files are never committed — check `.gitignore` before staging.

---

## License

BSD 3-Clause License. See [LICENSE](LICENSE).

