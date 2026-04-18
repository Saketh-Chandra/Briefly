import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isToday, parseISO } from 'date-fns'
import { useAtomValue, useSetAtom } from 'jotai'
import RecordButton from '../components/RecordButton'
import MeetingCard from '../components/MeetingCard'
import { liveMeetingsAtom, loadMeetingsAtom } from '../atoms/pages'

export default function Dashboard(): React.JSX.Element {
  const meetings = useAtomValue(liveMeetingsAtom)
  const loadMeetings = useSetAtom(loadMeetingsAtom)
  const navigate = useNavigate()

  // Initial load
  useEffect(() => {
    void loadMeetings()
  }, [loadMeetings])

  // Reload when a recording finishes saving
  useEffect(() => {
    const unsub = window.api.onCaptureEvent((event) => {
      if (event.type === 'stopped') void loadMeetings()
    })
    return unsub
  }, [loadMeetings])

  async function handleDelete(id: number): Promise<void> {
    if (!window.confirm('Delete this recording?')) return
    await window.api.deleteMeeting(id)
    void loadMeetings()
  }

  const today = meetings.filter((m) => isToday(parseISO(m.date)))
  const recent = meetings.filter((m) => !isToday(parseISO(m.date))).slice(0, 5)

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      {/* Hero — Record CTA */}
      <section className="mb-12 flex flex-col items-center gap-3 pt-4">
        <h1 className="font-display mb-1 text-center text-3xl italic text-foreground/80">
          Ready when you are.
        </h1>
        <RecordButton onStarted={(id) => navigate(`/recordings/${id}`)} />
        <p className="text-[11px] text-muted-foreground/60 tracking-wide">
          or press{' '}
          <kbd className="rounded border border-border/60 px-1 py-0.5 font-mono text-[10px]">
            ⌘⇧R
          </kbd>
        </p>
      </section>

      {/* Today */}
      {today.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Today
          </h2>
          <div className="flex flex-col gap-1.5">
            {today.map((m) => (
              <MeetingCard key={m.id} meeting={m} onDelete={handleDelete} />
            ))}
          </div>
        </section>
      )}

      {/* Recent */}
      {recent.length > 0 && (
        <section>
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Recent
          </h2>
          <div className="flex flex-col gap-1.5">
            {recent.map((m) => (
              <MeetingCard key={m.id} meeting={m} onDelete={handleDelete} />
            ))}
          </div>
        </section>
      )}

      {meetings.length === 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground/50">
          No recordings yet. Hit record to begin.
        </p>
      )}
    </div>
  )
}
