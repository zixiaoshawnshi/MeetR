import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  session: {
    list: () => ipcRenderer.invoke('session:list'),
    create: (title: string) => ipcRenderer.invoke('session:create', title),
    get: (id: number) => ipcRenderer.invoke('session:get', id),
    updateTitle: (id: number, title: string) => ipcRenderer.invoke('session:update-title', id, title),
    updateNotes: (id: number, content: string) => ipcRenderer.invoke('session:update-notes', id, content),
    updateAgenda: (id: number, content: string) =>
      ipcRenderer.invoke('session:update-agenda', id, content),
    delete: (id: number) => ipcRenderer.invoke('session:delete', id)
  },
  transcription: {
    start: (sessionId: number, inputDeviceId?: number | null) =>
      ipcRenderer.invoke('transcription:start', sessionId, inputDeviceId),
    stop: (sessionId: number) =>
      ipcRenderer.invoke('transcription:stop', sessionId),
    status: () =>
      ipcRenderer.invoke('transcription:status'),
    inputDevices: () =>
      ipcRenderer.invoke('transcription:input-devices'),
    segments: (sessionId: number) =>
      ipcRenderer.invoke('transcription:segments', sessionId),
    renameSpeaker: (sessionId: number, speakerId: string, newName: string) =>
      ipcRenderer.invoke('transcription:rename-speaker', sessionId, speakerId, newName),
    // Event subscriptions — each returns a cleanup () => void
    onSegment: (cb: (segment: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, segment: unknown): void => cb(segment)
      ipcRenderer.on('transcription:segment', handler)
      return () => ipcRenderer.removeListener('transcription:segment', handler)
    },
    onStateChange: (cb: (state: { recording: boolean }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: { recording: boolean }): void =>
        cb(state)
      ipcRenderer.on('transcription:state', handler)
      return () => ipcRenderer.removeListener('transcription:state', handler)
    }
  },
  recording: {
    list: (sessionId: number) =>
      ipcRenderer.invoke('recording:list', sessionId),
    openFile: (filePath: string) =>
      ipcRenderer.invoke('recording:open-file', filePath),
    showInFolder: (filePath: string) =>
      ipcRenderer.invoke('recording:show-in-folder', filePath)
  },
  settings: {
    get: () =>
      ipcRenderer.invoke('settings:get'),
    update: (patch: unknown) =>
      ipcRenderer.invoke('settings:update', patch),
    pickDirectory: () =>
      ipcRenderer.invoke('settings:pick-directory'),
    paths: () =>
      ipcRenderer.invoke('settings:paths'),
    downloadDiarizationModel: () =>
      ipcRenderer.invoke('settings:diarization-download'),
    validateDiarizationModel: () =>
      ipcRenderer.invoke('settings:diarization-validate')
  },
  menu: {
    onAction: (cb: (action: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: unknown): void => cb(action)
      ipcRenderer.on('menu:action', handler)
      return () => ipcRenderer.removeListener('menu:action', handler)
    }
  },
  ai: {
    update: (sessionId: number) => ipcRenderer.invoke('ai:update', sessionId)
  }
})
