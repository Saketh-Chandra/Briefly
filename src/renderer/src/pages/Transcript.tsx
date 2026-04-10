import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Copy, Download, RefreshCw, Trash2, ArrowLeft } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Button } from '../components/ui/button'
import { Separator } from '../components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, DialogFooter
} from '../components/ui/dialog'
import PipelineStatus from '../components/PipelineStatus'
import TranscriptViewer from '../components/TranscriptViewer'
import SummaryPanel from '../components/SummaryPanel'
import TodoList from '../components/TodoList'
import JournalPanel from '../components/JournalPanel'
import StatusBadge from '../components/StatusBadge'
import { useTranscription } from '../contexts/TranscriptionContext'
import type { MeetingDetail } from '../../../main/lib/types'

export default function Transcript(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const meetingId = Number(id)
  const navigate = useNavigate()

  const [meeting, setMeeting] = useState<MeetingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { state: txState, startPipeline, reset } = useTranscription()
  const isPipelineActive =
    txState.meetingId === meetingId && !['idle', 'done', 'error'].includes(txState.stage)

  const load = useCallback(async () => {
    const detail = await window.api.getMeeting(meetingId)
    setMeeting(detail)
    setLoading(false)
  }, [meetingId])

  useEffect(() => {
    void load()
    return () => reset()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load])

  // Auto-start pipeline when meeting just recorded
  useEffect(() => {
    if (meeting?.status === 'recorded') {
      void startPipeline(meetingId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting?.status, meetingId])

  // Reload when pipeline finishes
  useEffect(() => {
    if (txState.stage === 'done' && txState.meetingId === meetingId) {
      void load()
    }
  }, [txState.stage, txState.meetingId, meetingId, load])

  // Reload on LLM done event from main
  useEffect(() => {
    const unsub = window.api.onLlmDone((e) => {
      if (e.meetingId === meetingId) void load()
    })
    return unsub
  }, [meetingId, load])

  async function handleDelete(): Promise<void> {
    await window.api.deleteMeeting(meetingId)
    setDeleteOpen(false)
    navigate('/recordings')
  }

  async function handleCopy(): Promise<void> {
    const text = meeting?.transcript?.content ?? ''
    await navigator.clipboard.writeText(text)
  }

  async function handleExport(): Promise<void> {
    if (!meeting) return
    const m = meeting
    const lines: string[] = [
      `# ${m.title ?? 'Untitled Meeting'}`,
      `**Date:** ${format(parseISO(m.date), 'PPpp')}`,
      `**Duration:** ${m.duration_s != null ? `${Math.floor(m.duration_s / 60)}m ${m.duration_s % 60}s` : '—'}`,
      '',
      '## Transcript',
      '',
      m.transcript?.content ?? '_No transcript_',
      '',
    ]
    if (m.summary?.summary) {
      lines.push('## Summary', '', m.summary.summary, '')
    }
    if (m.summary?.todos && m.summary.todos.length > 0) {
      lines.push('## Action Items', '')
      for (const t of m.summary.todos) {
        lines.push(`- [${t.done ? 'x' : ' '}] ${t.text}${t.owner ? ` _(${t.owner})_` : ''}`)
      }
      lines.push('')
    }
    if (m.summary?.journal) {
      lines.push('## Journal', '', m.summary.journal, '')
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(m.title ?? 'meeting').replace(/[^a-z0-9]/gi, '-')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleRerun(): Promise<void> {
    if (!meeting?.transcript) return
    await window.api.resetForReprocessing(meetingId)
    await load()
    void startPipeline(meetingId)
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }
  if (!meeting) {
    return <div className="p-6 text-sm text-muted-foreground">Meeting not found.</div>
  }

  const liveTranscribing = isPipelineActive && txState.stage === 'transcribing'
  const chunks = isPipelineActive ? txState.chunks : (meeting.transcript?.chunks ?? [])
  const fullText = isPipelineActive ? null : (meeting.transcript?.content ?? null)

  const pipelineStatus = isPipelineActive
    ? (txState.stage === 'processing-llm' ? 'processing' : 'transcribing')
    : meeting.status

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-foreground">
            {meeting.title ?? 'Untitled Meeting'}
          </h1>
          <p className="font-mono text-[11px] text-muted-foreground">
            {format(parseISO(meeting.date), 'PPpp')}
          </p>
        </div>
        <StatusBadge status={pipelineStatus} />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Copy transcript" onClick={() => void handleCopy()}>
            <Copy size={13} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Export Markdown" onClick={() => void handleExport()}>
            <Download size={13} />
          </Button>
          {meeting.transcript && (
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Re-run LLM" onClick={() => void handleRerun()}>
              <RefreshCw size={13} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            title="Delete meeting"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {/* Pipeline progress banner */}
      {(isPipelineActive || txState.stage === 'error') && txState.meetingId === meetingId && (
        <div className="shrink-0 px-5 pt-4">
          <PipelineStatus
            stage={txState.stage}
            progress={txState.progress}
            llmStep={txState.llmStep}
            llmLabel={txState.llmLabel}
            error={txState.error}
          />
        </div>
      )}

      <Separator className="mt-3 shrink-0" />

      {/* Tabs */}
      <div className="flex min-h-0 flex-1 flex-col">
        <Tabs defaultValue="transcript" className="flex h-full flex-col">
          <TabsList className="mx-5 mt-3 w-fit shrink-0">
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="todos">To-Dos</TabsTrigger>
            <TabsTrigger value="journal">Journal</TabsTrigger>
          </TabsList>

          <TabsContent value="transcript" className="min-h-0 flex-1 overflow-hidden mt-0 data-[state=active]:flex data-[state=active]:flex-col">
            <TranscriptViewer chunks={chunks} fullText={fullText} isLive={liveTranscribing} />
          </TabsContent>

          <TabsContent value="summary" className="overflow-auto p-5">
            <SummaryPanel summary={meeting.summary?.summary ?? null} />
          </TabsContent>

          <TabsContent value="todos" className="overflow-auto p-5">
            {meeting.summary?.todos ? (
              <TodoList meetingId={meetingId} todos={meeting.summary.todos} />
            ) : (
              <p className="text-sm text-muted-foreground">No action items yet.</p>
            )}
          </TabsContent>

          <TabsContent value="journal" className="overflow-auto p-5">
            <JournalPanel meetingId={meetingId} journal={meeting.summary?.journal ?? null} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete recording?</DialogTitle>
            <DialogDescription>
              This will permanently delete the audio file, transcript, summary, and all associated data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

