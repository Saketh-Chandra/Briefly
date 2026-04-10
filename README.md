# Briefly

Briefly is a macOS desktop app for recording meeting audio, transcribing it locally with Whisper, and generating summaries, action items, and journal entries with a configurable LLM endpoint.

The app combines an Electron shell, a React and TypeScript renderer, a native Swift capture binary for system audio, local SQLite storage via Drizzle, and a Web Worker powered by `@huggingface/transformers` for transcription.

## Current Status

Briefly is under active development, but the main end-to-end pieces already exist:

- Native macOS capture via a Swift CLI in `capture/`
- Renderer UI for dashboard, recordings, transcript, journal, and settings
- Local Whisper model download and transcription pipeline
- OpenAI-compatible LLM post-processing for summaries and journal output
- SQLite-backed meeting storage and Electron notifications

For the most reliable implementation snapshot, start with `docs/current-state.md`.

## What Briefly Does

1. Records meeting audio using a native macOS capture binary.
2. Stores recordings and metadata locally.
3. Downloads and runs a Whisper model locally in a Web Worker.
4. Generates summaries, to-dos, and journal entries using a user-configured LLM API.
5. Presents recordings, transcripts, and journal views in the desktop UI.

## Tech Stack

| Area | Technology |
| --- | --- |
| Desktop shell | Electron + electron-vite |
| Renderer | React 19 + TypeScript |
| State | Jotai |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Native capture | Swift 5.9 + ScreenCaptureKit + AVFoundation |
| Local transcription | `@huggingface/transformers` in a Web Worker |
| Storage | SQLite + `better-sqlite3` + Drizzle ORM |
| Secrets | macOS Keychain via `keytar` |

## Platform Notes

- Briefly currently targets macOS.
- The native capture pipeline depends on Apple frameworks such as ScreenCaptureKit.
- The Swift package in `capture/` targets macOS 13 or later.
- Apple Silicon is strongly preferred for good Whisper WebGPU performance.
- Capture and recording logic for other operating systems has not been implemented yet.
- Windows and Linux support is planned, but is still in the pipeline.

## Prerequisites

- macOS 13+
- A recent Node.js installation
- Bun for installing and updating dependencies
- Xcode Command Line Tools or Xcode, if you need to rebuild the native capture binary
- `ffmpeg` available on the machine if you want to run the native capture pipeline locally
- Screen Recording and Microphone permissions when running the app

Optional for capture development:

- `brew install ffmpeg`

The Swift capture binary buffers PCM during recording and encodes the final `.opus` file by invoking `ffmpeg` with `libopus`.

Dependency workflow in this repo:

- Use `bun install` to install dependencies.
- Use `bun add` or `bun add -d` when adding packages.
- Use `npm run ...` to run app and build scripts.

## Getting Started

### Install dependencies

```bash
bun install
```

### Run in development

```bash
npm run dev
```

### Type-check the project

```bash
npm run typecheck
```

### Lint the project

```bash
npm run lint
```

### Build the native capture binary

Run this if you change code under `capture/` or need to refresh the bundled binary in `resources/briefly-capture`.

```bash
npm run build:capture
```

### Build the app

```bash
npm run build
```

For platform packaging:

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

The packaging scripts exist for multiple platforms, but the implemented capture pipeline is currently macOS-only.

## First-Run Flow

After launching the app:

1. Open Settings.
2. Configure the LLM endpoint, model, and API key.
3. Select a Whisper model.
4. Download the model from Hugging Face or a configured mirror.
5. Start a recording and let the transcription and summary pipeline run.

## Useful Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Electron development environment |
| `npm run typecheck` | Run both Node and web TypeScript checks |
| `npm run lint` | Run ESLint |
| `npm run build` | Type-check and build the app |
| `npm run build:capture` | Build the Swift capture binary and copy it into `resources/` |
| `npm run rebuild` | Rebuild native modules against the Electron ABI |
| `npm run build:mac` | Build the macOS package |

## Project Structure

```text
capture/              Swift package for native audio capture and screenshots
drizzle/              SQL migrations and Drizzle metadata
docs/                 Context, plans, implementation notes, and current state
resources/            Bundled native assets, including briefly-capture
src/main/             Electron main process, IPC, database, settings, LLM client
src/preload/          Typed contextBridge API exposed to the renderer
src/renderer/         React application, pages, components, atoms, worker
```

## Architecture Overview

```text
Swift capture binary
	-> records audio and screenshots
	-> Electron main process stores metadata and coordinates IPC
	-> renderer worker transcribes audio locally with Whisper
	-> main process calls configured LLM endpoint for summaries
	-> React UI displays meetings, transcripts, and journal entries
```

## Documentation

- `docs/current-state.md` for the latest implementation snapshot
- `docs/context.md` for architecture and codebase structure
- `docs/plans/README.md` for the original phased implementation plan
- `docs/implementation/` for focused implementation notes

## Development Notes

- Settings and app metadata are stored under Electron's `userData` directory.
- API keys are stored in the macOS Keychain, not in the renderer.
- Whisper model download and transcription happen in the renderer worker.
- Main-process IPC owns capture, persistence, notifications, and LLM calls.

## License

BSD 3-Clause License. See `LICENSE`.
