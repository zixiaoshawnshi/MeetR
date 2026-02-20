import { ipcMain } from 'electron'
import { getDb } from '../database'
import { getSettings } from '../settings'
import { generateMeetingUpdate } from '../ai/meeting-update'

interface TranscriptRow {
  speaker_id: string
  speaker_name: string | null
  text: string
  start_ms: number
}

export interface AiUpdateResult {
  summary: string
  agenda: string
  model_used: string
  generated_at: string
}

export function registerAiHandlers(): void {
  ipcMain.handle('ai:update', async (_event, sessionId: number): Promise<AiUpdateResult> => {
    const db = getDb()
    const now = new Date().toISOString()

    const sessionExists = db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(sessionId) as
      | Record<string, unknown>
      | undefined
    if (!sessionExists) {
      throw new Error(`Session ${sessionId} not found.`)
    }

    const notesRow = db
      .prepare('SELECT content FROM notes WHERE session_id = ? ORDER BY id DESC LIMIT 1')
      .get(sessionId) as { content: string } | undefined
    const agendaRow = db
      .prepare('SELECT content FROM agendas WHERE session_id = ? ORDER BY id DESC LIMIT 1')
      .get(sessionId) as { content: string } | undefined
    const transcriptRows = db
      .prepare(
        `SELECT speaker_id, speaker_name, text, start_ms
         FROM transcript_segments
         WHERE session_id = ?
         ORDER BY start_ms ASC`
      )
      .all(sessionId) as TranscriptRow[]

    const aiResult = await generateMeetingUpdate(
      {
        transcript: transcriptRows.map((row) => ({
          speaker: row.speaker_name?.trim() || row.speaker_id,
          text: row.text,
          start_ms: row.start_ms
        })),
        notes: notesRow?.content ?? '',
        agenda: agendaRow?.content ?? ''
      },
      getSettings().ai
    )

    db.prepare(
      `INSERT INTO summaries (session_id, content, model_used, generated_at)
       VALUES (?, ?, ?, ?)`
    ).run(sessionId, aiResult.summary, aiResult.modelUsed, now)

    const agendaUpdate = db
      .prepare('UPDATE agendas SET content = ?, updated_at = ? WHERE session_id = ?')
      .run(aiResult.agenda, now, sessionId)
    if (agendaUpdate.changes === 0) {
      db.prepare('INSERT INTO agendas (session_id, content, updated_at) VALUES (?, ?, ?)').run(
        sessionId,
        aiResult.agenda,
        now
      )
    }

    db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId)

    return {
      summary: aiResult.summary,
      agenda: aiResult.agenda,
      model_used: aiResult.modelUsed,
      generated_at: now
    }
  })
}
