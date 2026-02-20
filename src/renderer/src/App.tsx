import { useState, useCallback, useEffect, useRef } from 'react'
import {
  AppSettings,
  AppPathsInfo,
  AppSettingsPatch,
  SessionData,
  SessionRecording,
  TranscriptSegment,
  TranscriptionInputDevice
} from './types'
import Toolbar from './components/Toolbar'
import AgendaPanel from './components/AgendaPanel'
import TranscriptPanel from './components/TranscriptPanel'
import NotesPanel from './components/NotesPanel'
import SummaryPanel from './components/SummaryPanel'
import SessionList from './components/SessionList'
import ConsentDialog from './components/ConsentDialog'
import RecordingsPanel from './components/RecordingsPanel'
import SettingsModal from './components/SettingsModal'

const AUTOSAVE_DEBOUNCE_MS = 500

export default function App() {
  const [session, setSession] = useState<SessionData | null>(null)
  const [showSessionList, setShowSessionList] = useState(true)
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [recording, setRecording] = useState(false)
  const [stoppingRecording, setStoppingRecording] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const [recordError, setRecordError] = useState<string | null>(null)
  const [inputDevices, setInputDevices] = useState<TranscriptionInputDevice[]>([])
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState<number | null>(null)
  const [recordings, setRecordings] = useState<SessionRecording[]>([])
  const [showRecordingsPanel, setShowRecordingsPanel] = useState(false)
  const [recordingsLoading, setRecordingsLoading] = useState(false)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [pathsInfo, setPathsInfo] = useState<AppPathsInfo | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [notesContent, setNotesContent] = useState('')
  const [agendaContent, setAgendaContent] = useState('')
  const [aiSummarizing, setAiSummarizing] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const consentGivenRef = useRef(false)

  useEffect(() => {
    const loadSettingsAndDevices = async () => {
      try {
        const loadedSettings = await window.api.settings.get()
        setSettings(loadedSettings)
        const loadedPaths = await window.api.settings.paths()
        setPathsInfo(loadedPaths)

        const devices = await window.api.transcription.inputDevices()
        setInputDevices(devices)
        if (devices.length === 0) {
          setSelectedInputDeviceId(null)
          return
        }

        const preferredId = loadedSettings.audio.defaultInputDeviceId
        if (preferredId !== null && devices.some((d) => d.id === preferredId)) {
          setSelectedInputDeviceId(preferredId)
          return
        }

        const systemDefault = devices.find((d) => d.is_default)?.id ?? devices[0].id
        setSelectedInputDeviceId(systemDefault)
      } catch (error) {
        console.error('Failed to list input devices', error)
      }
    }

    void loadSettingsAndDevices()
  }, [])

  useEffect(() => {
    if (!session) return

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

  const loadRecordings = useCallback(async (sessionId: number) => {
    setRecordingsLoading(true)
    try {
      const rows = await window.api.recording.list(sessionId)
      setRecordings(rows)
    } finally {
      setRecordingsLoading(false)
    }
  }, [])

  const loadSession = useCallback(
    async (id: number) => {
      const data = await window.api.session.get(id)
      if (data) {
        setSession(data)
        setNotesContent(data.notes_content)
        setAgendaContent(data.agenda_content)
        setSegments([])
        setRecordings([])
        setShowRecordingsPanel(false)
        setRecording(false)
        setStoppingRecording(false)
        setRecordError(null)
        setAiError(null)
        setAiSummarizing(false)
        consentGivenRef.current = false
        setShowSessionList(false)
        await loadRecordings(id)
      }
    },
    [loadRecordings]
  )

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
    if (recording && session) {
      try {
        setStoppingRecording(true)
        await window.api.transcription.stop(session.id)
      } finally {
        setStoppingRecording(false)
      }
    }
    setShowRecordingsPanel(false)
    setShowSessionList(true)
  }, [recording, session])

  const handleSettingsClick = useCallback(() => {
    setShowSettings(true)
  }, [])

  useEffect(() => {
    const unsub = window.api.menu.onAction((action) => {
      if (action === 'sessions') {
        void handleSessionsClick()
      } else if (action === 'settings') {
        handleSettingsClick()
      }
    })
    return () => unsub()
  }, [handleSessionsClick, handleSettingsClick])

  const doStart = useCallback(async () => {
    if (!session) return
    setRecordError(null)
    const result = await window.api.transcription.start(session.id, selectedInputDeviceId)
    if (!result.success) {
      setRecordError(result.error ?? 'Could not connect to transcription service')
    }
  }, [session, selectedInputDeviceId])

  const handleRecord = useCallback(async () => {
    if (!session) return

    if (recording) {
      try {
        setStoppingRecording(true)
        await window.api.transcription.stop(session.id)
      } finally {
        setStoppingRecording(false)
      }
      await loadRecordings(session.id)
      return
    }

    if (!consentGivenRef.current) {
      setShowConsent(true)
      return
    }

    await doStart()
  }, [session, recording, doStart, loadRecordings])

  const handleConsentAgree = useCallback(async () => {
    consentGivenRef.current = true
    setShowConsent(false)
    await doStart()
  }, [doStart])

  const handleSaveSettings = useCallback(async (patch: AppSettingsPatch) => {
    const updated = await window.api.settings.update(patch)
    setSettings(updated)
    const updatedPaths = await window.api.settings.paths()
    setPathsInfo(updatedPaths)

    const devices = await window.api.transcription.inputDevices()
    setInputDevices(devices)
    const nextId = updated.audio.defaultInputDeviceId
    if (nextId !== null && devices.some((d) => d.id === nextId)) {
      setSelectedInputDeviceId(nextId)
    } else if (devices.length > 0) {
      const systemDefault = devices.find((d) => d.is_default)?.id ?? devices[0].id
      setSelectedInputDeviceId(systemDefault)
    } else {
      setSelectedInputDeviceId(null)
    }
  }, [])

  const handleRenameSpeaker = useCallback(
    async (speakerId: string, newName: string) => {
      if (!session) return
      await window.api.transcription.renameSpeaker(session.id, speakerId, newName)
      setSegments((prev) =>
        prev.map((s) =>
          s.speaker_id === speakerId ? { ...s, speaker_name: newName } : s
        )
      )
    },
    [session]
  )

  const handleAiUpdate = useCallback(async () => {
    if (!session) return
    const sessionId = session.id
    setAiError(null)
    setAiSummarizing(true)

    try {
      // Flush draft edits so prompt construction reads latest values from DB.
      await window.api.session.updateNotes(sessionId, notesContent)
      await window.api.session.updateAgenda(sessionId, agendaContent)

      const result = await window.api.ai.update(sessionId)
      setAgendaContent(result.agenda)
      setSession((prev) =>
        prev && prev.id === sessionId
          ? {
              ...prev,
              notes_content: notesContent,
              agenda_content: result.agenda,
              latest_summary: result.summary,
              latest_summary_generated_at: result.generated_at
            }
          : prev
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI update failed'
      setAiError(message)
    } finally {
      setAiSummarizing(false)
    }
  }, [session, notesContent, agendaContent])

  useEffect(() => {
    if (!session) return
    setNotesContent(session.notes_content)
    setAgendaContent(session.agenda_content)
  }, [session?.id, session?.notes_content, session?.agenda_content])

  useEffect(() => {
    if (!session) return
    if (notesContent === session.notes_content) return

    const sessionId = session.id
    const nextContent = notesContent
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          await window.api.session.updateNotes(sessionId, nextContent)
          setSession((prev) =>
            prev && prev.id === sessionId ? { ...prev, notes_content: nextContent } : prev
          )
        } catch (error) {
          console.error('Failed to auto-save notes', error)
        }
      })()
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(timeout)
  }, [session, notesContent])

  useEffect(() => {
    if (!session) return
    if (agendaContent === session.agenda_content) return

    const sessionId = session.id
    const nextContent = agendaContent
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          await window.api.session.updateAgenda(sessionId, nextContent)
          setSession((prev) =>
            prev && prev.id === sessionId ? { ...prev, agenda_content: nextContent } : prev
          )
        } catch (error) {
          console.error('Failed to auto-save agenda', error)
        }
      })()
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(timeout)
  }, [session, agendaContent])

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {showConsent && !showSessionList && (
        <ConsentDialog
          onAgree={handleConsentAgree}
          onDecline={() => setShowConsent(false)}
        />
      )}

      {showSessionList ? (
        <SessionList onOpen={loadSession} onNew={handleNewSession} />
      ) : (
        <>
          <Toolbar
            session={session}
            recording={recording}
            stoppingRecording={stoppingRecording}
            recordError={recordError}
            aiBusy={aiSummarizing}
            aiError={aiError}
            onTitleChange={handleTitleChange}
            onRecord={handleRecord}
            onAiUpdate={handleAiUpdate}
            onRecordingsClick={() => setShowRecordingsPanel(true)}
            recordingsCount={recordings.length}
            inputDevices={inputDevices}
            selectedInputDeviceId={selectedInputDeviceId}
            onInputDeviceChange={setSelectedInputDeviceId}
          />

          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex flex-1 min-h-0 divide-x divide-gray-700">
              <AgendaPanel
                content={agendaContent}
                onChange={setAgendaContent}
                locked={aiSummarizing}
              />
              <TranscriptPanel
                segments={segments}
                sessionId={session?.id}
                onRenameSpeaker={handleRenameSpeaker}
              />
              <NotesPanel content={notesContent} onChange={setNotesContent} />
            </div>
            <SummaryPanel
              content={session?.latest_summary ?? null}
              lastUpdated={session?.latest_summary_generated_at ?? undefined}
            />
          </div>

          <RecordingsPanel
            open={showRecordingsPanel}
            recordings={recordings}
            loading={recordingsLoading}
            onClose={() => setShowRecordingsPanel(false)}
            onRefresh={() => {
              if (!session) return
              void loadRecordings(session.id)
            }}
            onOpenFile={(filePath) => {
              void window.api.recording.openFile(filePath)
            }}
            onShowInFolder={(filePath) => {
              void window.api.recording.showInFolder(filePath)
            }}
          />
        </>
      )}

      <SettingsModal
        open={showSettings}
        settings={settings}
        pathsInfo={pathsInfo}
        inputDevices={inputDevices}
        onClose={() => setShowSettings(false)}
        onSave={handleSaveSettings}
        onPickDirectory={() => window.api.settings.pickDirectory()}
        onDownloadDiarizationModel={async () => {
          const result = await window.api.settings.downloadDiarizationModel()
          const refreshed = await window.api.settings.get()
          setSettings(refreshed)
          return result
        }}
        onValidateDiarizationModel={() => window.api.settings.validateDiarizationModel()}
      />
    </div>
  )
}
