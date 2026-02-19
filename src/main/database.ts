import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database

export function getDb(): Database.Database {
  return db
}

export function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  const dbPath = join(userDataPath, 'meetmate.db')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT NOT NULL DEFAULT 'Untitled Meeting',
      audio_file_path TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transcript_segments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      speaker_id    TEXT NOT NULL,
      speaker_name  TEXT,
      text          TEXT NOT NULL,
      start_ms      INTEGER NOT NULL,
      end_ms        INTEGER NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      content     TEXT NOT NULL DEFAULT '',
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agendas (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      content     TEXT NOT NULL DEFAULT '',
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      content      TEXT NOT NULL,
      model_used   TEXT NOT NULL,
      generated_at TEXT NOT NULL
    );
  `)
}
