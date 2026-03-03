import json
import os
import asyncio

import anthropic
import websockets
from websockets.asyncio.client import connect as ws_connect
from websockets.exceptions import InvalidStatus
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
SPEECHMATICS_API_KEY = os.getenv("SPEECHMATICS_API_KEY", "")
SPEECHMATICS_LANGUAGE = os.getenv("SPEECHMATICS_LANGUAGE", "en")
SPEECHMATICS_RT_URL = "wss://eu2.rt.speechmatics.com/v2"

app = FastAPI(title="Sales Coach Demo")

# --- REST Models ---

class Product(BaseModel):
    sku: str
    name: str
    price: float
    unit: str
    category: str

class TranscriptRequest(BaseModel):
    transcript: str
    products: list[Product] = []

class MeetingOutputRequest(BaseModel):
    meeting_output: str

# --- Health ---

@app.get("/health")
async def health():
    return {"status": "ok"}

# --- WebSocket: Transcription proxy ---

@app.websocket("/ws/transcribe")
async def ws_transcribe(browser_ws: WebSocket):
    await browser_ws.accept()

    if not SPEECHMATICS_API_KEY:
        await browser_ws.send_text(json.dumps({"type": "error", "text": "Transcription service unavailable."}))
        await browser_ws.close()
        return

    sm_url = f"{SPEECHMATICS_RT_URL}?jwt={SPEECHMATICS_API_KEY}"
    sm_headers = {"Authorization": f"Bearer {SPEECHMATICS_API_KEY}"}

    try:
        async with ws_connect(sm_url, additional_headers=sm_headers) as sm_ws:
            # Send StartRecognition message to Speechmatics
            start_msg = {
                "message": "StartRecognition",
                "audio_format": {
                    "type": "file",
                },
                "transcription_config": {
                    "language": SPEECHMATICS_LANGUAGE,
                    "enable_partials": False,
                    "max_delay": 2,
                },
            }
            await sm_ws.send(json.dumps(start_msg))

            async def browser_to_sm():
                """Forward binary audio from browser → Speechmatics."""
                try:
                    while True:
                        data = await browser_ws.receive_bytes()
                        await sm_ws.send(data)
                except (WebSocketDisconnect, Exception):
                    # Send EndOfStream to Speechmatics
                    try:
                        await sm_ws.send(json.dumps({"message": "EndOfStream", "last_seq_no": 0}))
                    except Exception:
                        pass

            async def sm_to_browser():
                """Forward Speechmatics transcript events → browser."""
                try:
                    async for raw_msg in sm_ws:
                        if isinstance(raw_msg, bytes):
                            continue
                        msg = json.loads(raw_msg)
                        msg_type = msg.get("message", "")

                        if msg_type == "AddTranscript":
                            text = msg.get("metadata", {}).get("transcript", "")
                            if text.strip():
                                await browser_ws.send_text(
                                    json.dumps({"type": "transcript", "text": text})
                                )
                        elif msg_type == "EndOfTranscript":
                            await browser_ws.send_text(json.dumps({"type": "done"}))
                            break
                        elif msg_type == "Error":
                            err = msg.get("reason", "Transcription error")
                            await browser_ws.send_text(
                                json.dumps({"type": "error", "text": f"Transcription service error: {err}"})
                            )
                            break
                except Exception:
                    pass

            await asyncio.gather(browser_to_sm(), sm_to_browser())

    except (InvalidStatus, OSError, websockets.WebSocketException) as exc:
        await browser_ws.send_text(
            json.dumps({"type": "error", "text": "Transcription service unavailable."})
        )
    except Exception as exc:
        try:
            await browser_ws.send_text(
                json.dumps({"type": "error", "text": "Connection lost. Please stop and retry."})
            )
        except Exception:
            pass
    finally:
        try:
            await browser_ws.close()
        except Exception:
            pass


# --- POST /api/analyze ---

ANALYZE_SYSTEM_PROMPT = """You are a sales meeting analyst for a candy distribution company.
You have access to the company's product database (provided below as JSON).

Given a spoken transcript of a salesperson describing their meeting, produce a structured markdown document with exactly these three sections in this order:

## Order Overview
Extract all products, quantities, and pricing discussed. Match product names to the database by name or SKU (case-insensitive).
Calculate line totals (price × quantity) and a Total Deal Value.
If a quantity is not mentioned for a product, write "not specified" in the Qty column and leave Line Total blank.
Format as a markdown table with columns: SKU | Product | Qty | Unit Price | Line Total
After the table, add a bold line: **Total Deal Value: X SEK** (only include products with specified quantities in the total).
If a product is mentioned but not in the database, include it in the table with SKU = "UNKNOWN".
If no products are mentioned at all, write "No products discussed."

## Meeting Summary
A concise narrative summary of the meeting: who was met, what was discussed, outcomes agreed, tone of the conversation.

## Red Flags & Notes
Use bullet points with ⚠️ prefix. Flag these issues if present:
- Any product mentioned in the transcript that does not appear in the product database (by name or SKU)
- Any customer objection, hesitation, price resistance, or mention of competitors
- No follow-up date or next step was agreed upon during the meeting
If none of the above are detected, write: "No red flags identified."

Product Database (JSON):
{product_json}

Be concise and professional. If information is missing, note it as "Not mentioned."
"""

@app.post("/api/analyze")
async def analyze(req: TranscriptRequest):
    if not req.transcript or not req.transcript.strip():
        raise HTTPException(status_code=422, detail="Transcript cannot be empty")

    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="Analysis service unavailable")

    product_json = json.dumps(
        [p.model_dump() for p in req.products],
        ensure_ascii=False,
        indent=2,
    ) if req.products else "[]"

    system_prompt = ANALYZE_SYSTEM_PROMPT.replace("{product_json}", product_json)

    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": req.transcript}],
        )
        markdown = message.content[0].text
        return {"markdown": markdown}
    except anthropic.APIError as exc:
        raise HTTPException(status_code=502, detail="Analysis failed — please try again.")


# --- POST /api/coach ---

COACH_SYSTEM_PROMPT = """You are an expert sales coach. Given a structured meeting output, generate exactly 3-5 targeted coaching questions to help the salesperson improve their skills. Focus on gaps, missed opportunities, or areas where they could improve. Return ONLY a JSON array of question strings, no other text.
"""

@app.post("/api/coach")
async def coach(req: MeetingOutputRequest):
    if not req.meeting_output or not req.meeting_output.strip():
        raise HTTPException(status_code=422, detail="Meeting output cannot be empty")

    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="Coaching service unavailable")

    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=COACH_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": req.meeting_output}],
        )
        raw = message.content[0].text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw
            raw = raw.rsplit("```", 1)[0].strip()
        questions = json.loads(raw)
        if not isinstance(questions, list):
            questions = [questions]
        return {"questions": questions}
    except (json.JSONDecodeError, IndexError):
        raise HTTPException(status_code=502, detail="Coaching unavailable — please try again.")
    except anthropic.APIError:
        raise HTTPException(status_code=502, detail="Coaching unavailable — please try again.")


# --- Static files (must be last) ---
app.mount("/", StaticFiles(directory="static", html=True), name="static")
