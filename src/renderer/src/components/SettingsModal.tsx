import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AiProvider,
  DmOpResult,
  AppPathsInfo,
  AppSettings,
  AppSettingsPatch,
  TranscriptionInputDevice
} from '../types'

interface SettingsModalProps {
  open: boolean
  settings: AppSettings | null
  pathsInfo: AppPathsInfo | null
  inputDevices: TranscriptionInputDevice[]
  onClose: () => void
  onSave: (patch: AppSettingsPatch) => Promise<void>
  onPickDirectory: () => Promise<string | null>
  onDownloadDiarizationModel: () => Promise<DmOpResult>
  onValidateDiarizationModel: () => Promise<DmOpResult>
}

const PROVIDER_DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4.1',
  openrouter: 'anthropic/claude-sonnet-4.5',
  ollama: 'llama3.1:8b'
}

export default function SettingsModal({
  open,
  settings,
  pathsInfo,
  inputDevices,
  onClose,
  onSave,
  onPickDirectory,
  onDownloadDiarizationModel,
  onValidateDiarizationModel
}: SettingsModalProps) {
  const [saving, setSaving] = useState(false)
  const [modelOpBusy, setModelOpBusy] = useState(false)
  const [modelOpMessage, setModelOpMessage] = useState<string>('')

  const [recordingsBaseDir, setRecordingsBaseDir] = useState<string>('')
  const [defaultInputDeviceId, setDefaultInputDeviceId] = useState<string>('')

  const [transcriptionMode, setTranscriptionMode] = useState<'local' | 'deepgram'>('local')
  const [diarizationEnabled, setDiarizationEnabled] = useState(false)
  const [huggingFaceToken, setHuggingFaceToken] = useState('')
  const [deepgramApiKey, setDeepgramApiKey] = useState('')
  const [deepgramModel, setDeepgramModel] = useState('')

  const [aiProvider, setAiProvider] = useState<AiProvider>('anthropic')
  const [aiModel, setAiModel] = useState(PROVIDER_DEFAULT_MODEL.anthropic)
  const [anthropicApiKey, setAnthropicApiKey] = useState('')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [openrouterApiKey, setOpenrouterApiKey] = useState('')
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://127.0.0.1:11434')
  const [ollamaApiKey, setOllamaApiKey] = useState('')

  const previousProviderRef = useRef<AiProvider | null>(null)

  useEffect(() => {
    if (!settings || !open) return
    setRecordingsBaseDir(settings.storage.recordingsBaseDir ?? '')
    setDefaultInputDeviceId(
      settings.audio.defaultInputDeviceId === null ? '' : String(settings.audio.defaultInputDeviceId)
    )
    setTranscriptionMode(settings.transcription.mode)
    setDiarizationEnabled(settings.transcription.diarizationEnabled)
    setHuggingFaceToken(settings.transcription.huggingFaceToken)
    setDeepgramApiKey(settings.transcription.deepgramApiKey)
    setDeepgramModel(settings.transcription.deepgramModel)

    setAiProvider(settings.ai.provider)
    setAiModel(settings.ai.model || PROVIDER_DEFAULT_MODEL[settings.ai.provider])
    setAnthropicApiKey(settings.ai.anthropicApiKey)
    setOpenaiApiKey(settings.ai.openaiApiKey)
    setOpenrouterApiKey(settings.ai.openrouterApiKey)
    setOllamaBaseUrl(settings.ai.ollamaBaseUrl || 'http://127.0.0.1:11434')
    setOllamaApiKey(settings.ai.ollamaApiKey)
    previousProviderRef.current = settings.ai.provider
    setModelOpMessage('')
  }, [settings, open])

  useEffect(() => {
    if (previousProviderRef.current === null) {
      previousProviderRef.current = aiProvider
      return
    }
    if (previousProviderRef.current === aiProvider) return
    setAiModel(PROVIDER_DEFAULT_MODEL[aiProvider])
    previousProviderRef.current = aiProvider
  }, [aiProvider])

  const defaultMicOptions = useMemo(() => {
    return inputDevices.map((d) => ({
      value: String(d.id),
      label: `${d.name}${d.is_default ? ' (System default)' : ''}`
    }))
  }, [inputDevices])

  if (!open || !settings) return null

  const save = async () => {
    const patch: AppSettingsPatch = {
      storage: {
        recordingsBaseDir: recordingsBaseDir.trim() || null
      },
      audio: {
        defaultInputDeviceId: defaultInputDeviceId ? Number(defaultInputDeviceId) : null
      },
      transcription: {
        mode: transcriptionMode,
        diarizationEnabled,
        huggingFaceToken: huggingFaceToken.trim(),
        deepgramApiKey: deepgramApiKey.trim(),
        deepgramModel: deepgramModel.trim() || 'nova-2'
      },
      ai: {
        provider: aiProvider,
        model: aiModel.trim() || PROVIDER_DEFAULT_MODEL[aiProvider],
        anthropicApiKey: anthropicApiKey.trim(),
        openaiApiKey: openaiApiKey.trim(),
        openrouterApiKey: openrouterApiKey.trim(),
        ollamaBaseUrl: ollamaBaseUrl.trim() || 'http://127.0.0.1:11434',
        ollamaApiKey: ollamaApiKey.trim()
      }
    }

    try {
      setSaving(true)
      await onSave(patch)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-xl border border-gray-700 bg-gray-950">
        <div className="h-12 px-4 border-b border-gray-800 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-100">Settings</p>
          <button
            onClick={onClose}
            className="px-2.5 py-1 rounded text-xs border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="p-4 space-y-6 overflow-auto max-h-[calc(92vh-7.5rem)]">
          <section className="rounded-lg border border-gray-800 p-3 space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">AI Assistant</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Provider</label>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value as AiProvider)}
                  className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200"
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="ollama">Ollama</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Model</label>
                <input
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder={PROVIDER_DEFAULT_MODEL[aiProvider]}
                  className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Anthropic API Key</label>
                <input
                  value={anthropicApiKey}
                  onChange={(e) => setAnthropicApiKey(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200"
                  type="password"
                  placeholder="sk-ant-..."
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">OpenAI API Key</label>
                <input
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200"
                  type="password"
                  placeholder="sk-..."
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">OpenRouter API Key</label>
                <input
                  value={openrouterApiKey}
                  onChange={(e) => setOpenrouterApiKey(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200"
                  type="password"
                  placeholder="sk-or-..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Ollama Base URL</label>
                <input
                  value={ollamaBaseUrl}
                  onChange={(e) => setOllamaBaseUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200"
                  placeholder="http://127.0.0.1:11434"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Ollama API Key (optional)</label>
                <input
                  value={ollamaApiKey}
                  onChange={(e) => setOllamaApiKey(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200"
                  type="password"
                  placeholder="Only if your Ollama gateway requires auth"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Active provider: <span className="text-gray-300">{aiProvider}</span>. Changing provider resets the model
              field to that provider&apos;s default.
            </p>
          </section>

          <section className="rounded-lg border border-gray-800 p-3 space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Transcription</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Mode</label>
                <select
                  value={transcriptionMode}
                  onChange={(e) => setTranscriptionMode(e.target.value as 'local' | 'deepgram')}
                  className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200"
                >
                  <option value="local">Local</option>
                  <option value="deepgram">Deepgram</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Deepgram Model</label>
                <input
                  value={deepgramModel}
                  onChange={(e) => setDeepgramModel(e.target.value)}
                  placeholder="nova-2"
                  className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                checked={diarizationEnabled}
                onChange={(e) => setDiarizationEnabled(e.target.checked)}
                className="rounded border-gray-600 bg-gray-900 text-blue-500"
              />
              <span className="text-xs text-gray-300">Enable diarization (experimental)</span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Deepgram API Key</label>
                <input
                  value={deepgramApiKey}
                  onChange={(e) => setDeepgramApiKey(e.target.value)}
                  placeholder="Required when mode is Deepgram"
                  className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200"
                  type="password"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Hugging Face Token</label>
                <input
                  value={huggingFaceToken}
                  onChange={(e) => setHuggingFaceToken(e.target.value)}
                  placeholder="Required for local pyannote diarization"
                  className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200"
                  type="password"
                  disabled={!diarizationEnabled}
                />
              </div>
            </div>
            <label className="text-xs text-gray-500 block mt-2">Local Diarization Model Path</label>
            <input
              value={settings.transcription.localDiarizationModelPath ?? ''}
              readOnly
              placeholder="Not downloaded yet"
              className="w-full px-3 py-2 rounded bg-gray-900/60 border border-gray-700 text-sm text-gray-400"
            />
            <div className="flex gap-2 mt-2">
              <button
                disabled={modelOpBusy || !diarizationEnabled}
                onClick={async () => {
                  setModelOpBusy(true)
                  const res = await onDownloadDiarizationModel()
                  setModelOpMessage(res.message)
                  setModelOpBusy(false)
                }}
                className="px-3 py-1.5 rounded text-xs border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-50"
              >
                Download Model
              </button>
              <button
                disabled={modelOpBusy || !diarizationEnabled}
                onClick={async () => {
                  setModelOpBusy(true)
                  const res = await onValidateDiarizationModel()
                  setModelOpMessage(res.message)
                  setModelOpBusy(false)
                }}
                className="px-3 py-1.5 rounded text-xs border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-50"
              >
                Validate Model
              </button>
            </div>
            {modelOpMessage && <p className="text-xs text-gray-400 mt-1">{modelOpMessage}</p>}
          </section>

          <section className="rounded-lg border border-gray-800 p-3 space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Audio & Storage</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Default Microphone</label>
                <select
                  value={defaultInputDeviceId}
                  onChange={(e) => setDefaultInputDeviceId(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200"
                >
                  <option value="">Use system/default available input</option>
                  {defaultMicOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Recordings Base Directory</label>
                <div className="flex gap-2">
                  <input
                    value={recordingsBaseDir}
                    onChange={(e) => setRecordingsBaseDir(e.target.value)}
                    placeholder="Default app data directory"
                    className="flex-1 px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200"
                  />
                  <button
                    onClick={async () => {
                      const dir = await onPickDirectory()
                      if (dir) setRecordingsBaseDir(dir)
                    }}
                    className="px-3 py-2 rounded text-xs border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white"
                  >
                    Browse
                  </button>
                </div>
              </div>
            </div>
            {pathsInfo && (
              <div className="rounded border border-gray-800 bg-gray-900/50 p-2 text-xs text-gray-500 space-y-1">
                <p className="truncate">DB: {pathsInfo.databasePath}</p>
                <p className="truncate">Settings: {pathsInfo.settingsPath}</p>
                <p className="truncate">Recordings: {pathsInfo.recordingsBaseDir}</p>
              </div>
            )}
            <p className="text-xs text-amber-400">
              Recordings directory changes apply to new recordings only. Existing files are not moved.
            </p>
          </section>
        </div>

        <div className="h-14 px-4 border-t border-gray-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="px-3 py-1.5 rounded text-xs border border-blue-700 bg-blue-900/40 text-blue-300 hover:bg-blue-900/60 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
