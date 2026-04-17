import { Tray, Menu, app, nativeImage, BrowserWindow } from 'electron'
import { join } from 'path'
import iconPath from '../../../resources/icon.png?asset'

let tray: Tray | null = null
let isRecording = false

// ---------------------------------------------------------------------------
// Icon — uses the app icon resized to 22×22 for the tray.
// Swap with dedicated template PNGs (tray-idleTemplate.png / tray-recordingTemplate.png)
// once branding assets are ready; just drop them in resources/ and update the
// paths below. Template images must be black+transparent; macOS inverts them.
// ---------------------------------------------------------------------------
function makeIcon(recording: boolean): Electron.NativeImage {
  // Try named tray-specific assets first (production / after branding is done)
  try {
    const name = recording ? 'tray-recordingTemplate.png' : 'tray-idleTemplate.png'
    const assetPath = join(__dirname, '../../resources', name)
    const img = nativeImage.createFromPath(assetPath)
    if (!img.isEmpty()) {
      img.setTemplateImage(true)
      return img
    }
  } catch {
    // fall through
  }

  // Fallback: resize the bundled app icon to tray size
  const base = nativeImage.createFromPath(iconPath)
  const img = base.resize({ width: 16, height: 16 })
  img.setTemplateImage(true)
  return img
}

function buildMenu(getWindow: () => BrowserWindow | null): Electron.Menu {
  const recordingItems: Electron.MenuItemConstructorOptions[] = isRecording
    ? [
        { label: '● Recording…', enabled: false },
        {
          label: 'Stop Recording',
          click: () => {
            getWindow()?.webContents.send('tray:command', 'stop')
          }
        },
        {
          label: 'Take Screenshot',
          click: () => {
            getWindow()?.webContents.send('tray:command', 'screenshot')
          }
        }
      ]
    : [
        {
          label: 'Start Recording',
          click: () => {
            const win = getWindow()
            if (win) {
              win.webContents.send('tray:command', 'start')
            }
          }
        }
      ]

  return Menu.buildFromTemplate([
    ...recordingItems,
    { type: 'separator' },
    {
      label: 'Show Briefly',
      click: () => {
        const win = getWindow()
        if (win) {
          if (win.isMinimized()) win.restore()
          win.show()
          win.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ])
}

export function initTray(getWindow: () => BrowserWindow | null): void {
  tray = new Tray(makeIcon(false))
  tray.setToolTip('Briefly')
  tray.setContextMenu(buildMenu(getWindow))

  // Left-click also opens the context menu (macOS default is right-click only)
  tray.on('click', () => {
    tray?.popUpContextMenu()
  })
}

export function updateTrayState(recording: boolean, getWindow: () => BrowserWindow | null): void {
  if (!tray) return
  isRecording = recording
  tray.setImage(makeIcon(recording))
  tray.setToolTip(recording ? 'Briefly — Recording…' : 'Briefly')
  tray.setContextMenu(buildMenu(getWindow))
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
