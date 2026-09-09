# First-Run UX — Onboarding Wizard

Addresses the "5+ steps before anything works" drop-off identified in feedback. A full-screen onboarding wizard replaces the Dashboard on first launch. Once completed, a flag (`onboardingComplete: true`) is written to `settings.json` and the wizard never appears again.

---

## Design Decisions

| Decision | Choice |
|---|---|
| Presentation | Full-screen route — no sidebar, no TitleBar (Raycast-style clean canvas) |
| Layout | Progress dots bottom-left · CTA button bottom-right |
| Animation | **Motion for React** (`motion` package) — spring-based step transitions |
| Hero element | Instrument Serif wordmark *"Briefly"* at display scale |
| LLM step | Skippable ("Skip for now" link) |
| Whisper step | Skippable ("Skip for now" link) |
| Background | Warm-charcoal (`--background`) + subtle CSS radial amber glow behind card |

- [x] `npm install motion` and add to dependencies

---

## Data Layer

- [x] Add `onboardingComplete?: boolean` to `AppSettings` in `src/main/lib/types.ts`
- [x] Add `platform:os-info` IPC handler in main process returning `{ darwinVersion: string }` (reads `os.release()`)
- [x] Add `system:open-screen-recording-settings` IPC handler (hardcoded safe URL via `shell.openExternal`)
- [x] Expose `getOsInfo(): Promise<{ darwinVersion: string }>` via `contextBridge` in `src/preload/index.ts`
- [x] Expose `openScreenRecordingSettings(): Promise<void>` via `contextBridge`
- [x] Add type declarations to `src/preload/index.d.ts`

---

## Routing & Shell

- [x] Add `/onboarding` route in `src/renderer/src/App.tsx`
- [x] On mount in `AppShell`, fetch settings → if `!onboardingComplete`, redirect to `/onboarding` before rendering the sidebar layout

---

## Onboarding Wizard — `src/renderer/src/pages/Onboarding.tsx`

Wizard container component. Owns step index state and spring transitions (Motion). Calls `window.api.saveSettings({ onboardingComplete: true })` on completion, then navigates to `/`.

- [x] Step progress indicator — animated pill dots bottom-left (active dot widens, Motion spring)
- [x] Spring slide transition between steps (`AnimatePresence` + `motion.div`, `x: ±44`)
- [x] macOS version check on mount via `getOsInfo()`; parse `darwinVersion` to detect < 14.2
- [x] Permissions refreshed when entering step 3; passed to ReadyStep for summary

---

## Step Components — `src/renderer/src/components/onboarding/`

### Step 1 — `WelcomeStep.tsx`
- [x] Full-screen dark panel, Briefly wordmark at hero scale (`font-display italic`, 88px)
- [x] Staggered entrance: wordmark fades in first, tagline delayed
- [x] If macOS < 14.2: amber inline warning block
- [x] CTA: "Get Started →" (in wizard bottom bar)

### Step 2 — `LlmSetupStep.tsx`
- [x] Extract shared `LlmFields` component from `Settings.tsx` and use it in both the wizard and Settings
- [x] "Test connection" button with live feedback: spinner → ✓ / ✗ + error message
- [x] "Skip for now" link — non-blocking

### Step 3 — `WhisperSetupStep.tsx`
- [x] Model selector (Tiny / Base / Large v3 Turbo) with size labels
- [x] "Download" button → real-time progress bar driven by existing worker progress events
- [x] States: idle → downloading (animated fill bar + %) → done (checkmark) → error (message + Retry button)
- [x] Checks browser cache on mount — shows "done" if model already present
- [x] "Skip for now" link — non-blocking

### Step 4 — `PermissionsStep.tsx`
- [x] Two rows: Screen Recording and Microphone
- [x] Each row: icon + label + status (granted / not granted) + action button
- [x] Screen Recording: "Open Settings" → `openScreenRecordingSettings()` IPC
- [x] Microphone: "Grant" → `requestMicPermission()` then refresh
- [x] Explanatory note

### Step 5 — `ReadyStep.tsx`
- [x] Config summary: LLM (configured / skipped), Model (ready / skipped), Screen Recording (granted / warn), Microphone (granted / skip)
- [x] CTA: "Start Recording" → saves `onboardingComplete: true`, navigates to `/`

---

## Pipeline Error Recovery (related improvement)

- [x] Add `failedStage: TranscriptionStage | null` to `TranscriptionState` in `atoms/transcription.ts` — captured from `prev.stage` in the catch block
- [x] In `PipelineStatus.tsx`: display which step failed (`failedStage` → "Model loading failed" / "Transcription failed" / "Summary generation failed")
- [x] Add `onRetry` prop + Retry button to `PipelineStatus` (outline button, destructive tint)
- [x] In `Transcript.tsx`: pass `failedStage={txState.failedStage}` and `onRetry={handleRerun}`

---

## macOS Version Gate on Dashboard (defensive)

- [x] On Dashboard mount, call `getOsInfo()` and check Darwin version
- [x] If < 14.2: show a persistent amber banner — *"System audio capture requires macOS 14.2 Sonoma or later. You can still record microphone-only audio."*

---

## Design Notes

- **Aesthetic**: refined dark glass — matches existing sidebar/app chrome
- **Background**: near-black with a subtle CSS radial glow behind the wizard card
- **Typography**: `font-display italic` wordmark on Welcome; standard `text-sm` body copy
- **Transitions**: CSS-only fade-and-slide — no additional animation libraries
- **Progress**: minimal numbered dot trail; active dot filled, completed dots use a muted check style

---

## Files Touched

| File | Change |
|---|---|
| `src/main/lib/types.ts` | Add `onboardingComplete?: boolean` to `AppSettings` |
| `src/main/ipc/settings.ts` | Add `platform:os-info` handler |
| `src/preload/index.ts` | Expose `getOsInfo()` |
| `src/preload/index.d.ts` | Type declaration for `getOsInfo` |
| `src/renderer/src/App.tsx` | Add `/onboarding` route |
| `src/renderer/src/components/layout/AppShell.tsx` | Redirect to `/onboarding` if not complete |
| `src/renderer/src/pages/Onboarding.tsx` | Wizard container |
| `src/renderer/src/components/onboarding/WelcomeStep.tsx` | Step 1 |
| `src/renderer/src/components/onboarding/LlmSetupStep.tsx` | Step 2 |
| `src/renderer/src/components/onboarding/WhisperSetupStep.tsx` | Step 3 |
| `src/renderer/src/components/onboarding/PermissionsStep.tsx` | Step 4 |
| `src/renderer/src/components/onboarding/ReadyStep.tsx` | Step 5 |
| `src/renderer/src/components/PipelineStatus.tsx` | Per-step error + Retry button |
| `src/renderer/src/pages/Dashboard.tsx` | macOS version banner |
