from transformers import AutoModelForSequenceClassification, PreTrainedTokenizerFast
from pathlib import Path
import torch
import numpy as np

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = BASE_DIR / "models" / "text_model" / "xlm_roberta_emotion_final"

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

print("Loading text emotion model...")

emotion_tokenizer = PreTrainedTokenizerFast(
    tokenizer_file=str(MODEL_DIR / "tokenizer.json"),
    bos_token="<s>",
    eos_token="</s>",
    sep_token="</s>",
    cls_token="<s>",
    unk_token="<unk>",
    pad_token="<pad>",
    mask_token="<mask>",
)

emotion_model = AutoModelForSequenceClassification.from_pretrained(
    str(MODEL_DIR),
    local_files_only=True,
)

emotion_model.to(DEVICE)
emotion_model.eval()

emotion_id2label = {
    int(k): str(v).lower()
    for k, v in emotion_model.config.id2label.items()
}

print("Text emotion model loaded.")
print("Labels:", emotion_id2label)


@torch.inference_mode()
def analyze_text(text: str):

    text = (text or "").strip()

    if not text:
        raise ValueError("Text input is empty.")

    batch = emotion_tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=256,
    )

    batch = {
        key: value.to(DEVICE)
        for key, value in batch.items()
    }

    logits = emotion_model(**batch).logits[0]

    probs = torch.softmax(logits, dim=-1).cpu().numpy()

    probabilities = {
        emotion_id2label[i]: float(probs[i])
        for i in range(len(probs))
    }

    dominant_emotion = max(
        probabilities,
        key=probabilities.get
    )

    confidence = probabilities[dominant_emotion]

    return {
        "dominant_emotion": dominant_emotion,
        "confidence": round(float(confidence), 4),
        "probabilities": {
            k: round(float(v), 4)
            for k, v in probabilities.items()
        },
    }