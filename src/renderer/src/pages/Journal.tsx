import React, { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import DateNavigator from '../components/DateNavigator'
import JournalEntryCard from '../components/JournalEntryCard'
import DailySummary from '../components/DailySummary'
import { journalDateAtom, journalMeetingsAtom, loadJournalMeetingsAtom } from '../atoms/pages'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function Journal(): React.JSX.Element {
  const { date: routeDate } = useParams<{ date?: string }>()
  const navigate = useNavigate()

  const [date, setDate] = useAtom(journalDateAtom)
  const meetings = useAtomValue(journalMeetingsAtom)
  const loadJournalMeetings = useSetAtom(loadJournalMeetingsAtom)

  // Sync route param → atom on mount / navigation
  useEffect(() => {
    const targetDate = routeDate ?? todayISO()
    setDate(targetDate)
  }, [routeDate, setDate])

  // Reload whenever date changes
  useEffect(() => { void loadJournalMeetings(date) }, [date, loadJournalMeetings])

  function handleDateChange(newDate: string): void {
    setDate(newDate)
    navigate(`/journal/${newDate}`, { replace: true })
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl italic text-foreground/80">Journal</h1>
        <DateNavigator date={date} onChange={handleDateChange} />
      </div>

      <DailySummary meetingIds={meetings.map((m) => m.id)} />

      {meetings.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground/60">
          No meetings recorded on this day.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {meetings.map((m) => (
            <JournalEntryCard key={m.id} meeting={m} />
          ))}
        </div>
      )}
    </div>
  )
}

