import os
import re
import uuid
import sqlite3
import subprocess
from pathlib import Path
from datetime import datetime

import xgboost as xgb
import numpy as np
import shap
from pydantic import BaseModel
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import imageio_ffmpeg

from services.text_analyzer import analyze_text
from services.audio_analyzer import recognizer

app = FastAPI(title="Mental Health Distress Monitoring API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000","http://127.0.0.1:3000","http://localhost:5173","http://127.0.0.1:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
UPLOAD_DIR=Path("uploads"); UPLOAD_DIR.mkdir(exist_ok=True); app.mount("/media",StaticFiles(directory=str(UPLOAD_DIR)),name="media")
model=xgb.XGBRegressor(); model.load_model("model/xgboost_distress_model.json"); explainer=shap.TreeExplainer(model)
FEATURES=["text_angry","text_disgust","text_fear","text_happy","text_neutral","text_sad","text_surprise","audio_anger","audio_calm","audio_disgust","audio_fearful","audio_happy","audio_sad","audio_surprised"]
FEATURE_DISPLAY_NAMES={"text_angry":"Anger in text","text_disgust":"Disgust in text","text_fear":"Fear in text","text_happy":"Happiness in text","text_neutral":"Neutral emotion in text","text_sad":"Sadness in text","text_surprise":"Surprise in text","audio_anger":"Anger in voice","audio_calm":"Calmness in voice","audio_disgust":"Disgust in voice","audio_fearful":"Fear in voice","audio_happy":"Happiness in voice","audio_sad":"Sadness in voice","audio_surprised":"Surprise in voice"}
DB_PATH="distress.db"

def init_db():
    conn=sqlite3.connect(DB_PATH); conn.execute("CREATE TABLE IF NOT EXISTS interactions (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL, timestamp TEXT NOT NULL, distress_score REAL NOT NULL, risk_level TEXT NOT NULL, text_content TEXT, audio_url TEXT, transcription TEXT, safety_signal TEXT)"); cols={r[1] for r in conn.execute("PRAGMA table_info(interactions)").fetchall()}
    for name in ("text_content","audio_url","transcription","safety_signal"):
        if name not in cols: conn.execute(f"ALTER TABLE interactions ADD COLUMN {name} TEXT")
    conn.commit(); conn.close()
init_db()

def get_risk_level(score): return "Low" if score<5 else "Moderate" if score<10 else "High" if score<15 else "Severe"

def safety_check(text):
    t=(text or "").lower(); patterns={"Self-harm / suicide concern":[r"\bsuicide\b",r"\bsuicidal\b",r"kill myself",r"end my life",r"want to die",r"wanna die",r"take my own life",r"hurt myself",r"self[- ]?harm"],"Threat / immediate safety concern":[r"threat",r"threatened",r"threatening",r"someone will kill me",r"they will kill me",r"going to kill me",r"someone is after me",r"immediate danger"]}
    for label,pats in patterns.items():
        if any(re.search(p,t) for p in pats): return label
    return None

def get_shap_explanation(features):
    values=explainer.shap_values(features)[0]; explanation=[]
    for i,name in enumerate(FEATURES):
        impact=float(values[i]); explanation.append({"feature":name,"display_name":FEATURE_DISPLAY_NAMES.get(name,name),"value":round(float(features[0][i]),4),"impact":round(impact,4),"direction":"increases_risk" if impact>0 else "decreases_risk"})
    explanation.sort(key=lambda x:abs(x["impact"]),reverse=True); return {"base_value":round(float(explainer.expected_value),4),"top_contributing_factors":explanation[:5],"all_features":explanation}

class PredictionRequest(BaseModel):
    case_id:str; text_angry:float; text_disgust:float; text_fear:float; text_happy:float; text_neutral:float; text_sad:float; text_surprise:float; audio_anger:float; audio_calm:float; audio_disgust:float; audio_fearful:float; audio_happy:float; audio_sad:float; audio_surprised:float

@app.get("/")
def health(): return {"status":"online"}

@app.post("/analyze-interaction")
async def analyze_interaction(case_id:str=Form(...),text:str=Form(""),audio:UploadFile|None=File(None)):
    text=(text or "").strip(); has_text=bool(text); has_audio=audio is not None
    if not has_text and not has_audio: raise HTTPException(400,"Please provide text, audio, or both.")
    text_result=text_probs=audio_result=audio_probs=None; safety_signal=safety_check(text); transcription=None; audio_url=None; wav_path=None
    if has_text:
        try: text_result=analyze_text(text); text_probs=text_result["probabilities"]
        except Exception as e: raise HTTPException(500,f"Text analysis failed: {e}")
    if has_audio:
        try:
            ext=os.path.splitext(audio.filename or ".audio")[1] or ".audio"; saved_name=f"{uuid.uuid4().hex}{ext}"; saved_path=UPLOAD_DIR/saved_name; saved_path.write_bytes(await audio.read()); audio_url=f"/media/{saved_name}"; wav_path=str(UPLOAD_DIR/f"{uuid.uuid4().hex}.wav")
            ffmpeg_exe=imageio_ffmpeg.get_ffmpeg_exe()
            subprocess.run([ffmpeg_exe,"-y","-i",str(saved_path),"-ac","1","-ar","16000","-c:a","pcm_s16le",wav_path],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            audio_result=recognizer.predict(wav_path); audio_probs=audio_result["probabilities"]
        except subprocess.CalledProcessError as e:
            raise HTTPException(400,"Could not convert uploaded audio. The audio file may be invalid or unsupported.")
        except Exception as e: raise HTTPException(500,f"Audio analysis failed: {e}")
        finally:
            if wav_path and os.path.exists(wav_path): os.remove(wav_path)
    modality="multimodal" if has_text and has_audio else "text_only" if has_text else "audio_only"; modalities_used=["text","audio"] if modality=="multimodal" else ["text"] if modality=="text_only" else ["audio"]
    shap_explanation=None
    if modality=="multimodal":
        features=np.array([[text_probs.get("angry",0),text_probs.get("disgust",0),text_probs.get("fear",0),text_probs.get("happy",0),text_probs.get("neutral",0),text_probs.get("sad",0),text_probs.get("surprise",0),audio_probs.get("anger",0),audio_probs.get("calm",0),audio_probs.get("disgust",0),audio_probs.get("fearful",0),audio_probs.get("happy",0),audio_probs.get("sad",0),audio_probs.get("surprised",0)]]); distress_score=float(np.clip(model.predict(features)[0],0,24)); scoring_method="xgboost_multimodal"
        try: shap_explanation=get_shap_explanation(features)
        except Exception as e: shap_explanation={"base_value":None,"top_contributing_factors":[],"all_features":[],"error":str(e)}
    elif modality=="text_only": distress_score=float(np.clip((.35*text_probs.get("sad",0)+.30*text_probs.get("fear",0)+.20*text_probs.get("angry",0)+.15*text_probs.get("disgust",0))*24,0,24)); scoring_method="text_only_heuristic"
    else: distress_score=float(np.clip((.35*audio_probs.get("sad",0)+.30*audio_probs.get("fearful",0)+.20*audio_probs.get("anger",0)+.15*audio_probs.get("disgust",0))*24,0,24)); scoring_method="audio_only_heuristic"
    if safety_signal: distress_score=24.0; scoring_method += "+safety_override"; risk_level="Severe"
    else: risk_level=get_risk_level(distress_score)
    timestamp=datetime.now().isoformat(); conn=sqlite3.connect(DB_PATH); conn.execute("INSERT INTO interactions (case_id,timestamp,distress_score,risk_level,text_content,audio_url,transcription,safety_signal) VALUES (?,?,?,?,?,?,?,?)",(case_id,timestamp,distress_score,risk_level,text or None,audio_url,transcription,safety_signal)); conn.commit(); conn.close()
    return {"case_id":case_id,"timestamp":timestamp,"modalities_used":modalities_used,"modality":modality,"text_analysis":text_result,"audio_analysis":audio_result,"distress_score":round(distress_score,2),"risk_level":risk_level,"scoring_method":scoring_method,"safety_signal":safety_signal,"audio_url":audio_url,"transcription":transcription,"shap_explanation":shap_explanation}

@app.post("/predict")
def predict(request:PredictionRequest):
    X=np.array([getattr(request,f) for f in FEATURES]).reshape(1,-1); score=float(np.clip(model.predict(X)[0],0,24)); risk=get_risk_level(score); ts=datetime.now().isoformat(); conn=sqlite3.connect(DB_PATH); conn.execute("INSERT INTO interactions (case_id,timestamp,distress_score,risk_level,text_content,audio_url,transcription,safety_signal) VALUES (?,?,?,?,?,?,?,?)",(request.case_id,ts,score,risk,None,None,None,None)); conn.commit(); conn.close(); return {"case_id":request.case_id,"distress_score":round(score,2),"risk_level":risk,"timestamp":ts}

@app.get("/cases")
def get_cases():
    conn=sqlite3.connect(DB_PATH); conn.row_factory=sqlite3.Row; rows=conn.execute("SELECT case_id, COUNT(*) AS interactions, MAX(timestamp) AS last_timestamp FROM interactions GROUP BY case_id ORDER BY last_timestamp DESC").fetchall(); conn.close(); cases=[]
    for r in rows:
        data=get_history(r["case_id"]); cases.append({"case_id":r["case_id"],"score":data["current_score"],"risk":get_risk_level(data["current_score"]),"trend":data["trend"],"interactions":r["interactions"],"last_timestamp":r["last_timestamp"]})
    return {"cases":cases}

@app.get("/case/{case_id}/history")
def get_history(case_id:str):
    conn=sqlite3.connect(DB_PATH); conn.row_factory=sqlite3.Row; rows=conn.execute("SELECT timestamp,distress_score,risk_level,text_content,audio_url,transcription,safety_signal FROM interactions WHERE case_id=? ORDER BY timestamp ASC",(case_id,)).fetchall(); conn.close()
    if not rows: raise HTTPException(404,"Case not found")
    history=[dict(r) for r in rows]; current=history[-1]["distress_score"]; previous=history[-2]["distress_score"] if len(history)>=2 else None; change=current-previous if previous is not None else None
    if len(history)>=3: overall=current-history[0]["distress_score"]; trend="Increasing" if overall>2 else "Decreasing" if overall<-2 else "Stable"
    elif change is None: trend="Insufficient data"
    else: trend="Increasing" if change>1 else "Decreasing" if change<-1 else "Stable"
    return {"case_id":case_id,"history":history,"current_score":current,"previous_score":previous,"change":change,"trend":trend}

@app.get("/case/{case_id}/summary")
def get_summary(case_id:str):
    data=get_history(case_id); history=data["history"]; score=data["current_score"]; risk=history[-1]["risk_level"]; trend=data["trend"]; priority="Urgent" if risk in ("High","Severe") or trend=="Increasing" else "Routine"
    return {"case_id":case_id,"current_score":score,"current_risk":risk,"previous_score":data["previous_score"],"change":data["change"],"trend":trend,"interaction_count":len(history),"average_score":sum(x["distress_score"] for x in history)/len(history),"maximum_score":max(x["distress_score"] for x in history),"priority":priority,"alert":priority=="Urgent"}
