import React from 'react'
import { Badge } from './ui/badge'
import type { MeetingStatus } from '../../../main/lib/types'

const config: Record<MeetingStatus, { label: string; className: string }> = {
  recording: {
    label: 'Recording',
    className: 'bg-rose-500/15 text-rose-400 border-rose-500/30 animate-pulse'
  },
  recorded: { label: 'Recorded', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  transcribing: {
    label: 'Transcribing',
    className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30 animate-pulse'
  },
  transcribed: { label: 'Transcribed', className: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  processing: {
    label: 'Processing',
    className: 'bg-purple-500/15 text-purple-400 border-purple-500/30 animate-pulse'
  },
  done: { label: 'Done', className: 'bg-green-500/15 text-green-400 border-green-500/30' },
  error: { label: 'Error', className: 'bg-red-500/15 text-red-400 border-red-500/30' }
}

export default function StatusBadge({ status }: { status: MeetingStatus }): React.JSX.Element {
  const { label, className } = config[status] ?? { label: status, className: '' }
  return (
    <Badge variant="outline" className={`text-[11px] font-medium ${className}`}>
      {label}
    </Badge>
  )
}
