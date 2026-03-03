# Feature Specification: Sales Coach Demo

**Speechmatics API + Claude API | FastAPI + Vanilla JS + marked.js**
*Created: 2026-03-03*

---

## Overview

A voice-first web application for salespeople on the go. The user opens the app in their car, speaks about a recent sales meeting, and receives:

1. A **structured meeting output** — rendered markdown document with a meeting summary, key discussion points, sales data, and action items
2. A **coaching Q&A session** — Claude asks targeted follow-up questions to help improve sales skills, delivered as both text and spoken audio (TTS)

The app is a demo application: single-user, no auth, no persistence, fast to set up.

---

## Problem Statement

Sales reps lose insight after meetings — they forget to capture key details, don't reflect on what went well or poorly, and miss coaching opportunities. This app lets them debrief hands-free while driving, turning unstructured speech into structured records and actionable coaching.

---

## Scope

### In Scope
- Single-page HTML/JS/CSS frontend served via FastAPI `StaticFiles` (no build step)
- Browser microphone → Speechmatics **Real-Time** streaming transcription via WebSocket
- Claude API generates structured meeting output (markdown)
- Claude API generates 3–5 coaching questions from the meeting output
- Browser **Web Speech API** (`speechSynthesis`) reads coaching questions aloud
- `marked.js` loaded from CDN renders Claude's markdown output
- FastAPI backend with: health check, transcript analysis, coaching endpoints
- Python package management via `uv`
- Config via `.env` file (`SPEECHMATICS_API_KEY`, `ANTHROPIC_API_KEY`)

### Out of Scope
- User authentication or multi-user support
- Persistent storage or session history (no database)
- Audio file upload (microphone only)
- Mobile native app (web app in Chrome/Firefox)
- Custom TTS voice models or cloud TTS APIs
- CRM integrations (Salesforce, HubSpot, etc.)
- Unit/integration tests (demo app)

---

## User Stories

### US-1: Project Skeleton
**Description:** As a developer, I want a runnable FastAPI app that serves a static frontend so I can verify the skeleton before adding features.

**Acceptance Criteria:**
- [ ] `uv run uvicorn main:app --reload` starts without errors
- [ ] `GET /` returns 200 and serves `index.html`
- [ ] `GET /health` returns `{"status": "ok"}`
- [ ] `index.html` loads `marked.js` from CDN without console errors
- [ ] `ANTHROPIC_API_KEY` and `SPEECHMATICS_API_KEY` are loaded from `.env` via `python-dotenv`
- [ ] `.env.example` exists with placeholder key names

---

### US-2: Real-Time Speech Transcription
**Description:** As a salesperson, I want to press a Record button and see my words appear on screen in real-time so I know the app is capturing my speech.

**Acceptance Criteria:**
- [ ] "Start Recording" button activates the browser microphone (`MediaRecorder`)
- [ ] Browser opens WebSocket to `/ws/transcribe`; backend proxies audio to Speechmatics RT API
- [ ] Transcribed words appear in the transcript area within 2 seconds of being spoken
- [ ] "Stop Recording" stops the mic and closes the WebSocket cleanly
- [ ] Mic permission denied → visible red error banner: "Microphone access required. Please allow mic access and refresh."
- [ ] Speechmatics auth failure → visible error: "Transcription service unavailable."

---

### US-3: Structured Meeting Output via Claude
**Description:** As a salesperson, I want my spoken transcript analyzed by Claude and displayed as a formatted markdown document so I have a clean meeting record.

**Acceptance Criteria:**
- [ ] `POST /api/analyze` accepts `{"transcript": "..."}` and returns `{"markdown": "..."}`
- [ ] Claude response always includes these sections: **Meeting Summary**, **Key Discussion Points**, **Sales Data** (products/pricing/quantities mentioned), **Action Items**, **Next Steps**
- [ ] Frontend renders the markdown using `marked.parse()` (not raw text)
- [ ] Rendered output appears within 10 seconds of stopping recording (typical 3–5 min recording)
- [ ] Empty or whitespace-only transcript → HTTP 422 with `{"detail": "Transcript cannot be empty"}`
- [ ] Claude API error → user sees banner: "Analysis failed — please try again."

---

### US-4: Coaching Q&A via Claude + Text-to-Speech
**Description:** As a salesperson, I want Claude to ask me coaching questions about my meeting and read them aloud so I can reflect while driving.

**Acceptance Criteria:**
- [ ] `POST /api/coach` accepts `{"meeting_output": "..."}` and returns `{"questions": ["...", "...", ...]}`
- [ ] Claude generates exactly 3–5 coaching questions tailored to what was said (or missed) in the meeting
- [ ] Each question is displayed one at a time in the coaching section
- [ ] Each question is spoken aloud via `window.speechSynthesis.speak()`
- [ ] A "Next Question" button advances to the next question manually
- [ ] After TTS completes, auto-advance to the next question after a 2-second pause
- [ ] "Replay" button re-reads the current question
- [ ] After the last question, display: "Great session! Tap Start Over for another."
- [ ] If browser does not support `speechSynthesis`, questions display as text only (no error)
- [ ] Coaching section only appears after meeting output has been generated

---

### US-5: End-to-End UX Polish
**Description:** As a demo presenter, I want the full flow to work seamlessly with a clean UI so the demo is compelling.

**Acceptance Criteria:**
- [ ] UI has 3 clearly labelled phases: **Record → Meeting Output → Coaching**
- [ ] Phases 2 and 3 are hidden until the prior phase completes
- [ ] Loading spinner or "Analyzing…" text shown during all API calls
- [ ] "Start Over" button resets all state (transcript, output, coaching) for another demo run
- [ ] All tap targets are at least 48×48 px (touch-friendly for in-car use)
- [ ] Text is high-contrast and readable at arm's length
- [ ] App works in Chrome (latest) and Firefox (latest)
- [ ] `README.md` documents: prerequisites, env var setup, `uv sync`, `uv run uvicorn main:app`

---

## Technical Design

### Architecture

```
Browser (HTML / app.js / style.css)
  ├─ GET /              → FastAPI StaticFiles → static/index.html
  ├─ WS  /ws/transcribe → FastAPI → Speechmatics RT WebSocket API
  ├─ POST /api/analyze  → FastAPI → Anthropic Claude API
  └─ POST /api/coach    → FastAPI → Anthropic Claude API
```

### File Structure

```
demo-sales-coach/
├── main.py                   # FastAPI app entry point
├── static/
│   ├── index.html            # Single-page frontend
│   ├── app.js                # All frontend JS logic
│   └── style.css             # Styles
├── .env                      # API keys (git-ignored)
├── .env.example              # Key name template
├── pyproject.toml            # Dependencies (uv)
├── README.md
└── specs/
    └── features/
        └── sales-coach-demo-speechmatics-claude.md  ← this file
```

### API Endpoints

| Method    | Path               | Description                                              |
|-----------|--------------------|----------------------------------------------------------|
| GET       | `/`                | Serves `static/index.html`                               |
| GET       | `/health`          | Returns `{"status": "ok"}`                               |
| WebSocket | `/ws/transcribe`   | Proxies browser audio to Speechmatics RT; forwards words |
| POST      | `/api/analyze`     | `{transcript}` → Claude → `{markdown}`                   |
| POST      | `/api/coach`       | `{meeting_output}` → Claude → `{questions: [...]}`       |

### Speechmatics Integration

- **API:** Speechmatics Real-Time (RT) WebSocket API
- **Auth:** `Authorization: Bearer {SPEECHMATICS_API_KEY}` on WebSocket connection
- **Flow:**
  1. Browser captures audio via `MediaRecorder` API (PCM/WebM chunks)
  2. Browser WebSocket → `/ws/transcribe` on FastAPI backend
  3. Backend opens second WebSocket to Speechmatics RT API
  4. Backend forwards binary audio chunks to Speechmatics
  5. Speechmatics sends JSON `AddTranscript` events back
  6. Backend extracts transcript text and sends to browser as `{"type": "transcript", "text": "..."}`
- **Language:** English (configurable via env var `SPEECHMATICS_LANGUAGE`, default `en`)

### Claude Integration

- **SDK:** `anthropic` Python SDK
- **Model:** `claude-sonnet-4-6`
- **`/api/analyze` system prompt:**
  ```
  You are a sales meeting analyst. Given a spoken transcript of a salesperson describing their meeting,
  extract and structure the key information into a clean markdown document with these sections:
  ## Meeting Summary, ## Key Discussion Points, ## Sales Data, ## Action Items, ## Next Steps.
  Be concise and professional. If information is missing from the transcript, note it as "Not mentioned."
  ```
- **`/api/coach` system prompt:**
  ```
  You are an expert sales coach. Given a structured meeting output, generate exactly 3-5 targeted
  coaching questions to help the salesperson improve their skills. Focus on gaps, missed opportunities,
  or areas where they could improve. Return ONLY a JSON array of question strings, no other text.
  ```

### Frontend (No Build Step)

- Pure HTML + vanilla JS + CSS — no npm, no webpack, no framework
- `marked.js` loaded from CDN:
  ```html
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  ```
- `app.js` uses `MediaRecorder` API for mic capture, native `WebSocket` API for WS, `fetch` for REST calls
- `window.speechSynthesis` for TTS (gracefully degraded if unavailable)

### Environment Variables

```bash
# .env.example
ANTHROPIC_API_KEY=sk-ant-your-key-here
SPEECHMATICS_API_KEY=your-speechmatics-key-here
SPEECHMATICS_LANGUAGE=en
```

### Python Dependencies (`pyproject.toml`)

```toml
[project]
name = "sales-coach-demo"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.30.0",
    "anthropic>=0.40.0",
    "websockets>=13.0",
    "python-dotenv>=1.0.0",
    "httpx>=0.27.0",
]
```

---

## User Experience

### UI Layout

```
┌─────────────────────────────────────────────┐
│  🎙 Sales Coach                  [Start Over] │
├─────────────────────────────────────────────┤
│  PHASE 1 — RECORD                           │
│                                             │
│        ╔═══════════════════╗               │
│        ║  ● START RECORDING ║               │
│        ╚═══════════════════╝               │
│                                             │
│  Transcript:                                │
│  ┌─────────────────────────────────────┐   │
│  │ "So I met with John at Acme Corp   │   │
│  │  today, we discussed the Q2..."    │   │
│  └─────────────────────────────────────┘   │
│                                             │
│        ╔═══════════════════╗               │
│        ║  ■ STOP & ANALYZE  ║               │
│        ╚═══════════════════╝               │
├─────────────────────────────────────────────┤
│  PHASE 2 — MEETING OUTPUT     [hidden until] │
│  ┌─────────────────────────────────────┐   │
│  │ ## Meeting Summary                  │   │
│  │ **Customer:** Acme Corp             │   │
│  │ **Date:** 2026-03-03                │   │
│  │ ...                                 │   │
│  └─────────────────────────────────────┘   │
│        ╔═════════════════╗                 │
│        ║  ▶ START COACHING ║                │
│        ╚═════════════════╝                 │
├─────────────────────────────────────────────┤
│  PHASE 3 — COACHING           [hidden until] │
│  Question 2 of 4:                           │
│  ┌─────────────────────────────────────┐   │
│  │ "You mentioned pricing but didn't   │   │
│  │  discuss ROI. How might you frame   │   │
│  │  value differently next time?"      │   │
│  └─────────────────────────────────────┘   │
│    [🔊 Replay]         [→ Next Question]    │
└─────────────────────────────────────────────┘
```

### User Flow

1. Load app → Phase 1 visible, phases 2 & 3 hidden
2. Tap **Start Recording** → mic activates, transcript textarea fills in real-time
3. Tap **Stop & Analyze** → spinner appears → Claude analyzes → Phase 2 appears with markdown
4. Tap **Start Coaching** → Phase 3 appears, question 1 shown + spoken aloud
5. TTS finishes → 2-second pause → auto-advance to next question (or tap **Next Question**)
6. After last question → "Great session! Tap Start Over for another."
7. **Start Over** → resets all state, returns to Phase 1

### Edge Cases & Error States

| Situation | Response |
|-----------|----------|
| Mic permission denied | Red banner: "Microphone access required. Please allow mic access and refresh." |
| Spoke nothing / empty transcript | Warning: "Please say something before analyzing." |
| Speechmatics connection drop | Error banner: "Connection lost. Please stop and retry." |
| Claude API error on `/analyze` | Banner: "Analysis failed — please try again." |
| Claude API error on `/coach` | Banner: "Coaching unavailable — please try again." |
| `speechSynthesis` not supported | Questions shown as text only, no audio, no error banner |
| Browser doesn't support `MediaRecorder` | "Your browser doesn't support audio recording. Please use Chrome or Firefox." |

---

## Non-Functional Requirements

- **NFR-1:** Transcript latency < 2 seconds from speech to displayed text (Speechmatics RT)
- **NFR-2:** Claude analysis response < 10 seconds for typical 3–5 min recording transcripts
- **NFR-3:** App loads in < 3 seconds on localhost (no heavy assets)
- **NFR-4:** No frontend build step — `npm install` must not be required to run the app
- **NFR-5:** All API keys in `.env`, never hardcoded in source files

---

## Implementation Phases

### Phase 1: FastAPI Skeleton + Static Frontend
**Goal:** Runnable server serving a working 3-phase UI layout.

- [ ] Create `pyproject.toml` with all required dependencies
- [ ] Create `main.py`: FastAPI app, `StaticFiles("/static")`, `GET /health`
- [ ] Create `static/index.html`: 3-phase layout, marked.js CDN script tag
- [ ] Create `static/app.js`: empty handler stubs for each button
- [ ] Create `static/style.css`: large buttons (48px+), high contrast, 3-phase layout
- [ ] Create `.env.example` with placeholder key names
- [ ] Create `README.md` with setup instructions

**Verification:**
```bash
uv sync
uv run uvicorn main:app --reload
# In another terminal:
curl localhost:8000/health   # → {"status": "ok"}
# Open browser → http://localhost:8000 → see 3-phase layout with marked.js loaded
```

---

### Phase 2: Speechmatics Real-Time Transcription
**Goal:** Press Record, speak, see words appear live in the transcript area.

- [ ] Add `WS /ws/transcribe` endpoint in `main.py`
- [ ] Backend WS handler: accept browser WebSocket, open second WebSocket to Speechmatics RT
- [ ] Forward binary audio chunks from browser → Speechmatics
- [ ] Parse Speechmatics `AddTranscript` events, send `{"type": "transcript", "text": "..."}` to browser
- [ ] `app.js` `startRecording()`: request mic, create `MediaRecorder`, open WS to `/ws/transcribe`
- [ ] `app.js`: on WS message, append transcript text to textarea
- [ ] `app.js` `stopRecording()`: stop `MediaRecorder`, close WS
- [ ] Error handling: mic denied, Speechmatics auth fail

**Verification:**
```bash
# With valid SPEECHMATICS_API_KEY in .env:
uv run uvicorn main:app --reload
# Open browser → click Start Recording → speak → words appear in textarea
# Click Stop → transcript stops updating, WS closes cleanly
```

---

### Phase 3: Claude Analysis + Markdown Rendering
**Goal:** Stop recording → get structured markdown output → see coaching questions.

- [ ] Add `POST /api/analyze` in `main.py`: validate non-empty transcript, call Claude, return markdown
- [ ] Add `POST /api/coach` in `main.py`: call Claude with meeting output, return `{questions: [...]}`
- [ ] Claude prompt for `/api/analyze`: extract Meeting Summary, Key Points, Sales Data, Action Items, Next Steps
- [ ] Claude prompt for `/api/coach`: generate 3–5 coaching questions as JSON array
- [ ] `app.js`: after `stopRecording()`, POST transcript to `/api/analyze`
- [ ] `app.js`: on response, call `marked.parse(markdown)`, inject HTML into Phase 2 div, reveal Phase 2
- [ ] `app.js`: "Start Coaching" → POST meeting output to `/api/coach`, store questions array, reveal Phase 3
- [ ] Show loading spinner during both API calls
- [ ] Error banners on API failures

**Verification:**
```bash
# With valid ANTHROPIC_API_KEY in .env:
# Record 30+ seconds of speech about a sales meeting
# Click Stop & Analyze → see spinner → see rendered markdown in Phase 2
# Click Start Coaching → see first question appear
curl -X POST localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"transcript": "I met with Sarah at TechCorp today..."}' | jq .markdown
```

---

### Phase 4: TTS Coaching + UX Polish
**Goal:** Full end-to-end demo flow with voice coaching and polished UX.

- [ ] `app.js`: on coaching questions loaded, call `speechSynthesis.speak()` for question 1
- [ ] `utterance.onend` callback: wait 2 seconds, then auto-advance to next question
- [ ] "Replay" button: re-speaks current question
- [ ] "Next Question" button: manually advance (cancel current TTS, speak next)
- [ ] After last question: show "Great session! Tap Start Over for another."
- [ ] "Start Over" button: hide phases 2 & 3, clear transcript, output, questions; show Phase 1
- [ ] Graceful degradation if `speechSynthesis` unavailable
- [ ] All error banners implemented (from edge cases table above)
- [ ] Final styling pass: consistent spacing, readable fonts, mobile-friendly

**Verification:**
```bash
# Full end-to-end demo:
# 1. Open http://localhost:8000
# 2. Click Start Recording, speak about a sales meeting for 30+ seconds
# 3. Click Stop & Analyze, wait for markdown output
# 4. Click Start Coaching, hear questions read aloud
# 5. Click Next Question or wait for auto-advance
# 6. Click Start Over, confirm reset
# 7. Repeat test in Firefox
```

---

## Definition of Done

This feature is complete when:

- [ ] All 4 implementation phases pass their verification steps
- [ ] Full demo flow works end-to-end in Chrome (latest) and Firefox (latest)
- [ ] `uv run uvicorn main:app` starts cleanly with a valid `.env`
- [ ] `GET /health` returns `{"status": "ok"}`
- [ ] No API keys are hardcoded anywhere in the source
- [ ] `README.md` accurately documents all setup steps

---

## Ralph Loop Command

```bash
/ralph-loop "Implement the sales coach demo per spec at specs/features/sales-coach-demo-speechmatics-claude.md

PHASES:
1. FastAPI Skeleton + Static Frontend
   Tasks: pyproject.toml, main.py (StaticFiles + /health), static/index.html (3-phase layout + marked.js CDN), app.js (stubs), style.css (large buttons, high-contrast), .env.example, README.md
   Verify: uv run uvicorn main:app --reload && curl localhost:8000/health → {status:ok} && open browser → see layout

2. Speechmatics Real-Time Transcription
   Tasks: WS /ws/transcribe endpoint proxying to Speechmatics RT API, app.js startRecording() with MediaRecorder + WebSocket, live transcript display, stopRecording(), error handling
   Verify: Record speech in browser → words appear in real-time → stop cleanly

3. Claude Analysis + Markdown Rendering
   Tasks: POST /api/analyze (transcript → Claude → markdown), POST /api/coach (meeting → Claude → questions JSON), app.js integration (call APIs, marked.parse(), spinner, error banners)
   Verify: curl POST /api/analyze with transcript → get markdown. Record → stop → see rendered markdown → coaching questions appear

4. TTS Coaching + UX Polish
   Tasks: speechSynthesis.speak() for each question, utterance.onend auto-advance (2s delay), Replay/Next buttons, Start Over reset, graceful degradation, all error banners, final styling
   Verify: Full end-to-end demo in Chrome and Firefox: record → analyze → coach with voice → start over

VERIFICATION (run after each phase):
- uv run uvicorn main:app --reload (must start without error)
- curl localhost:8000/health (must return {status: ok})
- Manual browser test per phase verification steps above

ESCAPE HATCH: After 20 iterations without progress:
- Document what is blocking in specs/features/sales-coach-demo-speechmatics-claude.md under 'Implementation Notes'
- List approaches attempted
- Stop and ask for human guidance

Output <promise>COMPLETE</promise> when all 4 phases pass verification." --max-iterations 40 --completion-promise "COMPLETE"
```

---

## Open Questions / Assumptions

| Topic | Assumption Made | Alternative |
|-------|----------------|-------------|
| Speechmatics mode | Real-time streaming (WebSocket) — most impressive for demo | Batch upload if RT API access not available |
| TTS provider | Browser `speechSynthesis` — zero cost, no extra API key | OpenAI TTS, Speechmatics TTS |
| Claude model | `claude-sonnet-4-6` | `claude-opus-4-6` for higher quality |
| Storage | None — in-memory session only | SQLite for session history |
| Output format | Meeting summary + key points + sales data + action items + next steps | Actual price quote document with line items |
| Coaching interaction | One-way: Claude asks, user listens | Two-way: user speaks answers, Claude responds |

---

## Implementation Notes

*Added during implementation*
