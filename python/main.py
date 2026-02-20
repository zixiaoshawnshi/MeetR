"""
MeetMate transcription service.
Runs a plain WebSocket server on ws://127.0.0.1:8765

Message protocol
----------------
Client -> Server:
  {"type": "start", "session_id": "<id>", "output_path": "<path>"}
  {"type": "list_inputs"}
  {"type": "stop"}

Server -> Client:
  {"type": "ready"}
  {"type": "inputs", "devices": [{"id": 1, "name": "Mic", "is_default": true}]}
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

import sounddevice as sd
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

ENV_HF_TOKEN: Optional[str] = os.environ.get("HUGGINGFACE_TOKEN")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)

PORT = 8765

if not ENV_HF_TOKEN:
    log.warning("HUGGINGFACE_TOKEN not set; local speaker diarization fallback will stay on Speaker 1.")


def list_input_devices() -> list[dict]:
    devices = sd.query_devices()
    default_device = sd.default.device
    default_input = default_device[0] if isinstance(default_device, (list, tuple)) else default_device
    rows = []

    for idx, device in enumerate(devices):
        if int(device.get("max_input_channels", 0)) <= 0:
            continue
        rows.append({
            "id": idx,
            "name": str(device.get("name", f"Input {idx}")),
            "is_default": idx == default_input,
        })

    return rows


async def handle_client(ws) -> None:
    log.info("WebSocket client connected")
    session_id: Optional[str] = None
    engine: Optional[TranscriptionEngine] = None
    tracker: Optional[SpeakerTracker] = None

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

            if msg_type == "list_inputs":
                try:
                    await ws.send(json.dumps({
                        "type": "inputs",
                        "devices": list_input_devices(),
                    }))
                except Exception as exc:
                    await ws.send(json.dumps({
                        "type": "error",
                        "message": f"Failed to list input devices: {exc}",
                    }))
                continue

            if msg_type == "start":
                if engine is not None:
                    engine.stop(wait=True)

                session_id = msg.get("session_id")
                output_path = msg.get("output_path")
                input_device_id = msg.get("input_device_id")
                transcription_mode = msg.get("transcription_mode")
                diarization_enabled = msg.get("diarization_enabled")
                huggingface_token = msg.get("huggingface_token")
                local_model_path = msg.get("local_diarization_model_path")
                deepgram_api_key = msg.get("deepgram_api_key")
                deepgram_model = msg.get("deepgram_model")
                if not isinstance(input_device_id, int):
                    input_device_id = None
                if transcription_mode not in {"local", "deepgram"}:
                    transcription_mode = "local"
                if not isinstance(diarization_enabled, bool):
                    diarization_enabled = False
                if not isinstance(huggingface_token, str):
                    huggingface_token = ""
                if not isinstance(local_model_path, str) or not local_model_path.strip():
                    local_model_path = None
                if not isinstance(deepgram_api_key, str):
                    deepgram_api_key = ""
                if not isinstance(deepgram_model, str) or not deepgram_model.strip():
                    deepgram_model = "nova-2"

                token_for_session = huggingface_token.strip() or (ENV_HF_TOKEN or "")
                tracker = (
                    SpeakerTracker(token_for_session, model_source=local_model_path)
                    if diarization_enabled and (token_for_session or local_model_path)
                    else None
                )
                if transcription_mode == "deepgram" and not deepgram_api_key.strip():
                    await ws.send(json.dumps({
                        "type": "error",
                        "message": "Deepgram mode selected but API key is missing in Settings.",
                    }))
                    continue
                log.info("Start - session=%s output_path=%s", session_id, output_path)

                wav_path: Optional[str] = str(output_path) if output_path else None

                if tracker is not None:
                    tracker.reset()

                engine = TranscriptionEngine(
                    on_segment=send_segment,
                    model_size="base",
                    speaker_tracker=tracker,
                    output_path=wav_path,
                    input_device=input_device_id,
                    transcription_mode=transcription_mode,
                    diarization_enabled=diarization_enabled,
                    deepgram_api_key=deepgram_api_key,
                    deepgram_model=deepgram_model,
                )
                engine.start(asyncio.get_event_loop())
                await ws.send(json.dumps({"type": "ready"}))

            elif msg_type == "stop":
                audio_path: Optional[str] = None
                if engine is not None:
                    audio_path = engine.stop(wait=True)
                    engine = None
                log.info("Stop - session=%s audio=%s", session_id, audio_path)
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
            engine.stop(wait=True)


async def main() -> None:
    log.info("MeetMate transcription service starting on port %d", PORT)
    async with websockets.serve(handle_client, "127.0.0.1", PORT):
        log.info("Listening on ws://127.0.0.1:%d - press Ctrl+C to stop", PORT)
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
