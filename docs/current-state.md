# Briefly — Current State & Pending Work

## What Has Been Built (all complete, typechecks pass)

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
- `allowLocalModels = false` — see "Root Cause" below
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

## Root Cause That Was Just Fixed

**Problem:** Model download stuck at 0% with "Unexpected token '<'..." JSON parse error.

**Root cause:** `env.allowLocalModels = true` (was the default). In a Vite dev server context, `localModelPath = '/models/'` resolves to `http://localhost:5174/models/onnx-community/.../config.json`. Vite returns its HTML 404 page. Transformers.js tried that **first** before the remote host. `JSON.parse` on the HTML body fails immediately — the fetch interceptor on `env.fetch` never even fires because the local path check happens before any network call.

**Fix applied:** `env.allowLocalModels = false` in the `case 'init':` block of `whisper.worker.ts`.

**Status:** Fix committed, `npm run typecheck` → 0 errors. **User has NOT yet confirmed download works.** This was the very last action before ending the previous chat.

---

## Pending: Validate Download Works

Ask the user to:
1. Quit the app fully (Cmd+Q, not just reload)
2. Open Settings → Whisper section
3. Select a model (Whisper Tiny is fastest to test, ~38 MB)
4. Click **Download Model**
5. Confirm the progress bar advances and completes

With `allowLocalModels = false` the fetch interceptor should now log:
```
[whisper-worker] fetch → https://hf-mirror.com/onnx-community/whisper-tiny/resolve/main/config.json
[whisper-worker] fetch ← 200 application/json
```
(or `huggingface.co` if no mirror is configured)

---

## Pending Cleanup: Remove Debug Logging

Once download is confirmed working, remove from `whisper.worker.ts`:

1. **The entire `env.fetch` interceptor block** (the `const underlying = ...` / `(env as any).fetch = async ...` block inside `case 'init':`)
2. The `console.log('[whisper-worker] env after init:', {...})` log
3. The `console.log('[whisper-worker] first file URL will be:', ...)` log
4. The `console.log('[whisper-worker] fetching:', progress.file)` line in `progress_callback`
5. The `console.error('[whisper-worker] loadModel raw error:', err)` line in `loadModel`
6. The `console.error('[whisper-worker] env.remoteHost at time of error:', ...)` line in `loadModel`

After cleanup, run `npm run typecheck` to confirm 0 errors.

---

## Files Modified in This Session (reference)

| File | Key Change |
|------|-----------|
| `src/renderer/src/atoms/transcription.ts` | Jotai pipeline atom; `msg.message` (not `msg.error`) |
| `src/renderer/src/atoms/pages.ts` | Meetings/journal list atoms |
| `src/renderer/src/workers/whisper.worker.ts` | `allowLocalModels=false`; `init` calls `loadModel`; debug logging |
| `src/renderer/src/pages/Settings.tsx` | Download UI, cancel, advanced HF mirror, test button, notifications |
| `src/renderer/src/contexts/TranscriptionContext.tsx` | Thin atom wrapper |
| `src/renderer/src/pages/Dashboard.tsx` | Uses `meetingsAtom` |
| `src/renderer/src/pages/Recordings.tsx` | Uses `filteredMeetingsAtom` etc. |
| `src/renderer/src/pages/Journal.tsx` | Uses `journalDateAtom` etc. |
| `src/renderer/src/components/layout/AppShell.tsx` | `onNavigate` subscription |
| `src/renderer/index.html` | CSP `connect-src https: blob:` |
| `src/renderer/src/assets/main.css` | Custom scrollbar |
| `src/main/lib/notifications.ts` | NEW — all Electron notification helpers |
| `src/main/lib/types.ts` | `hfEndpoint?: string` in `AppSettings` |
| `src/main/ipc/settings.ts` | `hf:test-mirror` handler |
| `src/main/ipc/capture.ts` | notification calls |
| `src/main/ipc/llm.ts` | notification calls |
| `src/main/index.ts` | `registerNotificationHandlers()` |
| `src/preload/index.ts` | `showNotification`, `testMirror`, `onNavigate` |
| `src/preload/index.d.ts` | Same three types |
