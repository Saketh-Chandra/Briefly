import { ipcMain, app, desktopCapturer, systemPreferences, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { mkdirSync, appendFileSync, writeFileSync, copyFileSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import {
  insertMeeting,
  updateMeetingDuration,
  updateMeetingStatus,
  insertScreenshot
} from '../lib/db'
import { notifyRecordingSaved } from '../lib/notifications'
import { updateTrayState } from '../lib/tray'
import type { CaptureSource } from '../lib/types'

// Injected by index.ts after the window is created
let _getWindow: () => import('electron').BrowserWindow | null = () => null
export function setTrayWindowGetter(fn: () => import('electron').BrowserWindow | null): void {
  _getWindow = fn
}

// Holds the sourceId chosen by the renderer just before calling getDisplayMedia.
// Consumed (and cleared) by the setDisplayMediaRequestHandler in index.ts.
let _pendingSourceId: string | null = null
export function claimPendingSourceId(): string | null {
  const id = _pendingSourceId
  _pendingSourceId = null
  return id
}

// Active session state (one session at a time)
let activeMeetingId: number | null = null
let activeSessionId: string | null = null
let screenshotCounter = 0

export function registerCaptureHandlers(): void {
  // ── Source listing ─────────────────────────────────────────────────────────
  ipcMain.handle('capture:get-sources', async (): Promise<CaptureSource[]> => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 160, height: 90 },
      fetchWindowIcons: true
    })

    // Exclude Briefly's own windows from the picker
    const ownTitles = new Set(BrowserWindow.getAllWindows().map((w) => w.getTitle()))

    return sources
      .filter((s) => s.id.startsWith('screen:') || !ownTitles.has(s.name))
      .map((s) => ({
        id: s.id,
        name: s.name,
        display_id: s.display_id,
        thumbnail: s.thumbnail.toDataURL(),
        appIcon: s.appIcon?.toDataURL() ?? null
      }))
  })

  // ── Permissions ────────────────────────────────────────────────────────────
  ipcMain.handle('capture:check-permissions', async () => {
    if (process.platform === 'darwin') {
      const screen = systemPreferences.getMediaAccessStatus('screen')
      const mic = systemPreferences.getMediaAccessStatus('microphone')
      return { screen, mic }
    }
    // Windows — no runtime permission required for screen/system audio
    return { screen: 'granted', mic: 'granted' }
  })

  ipcMain.handle('capture:request-mic-permission', async () => {
    if (process.platform === 'darwin') {
      return systemPreferences.askForMediaAccess('microphone')
    }
    return true
  })

  // ── Session lifecycle ──────────────────────────────────────────────────────
  ipcMain.handle(
    'capture:start',
    async (_event, opts: { mixMic: boolean; sourceId: string | null }) => {
      if (activeMeetingId !== null) {
        throw new Error('A recording session is already active')
      }

      const sessionId = uuidv4()
      activeSessionId = sessionId
      screenshotCounter = 0

      const sessionDir = join(app.getPath('userData'), 'recordings', sessionId)
      const screenshotsDir = join(sessionDir, 'screenshots')
      mkdirSync(screenshotsDir, { recursive: true })

      // Store sourceId so setDisplayMediaRequestHandler (in index.ts) can pick it
      // when the renderer calls getDisplayMedia immediately after this IPC resolves
      if (opts.sourceId) _pendingSourceId = opts.sourceId

      const audioPath = join(sessionDir, 'audio.webm')
      const now = new Date().toISOString()

      const meetingId = insertMeeting({ sessionId, audioPath, date: now })
      activeMeetingId = meetingId

      updateTrayState(true, _getWindow)

      return { sessionId, meetingId, audioPath }
    }
  )

  // Receives 1-second WebM/Opus chunks from the renderer's MediaRecorder.
  // Security: path is constructed server-side from the trusted sessionId — never
  // accept file paths from the renderer directly.
  ipcMain.handle(
    'capture:write-chunk',
    async (_event, sessionId: string, chunkBuffer: ArrayBuffer) => {
      if (sessionId !== activeSessionId) return
      const filePath = join(app.getPath('userData'), 'recordings', sessionId, 'audio.webm')
      appendFileSync(filePath, Buffer.from(chunkBuffer))
    }
  )

  // Called by renderer after MediaRecorder.onstop fires — finalises the DB row.
  ipcMain.handle('capture:finalize', async (_event, sessionId: string, durationS: number) => {
    if (sessionId !== activeSessionId || activeMeetingId === null) return
    updateMeetingDuration(activeMeetingId, durationS)
    updateMeetingStatus(activeMeetingId, 'recorded')
    notifyRecordingSaved(activeMeetingId)
    activeMeetingId = null
    activeSessionId = null
    updateTrayState(false, _getWindow)
  })

  // ── Audio file import ───────────────────────────────────────────────────────
  // Opens a native file picker, copies the chosen audio file into the recordings
  // directory, and creates a DB row with status 'recorded' so the full
  // transcription + LLM pipeline can start immediately.
  ipcMain.handle(
    'capture:import-audio',
    async (): Promise<{ meetingId: number; audioPath: string } | null> => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Import Audio File',
        properties: ['openFile'],
        filters: [
          {
            name: 'Audio Files',
            extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'webm', 'mp4']
          }
        ]
      })

      if (canceled || filePaths.length === 0) return null

      // Never trust a renderer-supplied path — this path comes from the OS dialog
      const sourcePath = filePaths[0]
      const sessionId = uuidv4()
      const sessionDir = join(app.getPath('userData'), 'recordings', sessionId)
      mkdirSync(sessionDir, { recursive: true })

      const ext = sourcePath.split('.').pop() ?? 'audio'
      const audioPath = join(sessionDir, `audio.${ext}`)
      copyFileSync(sourcePath, audioPath)

      const now = new Date().toISOString()
      const meetingId = insertMeeting({ sessionId, audioPath, date: now })
      // Skip 'recording' — the file is already complete
      updateMeetingStatus(meetingId, 'recorded')

      return { meetingId, audioPath }
    }
  )

  // ── Screenshots ────────────────────────────────────────────────────────────
  // Uses desktopCapturer.getSources with a high-res thumbnailSize to capture the
  // current screen state. No extra permission needed — already granted for recording.
  ipcMain.handle('capture:screenshot-save', async (): Promise<string | null> => {
    if (activeMeetingId === null || activeSessionId === null) return null

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 3840, height: 2160 }
    })
    const png = sources[0]?.thumbnail.toPNG()
    if (!png) return null

    screenshotCounter++
    const paddedNum = String(screenshotCounter).padStart(3, '0')
    const screenshotPath = join(
      app.getPath('userData'),
      'recordings',
      activeSessionId,
      'screenshots',
      `${paddedNum}.png`
    )
    writeFileSync(screenshotPath, png)
    insertScreenshot(activeMeetingId, screenshotPath)
    return screenshotPath
  })
}
