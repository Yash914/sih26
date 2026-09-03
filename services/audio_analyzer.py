import os
import subprocess
import tempfile

import torch
import librosa
import numpy as np

from transformers import (
    AutoFeatureExtractor,
    AutoModelForAudioClassification
)


MODEL_NAME = "Dpngtm/wav2vec2-emotion-recognition"


class EmotionRecognizer:

    def __init__(self):

        print("Loading audio emotion model...")

        self.feature_extractor = (
            AutoFeatureExtractor.from_pretrained(MODEL_NAME)
        )

        self.model = (
            AutoModelForAudioClassification.from_pretrained(
                MODEL_NAME
            )
        )

        self.model.eval()

        self.labels = {
            int(k): v.lower()
            for k, v in self.model.config.id2label.items()
        }

        print("Audio model loaded.")
        print("Labels:", self.labels)

    def predict_chunk(self, audio):

        inputs = self.feature_extractor(
            audio,
            sampling_rate=16000,
            return_tensors="pt"
        )

        with torch.no_grad():

            outputs = self.model(**inputs)

        probabilities = torch.softmax(
            outputs.logits,
            dim=-1
        )[0]

        return probabilities.cpu().numpy()

    def predict(self, audio_path):

        audio, sample_rate = librosa.load(
            audio_path,
            sr=16000,
            mono=True
        )

        # Remove leading/trailing silence
        audio, _ = librosa.effects.trim(
            audio,
            top_db=30
        )

        # -----------------------------------------
        # If <= 10 seconds, use entire recording
        # -----------------------------------------

        if len(audio) <= 10 * 16000:

            chunks = [audio]

        # -----------------------------------------
        # Otherwise split into 5-sec chunks
        # -----------------------------------------

        else:

            chunk_size = 5 * 16000

            chunks = []

            for start in range(
                0,
                len(audio),
                chunk_size
            ):

                chunk = audio[
                    start:start + chunk_size
                ]

                if len(chunk) >= 16000:
                    chunks.append(chunk)

            if len(chunks) == 0:
                chunks = [audio]

        # -----------------------------------------
        # Predict
        # -----------------------------------------

        chunk_predictions = []

        for chunk in chunks:

            probabilities = self.predict_chunk(
                chunk
            )

            chunk_predictions.append(
                probabilities
            )

        mean_probabilities = np.mean(
            chunk_predictions,
            axis=0
        )

        results = {}

        for index, probability in enumerate(
            mean_probabilities
        ):

            label = self.labels[index]

            results[label] = round(
                float(probability),
                4
            )

        dominant_emotion = max(
            results,
            key=results.get
        )

        confidence = results[
            dominant_emotion
        ]

        return {
            "dominant_emotion": dominant_emotion,
            "confidence": confidence,
            "probabilities": results,
            "chunks_analyzed": len(chunks)
        }


# --------------------------------------------------
# LOAD ONCE
# --------------------------------------------------

recognizer = EmotionRecognizer()