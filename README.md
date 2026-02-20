# MeetMate

MeetMate is a privacy-first desktop meeting assistant for structured in-person sessions.

## Privacy First

MeetMate can run fully local:
- local transcription service (Python)
- local data storage (SQLite)
- local recordings (WAV files)
- local AI summarization via Ollama

If you choose Ollama as your AI provider, no transcript/notes/agenda need to leave your machine.
Cloud providers (Anthropic/OpenAI/OpenRouter) are optional.

## What It Does

- live transcription + recording
- manual notes and agenda tracking
- AI-generated meeting summary + agenda updates

The app is built with Electron + React + TypeScript, with a Python transcription service and local SQLite storage.

## Current Status

Implemented:
- session create/open/list
- real-time transcription from local Python WebSocket service
- per-session WAV recordings
- speaker rename in transcript
- manual notes auto-save to SQLite
- agenda view/edit mode with auto-save to SQLite
- agenda lock while AI update is running
- AI Update with modular provider routing
- AI providers wired: Anthropic, Ollama, OpenAI, OpenRouter
- settings UI for provider/model + provider credentials/connection settings

## Architecture

- `src/main` (Electron main process)
  - IPC handlers, SQLite access, settings, AI orchestration
- `src/renderer` (React UI)
  - toolbar, agenda, transcript, notes, summary, settings
- `src/preload`
  - secure renderer API bridge
- `python/`
  - microphone capture, VAD, transcription, diarization WebSocket service

## Requirements

- Node.js 20+
- npm
- Python 3.10+
- `ffmpeg` on PATH (required for local diarization workflows)

For full local AI mode:
- Ollama running locally (default: `http://127.0.0.1:11434`)
- a local model pulled in Ollama (for example: `llama3.1:8b`)

## Local Setup

1. Install Node dependencies:

```bash
npm install
```

2. Install Python dependencies:

```bash
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
pip install -r python/requirements.txt
```

3. (Optional for local diarization) Create `python/.env` and add:

```env
HUGGINGFACE_TOKEN=...
```

4. In app Settings:
- choose AI Provider (`ollama` for local mode)
- set model name
- set Ollama base URL if not default

## Run (Development)

Open two terminals from repo root:

Terminal A (Python service):
```bash
python python/main.py
```

Terminal B (Electron app):
```bash
npm run dev
```

## Build

```bash
npm run build
```

## Packaging

```bash
npm run package
```

## Notes

- App data is stored locally in SQLite via `better-sqlite3`.
- Recordings are stored per session; output base directory is configurable in Settings.
- If AI update fails, check provider/model settings and local/cloud credentials.

## Design Doc

See [`DESIGN.md`](DESIGN.md) for product/phase details.
