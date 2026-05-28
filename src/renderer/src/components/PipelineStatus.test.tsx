import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PipelineStatus from './PipelineStatus'
import type { TranscriptionStage } from '../contexts/TranscriptionContext'

describe('PipelineStatus — idle/done', () => {
  it('renders nothing when stage is idle', () => {
    const { container } = render(
      <PipelineStatus
        stage="idle"
        failedStage={null}
        progress={0}
        llmStep={0}
        llmLabel=""
        error={null}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when stage is done', () => {
    const { container } = render(
      <PipelineStatus
        stage="done"
        failedStage={null}
        progress={100}
        llmStep={3}
        llmLabel=""
        error={null}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('PipelineStatus — error state', () => {
  it('shows generic error label when failedStage is null', () => {
    render(
      <PipelineStatus
        stage="error"
        failedStage={null}
        progress={0}
        llmStep={0}
        llmLabel=""
        error="Something went wrong"
      />
    )
    expect(screen.getByText(/processing failed/i)).toBeInTheDocument()
  })

  it('shows "Model loading failed" when failedStage is downloading-model', () => {
    render(
      <PipelineStatus
        stage="error"
        failedStage={'downloading-model' as TranscriptionStage}
        progress={0}
        llmStep={0}
        llmLabel=""
        error="Network error"
      />
    )
    expect(screen.getByText(/model loading failed/i)).toBeInTheDocument()
  })

  it('shows "Transcription failed" when failedStage is transcribing', () => {
    render(
      <PipelineStatus
        stage="error"
        failedStage={'transcribing' as TranscriptionStage}
        progress={0}
        llmStep={0}
        llmLabel=""
        error="out of memory"
      />
    )
    expect(screen.getByText(/transcription failed/i)).toBeInTheDocument()
  })

  it('shows "Summary generation failed" when failedStage is processing-llm', () => {
    render(
      <PipelineStatus
        stage="error"
        failedStage={'processing-llm' as TranscriptionStage}
        progress={0}
        llmStep={0}
        llmLabel=""
        error="rate limit"
      />
    )
    expect(screen.getByText(/summary generation failed/i)).toBeInTheDocument()
  })

  it('shows the error message text', () => {
    render(
      <PipelineStatus
        stage="error"
        failedStage={null}
        progress={0}
        llmStep={0}
        llmLabel=""
        error="Audio file not found"
      />
    )
    expect(screen.getByText(/audio file not found/i)).toBeInTheDocument()
  })

  it('renders Retry button when onRetry is provided', () => {
    const onRetry = vi.fn()
    render(
      <PipelineStatus
        stage="error"
        failedStage={null}
        progress={0}
        llmStep={0}
        llmLabel=""
        error="error"
        onRetry={onRetry}
      />
    )
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('calls onRetry when Retry button is clicked', () => {
    const onRetry = vi.fn()
    render(
      <PipelineStatus
        stage="error"
        failedStage={null}
        progress={0}
        llmStep={0}
        llmLabel=""
        error="error"
        onRetry={onRetry}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('does not render Retry button when onRetry is absent', () => {
    render(
      <PipelineStatus
        stage="error"
        failedStage={null}
        progress={0}
        llmStep={0}
        llmLabel=""
        error="error"
      />
    )
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })
})

describe('PipelineStatus — active pipeline stages', () => {
  it('renders step labels while transcribing', () => {
    render(
      <PipelineStatus
        stage="transcribing"
        failedStage={null}
        progress={42}
        llmStep={0}
        llmLabel=""
        error={null}
      />
    )
    expect(screen.getByText(/transcribe/i)).toBeInTheDocument()
  })
})
