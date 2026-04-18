# Migration Plan: Swift CLI → Electron desktopCapturer

**Goal:** Replace the `capture/` Swift package (ScreenCaptureKit + ffmpeg) with
Electron's `desktopCapturer` + Web Audio + `MediaRecorder`. Target: macOS 13+ and
Windows 10+.

---

## Confirmed Decisions (from planning session)

| Question | Decision |
|---|---|
| Electron version | **39.2** — all required APIs are available, no upgrade needed. CoreAudio Tap is the default since v39.0.0-beta.4. |
| Node version | **v22.14 LTS** — no change needed |
| Migration strategy | **Clean cutover** — Swift CLI removed in this PR, not kept as a fallback |
| Windows support | **Design for it now, test later** — no Windows-specific code paths needed; `desktopCapturer` handles it automatically |
| Screenshots | **`getSources` thumbnail** at up to 4K — simpler, no canvas frame grab |
| Source selection | **User picker** — list screens + windows via `desktopCapturer.getSources`; user selects before recording starts. Chosen `sourceId` is passed to `setDisplayMediaRequestHandler`. |
| Old recordings | **Delete all dev data** — clear DB rows and `recordings/` directory. No DB migration or re-encoding needed. |
| ffmpeg | **Only inside the Swift CLI** — not bundled in `resources/`, not referenced in any Node/TS file. Removed with the CLI. |

---

## Why this migration

| Concern | Swift CLI (current) | desktopCapturer |
|---|---|---|
| Cross-platform | macOS only | macOS + Windows |
| Build dependency | Xcode + Swift toolchain | None |
| Runtime dependency | ffmpeg binary bundled in resources | None |
| Packaging | Pre-built `briefly-capture` binary must be asar-unpacked | N/A |
| Permission model | ScreenCaptureKit entitlements | Electron/Chromium handles |
| IPC complexity | stdin/stdout NDJSON subprocess | Direct renderer ↔ main IPC |

---

## Platform Support Matrix

| Feature | macOS 13+ | macOS 14.2+ | Windows 10+ |
|---|---|---|---|
| System audio | ✅ `getDisplayMedia` | ✅ CoreAudio Tap (new default) | ✅ WASAPI loopback |
| Microphone | ✅ `getUserMedia` | ✅ | ✅ |
| Screen recording permission | Required (`Screen Recording` in Privacy) | Required | Auto (no prompt on Win 10+) |
| Audio permission | `NSMicrophoneUsageDescription` | + `NSAudioCaptureUsageDescription` | Not required |
| macOS ≤12.7.6 | ⚠️ System audio unavailable (no kernel ext) | N/A | N/A |

**Decision:** Minimum supported macOS = 13 (Ventura). Document system-audio as
unavailable on older macOS (mic-only fallback).

---

## Architecture Before / After

### Before
```
Renderer → IPC → Main → spawn(briefly-capture) ──NDJSON──▶ Main → IPC → Renderer
                                                  ◀──stdin──
           audio.opus written by Swift + ffmpeg
```

### After
```
Renderer (MediaRecorder) ──chunk IPC──▶ Main (write to disk)
         ↑
         desktopCapturer sourceId (from Main via IPC)
         getDisplayMedia (system audio + video track for screenshots)
         getUserMedia    (microphone)
         Web Audio mix
         MediaRecorder → WebM/Opus chunks
```

---

## Phases

### Phase 0 — Pre-flight Cleanup

**No functional code changes — run these before writing any capture code.**

- [ ] Delete all dev recordings: `rm -rf ~/Library/Application\ Support/Briefly/recordings/`
- [ ] Clear the DB: delete `~/Library/Application\ Support/Briefly/briefly.db` (or
  run `DELETE FROM meetings; DELETE FROM screenshots; DELETE FROM transcripts; DELETE FROM summaries;`)
- [ ] Update `package.json` `description` / README to state minimum macOS = 13 (Ventura)
- [ ] Confirm `audio_path` column accepts `.webm` extension (it's free-form text — confirmed ✅)

---

### Phase 1 — Main Process: Permissions & Media Source IPC

**Files changed:** `src/main/index.ts`, `src/main/ipc/capture.ts`,
`electron-builder.yml`

#### 1.1 Register `setDisplayMediaRequestHandler`

In `src/main/index.ts`, inside `app.whenReady()`, before `createWindow()`. The
handler receives the `sourceId` chosen by the user (passed from the renderer via
`capture:start`) and selects the matching source:

```ts
import { session, desktopCapturer } from 'electron'

// Holds the sourceId chosen by the renderer just before calling getDisplayMedia
let pendingSourceId: string | null = null
export function setPendingSourceId(id: string) { pendingSourceId = id }

session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
  desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
    .then((sources) => {
      const chosen = pendingSourceId
        ? sources.find(s => s.id === pendingSourceId) ?? sources[0]
        : sources[0]       // fallback: primary screen
      pendingSourceId = null
      callback({ video: chosen, audio: 'loopback' })
    })
})
```

On macOS 14.2+ Electron 39 uses CoreAudio Tap by default — `'loopback'` triggers it.
On Windows 10+ it uses WASAPI loopback.
On macOS 13 it uses the older `Screen & System Audio Recording` permission.

> **Why `pendingSourceId` pattern?** `setDisplayMediaRequestHandler` does not
> receive the `chromeMediaSourceId` constraint set by the renderer — it only
> receives the raw request. Storing the chosen ID server-side for one round-trip
> is the standard Electron pattern for this.

#### 1.2 New IPC: `capture:get-sources`

Returns all capturable screens and windows so the UI can render a picker before
recording starts. Includes small thumbnails (160×90) so the renderer can show
previews:

```ts
import { desktopCapturer } from 'electron'

ipcMain.handle('capture:get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 160, height: 90 },  // preview thumbnails for the picker UI
    fetchWindowIcons: true
  })
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    display_id: s.display_id,
    thumbnail: s.thumbnail.toDataURL(),   // base64 PNG, safe to pass over IPC
    appIcon: s.appIcon?.toDataURL() ?? null
  }))
})
```

The renderer calls this when the recording screen is shown to populate the source
picker. The user selects a source; its `id` is stored and passed to `capture:start`.

#### 1.3 New IPC: `capture:check-permissions`

```ts
import { systemPreferences } from 'electron'

ipcMain.handle('capture:check-permissions', async () => {
  if (process.platform === 'darwin') {
    const screen = systemPreferences.getMediaAccessStatus('screen')
    const mic    = systemPreferences.getMediaAccessStatus('microphone')
    return { screen, mic }
  }
  // Windows — no runtime permission required for screen/system audio
  return { screen: 'granted', mic: 'granted' }
})

ipcMain.handle('capture:request-mic-permission', async () => {
  if (process.platform === 'darwin') {
    return systemPreferences.askForMediaAccess('microphone')
  }
  return true
})
```

#### 1.4 Update `electron-builder.yml`

Add `NSAudioCaptureUsageDescription` for macOS 14.2+:

```yaml
mac:
  extendInfo:
    - NSMicrophoneUsageDescription: Briefly needs microphone access to capture your voice during meetings.
    - NSScreenCaptureUsageDescription: Briefly needs screen recording access to capture meeting audio.
    - NSAudioCaptureUsageDescription: Briefly needs audio capture access to record system audio during meetings.
```

---

### Phase 2 — New IPC: Audio Chunk & Finalize

The renderer will produce `Blob` chunks from `MediaRecorder`. These must be written
to disk by the main process (renderer cannot write arbitrary paths).

**File:** `src/main/ipc/capture.ts` — add two new handlers (keep existing ones
during transition).

#### 2.1 `capture:write-chunk`

```ts
import { writeFileSync, appendFileSync } from 'fs'

ipcMain.handle('capture:write-chunk', async (_event, sessionId: string, chunkBuffer: ArrayBuffer) => {
  if (activeSessionId !== sessionId) return
  const filePath = join(app.getPath('userData'), 'recordings', sessionId, 'audio.webm')
  appendFileSync(filePath, Buffer.from(chunkBuffer))
})
```

> **Security note:** Validate `sessionId` is the active session before writing.
> The path is constructed server-side — never accept a path from the renderer directly.

#### 2.2 `capture:finalize`

```ts
ipcMain.handle('capture:finalize', async (_event, sessionId: string, durationS: number) => {
  if (activeMeetingId === null) return
  updateMeetingDuration(activeMeetingId, durationS)
  updateMeetingStatus(activeMeetingId, 'recorded')
  notifyRecordingSaved(activeMeetingId)
  activeSession = null
  activeMeetingId = null
  activeSessionId = null
  updateTrayState(false, _getWindow)
})
```

#### 2.3 Update `capture:start`

Add `sourceId` to the options and store it as the pending source for the
`setDisplayMediaRequestHandler`:

```ts
// capture:start now accepts sourceId
ipcMain.handle('capture:start', async (_event, opts: { mixMic: boolean; sourceId: string }) => {
  // ...
  setPendingSourceId(opts.sourceId)   // stored before renderer calls getDisplayMedia
  const audioPath = join(sessionDir, 'audio.webm')  // .opus → .webm
  // ... rest unchanged
})
```

No DB schema migration needed — `audio_path` is a plain text column.

---

### Phase 3 — Renderer: `CaptureSession` class

**New file:** `src/renderer/src/lib/capture-session.ts`

This class replaces `CaptureSession` in `capture-cli.ts` entirely. It runs in the
renderer process.

```
CaptureSession(sessionId, sourceId, opts)
  ├── getDisplayMedia({ audio: true, video: { chromeMediaSource: 'desktop',
  │                     chromeMediaSourceId: sourceId } })
  │     ← system audio + video track for the chosen window/screen
  ├── getUserMedia({ audio: true, video: false })         ← microphone (if mixMic)
  ├── AudioContext
  │     ├── MediaStreamSource (system audio track)
  │     ├── MediaStreamSource (mic)           ← only if mixMic
  │     ├── AnalyserNode                      ← RMS level metering
  │     └── MediaStreamDestination            ← mixed output stream
  ├── MediaRecorder(mixedStream, { mimeType: 'video/webm;codecs=opus' })
  │     └── ondataavailable → IPC capture:write-chunk
  └── events: 'level', 'status', 'stopped', 'error'
```

> **Note on `chromeMediaSourceId`:** Even though `setDisplayMediaRequestHandler`
> ignores `constraints`, setting `chromeMediaSourceId` in the renderer's
> `getUserMedia` constraints is not used here — `getDisplayMedia` is used instead,
> and the source is resolved server-side via `pendingSourceId`.

Key decisions:
- `mimeType = 'video/webm;codecs=opus'` — both Chrome/Electron on macOS and Windows
  support this; check with `MediaRecorder.isTypeSupported()` at runtime, fall back
  to `'video/webm'`.
- `timeslice = 1000` ms on `start()` — writes a chunk every second, keeps memory use low.
- Keep the video track alive during recording (needed for on-demand screenshots in
  Phase 4); do not add it to the MediaRecorder.
- RMS metering: use `AnalyserNode.getFloatTimeDomainData()` on a 50 ms `setInterval`.

#### Event surface (mirrors existing `CliEvent` shape for zero renderer changes)

```ts
export type CaptureEvent =
  | { type: 'ready' }
  | { type: 'status'; state: 'recording' | 'stopping' }
  | { type: 'level'; rms: number }
  | { type: 'screenshot_done'; path: string }
  | { type: 'stopped'; duration_s: number; path: string }
  | { type: 'error'; message: string }
```

**This is the same union as `CliEvent` in `types.ts`** — rename `CliEvent` →
`CaptureEvent` in types.ts (or alias) so existing renderer consumers need no changes.

---

### Phase 4 — Renderer: Screenshots

The Swift CLI used ScreenCaptureKit for full-resolution screenshots. The replacement
approach uses the video track captured by `getDisplayMedia`.

#### Option A — Canvas frame grab (recommended, zero extra permissions)

In `CaptureSession.takeScreenshot()`:
1. Create an off-screen `<video>` element, set `srcObject` to the display stream's
   video track.
2. When `loadedmetadata` fires, draw to a `<canvas>` at native resolution.
3. `canvas.toBlob('image/png')` → `ArrayBuffer` → IPC `capture:screenshot-data`.
4. Main writes PNG to disk and calls `insertScreenshot`.

#### Option B — `getSources()` thumbnail (simpler, lower res)

In main, call:
```ts
desktopCapturer.getSources({
  types: ['screen'],
  thumbnailSize: { width: 3840, height: 2160 }
})
```
This is synchronous to the main process; returns a `NativeImage`. Main writes
`thumbnail.toPNG()` to disk directly — no IPC data transfer needed.

**Recommendation:** Start with Option B (less code), upgrade to Option A if users
need pixel-perfect screenshots.

#### New IPC: `capture:screenshot-save`

```ts
ipcMain.handle('capture:screenshot-save', async (_event, sessionId: string) => {
  // Option B: getSources snapshot
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 3840, height: 2160 }
  })
  const png = sources[0]?.thumbnail.toPNG()
  if (!png || !activeMeetingId || !activeSessionId) return
  screenshotCounter++
  const paddedNum = String(screenshotCounter).padStart(3, '0')
  const screenshotPath = join(
    app.getPath('userData'), 'recordings', activeSessionId, 'screenshots', `${paddedNum}.png`
  )
  writeFileSync(screenshotPath, png)
  insertScreenshot(activeMeetingId, screenshotPath)
  return screenshotPath
})
```

The existing `capture:screenshot` IPC can delegate to this after migration.

---

### Phase 5 — Preload & Types

**Files:** `src/preload/index.ts`, `src/preload/index.d.ts`, `src/main/lib/types.ts`

#### 5.1 Replace `listWindows` with `getSources`

```ts
// preload/index.ts
getSources: (): Promise<{
  id: string
  name: string
  display_id: string
  thumbnail: string      // base64 data URL for picker preview
  appIcon: string | null
}[]> => ipcRenderer.invoke('capture:get-sources'),
```

Remove `listWindows` entirely (clean cutover — no deprecated alias needed).

#### 5.2 Add permission helpers

```ts
checkPermissions: (): Promise<{ screen: string; mic: string }> =>
  ipcRenderer.invoke('capture:check-permissions'),

requestMicPermission: (): Promise<boolean> =>
  ipcRenderer.invoke('capture:request-mic-permission'),
```

#### 5.3 Add chunk writer & finalize

```ts
writeAudioChunk: (sessionId: string, chunk: ArrayBuffer): Promise<void> =>
  ipcRenderer.invoke('capture:write-chunk', sessionId, chunk),

finalizeRecording: (sessionId: string, durationS: number): Promise<void> =>
  ipcRenderer.invoke('capture:finalize', sessionId, durationS),
```

#### 5.4 Rename `CliEvent` → `CaptureEvent` in `types.ts`

Remove the `CliCommand` type (no longer needed). Remove `WindowInfo` or update it
to the new source shape.

---

### Phase 6 — Wire Renderer Capture into Existing UI

The UI components (`Dashboard`, recording controls) currently subscribe to
`window.api.onCaptureEvent`. This pattern is preserved — the renderer's
`CaptureSession` instance emits events that are forwarded through the same IPC
channel, so no UI component changes are needed if the event shape stays identical.

Update `capture:start` to:
1. User selects a source from the picker → renderer has `sourceId`
2. Renderer calls `capture:start({ mixMic, sourceId })` → main stores `pendingSourceId`, creates session dir + DB row
3. Renderer receives `{ sessionId, meetingId, audioPath }`, creates `new CaptureSession(sessionId, sourceId, opts)`
4. `CaptureSession` calls `getDisplayMedia` — `setDisplayMediaRequestHandler` fires, picks the stored source
5. `CaptureSession` calls `window.api.writeAudioChunk` on each MediaRecorder chunk
6. On `stop`, calls `window.api.finalizeRecording(sessionId, duration)`

The `capture:event` push channel from main can then be removed or kept as a
passthrough if needed.

---

### Phase 7 — DB Migration for Existing Records

Existing rows in `meetings` have `audio_path` ending in `.opus`. These files were
encoded by ffmpeg into Ogg-Opus format. The new format is `.webm`.

**Old recordings are unaffected** — they still play back fine and transcription
reads the file path from the DB. No SQL migration is needed; the path column is
free-form text.

Add a new Drizzle migration (`drizzle/`) only if you want to re-encode old files
(not recommended — the files are already transcribed).

---

### Phase 8 — Cleanup (part of this PR — clean cutover)

Execute as the final step of the same PR after full end-to-end testing.

- [ ] Delete `capture/` Swift package directory
- [ ] Delete `resources/briefly-capture` pre-built binary
- [ ] Delete `src/main/lib/capture-cli.ts`
- [ ] **No ffmpeg to remove** — it was only called by the Swift process as a system command; it was never bundled
- [ ] Remove `asarUnpack: resources/**` or narrow it (only `drizzle/**` remains)
- [ ] Remove `CliCommand` type from `types.ts`; rename `CliEvent` → `CaptureEvent`
- [ ] Remove `capture:list-windows` IPC handler and `listWindows` from preload
- [ ] Remove `WindowInfo` type (replaced by source shape from `desktopCapturer`)
- [ ] Run `npm run typecheck` → 0 errors
- [ ] Run `npm run build` and smoke test on macOS (13 + 14) before tagging

---

## Implementation Order (recommended)

```
Phase 0  →  Phase 1  →  Phase 2  →  Phase 3
                                         ↓
                          Phase 5  ←  Phase 4
                              ↓
                          Phase 6
                              ↓
                   (verify on macOS 13 + 14.2)
                              ↓
                          Phase 7 + 8 (clean cutover complete)
                              ↓
                   (Windows validation — when available)
```

All phases are in a single PR (clean cutover). No Swift CLI shim is kept.

---

## Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| macOS 14.2 silent audio failure (missing `NSAudioCaptureUsageDescription`) | High if key missing | Phase 1.4 adds it; test on 14.2 explicitly |
| Windows WASAPI loopback unavailable in some configs | Low | Detect via `ondataavailable` byte count; warn user |
| `video/webm;codecs=opus` not supported | Very low (Electron 39 = Chromium 130+) | Runtime check + fallback to `video/webm` |
| macOS 12 users lose system audio | Medium | Show a banner: "System audio capture requires macOS 13+" |
| Large audio chunks blocking IPC | Low | 1 s timeslice; Opus 64 kbps ≈ 8 KB/chunk |
| Windows validation deferred | Accepted | Architecture is correct; validate when machine is available |
