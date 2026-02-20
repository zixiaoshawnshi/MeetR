import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'path'
import { initDatabase } from './database'
import { registerSessionHandlers } from './ipc/sessions'
import { registerRecordingHandlers } from './ipc/recordings'
import { registerSettingsHandlers } from './ipc/settings'
import { registerAiHandlers } from './ipc/ai'
import {
  registerTranscriptionHandlers,
  stopActiveTranscriptionForShutdown
} from './ipc/transcription'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    backgroundColor: '#0a0c10',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: 'MeetMate'
  })

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function sendMenuAction(action: 'sessions' | 'settings'): void {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  const targetWindow = focusedWindow ?? BrowserWindow.getAllWindows()[0]
  if (!targetWindow) return
  targetWindow.webContents.send('menu:action', action)
}

function setupApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Sessions',
          click: () => sendMenuAction('sessions')
        },
        {
          label: 'Settings',
          click: () => sendMenuAction('settings')
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      role: 'editMenu'
    },
    {
      role: 'viewMenu'
    },
    {
      role: 'windowMenu'
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  initDatabase()
  registerSessionHandlers()
  registerRecordingHandlers()
  registerSettingsHandlers()
  registerAiHandlers()
  registerTranscriptionHandlers()
  setupApplicationMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

let shuttingDown = false
app.on('before-quit', (event) => {
  if (shuttingDown) return
  shuttingDown = true
  event.preventDefault()
  void stopActiveTranscriptionForShutdown().finally(() => {
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
