import { Notification, BrowserWindow, ipcMain } from 'electron'

function isSupported(): boolean {
  return Notification.isSupported()
}

function show(title: string, body: string, onClick?: () => void): void {
  if (!isSupported()) return
  const n = new Notification({ title, body, silent: false })
  if (onClick) n.on('click', onClick)
  n.show()
}

/** Shown when the Swift CLI finishes writing the audio file. */
export function notifyRecordingSaved(meetingId: number): void {
  show('Recording saved', 'Your recording is ready to transcribe.', () => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('navigate', `/recordings/${meetingId}`)
  })
}

/** Shown when the full LLM pipeline completes and the summary is ready. */
export function notifySummaryReady(title: string, meetingId: number): void {
  show(
    'Summary ready',
    title ? `"${title}" has been summarised.` : 'Your meeting has been summarised.',
    () => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('navigate', `/recordings/${meetingId}`)
    }
  )
}

/** Shown when any pipeline stage fails. */
export function notifyError(stage: string, message: string): void {
  show(`${stage} failed`, message.length > 100 ? message.slice(0, 100) + '…' : message)
}

/** Shown when a model download completes successfully. */
export function notifyModelDownloadOk(modelLabel: string): void {
  show('Model downloaded', `${modelLabel} is ready to use.`)
}

/** Shown when a model download fails. */
export function notifyModelDownloadFailed(modelLabel: string, reason: string): void {
  show(
    'Model download failed',
    `${modelLabel}: ${reason.length > 80 ? reason.slice(0, 80) + '…' : reason}`
  )
}

/**
 * Register the generic `notify:show` IPC channel so renderer-side code
 * (e.g. Settings) can trigger main-process notifications without needing
 * access to Electron internals.
 */
export function registerNotificationHandlers(): void {
  ipcMain.on('notify:show', (_event, title: string, body: string) => {
    show(title, body)
  })
}
