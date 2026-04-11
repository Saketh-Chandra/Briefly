import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader } from './ui/card'
import { Button } from './ui/button'
import JournalPanel from './JournalPanel'
import type { Meeting } from '../../../main/lib/types'

interface JournalEntryCardProps {
  meeting: Meeting
}

export default function JournalEntryCard({ meeting }: JournalEntryCardProps): React.JSX.Element {
  const navigate = useNavigate()
  const [journal, setJournal] = useState<string | null>(null)

  useEffect(() => {
    window.api.getMeeting(meeting.id)
      .then((detail) => { setJournal(detail?.summary?.journal ?? null) })
      .catch(console.error)
  }, [meeting.id])

  const isProcessed = meeting.status === 'done'

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="flex flex-row items-center gap-2 px-4 pb-2 pt-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {meeting.title ?? 'Untitled Meeting'}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {format(parseISO(meeting.date), 'h:mm a')}
            {meeting.duration_s != null && ` · ${Math.floor(meeting.duration_s / 60)}m`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground"
          onClick={() => navigate(`/recordings/${meeting.id}`)}
          title="Open transcript"
        >
          <ExternalLink size={13} />
        </Button>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {isProcessed ? (
          <JournalPanel meetingId={meeting.id} journal={journal} />
        ) : (
          <p className="text-sm italic text-muted-foreground">
            {meeting.status === 'recording'
              ? 'Recording in progress…'
              : meeting.status === 'error'
              ? 'Processing failed — open the recording to retry.'
              : 'Still processing…'}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
