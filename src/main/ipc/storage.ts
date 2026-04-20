import { ipcMain, app, shell, clipboard, nativeImage } from 'electron'
import { existsSync, readdirSync, statSync } from 'fs'
import { rmSync } from 'fs'
import { join } from 'path'
import {
  getMeetings,
  getMeetingDetail,
  deleteMeeting,
  insertTranscript,
  getTranscript,
  updateTodo,
  updateJournal,
  resetMeetingForReprocessing,
  getMeetingsByDate
} from '../lib/db'

export function registerStorageHandlers(): void {
  ipcMain.handle('storage:get-meetings', () => {
    return getMeetings()
  })

  ipcMain.handle('storage:get-meeting', (_event, id: number) => {
    return getMeetingDetail(id)
  })

  ipcMain.handle('storage:delete-meeting', (_event, id: number) => {
    const detail = getMeetingDetail(id)
    if (detail) {
      const sessionDir = join(app.getPath('userData'), 'recordings', detail.session_id)
      if (existsSync(sessionDir)) {
        rmSync(sessionDir, { recursive: true, force: true })
      }
    }
    deleteMeeting(id)
  })

  ipcMain.handle(
    'storage:save-transcript',
    (
      _event,
      params: {
        meetingId: number
        content: string
        chunks: import('../lib/types').TranscriptChunk[] | null
        model: string
      }
    ) => {
      insertTranscript(params)
    }
  )

  ipcMain.handle('storage:get-transcript', (_event, meetingId: number) => {
    return getTranscript(meetingId)
  })

  ipcMain.handle(
    'storage:update-todo',
    (_event, meetingId: number, index: number, done: boolean) => {
      updateTodo(meetingId, index, done)
    }
  )

  ipcMain.handle('storage:update-journal', (_event, meetingId: number, journal: string) => {
    updateJournal(meetingId, journal)
  })

  ipcMain.handle('storage:reset-for-reprocessing', (_event, meetingId: number) => {
    resetMeetingForReprocessing(meetingId)
  })

  ipcMain.handle('storage:get-meetings-by-date', (_event, date: string) => {
    return getMeetingsByDate(date)
  })

  ipcMain.handle('storage:read-audio', async (_event, audioPath: string): Promise<ArrayBuffer> => {
    const { readFileSync, existsSync: exists } = await import('fs')
    if (!exists(audioPath)) throw new Error(`Audio file not found: ${audioPath}`)
    const buf = readFileSync(audioPath)
    // Slice to get a clean ArrayBuffer regardless of Buffer pool offset
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  })

  ipcMain.handle('storage:get-disk-usage', () => {
    const userData = app.getPath('userData')
    const sessionsDir = join(userData, 'recordings')
    let audioBytes = 0
    if (existsSync(sessionsDir)) {
      for (const session of readdirSync(sessionsDir, { withFileTypes: true })) {
        if (!session.isDirectory()) continue
        const sessionPath = join(sessionsDir, session.name)
        for (const file of readdirSync(sessionPath, { withFileTypes: true })) {
          if (file.isFile()) audioBytes += statSync(join(sessionPath, file.name)).size
        }
      }
    }
    return { audioBytes, userData }
  })

  ipcMain.handle('storage:reveal-in-finder', async () => {
    const userData = app.getPath('userData')
    await shell.openPath(userData)
  })

  ipcMain.handle('storage:clear-all', () => {
    const all = getMeetings()
    for (const m of all) {
      deleteMeeting(m.id)
    }
  })

  ipcMain.handle(
    'storage:read-screenshot',
    async (_event, screenshotPath: string): Promise<string> => {
      const { readFileSync, existsSync: exists } = await import('fs')
      // Restrict reads to within the app's userData directory to prevent path traversal
      const allowed = app.getPath('userData')
      if (!screenshotPath.startsWith(allowed)) {
        throw new Error('Access denied: path is outside userData')
      }
      if (!exists(screenshotPath)) throw new Error(`Screenshot not found: ${screenshotPath}`)
      const buf = readFileSync(screenshotPath)
      return `data:image/png;base64,${buf.toString('base64')}`
    }
  )

  ipcMain.handle('clipboard:write-image', (_event, dataUrl: string): void => {
    const image = nativeImage.createFromDataURL(dataUrl)
    clipboard.writeImage(image)
  })
}
