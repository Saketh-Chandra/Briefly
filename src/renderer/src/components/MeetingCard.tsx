import React from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Trash2, ChevronRight } from 'lucide-react'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import StatusBadge from './StatusBadge'
import type { Meeting } from '../../../main/lib/types'

interface MeetingCardProps {
  meeting: Meeting
  onDelete?: (id: number) => void
}

function formatDuration(s: number | null): string {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

export default function MeetingCard({ meeting, onDelete }: MeetingCardProps): React.JSX.Element {
  const navigate = useNavigate()

  return (
    <Card
      className="cursor-pointer border-border/60 bg-card/60 transition-colors hover:bg-accent/30"
      onClick={() => navigate(`/recordings/${meeting.id}`)}
    >
      <CardContent className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {meeting.title ?? 'Untitled Meeting'}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {format(parseISO(meeting.date), 'MMM d, h:mm a')}
            {' · '}
            {formatDuration(meeting.duration_s)}
          </p>
        </div>
        <StatusBadge status={meeting.status} />
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(meeting.id)
            }}
          >
            <Trash2 size={13} />
          </Button>
        )}
        <ChevronRight size={13} className="shrink-0 text-muted-foreground/50" />
      </CardContent>
    </Card>
  )
}
