import { atom } from 'jotai'

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
  audioLevel: 0,
}

/** Base state atom */
export const recordingAtom = atom<RecordingState>(initialRecordingState)

/** Derived atom — subscribe to status changes without reacting to audioLevel noise */
export const recordingStatusAtom = atom((get) => get(recordingAtom).status)

// ── Write atoms (actions) ─────────────────────────────────────────────────────
// `get()` inside write functions reads the CURRENT store value synchronously,
// eliminating stale-closure race conditions that plagued the useReducer approach.

/** Start a new recording.
 *  - Synchronously guards against double-starts using `get()`.
 *  - Optimistically sets status → 'recording' before the IPC call so any
 *    concurrent invocation (e.g. ⌘⇧R + button click) sees non-idle state. */
export const startRecordingAtom = atom(
  null,
  async (get, set, mixMic: boolean): Promise<{ meetingId: number }> => {
    const current = get(recordingAtom)
    if (current.status !== 'idle') {
      // Idempotent — return existing meetingId so callers can navigate correctly
      return { meetingId: current.meetingId ?? -1 }
    }
    // Optimistic update blocks any concurrent call before await resolves
    set(recordingAtom, (prev): RecordingState => ({ ...prev, status: 'recording' }))
    try {
      const result = await window.api.startRecording({ mixMic })
      set(recordingAtom, {
        ...initialRecordingState,
        status: 'recording',
        sessionId: result.sessionId,
        meetingId: result.meetingId,
      })
      return { meetingId: result.meetingId }
    } catch (err) {
      set(recordingAtom, initialRecordingState)
      throw err
    }
  }
)

/** Stop the current recording. */
export const stopRecordingAtom = atom(
  null,
  async (get, set): Promise<void> => {
    if (get(recordingAtom).status !== 'recording') return
    set(recordingAtom, (prev): RecordingState => ({ ...prev, status: 'stopping' }))
    await window.api.stopRecording()
  }
)

/** Toggle recording — used by the ⌘⇧R shortcut. */
export const toggleRecordingAtom = atom(
  null,
  async (get, set): Promise<void> => {
    const status = get(recordingAtom).status
    if (status === 'recording') await set(stopRecordingAtom)
    else if (status === 'idle') await set(startRecordingAtom, true)
  }
)
