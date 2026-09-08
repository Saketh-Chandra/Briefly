import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Settings from './Settings'

const { mockInitWhisperWorker, mockWorkerTerminate } = vi.hoisted(() => ({
  mockInitWhisperWorker: vi.fn().mockResolvedValue(undefined),
  mockWorkerTerminate: vi.fn()
}))

vi.mock('../lib/whisper-worker', () => ({
  initWhisperWorker: mockInitWhisperWorker
}))

vi.mock('@/lib/api', () => ({
  api: {
    getSettings: vi.fn(),
    getDiskUsage: vi.fn(),
    getModelStatus: vi.fn(),
    saveSettings: vi.fn(),
    revealInFinder: vi.fn(),
    testLlmConnection: vi.fn(),
    getPaths: vi.fn(),
    deleteModel: vi.fn(),
    clearAllRecordings: vi.fn(),
    testMirror: vi.fn(),
    showNotification: vi.fn()
  }
}))

import { api } from '@/lib/api'

const LOADED_SETTINGS = {
  whisperModel: 'onnx-community/whisper-large-v3-turbo',
  whisperLanguage: 'english',
  llm: {
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    hasApiKey: true
  }
}

function stubWorker(): void {
  vi.stubGlobal(
    'Worker',
    class {
      terminate = mockWorkerTerminate
    }
  )
}

function stubCaches(urls: string[] = []): {
  delete: ReturnType<typeof vi.fn>
} {
  const del = vi.fn().mockResolvedValue(true)
  vi.stubGlobal('caches', {
    open: vi.fn().mockResolvedValue({
      keys: vi.fn().mockResolvedValue(urls.map((url) => ({ url }))),
      match: vi.fn().mockResolvedValue({
        headers: { get: () => '1600000000' },
        arrayBuffer: async () => new ArrayBuffer(0)
      }),
      delete: del
    })
  })
  return { delete: del }
}

async function renderSettings(): Promise<ReturnType<typeof render>> {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    )
  })
  return result
}

function stubLoadedApis(): void {
  vi.mocked(api.getSettings).mockResolvedValue(LOADED_SETTINGS)
  vi.mocked(api.getDiskUsage).mockResolvedValue({
    audioBytes: 1_500_000,
    userData: '/tmp/briefly-data'
  })
  vi.mocked(api.getModelStatus).mockResolvedValue({ present: false, sizeBytes: 0 })
  vi.mocked(api.saveSettings).mockResolvedValue(undefined)
  vi.mocked(api.getPaths).mockResolvedValue({
    userData: '/tmp/briefly-data',
    modelCachePath: '/tmp/models'
  })
  vi.mocked(api.deleteModel).mockResolvedValue(undefined)
  vi.mocked(api.clearAllRecordings).mockResolvedValue(undefined)
  vi.mocked(api.showNotification).mockResolvedValue(undefined)
}

describe('Settings — loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubLoadedApis()
  })

  it('renders the page heading', async () => {
    await renderSettings()
    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument()
  })

  it('loads settings and disk usage on mount', async () => {
    await renderSettings()
    expect(api.getSettings).toHaveBeenCalledOnce()
    expect(api.getDiskUsage).toHaveBeenCalledOnce()
  })

  it('populates LLM fields from saved settings', async () => {
    await renderSettings()
    await waitFor(() =>
      expect(screen.getByLabelText(/base url/i)).toHaveValue('https://api.openai.com/v1')
    )
    expect(screen.getByRole('textbox', { name: /^model$/i })).toHaveValue('gpt-4o')
  })

  it('shows audio disk usage', async () => {
    await renderSettings()
    await waitFor(() => expect(screen.getByText(/1\.5 MB used/i)).toBeInTheDocument())
  })
})

describe('Settings — actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubLoadedApis()
  })

  it('saves LLM settings from the LLM Save button', async () => {
    await renderSettings()
    await waitFor(() =>
      expect(screen.getByLabelText(/base url/i)).toHaveValue('https://api.openai.com/v1')
    )
    fireEvent.click(screen.getAllByRole('button', { name: /^save$/i })[0])
    await waitFor(() =>
      expect(api.saveSettings).toHaveBeenCalledWith({
        llm: { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' }
      })
    )
  })

  it('clears onboardingComplete when Re-run Setup is clicked', async () => {
    await renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /re-run setup/i }))
    await waitFor(() =>
      expect(api.saveSettings).toHaveBeenCalledWith({ onboardingComplete: false })
    )
  })

  it('reveals the app data folder', async () => {
    await renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /reveal in finder/i }))
    expect(api.revealInFinder).toHaveBeenCalledOnce()
  })

  it('shows Test Connection error state when the LLM check fails', async () => {
    vi.mocked(api.testLlmConnection).mockRejectedValue(new Error('401 Unauthorized'))
    await renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))
    await waitFor(() => expect(screen.getByTitle('401 Unauthorized')).toBeInTheDocument())
  })
})

describe('Settings — Whisper model', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubLoadedApis()
    stubWorker()
    mockInitWhisperWorker.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the download control when the model is missing', async () => {
    await renderSettings()
    expect(await screen.findByRole('button', { name: /download model/i })).toBeInTheDocument()
    expect(screen.getByText(/not downloaded/i)).toBeInTheDocument()
  })

  it('downloads the selected model and marks it present', async () => {
    await renderSettings()
    fireEvent.click(await screen.findByRole('button', { name: /download model/i }))
    await waitFor(() =>
      expect(mockInitWhisperWorker).toHaveBeenCalledWith(
        expect.anything(),
        'onnx-community/whisper-large-v3-turbo',
        '/tmp/models',
        expect.objectContaining({ onProgress: expect.any(Function) })
      )
    )
    expect(await screen.findByRole('button', { name: /delete model/i })).toBeInTheDocument()
    expect(api.showNotification).toHaveBeenCalledWith(
      'Model downloaded',
      expect.stringMatching(/ready to use/i)
    )
    expect(mockWorkerTerminate).toHaveBeenCalled()
  })

  it('shows a download error and the Advanced tip when the worker fails', async () => {
    mockInitWhisperWorker.mockRejectedValueOnce(new Error('download blocked by mirror'))
    await renderSettings()
    fireEvent.click(await screen.findByRole('button', { name: /download model/i }))
    expect(await screen.findByText(/download blocked by mirror/i)).toBeInTheDocument()
    expect(screen.getByText(/tip: set a mirror url/i)).toBeInTheDocument()
    expect(api.showNotification).toHaveBeenCalledWith(
      expect.stringMatching(/download failed/i),
      expect.stringMatching(/blocked/i)
    )
  })

  it('cancels an in-flight download', async () => {
    mockInitWhisperWorker.mockImplementation(() => new Promise<void>(() => {}))
    await renderSettings()
    fireEvent.click(await screen.findByRole('button', { name: /download model/i }))
    await waitFor(() => expect(mockInitWhisperWorker).toHaveBeenCalled())
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }))
    expect(mockWorkerTerminate).toHaveBeenCalled()
    expect(api.showNotification).toHaveBeenCalledWith(
      'Download cancelled',
      expect.stringMatching(/stopped/i)
    )
    expect(await screen.findByRole('button', { name: /download model/i })).toBeInTheDocument()
  })

  it('deletes a present model from disk and browser cache', async () => {
    vi.mocked(api.getModelStatus).mockResolvedValue({ present: true, sizeBytes: 1_600_000_000 })
    const cache = stubCaches([
      'https://huggingface.co/onnx-community/whisper-large-v3-turbo/onnx/model.onnx'
    ])
    await renderSettings()
    await waitFor(() => expect(screen.getByText(/downloaded · 1\.60 GB/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /delete model/i }))
    await waitFor(() =>
      expect(api.deleteModel).toHaveBeenCalledWith('onnx-community/whisper-large-v3-turbo')
    )
    expect(cache.delete).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: /download model/i })).toBeInTheDocument()
  })
})

describe('Settings — mirror test UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubLoadedApis()
    Element.prototype.hasPointerCapture = vi.fn()
    Element.prototype.setPointerCapture = vi.fn()
    Element.prototype.releasePointerCapture = vi.fn()
  })

  it('tests a HuggingFace mirror and shows reachable state', async () => {
    const user = userEvent.setup()
    vi.mocked(api.testMirror).mockResolvedValue({ ok: true })
    await renderSettings()
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    const input = await screen.findByLabelText(/huggingface mirror url/i)
    await user.type(input, 'https://hf-mirror.com')
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    await waitFor(() => expect(api.testMirror).toHaveBeenCalledWith('https://hf-mirror.com'))
    expect(await screen.findByText(/reachable/i)).toBeInTheDocument()
  })

  it('shows the mirror error when the ping fails', async () => {
    const user = userEvent.setup()
    vi.mocked(api.testMirror).mockResolvedValue({ ok: false, error: 'Connection refused' })
    await renderSettings()
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    await user.type(
      await screen.findByLabelText(/huggingface mirror url/i),
      'https://bad-mirror.test'
    )
    await user.click(screen.getByRole('button', { name: /^test$/i }))
    expect(await screen.findByTitle('Connection refused')).toBeInTheDocument()
  })
})

describe('Settings — proxy save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubLoadedApis()
  })

  it('saves the default system proxy mode', async () => {
    await renderSettings()
    const section = screen.getByRole('heading', { name: /proxy configuration/i }).closest('section')
    expect(section).toBeTruthy()
    fireEvent.click(within(section as HTMLElement).getByRole('button', { name: /^save$/i }))
    await waitFor(() =>
      expect(api.saveSettings).toHaveBeenCalledWith({ proxy: { mode: 'system' } })
    )
  })

  it('saves a manual HTTP proxy including the HTTPS reuse flag', async () => {
    const user = userEvent.setup()
    await renderSettings()
    await user.click(screen.getByRole('radio', { name: /manual proxy configuration/i }))
    await user.type(screen.getByLabelText(/http proxy/i), 'proxy.example.com')
    await user.type(screen.getAllByLabelText(/^port$/i)[0], '8080')
    await user.click(screen.getByRole('checkbox', { name: /also use this proxy for https/i }))
    const section = screen.getByRole('heading', { name: /proxy configuration/i }).closest('section')
    await user.click(within(section as HTMLElement).getByRole('button', { name: /^save$/i }))
    await waitFor(() =>
      expect(api.saveSettings).toHaveBeenCalledWith({
        proxy: {
          mode: 'manual',
          httpProxy: 'proxy.example.com',
          httpPort: 8080,
          useHttpForHttps: true
        }
      })
    )
  })
})

describe('Settings — clear-all dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubLoadedApis()
    Element.prototype.hasPointerCapture = vi.fn()
    Element.prototype.setPointerCapture = vi.fn()
    Element.prototype.releasePointerCapture = vi.fn()
  })

  it('opens the confirmation dialog and cancels without deleting', async () => {
    const user = userEvent.setup()
    await renderSettings()
    await user.click(screen.getByRole('button', { name: /clear all/i }))
    expect(await screen.findByText(/clear all recordings\?/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))
    await waitFor(() =>
      expect(screen.queryByText(/clear all recordings\?/i)).not.toBeInTheDocument()
    )
    expect(api.clearAllRecordings).not.toHaveBeenCalled()
  })

  it('clears recordings and resets disk usage on confirm', async () => {
    const user = userEvent.setup()
    await renderSettings()
    await waitFor(() => expect(screen.getByText(/1\.5 MB used/i)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /clear all/i }))
    await user.click(await screen.findByRole('button', { name: /delete everything/i }))
    await waitFor(() => expect(api.clearAllRecordings).toHaveBeenCalledOnce())
    expect(await screen.findByText(/0 KB used/i)).toBeInTheDocument()
  })
})
