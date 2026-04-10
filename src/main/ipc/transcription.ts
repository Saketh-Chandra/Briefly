import { ipcMain, app } from 'electron'
import { mkdirSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { getMeetingById, updateMeetingStatus } from '../lib/db'
import type { WebContents } from 'electron'

function getPathsHelper(): { userData: string; modelCachePath: string } {
  const userData = app.getPath('userData')
  const modelCachePath = join(userData, 'models')
  return { userData, modelCachePath }
}

function getModelCacheDir(modelId: string, cacheDir: string): string {
  const folder = 'models--' + modelId.replace('/', '--')
  return join(cacheDir, folder)
}

function dirSizeBytes(dirPath: string): number {
  if (!existsSync(dirPath)) return 0
  let total = 0
  const entries = readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dirPath, entry.name)
    if (entry.isDirectory()) total += dirSizeBytes(full)
    else total += statSync(full).size
  }
  return total
}

export function registerTranscriptionHandlers(getSender: () => WebContents | null): void {

  ipcMain.handle('transcription:get-paths', () => {
    const { userData, modelCachePath } = getPathsHelper()
    mkdirSync(modelCachePath, { recursive: true })
    return { userData, modelCachePath }
  })

  ipcMain.handle('transcription:model-status', (_event, modelId: string) => {
    const { modelCachePath } = getPathsHelper()
    const dir = getModelCacheDir(modelId, modelCachePath)
    const present = existsSync(dir)
    const bytes = present ? dirSizeBytes(dir) : 0
    return { present, sizeBytes: bytes }
  })

  ipcMain.handle('transcription:delete-model', async (_event, modelId: string) => {
    const { rmSync } = await import('fs')
    const { modelCachePath } = getPathsHelper()
    const dir = getModelCacheDir(modelId, modelCachePath)
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  })

  ipcMain.handle('transcription:start', async (_event, meetingId: number) => {
    const meeting = getMeetingById(meetingId)
    if (!meeting) throw new Error(`Meeting ${meetingId} not found`)
    if (meeting.status !== 'recorded') {
      throw new Error(`Meeting ${meetingId} is not in 'recorded' state (got '${meeting.status}')`)
    }
    updateMeetingStatus(meetingId, 'transcribing')

    const sender = getSender()
    if (sender && !sender.isDestroyed()) {
      sender.send('transcription:status', { meetingId, status: 'transcribing' })
    }

    return { audioPath: meeting.audio_path }
  })
}

