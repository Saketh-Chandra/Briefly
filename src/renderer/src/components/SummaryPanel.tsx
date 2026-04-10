import React, { useMemo } from 'react'
import { marked } from 'marked'

interface SummaryPanelProps {
  summary: string | null
}

export default function SummaryPanel({ summary }: SummaryPanelProps): React.JSX.Element {
  const html = useMemo(() => {
    if (!summary) return ''
    const result = marked.parse(summary)
    return typeof result === 'string' ? result : ''
  }, [summary])

  if (!summary) {
    return <p className="text-sm text-muted-foreground">No summary yet.</p>
  }

  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none text-foreground [&_h1]:font-display [&_h2]:font-display [&_h3]:font-display"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
