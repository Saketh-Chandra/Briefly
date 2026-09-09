import { describe, it, expect, vi, beforeEach } from 'vitest'

const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()

const { mockFetch, mockOpenExternal, mockRelease } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockOpenExternal: vi.fn().mockResolvedValue(undefined),
  mockRelease: vi.fn(() => '23.2.0')
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
    on: vi.fn()
  },
  net: {
    fetch: mockFetch
  },
  shell: {
    openExternal: mockOpenExternal
  }
}))

vi.mock('os', () => ({
  release: mockRelease
}))

const { mockGetSettings, mockSaveSettings } = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
  mockSaveSettings: vi.fn()
}))
vi.mock('../lib/settings', () => ({
  getSettings: mockGetSettings,
  saveSettings: mockSaveSettings
}))

const { mockGetApiKey, mockSetApiKey } = vi.hoisted(() => ({
  mockGetApiKey: vi.fn<() => Promise<string | null>>().mockResolvedValue(null),
  mockSetApiKey: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../lib/keychain', () => ({
  getApiKey: mockGetApiKey,
  setApiKey: mockSetApiKey
}))

const { mockApplyProxy } = vi.hoisted(() => ({
  mockApplyProxy: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../lib/proxy', () => ({
  applyProxy: mockApplyProxy
}))

import { registerSettingsHandlers, getLlmApiKey } from './settings'

const DEFAULT_SETTINGS = {
  whisperModel: 'onnx-community/whisper-large-v3-turbo',
  whisperLanguage: 'english',
  llm: { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' },
  proxy: { mode: 'system' as const }
}

function invoke(channel: string, ...args: unknown[]): unknown {
  const h = handlers.get(channel)
  if (!h) throw new Error(`No handler registered for channel: ${channel}`)
  return h(null, ...args)
}

describe('settings IPC', () => {
  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    mockGetSettings.mockReturnValue({ ...DEFAULT_SETTINGS, llm: { ...DEFAULT_SETTINGS.llm } })
    mockGetApiKey.mockResolvedValue(null)
    mockRelease.mockReturnValue('23.2.0')
    registerSettingsHandlers()
  })

  describe('settings:get', () => {
    it('returns hasApiKey false when no key is stored', async () => {
      mockGetApiKey.mockResolvedValueOnce(null)
      const result = (await invoke('settings:get')) as { llm: { hasApiKey: boolean } }
      expect(result.llm.hasApiKey).toBe(false)
    })

    it('returns hasApiKey true without leaking the raw key', async () => {
      mockGetApiKey.mockResolvedValueOnce('sk-secret-value')
      const result = await invoke('settings:get')
      const serialized = JSON.stringify(result)
      expect(serialized).not.toContain('sk-secret-value')
      expect((result as { llm: { hasApiKey: boolean } }).llm.hasApiKey).toBe(true)
    })

    it('includes persisted settings fields', async () => {
      const result = (await invoke('settings:get')) as typeof DEFAULT_SETTINGS
      expect(result.whisperModel).toBe(DEFAULT_SETTINGS.whisperModel)
      expect(result.llm.baseURL).toBe(DEFAULT_SETTINGS.llm.baseURL)
    })
  })

  describe('settings:save', () => {
    it('persists settings and reapplies the current proxy', async () => {
      await invoke('settings:save', { whisperLanguage: 'french' })
      expect(mockSaveSettings).toHaveBeenCalledWith({ whisperLanguage: 'french' })
      expect(mockApplyProxy).toHaveBeenCalledWith(DEFAULT_SETTINGS.proxy)
    })

    it('stores the API key when llmApiKey is provided', async () => {
      await invoke('settings:save', {
        llmApiKey: 'sk-new',
        llm: { baseURL: 'https://x', model: 'm' }
      })
      expect(mockSetApiKey).toHaveBeenCalledWith('llm-api-key', 'sk-new')
      expect(mockSaveSettings).toHaveBeenCalledWith({ llm: { baseURL: 'https://x', model: 'm' } })
    })

    it('does not touch the keychain when llmApiKey is omitted', async () => {
      await invoke('settings:save', { whisperLanguage: 'german' })
      expect(mockSetApiKey).not.toHaveBeenCalled()
    })
  })

  describe('hf:test-mirror', () => {
    it('HEAD-fetches the tiny model config with trailing slash stripped', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' })
      const result = await invoke('hf:test-mirror', 'https://hf-mirror.com/')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://hf-mirror.com/onnx-community/whisper-tiny/resolve/main/config.json',
        { method: 'HEAD', redirect: 'follow' }
      )
      expect(result).toEqual({ ok: true })
    })

    it('treats HTTP 307 as success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 307, statusText: 'Temporary Redirect' })
      const result = await invoke('hf:test-mirror', 'https://hf-mirror.com')
      expect(result).toEqual({ ok: true })
    })

    it('returns an error for a non-ok HTTP status', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' })
      const result = await invoke('hf:test-mirror', 'https://example.com')
      expect(result).toEqual({ ok: false, error: 'HTTP 404 Not Found' })
    })

    it('returns the error message when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network down'))
      const result = await invoke('hf:test-mirror', 'https://example.com')
      expect(result).toEqual({ ok: false, error: 'network down' })
    })
  })

  describe('platform:os-info', () => {
    it('returns the Darwin version from os.release', async () => {
      mockRelease.mockReturnValue('22.6.0')
      const result = await invoke('platform:os-info')
      expect(result).toEqual({ darwinVersion: '22.6.0' })
    })
  })

  describe('system:open-screen-recording-settings', () => {
    it('opens the fixed Screen Recording privacy URL', async () => {
      await invoke('system:open-screen-recording-settings')
      expect(mockOpenExternal).toHaveBeenCalledWith(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
      )
    })
  })

  describe('getLlmApiKey', () => {
    it('reads the llm-api-key account from the keychain', async () => {
      mockGetApiKey.mockResolvedValueOnce('sk-from-keychain')
      await expect(getLlmApiKey()).resolves.toBe('sk-from-keychain')
      expect(mockGetApiKey).toHaveBeenCalledWith('llm-api-key')
    })
  })
})
