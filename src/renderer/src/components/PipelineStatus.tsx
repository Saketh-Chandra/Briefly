import React from 'react'
import { RotateCcw } from 'lucide-react'
import { Progress } from './ui/progress'
import { Button } from './ui/button'
import type { TranscriptionStage } from '../contexts/TranscriptionContext'

interface PipelineStatusProps {
  stage: TranscriptionStage
  failedStage: TranscriptionStage | null
  progress: number
  llmStep: number
  llmLabel: string
  error: string | null
  onRetry?: () => void
}

interface Step {
  label: string
  stages: TranscriptionStage[]
}

const STEPS: Step[] = [
  { label: 'Load model', stages: ['downloading-model'] },
  { label: 'Transcribe', stages: ['transcribing'] },
  { label: 'Summarise', stages: ['processing-llm'] }
]

const FAILED_STAGE_LABEL: Partial<Record<TranscriptionStage, string>> = {
  'downloading-model': 'Model loading failed',
  transcribing: 'Transcription failed',
  'processing-llm': 'Summary generation failed'
}

function activeStepIndex(stage: TranscriptionStage): number {
  return STEPS.findIndex((s) => s.stages.includes(stage))
}

export default function PipelineStatus({
  stage,
  failedStage,
  progress,
  llmStep,
  llmLabel,
  error,
  onRetry
}: PipelineStatusProps): React.JSX.Element | null {
  if (stage === 'idle' || stage === 'done') return null

  if (stage === 'error') {
    const stepLabel = (failedStage && FAILED_STAGE_LABEL[failedStage]) ?? 'Processing failed'
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-sm font-medium text-destructive">{stepLabel}</p>
            {error && (
              <p className="text-[11px] text-destructive/70 break-words">
                {error.length > 180 ? error.slice(0, 180) + '…' : error}
              </p>
            )}
          </div>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="shrink-0 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
            >
              <RotateCcw size={12} className="mr-1.5" />
              Retry
            </Button>
          )}
        </div>
      </div>
    )
  }

  const activeStep = activeStepIndex(stage)

  return (
    <div className="rounded-lg border border-border/60 bg-card px-4 py-4">
      {/* Step indicators */}
      <div className="mb-3 flex items-center gap-1">
        {STEPS.map((step, i) => {
          const isDone = i < activeStep || (stage === 'processing-llm' && llmStep >= 3 && i === 2)
          const isActive = i === activeStep
          return (
            <React.Fragment key={step.label}>
              <div className="flex items-center gap-1.5">
                <div
                  className={[
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                    isDone
                      ? 'bg-green-500/80 text-white'
                      : isActive
                        ? 'bg-primary text-primary-foreground animate-pulse'
                        : 'bg-muted text-muted-foreground'
                  ].join(' ')}
                >
                  {isDone ? '✓' : i + 1}
                </div>
                <span
                  className={`text-xs ${isActive ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && <div className="mx-2 h-px flex-1 bg-border/60" />}
            </React.Fragment>
          )
        })}
      </div>

      <Progress value={progress} className="h-1" />

      <p className="mt-2 text-[11px] text-muted-foreground">
        {stage === 'downloading-model' &&
          `Loading Whisper model…${progress > 0 ? ` ${progress}%` : ''}`}
        {stage === 'transcribing' && 'Transcribing audio…'}
        {stage === 'processing-llm' && (llmLabel || 'Generating summary…')}
      </p>
    </div>
  )
}
