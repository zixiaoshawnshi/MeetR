import { useEffect, useMemo, useState } from 'react'
import {
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
  const [anthropicApiKey, setAnthropicApiKey] = useState('')

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
    setAnthropicApiKey(settings.ai.anthropicApiKey)
    setModelOpMessage('')
  }, [settings, open])

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
        anthropicApiKey: anthropicApiKey.trim()
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
      <div className="w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-xl border border-gray-700 bg-gray-950">
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
          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Storage</h3>
            {pathsInfo && (
              <div className="rounded border border-gray-800 bg-gray-900/50 p-2 text-xs text-gray-500 space-y-1">
                <p className="truncate">DB: {pathsInfo.databasePath}</p>
                <p className="truncate">Settings: {pathsInfo.settingsPath}</p>
              </div>
            )}
            <label className="text-xs text-gray-500 block">Recordings Base Directory</label>
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
            <p className="text-xs text-amber-400">
              Applies to new recordings only. Existing recording files are not moved.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Transcription</h3>
            <label className="text-xs text-gray-500 block">Mode</label>
            <select
              value={transcriptionMode}
              onChange={(e) => setTranscriptionMode(e.target.value as 'local' | 'deepgram')}
              className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200"
            >
              <option value="local">Local</option>
              <option value="deepgram">Deepgram</option>
            </select>
            <label className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                checked={diarizationEnabled}
                onChange={(e) => setDiarizationEnabled(e.target.checked)}
                className="rounded border-gray-600 bg-gray-900 text-blue-500"
              />
              <span className="text-xs text-gray-300">Enable diarization (experimental)</span>
            </label>
            <label className="text-xs text-gray-500 block mt-2">Deepgram API Key</label>
            <input
              value={deepgramApiKey}
              onChange={(e) => setDeepgramApiKey(e.target.value)}
              placeholder="Required when mode is Deepgram"
              className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200"
              type="password"
            />
            <label className="text-xs text-gray-500 block mt-2">Hugging Face Token</label>
            <input
              value={huggingFaceToken}
              onChange={(e) => setHuggingFaceToken(e.target.value)}
              placeholder="Required for local pyannote diarization"
              className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200"
              type="password"
              disabled={!diarizationEnabled}
            />
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
            <label className="text-xs text-gray-500 block mt-2">Deepgram Model</label>
            <input
              value={deepgramModel}
              onChange={(e) => setDeepgramModel(e.target.value)}
              placeholder="nova-2"
              className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200"
            />
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Audio</h3>
            <label className="text-xs text-gray-500 block">Default Microphone</label>
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
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">AI</h3>
            <label className="text-xs text-gray-500 block">Anthropic API Key</label>
            <input
              value={anthropicApiKey}
              onChange={(e) => setAnthropicApiKey(e.target.value)}
              placeholder="Optional until AI update is enabled"
              className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-gray-200"
              type="password"
            />
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
