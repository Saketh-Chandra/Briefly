import { app, shell, BrowserWindow, globalShortcut, session, desktopCapturer } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

// ── Deep link handler ──────────────────────────────────────────────────────────
// Handles briefly:// URLs from Raycast, terminal, or any URL launcher.
//   briefly://record/start      → start recording
//   briefly://record/stop       → stop recording
//   briefly://record/screenshot → take a screenshot
//   briefly://app/open          → show the window
function handleDeepLink(url: string): void {
  try {
    const parsed = new URL(url)
    mainWindow?.show()
    if (parsed.hostname === 'record') {
      const action = parsed.pathname.replace(/^\//, '')
      if (action === 'start' || action === 'stop' || action === 'screenshot') {
        mainWindow?.webContents.send('tray:command', action)
      }
    }
  } catch {
    // ignore malformed URLs
  }
}

// Register briefly:// as the default protocol client for this app.
// Must be called before app.whenReady().
app.setAsDefaultProtocolClient('briefly')

// macOS: URL opened while the app is already running.
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

// Single-instance lock — required for second-instance (Windows deep link) to fire.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}
import { getDb } from './lib/db'
import { resetStuckMeetings } from './lib/db'
import { applyProxy } from './lib/proxy'
import { getSettings } from './lib/settings'
import { registerCaptureHandlers, setTrayWindowGetter, claimPendingSourceId } from './ipc/capture'
import { registerStorageHandlers } from './ipc/storage'
import { registerSettingsHandlers } from './ipc/settings'
import { registerTranscriptionHandlers } from './ipc/transcription'
import { registerLlmHandlers } from './ipc/llm'
import { registerNotificationHandlers } from './lib/notifications'
import { initTray, destroyTray } from './lib/tray'

let mainWindow: BrowserWindow | null = null
let forceQuit = false

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
    titleBarStyle: 'hiddenInset', // macOS: keep traffic lights, enable drag region via CSS
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // macOS: hide instead of destroy so the app stays alive in the background.
  // But if the user is actually quitting (Cmd+Q / app.quit()), let the window close.
  mainWindow.on('close', (e) => {
    if (process.platform === 'darwin' && !forceQuit) {
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

  // Grant system audio + screen access when the renderer calls getDisplayMedia.
  // Uses the sourceId stored by capture:start (pendingSourceId pattern).
  // audio: 'loopback' → CoreAudio Tap on macOS 14.2+ (Electron 39 default), WASAPI on Windows.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
      .then((sources) => {
        const sourceId = claimPendingSourceId()
        const chosen = sourceId
          ? (sources.find((s) => s.id === sourceId) ?? sources[0])
          : sources[0]
        callback({ video: chosen, audio: 'loopback' })
      })
      .catch(() => callback({}))
  })

  // Register all IPC handlers before window so renderer calls don't race
  registerCaptureHandlers()
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

  // Windows/Linux: deep link arrives as a second-instance argv.
  app.on('second-instance', (_event, argv) => {
    const url = argv.find((arg) => arg.startsWith('briefly://'))
    if (url) handleDeepLink(url)
    mainWindow?.show()
    mainWindow?.focus()
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

app.on('before-quit', () => {
  forceQuit = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  destroyTray()
})
