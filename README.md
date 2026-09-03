Backend is FastAPI running at http://127.0.0.1:8000/docs.

Main endpoint:
POST /analyze-interaction

It accepts multipart/form-data:

case_id — string
text — optional string
audio — optional audio file

At least one of text/audio must be supplied.

Three supported modes:

text only
audio only
text + audio

For text + audio, backend uses the trained XGBoost multimodal model.

After prediction, use:

GET /case/{case_id}/history
GET /case/{case_id}/summary
