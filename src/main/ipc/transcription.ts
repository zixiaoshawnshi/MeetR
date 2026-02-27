import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'
import { mkdtemp, rm, stat, unlink } from 'fs/promises'
import { statSync } from 'fs'
import { tmpdir } from 'os'
import { getDb } from '../database'
import { getSettings, recordingsBaseDir } from '../settings'
import { transcodeAudioToWav16kMono, transcodeWavToFlac } from '../audio-transcode'
import { ensureOptionalDiarizationRuntime, getPythonBackendStatus } from '../python-service'
import {
  startTranscriptionWs,
  stopTranscriptionWs,
  isTranscribing,
  listInputDevicesWs,
  transcribeFileWs,
  InputDevicePayload,
  SegmentPayload
} from '../transcription-client'
import type { TranscriptSegment } from '../../renderer/src/types'

let activeRecording:
  | {
      sessionId: number
      startedAt: string
      filePath: string
    }
  | null = null

function getWebContents(): Electron.WebContents | null {
  const windows = BrowserWindow.getAllWindows()
  return windows.length > 0 ? windows[0].webContents : null
}

function recordingsDir(sessionId: number): string {
  return join(recordingsBaseDir(), `session-${sessionId}`)
}

function recordingOutputPath(sessionId: number, startedAtIso: string): string {
  const stamp = startedAtIso.replace(/[:.]/g, '-')
  return join(recordingsDir(sessionId), `recording-${stamp}.wav`)
}

function estimateWavDurationMs(audioPath: string): number | null {
  try {
    const wavStat = statSync(audioPath)
    const dataBytes = Math.max(0, wavStat.size - 44)
    // 16kHz * 16-bit mono PCM => 32,000 bytes/second
    return Math.round((dataBytes / 32_000) * 1000)
  } catch {
    return null
  }
}

async function ensureDeepgramFlacRecordingPath(sessionId: number, filePath: string): Promise<string> {
  const lowerPath = filePath.toLowerCase()
  if (lowerPath.endsWith('.flac')) {
    return filePath
  }
  if (!lowerPath.endsWith('.wav')) {
    throw new Error('Deepgram bulk transcription supports WAV or FLAC recordings only.')
  }

  const flacPath = filePath.replace(/\.wav$/i, '.flac')
  try {
    const existing = await stat(flacPath)
    if (existing.size <= 0) {
      throw new Error('Existing FLAC file is empty.')
    }
  } catch {
    await transcodeWavToFlac(filePath, flacPath)
  }

  const outStat = await stat(flacPath)
  if (outStat.size <= 0) {
    throw new Error('FLAC conversion failed: output file is empty.')
  }

  const db = getDb()
  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE session_recordings
       SET file_path = ?
       WHERE session_id = ? AND file_path = ?`
    ).run(flacPath, sessionId, filePath)

    db.prepare(
      `UPDATE sessions
       SET audio_file_path = ?, updated_at = ?
       WHERE id = ? AND audio_file_path = ?`
    ).run(flacPath, now, sessionId, filePath)

    db.prepare(
      `UPDATE transcript_segments
       SET recording_file_path = ?
       WHERE session_id = ? AND recording_file_path = ?`
    ).run(flacPath, sessionId, filePath)
  })
  tx()

  await unlink(filePath).catch(() => undefined)
  return flacPath
}

export function registerTranscriptionHandlers(): void {
  /**
   * Start transcription for a session.
   * Returns { success: true } or { success: false, error: string }.
   */
  ipcMain.handle(
    'transcription:start',
    async (
      _event,
      sessionId: number,
      inputDeviceId?: number | null
    ): Promise<{ success: boolean; error?: string }> => {
      const wc = getWebContents()
      if (!wc) return { success: false, error: 'No renderer window' }

      try {
        const settings = getSettings()
        if (settings.transcription.mode === 'local' && settings.transcription.diarizationEnabled) {
          await ensureOptionalDiarizationRuntime()
        }
        const startedAt = new Date().toISOString()
        const outPath = recordingOutputPath(sessionId, startedAt)
        await startTranscriptionWs(
          sessionId,
          outPath,
          inputDeviceId ?? null,
          settings.transcription.mode,
          settings.transcription.language,
          settings.transcription.diarizationEnabled,
          settings.transcription.huggingFaceToken,
          settings.transcription.localDiarizationModelPath,
          settings.transcription.deepgramApiKey,
          settings.transcription.deepgramModel,
          wc,
          (payload) => {
            persistAndPushSegment(
              sessionId,
              activeRecording?.filePath ?? null,
              payload.speaker,
              payload.text,
              payload.start_ms,
              payload.end_ms,
              wc
            )
          }
        )
        activeRecording = {
          sessionId,
          startedAt,
          filePath: outPath
        }
        return { success: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  /**
   * Stop transcription.
   * Returns { audioPath: string | null }.
   * Also updates sessions.audio_file_path in the DB if a recording was made.
   */
  ipcMain.handle(
    'transcription:stop',
    async (_event, sessionId: number): Promise<{ audioPath: string | null }> => {
      const audioPath = await stopAndPersistRecording(sessionId)
      return { audioPath }
    }
  )

  /** Returns whether transcription is currently active. */
  ipcMain.handle('transcription:status', (): boolean => isTranscribing())

  /** Returns Python backend status plus a lightweight connectivity probe. */
  ipcMain.handle(
    'transcription:backend-status',
    async (): Promise<{
      python: ReturnType<typeof getPythonBackendStatus>
      serviceReachable: boolean
      serviceError: string | null
    }> => {
      const python = getPythonBackendStatus()
      try {
        await listInputDevicesWs()
        return { python, serviceReachable: true, serviceError: null }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { python, serviceReachable: false, serviceError: message }
      }
    }
  )

  /** List available microphone input devices from the Python service host. */
  ipcMain.handle('transcription:input-devices', async (): Promise<InputDevicePayload[]> => {
    return await listInputDevicesWs()
  })

  ipcMain.handle(
    'transcription:transcribe-recording',
    async (
      _event,
      sessionId: number,
      filePath: string
    ): Promise<{ success: boolean; canceled?: boolean; error?: string; importedCount?: number }> => {
      if (isTranscribing()) {
        return { success: false, error: 'Stop live recording before importing audio.' }
      }

      if (!filePath || !filePath.trim()) {
        return { success: false, error: 'Recording path is required.' }
      }
      const normalizedPath = filePath.trim()
      const lowerPath = normalizedPath.toLowerCase()
      if (!lowerPath.endsWith('.wav') && !lowerPath.endsWith('.flac')) {
        return { success: false, error: 'Only WAV and FLAC recordings are supported right now.' }
      }

      let tempDir: string | null = null
      let filePathForTranscription = normalizedPath
      try {
        const settings = getSettings()
        if (settings.transcription.mode === 'local' && settings.transcription.diarizationEnabled) {
          await ensureOptionalDiarizationRuntime()
        }
        const imported: SegmentPayload[] = []
        if (settings.transcription.mode === 'deepgram') {
          filePathForTranscription = await ensureDeepgramFlacRecordingPath(sessionId, normalizedPath)
        } else if (lowerPath.endsWith('.flac')) {
          tempDir = await mkdtemp(join(tmpdir(), 'meetr-transcribe-'))
          filePathForTranscription = join(tempDir, 'input.wav')
          await transcodeAudioToWav16kMono(normalizedPath, filePathForTranscription)
        }

        await transcribeFileWs(
          {
            filePath: filePathForTranscription,
            transcriptionMode: settings.transcription.mode,
            transcriptionLanguage: settings.transcription.language,
            diarizationEnabled: settings.transcription.diarizationEnabled,
            huggingFaceToken: settings.transcription.huggingFaceToken,
            localDiarizationModelPath: settings.transcription.localDiarizationModelPath,
            deepgramApiKey: settings.transcription.deepgramApiKey,
            deepgramModel: settings.transcription.deepgramModel,
            startOffsetMs: 0
          },
          (payload) => imported.push(payload)
        )

        const db = getDb()
        const now = new Date().toISOString()
        const recordingPathKey =
          settings.transcription.mode === 'deepgram' ? filePathForTranscription : normalizedPath
        const replaceSegments = db.transaction(() => {
          db.prepare(
            'DELETE FROM transcript_segments WHERE session_id = ? AND recording_file_path = ?'
          ).run(sessionId, recordingPathKey)
          const insert = db.prepare(
            `INSERT INTO transcript_segments
              (session_id, recording_file_path, speaker_id, text, start_ms, end_ms, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          for (const seg of imported) {
            insert.run(
              sessionId,
              recordingPathKey,
              seg.speaker,
              seg.text,
              seg.start_ms,
              seg.end_ms,
              now
            )
          }
        })
        replaceSegments()

        return { success: true, importedCount: imported.length }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      } finally {
        if (tempDir) {
          await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
        }
      }
    }
  )

  /**
   * Save an incoming segment to the DB and push it to the renderer.
   * Called internally by the WebSocket message handler — but we also expose
   * it as an IPC handle so the renderer can query existing segments on load.
   */
  ipcMain.handle(
    'transcription:segments',
    (_event, sessionId: number): TranscriptSegment[] => {
      const db = getDb()
      return db
        .prepare(
          `SELECT id, session_id, speaker_id, speaker_name, text, start_ms, end_ms, created_at
           FROM transcript_segments
           WHERE session_id = ?
           ORDER BY start_ms ASC`
        )
        .all(sessionId) as TranscriptSegment[]
    }
  )

  /**
   * Rename a speaker across all segments for this session.
   */
  ipcMain.handle(
    'transcription:rename-speaker',
    (_event, sessionId: number, speakerId: string, newName: string): void => {
      const db = getDb()
      db.prepare(
        `UPDATE transcript_segments
         SET speaker_name = ?
         WHERE session_id = ? AND speaker_id = ?`
      ).run(newName, sessionId, speakerId)
    }
  )
}

async function stopAndPersistRecording(sessionIdHint?: number): Promise<string | null> {
  const originalWavPath = await stopTranscriptionWs()
  const now = new Date().toISOString()
  let persistedAudioPath: string | null = originalWavPath

  const sessionId = sessionIdHint ?? activeRecording?.sessionId ?? null
  if (originalWavPath && sessionId) {
    const durationMs = estimateWavDurationMs(originalWavPath)
    let storedPath = originalWavPath
    if (originalWavPath.toLowerCase().endsWith('.wav')) {
      const flacPath = originalWavPath.replace(/\.wav$/i, '.flac')
      try {
        await transcodeWavToFlac(originalWavPath, flacPath)
        const outStat = await stat(flacPath)
        if (outStat.size > 0) {
          storedPath = flacPath
          await unlink(originalWavPath).catch(() => undefined)
        }
      } catch {
        // Keep WAV if compression fails.
      }
    }

    const db = getDb()
    db.prepare(
      'UPDATE sessions SET audio_file_path = ?, updated_at = ? WHERE id = ?'
    ).run(storedPath, now, sessionId)
    if (storedPath !== originalWavPath) {
      db.prepare(
        `UPDATE transcript_segments
         SET recording_file_path = ?
         WHERE session_id = ? AND recording_file_path = ?`
      ).run(storedPath, sessionId, originalWavPath)
    }
    persistedAudioPath = storedPath

    const startedAt =
      activeRecording && activeRecording.sessionId === sessionId
        ? activeRecording.startedAt
        : now

    db.prepare(
      `INSERT INTO session_recordings
         (session_id, file_path, started_at, stopped_at, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      sessionId,
      storedPath,
      startedAt,
      now,
      durationMs,
      now
    )
  }

  activeRecording = null
  return persistedAudioPath
}

export async function stopActiveTranscriptionForShutdown(): Promise<void> {
  await stopAndPersistRecording()
}

/**
 * Persist a live segment and push it to the renderer.
 * Called from the WebSocket client message handler via the main module.
 * (Kept as a standalone export so transcription-client.ts stays UI-agnostic.)
 */
function persistAndPushSegment(
  sessionId: number,
  recordingFilePath: string | null,
  speaker: string,
  text: string,
  start_ms: number,
  end_ms: number,
  wc: Electron.WebContents
): void {
  const db = getDb()
  const now = new Date().toISOString()
  const result = db
    .prepare(
      `INSERT INTO transcript_segments
         (session_id, recording_file_path, speaker_id, text, start_ms, end_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(sessionId, recordingFilePath, speaker, text, start_ms, end_ms, now)

  const segment: TranscriptSegment = {
    id: result.lastInsertRowid as number,
    session_id: sessionId,
    speaker_id: speaker,
    speaker_name: null,
    text,
    start_ms,
    end_ms,
    created_at: now
  }

  wc.send('transcription:segment', segment)
}
