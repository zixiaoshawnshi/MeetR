import { ipcMain } from 'electron'
import { getDb } from '../database'

export interface Session {
  id: number
  title: string
  audio_file_path: string | null
  created_at: string
  updated_at: string
}

export interface SessionData extends Session {
  notes_content: string
  agenda_content: string
  latest_summary: string | null
  latest_summary_generated_at: string | null
}

export function registerSessionHandlers(): void {
  ipcMain.handle('session:list', (): Session[] => {
    const db = getDb()
    return db.prepare(`
      SELECT * FROM sessions ORDER BY updated_at DESC
    `).all() as Session[]
  })

  ipcMain.handle('session:create', (_event, title: string): Session => {
    const db = getDb()
    const now = new Date().toISOString()

    const result = db.prepare(`
      INSERT INTO sessions (title, created_at, updated_at) VALUES (?, ?, ?)
    `).run(title, now, now)

    const sessionId = result.lastInsertRowid as number

    // Seed empty notes and agenda rows
    db.prepare(`INSERT INTO notes (session_id, content, updated_at) VALUES (?, '', ?)`).run(sessionId, now)
    db.prepare(`INSERT INTO agendas (session_id, content, updated_at) VALUES (?, '', ?)`).run(sessionId, now)

    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Session
  })

  ipcMain.handle('session:get', (_event, id: number): SessionData | null => {
    const db = getDb()
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined
    if (!session) return null

    const notes = db.prepare(
      'SELECT content FROM notes WHERE session_id = ? ORDER BY id DESC LIMIT 1'
    ).get(id) as { content: string } | undefined

    const agenda = db.prepare(
      'SELECT content FROM agendas WHERE session_id = ? ORDER BY id DESC LIMIT 1'
    ).get(id) as { content: string } | undefined

    const summary = db.prepare(
      'SELECT content, generated_at FROM summaries WHERE session_id = ? ORDER BY generated_at DESC LIMIT 1'
    ).get(id) as { content: string; generated_at: string } | undefined

    return {
      ...session,
      notes_content: notes?.content ?? '',
      agenda_content: agenda?.content ?? '',
      latest_summary: summary?.content ?? null,
      latest_summary_generated_at: summary?.generated_at ?? null
    }
  })

  ipcMain.handle('session:update-title', (_event, id: number, title: string): void => {
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?').run(title, now, id)
  })

  ipcMain.handle('session:update-notes', (_event, id: number, content: string): void => {
    const db = getDb()
    const now = new Date().toISOString()

    const result = db
      .prepare('UPDATE notes SET content = ?, updated_at = ? WHERE session_id = ?')
      .run(content, now, id)
    if (result.changes === 0) {
      db.prepare('INSERT INTO notes (session_id, content, updated_at) VALUES (?, ?, ?)').run(
        id,
        content,
        now
      )
    }

    db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, id)
  })

  ipcMain.handle('session:update-agenda', (_event, id: number, content: string): void => {
    const db = getDb()
    const now = new Date().toISOString()

    const result = db
      .prepare('UPDATE agendas SET content = ?, updated_at = ? WHERE session_id = ?')
      .run(content, now, id)
    if (result.changes === 0) {
      db.prepare('INSERT INTO agendas (session_id, content, updated_at) VALUES (?, ?, ?)').run(
        id,
        content,
        now
      )
    }

    db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, id)
  })

  ipcMain.handle('session:delete', (_event, id: number): void => {
    const db = getDb()
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
  })
}
