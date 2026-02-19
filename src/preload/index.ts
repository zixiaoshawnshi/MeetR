import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  session: {
    list: () => ipcRenderer.invoke('session:list'),
    create: (title: string) => ipcRenderer.invoke('session:create', title),
    get: (id: number) => ipcRenderer.invoke('session:get', id),
    updateTitle: (id: number, title: string) => ipcRenderer.invoke('session:update-title', id, title),
    delete: (id: number) => ipcRenderer.invoke('session:delete', id)
  },
  transcription: {
    start: (sessionId: number) =>
      ipcRenderer.invoke('transcription:start', sessionId),
    stop: (sessionId: number) =>
      ipcRenderer.invoke('transcription:stop', sessionId),
    status: () =>
      ipcRenderer.invoke('transcription:status'),
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
  }
})
