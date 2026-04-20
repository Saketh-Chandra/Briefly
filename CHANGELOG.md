# Changelog

All notable changes to Briefly are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- **Screenshot Gallery & Lightbox**: 
  - Added new "Screenshots" tab in the Transcript view for captured meeting screen grabs.
  - Implemented a full-screen, native-feeling image lightbox with thumbnail filmstrip.
  - Added keyboard shortcuts for navigating screenshots (Left/Right/Escape).
  - Info panel with resolution, capture timestamp, and estimated file size.
  - One-click copy raw image data directly to macOS clipboard.
  - Direct download button for high-res PNGs.

### Changed
- `README.md` and `docs/context.md` fully rewritten to reflect current architecture (no Swift binary, macOS 14.2+ requirement, `bun` for dependencies, `npm` for scripts)

---

## [0.3.0] — 2026-04-18

**Background pipeline, re-run fixes, deep link support & single-instance lock**

### Fixed
- `resetMeetingForReprocessing` was setting meeting status to `'transcribed'` instead of `'recorded'`, causing `transcription:start` to throw immediately on re-run
- `resetMeetingForReprocessing` was not deleting the `transcripts` row — old transcript rows accumulated across re-runs; LLM step would read the stale first row
- `transcription:start` IPC guard was throwing for any status other than `'recorded'`, blocking re-transcription of already-processed meetings
- `startPipelineAtom` returned early if stage was not `'idle'`, silently preventing re-run when atom was in `'done'` state without navigating away
- Navigating away from the Transcript page unmounted the component and called `reset()`, terminating the Whisper Worker mid-pipeline
- Re-run button was hidden when `meeting.transcript` was null, blocking re-run from `'error'` state

### Added
- `liveMeetingsAtom` — derived Jotai atom that overlays the live pipeline stage onto the DB meetings list; Dashboard and Recordings show correct in-flight status without a DB round-trip
- Module-level `unsubLlmRef` / `unsubDoneRef` — IPC listeners are now cleaned up on reset, preventing stale ghost callbacks across pipeline runs
- `startPipelineAtom` performs a clean cancel-and-restart when called while a pipeline is already running
- `filteredMeetingsAtom` now derives from `liveMeetingsAtom` so Recordings status badges stay live during processing
- `briefly://` deep link protocol registered via `app.setAsDefaultProtocolClient`
  - `briefly://record/start` — start recording
  - `briefly://record/stop` — stop recording
  - `briefly://record/screenshot` — take a screenshot
  - `briefly://app/open` — show and focus the window
- `app.on('open-url', ...)` handler for macOS (URL opened while app is running)
- `app.requestSingleInstanceLock()` + `app.on('second-instance', ...)` for Windows deep link arrival and duplicate-instance prevention
- `electron-builder.yml` — `protocols` entry for `briefly://` under `mac:`
- `NSAudioCaptureUsageDescription` added to `electron-builder.yml` entitlements

### Changed
- `insertTranscript` is now idempotent — deletes any existing transcript row before inserting
- `transcription:start` guard now accepts `recorded`, `transcribed`, `done`, `error`, `transcribing`, `processing` and normalises to `'recorded'` internally
- `handleRerun` calls `reset()` first for a clean atom state, and no longer guards on `meeting.transcript` existence
- Re-run button visible for any non-active, non-initial state (`transcribed`, `done`, `error`)
- Pipeline (Whisper Worker + IPC listeners) survives navigation — `reset()` no longer called on Transcript page unmount

---

## [0.2.0] — 2026-04-18

**macOS menu bar tray**

### Added
- `src/main/lib/tray.ts` — `Tray` with dynamic context menu
  - Idle: "Start Recording"
  - Active: "● Recording…", "Stop Recording", "Take Screenshot"
  - Always: "Show Briefly", "Quit"
- `updateTrayState(recording, getWindow)` called from `capture:start` and `capture:finalize` to keep tray menu in sync with recording state
- Tray commands forwarded to renderer via `tray:command` IPC channel
- `onTrayCommand` subscription added to preload and `AppShell.tsx`
- `window.close` → `hide` on macOS (app stays alive in background); `forceQuit` flag for Cmd+Q

---

## [0.1.1] — 2026-04-18

**desktopCapturer migration — Swift CLI removed**

### Added
- `src/renderer/src/lib/capture-session.ts` — `CaptureSession` class: `getDisplayMedia` + Web Audio mixing + `MediaRecorder` (1s timeslice, WebM/Opus) + BroadcastChannel events
- `src/renderer/src/components/SourcePicker.tsx` — screen/window source picker UI
- `src/main/ipc/capture.ts` — full IPC handler suite:
  - `capture:get-sources` — lists screens/windows, filters out Briefly's own windows
  - `capture:check-permissions` / `capture:request-mic-permission` — macOS permission wrappers
  - `capture:start` — stores `pendingSourceId`, creates session dir + DB row
  - `capture:write-chunk` — appends 1-second WebM/Opus chunks to disk
  - `capture:finalize` — updates DB duration/status to `recorded`
  - `capture:screenshot-save` — high-res screenshot saved as PNG
- `setDisplayMediaRequestHandler` in `src/main/index.ts` with `claimPendingSourceId()` pattern; `audio: 'loopback'` for CoreAudio Tap (macOS 14.2+) / WASAPI (Windows)
- Migration plan documented at `docs/plans/migration-desktop-capturer.md`

### Removed
- Swift capture package (`capture/`) and compiled binary (`resources/briefly-capture`)
- `src/main/lib/capture-cli.ts` — Swift binary spawn helper
- `build:capture` npm script

### Changed
- `electron-builder.yml` — `asarUnpack` narrowed to `drizzle/**` only (no native binary)
- Updated app icon assets (higher resolution)

---

## [0.1.0] — 2026-04-11

**Initial working release — full end-to-end pipeline**

### Added

**Core infrastructure**
- Electron + electron-vite project scaffold (React 19, TypeScript, Tailwind CSS v4, shadcn/ui)
- SQLite database via `better-sqlite3` + Drizzle ORM; schema: `meetings`, `transcripts`, `summaries`, `screenshots`
- `resetStuckMeetings()` on startup — recovers meetings interrupted by crash or force-quit
- `src/main/lib/keychain.ts` — LLM API key stored in macOS Keychain via `keytar`
- `src/main/lib/proxy.ts` — configurable Electron session proxy (none / system / manual / PAC)
- Electron notifications: `notifyRecordingSaved`, `notifySummaryReady`, `notifyError`; `notify:show` IPC for renderer-initiated notifications
- Notification click routing: main fires `navigate` event → `AppShell.tsx` → React Router

**Capture pipeline (Swift CLI — later replaced in v0.1.1)**
- Swift package (`capture/`) using ScreenCaptureKit + AVFoundation + libopus via ffmpeg
- `src/main/lib/capture-cli.ts` — spawn and manage the Swift binary
- IPC handlers: `capture:start`, `capture:stop`, `capture:screenshot`

**Transcription pipeline**
- `src/renderer/src/workers/whisper.worker.ts` — `@huggingface/transformers` Web Worker
  - `init` message: configure env, preload ONNX model with progress reporting
  - `transcribe` message: PCM → incremental `chunk` events → `done`
  - `env.allowLocalModels = false` — prevents Vite dev-server HTML poisoning the model cache
  - `env.useBrowserCache = false`, `cacheKey = 'briefly-transformers-v2'`
- `src/main/ipc/transcription.ts` — `transcription:start`, `transcription:model-status`, `transcription:delete-model`
- `src/renderer/src/atoms/transcription.ts` — Jotai `startPipelineAtom` managing the full model-load → transcribe → LLM flow; `resetTranscriptionAtom`
- PCM decoding runs in renderer main thread (`OfflineAudioContext`); `Float32Array` transferred zero-copy to worker

**LLM processing**
- `src/main/lib/llm-client.ts` — OpenAI-compatible chat completion client with map-reduce for long transcripts (> 8000 chars)
- `src/main/ipc/llm.ts` — `llm:process`: title + summary + to-dos + journal; incremental `llm:progress` events; `llm:done` on completion
- `llm:test-connection` IPC for settings validation

**UI pages & components**
- Dashboard — today's meetings, record CTA, recent list
- Recordings — all meetings with full-text search and status filter
- Transcript — tabbed view: Transcript (live streaming chunks), Summary, To-Dos, Journal; export to Markdown; delete confirmation
- Journal — daily journal grouped by date with `DateNavigator`
- Settings — LLM config (base URL, model, API key, Azure API version), Whisper model management (download with progress, cancel, delete), HuggingFace mirror URL, proxy configuration, disk usage, storage management
- `PipelineStatus` component — progress bar across downloading-model, transcribing, processing-llm stages
- `StatusBadge`, `AudioWaveform`, `MeetingCard`, `FilterBar`, `SearchBar`, `TodoList`, `JournalPanel`, `SummaryPanel`, `TranscriptViewer`

**Global shortcut**
- `⌘⇧R` registered via `globalShortcut` → `shortcut:toggle-recording` IPC → renderer recording toggle

**Developer tooling**
- `bun.lock` — Bun lockfile (use `bun install` / `bun add`)
- ESLint, Prettier, TypeScript strict mode (`typecheck:node` + `typecheck:web`)
- `drizzle-kit` for schema migrations
- `dev-app-update.yml` for auto-updater testing

---

[Unreleased]: https://github.com/Saketh-Chandra/Briefly/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Saketh-Chandra/Briefly/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Saketh-Chandra/Briefly/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/Saketh-Chandra/Briefly/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Saketh-Chandra/Briefly/releases/tag/v0.1.0
