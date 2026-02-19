import { useState, useCallback, useEffect, useRef } from 'react'
import { SessionData, TranscriptSegment } from './types'
import Toolbar from './components/Toolbar'
import AgendaPanel from './components/AgendaPanel'
import TranscriptPanel from './components/TranscriptPanel'
import NotesPanel from './components/NotesPanel'
import SummaryPanel from './components/SummaryPanel'
import SessionList from './components/SessionList'
import ConsentDialog from './components/ConsentDialog'

export default function App() {
  const [session, setSession] = useState<SessionData | null>(null)
  const [showSessionList, setShowSessionList] = useState(true)
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [recording, setRecording] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const [recordError, setRecordError] = useState<string | null>(null)
  // Consent is scoped to the current session (reset on session change)
  const consentGivenRef = useRef(false)

  // ─── Subscribe to live transcription events ──────────────────────────────
  useEffect(() => {
    if (!session) return

    // Load any segments already persisted for this session
    window.api.transcription.segments(session.id).then(setSegments)

    const unsubSegment = window.api.transcription.onSegment((seg) => {
      setSegments((prev) => [...prev, seg])
    })

    const unsubState = window.api.transcription.onStateChange((state) => {
      setRecording(state.recording)
      if (!state.recording) setRecordError(null)
    })

    return () => {
      unsubSegment()
      unsubState()
    }
  }, [session?.id])

  // ─── Session management ───────────────────────────────────────────────────
  const loadSession = useCallback(async (id: number) => {
    const data = await window.api.session.get(id)
    if (data) {
      setSession(data)
      setSegments([])
      setRecording(false)
      setRecordError(null)
      consentGivenRef.current = false
      setShowSessionList(false)
    }
  }, [])

  const handleNewSession = useCallback(async () => {
    const created = await window.api.session.create('Untitled Meeting')
    await loadSession(created.id)
  }, [loadSession])

  const handleTitleChange = useCallback(
    async (title: string) => {
      if (!session) return
      await window.api.session.updateTitle(session.id, title)
      setSession((prev) => (prev ? { ...prev, title } : null))
    },
    [session]
  )

  const handleSessionsClick = useCallback(async () => {
    // Stop recording if active before navigating away
    if (recording && session) {
      await window.api.transcription.stop(session.id)
    }
    setShowSessionList(true)
  }, [recording, session])

  // ─── Recording ────────────────────────────────────────────────────────────
  const doStart = useCallback(async () => {
    if (!session) return
    setRecordError(null)
    const result = await window.api.transcription.start(session.id)
    if (!result.success) {
      setRecordError(result.error ?? 'Could not connect to transcription service')
    }
  }, [session])

  const handleRecord = useCallback(async () => {
    if (!session) return

    if (recording) {
      await window.api.transcription.stop(session.id)
      return
    }

    if (!consentGivenRef.current) {
      setShowConsent(true)
      return
    }

    await doStart()
  }, [session, recording, doStart])

  const handleConsentAgree = useCallback(async () => {
    consentGivenRef.current = true
    setShowConsent(false)
    await doStart()
  }, [doStart])

  // ─── Speaker renaming ─────────────────────────────────────────────────────
  const handleRenameSpeaker = useCallback(
    async (speakerId: string, newName: string) => {
      if (!session) return
      await window.api.transcription.renameSpeaker(session.id, speakerId, newName)
      // Optimistic update: apply new name to all matching segments in state
      setSegments((prev) =>
        prev.map((s) =>
          s.speaker_id === speakerId ? { ...s, speaker_name: newName } : s
        )
      )
    },
    [session]
  )

  // ─── Render ───────────────────────────────────────────────────────────────
  if (showSessionList) {
    return <SessionList onOpen={loadSession} onNew={handleNewSession} />
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {showConsent && (
        <ConsentDialog
          onAgree={handleConsentAgree}
          onDecline={() => setShowConsent(false)}
        />
      )}

      <Toolbar
        session={session}
        recording={recording}
        recordError={recordError}
        onTitleChange={handleTitleChange}
        onRecord={handleRecord}
        onSessionsClick={handleSessionsClick}
      />

      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex flex-1 min-h-0 divide-x divide-gray-700">
          <AgendaPanel content={session?.agenda_content ?? ''} />
          <TranscriptPanel
            segments={segments}
            sessionId={session?.id}
            onRenameSpeaker={handleRenameSpeaker}
          />
          <NotesPanel content={session?.notes_content ?? ''} />
        </div>
        <SummaryPanel content={session?.latest_summary ?? null} />
      </div>
    </div>
  )
}
