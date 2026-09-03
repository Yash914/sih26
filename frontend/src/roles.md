# UI roles

## Victim
The victim-facing experience is intentionally minimal. It provides only:
- case/session identification as needed by the deployment
- text response input
- voice recording/upload
- submit/check-in action
- neutral confirmation after submission

It must NOT display distress score, risk level, emotion probabilities, SHAP explanations, historical trends, alerts, priority, or administrative case data.

## Authority/Admin
The authority dashboard provides case monitoring and operational response:
- all cases/case list
- current distress score and risk
- longitudinal trend/history
- multimodal analysis details and explainability
- increasing-risk alerts
- intervention assignment workflow for a counsellor or police officer
- intervention status and assignment history

AI output is decision support. The authority remains responsible for reviewing alerts and taking appropriate action.
