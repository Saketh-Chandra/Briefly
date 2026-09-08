import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import type { RecordingState } from '../atoms/recording'
import { initialRecordingState } from '../atoms/recording'

const { mockStartRecording, mockStopRecording, mockRecState } = vi.hoisted(() => ({
  mockStartRecording: vi.fn().mockResolvedValue({ meetingId: 42 }),
  mockStopRecording: vi.fn().mockResolvedValue(undefined),
  mockRecState: {
    current: {
      status: 'idle' as RecordingState['status'],
      sessionId: null as string | null,
      meetingId: null as number | null,
      elapsed: 0,
      audioLevel: 0
    }
  }
}))

vi.mock('../contexts/RecordingContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../contexts/RecordingContext')>()
  return {
    ...actual,
    useRecording: () => ({
      state: mockRecState.current,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      toggleRecording: vi.fn()
    })
  }
})

vi.mock('./SourcePicker', () => ({
  default: () => <div data-testid="source-picker" />
}))

import RecordButton from './RecordButton'

function idleRec(overrides: Partial<RecordingState> = {}): RecordingState {
  return { ...initialRecordingState, ...overrides }
}

describe('RecordButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecState.current = idleRec()
    mockStartRecording.mockResolvedValue({ meetingId: 42 })
  })

  it('shows Start Recording and the source picker while idle', () => {
    render(<RecordButton />)
    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument()
    expect(screen.getByTestId('source-picker')).toBeInTheDocument()
  })

  it('starts recording with mixMic and reports the meeting id', async () => {
    const onStarted = vi.fn()
    render(<RecordButton onStarted={onStarted} />)
    fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    await waitFor(() => expect(mockStartRecording).toHaveBeenCalledWith(true))
    expect(onStarted).toHaveBeenCalledWith(42)
  })

  it('does not start while already recording', () => {
    mockRecState.current = idleRec({ status: 'recording', elapsed: 12, audioLevel: 0.4 })
    render(<RecordButton onStarted={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /stop/i }))
    expect(mockStartRecording).not.toHaveBeenCalled()
  })

  it('shows elapsed time and Stop while recording', () => {
    mockRecState.current = idleRec({ status: 'recording', elapsed: 75, audioLevel: 0.5 })
    render(<RecordButton />)
    expect(screen.getByText('01:15')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /stop/i })).toBeEnabled()
    expect(screen.queryByTestId('source-picker')).not.toBeInTheDocument()
  })

  it('formats elapsed time with hours when the session is long', () => {
    mockRecState.current = idleRec({ status: 'recording', elapsed: 3661 })
    render(<RecordButton />)
    expect(screen.getByText('1:01:01')).toBeInTheDocument()
  })

  it('stops an active recording', async () => {
    mockRecState.current = idleRec({ status: 'recording', elapsed: 8 })
    render(<RecordButton />)
    fireEvent.click(screen.getByRole('button', { name: /stop/i }))
    await waitFor(() => expect(mockStopRecording).toHaveBeenCalledOnce())
  })

  it('disables Stop while the session is stopping', () => {
    mockRecState.current = idleRec({ status: 'stopping', elapsed: 8 })
    render(<RecordButton />)
    expect(screen.getByRole('button', { name: /stopping/i })).toBeDisabled()
  })

  it('disables Start Recording while saving', () => {
    mockRecState.current = idleRec({ status: 'saving' })
    render(<RecordButton />)
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
    expect(mockStartRecording).not.toHaveBeenCalled()
  })

  it('does not throw when onStarted is omitted', async () => {
    render(<RecordButton />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    })
    await waitFor(() => expect(mockStartRecording).toHaveBeenCalledWith(true))
  })
})
