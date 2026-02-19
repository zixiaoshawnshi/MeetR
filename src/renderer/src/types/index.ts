export interface Session {
  id: number
  title: string
  audio_file_path: string | null
  created_at: string
  updated_at: string
}

export interface SessionData extends Session {
  notes_content: string
  agenda_content: string
  latest_summary: string | null
}

export interface TranscriptSegment {
  id: number
  session_id: number
  speaker_id: string
  speaker_name: string | null
  text: string
  start_ms: number
  end_ms: number
  created_at: string
}

export interface TranscriptionState {
  recording: boolean
  error?: string
}

export interface WindowAPI {
  session: {
    list: () => Promise<Session[]>
    create: (title: string) => Promise<Session>
    get: (id: number) => Promise<SessionData | null>
    updateTitle: (id: number, title: string) => Promise<void>
    delete: (id: number) => Promise<void>
  }
  transcription: {
    start: (sessionId: number) => Promise<{ success: boolean; error?: string }>
    stop: (sessionId: number) => Promise<{ audioPath: string | null }>
    status: () => Promise<boolean>
    segments: (sessionId: number) => Promise<TranscriptSegment[]>
    renameSpeaker: (sessionId: number, speakerId: string, newName: string) => Promise<void>
    onSegment: (cb: (segment: TranscriptSegment) => void) => () => void
    onStateChange: (cb: (state: TranscriptionState) => void) => () => void
  }
}

declare global {
  interface Window {
    api: WindowAPI
  }
}
