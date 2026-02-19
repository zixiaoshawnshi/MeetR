import { useState, useRef, useEffect } from 'react'
import { SessionData } from '../types'

interface ToolbarProps {
  session: SessionData | null
  recording: boolean
  recordError: string | null
  onTitleChange: (title: string) => void
  onRecord: () => void
  onSessionsClick: () => void
}

export default function Toolbar({
  session,
  recording,
  recordError,
  onTitleChange,
  onRecord,
  onSessionsClick
}: ToolbarProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(session?.title ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTitleDraft(session?.title ?? '')
  }, [session?.title])

  useEffect(() => {
    if (editingTitle) inputRef.current?.select()
  }, [editingTitle])

  const commitTitle = () => {
    const trimmed = titleDraft.trim() || 'Untitled Meeting'
    setTitleDraft(trimmed)
    setEditingTitle(false)
    if (trimmed !== session?.title) onTitleChange(trimmed)
  }

  return (
    <div className="flex flex-col shrink-0">
      <div className="flex items-center gap-3 px-4 h-12 bg-gray-900 border-b border-gray-700">
        {/* Logo mark */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">MM</span>
          </div>
        </div>

        {/* Editable session title */}
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              ref={inputRef}
              className="title-input text-sm font-medium text-gray-100 bg-gray-800 border border-gray-600 rounded px-2 py-0.5 w-full max-w-sm"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') {
                  setTitleDraft(session?.title ?? '')
                  setEditingTitle(false)
                }
              }}
            />
          ) : (
            <button
              className="text-sm font-medium text-gray-200 hover:text-white truncate max-w-sm text-left"
              onClick={() => setEditingTitle(true)}
              title="Click to rename session"
            >
              {session?.title ?? 'Untitled Meeting'}
            </button>
          )}
        </div>

        {/* Right-side controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Recording state indicator */}
          <div className="flex items-center gap-1.5 text-xs select-none">
            {recording ? (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-red-400 font-medium">Recording</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-gray-600" />
                <span className="text-gray-500">Not recording</span>
              </>
            )}
          </div>

          {/* Record / Stop button */}
          <button
            onClick={onRecord}
            disabled={!session}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
              recording
                ? 'bg-red-900/50 border-red-700 text-red-300 hover:bg-red-900/70'
                : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <span className={`w-2 h-2 rounded-full ${recording ? 'bg-red-400 animate-pulse' : 'bg-gray-400'}`} />
            {recording ? 'Stop' : 'Record'}
          </button>

          {/* AI Update button — placeholder (Phase 4) */}
          <button
            disabled
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed"
            title="AI assistant not yet configured (Phase 4)"
          >
            <span className="text-sm">✦</span>
            AI Update
          </button>

          {/* Sessions menu */}
          <button
            onClick={onSessionsClick}
            className="px-3 py-1.5 rounded text-xs font-medium bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 hover:text-white transition-colors"
          >
            Sessions
          </button>
        </div>
      </div>

      {/* Error banner */}
      {recordError && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-red-950/60 border-b border-red-900/50">
          <span className="text-red-400 text-xs">⚠</span>
          <span className="text-red-300 text-xs">{recordError}</span>
          <span className="text-red-500 text-xs ml-1">
            — Make sure the Python transcription service is running:{' '}
            <code className="font-mono">python python/main.py</code>
          </span>
        </div>
      )}
    </div>
  )
}
