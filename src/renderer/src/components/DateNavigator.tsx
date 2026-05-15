import React from 'react'
import { format, parseISO, isToday, isYesterday, addDays, subDays } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './ui/button'
import { toLocalISODate } from '../lib/format'

interface DateNavigatorProps {
  date: string // YYYY-MM-DD
  onChange: (date: string) => void
}

function label(dateStr: string): string {
  const d = parseISO(dateStr)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'EEEE, MMMM d, yyyy')
}

export default function DateNavigator({ date, onChange }: DateNavigatorProps): React.JSX.Element {
  const canGoForward = date < toLocalISODate(new Date())

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label="Previous day"
        onClick={() => onChange(toLocalISODate(subDays(parseISO(date), 1)))}
      >
        <ChevronLeft size={15} />
      </Button>
      <span className="min-w-[190px] text-center text-sm font-medium text-foreground">
        {label(date)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        disabled={!canGoForward}
        aria-label="Next day"
        onClick={() => onChange(toLocalISODate(addDays(parseISO(date), 1)))}
      >
        <ChevronRight size={15} />
      </Button>
    </div>
  )
}
