# Briefly — Testing Phase 1

This document is the phase 1 source of truth for how tests are introduced into Briefly.

Use `docs/testing-context.md` for the testing rollout language and term boundaries.

Phase 1 is not complete until all three are true:

- The Vitest harness is green.
- One high-value slice exists in each automated lane.
- The manual smoke checklist below is committed to the repo.

## Test Lanes

| Lane | Type | Scope | Automation |
| --- | --- | --- | --- |
| 1 | Pure unit tests | Deterministic logic, small utilities, request construction, error types, enum values, Jotai state transitions where practical | Automated |
| 2 | Renderer component tests | React components and renderer-facing behavior with the preload bridge mocked through one renderer-owned adapter | Automated |
| 3 | Main-process contract tests | IPC handlers, emitted events, and DB-backed behavior with real migrated SQLite and mocked Electron surfaces | Automated |
| 4 | Manual smoke tests | OS-coupled behavior such as permissions, credential storage, tray behavior, and deep-link registration | Manual |

Lane 4 stays manual because those flows are platform-specific and mocking them would defeat the point of the test.

## Core Decisions

- Use real SQLite with migrations applied for DB-backed contract tests. Do not mock `better-sqlite3`.
- Use a literal in-memory SQLite database for DB-backed tests where possible, and reserve temp directories for non-DB filesystem fixtures.
- Mock only Electron and OS edges in main-process tests.
- Route renderer code through `src/renderer/src/lib/api.ts`; renderer modules should not call `window.api` directly.
- Make the renderer adapter repo-wide in the first implementation pass so there is exactly one renderer mock seam from day one.
- Export one typed `api` object from `src/renderer/src/lib/api.ts` that mirrors the preload bridge instead of flattening the bridge into many named exports.
- Use one `vitest.config.ts` with two named projects: `main` and `renderer`.
- Extract seams incrementally as tests require them. Do not pause for a repo-wide platform abstraction pass.
- Add a narrow DB test hook for singleton reset and path control so DB-backed tests do not depend on import-order tricks.
- Test lane 3 at the IPC contract level by capturing registered `ipcMain.handle` and `ipcMain.on` handlers and invoking them by channel name.
- Standardize the repo on Node 24+ as a policy choice, even though the current toolchain supports older versions.
- Enforce the Node policy in the repo with `package.json` `engines.node`, a pinned `.nvmrc`, matching README guidance, and the same pinned version in CI.

## Phase 1 Done Definition

Phase 1 changes the working agreement only when the implementation lands. At that point:

- `.github/workflows/ci.yml` must provide one required Linux `ci` job before merge.
- The merge gate is green `npm test`, green `npm run typecheck`, and green `npm run lint`.
- Coverage is reported in CI output but is not a phase 1 merge gate.
- The manual smoke checklist remains required before each release on both macOS and Windows.

## Phase 1 Automated Slice

### Lane 1

- `src/main/lib/llm-client.ts`
- `src/renderer/src/lib/format.ts`
- `src/renderer/src/lib/platform.ts`

### Lane 2

- `src/renderer/src/components/LlmFields.tsx`
- `src/renderer/src/components/PipelineStatus.tsx`

### Lane 3

- `src/main/ipc/transcription.ts`
- `src/main/lib/db.ts`

The first DB-backed contract slice must cover:

- Transcript insert idempotency
- Reset-for-reprocessing behavior
- Search behavior

The first IPC contract slice must cover:

- Accepted retriable statuses
- Status normalization back to `recorded`
- Emitted `transcription:status` events
- Error path when the audio file is missing

### Deferred To Phase 2

Do not spend phase 1 time on browser-media-heavy surfaces such as `src/renderer/src/lib/capture-session.ts`. Those flows are valuable, but they are the wrong first target from a zero-test baseline.

See `docs/plans/testing-phase-2.md` for the next expansion wave after the phase 1 harness is stable.
See `docs/plans/testing-phase-3.md` for the hardening and release-confidence wave after phase 2 breadth lands.

## CI Contract

- Document Node 24+ as the minimum supported version.
- Pin CI to Node 24.16.0 and keep `.nvmrc`, README, and CI aligned.
- Install dependencies in CI with Bun.
- Keep `npm test` mapped to `vitest run`.
- Add `npm run test:coverage` for visible coverage reporting.
- Run coverage in a separate non-required Linux job.
- Do not add repo-wide coverage thresholds in phase 1.
- Trigger the workflow on `push` and `pull_request`.
- Protect the current default branch and require the `ci` job on `master` until any future branch rename is handled separately.

## Test File Layout

- Colocate tests next to the source files they cover.
- Use `*.test.ts` for main and shared TypeScript modules.
- Use `*.test.tsx` for renderer components.
- Keep only shared setup, reusable mocks, and reusable fixtures in a small top-level test helpers directory.
- Let the `main` and `renderer` Vitest projects select tests by source directory rather than by maintaining separate top-level test trees.

## Manual Release Smoke Checklist

Run this checklist on both macOS and Windows before each release.

### Common

- Record the OS version and app build being tested.
- **First-run onboarding**: on a clean profile (no `settings.json`), launch the app and confirm the onboarding wizard appears. Complete all steps. Confirm `onboardingComplete: true` is written to `settings.json` and the wizard never re-appears on next launch.
- **Re-run setup**: from Settings → Storage, trigger "Re-run Setup". Confirm the wizard appears again and completion re-sets `onboardingComplete`.
- Configure the LLM endpoint, save the credential, restart the app, and confirm the credential persists without being re-entered.
- **Model download**: in Settings → Whisper Model, select a model and download it. Confirm the progress bar completes and the model shows as present.
- **Model delete**: after a successful download, delete the model from Settings. Confirm the model shows as absent and the size resets to 0.
- **Import audio**: use the "Import Audio" button on the Dashboard. Select a local audio file. Confirm a new meeting row appears with status `recorded` and the transcription pipeline starts automatically.
- Verify the tray icon is present and that tray commands can start recording, stop recording, and take a screenshot.
- Verify deep links work for `briefly://app/open`, `briefly://record/start`, `briefly://record/stop`, and `briefly://record/screenshot`.
- Record pass or fail notes for any platform-specific behavior observed during the run.

### macOS

- Verify the microphone permission prompt appears on first request.
- Verify the Screen Recording settings shortcut opens the correct System Settings page.
- Verify the saved API key still works after restart without re-entry.
- Verify the onboarding OS version warning appears on macOS < 14.2.

### Windows

- Verify the microphone or device permission flow works on first request.
- Verify the saved API credential persists across restart.
- Verify tray commands and deep links still work after a fresh app restart.