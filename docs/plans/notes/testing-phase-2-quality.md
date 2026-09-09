# Notes — Testing Phase 2 quality follow-ups

**Date:** 2026-09-08  
**Context:** Testing Phase 2 is complete (`docs/plans/testing-phase-2.md`). Local `bunx vitest run`: 34 files, 352 tests, all green.  
**Judgment:** overall case quality **84 / 100** after Phase 3 assertion honesty (was 78). Breadth is landed. These notes are the remaining quality gaps, not missing files.

Do not restart Phase 2. Do not add coverage thresholds (Phase 2 non-goal). Address this list from [Testing Phase 3](../testing-phase-3.md): CI hardening, assertion honesty, and long-tail regression — not another page-test wave.

Language and seams: `docs/testing-context.md`. Mock renderer code only at `src/renderer/src/lib/api.ts`.

## What not to redo

These already catch real regressions. Do not rewrite them for coverage theater.

- Main-process IPC: real in-memory SQLite, invoke-by-channel, Electron mocked only. LLM cases that assert both the throw and `meeting.status === 'error'`.
- Storage: listing, detail, search variants, delete, clear-all, screenshot path confinement.
- Media seams: `capture-session`, `whisper-worker`, `whisper.worker.ts`, `AudioWaveform`, `SourcePicker`.
- Transcript page: auto-start, re-run / reset-for-reprocessing, delete, IPC reload (callback fired), lightbox.
- Settings page: Whisper download / cancel / delete, mirror ping success and failure, proxy save, clear-all confirm vs cancel.

## Follow-ups

### 1. Failure paths assert chrome, not errors

Production swallows list-load failures with `.catch(() => {})` on Dashboard, Recordings, and Journal. The Phase 2 tests assert the heading / empty chrome is still visible after `getMeetings` or `getMeetingsByDate` rejects.

That catches a crash. It does not catch a missing user-visible error.

- [x] Decide whether silent swallow is the intended product behavior.
- [x] If yes, keep the crash-guard tests and say so in the test names (`does not crash when getMeetings rejects`).
- [ ] If no, add a visible error state and assert that — do not keep asserting empty chrome as an “error path”.

Decision (Phase 3): silent swallow is intended. List-load IPC failures keep empty/last chrome and the primary CTA. Do not add an error banner as part of test hardening.

Files: `src/renderer/src/pages/Dashboard.test.tsx`, `Recordings.test.tsx`, `Journal.test.tsx`, and the `.catch(() => {})` call sites in those pages.

### 2. Subscribe without firing the callback

Recordings asserts `onCaptureEvent` / `onTranscriptionStatus` were called once. It never invokes the registered callback. A broken reload-on-stop would still pass.

Transcript already does this correctly: register, fire the event, assert reload.

- [x] In `Recordings.test.tsx`, capture the `onCaptureEvent` / `onTranscriptionStatus` / `onLlmDone` handlers and fire them.
- [x] Assert `getMeetings` runs again (or the list updates) on `stopped`, transcription status, and LLM done.
- [x] Same pattern for Dashboard `onCaptureEvent` → reload, if still untested.

### 3. Stubbed children counted as page coverage

These page tests cannot catch child-internal regressions. Child files already exist; do not re-test the child inside the page. Tighten the page test only where the page owns the wiring.

| Page       | Stub                                           | Keep / change                                                                                                                                                           |
| ---------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard  | `RecordButton` → `data-testid="record-button"` | Keep the stub. Do not add a “renders the record button” test that only finds the test id. Page-level start/stop stays in `RecordButton.test.tsx` + `recording.test.ts`. |
| Journal    | `JournalEntryCard` → title div                 | Keep the stub. Page test should keep asserting date load and card count, not card internals.                                                                            |
| Onboarding | later steps → placeholder divs                 | Keep the page wizard test. Step internals stay in `components/onboarding/*.test.tsx`.                                                                                   |

- [x] Drop or rewrite tests whose only assertion is a stub test id or a page heading.
- [x] Prefer one mount + load assertion over a separate “renders the heading” case.

### 4. Slow Radix / user-event suites

Not sleep-based, but they are the flake and CI-time surface.

| Suite                        | Observed                         | Watch                                             |
| ---------------------------- | -------------------------------- | ------------------------------------------------- |
| `Settings.test.tsx`          | ~3.4s file                       | mirror ping, proxy save                           |
| `Onboarding.test.tsx`        | ~3.6s file; complete-wizard ~2s  | sequential `fireEvent.click` through mocked steps |
| `SourcePicker.test.tsx`      | menu open ~500ms                 | Radix dropdown                                    |
| `Recordings.test.tsx` search | ~300ms each, `{ timeout: 2000 }` | debounce / `user-event` typing                    |

- [x] Prefer `user-event` for Radix surfaces; use `fireEvent` for native inputs and clicks (Settings mirror/proxy, Recordings search) so CI time stays tight.
- [x] Only raise `waitFor` timeouts when a real debounce exists; document the debounce in the test. Recordings search now uses fake timers for the 300ms SearchBar debounce.
- [x] If a case stays >500ms, leave a comment why (Radix pointer capture, SearchBar debounce, etc.). `SourcePicker.test.tsx` documents the dropdown cost.
- [x] Phase 3 CI hardening should treat these as the first files to watch for flakes.

### 5. Assertion honesty checklist (when touching a test)

Use this when editing an existing Phase 2 test, not as a repo-wide rewrite.

1. Does the test name a **persisted or user-visible** outcome, or only that a mock was called / a heading exists?
2. If it subscribes to IPC, does it **fire the callback**?
3. If it is an “error” test, does it assert an **error the user can see**, or only that the page did not unmount?
4. Is a child stubbed? Then do not pretend the page covers that child’s behavior.

## Score reminder

| Lane                   | Score | Implication                                                                                                                        |
| ---------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Main-process contracts | 86    | Trust these. Extend the same two-sided pattern (throw + DB/status).                                                                |
| Atoms and media seams  | 83    | Trust these. Keep browser mocks narrow.                                                                                            |
| Renderer pages         | 82    | Crash-guard names are honest. Dashboard / Recordings fire IPC reload callbacks. Remaining depth is Radix time, not missing wiring. |

Raising the overall score toward 90 is Phase 3 work, not Phase 2 reopening.
