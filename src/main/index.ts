import { app, shell, BrowserWindow, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getDb } from './lib/db'
import { resetStuckMeetings } from './lib/db'
import { applyProxy } from './lib/proxy'
import { getSettings } from './lib/settings'
import { registerCaptureHandlers } from './ipc/capture'
import { registerStorageHandlers } from './ipc/storage'
import { registerSettingsHandlers } from './ipc/settings'
import { registerTranscriptionHandlers } from './ipc/transcription'
import { registerLlmHandlers } from './ipc/llm'
import { registerNotificationHandlers } from './lib/notifications'

let mainWindow: BrowserWindow | null = null

function getSender() {
  return mainWindow?.webContents ?? null
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 760,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',  // macOS: keep traffic lights, enable drag region via CSS
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.briefly.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Run DB migrations on startup
  getDb()

  // Reset meetings stuck in mid-pipeline states from a previous crash/force-quit
  resetStuckMeetings()

  // Apply proxy settings before any network activity
  await applyProxy(getSettings().proxy)

  // Register all IPC handlers
  registerCaptureHandlers(getSender)
  registerStorageHandlers()
  registerSettingsHandlers()
  registerTranscriptionHandlers(getSender)
  registerLlmHandlers(getSender)
  registerNotificationHandlers()

  createWindow()

  globalShortcut.register('CommandOrControl+Shift+R', () => {
    mainWindow?.webContents.send('shortcut:toggle-recording')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
