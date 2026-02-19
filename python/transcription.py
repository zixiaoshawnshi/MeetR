"""
Streaming transcription engine: sounddevice → webrtcvad → faster-whisper.

Audio is captured in 30ms frames. VAD groups voiced frames into speech
segments. Each segment is transcribed by faster-whisper and reported via
the async `on_segment` callback.
"""

import asyncio
import logging
import queue
import threading
import time
import wave
from pathlib import Path
from typing import Callable, Optional

import numpy as np
import sounddevice as sd
import webrtcvad
from faster_whisper import WhisperModel

from diarization import SpeakerTracker

log = logging.getLogger(__name__)

SAMPLE_RATE = 16_000          # Hz — required by Whisper
FRAME_MS = 30                 # webrtcvad accepts 10 / 20 / 30 ms
FRAME_SAMPLES = int(SAMPLE_RATE * FRAME_MS / 1000)  # 480 samples

# VAD thresholds
VOICED_TRIGGER_MS = 200       # voiced frames needed before opening a segment
SILENCE_CLOSE_MS = 800        # silence needed to close a segment
PRE_SPEECH_PAD_MS = 300       # frames kept before voice is detected
MIN_SPEECH_MS = 250           # ignore segments shorter than this


class TranscriptionEngine:
    """
    Captures microphone audio, detects speech with webrtcvad, and
    transcribes segments with faster-whisper on a background thread.

    Usage
    -----
    engine = TranscriptionEngine(on_segment=my_async_fn)
    engine.start(asyncio_loop)
    ...
    engine.stop()
    """

    def __init__(
        self,
        on_segment: Callable,           # async (speaker, text, start_ms, end_ms) -> None
        model_size: str = "base",
        vad_aggressiveness: int = 2,
        language: str = "en",
        speaker_tracker: Optional[SpeakerTracker] = None,
        output_path: Optional[str] = None,  # full path for WAV file, or None to skip
    ):
        self.on_segment = on_segment
        self.model_size = model_size
        self.language = language
        self._speaker_tracker = speaker_tracker
        self._output_path = output_path

        self._vad = webrtcvad.Vad(vad_aggressiveness)
        self._model: Optional[WhisperModel] = None

        self._audio_q: queue.Queue = queue.Queue()
        self._stop_event = threading.Event()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._session_start_ms: float = 0.0
        self.saved_audio_path: Optional[str] = None  # set when WAV is closed

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        self._stop_event.clear()
        self._session_start_ms = time.time() * 1000.0

        threading.Thread(target=self._transcribe_loop, daemon=True, name="transcribe").start()
        threading.Thread(target=self._capture_loop, daemon=True, name="capture").start()
        log.info("TranscriptionEngine started (model=%s)", self.model_size)

    def stop(self) -> None:
        self._stop_event.set()
        log.info("TranscriptionEngine stop requested")

    # ------------------------------------------------------------------
    # Internal threads
    # ------------------------------------------------------------------

    def _capture_loop(self) -> None:
        wav: Optional[wave.Wave_write] = None

        if self._output_path:
            try:
                Path(self._output_path).parent.mkdir(parents=True, exist_ok=True)
                wav = wave.open(self._output_path, "wb")
                wav.setnchannels(1)
                wav.setsampwidth(2)          # 16-bit PCM
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
            # Poison pill so the transcribe thread can drain and exit
            self._audio_q.put(None)
            log.info("Capture loop exited")

    def _transcribe_loop(self) -> None:
        self._load_model()

        VOICED_THRESHOLD = max(1, int(VOICED_TRIGGER_MS / FRAME_MS))
        UNVOICED_THRESHOLD = max(1, int(SILENCE_CLOSE_MS / FRAME_MS))
        PAD_FRAMES = max(1, int(PRE_SPEECH_PAD_MS / FRAME_MS))

        ring: list = []          # pre-speech rolling buffer
        speech: list = []        # current speech segment frames
        triggered = False
        num_voiced = 0
        num_unvoiced = 0
        segment_start_ms = 0.0

        while True:
            frame = self._audio_q.get()
            if frame is None:    # poison pill
                break

            try:
                is_speech = self._vad.is_speech(frame, SAMPLE_RATE)
            except Exception:
                is_speech = False

            if not triggered:
                ring.append(frame)
                if len(ring) > PAD_FRAMES:
                    ring.pop(0)

                if is_speech:
                    num_voiced += 1
                    if num_voiced >= VOICED_THRESHOLD:
                        triggered = True
                        # Start the segment from the beginning of the ring buffer
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

            else:  # triggered
                speech.append(frame)

                if not is_speech:
                    num_unvoiced += 1
                    if num_unvoiced >= UNVOICED_THRESHOLD:
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

    # ------------------------------------------------------------------
    # Transcription helper
    # ------------------------------------------------------------------

    def _load_model(self) -> None:
        if self._model is None:
            log.info("Loading Whisper '%s' model (first run may download it)…", self.model_size)
            self._model = WhisperModel(self.model_size, device="cpu", compute_type="int8")
            log.info("Whisper model ready")

    def _transcribe_segment(self, audio_bytes: bytes, start_ms: int, end_ms: int) -> None:
        if end_ms - start_ms < MIN_SPEECH_MS:
            return

        try:
            pcm = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32767.0
            segments, _ = self._model.transcribe(
                pcm,
                language=self.language,
                vad_filter=False,
                beam_size=5,
            )
            text = " ".join(s.text.strip() for s in segments).strip()
            if not text:
                return

            # Speaker diarization (optional — falls back to "Speaker 1")
            if self._speaker_tracker is not None:
                speaker = self._speaker_tracker.assign(pcm)
            else:
                speaker = "Speaker 1"

            log.info("Segment [%d-%d] %s: %s", start_ms, end_ms, speaker, text)

            if self._loop and self._loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    self.on_segment(speaker, text, start_ms, end_ms),
                    self._loop,
                )
        except Exception:
            log.exception("Transcription segment error")
