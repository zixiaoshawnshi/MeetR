import { useEffect, useRef, useState } from 'react'
import { TranscriptSegment } from '../types'

interface TranscriptPanelProps {
  segments?: TranscriptSegment[]
  sessionId?: number
  onRenameSpeaker?: (speakerId: string, newName: string) => void
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const SPEAKER_COLORS = [
  'text-blue-400',
  'text-emerald-400',
  'text-amber-400',
  'text-purple-400',
  'text-rose-400',
  'text-cyan-400'
]

function speakerColor(speakerId: string): string {
  const index = parseInt(speakerId.replace(/\D/g, '') || '0', 10)
  return SPEAKER_COLORS[(index - 1 + SPEAKER_COLORS.length) % SPEAKER_COLORS.length]
}

export default function TranscriptPanel({
  segments = [],
  onRenameSpeaker
}: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [renamingSpeakerId, setRenamingSpeakerId] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom when new segments arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [segments.length])

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingSpeakerId) renameInputRef.current?.select()
  }, [renamingSpeakerId])

  const startRename = (speakerId: string, currentName: string) => {
    setRenamingSpeakerId(speakerId)
    setNameDraft(currentName)
  }

  const commitRename = () => {
    if (!renamingSpeakerId) return
    const trimmed = nameDraft.trim()
    if (trimmed && onRenameSpeaker) {
      onRenameSpeaker(renamingSpeakerId, trimmed)
    }
    setRenamingSpeakerId(null)
  }

  const cancelRename = () => setRenamingSpeakerId(null)

  // Collect unique speakers for the rename helper at top
  const uniqueSpeakers = Array.from(
    new Map(segments.map((s) => [s.speaker_id, s.speaker_name ?? s.speaker_id])).entries()
  )

  return (
    <div className="flex flex-col flex-1 min-w-0 bg-gray-900 overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Transcription
        </span>
        <div className="flex items-center gap-3">
          {segments.length > 0 && (
            <span className="text-xs text-gray-600">{segments.length} segments</span>
          )}
        </div>
      </div>

      {/* Speaker rename chips (shown when there are speakers) */}
      {uniqueSpeakers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b border-gray-800 bg-gray-950/40">
          <span className="text-xs text-gray-600 mr-1">Speakers:</span>
          {uniqueSpeakers.map(([speakerId, displayName]) => (
            <div key={speakerId}>
              {renamingSpeakerId === speakerId ? (
                <input
                  ref={renameInputRef}
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') cancelRename()
                  }}
                  className={`text-xs rounded px-1.5 py-0.5 bg-gray-800 border border-gray-500 outline-none w-28 ${speakerColor(speakerId)}`}
                />
              ) : (
                <button
                  onClick={() => startRename(speakerId, displayName)}
                  title="Click to rename speaker"
                  className={`text-xs rounded px-2 py-0.5 bg-gray-800/60 border border-gray-700 hover:border-gray-500 hover:bg-gray-800 transition-colors ${speakerColor(speakerId)}`}
                >
                  {displayName} ✎
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Transcript body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {segments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center">
              <span className="text-xl">🎙</span>
            </div>
            <div>
              <p className="text-sm text-gray-500">No transcription yet.</p>
              <p className="text-xs text-gray-600 mt-1">
                Press <span className="text-gray-500">Record</span> to start capturing audio.
              </p>
            </div>
          </div>
        ) : (
          segments.map((seg) => (
            <div key={seg.id} className="flex gap-2.5">
              <span className="text-xs text-gray-600 pt-0.5 shrink-0 w-10 text-right">
                {formatTime(seg.start_ms)}
              </span>
              <div className="flex-1 min-w-0">
                <span className={`text-xs font-semibold ${speakerColor(seg.speaker_id)} mr-1.5`}>
                  {seg.speaker_name ?? seg.speaker_id}
                </span>
                <span className="text-sm text-gray-300">{seg.text}</span>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
