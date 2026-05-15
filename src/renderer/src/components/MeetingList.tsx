import React, { useMemo } from 'react'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { Trash2, ChevronRight } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { Button } from './ui/button'
import { formatDuration } from '../lib/format'
import type { Meeting } from '../../../main/lib/types'

interface MeetingListProps {
  meetings: Meeting[]
  onDelete: (id: number) => void
  /** When true, renders a flat ordered list without date grouping (used for search results). */
  flat?: boolean
  /** Message to show when the list is empty. */
  emptyMessage?: string
}

function dateLabel(dateStr: string): string {
  const d = parseISO(dateStr)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'EEEE, MMMM d, yyyy')
}

export default function MeetingList({ meetings, onDelete, flat = false, emptyMessage }: MeetingListProps): React.JSX.Element {
  const navigate = useNavigate()

  const groups = useMemo(() => {
    if (flat) return null
    const map = new Map<string, Meeting[]>()
    for (const m of meetings) {
      const key = m.date.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [meetings, flat])

  if (meetings.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground/60">
        {emptyMessage ?? 'No recordings yet.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {flat ? (
        <div className="overflow-hidden rounded-lg border border-border/60 divide-y divide-border/60">
          {meetings.map((m) => (
            <MeetingRow key={m.id} m={m} onDelete={onDelete} navigate={navigate} showDate />
          ))}
        </div>
      ) : (
        groups!.map(([dateKey, items]) => (
          <section key={dateKey}>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              {dateLabel(items[0].date)}
            </h3>
            <div className="overflow-hidden rounded-lg border border-border/60 divide-y divide-border/60">
              {items.map((m) => (
                <MeetingRow key={m.id} m={m} onDelete={onDelete} navigate={navigate} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function MeetingRow({
  m,
  onDelete,
  navigate,
  showDate = false
}: {
  m: Meeting
  onDelete: (id: number) => void
  navigate: (path: string) => void
  showDate?: boolean
}): React.JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      className="flex cursor-pointer items-center gap-3 bg-card/40 px-4 py-3 transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => navigate(`/recordings/${m.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') navigate(`/recordings/${m.id}`)
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {m.title ?? 'Untitled Meeting'}
        </p>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {showDate
            ? format(parseISO(m.date), 'MMM d · h:mm a')
            : format(parseISO(m.date), 'h:mm a')}
          {' · '}
          {formatDuration(m.duration_s)}
        </p>
      </div>
      <StatusBadge status={m.status} />
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        aria-label={`Delete ${m.title ?? 'recording'}`}
        onClick={(e) => {
          e.stopPropagation()
          onDelete(m.id)
        }}
      >
        <Trash2 size={13} />
      </Button>
      <ChevronRight size={13} className="shrink-0 text-muted-foreground/50" />
    </div>
  )
}
