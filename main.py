import os
import joblib
import sqlite3
import tempfile
from datetime import datetime
import subprocess
from pydantic import BaseModel
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from services.text_analyzer import analyze_text
from services.audio_analyzer import recognizer


app = FastAPI(title="Mental Health Distress Monitoring API")


# -----------------------------
# CORS
# -----------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------
# Load XGBoost model
# -----------------------------

model = joblib.load(
    "model/xgboost_distress_model.pkl"
)


FEATURES = [
    "text_angry",
    "text_disgust",
    "text_fear",
    "text_happy",
    "text_neutral",
    "text_sad",
    "text_surprise",
    "audio_anger",
    "audio_calm",
    "audio_disgust",
    "audio_fearful",
    "audio_happy",
    "audio_sad",
    "audio_surprised"
]


# -----------------------------
# Database
# -----------------------------

DB_PATH = "distress.db"


def init_db():
    conn = sqlite3.connect(DB_PATH)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            distress_score REAL NOT NULL,
            risk_level TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()


init_db()


# -----------------------------
# Request schema
# -----------------------------

class PredictionRequest(BaseModel):

    case_id: str

    text_angry: float
    text_disgust: float
    text_fear: float
    text_happy: float
    text_neutral: float
    text_sad: float
    text_surprise: float

    audio_anger: float
    audio_calm: float
    audio_disgust: float
    audio_fearful: float
    audio_happy: float
    audio_sad: float
    audio_surprised: float


# -----------------------------
# Risk classification
# -----------------------------



def get_risk_level(score):

    if score < 5:
        return "Low"

    elif score < 10:
        return "Moderate"

    elif score < 15:
        return "High"

    else:
        return "Severe"


# -----------------------------
# Prediction endpoint
# -----------------------------

@app.post("/predict")
def predict(request: PredictionRequest):

    values = [
        getattr(request, feature)
        for feature in FEATURES
    ]

    X = np.array(values).reshape(1, -1)

    prediction = model.predict(X)[0]

    distress_score = float(
        np.clip(prediction, 0, 24)
    )

    risk_level = get_risk_level(
        distress_score
    )

    timestamp = datetime.now().isoformat()

    conn = sqlite3.connect("distress.db")

    conn.execute(
        """
        INSERT INTO interactions
        (case_id, timestamp, distress_score, risk_level)
        VALUES (?, ?, ?, ?)
        """,
        (
            request.case_id,
            timestamp,
            distress_score,
            risk_level
        )
    )

    conn.commit()
    conn.close()

    return {
        "case_id": request.case_id,
        "distress_score": round(
            distress_score, 2
        ),
        "risk_level": risk_level,
        "timestamp": timestamp
    }


# -----------------------------
# History endpoint
# -----------------------------

@app.get("/case/{case_id}/history")
def get_history(case_id: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    rows = conn.execute(
        """
        SELECT timestamp, distress_score, risk_level
        FROM interactions
        WHERE case_id = ?
        ORDER BY timestamp ASC
        """,
        (case_id,)
    ).fetchall()

    conn.close()

    if not rows:
        raise HTTPException(
            status_code=404,
            detail="Case not found"
        )

    history = [dict(row) for row in rows]

    current_score = history[-1]["distress_score"]

    if len(history) >= 2:
        previous_score = history[-2]["distress_score"]
        change = current_score - previous_score
    else:
        change = None

    # Longitudinal trend
    if len(history) >= 3:
        first_score = history[0]["distress_score"]
        overall_change = current_score - first_score

        if overall_change > 2:
            trend = "Increasing"
        elif overall_change < -2:
            trend = "Decreasing"
        else:
            trend = "Stable"

    elif change is None:
        trend = "Insufficient data"

    elif change > 1:
        trend = "Increasing"

    elif change < -1:
        trend = "Decreasing"

    else:
        trend = "Stable"

    return {
        "case_id": case_id,
        "history": history,
        "current_score": round(current_score, 2),
        "change": round(change, 2) if change is not None else None,
        "trend": trend
    }

@app.get("/case/{case_id}/summary")
def get_summary(case_id: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    rows = conn.execute(
        """
        SELECT timestamp, distress_score, risk_level
        FROM interactions
        WHERE case_id = ?
        ORDER BY timestamp ASC
        """,
        (case_id,)
    ).fetchall()

    conn.close()

    if not rows:
        raise HTTPException(
            status_code=404,
            detail="Case not found"
        )

    history = [dict(row) for row in rows]

    current_score = history[-1]["distress_score"]
    current_risk = history[-1]["risk_level"]

    if len(history) >= 2:
        previous_score = history[-2]["distress_score"]
        change = current_score - previous_score
    else:
        previous_score = None
        change = None

    if len(history) >= 3:
        first_score = history[0]["distress_score"]
        overall_change = current_score - first_score

        if overall_change > 2:
            trend = "Increasing"
        elif overall_change < -2:
            trend = "Decreasing"
        else:
            trend = "Stable"
    elif change is None:
        trend = "Insufficient data"
    elif change > 1:
        trend = "Increasing"
    elif change < -1:
        trend = "Decreasing"
    else:
        trend = "Stable"

    average_score = sum(
        item["distress_score"] for item in history
    ) / len(history)

    maximum_score = max(
        item["distress_score"] for item in history
    )

    priority = (
        current_risk in ["High", "Severe"]
        or trend == "Increasing"
    )

    return {
        "case_id": case_id,
        "current_score": round(current_score, 2),
        "current_risk": current_risk,
        "previous_score": round(previous_score, 2)
            if previous_score is not None else None,
        "change": round(change, 2)
            if change is not None else None,
        "trend": trend,
        "interaction_count": len(history),
        "average_score": round(average_score, 2),
        "maximum_score": round(maximum_score, 2),
        "priority": priority,
        "alert": priority
    }

# -----------------------------
# Health check
# -----------------------------

@app.post("/analyze-interaction")
async def analyze_interaction(
    case_id: str = Form(...),
    text: str = Form(""),
    audio: UploadFile | None = File(None)
):
    """
    Analyze an interaction using:
    - text only
    - audio only
    - both text + audio

    Both modalities -> trained XGBoost fusion model.
    Single modality -> transparent modality-specific heuristic.
    """

    text = (text or "").strip()

    # ---------------------------------------------------------
    # 1. Check that at least one modality is provided
    # ---------------------------------------------------------

    has_text = bool(text)
    has_audio = audio is not None

    if not has_text and not has_audio:
        raise HTTPException(
            status_code=400,
            detail="Please provide text, audio, or both."
        )

    # ---------------------------------------------------------
    # 2. TEXT ANALYSIS
    # ---------------------------------------------------------

    text_result = None
    text_probs = None

    if has_text:
        try:
            text_result = analyze_text(text)
            text_probs = text_result["probabilities"]
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Text analysis failed: {str(e)}"
            )

    # ---------------------------------------------------------
    # 3. AUDIO ANALYSIS
    # ---------------------------------------------------------

    audio_result = None
    audio_probs = None

    input_audio_path = None
    converted_wav_path = None

    if has_audio:

        try:
            # Save uploaded audio
            suffix = os.path.splitext(audio.filename or ".audio")[1]

            with tempfile.NamedTemporaryFile(
                delete=False,
                suffix=suffix
            ) as temp_audio:

                input_audio_path = temp_audio.name

                audio_bytes = await audio.read()
                temp_audio.write(audio_bytes)

            # -------------------------------------------------
            # Convert ANY uploaded audio -> 16 kHz mono WAV
            # -------------------------------------------------

            converted_wav_path = input_audio_path + "_converted.wav"

            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    input_audio_path,
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    "-c:a",
                    "pcm_s16le",
                    converted_wav_path
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )

            # -------------------------------------------------
            # Run F2 audio model
            # -------------------------------------------------

            audio_result = recognizer.predict(converted_wav_path)
            audio_probs = audio_result["probabilities"]

        except subprocess.CalledProcessError as e:

            raise HTTPException(
                status_code=400,
                detail="Could not convert uploaded audio."
            )

        except Exception as e:

            raise HTTPException(
                status_code=500,
                detail=f"Audio analysis failed: {str(e)}"
            )

        finally:

            # Clean temporary files
            for path in [input_audio_path, converted_wav_path]:

                if path and os.path.exists(path):

                    try:
                        os.remove(path)
                    except Exception:
                        pass

    # ---------------------------------------------------------
    # 4. DETERMINE WHICH MODALITIES WERE USED
    # ---------------------------------------------------------

    if has_text and has_audio:
        modality = "multimodal"
        modalities_used = ["text", "audio"]

    elif has_text:
        modality = "text_only"
        modalities_used = ["text"]

    else:
        modality = "audio_only"
        modalities_used = ["audio"]

    # ---------------------------------------------------------
    # 5. CALCULATE DISTRESS SCORE
    # ---------------------------------------------------------

    if modality == "multimodal":

        # =============================================
        # TRAINED 14-FEATURE XGBOOST
        # =============================================

        features = np.array([[
            text_probs.get("angry", 0.0),
            text_probs.get("disgust", 0.0),
            text_probs.get("fear", 0.0),
            text_probs.get("happy", 0.0),
            text_probs.get("neutral", 0.0),
            text_probs.get("sad", 0.0),
            text_probs.get("surprise", 0.0),

            audio_probs.get("anger", 0.0),
            audio_probs.get("calm", 0.0),
            audio_probs.get("disgust", 0.0),
            audio_probs.get("fearful", 0.0),
            audio_probs.get("happy", 0.0),
            audio_probs.get("sad", 0.0),
            audio_probs.get("surprised", 0.0)
        ]])

        distress_score = float(model.predict(features)[0])

        distress_score = float(
            np.clip(distress_score, 0, 24)
        )

        scoring_method = "xgboost_multimodal"

    elif modality == "text_only":

        # =============================================
        # TEXT-ONLY DEMO HEURISTIC
        # =============================================

        distress_score = (
            0.35 * text_probs.get("sad", 0.0)
            + 0.30 * text_probs.get("fear", 0.0)
            + 0.20 * text_probs.get("angry", 0.0)
            + 0.15 * text_probs.get("disgust", 0.0)
        )

        distress_score = float(
            np.clip(distress_score * 24, 0, 24)
        )

        scoring_method = "text_only_heuristic"

    else:

        # =============================================
        # AUDIO-ONLY DEMO HEURISTIC
        # =============================================

        distress_score = (
            0.35 * audio_probs.get("sad", 0.0)
            + 0.30 * audio_probs.get("fearful", 0.0)
            + 0.20 * audio_probs.get("anger", 0.0)
            + 0.15 * audio_probs.get("disgust", 0.0)
        )

        distress_score = float(
            np.clip(distress_score * 24, 0, 24)
        )

        scoring_method = "audio_only_heuristic"

    # ---------------------------------------------------------
    # 6. RISK LEVEL
    # ---------------------------------------------------------

    if distress_score < 5:
        risk_level = "Low"

    elif distress_score < 10:
        risk_level = "Moderate"

    elif distress_score < 15:
        risk_level = "High"

    else:
        risk_level = "Severe"

    # ---------------------------------------------------------
    # 7. SAVE INTERACTION
    # ---------------------------------------------------------

    timestamp = datetime.now().isoformat()

    conn = sqlite3.connect(DB_PATH)

    cursor = conn.cursor()

    cursor.execute(
        """
        INSERT INTO interactions
        (case_id, timestamp, distress_score, risk_level)
        VALUES (?, ?, ?, ?)
        """,
        (
            case_id,
            timestamp,
            distress_score,
            risk_level
        )
    )

    conn.commit()
    conn.close()

    # ---------------------------------------------------------
    # 8. RESPONSE
    # ---------------------------------------------------------

    return {
        "case_id": case_id,
        "timestamp": timestamp,

        "modalities_used": modalities_used,
        "modality": modality,

        "text_analysis": text_result,
        "audio_analysis": audio_result,

        "distress_score": round(distress_score, 2),
        "risk_level": risk_level,

        "scoring_method": scoring_method
    }

@app.get("/")
def root():

    return {
        "status": "online",
        "service": "Mental Health Distress Monitoring API"
    }