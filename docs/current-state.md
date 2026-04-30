# Briefly — Current State & Pending Work

## What Has Been Built (all complete, typechecks pass)

### First-Run Onboarding Wizard (latest session)

Full-screen, Raycast-style setup wizard shown to new users before the app shell renders. Completion writes `onboardingComplete: true` to `settings.json`; the wizard never appears again unless re-triggered from Settings.

**Architecture:**
- `/onboarding` route is a top-level route outside `AppShell` — no sidebar, no TitleBar, pure canvas
- `AppShell` checks `onboardingComplete` on mount; redirects to `/onboarding` if absent
- Spring-based step transitions via `motion` package (`AnimatePresence` + `motion.div`, `x: ±44`)
- Animated progress dots bottom-left (active dot widens with Motion spring); CTA button bottom-right
- macOS version check on mount via new `platform:os-info` IPC (`os.release()` → Darwin version string); Darwin < 23.2 = macOS < 14.2

**Steps:**
1. **Welcome** — 88px Instrument Serif wordmark with staggered entrance; amber OS warning if macOS < 14.2
2. **LLM Setup** — shared `LlmFields` component (Base URL, Model, API Key, Azure API Version) with live connection test; skippable
3. **Whisper Model** — model selector (Tiny / Base / Large v3 Turbo) with size labels; download with real-time progress bar; checks browser cache on mount; retry on error; skippable
4. **Permissions** — Screen Recording and Microphone rows; "Open Settings" calls `system:open-screen-recording-settings` IPC → `shell.openExternal` (hardcoded macOS Privacy URL); "Grant" calls `requestMicPermission()`
5. **Ready** — config summary with status icons (✓ / ○ / ⚠) for LLM, model, and both permissions

**New IPC handlers (`src/main/ipc/settings.ts`):**
- `platform:os-info` → `{ darwinVersion: string }`
- `system:open-screen-recording-settings` → `shell.openExternal` (safe fixed URL)

**Preload additions:**
- `getOsInfo(): Promise<{ darwinVersion: string }>`
- `openScreenRecordingSettings(): Promise<void>`

**Settings: Re-run Setup**
- New row in Settings → Storage section
- Saves `onboardingComplete: false` then navigates to `/onboarding`

**Shared `LlmFields` component**
- Extracted from `Settings.tsx` into `src/renderer/src/components/LlmFields.tsx`
- `Settings.tsx` LLM section now uses it; `LlmSetupStep` in the wizard also uses it
- Props: `baseURL`, `apiKey`, `model`, `apiVersion`, change handlers, optional `onSave`, `showSave` flag

### Pipeline Error Recovery (latest session)

- `failedStage: TranscriptionStage | null` added to `TranscriptionState` — captured from `prev.stage` in the catch block
- `PipelineStatus` now maps `failedStage` to a specific label: "Model loading failed" / "Transcription failed" / "Summary generation failed" (instead of the previous generic error message)
- **Retry button** added to the error state in `PipelineStatus` — calls `onRetry` prop; wired to `handleRerun` in `Transcript.tsx`

### Dashboard macOS Version Banner (latest session)

- On Dashboard mount, calls `getOsInfo()` and checks Darwin version
- If < 23.2 (macOS 14.2), shows a persistent amber banner: *"System audio capture requires macOS 14.2 Sonoma or later. You can still record microphone-only audio."*
- Same style as the onboarding Welcome screen warning

---

### Screenshot UI & Lightbox
- **Transcript Page Tab**: A new "Screenshots" tab displays high-res previews (`3840×2160` PNG) with lazy-loading and aspect-video framing.
- **Lightbox**: Developed a full-screen, `createPortal`-based overlay using a dark-glass macOS aesthetic.
- **Frameless Window Handlers**: Applied `[-webkit-app-region:drag]` and `[-webkit-app-region:no-drag]` for native frame dragging in the lightbox overlay, accounting for macOS traffic light placement.
- **Image Info Panel**: A slide-in, blur-backed HUD displaying image dimensions, capture time, and estimated size.
- **Native OS Clipboard**: Replaced browser-level `navigator.clipboard` with an IPC bridge using `electron`'s `clipboard.writeImage(nativeImage.createFromDataURL(...))` to bypass security restrictions.
- **Direct Downloads**: Added download buttons mapping to automatically named files.

### Background Pipeline & Re-run Fixes

Six bugs in the transcription/re-run flow were identified and fixed:

**DB layer (`src/main/lib/db.ts`)**
- `resetMeetingForReprocessing` now deletes the `transcripts` row (not just `summaries`) and sets status to `'recorded'` (was incorrectly setting `'transcribed'`, causing the guard to immediately throw)
- `insertTranscript` is now idempotent — deletes any existing transcript row for the meeting before inserting, preventing duplicate rows accumulating across re-runs

**IPC layer (`src/main/ipc/transcription.ts`)**
- `transcription:start` guard loosened: accepts `recorded`, `transcribed`, `done`, `error`, `transcribing`, `processing` states; normalises to `'recorded'` internally so downstream status transitions stay consistent (was throwing for any state other than `'recorded'`)

**Renderer atom (`src/renderer/src/atoms/transcription.ts`)**
- `startPipelineAtom` no longer returns early when stage is not `'idle'` — it now does a clean cancel-and-restart (terminates Worker, clears IPC listeners) before starting
- Module-level `unsubLlmRef` / `unsubDoneRef` refs added so `resetTranscriptionAtom` always cleans up stale IPC callbacks, preventing ghost listeners across re-runs

**Pages atom (`src/renderer/src/atoms/pages.ts`)**
- `liveMeetingsAtom` added — derived atom that overlays the live `transcriptionAtom` stage onto the matching meeting in `meetingsAtom`, so Dashboard and Recordings always show the correct in-flight status without a DB round-trip
- `filteredMeetingsAtom` now derives from `liveMeetingsAtom` instead of `meetingsAtom`

**Dashboard (`src/renderer/src/pages/Dashboard.tsx`)**
- Now reads from `liveMeetingsAtom` instead of `meetingsAtom`

**Transcript page (`src/renderer/src/pages/Transcript.tsx`)**
- `reset()` removed from component unmount cleanup — pipeline (Worker + IPC listeners) now survives navigation between pages
- `handleRerun` now calls `reset()` first (clean atom state) and works from `error` state too (previously blocked by `if (!meeting?.transcript) return`)
- Re-run button now visible whenever `!isPipelineActive && status !== 'recording' && status !== 'recorded'` (covers `transcribed`, `done`, `error`) instead of only when `meeting.transcript` exists

**Net result:** Transcription and LLM processing run fully in the background. User can navigate to Dashboard, Recordings, or Journal while the pipeline runs; status badges update live. Returning to the Transcript page re-attaches to the running pipeline immediately.

---
### desktopCapturer Migration (Swift CLI → Electron)
- Swift CLI (`capture/`) and `resources/briefly-capture` binary removed entirely
- `src/main/ipc/capture.ts` — all new IPC handlers:
  - `capture:get-sources` — lists screens/windows via `desktopCapturer`, filters out Briefly's own windows
  - `capture:check-permissions` / `capture:request-mic-permission` — macOS `systemPreferences` wrappers
  - `capture:start` — stores `pendingSourceId` for `setDisplayMediaRequestHandler`, creates session dir + DB row
  - `capture:write-chunk` — appends 1-second WebM/Opus chunks to disk (path constructed server-side)
  - `capture:finalize` — updates DB duration/status after `MediaRecorder.onstop`
  - `capture:screenshot-save` — high-res `getSources` thumbnail written as PNG
- `src/main/index.ts` — `setDisplayMediaRequestHandler` registered with `claimPendingSourceId()` pattern; `audio: 'loopback'` → CoreAudio Tap on macOS 14.2+ / WASAPI on Windows
- `src/renderer/src/lib/capture-session.ts` — new renderer-side `CaptureSession` class: `getDisplayMedia` + Web Audio mixing + `MediaRecorder` (1 s timeslice, WebM/Opus) + BroadcastChannel events
- `src/main/lib/types.ts` — `CaptureEvent` (renamed from `CliEvent`, deprecated alias kept), `CaptureSource` type
- `electron-builder.yml` — `NSAudioCaptureUsageDescription` added; `asarUnpack` narrowed to `drizzle/**` only
- `package.json` — `build:capture` script removed

### macOS Menu Bar Tray
- `src/main/lib/tray.ts` — `Tray` with dynamic context menu: idle shows "Start Recording"; active shows "● Recording…", "Stop Recording", "Take Screenshot"; "Show Briefly" and "Quit" always present
- `updateTrayState(recording, getWindow)` called from `capture:start` and `capture:finalize` to keep menu in sync with recording state
- Icon: falls back to resized app icon; ready for `tray-idleTemplate.png` / `tray-recordingTemplate.png` swap once branding assets exist
- Tray commands sent to renderer via `tray:command` IPC channel, handled in `AppShell.tsx`

### Deep Links (`briefly://`)
- `app.setAsDefaultProtocolClient('briefly')` registered before `app.whenReady()`
- `app.on('open-url', ...)` — macOS handler (URL opened while app is running)
- `app.requestSingleInstanceLock()` + `app.on('second-instance', ...)` — Windows handler + prevents duplicate instances
- `handleDeepLink(url)` — parses URL, shows window, forwards to renderer via `tray:command`
- `electron-builder.yml` — `protocols: [{name: Briefly, schemes: [briefly]}]` under `mac:`
- Supported URLs:
  - `briefly://record/start` — start recording
  - `briefly://record/stop` — stop recording
  - `briefly://record/screenshot` — take a screenshot
  - `briefly://app/open` — show the window
- Deep link actions go through the same `AppShell.tsx` state guards as tray/keyboard shortcut paths


### Jotai Migration
- `src/renderer/src/atoms/transcription.ts` — full transcription pipeline state + `startPipelineAtom`, `resetTranscriptionAtom`
- `src/renderer/src/atoms/pages.ts` — meetings list, search/filter, journal date atoms
- `src/renderer/src/contexts/TranscriptionContext.tsx` — thin wrapper around atoms (no more `useReducer`)
- Dashboard, Recordings, Journal pages updated to consume atoms

### Settings Page (`src/renderer/src/pages/Settings.tsx`)
- Download Model button with progress bar (`dlState`, `dlProgress`)
- Cancel download button (terminates Web Worker mid-download)
- Advanced Settings collapsible section with HF Mirror URL field (`hfEndpoint`)
- Mirror URL save: strips trailing slash before persisting; worker adds it back
- **Test Mirror** button — calls `window.api.testMirror(url)` → IPC `hf:test-mirror` → `electron.net.fetch` HEAD in main process (bypasses renderer CSP)
- Download notifications via `window.api.showNotification(title, body)` on success, failure, and cancel

### Electron Notifications
- `src/main/lib/notifications.ts` — `notifyRecordingSaved`, `notifySummaryReady`, `notifyError`, `registerNotificationHandlers`
- `notify:show` IPC channel for renderer-initiated notifications
- Wired into `src/main/ipc/capture.ts` and `src/main/ipc/llm.ts`
- `window.api.onNavigate` + `useNavigate` in AppShell for notification click routing

### Whisper Worker (`src/renderer/src/workers/whisper.worker.ts`)
- `allowLocalModels = false` — prevents Vite dev server HTML 404 pages from being parsed as JSON (confirmed fix)
- `useBrowserCache = false`, `cacheKey = 'briefly-transformers-v2'`
- Trailing-slash enforcement on `env.remoteHost`
- `init` message now calls `await loadModel(msg.modelId)` directly (not just env setup)
- Progress: `Math.round((loaded/total)*100)` not raw bytes
- `model_ready` emitted after load, `model_loading` progress during download
- Debug fetch interceptor still in place (see Pending Cleanup below)

### Preload (`src/preload/index.ts` + `src/preload/index.d.ts`)
- `showNotification(title, body)` — fires `notify:show`
- `testMirror(url)` — fires `hf:test-mirror`
- `onNavigate(cb)` — listens for `navigate` from main

### CSP (`src/renderer/index.html`)
- `connect-src 'self' https: blob:` added for worker HTTPS + WASM blob: fetches

---

## Files Modified in This Session (reference)

| File | Key Change |
|------|-----------|
| `src/main/lib/types.ts` | `onboardingComplete?: boolean` added to `AppSettings` |
| `src/main/ipc/settings.ts` | `platform:os-info` + `system:open-screen-recording-settings` IPC handlers |
| `src/preload/index.ts` | Expose `getOsInfo()`, `openScreenRecordingSettings()` |
| `src/preload/index.d.ts` | Type declarations for new preload methods |
| `src/renderer/src/App.tsx` | `/onboarding` top-level route added outside `AppShell` |
| `src/renderer/src/components/layout/AppShell.tsx` | On-mount check → redirect to `/onboarding` if `!onboardingComplete` |
| `src/renderer/src/pages/Onboarding.tsx` | NEW — wizard container (step state, spring transitions, completion handler) |
| `src/renderer/src/components/LlmFields.tsx` | NEW — shared LLM config fields component |
| `src/renderer/src/components/onboarding/WelcomeStep.tsx` | NEW — Step 1 |
| `src/renderer/src/components/onboarding/LlmSetupStep.tsx` | NEW — Step 2 |
| `src/renderer/src/components/onboarding/WhisperSetupStep.tsx` | NEW — Step 3 |
| `src/renderer/src/components/onboarding/PermissionsStep.tsx` | NEW — Step 4 |
| `src/renderer/src/components/onboarding/ReadyStep.tsx` | NEW — Step 5 |
| `src/renderer/src/pages/Settings.tsx` | LLM section → `LlmFields`; Re-run Setup row added to Storage section |
| `src/renderer/src/atoms/transcription.ts` | `failedStage` field added to `TranscriptionState` |
| `src/renderer/src/components/PipelineStatus.tsx` | Per-step error label + Retry button |
| `src/renderer/src/pages/Transcript.tsx` | Pass `failedStage` + `onRetry` to `PipelineStatus` |
| `src/renderer/src/pages/Dashboard.tsx` | macOS version banner via `getOsInfo()` on mount |
| `docs/plans/first-run-ux.md` | NEW — full implementation plan with checklist (all items complete) |
| `package.json` | `motion` added as dependency |
| `src/renderer/src/workers/whisper.worker.ts` | Removed debug fetch interceptor + all debug `console.log/error` calls |

---

## Files Modified in Previous Session (reference)

| File | Key Change |
|------|-----------|
| `src/main/lib/types.ts` | `onboardingComplete?: boolean` added to `AppSettings` |
| `src/main/ipc/settings.ts` | `platform:os-info` + `system:open-screen-recording-settings` IPC handlers |
| `src/preload/index.ts` | Expose `getOsInfo()`, `openScreenRecordingSettings()` |
| `src/preload/index.d.ts` | Type declarations for new preload methods |
| `src/renderer/src/App.tsx` | `/onboarding` top-level route added outside `AppShell` |
| `src/renderer/src/components/layout/AppShell.tsx` | On-mount check → redirect to `/onboarding` if `!onboardingComplete` |
| `src/renderer/src/pages/Onboarding.tsx` | NEW — wizard container (step state, spring transitions, completion handler) |
| `src/renderer/src/components/LlmFields.tsx` | NEW — shared LLM config fields component |
| `src/renderer/src/components/onboarding/WelcomeStep.tsx` | NEW — Step 1 |
| `src/renderer/src/components/onboarding/LlmSetupStep.tsx` | NEW — Step 2 |
| `src/renderer/src/components/onboarding/WhisperSetupStep.tsx` | NEW — Step 3 |
| `src/renderer/src/components/onboarding/PermissionsStep.tsx` | NEW — Step 4 |
| `src/renderer/src/components/onboarding/ReadyStep.tsx` | NEW — Step 5 |
| `src/renderer/src/pages/Settings.tsx` | LLM section → `LlmFields`; Re-run Setup row added to Storage section |
| `src/renderer/src/atoms/transcription.ts` | `failedStage` field added to `TranscriptionState` |
| `src/renderer/src/components/PipelineStatus.tsx` | Per-step error label + Retry button |
| `src/renderer/src/pages/Transcript.tsx` | Pass `failedStage` + `onRetry` to `PipelineStatus` |
| `src/renderer/src/pages/Dashboard.tsx` | macOS version banner via `getOsInfo()` on mount |
| `src/renderer/src/workers/whisper.worker.ts` | `allowLocalModels = false` fix (confirmed working) |
| `docs/plans/first-run-ux.md` | NEW — full implementation plan with checklist (all items complete) |
| `package.json` | `motion` added as dependency |
