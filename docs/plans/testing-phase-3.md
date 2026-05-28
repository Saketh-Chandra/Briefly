# Briefly — Testing Phase 3

This document defines the hardening wave after phase 2 broadens test coverage across the main workflows.

Use `docs/testing-context.md` for the testing rollout language and term boundaries.
Use `docs/current-state.md` for live behavior and `docs/plans/testing-phase-2.md` for the breadth-oriented expansion plan that precedes this phase.

## Objective

Turn the phase 1 and phase 2 test base into a stable release-confidence system: reliable CI, explicit manual ownership where automation is inappropriate, and targeted regression coverage for long-tail workflows.

## Entry Criteria

- Phase 2 breadth is landed.
- CI is already running the required `ci` job on every pull request.
- The team has at least one release cycle of signal from the phase 1 and phase 2 suites.

## Workstreams

### 1. CI Hardening

Focus on reliability before adding stricter policy.

Priority work:

- Remove or rewrite flaky tests.
- Speed up setup and execution through caching and tighter test scoping.
- Keep required and non-required jobs intentionally separated.
- Confirm Node `24.16.0`, `.nvmrc`, README, and workflow stay aligned.

Phase 3 expectation:

- A red `ci` job should be treated as actionable signal, not ambient noise.
- Coverage reporting should stay visible, but thresholds should be added only if the numbers are stable enough to govern merges.

### 2. Long-Tail Workflow Regression Coverage

Prioritize flows that are business-critical but less common than the first-wave scenarios.

Priority surfaces:

- Re-run pipeline after failure or after manual reset
- Import audio file flow
- Transcript and journal edit persistence
- Todo update persistence
- Model download, delete, and mirror/proxy settings paths
- Search ranking and filtering edge cases in large libraries

Phase 3 expectation:

- Critical recovery paths have automated regression coverage where feasible.
- Rare but high-impact workflows are no longer defended only by memory and manual retesting.

### 3. Release Confidence And Manual Ownership

Keep the manual checks that should stay manual, but make them operationally clear.

Priority work:

- Keep the macOS and Windows release smoke checklist current.
- Split the checklist into a dedicated release artifact if it becomes too large for `testing-phase-1.md`.
- Make explicit which behaviors remain manual because they are OS-coupled: permissions, tray, deep-link registration, keychain persistence, and platform-specific capture behavior.

Phase 3 expectation:

- Every critical release-only behavior is either automated or explicitly owned in the manual checklist.
- Release validation stops depending on tribal knowledge.

### 4. Performance And Resilience Checks

Focus on confidence under stress rather than only happy-path correctness.

Priority surfaces:

- Long transcript chunking and reduce paths
- Transcription interruptions and cancellation
- LLM failure recovery and partial progress handling
- Stuck-meeting recovery flows
- Large search result sets and repeated refresh events

Phase 3 expectation:

- The app is tested not only for correctness, but for recovery and resilience under realistic failure conditions.

## Done Definition

Phase 3 is complete when all of the following are true:

- The required CI job is stable enough to act as a dependable merge gate.
- Critical release flows are either covered by tests or explicitly covered by a maintained manual checklist.
- High-impact recovery and resilience workflows have regression coverage.
- Any added coverage thresholds or policy tightening are based on stable historical CI behavior, not aspiration.

## Non-Goals

- Do not force coverage thresholds just to appear mature.
- Do not try to fully automate OS-specific smoke behavior that is better validated on real macOS and Windows releases.
- Do not let phase 3 turn into a broad architecture rewrite; it is a confidence and hardening phase.