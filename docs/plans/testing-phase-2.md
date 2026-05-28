# Briefly — Testing Phase 2

This document defines the second testing wave after the phase 1 harness is green and the first automated slices are landed.

Use `docs/testing-context.md` for the testing rollout language and term boundaries.
Use `docs/current-state.md` for current behavior and `docs/plans/testing-phase-1.md` for the phase 1 testing contract.

## Objective

Broaden automated confidence from isolated high-value slices to the main renderer workflows, deferred browser-media-heavy seams, and the remaining main-process IPC contracts.

## Entry Criteria

- Phase 1 done definition from `docs/plans/testing-phase-1.md` is satisfied.
- `src/renderer/src/lib/api.ts` is the only renderer-owned bridge seam.
- The `main` and `renderer` Vitest projects run reliably in CI.

## Workstreams

### 1. Renderer Workflow Coverage

Expand lane 2 from isolated components into page-level behavior and stateful renderer flows.

Priority surfaces:

- `src/renderer/src/pages/Dashboard.tsx`
- `src/renderer/src/pages/Recordings.tsx`
- `src/renderer/src/pages/Transcript.tsx`
- `src/renderer/src/pages/Settings.tsx`
- `src/renderer/src/pages/Journal.tsx`
- `src/renderer/src/pages/Onboarding.tsx`
- `src/renderer/src/atoms/pages.ts`
- `src/renderer/src/atoms/transcription.ts`
- `src/renderer/src/atoms/recording.ts`

Phase 2 expectation:

- Renderer tests should validate loading, error, empty, and success states.
- The adapter seam should be mocked only at `src/renderer/src/lib/api.ts`.
- Page tests should cover interactions that previously produced regressions: loading data, refreshing on IPC events, deleting meetings, and reset-for-reprocessing UI paths.

### 2. Deferred Browser And Media Seams

Phase 1 explicitly deferred browser-media-heavy surfaces. Phase 2 picks them up without introducing full end-to-end automation.

Priority surfaces:

- `src/renderer/src/lib/capture-session.ts`
- `src/renderer/src/lib/whisper-worker.ts`
- `src/renderer/src/components/AudioWaveform.tsx`
- `src/renderer/src/components/SourcePicker.tsx`

Phase 2 expectation:

- Cover session lifecycle, chunk writing, finalization, screenshot capture, and error paths at the seam level.
- Cover worker progress, cancellation, and completion messaging without depending on real model downloads.
- Mock browser APIs narrowly and intentionally; do not rewrite production code into test-only abstractions unless a seam is otherwise impossible to control.

### 3. Main-Process Contract Expansion

Expand lane 3 beyond the first transcription and DB slice.

Priority surfaces:

- `src/main/ipc/storage.ts`
- `src/main/ipc/settings.ts`
- `src/main/ipc/llm.ts`
- `src/main/ipc/capture.ts`
- `src/main/lib/settings.ts`
- `src/main/lib/proxy.ts`
- `src/main/lib/keychain.ts`
- `src/main/lib/db.ts`

Phase 2 expectation:

- Keep using real migrated SQLite for DB-backed behavior.
- Mock Electron and OS boundaries only.
- Capture IPC registrations and invoke by channel rather than standing up a full Electron runtime.
- Add DB-backed coverage for meeting listing, detail lookup, transcript persistence, search variants, and destructive flows such as delete and clear-all.

### 4. LLM And Error-Handling Breadth

Phase 1 establishes a first slice in `src/main/lib/llm-client.ts`. Phase 2 expands to the full workflow and failure matrix.

Priority surfaces:

- `src/main/ipc/llm.ts`
- `src/main/lib/llm-client.ts`
- `src/renderer/src/components/LlmFields.tsx`
- `src/renderer/src/pages/Settings.tsx`

Phase 2 expectation:

- Cover Azure/OpenAI-compatible configuration differences, retryable failures, invalid settings, and visible user-facing error states.
- Cover long-running progress events and completion events flowing back into renderer state.

## Done Definition

Phase 2 is complete when all of the following are true:

- The highest-traffic renderer pages have automated happy-path and failure-path coverage.
- The deferred browser-media-heavy seams have targeted automated tests.
- The remaining critical IPC handler groups have contract tests.
- The test harness remains green in CI without introducing flaky or timing-dependent suites.

## Non-Goals

- Do not add a heavyweight end-to-end framework by default.
- Do not add repo-wide coverage thresholds unless CI data is stable enough to support them.
- Do not replace the manual release smoke checklist for OS-coupled behavior.