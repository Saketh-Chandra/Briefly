# Changelog

All notable changes to Briefly are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Fixed
- **Journal forward navigation broken in non-UTC timezones** — `DateNavigator` and `Journal.tsx` were calling `Date.toISOString().slice(0, 10)` which returns the UTC date, not the local calendar date. In timezones ahead of UTC (UTC+1 through UTC+14) this caused the "next day" button to be permanently disabled one day too early. Both now derive the date from `getFullYear()`/`getMonth()`/`getDate()`.
- **Lightbox crash on screenshot open** — `Cannot read properties of null (reading 'naturalWidth')` occurred because `e.currentTarget` is nullified by React's synthetic event system before the `setImgDims` updater function ran. Fixed by capturing `naturalWidth`/`naturalHeight` into local variables before the state update call.

### Added
- **Shared `DeleteMeetingDialog` component** (`src/renderer/src/components/DeleteMeetingDialog.tsx`) — replaces all `window.confirm()` delete prompts across Dashboard, Recordings, and Transcript with a consistent modal dialog (title, description, Cancel + destructive Delete actions).
- **`lib/platform.ts`** — `isSupportedMacOSVersion(darwinVersion)` extracted from Dashboard and Onboarding into a shared utility to avoid duplication.
- **`lib/format.ts`** — `formatDuration(seconds)` extracted from MeetingCard and MeetingList into a shared utility.
- **Lightbox real screenshot dimensions** — the info panel now shows actual pixel dimensions read from `img.naturalWidth`/`naturalHeight` via an `onLoad` handler; displays `—` until the image loads instead of the previous hardcoded `3840 × 2160`.
- **Dashboard "View all" shortcut** — a "View all →" link appears in the Recent section header when the non-today meeting list is truncated at 5 items, navigating to `/recordings`.
- **Context-aware empty state in `MeetingList`** — accepts an `emptyMessage` prop; Recordings passes `"No results for "…""` during search and `"No recordings yet."` otherwise.
- **Design tokens for warning banners** — `--briefly-warning`, `--briefly-warning-bg`, and `--briefly-warning-border` CSS variables added to `main.css`. The amber OS-version warning banners in Dashboard and WelcomeStep now reference these tokens instead of hardcoded `amber-*` Tailwind classes.
- **Design tokens for lightbox overlay** — `--briefly-lightbox-bg` and `--briefly-lightbox-fade` CSS variables added to `main.css`; all three inline `oklch()` literals in the Transcript lightbox replaced with `var(--briefly-lightbox-*)`.

### Changed
- **Onboarding step labels driven by props** — `LlmSetupStep`, `WhisperSetupStep`, `PermissionsStep`, and `ReadyStep` now accept `stepNumber: number` and `totalSteps: number` props instead of hardcoded `"Step N of 5"` strings. `Onboarding.tsx` passes values derived from the existing `TOTAL_STEPS` constant.
- **Lightbox focus trap** — the screenshot lightbox portal is now wrapped in `@radix-ui/react-focus-scope` (`<FocusScope trapped loop>`) so keyboard focus cannot escape behind the overlay.
- **`PipelineStatus` stage label is a live region** — `aria-live="polite" aria-atomic="true"` added to the status `<p>` so screen readers announce stage transitions ("Transcribing audio…" → "Generating summary…").
- **`FilterBar` accessible selection state** — `aria-pressed` added to all filter pill buttons; focus ring (`focus-visible:ring-2 focus-visible:ring-ring`) added to each button.
- **`MeetingList` keyboard navigation** — each meeting row now has `role="button"`, `tabIndex={0}`, and an `onKeyDown` handler (Enter/Space) to activate via keyboard.
- **`TodoList` accessible checkboxes** — each list item's checkbox and label text are wrapped in a `<label>` element for correct screen reader association.
- **`DateNavigator` accessible buttons** — `aria-label="Previous day"` / `aria-label="Next day"` added to navigation arrows.
- **`SourcePicker` checkmark** — unicode `✓` replaced with `<Check size={12} />` Lucide icon in both the Screens and Windows source lists.
- **Settings `<Label>` linked to `<Select>`** — Whisper Model and Language selects now have matching `id` attributes on their `<SelectTrigger>` and `htmlFor` on their `<Label>`.
- **Settings Advanced section accessible** — the collapsible toggle gains `aria-controls="settings-advanced"`; the controlled `<div>` gains the matching `id`.
- **Transcript toolbar uniform size** — back button changed from `h-7 w-7` to `h-8 w-8`, matching all other toolbar icon buttons.
- **WhisperSetupStep progress bar height** — `h-1` → `h-1.5` to match the Settings download progress bar.
- **`text-green-500` replaced with design token** — "Connected" in `LlmFields` and "model ready" in `WhisperSetupStep` now use `text-foreground/80` instead of the raw Tailwind green.
- **Accessible names on delete/action buttons** — `aria-label="Delete <title>"` added to delete buttons in `MeetingCard`, `MeetingList`, and Transcript filmstrip/grid; `aria-label="Open transcript"` on `JournalEntryCard` ExternalLink button.
- **Transcript lightbox filmstrip and screenshot grid** — each thumbnail button carries `aria-label="View screenshot N of M"` (filmstrip) or `aria-label="Open screenshot N"` (grid).


  - Standalone `search_index` FTS5 virtual table (`meeting_id UNINDEXED, source UNINDEXED, content`) added via migration `0002_fts_transcripts.sql`. Decoupled from source table schema — no triggers, no `content=` coupling.
  - Four content types indexed per meeting: `transcript`, `summary`, `decisions`, `journal`. Meeting titles searched separately via `LIKE` on the `meetings` table and always ranked first (score −999).
  - `indexForSearch(meetingId, source, content)` and `deleteSearchIndex(meetingId)` helpers in `db.ts` write/remove rows explicitly at the call sites (`insertTranscript`, `insertSummary`, `resetMeetingForReprocessing`).
  - `rebuildSearchIndex()` backfills the index from existing data on first boot (runs once when the table is empty).
  - `searchMeetings(query)` in `db.ts` builds a safe per-word FTS5 prefix query (`"word"*`) and returns up to 50 `Meeting` rows ranked by BM25.
  - `storage:search` IPC handler; `window.api.searchMeetings(query)` exposed via `contextBridge`.
  - `runSearchAtom` and `isSearchingAtom` added to `atoms/pages.ts`; `filteredMeetingsAtom` uses FTS results when available, falls back to title-only filter while the IPC call is in flight.
  - `MeetingList` gains a `flat` prop — when active, renders results in relevance order without date grouping (date shown inline per row).
  - Result count line in `Recordings.tsx` (`"N results for 'query'"`); shows stale count with trailing `…` during re-search to avoid flicker.

### Added
- **Key decisions & participants display** — the Summary tab now shows two new sections below the summary prose: a **Participants** pill list and a **Key Decisions** bullet list. Both fields were already extracted by the LLM but were previously discarded.
  - `key_decisions` and `participants` columns added to the `summaries` DB table (migration `0001_grey_silver_surfer.sql`).
  - `insertSummary` and `getMeetingDetail` updated to persist and return both fields.
  - `MeetingDetail.summary` type extended with `key_decisions: string[] | null` and `participants: string[] | null`.
  - `SummaryPanel` component updated to render both sections.
  - Markdown export includes **Participants** and **Key Decisions** sections.
- **Import audio file** — "import an audio file" button on the Dashboard opens a native file picker (supports mp3, wav, m4a, aac, ogg, flac, webm, mp4). The chosen file is copied into the recordings directory and immediately enters the same transcription + LLM pipeline as a live recording.
- `capture:import-audio` IPC handler in the main process; `importAudioFile()` exposed via `contextBridge`.

---

### Added (previous unreleased)
- **First-run onboarding wizard** — full-screen Raycast-style setup flow shown to new users before the app shell renders:
  - Step 1 — Welcome: 88px Instrument Serif wordmark, tagline, staggered entrance animation, amber OS warning if macOS < 14.2
  - Step 2 — LLM Setup: shared `LlmFields` component with live connection test; skippable
  - Step 3 — Whisper Model: model selector with size labels, real-time download progress bar, cache check on mount, retry on error; skippable
  - Step 4 — Permissions: Screen Recording and Microphone rows with grant actions; "Open Settings" deep-links to macOS Privacy panel
  - Step 5 — Ready: config summary (LLM / model / permissions) with status icons
- Progress dots (bottom-left) animate with Motion spring; active dot widens; CTA button (bottom-right)
- `motion` package added for spring-based step transitions (`AnimatePresence` + `motion.div`)
- `onboardingComplete?: boolean` added to `AppSettings` — saved to `settings.json` on wizard completion
- `platform:os-info` IPC handler — returns `{ darwinVersion: string }` from `os.release()`
- `system:open-screen-recording-settings` IPC handler — calls `shell.openExternal` with hardcoded macOS privacy URL
- `getOsInfo()` and `openScreenRecordingSettings()` exposed via `contextBridge`
- **Re-run setup** option in Settings → Storage section — saves `onboardingComplete: false` then navigates to `/onboarding`
- **Pipeline error recovery**: `PipelineStatus` now shows which step failed ("Model loading failed" / "Transcription failed" / "Summary generation failed") and a **Retry** button that calls `handleRerun`
- `failedStage: TranscriptionStage | null` added to `TranscriptionState` — captured from `prev.stage` at the point of failure
- **Dashboard macOS version banner** — persistent amber warning shown if Darwin version < 23.2 (macOS 14.2), matching onboarding style
- **Shared `LlmFields` component** (`src/renderer/src/components/LlmFields.tsx`) extracted from `Settings.tsx`; used in both wizard and Settings page

### Changed
- `AppShell` now checks `onboardingComplete` on mount; redirects to `/onboarding` if not set
- `Settings.tsx` LLM section refactored to use shared `LlmFields` component
- `/onboarding` added as a top-level route outside `AppShell` (no sidebar / titlebar)

### Screenshot Gallery & Lightbox
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
