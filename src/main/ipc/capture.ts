import { ipcMain, app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import type { WebContents } from 'electron'
import { CaptureSession, listWindows } from '../lib/capture-cli'
import {
  insertMeeting,
  updateMeetingDuration,
  updateMeetingStatus,
  insertScreenshot
} from '../lib/db'
import type { CliEvent } from '../lib/types'
import { notifyRecordingSaved, notifyError } from '../lib/notifications'

// One active session at a time (POC constraint)
let activeSession: CaptureSession | null = null
let activeMeetingId: number | null = null
let activeSessionId: string | null = null
let screenshotCounter = 0

export function registerCaptureHandlers(getSender: () => WebContents | null): void {

  ipcMain.handle('capture:list-windows', async () => {
    return listWindows()
  })

  ipcMain.handle('capture:start', async (_event, opts: { mixMic: boolean }) => {
    if (activeSession) {
      throw new Error('A recording session is already active')
    }

    const sessionId = uuidv4()
    activeSessionId = sessionId
    screenshotCounter = 0

    const sessionDir = join(app.getPath('userData'), 'recordings', sessionId)
    const screenshotsDir = join(sessionDir, 'screenshots')
    mkdirSync(screenshotsDir, { recursive: true })

    const audioPath = join(sessionDir, 'audio.opus')
    const now = new Date().toISOString()

    const meetingId = insertMeeting({ sessionId, audioPath, date: now })
    activeMeetingId = meetingId

    const session = new CaptureSession(
      (msg: CliEvent) => {
        // Forward all CLI events to the renderer
        const sender = getSender()
        if (sender && !sender.isDestroyed()) {
          sender.send('capture:event', msg)
        }

        if (msg.type === 'stopped' && activeMeetingId !== null) {
          updateMeetingDuration(activeMeetingId, msg.duration_s)
          updateMeetingStatus(activeMeetingId, 'recorded')
          notifyRecordingSaved(activeMeetingId)
          activeSession = null
          activeMeetingId = null
          activeSessionId = null
        }

        if (msg.type === 'error') {
          console.error('[capture IPC] CLI error:', msg.message)
          if (activeMeetingId !== null) {
            updateMeetingStatus(activeMeetingId, 'error')
          }
          notifyError('Recording', msg.message)
        }
      },
      (code) => {
        console.log('[capture IPC] Session process exited with code', code)
        activeSession = null
      }
    )

    await session.waitForReady()
    session.startRecording(audioPath, opts.mixMic)
    activeSession = session

    return { sessionId, meetingId, audioPath }
  })

  ipcMain.handle('capture:stop', async () => {
    if (!activeSession) {
      throw new Error('No active recording session')
    }
    // Sends stop_recording command; the 'stopped' CliEvent updates the DB asynchronously
    activeSession.stopRecording()
  })

  ipcMain.handle('capture:screenshot', async () => {
    if (!activeSession || activeMeetingId === null || activeSessionId === null) {
      throw new Error('No active recording session for screenshot')
    }
    screenshotCounter++
    const paddedNum = String(screenshotCounter).padStart(3, '0')
    const screenshotPath = join(
      app.getPath('userData'),
      'recordings',
      activeSessionId,
      'screenshots',
      `${paddedNum}.png`
    )
    // Register in DB immediately; file is written async by CLI
    insertScreenshot(activeMeetingId, screenshotPath)
    activeSession.takeScreenshot(screenshotPath)
  })
}
