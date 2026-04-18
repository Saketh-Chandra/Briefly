import React from 'react'
import { Progress } from './ui/progress'
import type { TranscriptionStage } from '../contexts/TranscriptionContext'

interface PipelineStatusProps {
  stage: TranscriptionStage
  progress: number
  llmStep: number
  llmLabel: string
  error: string | null
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

function activeStepIndex(stage: TranscriptionStage): number {
  return STEPS.findIndex((s) => s.stages.includes(stage))
}

export default function PipelineStatus({
  stage,
  progress,
  llmStep,
  llmLabel,
  error
}: PipelineStatusProps): React.JSX.Element | null {
  if (stage === 'idle' || stage === 'done') return null

  if (stage === 'error') {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error ?? 'An error occurred during processing.'}
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
