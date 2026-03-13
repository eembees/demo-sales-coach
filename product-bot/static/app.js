// ─────────────────────────────────────────────
//  API KEY MANAGEMENT
// ─────────────────────────────────────────────

function getKey(storageKey, label) {
  let val = localStorage.getItem(storageKey);
  if (!val) {
    val = prompt(`Enter your ${label}:`);
    if (val) localStorage.setItem(storageKey, val.trim());
  }
  return val || '';
}

function showSettings() {
  if (!confirm('Clear stored API keys and re-enter them?')) return;
  localStorage.removeItem('anthropic_key');
  localStorage.removeItem('speechmatics_key');
  location.reload();
}

// ─────────────────────────────────────────────
//  PRODUCT DATABASE
// ─────────────────────────────────────────────

const DEFAULT_PRODUCTS = [
  {
    id: 'PRD-001',
    name: 'AirComfort Pro Headphones',
    price: 249.99,
    category: 'Audio',
    description: 'Premium wireless headphones with adaptive noise cancellation and 40-hour battery life.',
    features: ['Adaptive ANC', '40h battery', 'USB-C charging', 'Multipoint Bluetooth', 'Foldable'],
    availability: 'In Stock',
  },
  {
    id: 'PRD-002',
    name: 'NanoBlast Earbuds',
    price: 129.99,
    category: 'Audio',
    description: 'True wireless earbuds with deep bass and IPX5 water resistance.',
    features: ['IPX5 waterproof', '8h + 24h case', 'Touch controls', 'Transparency mode'],
    availability: 'In Stock',
  },
  {
    id: 'PRD-003',
    name: 'UltraSound Soundbar 400',
    price: 399.99,
    category: 'Home Audio',
    description: '3.1-channel soundbar with Dolby Atmos and built-in subwoofer.',
    features: ['Dolby Atmos', 'Built-in subwoofer', 'HDMI ARC', 'Wi-Fi & Bluetooth', '400W'],
    availability: 'Low Stock',
  },
  {
    id: 'PRD-004',
    name: 'ClearView 4K Webcam',
    price: 89.99,
    category: 'Peripherals',
    description: '4K USB webcam with AI auto-framing and built-in ring light.',
    features: ['4K 30fps', 'AI auto-framing', 'Ring light', 'USB-C', 'Privacy shutter'],
    availability: 'In Stock',
  },
  {
    id: 'PRD-005',
    name: 'PowerDesk USB Hub',
    price: 59.99,
    category: 'Peripherals',
    description: '7-port USB-C hub with 100 W pass-through charging and 4K HDMI.',
    features: ['7 ports', '100W PD', '4K HDMI', 'SD card reader', 'USB 3.0'],
    availability: 'In Stock',
  },
  {
    id: 'PRD-006',
    name: 'ErgoFlow Desk Chair',
    price: 599.99,
    category: 'Furniture',
    description: 'Ergonomic mesh office chair with lumbar support and 4D armrests.',
    features: ['Mesh back', '4D armrests', 'Lumbar support', 'Seat depth adjust', '5-year warranty'],
    availability: 'Made to Order',
  },
];

let products = structuredClone(DEFAULT_PRODUCTS);

function renderProductTable() {
  const wrap = document.getElementById('product-table-wrap');

  const cols = [
    { key: 'id',           label: 'SKU',          type: 'text',   width: '90px' },
    { key: 'name',         label: 'Name',          type: 'text',   width: '' },
    { key: 'price',        label: 'Price ($)',      type: 'number', width: '80px' },
    { key: 'category',     label: 'Category',       type: 'text',   width: '110px' },
    { key: 'availability', label: 'Availability',   type: 'text',   width: '110px' },
    { key: 'description',  label: 'Description',    type: 'text',   width: '' },
    { key: 'features',     label: 'Features',       type: 'text',   width: '' },
  ];

  const headerCells = cols.map(c =>
    `<th style="${c.width ? `width:${c.width}` : ''}">${c.label}</th>`
  ).join('');

  const bodyRows = products.map((p, i) => {
    const cells = cols.map(c => {
      const val = c.key === 'features' ? p.features.join(', ') : p[c.key];
      const inputType = c.type === 'number' ? 'number' : 'text';
      const style = c.width ? `style="width:${c.width}"` : '';
      return `<td>
        <input
          type="${inputType}"
          value="${escapeAttr(String(val))}"
          ${style}
          oninput="updateProduct(${i}, '${c.key}', this.value)"
          aria-label="${c.label}"
        />
      </td>`;
    }).join('');
    return `<tr>
      ${cells}
      <td><button class="btn-delete" onclick="deleteProduct(${i})" aria-label="Delete row">×</button></td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table class="product-table">
      <thead><tr>${headerCells}<th style="width:36px"></th></tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
}

function updateProduct(index, key, value) {
  if (key === 'features') {
    products[index].features = value.split(',').map(s => s.trim()).filter(Boolean);
  } else if (key === 'price') {
    products[index].price = parseFloat(value) || 0;
  } else {
    products[index][key] = value;
  }
}

function addProduct() {
  products.push({
    id: '',
    name: '',
    price: 0,
    category: '',
    description: '',
    features: [],
    availability: 'In Stock',
  });
  renderProductTable();
}

function deleteProduct(index) {
  products.splice(index, 1);
  renderProductTable();
}

function resetProducts() {
  if (!confirm('Reset products to defaults?')) return;
  products = structuredClone(DEFAULT_PRODUCTS);
  renderProductTable();
}

// ─────────────────────────────────────────────
//  VOICE RECORDING
// ─────────────────────────────────────────────

let mediaRecorder = null;
let ws = null;
let liveTranscript = '';
let isRecording = false;

async function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  const speechmaticsKey = getKey('speechmatics_key', 'Speechmatics API Key');
  if (!speechmaticsKey) return;

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    showError('Microphone access denied. Please allow microphone access and try again.');
    return;
  }

  liveTranscript = '';
  updateTranscriptPreview('');

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws/transcribe?speechmatics_key=${encodeURIComponent(speechmaticsKey)}`);

  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'transcript') {
      liveTranscript += data.text;
      updateTranscriptPreview(liveTranscript);
    } else if (data.type === 'done') {
      finishAndSend();
    } else if (data.type === 'error') {
      showError('Transcription error: ' + data.message);
      cleanupRecording();
    }
  };

  ws.onerror = () => {
    showError('WebSocket error — check your Speechmatics key.');
    cleanupRecording();
  };

  const mimeType = getBestMimeType();
  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0 && ws?.readyState === WebSocket.OPEN) {
      ws.send(e.data);
    }
  };

  mediaRecorder.start(250);
  isRecording = true;
  updateMicUI();
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  mediaRecorder?.stream?.getTracks().forEach(t => t.stop());
  ws?.close();
  isRecording = false;
  updateMicUI();
  // ws 'done' event will trigger finishAndSend; if it doesn't arrive, send manually
  setTimeout(() => {
    if (liveTranscript.trim()) finishAndSend();
  }, 1500);
}

function cleanupRecording() {
  mediaRecorder?.stream?.getTracks().forEach(t => t.stop());
  isRecording = false;
  updateMicUI();
}

function finishAndSend() {
  const text = liveTranscript.trim();
  liveTranscript = '';
  updateTranscriptPreview('');
  if (text) sendChat(text);
}

// ─────────────────────────────────────────────
//  CHAT
// ─────────────────────────────────────────────

async function sendChat(userText) {
  const anthropicKey = getKey('anthropic_key', 'Anthropic API Key');
  if (!anthropicKey) return;

  appendUserMessage(userText);
  const loadingId = appendLoading();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: userText,
        products,
        anthropic_key: anthropicKey,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    removeLoading(loadingId);
    appendBotMessage(data.answer, data.source);
  } catch (err) {
    removeLoading(loadingId);
    appendBotMessage('Sorry, something went wrong. Please try again.', null);
    console.error(err);
  }
}

// ─────────────────────────────────────────────
//  MESSAGE RENDERING
// ─────────────────────────────────────────────

function appendUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'message user-message';
  div.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  chatMessages().appendChild(div);
  scrollBottom();
}

function appendBotMessage(text, source) {
  // Strip the "Source: X" line from the displayed answer text
  const cleanText = text.replace(/^Source:.*$/im, '').trim();
  const sourceBadge = source
    ? `<div class="source-badge">📦 ${escapeHtml(source)}</div>`
    : '';

  const div = document.createElement('div');
  div.className = 'message bot-message';
  div.innerHTML = `
    <div>
      <div class="bubble">${escapeHtml(cleanText)}</div>
      ${sourceBadge}
    </div>`;
  chatMessages().appendChild(div);
  scrollBottom();
}

let loadingSeq = 0;

function appendLoading() {
  const id = `loading-${++loadingSeq}`;
  const div = document.createElement('div');
  div.id = id;
  div.className = 'message bot-message';
  div.innerHTML = `
    <div class="bubble loading-bubble">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
    </div>`;
  chatMessages().appendChild(div);
  scrollBottom();
  return id;
}

function removeLoading(id) {
  document.getElementById(id)?.remove();
}

function clearChat() {
  chatMessages().innerHTML = `
    <div class="message bot-message">
      <div class="bubble">Hi! I'm your product assistant. Ask me anything about our products — just tap the mic and speak.</div>
    </div>`;
}

// ─────────────────────────────────────────────
//  UI HELPERS
// ─────────────────────────────────────────────

function chatMessages() {
  return document.getElementById('chat-messages');
}

function scrollBottom() {
  const el = chatMessages();
  el.scrollTop = el.scrollHeight;
}

function updateMicUI() {
  const btn = document.getElementById('mic-btn');
  const icon = document.getElementById('mic-icon');
  const hint = document.getElementById('recording-hint');
  btn.classList.toggle('recording', isRecording);
  btn.setAttribute('aria-label', isRecording ? 'Stop recording' : 'Start recording');
  icon.textContent = isRecording ? '⏹' : '🎤';
  hint.textContent = isRecording ? 'Tap to stop & send' : 'Tap to speak';
}

function updateTranscriptPreview(text) {
  const el = document.getElementById('transcript-preview');
  el.textContent = text || '';
  el.classList.toggle('hidden', !text);
}

function showError(msg) {
  const div = document.createElement('div');
  div.className = 'message bot-message error-message';
  div.innerHTML = `<div class="bubble error-bubble">${escapeHtml(msg)}</div>`;
  chatMessages().appendChild(div);
  scrollBottom();
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => {
    const active = t.getAttribute('onclick').includes(tab);
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active);
  });
  document.getElementById('tab-chat').classList.toggle('hidden', tab !== 'chat');
  document.getElementById('tab-products').classList.toggle('hidden', tab !== 'products');
}

function getBestMimeType() {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Eagerly prompt for keys on first visit
  getKey('anthropic_key', 'Anthropic API Key');
  getKey('speechmatics_key', 'Speechmatics API Key');
  renderProductTable();
});
