import React, { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Copy,
  Download,
  RefreshCw,
  Trash2,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  X,
  Maximize2,
  Info,
  Check,
  HardDrive,
  Monitor,
  Calendar
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Button } from '../components/ui/button'
import { Separator } from '../components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
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
  const [screenshotUrls, setScreenshotUrls] = useState<string[]>([])
  const [loadingScreenshots, setLoadingScreenshots] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [hasCopiedImage, setHasCopiedImage] = useState(false)

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
    // Do NOT call reset() on unmount — the pipeline is global and must survive navigation
  }, [load])

  useEffect(() => {
    const unsubCapture = window.api.onCaptureEvent((event) => {
      if (event.type === 'stopped' || event.type === 'error') {
        void load()
      }
    })

    const unsubTranscription = window.api.onTranscriptionStatus((event) => {
      if (event.meetingId === meetingId) {
        void load()
      }
    })

    return () => {
      unsubCapture()
      unsubTranscription()
    }
  }, [meetingId, load])

  // Auto-start pipeline once the recording has actually finished writing.
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
      ''
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
    reset() // reset atom to idle and clean up any stale IPC subscriptions
    await window.api.resetForReprocessing(meetingId)
    await load()
    void startPipeline(meetingId)
  }

  const loadScreenshots = useCallback(async () => {
    if (!meeting?.screenshots?.length) return
    setLoadingScreenshots(true)
    try {
      const urls = await Promise.all(
        meeting.screenshots.map((s) => window.api.readScreenshot(s.path))
      )
      setScreenshotUrls(urls)
    } finally {
      setLoadingScreenshots(false)
    }
  }, [meeting?.screenshots])

  async function handleCopyImage(dataUrl: string): Promise<void> {
    if (!dataUrl) return
    try {
      await window.api.writeImageToClipboard(dataUrl)
      setHasCopiedImage(true)
      setTimeout(() => setHasCopiedImage(false), 2000)
    } catch (e) {
      console.error('Failed to copy image', e)
    }
  }

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIdx === null) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowRight') {
        setLightboxIdx((i) => (i !== null ? Math.min(i + 1, screenshotUrls.length - 1) : null))
      } else if (e.key === 'ArrowLeft') {
        setLightboxIdx((i) => (i !== null ? Math.max(i - 1, 0) : null))
      } else if (e.key === 'Escape') {
        setLightboxIdx(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIdx, screenshotUrls.length])

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
    ? txState.stage === 'processing-llm'
      ? 'processing'
      : 'transcribing'
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
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Copy transcript"
            onClick={() => void handleCopy()}
          >
            <Copy size={14} strokeWidth={1.5} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Export Markdown"
            onClick={() => void handleExport()}
          >
            <Download size={14} strokeWidth={1.5} />
          </Button>
          {!isPipelineActive && meeting.status !== 'recording' && meeting.status !== 'recorded' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Re-run pipeline"
              onClick={() => void handleRerun()}
            >
              <RefreshCw size={14} strokeWidth={1.5} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            title="Delete meeting"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 size={14} strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      {/* Pipeline progress banner */}
      {(isPipelineActive || txState.stage === 'error') && txState.meetingId === meetingId && (
        <div className="shrink-0 px-5 pt-4">
          <PipelineStatus
            stage={txState.stage}
            failedStage={txState.failedStage}
            progress={txState.progress}
            llmStep={txState.llmStep}
            llmLabel={txState.llmLabel}
            error={txState.error}
            onRetry={handleRerun}
          />
        </div>
      )}

      <Separator className="mt-3 shrink-0" />

      {/* Tabs */}
      <div className="flex min-h-0 flex-1 flex-col">
        <Tabs
          defaultValue="transcript"
          className="flex h-full flex-col"
          onValueChange={(v) => {
            if (v === 'screenshots' && screenshotUrls.length === 0) {
              void loadScreenshots()
            }
          }}
        >
          <TabsList className="mx-5 mt-3 w-fit shrink-0">
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="todos">To-Dos</TabsTrigger>
            <TabsTrigger value="journal">Journal</TabsTrigger>
            <TabsTrigger value="screenshots">
              Screenshots
              {(meeting.screenshots?.length ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                  {meeting.screenshots.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="transcript"
            className="min-h-0 flex-1 overflow-hidden mt-0 data-[state=active]:flex data-[state=active]:flex-col"
          >
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

          <TabsContent value="screenshots" className="min-h-0 flex-1 overflow-auto p-5">
            {loadingScreenshots ? (
              <p className="text-sm text-muted-foreground">Loading screenshots…</p>
            ) : screenshotUrls.length === 0 && !meeting.screenshots?.length ? (
              <p className="text-sm text-muted-foreground">
                No screenshots taken. Use ⌘⇧S or the menu bar to capture a screenshot during
                recording.
              </p>
            ) : screenshotUrls.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {meeting.screenshots.length} screenshot
                {meeting.screenshots.length !== 1 ? 's' : ''} — click to load previews.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {screenshotUrls.map((url, idx) => (
                  <button
                    key={idx}
                    className="group relative aspect-video overflow-hidden rounded-lg border border-white/[0.07] bg-black/40 transition-all duration-200 hover:border-white/20 hover:shadow-2xl hover:shadow-black/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setLightboxIdx(idx)}
                  >
                    <img
                      src={url}
                      alt={`Screenshot ${idx + 1}`}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                      loading="lazy"
                    />
                    {/* Hover overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-200 group-hover:bg-black/25">
                      <div className="scale-75 opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
                        <div className="rounded-full bg-black/40 p-2 backdrop-blur-sm ring-1 ring-white/20">
                          <Maximize2 size={14} className="text-white" />
                        </div>
                      </div>
                    </div>
                    <span className="absolute bottom-2 left-2 font-mono text-[10px] tracking-widest text-white/50">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Screenshot lightbox — full-screen portal overlay */}
      {lightboxIdx !== null &&
        createPortal(
          <div
            className="lightbox-overlay fixed inset-0 z-[200] flex flex-col"
            style={{ background: 'oklch(0.05 0.006 60 / 0.96)', backdropFilter: 'blur(2px)' }}
            onClick={() => setLightboxIdx(null)}
          >
            {/* Top HUD */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20"
              style={{
                background:
                  'linear-gradient(to bottom, oklch(0.04 0.006 60 / 0.85) 0%, transparent 100%)'
              }}
            />
            <div
              className="absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-between pl-[72px] pr-4 [-webkit-app-region:drag]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center sm:w-40">
                <span className="font-mono text-[11px] tracking-[0.2em] text-white/40 uppercase">
                  {String(lightboxIdx + 1).padStart(2, '0')} /{' '}
                  {String(screenshotUrls.length).padStart(2, '0')}
                </span>
              </div>

              {meeting.screenshots[lightboxIdx]?.taken_at && (
                <span className="hidden w-48 text-center font-mono text-[11px] text-white/30 sm:block flex-1">
                  {format(
                    parseISO(meeting.screenshots[lightboxIdx].taken_at),
                    'MMM d, yyyy  HH:mm:ss'
                  )}
                </span>
              )}

              <div className="flex items-center justify-end gap-1 sm:w-40">
                <button
                  onClick={() => setShowInfo(!showInfo)}
                  className={`flex h-8 w-8 items-center justify-center rounded-md transition-all duration-150 [-webkit-app-region:no-drag] ${showInfo ? 'bg-white/20 text-white' : 'text-white/40 hover:bg-white/10 hover:text-white/90'}`}
                  aria-label="Info"
                  title="Image Info"
                >
                  <Info size={14} strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => handleCopyImage(screenshotUrls[lightboxIdx])}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-white/40 transition-all duration-150 hover:bg-white/10 hover:text-white/90 [-webkit-app-region:no-drag]"
                  aria-label="Copy"
                  title="Copy Image"
                >
                  {hasCopiedImage ? (
                    <Check size={14} strokeWidth={2} className="text-green-400" />
                  ) : (
                    <Copy size={14} strokeWidth={1.5} />
                  )}
                </button>
                <a
                  href={screenshotUrls[lightboxIdx]}
                  download={`briefly-screenshot-${format(parseISO(meeting.screenshots[lightboxIdx]?.taken_at || new Date().toISOString()), 'yyyy-MM-dd-HHmmss')}.png`}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-white/40 transition-all duration-150 hover:bg-white/10 hover:text-white/90 [-webkit-app-region:no-drag]"
                  aria-label="Download"
                  title="Download Image"
                >
                  <Download size={14} strokeWidth={1.5} />
                </a>
                <div className="mx-2 h-4 w-[1px] bg-white/20" />
                <button
                  onClick={() => setLightboxIdx(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-white/40 transition-all duration-150 hover:bg-red-500/20 hover:text-red-400 [-webkit-app-region:no-drag]"
                  aria-label="Close"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
            </div>

            {/* Right side floating Info Panel */}
            {showInfo && (
              <div className="absolute right-6 top-20 z-30 w-72 overflow-hidden rounded-xl border border-white/10 bg-black/60 p-4 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-4">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/70">
                  Image Details
                </h3>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 text-sm text-white/80">
                    <Monitor size={14} className="text-white/40" />
                    <div>
                      <div className="text-white/50 text-[10px] uppercase tracking-wider">
                        Resolution
                      </div>
                      <div className="font-mono">3840 × 2160</div>
                    </div>
                  </div>
                  <Separator className="bg-white/5" />
                  <div className="flex items-center gap-3 text-sm text-white/80">
                    <Calendar size={14} className="text-white/40" />
                    <div>
                      <div className="text-white/50 text-[10px] uppercase tracking-wider">
                        Captured At
                      </div>
                      <div className="font-mono">
                        {format(
                          parseISO(
                            meeting.screenshots[lightboxIdx]?.taken_at || new Date().toISOString()
                          ),
                          'PPpp'
                        )}
                      </div>
                    </div>
                  </div>
                  <Separator className="bg-white/5" />
                  <div className="flex items-center gap-3 text-sm text-white/80">
                    <HardDrive size={14} className="text-white/40" />
                    <div>
                      <div className="text-white/50 text-[10px] uppercase tracking-wider">
                        Format & Size
                      </div>
                      <div className="font-mono">
                        PNG •{' '}
                        {Math.round(
                          (((screenshotUrls[lightboxIdx].length - 22) * 0.75) / 1024 / 1024) * 10
                        ) / 10}{' '}
                        MB
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Image — fills the full screen */}
            <div
              className="flex flex-1 items-center justify-center overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                key={lightboxIdx}
                src={screenshotUrls[lightboxIdx]}
                alt={`Screenshot ${lightboxIdx + 1}`}
                className="lightbox-image max-h-full max-w-full object-contain"
                style={{ maxHeight: 'calc(100vh - 100px)' }}
              />
            </div>

            {/* Prev arrow */}
            {lightboxIdx > 0 && (
              <button
                className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full p-3 text-white/30 transition-all duration-150 hover:bg-white/10 hover:text-white/80"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIdx((i) => (i !== null ? i - 1 : null))
                }}
                aria-label="Previous screenshot"
              >
                <ChevronLeft size={28} />
              </button>
            )}

            {/* Next arrow */}
            {lightboxIdx < screenshotUrls.length - 1 && (
              <button
                className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full p-3 text-white/30 transition-all duration-150 hover:bg-white/10 hover:text-white/80"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIdx((i) => (i !== null ? i + 1 : null))
                }}
                aria-label="Next screenshot"
              >
                <ChevronRight size={28} />
              </button>
            )}

            {/* Bottom filmstrip — only when multiple screenshots */}
            {screenshotUrls.length > 1 && (
              <>
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28"
                  style={{
                    background:
                      'linear-gradient(to top, oklch(0.04 0.006 60 / 0.85) 0%, transparent 100%)'
                  }}
                />
                <div
                  className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-center gap-2 pb-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  {screenshotUrls.map((url, idx) => (
                    <button
                      key={idx}
                      onClick={() => setLightboxIdx(idx)}
                      className={`h-12 w-20 overflow-hidden rounded-md border transition-all duration-150 ${
                        idx === lightboxIdx
                          ? 'scale-110 border-white/60 opacity-100'
                          : 'border-white/10 opacity-35 hover:opacity-65 hover:border-white/25'
                      }`}
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>,
          document.body
        )}

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete recording?</DialogTitle>
            <DialogDescription>
              This will permanently delete the audio file, transcript, summary, and all associated
              data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
