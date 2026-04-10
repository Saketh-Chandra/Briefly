import React from 'react'
import { Mic, Square } from 'lucide-react'
import { useRecording } from '../contexts/RecordingContext'
import { Button } from './ui/button'
import AudioWaveform from './AudioWaveform'

interface RecordButtonProps {
  onStarted?: (meetingId: number) => void
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`
}

export default function RecordButton({ onStarted }: RecordButtonProps): React.JSX.Element {
  const { state, startRecording, stopRecording } = useRecording()
  const isActive = state.status === 'recording' || state.status === 'stopping'
  const isSaving = state.status === 'saving'

  async function handleClick(): Promise<void> {
    if (isActive) {
      await stopRecording()
    } else if (state.status === 'idle') {
      const { meetingId } = await startRecording(true)
      onStarted?.(meetingId)
    }
  }

  if (isActive) {
    return (
      <button
        onClick={() => void handleClick()}
        disabled={state.status === 'stopping'}
        className="flex items-center gap-4 rounded-2xl border px-7 py-4 transition-all duration-200 hover:scale-[1.01] disabled:opacity-50"
        style={{
          borderColor: 'var(--briefly-record)',
          backgroundColor: 'color-mix(in oklch, var(--briefly-record) 8%, transparent)',
        }}
      >
        <AudioWaveform level={state.audioLevel} active={state.status === 'recording'} barCount={7} />
        <span
          className="font-mono text-[15px] font-medium tabular-nums"
          style={{ color: 'var(--briefly-record)' }}
        >
          {formatElapsed(state.elapsed)}
        </span>
        <div
          className="ml-1 flex items-center gap-1.5 text-sm font-medium"
          style={{ color: 'var(--briefly-record)' }}
        >
          <Square size={13} style={{ fill: 'var(--briefly-record)' }} />
          {state.status === 'stopping' ? 'Stopping…' : 'Stop'}
        </div>
      </button>
    )
  }

  return (
    <Button
      size="lg"
      onClick={() => void handleClick()}
      disabled={isSaving}
      className="gap-2.5 rounded-xl px-8 py-6 text-[15px] font-semibold tracking-tight transition-all duration-200 hover:scale-[1.02]"
      style={{
        backgroundColor: 'var(--briefly-accent)',
        color: 'oklch(0.1 0 0)',
      }}
    >
      <Mic size={17} strokeWidth={2} />
      {isSaving ? 'Saving…' : 'Start Recording'}
    </Button>
  )
}
