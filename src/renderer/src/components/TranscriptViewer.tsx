import React, { useEffect, useRef } from 'react'
import { ScrollArea } from './ui/scroll-area'
import type { TranscriptChunk } from '../../../main/lib/types'

interface TranscriptViewerProps {
  chunks: TranscriptChunk[]
  fullText?: string | null
  isLive: boolean
}

function formatTimestamp(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

export default function TranscriptViewer({ chunks, fullText, isLive }: TranscriptViewerProps): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isLive) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chunks.length, isLive])

  if (chunks.length === 0 && fullText) {
    return (
      <ScrollArea className="h-full">
        <p className="whitespace-pre-wrap p-5 text-sm leading-relaxed text-foreground">
          {fullText}
        </p>
      </ScrollArea>
    )
  }

  if (chunks.length === 0 && !isLive) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">No transcript available yet.</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-0.5 p-5">
        {chunks.map((chunk, i) => (
          <div key={i} className="flex gap-3 py-1">
            <span className="w-10 shrink-0 pt-0.5 text-right font-mono text-[10px] text-muted-foreground/60">
              {formatTimestamp(chunk.start)}
            </span>
            <p className="flex-1 text-sm leading-relaxed text-foreground">
              {chunk.text}
            </p>
          </div>
        ))}
        {isLive && (
          <div className="flex gap-3 py-1">
            <span className="w-10" />
            <span className="text-xs text-muted-foreground animate-pulse">Transcribing…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
