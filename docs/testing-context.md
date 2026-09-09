# Briefly — Testing Context

This context captures the language of Briefly's testing rollout so plans, implementation, and CI use the same terms. It complements the testing phase plans by defining the concepts, not by restating implementation steps.

## Language

### Rollout Terms

**Testing rollout**:
The staged introduction of automated and manual validation across testing phase 1, phase 2, and phase 3.
_Avoid_: test migration, QA plan

**Testing phase 1**:
The bootstrap phase that establishes the harness, lands one high-value slice in each automated lane, and commits the manual smoke checklist.
_Avoid_: scaffolding only, setup pass

**Testing phase 2**:
The breadth phase that expands automated confidence across the main renderer workflows, deferred browser-media-heavy seams, and remaining IPC contracts.
_Avoid_: polish phase, cleanup pass

**Testing phase 3**:
The hardening phase that turns the earlier coverage into dependable release confidence and stable CI signal.
_Avoid_: final polish, optional nice-to-have phase

**Phase 1 done definition**:
The threshold where the testing rollout stops being scaffolding and becomes an enforceable working agreement.
_Avoid_: setup complete, partial harness

### Lanes And Boundaries

**Lane**:
One of the four testing tracks in the rollout. A lane names a scope boundary, not just a folder or test runner target.
_Avoid_: suite, level when the meaning is rollout track

**Pure unit test**:
A deterministic test for logic that does not depend on Electron, browser-media behavior, or DB side effects.
_Avoid_: lightweight integration test

**Renderer component test**:
A renderer-facing behavior test that runs through the renderer-owned adapter seam rather than touching preload globals directly.
_Avoid_: UI end-to-end test, direct window.api test

**Main-process contract test**:
A test of IPC behavior or DB-backed main-process behavior that keeps the real SQLite contract and mocks only Electron or OS edges.
_Avoid_: full Electron integration test, mocked DB integration test

**Manual smoke test**:
A real-platform validation pass used for OS-coupled behavior that automation would misrepresent.
_Avoid_: optional QA pass, automated end-to-end test

**Renderer adapter seam**:
The single renderer-owned boundary at `src/renderer/src/lib/api.ts` through which renderer code accesses preload behavior.
_Avoid_: direct `window.api` access, multiple renderer mock seams

**DB-backed contract test**:
A contract test that keeps real migrated SQLite behavior instead of mocking the DB layer itself.
_Avoid_: mocked persistence test

**In-memory SQLite fixture**:
The literal `:memory:` SQLite database used when the subject is DB behavior rather than filesystem behavior.
_Avoid_: temp database file when the meaning is real in-memory DB

**Filesystem fixture**:
A temp-directory-backed file setup used only when audio, screenshot, or path behavior is part of the subject under test.
_Avoid_: in-memory DB when the subject is files on disk

### CI And Release Terms

**Required CI job**:
The merge-gating Linux CI job that must pass `npm test`, `npm run typecheck`, and `npm run lint`.
_Avoid_: coverage job, optional reporting job

**Coverage job**:
The non-blocking CI job that reports coverage without gating phase 1 merges.
_Avoid_: required test gate

**Release smoke checklist**:
The maintained manual artifact used before each release on macOS and Windows.
_Avoid_: ad hoc manual testing, informal release pass

**Repo Node policy**:
The contributor and CI baseline the repo chooses to enforce, distinct from the lower dependency engine floor.
_Avoid_: dependency minimum, toolchain floor

## Flagged Ambiguities

**"In-memory DB" vs "temp test DB"**:
For Briefly's testing rollout, "in-memory DB" means a literal SQLite `:memory:` database. Temp directories are a separate filesystem fixture concern.

**"Minimum supported Node" vs dependency engine floor**:
The testing discussion resolved these as different concepts. The repo policy is Node 24+, pinned to 24.16.0 for local alignment and CI, even though the dependency floor is lower.

**"One seam" in renderer tests**:
This means one renderer-owned `api` object seam at `src/renderer/src/lib/api.ts`, not many wrapper exports and not direct `window.api` use.

## Example Dialogue

Developer: For phase 1, do we need more scaffolding before CI?

Testing owner: No. Phase 1 is only done when the harness is green, each automated lane has one slice, and the release smoke checklist is committed.

Developer: For the lane 3 DB-backed contract tests, can I mock SQLite and just keep the IPC shape?

Testing owner: No. A DB-backed contract test keeps the real SQLite contract. Mock only the Electron or OS edges.

Developer: For renderer tests, can this page call `window.api` directly if I only stub it once in the test?

Testing owner: No. Renderer component tests must go through the renderer adapter seam so there is one mock boundary.

Developer: And the coverage job blocks merges too?

Testing owner: No. The required CI job is the merge gate. Coverage stays visible, but it is not the required CI job in phase 1.