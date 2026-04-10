# Phase 1 — Core Infrastructure

> Objective: Audio capture works, files are saved, IPC is typed, SQLite stores meeting records. No transcription or LLM yet.

---

## 1.1 Swift CLI Binary (`briefly-capture`)

The highest-risk piece. Build and validate this as a standalone binary before wiring it into Electron.

### Responsibilities
- Capture system audio via **ScreenCaptureKit** (macOS 12.3+)
- Mix in microphone audio via **AVAudioEngine** inputNode tap
- Encode output as **Opus** (16kHz, mono) into a file
- Capture screenshots on demand via **SCScreenshotManager**
- List capturable windows as a one-shot JSON spawn

### Communication Protocol: NDJSON over stdin/stdout (LSP-style)

The binary runs as a **long-lived process** per recording session. Electron and the binary communicate by writing newline-delimited JSON messages to each other's stdin/stdout. This avoids polling, delivers real-time audio level data for the waveform, and handles errors mid-stream without any network surface.

#### Two binary modes

**Mode 1 — Session process** (one per recording, long-lived)
```bash
briefly-capture session
```
Stdin/stdout are the communication channel. The process exits when it receives a `stop_recording` command and finishes flushing the Opus file.

**Mode 2 — One-shot list** (short-lived)
```bash
briefly-capture list-windows
# → prints JSON array to stdout, exits
```

#### Message flow

```
Electron (Node)                          Swift CLI (session mode)
────────────────────────────────────────────────────────────────
spawn "briefly-capture session"
                                      ← { "type": "ready" }
→ { "cmd": "start_recording",
    "output": "/path/audio.opus",
    "mix_mic": true }
                                      ← { "type": "status", "state": "recording" }
                                      ← { "type": "level", "rms": 0.42 }  // ~10×/sec
                                      ← { "type": "level", "rms": 0.38 }
→ { "cmd": "take_screenshot",
    "output": "/path/frame.png" }
                                      ← { "type": "screenshot_done",
                                          "path": "/path/frame.png" }
→ { "cmd": "stop_recording" }
                                      ← { "type": "stopped",
                                          "duration_s": 183,
                                          "path": "/path/audio.opus" }
process exits
```

#### Message schemas

**Electron → CLI (commands)**
```typescript
{ cmd: 'start_recording'; output: string; mix_mic: boolean }
{ cmd: 'stop_recording' }
{ cmd: 'take_screenshot'; output: string }
```

**CLI → Electron (events)**
```typescript
{ type: 'ready' }
{ type: 'status';          state: 'recording' | 'stopping' }
{ type: 'level';           rms: number }           // 0.0–1.0, ~10×/sec
{ type: 'screenshot_done'; path: string }
{ type: 'stopped';         duration_s: number; path: string }
{ type: 'error';           message: string }
```

**`list-windows` stdout schema**
```json
[
  { "id": 12345, "title": "Microsoft Teams", "app": "com.microsoft.teams2" },
  { "id": 67890, "title": "Google Chrome",    "app": "com.google.Chrome" }
]
```

### Key Swift APIs
| Task | API |
|---|---|
| System audio capture | `SCStream` (ScreenCaptureKit) — `SCStreamConfiguration.capturesAudio = true` |
| Mic capture | `AVAudioEngine` tap on `inputNode` |
| Mixing | `AVAudioMixerNode` — merges SCStream PCM + mic PCM |
| Resampling | `AVAudioConverter` — 48kHz stereo → 16kHz mono |
| Opus encoding | `libopus` C library via Swift Package Manager (`swift-opus` or vendored) |
| Opus container | OggOpus framing written manually or via `libogg` |
| Screenshots | `SCScreenshotManager.captureImage(contentFilter:configuration:)` |
| Window listing | `SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true)` |
| NDJSON I/O | `FileHandle.standardInput` / `FileHandle.standardOutput`, line-buffered |

### Audio Capture Architecture

macOS userspace **cannot loopback system audio via Core Audio alone** — `AVAudioEngine` only reaches the microphone. ScreenCaptureKit is the only sandboxable path to what other apps are playing.

```
┌─────────────────────────────────────────────────────┐
│                Swift CLI process                     │
│                                                     │
│  ScreenCaptureKit SCStream                          │
│  (system audio — what you hear)                     │
│    └─ CMSampleBuffer (PCM Float32, 48kHz stereo)    │
│         └─ AVAudioConverter → 16kHz mono Float32 ──►┐│
│                                                     ││
│  AVAudioEngine inputNode tap                        ││
│  (microphone — your voice)                          ││
│    └─ AVAudioPCMBuffer (PCM Float32, 48kHz mono)    ││
│         └─ AVAudioConverter → 16kHz mono Float32 ──►││
│                                                     ││
│                              AVAudioMixerNode ◄─────┘│
│                                    │                 │
│                              libopus encoder          │
│                              (SILK, 16kHz, 32kbps)   │
│                                    │                 │
│                              OggOpus file writer      │
│                              → audio.opus             │
│                                                     │
│  RMS level computed per buffer → stdout NDJSON       │
└─────────────────────────────────────────────────────┘
```

### Opus Encoding Strategy
ScreenCaptureKit delivers PCM buffers via `stream(_:didOutputSampleBuffer:of:)`. Full pipeline:
```
SCStream CMSampleBuffer (Float32, 48kHz stereo)          AVAudioEngine mic tap
  → AVAudioConverter: 48kHz stereo → 16kHz mono Float32    → AVAudioConverter: → 16kHz mono
  ↘                                                       ↙
                   AVAudioMixerNode (sum)
                         ↓
              libopus encode frame (20ms, SILK mode, 32kbps)
                         ↓
              OggOpus container write → audio.opus
                         ↓
              Compute RMS per frame
                         ↓
              Emit { "type": "level", "rms": 0.42 } to stdout
```

### Entitlements Required (Info.plist / entitlements file)
```xml
<key>com.apple.security.screen-recording</key>  <!-- ScreenCaptureKit -->
<key>NSScreenCaptureUsageDescription</key>
<string>Briefly needs screen recording access to capture meeting audio.</string>
<key>NSMicrophoneUsageDescription</key>
<string>Briefly needs microphone access to capture your voice during meetings.</string>
```

### Project Layout — Swift Package

The capture binary lives in the same repo as the Electron app, under `capture/`:

```
capture/
├── Package.swift
└── Sources/
    └── BrieflyCapture/
        ├── main.swift               # routes: "session" | "list-windows"
        ├── SessionMode.swift         # NDJSON stdin/stdout event loop
        ├── AudioCapture.swift        # SCStream + AVAudioEngine + mixer
        ├── OpusEncoder.swift         # libopus wrapper, OggOpus framing
        └── ScreenshotCapture.swift    # SCScreenshotManager
```

Build script (in `package.json`):
```json
"build:capture": "cd capture && swift build -c release && cp .build/release/BrieflyCapture ../resources/briefly-capture"
```

`.gitignore` additions:
```
capture/.build/
resources/briefly-capture
```

### Deliverable
- `resources/briefly-capture` binary built from `capture/` via `npm run build:capture`
- Tested: run it in Terminal, produces a valid `.opus` file playable by VLC/ffplay
- Tested: `list-windows` returns parseable JSON

---

## 1.2 Electron IPC Layer

### electron-builder.yml — add missing entitlement
Add `NSScreenCaptureUsageDescription` to `electron-builder.yml` under `mac.extendInfo`.

### Preload — typed API surface (`src/preload/index.ts`)

Expose a typed `window.api` to the renderer:

```typescript
interface BrieflyAPI {
  // Capture
  startRecording: (opts: { mixMic: boolean }) => Promise<{ sessionId: string; audioPath: string }>
  stopRecording: (sessionId: string) => Promise<void>
  takeScreenshot: () => Promise<{ path: string }>
  listWindows: () => Promise<WindowInfo[]>

  // Storage
  getMeetings: () => Promise<Meeting[]>
  getMeeting: (id: number) => Promise<MeetingDetail | null>
  deleteMeeting: (id: number) => Promise<void>

  // Settings
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>

  // Events (renderer subscribes)
  onRecordingStatus: (cb: (status: RecordingStatus) => void) => () => void
}
```

Define full TypeScript types in `src/preload/index.d.ts`.

### Main Process IPC Handlers (`src/main/ipc/`)

**`capture.ts`** — handles `capture:start`, `capture:stop`, `capture:screenshot`, `capture:list-windows`
- `capture:list-windows` → one-shot spawn of `briefly-capture list-windows`, parse stdout JSON
- `capture:start` → creates `CaptureSession`, generates `sessionId` (UUID), sets audio path under `userData/recordings/<sessionId>/audio.opus`
- Routes all `CliEvent` messages from the session process to the renderer via `webContents.send('capture:event', msg)` — renderer receives `level`, `screenshot_done`, `stopped`, `error` events directly
- `capture:screenshot` → calls `session.takeScreenshot(screenshotPath)`
- `capture:stop` → calls `session.stopRecording()`, awaits `stopped` event, resolves promise with `{ duration_s, path }`

**`storage.ts`** — handles `storage:get-meetings`, `storage:get-meeting`, `storage:delete-meeting`
- Calls `db.ts` functions
- All synchronous SQLite calls stay in main process

**`settings.ts`** — handles `settings:get`, `settings:save`
- Non-sensitive settings stored as JSON in `app.getPath('userData')/settings.json`
- API keys stored/retrieved via keytar (macOS Keychain)

### Swift CLI Spawner (`src/main/lib/capture-cli.ts`)

```typescript
import { spawn, execFile } from 'child_process'
import { createInterface } from 'readline'

// Resolves binary path: resources/ in prod, src/../resources/ in dev
function getCaptureBinaryPath(): string

// One-shot spawn: list-windows → parse stdout JSON → exit
async function listWindows(): Promise<WindowInfo[]>

// Long-lived session process
class CaptureSession {
  private proc: ChildProcess
  private rl: Interface   // readline over proc.stdout

  constructor(onMessage: (msg: CliEvent) => void, onExit: (code: number) => void)

  // Sends NDJSON command to proc.stdin
  send(cmd: CliCommand): void

  // Convenience wrappers
  startRecording(output: string, mixMic: boolean): void
  stopRecording(): void
  takeScreenshot(output: string): void
}
```

Node-side reading:
```typescript
const proc = spawn(binaryPath, ['session'], { stdio: ['pipe', 'pipe', 'pipe'] })
const rl = createInterface({ input: proc.stdout! })
rl.on('line', (line) => {
  const msg: CliEvent = JSON.parse(line)
  onMessage(msg)
})
// Send commands:
proc.stdin!.write(JSON.stringify({ cmd: 'start_recording', output: audioPath, mix_mic: true }) + '\n')
```

---

## 1.3 File Management

All user data lives under `app.getPath('userData')` (macOS: `~/Library/Application Support/Briefly`):

```
~/Library/Application Support/Briefly/
├── recordings/
│   └── <sessionId>/
│       ├── audio.opus
│       └── screenshots/
│           ├── 001.png
│           └── 002.png
├── transcripts/          # optional: raw JSON cache
├── models/               # Whisper ONNX model cache (Phase 2)
│   └── whisper-large-v3-turbo/
└── briefly.db            # SQLite database
```

Recordings are never deleted automatically. User deletes via the app UI which removes both DB row and files.

---

## 1.4 SQLite Schema (`src/main/lib/db.ts`)

Use `better-sqlite3`. Rebuild for Electron ABI via `electron-rebuild`.

```sql
CREATE TABLE meetings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT    NOT NULL UNIQUE,
  title       TEXT,                          -- user editable, defaults to "Meeting – <date>"
  date        TEXT    NOT NULL,              -- ISO 8601
  duration_s  INTEGER,                       -- seconds, filled on stop
  audio_path  TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'recorded',
                                             -- recorded | transcribing | transcribed | processing | done | error
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE transcripts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id  INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  content     TEXT    NOT NULL,              -- full transcript text
  chunks      TEXT,                          -- JSON: [{start, end, text}]
  model       TEXT,                          -- e.g. "whisper-large-v3-turbo"
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE summaries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id   INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  summary      TEXT,
  todos        TEXT,                         -- JSON: [{text, owner, deadline, done}]
  journal      TEXT,
  llm_model    TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE screenshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id  INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  path        TEXT    NOT NULL,
  taken_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

Migrations: simple version table + sequential migration files. No ORM.

---

## 1.5 Dependencies to Install

```bash
# Main process (native — need electron-rebuild)
npm install better-sqlite3 keytar

# Main process (pure JS)
npm install uuid

# Dev
npm install --save-dev @types/better-sqlite3 @types/uuid electron-rebuild
```

Add to `package.json` scripts:
```json
"rebuild": "electron-rebuild -f -w better-sqlite3,keytar"
```

---

## Phase 1 Checklist

**Swift CLI**
- [ ] `capture/Package.swift` created, SwiftPM target `BrieflyCapture` configured
- [ ] `npm run build:capture` compiles and copies binary to `resources/briefly-capture`
- [ ] `briefly-capture list-windows` mode: prints JSON array to stdout and exits
- [ ] `start_recording` command: starts ScreenCaptureKit SCStream + AVAudioEngine mic tap
- [ ] Both streams mixed via AVAudioMixerNode, resampled to 16kHz mono
- [ ] libopus encoding → OggOpus container → `.opus` file
- [ ] `level` events emitted ~10×/sec with RMS value
- [ ] `stop_recording` command: flushes encoder, closes Ogg stream, emits `stopped`, exits cleanly
- [ ] `take_screenshot` command: captures via SCScreenshotManager, saves PNG, emits `screenshot_done`
- [ ] `error` events emitted on permission denial or stream drop
- [ ] Verified: `.opus` file plays in VLC/ffplay with correct audio

**Electron**
- [ ] `electron-builder.yml`: `NSScreenCaptureUsageDescription` added
- [ ] `better-sqlite3` + `keytar` installed and rebuilt against Electron ABI
- [ ] SQLite migrations run on app start, schema verified
- [ ] `capture-cli.ts`: `CaptureSession` class implemented, `listWindows()` one-shot spawn
- [ ] `capture-cli.ts`: binary path resolves correctly in both dev and prod
- [ ] IPC `capture:start` → spawns `CaptureSession`, creates DB row with status `recorded`
- [ ] IPC `capture:stop` → sends `stop_recording`, awaits `stopped` event, updates DB `duration_s`
- [ ] IPC `capture:screenshot` → sends `take_screenshot`, relays `screenshot_done` to renderer
- [ ] IPC `capture:list-windows` → calls `listWindows()`, returns array to renderer
- [ ] All `CliEvent` messages forwarded to renderer via `webContents.send('capture:event', msg)`
- [ ] IPC handlers: `storage:*` and `settings:*`
- [ ] Preload `window.api` typed, full `index.d.ts`
- [ ] Manual e2e test: UI button → IPC → Swift CLI NDJSON → `.opus` file on disk → DB row created
