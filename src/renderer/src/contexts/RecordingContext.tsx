import React, { useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  recordingAtom,
  recordingStatusAtom,
  startRecordingAtom,
  stopRecordingAtom,
  toggleRecordingAtom,
  initialRecordingState,
  type RecordingState,
  type RecordingStatus,
} from '../atoms/recording'

export type { RecordingStatus }

export interface RecordingContextValue {
  state: RecordingState
  startRecording: (mixMic: boolean) => Promise<{ meetingId: number }>
  stopRecording: () => Promise<void>
  toggleRecording: () => Promise<void>
}

// ── Provider ─────────────────────────────────────────────────────────────────
// Handles side-effects only: IPC event subscriptions and the elapsed timer.
// State lives in Jotai atoms (no React context needed for data).

export function RecordingProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const setRecording = useSetAtom(recordingAtom)
  // Subscribe to status only — avoids re-running timer effect on every audioLevel change
  const status = useAtomValue(recordingStatusAtom)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Swift CLI events → atom updates
  useEffect(() => {
    const unsub = window.api.onCaptureEvent((event) => {
      if (event.type === 'level') {
        setRecording((prev): RecordingState => ({ ...prev, audioLevel: event.rms }))
      }
      if (event.type === 'stopped') {
        // DB write in main process is synchronous and completes before this
        // event is forwarded to the renderer — safe to go straight to idle.
        setRecording(initialRecordingState)
      }
    })
    return unsub
  }, [setRecording])

  // Elapsed timer — only active while recording
  useEffect(() => {
    if (status === 'recording') {
      timerRef.current = setInterval(() => {
        setRecording((prev): RecordingState => ({ ...prev, elapsed: prev.elapsed + 1 }))
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [status, setRecording])

  return <>{children}</>
}

// ── Hook ─────────────────────────────────────────────────────────────────────
// Returns the same shape as before; action references are stable (Jotai guarantees
// useSetAtom always returns the same function identity for a given atom).

export function useRecording(): RecordingContextValue {
  return {
    state:           useAtomValue(recordingAtom),
    startRecording:  useSetAtom(startRecordingAtom),
    stopRecording:   useSetAtom(stopRecordingAtom),
    toggleRecording: useSetAtom(toggleRecordingAtom),
  }
}

