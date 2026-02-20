import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

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

const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  storage: {
    recordingsBaseDir: null
  },
  audio: {
    defaultInputDeviceId: null
  },
  transcription: {
    mode: 'local',
    diarizationEnabled: false,
    huggingFaceToken: '',
    localDiarizationModelPath: null,
    deepgramApiKey: '',
    deepgramModel: 'nova-2'
  },
  ai: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    anthropicApiKey: '',
    openaiApiKey: '',
    openrouterApiKey: '',
    ollamaBaseUrl: 'http://127.0.0.1:11434',
    ollamaApiKey: ''
  }
}

let cachedSettings: AppSettings | null = null

export function settingsFilePath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function databaseFilePath(): string {
  return join(app.getPath('userData'), 'meetmate.db')
}

export function recordingsBaseDir(settings: AppSettings = getSettings()): string {
  return settings.storage.recordingsBaseDir ?? join(app.getPath('userData'), 'recordings')
}

export function getSettings(): AppSettings {
  if (cachedSettings) return cachedSettings
  cachedSettings = readSettingsFromDisk()
  return cachedSettings
}

export function updateSettings(patch: AppSettingsPatch): AppSettings {
  const current = getSettings()
  const merged: AppSettings = {
    ...current,
    storage: { ...current.storage, ...(patch.storage ?? {}) },
    audio: { ...current.audio, ...(patch.audio ?? {}) },
    transcription: { ...current.transcription, ...(patch.transcription ?? {}) },
    ai: { ...current.ai, ...(patch.ai ?? {}) }
  }
  cachedSettings = merged
  writeSettingsToDisk(merged)
  return merged
}

function readSettingsFromDisk(): AppSettings {
  const filePath = settingsFilePath()
  if (!existsSync(filePath)) {
    writeSettingsToDisk(DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  }

  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      storage: { ...DEFAULT_SETTINGS.storage, ...(parsed.storage ?? {}) },
      audio: { ...DEFAULT_SETTINGS.audio, ...(parsed.audio ?? {}) },
      transcription: { ...DEFAULT_SETTINGS.transcription, ...(parsed.transcription ?? {}) },
      ai: { ...DEFAULT_SETTINGS.ai, ...(parsed.ai ?? {}) },
      version: 1
    }
  } catch {
    writeSettingsToDisk(DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  }
}

function writeSettingsToDisk(settings: AppSettings): void {
  const filePath = settingsFilePath()
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8')
}
