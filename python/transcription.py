"""
Streaming transcription engine: sounddevice -> webrtcvad -> local Whisper or Deepgram.

Audio is captured in 30ms frames. VAD groups voiced frames into speech
segments. Each segment is transcribed and reported via the async
`on_segment` callback.
"""

import asyncio
import io
import logging
import math
import queue
import threading
import time
import wave
from pathlib import Path
from typing import Callable, Optional

import numpy as np
import requests
import sounddevice as sd
import webrtcvad
from faster_whisper import WhisperModel

from diarization import SpeakerTracker

log = logging.getLogger(__name__)

SAMPLE_RATE = 16_000
FRAME_MS = 30
FRAME_SAMPLES = int(SAMPLE_RATE * FRAME_MS / 1000)

VOICED_TRIGGER_MS = 200
SILENCE_CLOSE_MS = 800
PRE_SPEECH_PAD_MS = 300
MIN_SPEECH_MS = 250


class TranscriptionEngine:
    def __init__(
        self,
        on_segment: Callable,
        model_size: str = "base",
        vad_aggressiveness: int = 2,
        language: str = "en",
        speaker_tracker: Optional[SpeakerTracker] = None,
        output_path: Optional[str] = None,
        input_device: Optional[int] = None,
        transcription_mode: str = "local",
        diarization_enabled: bool = False,
        deepgram_api_key: str = "",
        deepgram_model: str = "nova-2",
    ):
        self.on_segment = on_segment
        self.model_size = model_size
        self.language = language
        self._speaker_tracker = speaker_tracker
        self._output_path = output_path
        self._input_device = input_device
        self._transcription_mode = transcription_mode
        self._diarization_enabled = diarization_enabled
        self._deepgram_api_key = deepgram_api_key.strip()
        self._deepgram_model = deepgram_model.strip() or "nova-2"

        self._vad = webrtcvad.Vad(vad_aggressiveness)
        self._model: Optional[WhisperModel] = None

        self._audio_q: queue.Queue = queue.Queue()
        self._stop_event = threading.Event()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._session_start_ms: float = 0.0
        self.saved_audio_path: Optional[str] = None
        self._capture_thread: Optional[threading.Thread] = None
        self._transcribe_thread: Optional[threading.Thread] = None

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        self._stop_event.clear()
        self._session_start_ms = time.time() * 1000.0

        self._transcribe_thread = threading.Thread(target=self._transcribe_loop, daemon=True, name="transcribe")
        self._capture_thread = threading.Thread(target=self._capture_loop, daemon=True, name="capture")
        self._transcribe_thread.start()
        self._capture_thread.start()
        log.info("TranscriptionEngine started (mode=%s)", self._transcription_mode)

    def stop(self, wait: bool = True) -> Optional[str]:
        self._stop_event.set()
        log.info("TranscriptionEngine stop requested")
        if not wait:
            return self.saved_audio_path

        if self._capture_thread is not None:
            self._capture_thread.join(timeout=5.0)
        if self._transcribe_thread is not None:
            self._transcribe_thread.join(timeout=10.0)
        return self.saved_audio_path

    def _capture_loop(self) -> None:
        wav: Optional[wave.Wave_write] = None

        if self._output_path:
            try:
                Path(self._output_path).parent.mkdir(parents=True, exist_ok=True)
                wav = wave.open(self._output_path, "wb")
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(SAMPLE_RATE)
                log.info("Recording to %s", self._output_path)
            except Exception:
                log.exception("Could not open WAV file for writing")
                wav = None

        def _cb(indata, frames, time_info, status):
            if status:
                log.warning("Audio status: %s", status)
            pcm = (indata[:, 0] * 32767).astype(np.int16).tobytes()
            self._audio_q.put(pcm)
            if wav is not None:
                wav.writeframes(pcm)

        try:
            with sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype="float32",
                blocksize=FRAME_SAMPLES,
                device=self._input_device,
                callback=_cb,
            ):
                while not self._stop_event.is_set():
                    time.sleep(0.01)
        except Exception:
            log.exception("Audio capture failed")
        finally:
            if wav is not None:
                wav.close()
                self.saved_audio_path = self._output_path
                log.info("WAV recording saved: %s", self._output_path)
            self._audio_q.put(None)
            log.info("Capture loop exited")

    def _transcribe_loop(self) -> None:
        if self._transcription_mode == "local":
            self._load_model()

        voiced_threshold = max(1, int(VOICED_TRIGGER_MS / FRAME_MS))
        unvoiced_threshold = max(1, int(SILENCE_CLOSE_MS / FRAME_MS))
        pad_frames = max(1, int(PRE_SPEECH_PAD_MS / FRAME_MS))

        ring: list[bytes] = []
        speech: list[bytes] = []
        triggered = False
        num_voiced = 0
        num_unvoiced = 0
        segment_start_ms = 0.0

        while True:
            frame = self._audio_q.get()
            if frame is None:
                if triggered and speech:
                    segment_end_ms = time.time() * 1000.0 - self._session_start_ms
                    audio_bytes = b"".join(speech)
                    self._transcribe_segment(
                        audio_bytes,
                        max(0, int(math.floor(segment_start_ms))),
                        max(0, int(segment_end_ms)),
                    )
                break

            try:
                is_speech = self._vad.is_speech(frame, SAMPLE_RATE)
            except Exception:
                is_speech = False

            if not triggered:
                ring.append(frame)
                if len(ring) > pad_frames:
                    ring.pop(0)

                if is_speech:
                    num_voiced += 1
                    if num_voiced >= voiced_threshold:
                        triggered = True
                        speech = list(ring)
                        ring = []
                        num_unvoiced = 0
                        elapsed_frames = len(speech)
                        segment_start_ms = (
                            time.time() * 1000.0
                            - self._session_start_ms
                            - elapsed_frames * FRAME_MS
                        )
                else:
                    num_voiced = 0

            else:
                speech.append(frame)

                if not is_speech:
                    num_unvoiced += 1
                    if num_unvoiced >= unvoiced_threshold:
                        segment_end_ms = time.time() * 1000.0 - self._session_start_ms
                        audio_bytes = b"".join(speech)
                        speech = []
                        triggered = False
                        num_voiced = 0
                        num_unvoiced = 0

                        self._transcribe_segment(
                            audio_bytes,
                            int(segment_start_ms),
                            int(segment_end_ms),
                        )
                else:
                    num_unvoiced = 0

        log.info("Transcription loop exited")

    def _load_model(self) -> None:
        if self._model is None:
            log.info("Loading Whisper '%s' model (first run may download it)...", self.model_size)
            self._model = WhisperModel(self.model_size, device="cpu", compute_type="int8")
            log.info("Whisper model ready")

    def _transcribe_segment(self, audio_bytes: bytes, start_ms: int, end_ms: int) -> None:
        if end_ms - start_ms < MIN_SPEECH_MS:
            return

        try:
            pcm = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32767.0

            if self._transcription_mode == "deepgram":
                segments = self._transcribe_with_deepgram(audio_bytes, start_ms, end_ms)
                if not segments:
                    return
            else:
                if self._model is None:
                    self._load_model()
                whisper_segments, _ = self._model.transcribe(
                    pcm,
                    language=self.language,
                    vad_filter=False,
                    beam_size=5,
                )
                text = " ".join(s.text.strip() for s in whisper_segments).strip()
                if not text:
                    return

                if self._diarization_enabled and self._speaker_tracker is not None:
                    speaker = self._speaker_tracker.assign(pcm)
                else:
                    speaker = "Speaker 1"
                segments = [{
                    "speaker": speaker,
                    "text": text,
                    "start_ms": start_ms,
                    "end_ms": end_ms,
                }]

            if self._loop and self._loop.is_running():
                for segment in segments:
                    log.info(
                        "Segment [%d-%d] %s: %s",
                        segment["start_ms"],
                        segment["end_ms"],
                        segment["speaker"],
                        segment["text"],
                    )
                    asyncio.run_coroutine_threadsafe(
                        self.on_segment(
                            str(segment["speaker"]),
                            str(segment["text"]),
                            int(segment["start_ms"]),
                            int(segment["end_ms"]),
                        ),
                        self._loop,
                    )
        except Exception:
            log.exception("Transcription segment error")

    def _transcribe_with_deepgram(
        self,
        audio_bytes: bytes,
        chunk_start_ms: int,
        chunk_end_ms: int,
    ) -> list[dict]:
        if not self._deepgram_api_key:
            log.warning("Deepgram mode selected but API key is missing")
            return []

        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(SAMPLE_RATE)
            wav.writeframes(audio_bytes)

        params = {
            "model": self._deepgram_model,
            "diarize": "true" if self._diarization_enabled else "false",
            "utterances": "true" if self._diarization_enabled else "false",
            "smart_format": "true",
            "punctuate": "true",
            "language": self.language,
        }

        response = requests.post(
            "https://api.deepgram.com/v1/listen",
            params=params,
            headers={
                "Authorization": f"Token {self._deepgram_api_key}",
                "Content-Type": "audio/wav",
            },
            data=wav_buffer.getvalue(),
            timeout=15,
        )
        response.raise_for_status()

        body = response.json()
        channel = body.get("results", {}).get("channels", [{}])[0]
        alt = channel.get("alternatives", [{}])[0]
        utterances = body.get("results", {}).get("utterances", []) if self._diarization_enabled else []
        out: list[dict] = []
        if isinstance(utterances, list) and len(utterances) > 0:
            for utt in utterances:
                text = str(utt.get("transcript", "")).strip()
                if not text:
                    continue
                speaker_id = utt.get("speaker")
                speaker = f"Speaker {speaker_id + 1}" if isinstance(speaker_id, int) else "Speaker 1"
                utt_start = utt.get("start")
                utt_end = utt.get("end")
                start_ms = chunk_start_ms
                end_ms = chunk_end_ms
                if isinstance(utt_start, (int, float)):
                    start_ms = max(chunk_start_ms, chunk_start_ms + int(float(utt_start) * 1000))
                if isinstance(utt_end, (int, float)):
                    end_ms = min(chunk_end_ms, chunk_start_ms + int(float(utt_end) * 1000))
                if end_ms <= start_ms:
                    end_ms = max(start_ms + 1, chunk_end_ms)
                out.append({
                    "speaker": speaker,
                    "text": text,
                    "start_ms": start_ms,
                    "end_ms": end_ms,
                })

        if out:
            return out

        text = str(alt.get("transcript", "")).strip()
        if not text:
            return []
        speaker = "Speaker 1"
        words = alt.get("words", [])
        for word in words:
            speaker_id = word.get("speaker")
            if isinstance(speaker_id, int):
                speaker = f"Speaker {speaker_id + 1}"
                break
        return [{
            "speaker": speaker,
            "text": text,
            "start_ms": chunk_start_ms,
            "end_ms": chunk_end_ms,
        }]
