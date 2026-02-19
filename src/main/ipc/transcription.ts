import { ipcMain, BrowserWindow } from 'electron'
import { app } from 'electron'
import { join } from 'path'
import { getDb } from '../database'
import {
  startTranscriptionWs,
  stopTranscriptionWs,
  isTranscribing
} from '../transcription-client'
import type { TranscriptSegment } from '../../renderer/src/types'

function getWebContents(): Electron.WebContents | null {
  const windows = BrowserWindow.getAllWindows()
  return windows.length > 0 ? windows[0].webContents : null
}

function recordingsDir(sessionId: number): string {
  return join(app.getPath('userData'), 'recordings', `session-${sessionId}`)
}

export function registerTranscriptionHandlers(): void {
  /**
   * Start transcription for a session.
   * Returns { success: true } or { success: false, error: string }.
   */
  ipcMain.handle(
    'transcription:start',
    async (_event, sessionId: number): Promise<{ success: boolean; error?: string }> => {
      const wc = getWebContents()
      if (!wc) return { success: false, error: 'No renderer window' }

      try {
        const outDir = recordingsDir(sessionId)
        await startTranscriptionWs(sessionId, outDir, wc, (payload) => {
          persistAndPushSegment(
            sessionId,
            payload.speaker,
            payload.text,
            payload.start_ms,
            payload.end_ms,
            wc
          )
        })
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
      const audioPath = await stopTranscriptionWs()

      if (audioPath && sessionId) {
        const db = getDb()
        const now = new Date().toISOString()
        db.prepare(
          'UPDATE sessions SET audio_file_path = ?, updated_at = ? WHERE id = ?'
        ).run(audioPath, now, sessionId)
      }

      return { audioPath }
    }
  )

  /** Returns whether transcription is currently active. */
  ipcMain.handle('transcription:status', (): boolean => isTranscribing())

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

/**
 * Persist a live segment and push it to the renderer.
 * Called from the WebSocket client message handler via the main module.
 * (Kept as a standalone export so transcription-client.ts stays UI-agnostic.)
 */
function persistAndPushSegment(
  sessionId: number,
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
         (session_id, speaker_id, text, start_ms, end_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(sessionId, speaker, text, start_ms, end_ms, now)

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
