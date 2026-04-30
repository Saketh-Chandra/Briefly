import React, { useMemo } from 'react'
import { marked } from 'marked'
import { Users, CheckSquare } from 'lucide-react'

interface SummaryPanelProps {
  summary: string | null
  keyDecisions?: string[] | null
  participants?: string[] | null
}

export default function SummaryPanel({
  summary,
  keyDecisions,
  participants
}: SummaryPanelProps): React.JSX.Element {
  const html = useMemo(() => {
    if (!summary) return ''
    const result = marked.parse(summary)
    return typeof result === 'string' ? result : ''
  }, [summary])

  const hasExtras =
    (keyDecisions && keyDecisions.length > 0) || (participants && participants.length > 0)

  if (!summary && !hasExtras) {
    return <p className="text-sm text-muted-foreground">No summary yet.</p>
  }

  return (
    <div className="space-y-5">
      {summary && (
        <div
          className="prose prose-sm dark:prose-invert max-w-none text-foreground [&_h1]:font-display [&_h2]:font-display [&_h3]:font-display"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}

      {participants && participants.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="mb-2.5 flex items-center gap-2">
            <Users size={13} className="shrink-0 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Participants
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {participants.map((name, i) => (
              <span
                key={i}
                className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-foreground"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {keyDecisions && keyDecisions.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="mb-2.5 flex items-center gap-2">
            <CheckSquare size={13} className="shrink-0 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Key Decisions
            </span>
          </div>
          <ul className="space-y-1.5">
            {keyDecisions.map((decision, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                {decision}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
