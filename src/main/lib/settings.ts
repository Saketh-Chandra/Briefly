import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { AppSettings } from './types'

const SETTINGS_PATH = (): string => join(app.getPath('userData'), 'settings.json')

const DEFAULTS: AppSettings = {
  whisperModel: 'onnx-community/whisper-large-v3-turbo',
  whisperLanguage: 'english',
  llm: {
    baseURL: '',
    model: 'gpt-4o'
  }
}

export function getSettings(): AppSettings {
  const path = SETTINGS_PATH()
  if (!existsSync(path)) return { ...DEFAULTS }
  try {
    const raw = readFileSync(path, 'utf-8')
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(partial: Partial<AppSettings>): void {
  const current = getSettings()
  const updated = { ...current, ...partial }
  writeFileSync(SETTINGS_PATH(), JSON.stringify(updated, null, 2), 'utf-8')
}
