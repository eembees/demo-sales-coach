# Sales Coach Demo

A voice-first sales coaching app. Speak about your sales meeting — get a structured meeting record and AI coaching questions delivered by voice.

## Prerequisites

- [uv](https://docs.astral.sh/uv/getting-started/installation/) — Python package manager
- API keys for **Speechmatics** and **Anthropic**

## Setup

```bash
# 1. Clone / navigate to the project
cd demo-sales-coach

# 2. Copy env template and fill in your keys
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY and SPEECHMATICS_API_KEY

# 3. Install dependencies
uv sync

# 4. Start the server
uv run uvicorn main:app --reload
```

Open **http://localhost:8000** in Chrome or Firefox.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key for Claude |
| `SPEECHMATICS_API_KEY` | Yes | — | Speechmatics RT API key |
| `SPEECHMATICS_LANGUAGE` | No | `en` | Language code for transcription |

## Usage

1. **Phase 1 — Record:** Click *Start Recording*, speak about your sales meeting, click *Stop & Analyze*
2. **Phase 2 — Meeting Output:** Claude generates a structured markdown summary of your meeting
3. **Phase 3 — Coaching:** Click *Start Coaching* — Claude asks 3–5 targeted questions read aloud via text-to-speech

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/` | Frontend app |
| GET | `/health` | `{"status": "ok"}` |
| WS | `/ws/transcribe` | Audio → Speechmatics RT → live transcript |
| POST | `/api/analyze` | `{transcript}` → `{markdown}` |
| POST | `/api/coach` | `{meeting_output}` → `{questions: [...]}` |

## Tech Stack

- **Backend:** FastAPI + uvicorn, managed with `uv`
- **Frontend:** Vanilla HTML/JS/CSS, served via FastAPI `StaticFiles`
- **STT:** Speechmatics Real-Time API (WebSocket streaming)
- **AI:** Anthropic Claude (`claude-sonnet-4-6`)
- **TTS:** Browser Web Speech API (`speechSynthesis`)
- **Markdown:** `marked.js` from CDN
