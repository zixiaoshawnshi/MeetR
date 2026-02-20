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
  latest_summary_generated_at: string | null
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

export interface TranscriptionInputDevice {
  id: number
  name: string
  is_default: boolean
}

export interface SessionRecording {
  id: number
  session_id: number
  file_path: string
  started_at: string
  stopped_at: string
  duration_ms: number | null
  created_at: string
}

export type TranscriptionMode = 'local' | 'deepgram'
export type AiProvider = 'ollama' | 'anthropic' | 'openai' | 'openrouter'

export interface AppSettings {
  version: 1
  storage: {
    recordingsBaseDir: string | null
  }
  audio: {
    defaultInputDeviceId: number | null
  }
  transcription: {
    mode: TranscriptionMode
    diarizationEnabled: boolean
    huggingFaceToken: string
    localDiarizationModelPath: string | null
    deepgramApiKey: string
    deepgramModel: string
  }
  ai: {
    provider: AiProvider
    model: string
    anthropicApiKey: string
    openaiApiKey: string
    openrouterApiKey: string
    ollamaBaseUrl: string
    ollamaApiKey: string
  }
}

export interface AppSettingsPatch {
  storage?: Partial<AppSettings['storage']>
  audio?: Partial<AppSettings['audio']>
  transcription?: Partial<AppSettings['transcription']>
  ai?: Partial<AppSettings['ai']>
}

export interface AppPathsInfo {
  databasePath: string
  settingsPath: string
  recordingsBaseDir: string
}

export type MenuAction = 'sessions' | 'settings'
export interface DmOpResult {
  ok: boolean
  message: string
  path?: string
}

export interface AiUpdateResult {
  summary: string
  agenda: string
  model_used: string
  generated_at: string
}

export interface WindowAPI {
  session: {
    list: () => Promise<Session[]>
    create: (title: string) => Promise<Session>
    get: (id: number) => Promise<SessionData | null>
    updateTitle: (id: number, title: string) => Promise<void>
    updateNotes: (id: number, content: string) => Promise<void>
    updateAgenda: (id: number, content: string) => Promise<void>
    delete: (id: number) => Promise<void>
  }
  transcription: {
    start: (sessionId: number, inputDeviceId?: number | null) => Promise<{ success: boolean; error?: string }>
    stop: (sessionId: number) => Promise<{ audioPath: string | null }>
    status: () => Promise<boolean>
    inputDevices: () => Promise<TranscriptionInputDevice[]>
    segments: (sessionId: number) => Promise<TranscriptSegment[]>
    renameSpeaker: (sessionId: number, speakerId: string, newName: string) => Promise<void>
    onSegment: (cb: (segment: TranscriptSegment) => void) => () => void
    onStateChange: (cb: (state: TranscriptionState) => void) => () => void
  }
  recording: {
    list: (sessionId: number) => Promise<SessionRecording[]>
    openFile: (filePath: string) => Promise<void>
    showInFolder: (filePath: string) => Promise<void>
  }
  settings: {
    get: () => Promise<AppSettings>
    update: (patch: AppSettingsPatch) => Promise<AppSettings>
    pickDirectory: () => Promise<string | null>
    paths: () => Promise<AppPathsInfo>
    downloadDiarizationModel: () => Promise<DmOpResult>
    validateDiarizationModel: () => Promise<DmOpResult>
  }
  menu: {
    onAction: (cb: (action: MenuAction) => void) => () => void
  }
  ai: {
    update: (sessionId: number) => Promise<AiUpdateResult>
  }
}

declare global {
  interface Window {
    api: WindowAPI
  }
}
