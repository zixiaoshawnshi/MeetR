"""
Online speaker tracking using pyannote/embedding.

For each transcribed segment we extract a d-vector (speaker embedding) and
compare it via cosine similarity against a growing bank of known speakers.
If similarity exceeds MATCH_THRESHOLD the segment is assigned to that speaker;
otherwise a new speaker label is created.

This runs synchronously on the transcription thread — it adds ~50–100 ms per
segment on CPU, which is acceptable.
"""

import logging
import os
from typing import List, Optional, Tuple

import numpy as np

log = logging.getLogger(__name__)

MATCH_THRESHOLD = 0.70   # cosine similarity; tune up to reduce false merges
MIN_SAMPLES = 1_600      # 100 ms at 16 kHz — ignore very short frames


def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


class SpeakerTracker:
    """
    Maintains a per-session speaker bank.  Call `assign(audio_pcm)` for each
    speech segment.  Returns a consistent label like "Speaker 1", "Speaker 2".
    """

    def __init__(self, hf_token: str):
        self._token = hf_token
        self._model: Optional[Inference] = None
        self._load_failed = False
        # List of (label, centroid_embedding)
        self._speakers: List[Tuple[str, np.ndarray]] = []

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def assign(self, audio_pcm: np.ndarray, sample_rate: int = 16_000) -> str:
        """
        audio_pcm: float32 numpy array, shape (samples,)
        Returns a speaker label string.
        """
        if len(audio_pcm) < MIN_SAMPLES:
            return self._speakers[0][0] if self._speakers else "Speaker 1"

        if self._load_failed:
            return "Speaker 1"

        try:
            embedding = self._embed(audio_pcm, sample_rate)
        except Exception:
            log.exception("Embedding failed — defaulting to Speaker 1")
            return "Speaker 1"

        return self._match_or_create(embedding)

    def reset(self) -> None:
        """Clear speaker bank (call at start of a new session)."""
        self._speakers.clear()

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _load_model(self) -> None:
        if self._model is not None or self._load_failed:
            return
        log.info("Loading pyannote/embedding model…")
        try:
            from pyannote.audio import Inference
            self._model = Inference(
                "pyannote/embedding",
                window="whole",
                use_auth_token=self._token,
            )
            log.info("Speaker embedding model ready")
        except Exception:
            log.warning(
                "Could not load pyannote/embedding — speaker diarization disabled. "
                "Accept terms at https://hf.co/pyannote/embedding and "
                "https://hf.co/pyannote/segmentation-3.0 then restart."
            )
            self._load_failed = True

    def _embed(self, audio_pcm: np.ndarray, sample_rate: int) -> np.ndarray:
        self._load_model()
        waveform = torch.tensor(audio_pcm, dtype=torch.float32).unsqueeze(0)  # (1, T)
        result = self._model({"waveform": waveform, "sample_rate": sample_rate})
        # result shape: (1, dim) or (dim,)
        vec = np.array(result).flatten()
        return vec

    def _match_or_create(self, embedding: np.ndarray) -> str:
        best_sim = -1.0
        best_label = None

        for label, centroid in self._speakers:
            sim = _cosine_sim(embedding, centroid)
            if sim > best_sim:
                best_sim = sim
                best_label = label

        if best_label is not None and best_sim >= MATCH_THRESHOLD:
            # Update centroid with exponential moving average
            idx = next(i for i, (l, _) in enumerate(self._speakers) if l == best_label)
            old_centroid = self._speakers[idx][1]
            self._speakers[idx] = (best_label, 0.9 * old_centroid + 0.1 * embedding)
            return best_label
        else:
            new_label = f"Speaker {len(self._speakers) + 1}"
            self._speakers.append((new_label, embedding.copy()))
            log.info("New speaker detected: %s (best_sim=%.3f)", new_label, best_sim)
            return new_label
