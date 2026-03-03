/* ============================================================
   Sales Coach Demo — app.js
   Phases: Record → Meeting Output → Coaching (TTS)
   + Product Database tab
   ============================================================ */

// ── Product Database ──────────────────────────────────────────
const DEFAULT_PRODUCTS = [
  { sku: "LAK-001", name: "Lakerol",        price: 15.90, unit: "pack", category: "Pastilles" },
  { sku: "KEX-001", name: "Kex Choklad",    price: 12.50, unit: "bar",  category: "Chocolate" },
  { sku: "SKP-001", name: "Skippers Pipes", price: 18.90, unit: "bag",  category: "Candy"     },
];

let products = DEFAULT_PRODUCTS.map(p => ({ ...p }));

function renderProductTable() {
  const tbody = document.getElementById("products-body");
  tbody.innerHTML = "";

  products.forEach((product, i) => {
    const tr = document.createElement("tr");

    const fields = [
      { key: "sku",      type: "text",   width: "" },
      { key: "name",     type: "text",   width: "" },
      { key: "price",    type: "number", width: "" },
      { key: "unit",     type: "text",   width: "" },
      { key: "category", type: "text",   width: "" },
    ];

    fields.forEach(({ key, type }) => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.type = type;
      input.value = product[key];
      if (type === "number") {
        input.step = "0.01";
        input.min = "0";
      }
      input.addEventListener("input", () => {
        products[i][key] = type === "number" ? parseFloat(input.value) || 0 : input.value;
      });
      td.appendChild(input);
      tr.appendChild(td);
    });

    // Delete button
    const tdDel = document.createElement("td");
    const btnDel = document.createElement("button");
    btnDel.className = "btn-delete";
    btnDel.title = "Delete row";
    btnDel.textContent = "×";
    btnDel.addEventListener("click", () => {
      products.splice(i, 1);
      renderProductTable();
    });
    tdDel.appendChild(btnDel);
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
  });
}

function addProduct() {
  products.push({ sku: "", name: "", price: 0, unit: "", category: "" });
  renderProductTable();
  // Focus first input of new row
  const tbody = document.getElementById("products-body");
  const lastRow = tbody.lastElementChild;
  if (lastRow) lastRow.querySelector("input")?.focus();
}

function resetProducts() {
  products = DEFAULT_PRODUCTS.map(p => ({ ...p }));
  renderProductTable();
}

// ── Tab Switching ─────────────────────────────────────────────
function switchTab(tab) {
  const tabCoach    = document.getElementById("tab-coach");
  const tabProducts = document.getElementById("tab-products");
  const btnCoach    = document.getElementById("tab-btn-coach");
  const btnProducts = document.getElementById("tab-btn-products");

  if (tab === "coach") {
    tabCoach.classList.remove("hidden");
    tabProducts.classList.add("hidden");
    btnCoach.classList.add("active");
    btnProducts.classList.remove("active");
  } else {
    tabCoach.classList.add("hidden");
    tabProducts.classList.remove("hidden");
    btnCoach.classList.remove("active");
    btnProducts.classList.add("active");
  }
}

// ── State ───────────────────────────────────────────────────
let mediaRecorder = null;
let ws = null;
let transcript = "";
let meetingMarkdown = "";
let questions = [];
let currentQuestionIndex = 0;
let utterance = null;
let autoAdvanceTimer = null;
const ttsSupported = "speechSynthesis" in window;

// ── DOM refs ─────────────────────────────────────────────────
const btnRecord      = document.getElementById("btn-record");
const btnStop        = document.getElementById("btn-stop");
const btnStartOver   = document.getElementById("btn-start-over");
const btnStartCoach  = document.getElementById("btn-start-coaching");
const btnReplay      = document.getElementById("btn-replay");
const btnNext        = document.getElementById("btn-next");
const transcriptArea = document.getElementById("transcript-area");
const analyzingSpinner  = document.getElementById("analyzing-spinner");
const coachingSpinner   = document.getElementById("coaching-spinner");
const phaseRecord    = document.getElementById("phase-record");
const phaseOutput    = document.getElementById("phase-output");
const phaseCoaching  = document.getElementById("phase-coaching");
const meetingOutput  = document.getElementById("meeting-output");
const questionBox    = document.getElementById("question-box");
const questionCounter = document.getElementById("question-counter");
const sessionDone    = document.getElementById("session-done");
const errorBanner    = document.getElementById("error-banner");

// ── Error helpers ─────────────────────────────────────────────
function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.remove("hidden");
}

function clearError() {
  errorBanner.classList.add("hidden");
  errorBanner.textContent = "";
}

// ── Phase 1: Recording ────────────────────────────────────────
async function startRecording() {
  clearError();

  if (!navigator.mediaDevices || !window.MediaRecorder) {
    showError("Your browser doesn't support audio recording. Please use Chrome or Firefox.");
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    showError("Microphone access required. Please allow mic access and refresh.");
    return;
  }

  // Reset transcript
  transcript = "";
  transcriptArea.textContent = "";

  // Open WebSocket to backend
  const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/transcribe`;
  ws = new WebSocket(wsUrl);
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    // Start MediaRecorder — send PCM/WebM chunks
    mediaRecorder = new MediaRecorder(stream, { mimeType: getBestMimeType() });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(e.data);
      }
    };

    mediaRecorder.start(250); // chunk every 250ms

    // UI: recording mode
    btnRecord.classList.add("hidden");
    btnStop.classList.remove("hidden");
    btnStop.classList.add("recording-pulse");
  };

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.type === "transcript") {
        transcript += msg.text;
        transcriptArea.textContent = transcript;
        transcriptArea.scrollTop = transcriptArea.scrollHeight;
      } else if (msg.type === "error") {
        showError(msg.text || "Transcription service unavailable.");
      }
    } catch (e) {
      // ignore parse errors
    }
  };

  ws.onerror = () => {
    showError("Connection lost. Please stop and retry.");
  };

  ws.onclose = () => {
    // No-op; cleanup handled in stopRecording
  };
}

function getBestMimeType() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

async function stopRecording() {
  // Stop mic
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }

  // Close WebSocket
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }

  // UI reset
  btnStop.classList.add("hidden");
  btnStop.classList.remove("recording-pulse");
  btnRecord.classList.remove("hidden");

  if (!transcript.trim()) {
    showError("Please say something before analyzing.");
    return;
  }

  await analyzeTranscript();
}

// ── Phase 2: Claude Analysis ──────────────────────────────────
async function analyzeTranscript() {
  clearError();
  analyzingSpinner.classList.remove("hidden");
  btnRecord.disabled = true;

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, products }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showError(err.detail || "Analysis failed — please try again.");
      return;
    }

    const data = await res.json();
    meetingMarkdown = data.markdown || "";
    meetingOutput.innerHTML = marked.parse(meetingMarkdown);
    phaseOutput.classList.remove("hidden");
    phaseOutput.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    showError("Analysis failed — please try again.");
  } finally {
    analyzingSpinner.classList.add("hidden");
    btnRecord.disabled = false;
  }
}

// ── Phase 3: Coaching ─────────────────────────────────────────
async function startCoaching() {
  clearError();
  coachingSpinner.classList.remove("hidden");
  btnStartCoach.disabled = true;

  try {
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meeting_output: meetingMarkdown }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showError(err.detail || "Coaching unavailable — please try again.");
      return;
    }

    const data = await res.json();
    questions = data.questions || [];

    if (questions.length === 0) {
      showError("No coaching questions returned. Please try again.");
      return;
    }

    currentQuestionIndex = 0;
    sessionDone.classList.add("hidden");
    btnReplay.classList.remove("hidden");
    btnNext.classList.remove("hidden");
    phaseCoaching.classList.remove("hidden");
    phaseCoaching.scrollIntoView({ behavior: "smooth" });
    showQuestion(currentQuestionIndex);
  } catch (err) {
    showError("Coaching unavailable — please try again.");
  } finally {
    coachingSpinner.classList.add("hidden");
    btnStartCoach.disabled = false;
  }
}

function showQuestion(index) {
  clearAutoAdvance();

  if (index >= questions.length) {
    // All done
    questionBox.textContent = "";
    questionCounter.textContent = "";
    btnReplay.classList.add("hidden");
    btnNext.classList.add("hidden");
    sessionDone.classList.remove("hidden");
    cancelTTS();
    return;
  }

  const q = questions[index];
  questionCounter.textContent = `Question ${index + 1} of ${questions.length}`;
  questionBox.textContent = q;

  speakQuestion(q);
}

function speakQuestion(text) {
  cancelTTS();

  if (!ttsSupported) return;

  utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1.0;

  utterance.onend = () => {
    // Auto-advance after 2s pause
    autoAdvanceTimer = setTimeout(() => {
      currentQuestionIndex++;
      showQuestion(currentQuestionIndex);
    }, 2000);
  };

  utterance.onerror = () => {
    // Silently degrade — text already shown
  };

  window.speechSynthesis.speak(utterance);
}

function cancelTTS() {
  if (ttsSupported) {
    window.speechSynthesis.cancel();
  }
  utterance = null;
}

function clearAutoAdvance() {
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
}

function replayQuestion() {
  clearAutoAdvance();
  if (currentQuestionIndex < questions.length) {
    speakQuestion(questions[currentQuestionIndex]);
  }
}

function nextQuestion() {
  clearAutoAdvance();
  cancelTTS();
  currentQuestionIndex++;
  showQuestion(currentQuestionIndex);
}

// ── Start Over ────────────────────────────────────────────────
function startOver() {
  // Stop any ongoing recording
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  cancelTTS();
  clearAutoAdvance();

  // Reset state (products are intentionally preserved)
  transcript = "";
  meetingMarkdown = "";
  questions = [];
  currentQuestionIndex = 0;
  mediaRecorder = null;
  ws = null;

  // Reset UI
  transcriptArea.textContent = "";
  meetingOutput.innerHTML = "";
  questionBox.textContent = "";
  questionCounter.textContent = "";
  sessionDone.classList.add("hidden");
  btnReplay.classList.remove("hidden");
  btnNext.classList.remove("hidden");

  btnStop.classList.add("hidden");
  btnStop.classList.remove("recording-pulse");
  btnRecord.classList.remove("hidden");
  btnRecord.disabled = false;
  btnStartCoach.disabled = false;

  analyzingSpinner.classList.add("hidden");
  coachingSpinner.classList.add("hidden");

  phaseOutput.classList.add("hidden");
  phaseCoaching.classList.add("hidden");

  clearError();

  // Switch back to Sales Coach tab
  switchTab("coach");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── Init ──────────────────────────────────────────────────────
renderProductTable();
