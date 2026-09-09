import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Use a unique temp directory per test run to isolate filesystem state
const testDir = join(tmpdir(), `briefly-settings-test-${Date.now()}`)

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => testDir)
  }
}))

// Import after mocking so SETTINGS_PATH() resolves to testDir
import { getSettings, saveSettings } from './settings'

describe('getSettings — defaults', () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
    // Remove any settings file left from previous tests
    const settingsPath = join(testDir, 'settings.json')
    if (existsSync(settingsPath)) rmSync(settingsPath)
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('returns default whisperModel when no settings file exists', () => {
    const settings = getSettings()
    expect(settings.whisperModel).toBe('onnx-community/whisper-large-v3-turbo')
  })

  it('returns default whisperLanguage when no settings file exists', () => {
    const settings = getSettings()
    expect(settings.whisperLanguage).toBe('english')
  })

  it('returns defaults when the settings file contains malformed JSON', () => {
    writeFileSync(join(testDir, 'settings.json'), 'not valid json { }}}', 'utf-8')
    const settings = getSettings()
    expect(settings.whisperModel).toBe('onnx-community/whisper-large-v3-turbo')
  })

  it('returns defaults when the settings file is empty', () => {
    writeFileSync(join(testDir, 'settings.json'), '', 'utf-8')
    const settings = getSettings()
    expect(settings.whisperModel).toBe('onnx-community/whisper-large-v3-turbo')
  })
})

describe('saveSettings + getSettings — persistence', () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
    const settingsPath = join(testDir, 'settings.json')
    if (existsSync(settingsPath)) rmSync(settingsPath)
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('persists a saved setting and reads it back', () => {
    saveSettings({ whisperLanguage: 'french' })
    expect(getSettings().whisperLanguage).toBe('french')
  })

  it('merges saved partial settings with defaults', () => {
    saveSettings({ whisperLanguage: 'spanish' })
    const loaded = getSettings()
    // Default preserved
    expect(loaded.whisperModel).toBe('onnx-community/whisper-large-v3-turbo')
    // Saved value applied
    expect(loaded.whisperLanguage).toBe('spanish')
  })

  it('overwrites a previous save with the latest values', () => {
    saveSettings({ whisperLanguage: 'french' })
    saveSettings({ whisperLanguage: 'german' })
    expect(getSettings().whisperLanguage).toBe('german')
  })

  it('persists nested llm settings', () => {
    saveSettings({ llm: { baseURL: 'https://my-api.example.com/v1', model: 'gpt-3.5-turbo' } })
    const loaded = getSettings()
    expect(loaded.llm.baseURL).toBe('https://my-api.example.com/v1')
    expect(loaded.llm.model).toBe('gpt-3.5-turbo')
  })

  it('writes a valid JSON file to disk', () => {
    saveSettings({ whisperLanguage: 'italian' })
    const raw = readFileSync(join(testDir, 'settings.json'), 'utf-8')
    expect(() => JSON.parse(raw)).not.toThrow()
  })
})
