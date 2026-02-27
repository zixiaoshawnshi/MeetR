import { SessionRecording } from '../types'

interface TranscribeRecordingDialogProps {
  open: boolean
  recordings: SessionRecording[]
  loading: boolean
  busy: boolean
  error: string | null
  onClose: () => void
  onRefresh: () => void
  onTranscribe: (filePath: string) => void
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function fileNameFromPath(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  return parts[parts.length - 1] ?? filePath
}

export default function TranscribeRecordingDialog({
  open,
  recordings,
  loading,
  busy,
  error,
  onClose,
  onRefresh,
  onTranscribe
}: TranscribeRecordingDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[85vh] bg-gray-950 border border-gray-800 rounded-lg flex flex-col overflow-hidden">
        <div className="h-12 px-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-100">Choose Recording to Transcribe</p>
            <p className="text-xs text-gray-500">Existing recordings in this session</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={busy}
              className="px-2.5 py-1 rounded text-xs border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              disabled={busy}
              className="px-2.5 py-1 rounded text-xs border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Close
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 py-2 border-b border-red-900/60 bg-red-950/30">
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <p className="text-sm text-gray-500">Loading recordings...</p>
          ) : recordings.length === 0 ? (
            <p className="text-sm text-gray-500">No recordings available for this session.</p>
          ) : (
            <div className="space-y-3">
              {recordings.map((rec) => (
                <div key={rec.id} className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-200 truncate">{fileNameFromPath(rec.file_path)}</p>
                      <p className="text-xs text-gray-500 truncate mt-1">{rec.file_path}</p>
                    </div>
                    <button
                      onClick={() => onTranscribe(rec.file_path)}
                      disabled={busy}
                      className="px-2.5 py-1 rounded text-xs border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      {busy ? 'Transcribing...' : 'Transcribe'}
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    <span>Started: {formatDateTime(rec.started_at)}</span>
                    <span className="mx-2 text-gray-700">|</span>
                    <span>Stopped: {formatDateTime(rec.stopped_at)}</span>
                    <span className="mx-2 text-gray-700">|</span>
                    <span>Duration: {formatDuration(rec.duration_ms)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
