# MeetMate

MeetMate is a desktop meeting assistant for structured in-person sessions.

It combines:
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
- AI Update (Anthropic Claude) with persisted summary + updated agenda
- settings UI for AI provider/model + provider keys

Partially implemented:
- multi-provider AI settings are present (Ollama/OpenAI/OpenRouter/Anthropic),
  but only Anthropic is currently wired for requests.

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

3. (Optional) Create `python/.env` and add:

```env
HUGGINGFACE_TOKEN=...
```

4. In app Settings, add your Anthropic API key and choose model/provider.

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

- The app stores data in SQLite via `better-sqlite3`.
- Recordings are stored per session; output base directory is configurable in Settings.
- If AI update fails, check provider key/model in Settings and app logs.

## Design Doc

See [`DESIGN.md`](DESIGN.md) for product/phase details.
