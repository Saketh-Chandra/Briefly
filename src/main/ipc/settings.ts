import { ipcMain, net } from 'electron'
import { getSettings, saveSettings } from '../lib/settings'
import { getApiKey, setApiKey } from '../lib/keychain'
import { applyProxy } from '../lib/proxy'
import type { AppSettings } from '../lib/types'

export function registerSettingsHandlers(): void {

  ipcMain.handle('settings:get', async () => {
    const settings = getSettings()
    // Return a boolean only — never send the raw key to the renderer
    const hasApiKey = !!(await getApiKey('llm-api-key'))
    return { ...settings, llm: { ...settings.llm, hasApiKey } }
  })

  ipcMain.handle('settings:save', async (
    _event,
    partial: Partial<AppSettings> & { llmApiKey?: string }
  ) => {
    const { llmApiKey, ...rest } = partial
    if (llmApiKey !== undefined) {
      await setApiKey('llm-api-key', llmApiKey)
    }
    saveSettings(rest)
    await applyProxy(getSettings().proxy)
  })

  ipcMain.handle('hf:test-mirror', async (_event, endpoint: string): Promise<{ ok: boolean; error?: string }> => {
    const base = endpoint.trim().replace(/\/$/, '')
    const url = `${base}/onnx-community/whisper-tiny/resolve/main/config.json`
    try {
      const res = await net.fetch(url, {
        method: 'HEAD',
        // Follow redirects (hf-mirror returns 307)
        redirect: 'follow',
      })
      if (!res.ok && res.status !== 307) {
        return { ok: false, error: `HTTP ${res.status} ${res.statusText}` }
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

// Internal helper — used only from main process (Phase 2 LLM client), not exposed to renderer
export async function getLlmApiKey(): Promise<string | null> {
  return getApiKey('llm-api-key')
}
