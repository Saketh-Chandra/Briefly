import { atom } from 'jotai'
import { CaptureSession } from '../lib/capture-session'
import type { CaptureSessionOpts } from '../lib/capture-session'

export type RecordingStatus = 'idle' | 'recording' | 'stopping' | 'saving'

export interface RecordingState {
  status: RecordingStatus
  sessionId: string | null
  meetingId: number | null
  elapsed: number
  audioLevel: number
}

export const initialRecordingState: RecordingState = {
  status: 'idle',
  sessionId: null,
  meetingId: null,
  elapsed: 0,
  audioLevel: 0
}

/** The source ID the user has chosen in the picker. null = auto (primary screen). */
export const selectedSourceIdAtom = atom<string | null>(null)

/** Base state atom */
export const recordingAtom = atom<RecordingState>(initialRecordingState)

/** Derived atom — subscribe to status changes without reacting to audioLevel noise */
export const recordingStatusAtom = atom((get) => get(recordingAtom).status)

// ── Active session (not stored in Jotai — not serialisable) ──────────────────
let _activeSession: CaptureSession | null = null

/** Nulls out and disposes the active session reference. Called from RecordingContext. */
export function disposeActiveSession(): void {
  _activeSession = null
}

// ── Write atoms (actions) ─────────────────────────────────────────────────────

/** Start a new recording.
 *  Reads selectedSourceIdAtom internally so callers only need to pass mixMic.
 *  Optimistically sets status → 'recording' before the IPC call. */
export const startRecordingAtom = atom(
  null,
  async (get, set, mixMic: boolean): Promise<{ meetingId: number }> => {
    const current = get(recordingAtom)
    if (current.status !== 'idle') {
      return { meetingId: current.meetingId ?? -1 }
    }
    // Optimistic update blocks any concurrent call before await resolves
    set(recordingAtom, (prev): RecordingState => ({ ...prev, status: 'recording' }))

    const sourceId = get(selectedSourceIdAtom)

    try {
      const result = await window.api.startRecording({ mixMic, sourceId })

      const sessionOpts: CaptureSessionOpts = { mixMic }
      const session = new CaptureSession(result.sessionId, sessionOpts)
      _activeSession = session

      await session.start()

      set(recordingAtom, {
        ...initialRecordingState,
        status: 'recording',
        sessionId: result.sessionId,
        meetingId: result.meetingId
      })
      return { meetingId: result.meetingId }
    } catch (err) {
      _activeSession = null
      set(recordingAtom, initialRecordingState)
      throw err
    }
  }
)

/** Stop the current recording. MediaRecorder.onstop → finalizeRecording IPC. */
export const stopRecordingAtom = atom(null, async (get, set): Promise<void> => {
  if (get(recordingAtom).status !== 'recording') return
  set(recordingAtom, (prev): RecordingState => ({ ...prev, status: 'stopping' }))
  _activeSession?.stop()
})

/** Toggle recording — used by the ⌘⇧R shortcut. */
export const toggleRecordingAtom = atom(null, async (get, set): Promise<void> => {
  const status = get(recordingAtom).status
  if (status === 'recording') await set(stopRecordingAtom)
  else if (status === 'idle') await set(startRecordingAtom, true)
})
