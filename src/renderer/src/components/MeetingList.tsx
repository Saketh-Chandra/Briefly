import React, { useMemo } from 'react'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { Trash2, ChevronRight } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { Button } from './ui/button'
import type { Meeting } from '../../../main/lib/types'

interface MeetingListProps {
  meetings: Meeting[]
  onDelete: (id: number) => void
}

function dateLabel(dateStr: string): string {
  const d = parseISO(dateStr)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'EEEE, MMMM d, yyyy')
}

function formatDuration(s: number | null): string {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

export default function MeetingList({ meetings, onDelete }: MeetingListProps): React.JSX.Element {
  const navigate = useNavigate()

  const groups = useMemo(() => {
    const map = new Map<string, Meeting[]>()
    for (const m of meetings) {
      const key = m.date.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [meetings])

  if (meetings.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground/60">
        No recordings match your search.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map(([dateKey, items]) => (
        <section key={dateKey}>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            {dateLabel(items[0].date)}
          </h3>
          <div className="overflow-hidden rounded-lg border border-border/60 divide-y divide-border/60">
            {items.map((m) => (
              <div
                key={m.id}
                className="flex cursor-pointer items-center gap-3 bg-card/40 px-4 py-3 transition-colors hover:bg-accent/30"
                onClick={() => navigate(`/recordings/${m.id}`)}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {m.title ?? 'Untitled Meeting'}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {format(parseISO(m.date), 'h:mm a')}
                    {' · '}
                    {formatDuration(m.duration_s)}
                  </p>
                </div>
                <StatusBadge status={m.status} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(m.id)
                  }}
                >
                  <Trash2 size={13} />
                </Button>
                <ChevronRight size={13} className="shrink-0 text-muted-foreground/50" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
