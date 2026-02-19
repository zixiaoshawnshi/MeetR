"""
MeetMate transcription service.
Runs a plain WebSocket server on ws://127.0.0.1:8765

Message protocol
----------------
Client → Server:
  {"type": "start", "session_id": "<id>", "output_dir": "<path>"}
  {"type": "stop"}

Server → Client:
  {"type": "ready"}
  {"type": "segment", "speaker": "Speaker 1", "text": "...", "start_ms": 0, "end_ms": 1500}
  {"type": "error", "message": "..."}
  {"type": "stopped", "audio_path": "<path or null>"}
"""

import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Optional

import websockets

from diarization import SpeakerTracker
from transcription import TranscriptionEngine

# Load HuggingFace token from python/.env (next to this file)
_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

HF_TOKEN: Optional[str] = os.environ.get("HUGGINGFACE_TOKEN")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)

PORT = 8765


async def handle_client(ws) -> None:
    log.info("WebSocket client connected")
    session_id: Optional[str] = None
    engine: Optional[TranscriptionEngine] = None
    tracker: Optional[SpeakerTracker] = SpeakerTracker(HF_TOKEN) if HF_TOKEN else None

    async def send_segment(speaker: str, text: str, start_ms: int, end_ms: int) -> None:
        """Called from transcription thread via run_coroutine_threadsafe."""
        try:
            await ws.send(json.dumps({
                "type": "segment",
                "speaker": speaker,
                "text": text,
                "start_ms": start_ms,
                "end_ms": end_ms,
            }))
        except Exception:
            pass  # WebSocket may have closed

    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send(json.dumps({"type": "error", "message": "Invalid JSON"}))
                continue

            msg_type = msg.get("type")

            if msg_type == "start":
                if engine is not None:
                    engine.stop()

                session_id = msg.get("session_id")
                output_dir = msg.get("output_dir")
                log.info("Start — session=%s output_dir=%s", session_id, output_dir)

                wav_path: Optional[str] = None
                if output_dir and session_id:
                    wav_path = str(Path(output_dir) / "recording.wav")

                if tracker is not None:
                    tracker.reset()

                engine = TranscriptionEngine(
                    on_segment=send_segment,
                    model_size="base",
                    speaker_tracker=tracker,
                    output_path=wav_path,
                )
                engine.start(asyncio.get_event_loop())
                await ws.send(json.dumps({"type": "ready"}))

            elif msg_type == "stop":
                audio_path: Optional[str] = None
                if engine is not None:
                    audio_path = engine.saved_audio_path
                    engine.stop()
                    engine = None
                log.info("Stop — session=%s audio=%s", session_id, audio_path)
                await ws.send(json.dumps({
                    "type": "stopped",
                    "audio_path": audio_path,
                }))

            else:
                log.warning("Unknown message type: %s", msg_type)
                await ws.send(json.dumps({
                    "type": "error",
                    "message": f"Unknown type: {msg_type}",
                }))

    except websockets.exceptions.ConnectionClosed:
        log.info("Client disconnected (session=%s)", session_id)
    except Exception as exc:
        log.exception("Unexpected WebSocket error")
        try:
            await ws.send(json.dumps({"type": "error", "message": str(exc)}))
        except Exception:
            pass
    finally:
        if engine is not None:
            engine.stop()


async def main() -> None:
    log.info("MeetMate transcription service starting on port %d", PORT)
    async with websockets.serve(handle_client, "127.0.0.1", PORT):
        log.info("Listening on ws://127.0.0.1:%d — press Ctrl+C to stop", PORT)
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
