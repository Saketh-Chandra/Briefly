# Briefly — Release Smoke Checklist

Run this checklist on both macOS and Windows before each release.

This is the lane 4 manual artifact. Keep it here rather than inside a testing-phase plan so release validation does not depend on which phase is current.

Automated tests cover persistence, IPC contracts, and renderer wiring. The items below stay manual because they are OS-coupled: real permission prompts, tray chrome, protocol-handler registration, keychain persistence across a signed/packaged restart, and platform-specific capture.

## Common

- Record the OS version and app build being tested.
- **First-run onboarding**: on a clean profile (no `settings.json`), launch the app and confirm the onboarding wizard appears. Complete all steps. Confirm `onboardingComplete: true` is written to `settings.json` and the wizard never re-appears on next launch.
- **Re-run setup**: from Settings → Storage, trigger "Re-run Setup". Confirm the wizard appears again and completion re-sets `onboardingComplete`.
- Configure the LLM endpoint, save the credential, restart the app, and confirm the credential persists without being re-entered. _(Keychain / OS credential store — not mocked in CI.)_
- **Model download**: in Settings → Whisper Model, select a model and download it. Confirm the progress bar completes and the model shows as present. _(Network + browser Cache API in a packaged Chromium.)_
- **Model delete**: after a successful download, delete the model from Settings. Confirm the model shows as absent and the size resets to 0.
- **Import audio**: use the "Import Audio" button on the Dashboard. Select a local audio file. Confirm a new meeting row appears with status `recorded` and the transcription pipeline starts automatically. _(Native file dialog.)_
- Verify the tray icon is present and that tray commands can start recording, stop recording, and take a screenshot. _(OS tray / menu bar.)_
- Verify deep links work for `briefly://app/open`, `briefly://record/start`, `briefly://record/stop`, and `briefly://record/screenshot`. _(OS protocol-handler registration.)_
- Record pass or fail notes for any platform-specific behavior observed during the run.

## macOS

- Verify the microphone permission prompt appears on first request.
- Verify the Screen Recording settings shortcut opens the correct System Settings page.
- Verify the saved API key still works after restart without re-entry.
- Verify the onboarding OS version warning appears on macOS < 14.2.
- Verify system-audio capture on macOS 14.2+ (CoreAudio tap) vs microphone-only on older Darwin.

## Windows

- Verify the microphone or device permission flow works on first request.
- Verify the saved API credential persists across restart.
- Verify tray commands and deep links still work after a fresh app restart.
- Verify WASAPI loopback capture for system audio when a display/window source is selected.
