import { app, shell, BrowserWindow, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getDb } from './lib/db'
import { resetStuckMeetings } from './lib/db'
import { applyProxy } from './lib/proxy'
import { getSettings } from './lib/settings'
import { registerCaptureHandlers, setTrayWindowGetter } from './ipc/capture'
import { registerStorageHandlers } from './ipc/storage'
import { registerSettingsHandlers } from './ipc/settings'
import { registerTranscriptionHandlers } from './ipc/transcription'
import { registerLlmHandlers } from './ipc/llm'
import { registerNotificationHandlers } from './lib/notifications'
import { initTray, destroyTray } from './lib/tray'

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

  // macOS: hide instead of destroy so the app stays alive in the background
  mainWindow.on('close', (e) => {
    if (process.platform === 'darwin') {
      e.preventDefault()
      mainWindow?.hide()
    }
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

  // Register all IPC handlers before window so renderer calls don't race
  registerCaptureHandlers(getSender)
  registerStorageHandlers()
  registerSettingsHandlers()
  registerTranscriptionHandlers(getSender)
  registerLlmHandlers(getSender)
  registerNotificationHandlers()

  // Show the window immediately — don't let DB/proxy init block it
  createWindow()

  // Tray — init after window so getWindow() is valid
  const getWindow = () => mainWindow
  setTrayWindowGetter(getWindow)
  if (process.platform === 'darwin') {
    initTray(getWindow)
  }

  // DB init and proxy can run after the window is up
  try {
    getDb()
    resetStuckMeetings()
  } catch (err) {
    console.error('[startup] DB init failed:', err)
  }

  try {
    await applyProxy(getSettings().proxy)
  } catch (err) {
    console.error('[startup] Proxy init failed:', err)
  }

  globalShortcut.register('CommandOrControl+Shift+R', () => {
    mainWindow?.webContents.send('shortcut:toggle-recording')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      mainWindow?.show()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  destroyTray()
})
