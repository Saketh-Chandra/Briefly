import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isToday, parseISO } from 'date-fns'
import { useAtomValue, useSetAtom } from 'jotai'
import { AlertTriangle, Upload } from 'lucide-react'
import RecordButton from '../components/RecordButton'
import MeetingCard from '../components/MeetingCard'
import { liveMeetingsAtom, loadMeetingsAtom } from '../atoms/pages'

// Darwin 23.2+ = macOS 14.2 Sonoma (required for loopback audio)
function isSupportedVersion(darwinVersion: string): boolean {
  const parts = darwinVersion.split('.').map(Number)
  const major = parts[0] ?? 0
  const minor = parts[1] ?? 0
  return major > 23 || (major === 23 && minor >= 2)
}

export default function Dashboard(): React.JSX.Element {
  const meetings = useAtomValue(liveMeetingsAtom)
  const loadMeetings = useSetAtom(loadMeetingsAtom)
  const navigate = useNavigate()
  const [unsupportedOS, setUnsupportedOS] = useState(false)

  // Initial load
  useEffect(() => {
    void loadMeetings()
  }, [loadMeetings])

  // Check macOS version — system audio capture requires 14.2+
  useEffect(() => {
    window.api
      .getOsInfo()
      .then(({ darwinVersion }) => {
        if (!isSupportedVersion(darwinVersion)) setUnsupportedOS(true)
      })
      .catch(() => {})
  }, [])

  // Reload when a recording finishes saving
  useEffect(() => {
    const unsub = window.api.onCaptureEvent((event) => {
      if (event.type === 'stopped') void loadMeetings()
    })
    return unsub
  }, [loadMeetings])

  async function handleImport(): Promise<void> {
    const result = await window.api.importAudioFile()
    if (result) {
      navigate(`/recordings/${result.meetingId}`)
    }
  }

  async function handleDelete(id: number): Promise<void> {
    if (!window.confirm('Delete this recording?')) return
    await window.api.deleteMeeting(id)
    void loadMeetings()
  }

  const today = meetings.filter((m) => isToday(parseISO(m.date)))
  const recent = meetings.filter((m) => !isToday(parseISO(m.date))).slice(0, 5)

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      {/* macOS version warning */}
      {unsupportedOS && (
        <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
          <p className="text-[12px] leading-relaxed text-amber-400/80">
            System audio capture requires macOS 14.2 Sonoma or later. You can still record
            microphone-only audio.
          </p>
        </div>
      )}
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
        <button
          onClick={() => void handleImport()}
          className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/50 transition-colors hover:text-muted-foreground/80"
        >
          <Upload size={11} />
          import an audio file
        </button>
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
