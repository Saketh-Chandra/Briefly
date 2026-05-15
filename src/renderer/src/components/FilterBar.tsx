import React from 'react'
import type { MeetingStatus } from '../../../main/lib/types'
import { cn } from '../lib/utils'

const statuses: MeetingStatus[] = [
  'recording',
  'recorded',
  'transcribing',
  'transcribed',
  'processing',
  'done',
  'error'
]

const labels: Record<MeetingStatus, string> = {
  recording: 'Recording',
  recorded: 'Recorded',
  transcribing: 'Transcribing',
  transcribed: 'Transcribed',
  processing: 'Processing',
  done: 'Done',
  error: 'Error'
}

interface FilterBarProps {
  active: MeetingStatus | null
  onChange: (status: MeetingStatus | null) => void
}

export default function FilterBar({ active, onChange }: FilterBarProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => onChange(null)}
        aria-pressed={active === null}
        className={cn(
          'rounded-md border px-3 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active === null
            ? 'border-foreground/30 bg-foreground/10 text-foreground'
            : 'border-border/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground'
        )}
      >
        All
      </button>
      {statuses.map((s) => (
        <button
          key={s}
          onClick={() => onChange(active === s ? null : s)}
          aria-pressed={active === s}
          className={cn(
            'rounded-md border px-3 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            active === s
              ? 'border-foreground/30 bg-foreground/10 text-foreground'
              : 'border-border/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground'
          )}
        >
          {labels[s]}
        </button>
      ))}
    </div>
  )
}
