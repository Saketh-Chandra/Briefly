import React, { useState, useEffect, useRef } from 'react'
import { Textarea } from './ui/textarea'

interface JournalPanelProps {
  meetingId: number
  journal: string | null
}

export default function JournalPanel({ meetingId, journal: initial }: JournalPanelProps): React.JSX.Element {
  const [value, setValue] = useState(initial ?? '')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync when prop changes (e.g. LLM just finished)
  useEffect(() => { setValue(initial ?? '') }, [initial])

  function handleChange(text: string): void {
    setValue(text)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void window.api.updateJournal(meetingId, text)
    }, 600)
  }

  if (!initial && !value) {
    return <p className="text-sm text-muted-foreground">No journal entry yet.</p>
  }

  return (
    <Textarea
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      className="min-h-[160px] resize-y text-sm leading-relaxed"
      placeholder="Write your journal entry…"
    />
  )
}
