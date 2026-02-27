"""
Online speaker tracking using pyannote/embedding.

For each transcribed segment we extract a speaker embedding and compare it
against a growing bank of known speakers using cosine similarity.
"""

import logging
import shutil
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np

log = logging.getLogger(__name__)

MATCH_THRESHOLD = 0.82   # higher threshold => less aggressive merging
MIN_SAMPLES = 1_600      # 100 ms at 16 kHz


def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


class SpeakerTracker:
    def __init__(self, hf_token: str, model_source: Optional[str] = None):
        self._token = hf_token
        self._model_source = model_source
        self._model = None
        self._load_failed = False
        self._speakers: List[Tuple[str, np.ndarray]] = []

    def assign(self, audio_pcm: np.ndarray, sample_rate: int = 16_000) -> str:
        if len(audio_pcm) < MIN_SAMPLES:
            return self._speakers[0][0] if self._speakers else "Speaker 1"

        if self._load_failed:
            return "Speaker 1"

        try:
            embedding = self._embed(audio_pcm, sample_rate)
        except Exception:
            log.exception("Embedding failed; defaulting to Speaker 1")
            return "Speaker 1"

        return self._match_or_create(embedding)

    def reset(self) -> None:
        self._speakers.clear()

    def _load_model(self) -> None:
        if self._model is not None or self._load_failed:
            return
        if shutil.which("ffmpeg") is None:
            log.warning("ffmpeg not found on PATH. Install ffmpeg to enable local diarization.")
            self._load_failed = True
            return

        log.info("Loading pyannote/embedding model...")
        try:
            from pyannote.audio import Inference, Model

            source = self._model_source
            if source:
                source_path = Path(source)
                if not source_path.exists():
                    raise FileNotFoundError(f"Local diarization model path not found: {source}")
                model = Model.from_pretrained(str(source_path), use_auth_token=self._token or None)
                self._model = Inference(model, window="whole")
            else:
                self._model = Inference(
                    "pyannote/embedding",
                    window="whole",
                    use_auth_token=self._token or None,
                )
            log.info("Speaker embedding model ready")
        except Exception:
            log.warning(
                "Could not load pyannote/embedding; speaker diarization disabled. "
                "Accept terms at https://hf.co/pyannote/embedding and "
                "https://hf.co/pyannote/segmentation-3.0 then restart."
            )
            self._load_failed = True

    def _embed(self, audio_pcm: np.ndarray, sample_rate: int) -> np.ndarray:
        self._load_model()
        if self._model is None:
            raise RuntimeError("Speaker model failed to load")
        # Keep torch import lazy so base installs can run without diarization deps.
        import torch

        waveform = torch.tensor(audio_pcm, dtype=torch.float32).unsqueeze(0)
        result = self._model({"waveform": waveform, "sample_rate": sample_rate})
        return np.array(result).flatten()

    def _match_or_create(self, embedding: np.ndarray) -> str:
        best_sim = -1.0
        best_label = None

        for label, centroid in self._speakers:
            sim = _cosine_sim(embedding, centroid)
            if sim > best_sim:
                best_sim = sim
                best_label = label

        if best_label is not None and best_sim >= MATCH_THRESHOLD:
            idx = next(i for i, (l, _) in enumerate(self._speakers) if l == best_label)
            old_centroid = self._speakers[idx][1]
            self._speakers[idx] = (best_label, 0.9 * old_centroid + 0.1 * embedding)
            return best_label

        new_label = f"Speaker {len(self._speakers) + 1}"
        self._speakers.append((new_label, embedding.copy()))
        log.info("New speaker detected: %s (best_sim=%.3f)", new_label, best_sim)
        return new_label
