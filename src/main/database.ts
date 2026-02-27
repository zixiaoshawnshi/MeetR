import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database

export function getDb(): Database.Database {
  return db
}

export function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  const dbPath = join(userDataPath, 'meetr.db')

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
      recording_file_path TEXT,
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

    CREATE TABLE IF NOT EXISTS session_recordings (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      file_path    TEXT NOT NULL,
      started_at   TEXT NOT NULL,
      stopped_at   TEXT NOT NULL,
      duration_ms  INTEGER,
      created_at   TEXT NOT NULL
    );
  `)

  // Backward-compatible migration for existing DBs created before
  // recording-scoped transcript imports were introduced.
  const segmentCols = db
    .prepare('PRAGMA table_info(transcript_segments)')
    .all() as Array<{ name: string }>
  if (!segmentCols.some((c) => c.name === 'recording_file_path')) {
    db.exec('ALTER TABLE transcript_segments ADD COLUMN recording_file_path TEXT')
  }
}

