import { useState, useEffect } from 'react'
import { Session } from '../types'

interface SessionListProps {
  onOpen: (id: number) => void
  onNew: () => void
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function SessionList({ onOpen, onNew }: SessionListProps) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    window.api.session.list().then((list) => {
      setSessions(list)
      setLoading(false)
    })
  }, [])

  const handleNew = async () => {
    setCreating(true)
    await onNew()
    setCreating(false)
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      {/* Top bar */}
      <div className="flex items-center px-4 h-12 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">MM</span>
          </div>
          <span className="text-sm font-semibold text-gray-200">MeetMate</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: branding + new session */}
        <div className="flex flex-col justify-center items-center w-80 shrink-0 px-10 border-r border-gray-800">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mb-4">
            <span className="text-white text-2xl font-bold">MM</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-100 mb-1">MeetMate</h1>
          <p className="text-sm text-gray-500 text-center mb-8">
            Meeting assistant for structured in-person sessions
          </p>
          <button
            onClick={handleNew}
            disabled={creating}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            {creating ? 'Starting…' : '+ New Meeting'}
          </button>
        </div>

        {/* Right: session list */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Past Sessions
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-gray-600 text-sm">
                Loading…
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-8">
                <p className="text-gray-600 text-sm">No past sessions.</p>
                <p className="text-gray-700 text-xs">
                  Create your first meeting to get started.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-800">
                {sessions.map((session) => (
                  <li key={session.id}>
                    <button
                      onClick={() => onOpen(session.id)}
                      className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-900 transition-colors text-left group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-200 group-hover:text-white truncate">
                          {session.title}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {formatDate(session.created_at)} at {formatTime(session.created_at)}
                        </p>
                      </div>
                      <span className="text-gray-700 group-hover:text-gray-400 ml-3 text-sm">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
