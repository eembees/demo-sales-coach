import asyncio
import json
import os

import anthropic
import httpx
import websockets
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="Product Scout")

SYSTEM_PROMPT = """\
You are a helpful product assistant for an online store. \
Customers will ask you questions about products using voice.

When a customer asks about a product, ALWAYS use the get_product_info tool \
to look up accurate details before answering — never guess prices or specs.

Keep answers concise (2-4 sentences). End every answer that references a \
product with a line in this exact format:
Source: <Product Name>

If the requested product is not in the database, say so clearly.\
"""

SPEECHMATICS_RT_URL = "wss://eu2.rt.speechmatics.com/v2"
SPEECHMATICS_TTS_URL = "https://eu2.tts.speechmatics.com/v1/generate"
SPEECHMATICS_TTS_VOICE = "aria"

GET_PRODUCT_TOOL = {
    "name": "get_product_info",
    "description": (
        "Fetch the product catalog in full with  product name, category, and feature keyword. "
        "Returns full details for all products."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Product name, category name, or feature keyword to search for",
            }
        },
        "required": ["query"],
    },
}


# ---------- Pydantic models ----------

class Product(BaseModel):
    id: str
    name: str
    price: float
    category: str
    description: str
    features: list[str]
    availability: str


class ChatRequest(BaseModel):
    transcript: str
    products: list[Product]
    anthropic_key: str


class TTSRequest(BaseModel):
    text: str
    speechmatics_key: str


# ---------- WebSocket transcription proxy ----------

@app.websocket("/ws/transcribe")
async def transcribe_ws(websocket: WebSocket, speechmatics_key: str):
    await websocket.accept()

    try:
        async with websockets.connect(
            SPEECHMATICS_RT_URL,
            additional_headers={"Authorization": f"Bearer {speechmatics_key}"},
        ) as sm_ws:
            await sm_ws.send(
                json.dumps({
                    "message": "StartRecognition",
                    "audio_format": {"type": "file"},
                    "transcription_config": {
                        "language": "en",
                        "enable_partials": False,
                        "max_delay": 2,
                    },
                })
            )

            async def forward_audio():
                try:
                    while True:
                        data = await websocket.receive_bytes()
                        await sm_ws.send(data)
                except Exception:
                    try:
                        await sm_ws.send(
                            json.dumps({"message": "EndOfStream", "last_seq_no": 0})
                        )
                    except Exception:
                        pass

            async def forward_transcripts():
                async for msg in sm_ws:
                    data = json.loads(msg)
                    if data.get("message") == "AddTranscript":
                        text = data.get("metadata", {}).get("transcript", "")
                        if text:
                            await websocket.send_json({"type": "transcript", "text": text})
                    elif data.get("message") == "EndOfTranscript":
                        await websocket.send_json({"type": "done"})
                        break

            await asyncio.gather(forward_audio(), forward_transcripts())

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


# ---------- Agent loop ----------

def get_products(query: str, products:list[Product])->str:
    return "\n\n---\n\n".join(
            f"Product: {p.name} (ID: {p.id})\n"
            f"Price: ${p.price:.2f}\n"
            f"Category: {p.category}\n"
            f"Description: {p.description}\n"
            f"Features: {', '.join(p.features)}\n"
            f"Availability: {p.availability}" for p in products
    )

def search_products(query: str, products: list[Product]) -> str:
    q = query.lower()
    matches = [
        p for p in products
        if (
            q in p.name.lower()
            or q in p.category.lower()
            or q in p.description.lower()
            or any(q in f.lower() for f in p.features)
        )
    ]
    if not matches:
        categories = ", ".join(sorted({p.category for p in products}))
        return f"No products found for '{query}'. Available categories: {categories}."

    parts = []
    for p in matches[:4]:
        parts.append(
            f"Product: {p.name} (ID: {p.id})\n"
            f"Price: ${p.price:.2f}\n"
            f"Category: {p.category}\n"
            f"Description: {p.description}\n"
            f"Features: {', '.join(p.features)}\n"
            f"Availability: {p.availability}"
        )
    return "\n\n---\n\n".join(parts)


@app.post("/api/chat")
async def chat(request: ChatRequest):
    client = anthropic.Anthropic(api_key=request.anthropic_key)
    messages: list[dict] = [{"role": "user", "content": request.transcript}]
    source: str | None = None

    for _ in range(6):  # max agent iterations
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=512,
            system=SYSTEM_PROMPT,
            tools=[GET_PRODUCT_TOOL],
            messages=messages,
        )
        print(f"LLM response: {response.content}")
        if response.stop_reason == "end_turn":
            answer = next(
                (b.text for b in response.content if hasattr(b, "text")), ""
            )
            # Extract "Source: X" line if present
            for line in answer.splitlines():
                if line.lower().startswith("source:"):
                    source = line.split(":", 1)[1].strip()
                    break
            return {"answer": answer, "source": source}

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type == "tool_use" and block.name == "get_product_info":
                    result = get_products(block.input["query"], request.products)
                    # result = search_products(block.input["query"], request.products)
                    # Track which product names appeared so we can surface a source
                    for p in request.products:
                        if p.name.lower() in result.lower() and source is None:
                            source = p.name
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })
            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})
        else:
            break

    return {"answer": "I couldn't find a good answer. Please try again.", "source": None}


# ---------- Text-to-speech proxy ----------

@app.post("/api/tts")
async def tts(request: TTSRequest):
    async def stream_audio():
        async with httpx.AsyncClient(timeout=30) as client:
            async with client.stream(
                "POST",
                SPEECHMATICS_TTS_URL,
                headers={
                    "Authorization": f"Bearer {request.speechmatics_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "input": request.text,
                    "voice": {"name": SPEECHMATICS_TTS_VOICE},
                    "audio_format": {"type": "wav"},
                },
            ) as resp:
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes(chunk_size=4096):
                    yield chunk

    return StreamingResponse(stream_audio(), media_type="audio/wav")


# ---------- Static files ----------

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def index():
    return FileResponse("static/index.html")


@app.get("/health")
async def health():
    return {"status": "ok"}
