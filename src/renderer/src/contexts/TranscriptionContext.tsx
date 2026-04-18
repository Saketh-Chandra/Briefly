import React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  transcriptionAtom,
  startPipelineAtom,
  resetTranscriptionAtom,
  type TranscriptionState,
  type TranscriptionStage
} from '../atoms/transcription'

export type { TranscriptionStage }

export interface TranscriptionContextValue {
  state: TranscriptionState
  startPipeline: (meetingId: number) => Promise<void>
  reset: () => void
}

// ── Provider ─────────────────────────────────────────────────────────────────
// No component-level side-effects needed — Worker lifecycle is fully managed
// inside the write atoms in atoms/transcription.ts.

export function TranscriptionProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  return <>{children}</>
}

// ── Hook ─────────────────────────────────────────────────────────────────────
// Returns the same shape as before; action references are stable (Jotai guarantees
// useSetAtom always returns the same function identity for a given atom).

export function useTranscription(): TranscriptionContextValue {
  return {
    state: useAtomValue(transcriptionAtom),
    startPipeline: useSetAtom(startPipelineAtom),
    reset: useSetAtom(resetTranscriptionAtom)
  }
}
