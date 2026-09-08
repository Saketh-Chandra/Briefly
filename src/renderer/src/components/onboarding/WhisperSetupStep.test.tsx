import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import WhisperSetupStep from './WhisperSetupStep'

const { mockInitWhisperWorker, mockWorkerTerminate } = vi.hoisted(() => ({
  mockInitWhisperWorker: vi.fn().mockResolvedValue(undefined),
  mockWorkerTerminate: vi.fn()
}))

vi.mock('../../lib/whisper-worker', () => ({
  initWhisperWorker: mockInitWhisperWorker
}))

vi.mock('@/lib/api', () => ({
  api: {
    getPaths: vi.fn()
  }
}))

import { api } from '@/lib/api'

const defaultProps = {
  selectedModel: 'onnx-community/whisper-tiny',
  onModelChange: vi.fn(),
  onReady: vi.fn(),
  stepNumber: 3,
  totalSteps: 5
}

function stubWorker(): void {
  vi.stubGlobal(
    'Worker',
    class {
      terminate = mockWorkerTerminate
    }
  )
}

describe('WhisperSetupStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubWorker()
    mockInitWhisperWorker.mockResolvedValue(undefined)
    vi.mocked(api.getPaths).mockResolvedValue({
      userData: '/tmp/briefly-data',
      modelCachePath: '/tmp/models'
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the step heading and download control', async () => {
    await act(async () => {
      render(<WhisperSetupStep {...defaultProps} />)
    })
    expect(screen.getByText(/step 3 of 5/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /download a whisper model/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download whisper tiny/i })).toBeInTheDocument()
  })

  it('downloads the selected model and reports ready', async () => {
    await act(async () => {
      render(<WhisperSetupStep {...defaultProps} />)
    })
    fireEvent.click(screen.getByRole('button', { name: /download whisper tiny/i }))
    await waitFor(() =>
      expect(mockInitWhisperWorker).toHaveBeenCalledWith(
        expect.anything(),
        'onnx-community/whisper-tiny',
        '/tmp/models',
        expect.objectContaining({ onProgress: expect.any(Function) })
      )
    )
    expect(await screen.findByText(/whisper tiny \(~38 mb\) is ready/i)).toBeInTheDocument()
    expect(defaultProps.onReady).toHaveBeenCalledWith(true)
    expect(mockWorkerTerminate).toHaveBeenCalled()
  })

  it('shows a truncated error and retry control when download fails', async () => {
    mockInitWhisperWorker.mockRejectedValueOnce(new Error('huggingface.co appears to be blocked'))
    await act(async () => {
      render(<WhisperSetupStep {...defaultProps} />)
    })
    fireEvent.click(screen.getByRole('button', { name: /download whisper tiny/i }))
    expect(await screen.findByText(/huggingface\.co appears to be blocked/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry download/i })).toBeInTheDocument()
    expect(defaultProps.onReady).toHaveBeenCalledWith(false)
  })

  it('cancels an in-flight download', async () => {
    mockInitWhisperWorker.mockImplementation(() => new Promise<void>(() => {}))
    await act(async () => {
      render(<WhisperSetupStep {...defaultProps} />)
    })
    fireEvent.click(screen.getByRole('button', { name: /download whisper tiny/i }))
    await waitFor(() => expect(mockInitWhisperWorker).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(mockWorkerTerminate).toHaveBeenCalled()
    expect(
      await screen.findByRole('button', { name: /download whisper tiny/i })
    ).toBeInTheDocument()
    expect(defaultProps.onReady).toHaveBeenCalledWith(false)
  })

  it('marks the model ready when it is already in the browser cache', async () => {
    vi.stubGlobal('caches', {
      open: vi.fn().mockResolvedValue({
        keys: vi
          .fn()
          .mockResolvedValue([
            { url: 'https://huggingface.co/onnx-community/whisper-tiny/onnx/model.onnx' }
          ])
      })
    })
    await act(async () => {
      render(<WhisperSetupStep {...defaultProps} />)
    })
    expect(await screen.findByText(/whisper tiny \(~38 mb\) is ready/i)).toBeInTheDocument()
    expect(defaultProps.onReady).toHaveBeenCalledWith(true)
    expect(mockInitWhisperWorker).not.toHaveBeenCalled()
  })
})
