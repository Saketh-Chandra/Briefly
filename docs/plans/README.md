# Briefly — Project Plan

**Briefly** is a macOS desktop app (Electron + Vite + React + TypeScript) that records meeting audio, transcribes it locally using Whisper via WebGPU, and generates summaries, to-dos, and a daily journal using LLMs.

---

## Tech Stack

| Layer | Technology |
|---|---|
| App shell | Electron 39+ |
| Build tooling | electron-vite |
| Renderer | React 19 + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Audio capture | Swift CLI — `capture/` (ScreenCaptureKit + AVAudioEngine) |
| Transcription | Transformers.js v3 + Whisper WebGPU (ONNX) |
| LLM | OpenAI-compatible API (Azure OpenAI / local) |
| Storage | SQLite via better-sqlite3 + Drizzle ORM (main process) |
| Migrations | drizzle-kit — schema-based, auto-applied at startup |
| IPC | Electron contextBridge typed API |
| API keys | macOS Keychain via keytar |
| Package manager | Bun |

---

## Architecture Overview

```
Electron App
├── Main Process (Node.js)
│   ├── IPC handlers (record, transcribe, summarize, storage, settings)
│   ├── Spawns Swift CLI   → audio capture (Opus) + screenshots
│   ├── Drizzle ORM        → all DB reads/writes (schema in schema.ts)
│   ├── keytar             → macOS Keychain for API keys
│   └── LLM HTTP client    → OpenAI-compatible POST calls
│
├── Preload
│   └── contextBridge      → typed window.api surface
│
└── Renderer Process (React)
    ├── Pages: Dashboard, Recording, Transcript, Journal, Settings
    ├── shadcn/ui components
    └── Web Worker
        └── whisper.worker.ts
            └── Transformers.js v3 + WebGPU
                Chromium AudioContext decodes Opus → PCM → Whisper
```

---

## Build Phases

| Phase | Description | Status |
|---|---|---|
| [Phase 1](./phase-1-core-infrastructure.md) | Core infrastructure: Swift CLI, IPC layer, file management, SQLite | ✅ Complete |
| [Phase 2](./phase-2-processing-pipeline.md) | Processing pipeline: Whisper transcription, LLM post-processing | Planning |
| [Phase 3](./phase-3-ui.md) | UI: all screens, navigation, settings, journal | Planning |

---

## Project Structure (Current)

```
capture/                           # Swift Package — same repo, not a submodule
├── Package.swift
└── Sources/
    └── BrieflyCapture/
        ├── main.swift             # entry point: routes to session or list-windows
        ├── SessionMode.swift      # NDJSON stdin/stdout loop
        ├── AudioCapture.swift     # ScreenCaptureKit + AVAudioEngine mix
        ├── OpusEncoder.swift      # raw PCM → Opus via opusenc/ffmpeg CLI
        ├── ScreenshotCapture.swift # SCScreenshotManager (macOS 14+) / screencapture fallback
        └── ListWindows.swift      # enumerate on-screen windows as JSON

drizzle/                           # Auto-generated SQL migration files (drizzle-kit generate)
├── 0000_*.sql                     # initial schema migration
└── meta/                          # drizzle migration metadata

src/
├── main/
│   ├── index.ts               # app bootstrap, BrowserWindow, IPC registration
│   ├── ipc/
│   │   ├── capture.ts         # record/stop/screenshot IPC handlers
│   │   ├── storage.ts         # meeting CRUD IPC handlers
│   │   └── settings.ts        # settings + keychain IPC handlers
│   └── lib/
│       ├── types.ts           # all shared TypeScript types
│       ├── schema.ts          # Drizzle table definitions (source of truth)
│       ├── db.ts              # Drizzle singleton + migrate() on startup
│       ├── capture-cli.ts     # CaptureSession class + listWindows()
│       ├── keychain.ts        # keytar wrapper
│       └── settings.ts        # JSON settings file read/write
│
├── preload/
│   ├── index.ts               # contextBridge bindings
│   └── index.d.ts             # typed window.api surface declaration
│
└── renderer/src/              # Phase 3 — not yet implemented
    ├── App.tsx
    ├── pages/
    │   ├── Dashboard.tsx
    │   ├── Recording.tsx
    │   ├── Transcript.tsx
    │   ├── Journal.tsx
    │   └── Settings.tsx
    ├── components/
    │   ├── ui/                # shadcn auto-generated
    │   ├── layout/
    │   │   ├── Sidebar.tsx
    │   │   └── TopBar.tsx
    │   ├── recording/
    │   │   ├── RecordButton.tsx
    │   │   └── AudioWaveform.tsx
    │   ├── transcript/
    │   │   └── TranscriptViewer.tsx
    │   └── journal/
    │       └── JournalEntry.tsx
    ├── workers/
    │   └── whisper.worker.ts  # Transformers.js + WebGPU
    └── lib/
        ├── ipc.ts             # typed window.api wrappers
        └── utils.ts           # shadcn utils

resources/
└── briefly-capture            # compiled Swift binary (gitignored, built via build:capture)
```

---

## Build Scripts

```bash
# Install dependencies
bun install

# Rebuild native modules against Electron ABI
bun run rebuild

# Build the Swift capture binary
bun run build:capture          # swift build -c release + copy to resources/

# Run in development
bun run dev

# Type check
bun run typecheck

# Database: add a new migration after editing schema.ts
bunx drizzle-kit generate

# Database: visual browser (reads live briefly.db)
bunx drizzle-kit studio
```

---

## Database Workflow (Drizzle)

Schema lives in `src/main/lib/schema.ts`. To make a schema change:

1. Edit `schema.ts`
2. Run `bunx drizzle-kit generate` → new `.sql` file written to `drizzle/`
3. Commit both files
4. App startup calls `migrate()` automatically — applies any unapplied migrations

---

## Distribution Roadmap

1. **POC** — personal use, unsigned, tested on developer machine
2. **Alpha** — signed + notarized, Screen Recording entitlement, distributed via direct download
3. **Public / Open Source** — Windows support via Rust CLI, cross-platform IPC contract

---

## Architecture Overview

```
Electron App
├── Main Process (Node.js)
│   ├── IPC handlers (record, transcribe, summarize, storage)
│   ├── Spawns Swift CLI   → audio capture (Opus) + screenshots
│   ├── better-sqlite3     → all DB reads/writes
│   ├── keytar             → macOS Keychain for API keys
│   └── LLM HTTP client    → OpenAI-compatible POST calls
│
├── Preload
│   └── contextBridge      → typed window.api surface
│
└── Renderer Process (React)
    ├── Pages: Dashboard, Recording, Transcript, Journal, Settings
    ├── shadcn/ui components
    └── Web Worker
        └── whisper.worker.ts
            └── Transformers.js v3 + WebGPU
                Chromium AudioContext decodes Opus → PCM → Whisper
```

---

## Build Phases

| Phase | Description | Status |
|---|---|---|
| [Phase 1](./phase-1-core-infrastructure.md) | Core infrastructure: Swift CLI, IPC layer, file management, SQLite | Planning |
| [Phase 2](./phase-2-processing-pipeline.md) | Processing pipeline: Whisper transcription, LLM post-processing | Planning |
| [Phase 3](./phase-3-ui.md) | UI: all screens, navigation, settings, journal | Planning |

---

## Project Structure (Target)

```
capture/                           # Swift Package — same repo, not a submodule
├── Package.swift
└── Sources/
    └── BrieflyCapture/
        ├── main.swift             # entry point: routes to session or list-windows
        ├── SessionMode.swift      # NDJSON stdin/stdout loop
        ├── AudioCapture.swift     # ScreenCaptureKit + AVAudioEngine mix
        ├── OpusEncoder.swift      # libopus wrapper, OggOpus framing
        └── ScreenshotCapture.swift

src/
├── main/
│   ├── index.ts               # app bootstrap, BrowserWindow
│   ├── ipc/
│   │   ├── capture.ts         # record/stop/screenshot IPC handlers
│   │   ├── transcription.ts   # trigger worker, return result
│   │   ├── llm.ts             # summary/todos/journal IPC handlers
│   │   └── storage.ts         # meeting CRUD IPC handlers
│   ├── lib/
│   │   ├── capture-cli.ts     # CaptureSession class + listWindows()
│   │   ├── db.ts              # better-sqlite3 singleton + migrations
│   │   ├── llm-client.ts      # OpenAI-compatible HTTP client
│   │   └── keychain.ts        # keytar wrapper
│
├── preload/
│   ├── index.ts               # contextBridge bindings
│   └── index.d.ts             # TypeScript API surface
│
├── renderer/src/
│   ├── App.tsx                # router root
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Recording.tsx
│   │   ├── Transcript.tsx
│   │   ├── Journal.tsx
│   │   └── Settings.tsx
│   ├── components/
│   │   ├── ui/                # shadcn auto-generated
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   └── TopBar.tsx
│   │   ├── recording/
│   │   │   ├── RecordButton.tsx
│   │   │   └── AudioWaveform.tsx
│   │   ├── transcript/
│   │   │   └── TranscriptViewer.tsx
│   │   └── journal/
│   │       └── JournalEntry.tsx
│   ├── workers/
│   │   └── whisper.worker.ts  # Transformers.js + WebGPU
│   └── lib/
│       ├── ipc.ts             # typed window.api wrappers
│       └── utils.ts           # shadcn utils (already exists)
│
resources/
└── briefly-capture            # compiled binary (gitignored, built via build:capture)
```

### Build Scripts (package.json)

```json
"build:capture": "cd capture && swift build -c release && cp .build/release/BrieflyCapture ../resources/briefly-capture",
"build:capture:win": "cd capture-win && cargo build --release && cp target/release/briefly-capture.exe ../resources/"
```

> `.gitignore` additions: `capture/.build/`, `resources/briefly-capture`

---

## Distribution Roadmap

1. **POC** — personal use, unsigned, tested on developer machine
2. **Alpha** — signed + notarized, Screen Recording entitlement, distributed via direct download
3. **Public / Open Source** — Windows support via Rust CLI, cross-platform IPC contract
