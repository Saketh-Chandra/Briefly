import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { MeetingDetail, CaptureEvent } from '../../../main/lib/types'
import type { TranscriptionState } from '../atoms/transcription'
import { initialTranscriptionState } from '../atoms/transcription'

const { mockStartPipeline, mockReset, mockTxState } = vi.hoisted(() => ({
  mockStartPipeline: vi.fn().mockResolvedValue(undefined),
  mockReset: vi.fn(),
  mockTxState: {
    current: {
      meetingId: null as number | null,
      stage: 'idle' as TranscriptionState['stage'],
      failedStage: null as TranscriptionState['failedStage'],
      progress: 0,
      chunks: [] as TranscriptionState['chunks'],
      error: null as string | null,
      llmStep: 0,
      llmLabel: ''
    }
  }
}))

vi.mock('../contexts/TranscriptionContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../contexts/TranscriptionContext')>()
  return {
    ...actual,
    useTranscription: () => ({
      state: mockTxState.current,
      startPipeline: mockStartPipeline,
      reset: mockReset
    })
  }
})

vi.mock('@/lib/api', () => ({
  api: {
    getMeeting: vi.fn(),
    deleteMeeting: vi.fn(),
    resetForReprocessing: vi.fn(),
    onCaptureEvent: vi.fn(() => () => {}),
    onTranscriptionStatus: vi.fn(() => () => {}),
    onLlmDone: vi.fn(() => () => {}),
    readScreenshot: vi.fn(),
    writeImageToClipboard: vi.fn(),
    updateTodo: vi.fn(),
    updateJournal: vi.fn()
  }
}))

import { api } from '@/lib/api'
import Transcript from './Transcript'

function idleTx(overrides: Partial<TranscriptionState> = {}): TranscriptionState {
  return { ...initialTranscriptionState, ...overrides }
}

function makeDetail(overrides: Partial<MeetingDetail> = {}): MeetingDetail {
  return {
    id: 42,
    session_id: 'sess-1',
    title: 'Sprint Standup',
    date: '2024-06-15T10:00:00.000Z',
    duration_s: 120,
    audio_path: '/tmp/audio.webm',
    status: 'done',
    created_at: '2024-06-15T10:00:00.000Z',
    updated_at: '2024-06-15T10:00:00.000Z',
    transcript: {
      content: 'Hello world',
      chunks: [{ text: 'Hello world', start: 5, end: 8 }],
      model: 'whisper'
    },
    summary: {
      summary: 'We discussed the sprint.',
      todos: [
        { text: 'Ship the fix', owner: 'Alex', deadline: null, priority: 'high', done: false }
      ],
      key_decisions: ['Ship Friday'],
      participants: ['Alex', 'Sam'],
      journal: 'Good meeting.'
    },
    screenshots: [],
    ...overrides
  }
}

async function renderTranscript(path = '/recordings/42'): Promise<ReturnType<typeof render>> {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/recordings/:id" element={<Transcript />} />
          <Route path="/recordings" element={<div>Recordings list</div>} />
        </Routes>
      </MemoryRouter>
    )
  })
  return result
}

describe('Transcript', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTxState.current = idleTx()
    mockStartPipeline.mockResolvedValue(undefined)
    vi.mocked(api.getMeeting).mockResolvedValue(makeDetail())
    vi.mocked(api.deleteMeeting).mockResolvedValue(undefined)
    vi.mocked(api.resetForReprocessing).mockResolvedValue(undefined)
    vi.mocked(api.onCaptureEvent).mockReturnValue(() => {})
    vi.mocked(api.onTranscriptionStatus).mockReturnValue(() => {})
    vi.mocked(api.onLlmDone).mockReturnValue(() => {})
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) }
    })
    Element.prototype.hasPointerCapture = vi.fn()
    Element.prototype.setPointerCapture = vi.fn()
    Element.prototype.releasePointerCapture = vi.fn()
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('shows a loading state before the meeting resolves', async () => {
    let resolveMeeting!: (value: MeetingDetail | null) => void
    vi.mocked(api.getMeeting).mockReturnValue(
      new Promise((resolve) => {
        resolveMeeting = resolve
      })
    )
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/recordings/42']}>
          <Routes>
            <Route path="/recordings/:id" element={<Transcript />} />
          </Routes>
        </MemoryRouter>
      )
    })
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    await act(async () => {
      resolveMeeting(makeDetail())
    })
    await waitFor(() => expect(screen.getByText('Sprint Standup')).toBeInTheDocument())
  })

  it('shows not-found when getMeeting returns null', async () => {
    vi.mocked(api.getMeeting).mockResolvedValue(null)
    await renderTranscript()
    expect(screen.getByText(/meeting not found/i)).toBeInTheDocument()
  })

  it('loads the meeting from the route id', async () => {
    await renderTranscript()
    expect(api.getMeeting).toHaveBeenCalledWith(42)
    expect(screen.getByRole('heading', { name: 'Sprint Standup' })).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('falls back to Untitled Meeting when the title is missing', async () => {
    vi.mocked(api.getMeeting).mockResolvedValue(makeDetail({ title: null }))
    await renderTranscript()
    expect(screen.getByRole('heading', { name: /untitled meeting/i })).toBeInTheDocument()
  })

  it('renders transcript text on the default tab', async () => {
    await renderTranscript()
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('shows an empty transcript message when there is no content yet', async () => {
    vi.mocked(api.getMeeting).mockResolvedValue(
      makeDetail({ transcript: null, status: 'transcribed' })
    )
    await renderTranscript()
    expect(screen.getByText(/no transcript available yet/i)).toBeInTheDocument()
  })

  it('does not auto-start the pipeline for a finished meeting', async () => {
    await renderTranscript()
    expect(mockStartPipeline).not.toHaveBeenCalled()
  })

  it('auto-starts the pipeline once status is recorded', async () => {
    vi.mocked(api.getMeeting).mockResolvedValue(
      makeDetail({ status: 'recorded', transcript: null })
    )
    await renderTranscript()
    await waitFor(() => expect(mockStartPipeline).toHaveBeenCalledWith(42))
  })

  it('does not auto-start while the meeting is still recording', async () => {
    vi.mocked(api.getMeeting).mockResolvedValue(
      makeDetail({ status: 'recording', transcript: null })
    )
    await renderTranscript()
    expect(mockStartPipeline).not.toHaveBeenCalled()
  })

  it('hides the re-run control while recording or waiting to process', async () => {
    vi.mocked(api.getMeeting).mockResolvedValue(makeDetail({ status: 'recorded' }))
    await renderTranscript()
    expect(screen.queryByRole('button', { name: /re-run pipeline/i })).not.toBeInTheDocument()
  })

  it('re-runs the pipeline: reset, resetForReprocessing, reload, start', async () => {
    await renderTranscript()
    fireEvent.click(screen.getByRole('button', { name: /re-run pipeline/i }))
    await waitFor(() => {
      expect(mockReset).toHaveBeenCalledOnce()
      expect(api.resetForReprocessing).toHaveBeenCalledWith(42)
      expect(mockStartPipeline).toHaveBeenCalledWith(42)
    })
    expect(vi.mocked(api.getMeeting).mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('shows a pipeline error banner and retries through onRetry', async () => {
    mockTxState.current = idleTx({
      meetingId: 42,
      stage: 'error',
      failedStage: 'transcribing',
      error: 'audio file missing'
    })
    vi.mocked(api.getMeeting).mockResolvedValue(makeDetail({ status: 'error' }))
    await renderTranscript()
    expect(screen.getByText(/transcription failed/i)).toBeInTheDocument()
    expect(screen.getByText(/audio file missing/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => {
      expect(mockReset).toHaveBeenCalledOnce()
      expect(api.resetForReprocessing).toHaveBeenCalledWith(42)
      expect(mockStartPipeline).toHaveBeenCalledWith(42)
    })
  })

  it('shows live pipeline progress and hides re-run while active', async () => {
    mockTxState.current = idleTx({
      meetingId: 42,
      stage: 'transcribing',
      progress: 40,
      chunks: [{ text: 'partial', start: 0, end: 1 }]
    })
    vi.mocked(api.getMeeting).mockResolvedValue(makeDetail({ status: 'transcribing' }))
    await renderTranscript()
    expect(screen.getByText(/transcribe/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /re-run pipeline/i })).not.toBeInTheDocument()
    expect(screen.getByText('partial')).toBeInTheDocument()
  })

  it('copies timestamped transcript chunks to the clipboard', async () => {
    await renderTranscript()
    fireEvent.click(screen.getByRole('button', { name: /copy transcript/i }))
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('[00:05] Hello world')
    )
  })

  it('copies plain transcript content when chunks are missing', async () => {
    vi.mocked(api.getMeeting).mockResolvedValue(
      makeDetail({
        transcript: { content: 'Plain notes', chunks: null, model: 'whisper' }
      })
    )
    await renderTranscript()
    fireEvent.click(screen.getByRole('button', { name: /copy transcript/i }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Plain notes'))
  })

  it('deletes the meeting and returns to the recordings list', async () => {
    await renderTranscript()
    fireEvent.click(screen.getByRole('button', { name: /delete meeting/i }))
    expect(await screen.findByText(/delete recording/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.deleteMeeting).toHaveBeenCalledWith(42))
    expect(await screen.findByText('Recordings list')).toBeInTheDocument()
  })

  it('reloads when a capture session stops', async () => {
    let captureCb: ((event: CaptureEvent) => void) | undefined
    vi.mocked(api.onCaptureEvent).mockImplementation((cb) => {
      captureCb = cb
      return () => {}
    })
    await renderTranscript()
    expect(api.getMeeting).toHaveBeenCalledTimes(1)
    await act(async () => {
      captureCb?.({ type: 'stopped', duration_s: 12, path: '/tmp/audio.webm' })
    })
    await waitFor(() => expect(api.getMeeting).toHaveBeenCalledTimes(2))
  })

  it('reloads on transcription status for this meeting only', async () => {
    let statusCb: ((event: { meetingId: number; status: string }) => void) | undefined
    vi.mocked(api.onTranscriptionStatus).mockImplementation((cb) => {
      statusCb = cb
      return () => {}
    })
    await renderTranscript()
    await act(async () => {
      statusCb?.({ meetingId: 99, status: 'done' })
    })
    expect(api.getMeeting).toHaveBeenCalledTimes(1)
    await act(async () => {
      statusCb?.({ meetingId: 42, status: 'done' })
    })
    await waitFor(() => expect(api.getMeeting).toHaveBeenCalledTimes(2))
  })

  it('reloads when LLM processing finishes for this meeting', async () => {
    let doneCb: ((event: { meetingId: number }) => void) | undefined
    vi.mocked(api.onLlmDone).mockImplementation((cb) => {
      doneCb = cb
      return () => {}
    })
    await renderTranscript()
    await act(async () => {
      doneCb?.({ meetingId: 42 })
    })
    await waitFor(() => expect(api.getMeeting).toHaveBeenCalledTimes(2))
  })

  it('shows summary content on the Summary tab', async () => {
    const user = userEvent.setup()
    await renderTranscript()
    await user.click(screen.getByRole('tab', { name: /summary/i }))
    expect(await screen.findByText(/we discussed the sprint/i)).toBeInTheDocument()
    expect(screen.getByText('Alex')).toBeInTheDocument()
    expect(screen.getByText('Ship Friday')).toBeInTheDocument()
  })

  it('shows an empty screenshots message when none were captured', async () => {
    const user = userEvent.setup()
    await renderTranscript()
    await user.click(screen.getByRole('tab', { name: /screenshots/i }))
    expect(await screen.findByText(/no screenshots taken/i)).toBeInTheDocument()
  })

  it('loads screenshot previews when the Screenshots tab is opened', async () => {
    const user = userEvent.setup()
    vi.mocked(api.getMeeting).mockResolvedValue(
      makeDetail({
        screenshots: [{ path: '/tmp/shot.png', taken_at: '2024-06-15T10:01:00.000Z' }]
      })
    )
    vi.mocked(api.readScreenshot).mockResolvedValue('data:image/png;base64,abc')
    await renderTranscript()
    await user.click(screen.getByRole('tab', { name: /screenshots/i }))
    await waitFor(() => expect(api.readScreenshot).toHaveBeenCalledWith('/tmp/shot.png'))
    expect(await screen.findByAltText(/screenshot 1/i)).toBeInTheDocument()
  })
})

const SHOTS = [
  { path: '/tmp/shot-1.png', taken_at: '2024-06-15T10:01:00.000Z' },
  { path: '/tmp/shot-2.png', taken_at: '2024-06-15T10:02:00.000Z' },
  { path: '/tmp/shot-3.png', taken_at: '2024-06-15T10:03:00.000Z' }
]

async function openLightbox(count = 2): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup()
  vi.mocked(api.getMeeting).mockResolvedValue(makeDetail({ screenshots: SHOTS.slice(0, count) }))
  vi.mocked(api.readScreenshot).mockImplementation(async (p) => `data:image/png;base64,${p}`)
  vi.mocked(api.writeImageToClipboard).mockResolvedValue(undefined)
  await renderTranscript()
  await user.click(screen.getByRole('tab', { name: /screenshots/i }))
  await waitFor(() => expect(api.readScreenshot).toHaveBeenCalled())
  await user.click(await screen.findByRole('button', { name: /open screenshot 1/i }))
  expect(await screen.findByRole('button', { name: /^close$/i })).toBeInTheDocument()
  return user
}

describe('Transcript — screenshot lightbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTxState.current = idleTx()
    mockStartPipeline.mockResolvedValue(undefined)
    vi.mocked(api.getMeeting).mockResolvedValue(makeDetail())
    vi.mocked(api.deleteMeeting).mockResolvedValue(undefined)
    vi.mocked(api.resetForReprocessing).mockResolvedValue(undefined)
    vi.mocked(api.onCaptureEvent).mockReturnValue(() => {})
    vi.mocked(api.onTranscriptionStatus).mockReturnValue(() => {})
    vi.mocked(api.onLlmDone).mockReturnValue(() => {})
    Element.prototype.hasPointerCapture = vi.fn()
    Element.prototype.setPointerCapture = vi.fn()
    Element.prototype.releasePointerCapture = vi.fn()
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('opens the overlay with the selected image and counter', async () => {
    await openLightbox(2)
    expect(screen.getByText(/01\s*\/\s*02/)).toBeInTheDocument()
    expect(screen.getAllByAltText(/screenshot 1/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /previous screenshot/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next screenshot/i })).toBeInTheDocument()
  })

  it('advances with the next arrow and hides it on the last image', async () => {
    const user = await openLightbox(2)
    await user.click(screen.getByRole('button', { name: /next screenshot/i }))
    expect(await screen.findByText(/02\s*\/\s*02/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /previous screenshot/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next screenshot/i })).not.toBeInTheDocument()
  })

  it('navigates with arrow keys and closes on Escape', async () => {
    await openLightbox(3)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    })
    expect(await screen.findByText(/02\s*\/\s*03/)).toBeInTheDocument()
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    })
    expect(await screen.findByText(/01\s*\/\s*03/)).toBeInTheDocument()
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^close$/i })).not.toBeInTheDocument()
    )
  })

  it('jumps via the filmstrip and closes from the Close button', async () => {
    const user = await openLightbox(2)
    await user.click(screen.getByRole('button', { name: /view screenshot 2 of 2/i }))
    expect(await screen.findByText(/02\s*\/\s*02/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^close$/i }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^close$/i })).not.toBeInTheDocument()
    )
  })

  it('does not show a filmstrip or arrows for a single screenshot', async () => {
    await openLightbox(1)
    expect(screen.getByText(/01\s*\/\s*01/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /previous screenshot/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next screenshot/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view screenshot/i })).not.toBeInTheDocument()
  })

  it('copies the image through the IPC clipboard seam', async () => {
    const user = await openLightbox(1)
    await user.click(screen.getByRole('button', { name: /^copy$/i }))
    await waitFor(() =>
      expect(api.writeImageToClipboard).toHaveBeenCalledWith(
        'data:image/png;base64,/tmp/shot-1.png'
      )
    )
  })

  it('toggles the image info panel', async () => {
    const user = await openLightbox(1)
    expect(screen.queryByText(/image details/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^info$/i }))
    expect(await screen.findByText(/image details/i)).toBeInTheDocument()
    expect(screen.getByText(/format & size/i)).toBeInTheDocument()
  })

  it('exposes a download link for the current image', async () => {
    await openLightbox(1)
    const link = screen.getByRole('link', { name: /^download$/i })
    expect(link).toHaveAttribute('href', 'data:image/png;base64,/tmp/shot-1.png')
    expect(link).toHaveAttribute('download', expect.stringMatching(/briefly-screenshot-.*\.png/))
  })

  it('closes when the overlay backdrop is clicked', async () => {
    await openLightbox(1)
    fireEvent.click(document.querySelector('.lightbox-overlay') as HTMLElement)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^close$/i })).not.toBeInTheDocument()
    )
  })
})
