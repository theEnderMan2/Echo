// ══════════════════════════════════════════════
//   Echo. — PWA JavaScript
//   Mobile-first, Transformers.js summarization
// ══════════════════════════════════════════════

// ── State ──────────────────────────────────────
let sessions        = JSON.parse(localStorage.getItem('echo_sessions') || '[]');
let activeId        = null;
let isRecording     = false;
let timerSecs       = 0;
let timerInterval   = null;
let transcriptLines = [];
let recognition     = null;
let interim         = '';
let audioCtx        = null;
let analyser        = null;
let micStream       = null;
let vizRaf          = null;
let summarizer      = null;  // Transformers.js pipeline (lazy loaded)
let modelLoading    = false;

// ── DOM ────────────────────────────────────────
const $ = id => document.getElementById(id);

const D = {
  modal:          $('settings-modal'),
  modalSave:      $('modal-save-btn'),
  modalClose:     $('modal-close-btn'),
  modalSession:   $('modal-session-input'),
  sessionName:    $('session-name'),
  settingsBtn:    $('settings-btn'),
  recBtn:         $('rec-btn'),
  recStatus:      $('rec-status'),
  recStatusText:  $('rec-status-text'),
  recSub:         $('rec-sub'),
  recTimer:       $('rec-timer'),
  micSelect:      $('mic-select'),
  viz:            $('viz'),
  liveBadge:      $('live-badge'),
  transcriptBody: $('transcript-body'),
  copyBtn:        $('copy-btn'),
  clearBtn:       $('clear-btn'),
  summarizeBtn:   $('summarize-btn'),
  sumPlaceholder: $('sum-placeholder'),
  summaryContent: $('summary-content'),
  sessionsList:   $('sessions-list'),
  newBtnSessions: $('new-btn-sessions'),
  modelStatus:    $('model-status'),
  modelStatusText:$('model-status-text'),
  modelProgress:  $('model-progress'),
};

// ══════════════════════════════════════════════
//   INIT
// ══════════════════════════════════════════════

async function init() {
  registerSW();
  buildViz();
  await loadDevices();
  renderSessions();
  setupTabs();
}

// ══════════════════════════════════════════════
//   SERVICE WORKER
// ══════════════════════════════════════════════

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ══════════════════════════════════════════════
//   TAB NAVIGATION
// ══════════════════════════════════════════════

function setupTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelector('.tab[data-tab="' + name + '"]').classList.add('active');
}

// ══════════════════════════════════════════════
//   SETTINGS MODAL
// ══════════════════════════════════════════════

D.settingsBtn.onclick = () => {
  D.modalSession.value = D.sessionName.value;
  D.modal.classList.remove('hidden');
};

D.modalSave.onclick = () => {
  const name = D.modalSession.value.trim();
  if (name) {
    D.sessionName.value = name;
    const s = sessions.find(x => x.id === activeId);
    if (s) { s.name = name; saveSessions(); renderSessions(); }
  }
  D.modal.classList.add('hidden');
};

D.modalClose.onclick = () => D.modal.classList.add('hidden');

D.modal.onclick = e => { if (e.target === D.modal) D.modal.classList.add('hidden'); };

// ══════════════════════════════════════════════
//   AUDIO DEVICES
// ══════════════════════════════════════════════

async function loadDevices() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const devs = await navigator.mediaDevices.enumerateDevices();
    const inputs = devs.filter(d => d.kind === 'audioinput');
    D.micSelect.innerHTML = inputs
      .map(d => `<option value="${d.deviceId}">${d.label || 'Microphone'}</option>`)
      .join('');
  } catch (e) {
    D.micSelect.innerHTML = '<option>Mic permission denied</option>';
  }
}

// ══════════════════════════════════════════════
//   SESSIONS
// ══════════════════════════════════════════════

function saveSessions() {
  localStorage.setItem('echo_sessions', JSON.stringify(sessions));
}

function renderSessions() {
  if (!sessions.length) {
    D.sessionsList.innerHTML = '<div class="empty-list">No sessions yet.<br/>Tap New to begin.</div>';
    return;
  }

  D.sessionsList.innerHTML = '<div class="sec-label">Recent</div>' +
    sessions.map(s => `
      <div class="s-item ${s.id === activeId ? 'active' : ''}" data-id="${s.id}">
        <div class="s-item-main">
          <div class="s-title">${esc(s.name || 'Untitled')}</div>
          <div class="s-meta">${fmtDate(s.savedAt)} · ${(s.lines || []).length} lines</div>
        </div>
        <button class="s-del" data-id="${s.id}" aria-label="Delete">×</button>
      </div>
    `).join('');

  D.sessionsList.querySelectorAll('.s-item').forEach(el => {
    el.onclick = e => {
      if (e.target.classList.contains('s-del')) return;
      openSession(sessions.find(s => s.id === el.dataset.id));
      switchTab('record');
    };
  });

  D.sessionsList.querySelectorAll('.s-del').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      if (!confirm('Delete this session?')) return;
      sessions = sessions.filter(s => s.id !== btn.dataset.id);
      saveSessions();
      if (activeId === btn.dataset.id) {
        activeId = null;
        transcriptLines = [];
        renderTranscript();
        D.sessionName.value = '';
        D.sumPlaceholder.style.display = 'flex';
        D.summaryContent.style.display = 'none';
      }
      renderSessions();
    };
  });
}

function openSession(s) {
  activeId = s.id;
  transcriptLines = s.lines || [];
  D.sessionName.value = s.name || '';
  renderTranscript();
  if (s.summary) showSummary(s.summary);
  else {
    D.sumPlaceholder.style.display = 'flex';
    D.summaryContent.style.display = 'none';
  }
  renderSessions();
}

function newSession() {
  const s = { id: Date.now().toString(), name: '', lines: [], savedAt: new Date().toISOString() };
  sessions.unshift(s);
  saveSessions();
  openSession(s);
  D.sessionName.focus();
  renderSessions();
}

D.newBtnSessions.onclick = () => { newSession(); switchTab('record'); };

D.sessionName.oninput = () => {
  const s = sessions.find(x => x.id === activeId);
  if (s) { s.name = D.sessionName.value; saveSessions(); renderSessions(); }
};

// ══════════════════════════════════════════════
//   RECORDING
// ══════════════════════════════════════════════

D.recBtn.addEventListener('click', () => { isRecording ? stopRecording() : startRecording(); });

async function startRecording() {
  if (!activeId) newSession();

  isRecording = true;
  D.recBtn.classList.add('recording');
  D.recBtn.textContent = '⏹';
  D.recStatus.classList.add('live');
  D.recStatusText.textContent = 'Recording…';
  D.recSub.textContent = 'Capturing audio — speak clearly';
  D.liveBadge.style.display = 'inline';

  timerSecs = 0;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timerSecs++;
    const m = Math.floor(timerSecs / 60);
    const sec = String(timerSecs % 60).padStart(2, '0');
    D.recTimer.textContent = `${m}:${sec}`;
  }, 1000);

  if (!transcriptLines.length) D.transcriptBody.innerHTML = '';

  startSpeech();
  await startViz();
}

function stopRecording() {
  isRecording = false;
  D.recBtn.classList.remove('recording');
  D.recBtn.textContent = '🎙';
  D.recStatus.classList.remove('live');
  D.recStatusText.textContent = 'Recording stopped';
  D.recSub.textContent = `${transcriptLines.length} lines captured · Tap Summary for AI breakdown`;
  D.liveBadge.style.display = 'none';
  clearInterval(timerInterval);
  stopSpeech();
  stopViz();
  autoSave();
}

// ══════════════════════════════════════════════
//   SPEECH RECOGNITION
// ══════════════════════════════════════════════

function startSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    addLine('System', '⚠ Speech recognition not available. Please open Echo in Safari on iOS.');
    return;
  }

  recognition = new SR();
  recognition.continuous      = true;
  recognition.interimResults  = true;
  recognition.lang            = 'en-US';

  recognition.onresult = e => {
    let fin = '', int = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      e.results[i].isFinal ? fin += t : int += t;
    }
    if (fin.trim()) addLine('You', fin.trim());
    interim = int;
    renderInterim();
  };

  recognition.onerror = e => {
    if (e.error === 'not-allowed') {
      addLine('System', '⚠ Microphone access denied. Allow in Settings → Safari → Microphone.');
      stopRecording();
    } else if (e.error !== 'no-speech') {
      console.warn('Speech error:', e.error);
    }
  };

  recognition.onend = () => { if (isRecording) { try { recognition.start(); } catch(e) {} } };

  try { recognition.start(); } catch(e) {}
}

function stopSpeech() {
  if (recognition) { try { recognition.stop(); } catch(e) {} recognition = null; }
  interim = '';
  document.querySelector('.interim-line')?.remove();
}

function addLine(speaker, text) {
  const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  transcriptLines.push({ speaker, text, ts });

  const div = document.createElement('div');
  div.className = 't-line';
  div.innerHTML = `
    <div class="t-speaker ${speaker === 'You' ? 'you' : speaker === 'Them' ? 'them' : ''}">
      ${speaker !== 'System' ? `${speaker} · ${ts}` : ''}
    </div>
    <div class="t-text">${esc(text)}</div>
  `;
  document.querySelector('.interim-line')?.remove();
  D.transcriptBody.appendChild(div);
  D.transcriptBody.scrollTop = D.transcriptBody.scrollHeight;
}

function renderInterim() {
  document.querySelector('.interim-line')?.remove();
  if (!interim) return;
  const div = document.createElement('div');
  div.className = 't-line interim-line';
  div.innerHTML = `<div class="t-speaker"></div><div class="t-text interim">${esc(interim)}</div>`;
  D.transcriptBody.appendChild(div);
  D.transcriptBody.scrollTop = D.transcriptBody.scrollHeight;
}

function renderTranscript() {
  if (!transcriptLines.length) {
    D.transcriptBody.innerHTML = `
      <div class="placeholder">
        <div class="placeholder-icon">🎙</div>
        <div class="placeholder-text">Tap record to start capturing.<br/>Your transcript appears here in real time.</div>
      </div>`;
    return;
  }
  D.transcriptBody.innerHTML = transcriptLines.map(l => `
    <div class="t-line">
      <div class="t-speaker ${l.speaker === 'You' ? 'you' : 'them'}">${l.speaker} · ${l.ts}</div>
      <div class="t-text">${esc(l.text)}</div>
    </div>
  `).join('');
  D.transcriptBody.scrollTop = D.transcriptBody.scrollHeight;
}

// ══════════════════════════════════════════════
//   AUDIO VISUALIZER
// ══════════════════════════════════════════════

function buildViz() {
  D.viz.innerHTML = '';
  for (let i = 0; i < 40; i++) {
    const b = document.createElement('div');
    b.className = 'vbar';
    D.viz.appendChild(b);
  }
}

async function startViz() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: D.micSelect.value ? { deviceId: { exact: D.micSelect.value } } : true
    });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    audioCtx.createMediaStreamSource(micStream).connect(analyser);
    animViz();
  } catch(e) {}
}

function animViz() {
  const bars = D.viz.querySelectorAll('.vbar');
  const data = new Uint8Array(analyser.frequencyBinCount);
  const frame = () => {
    if (!isRecording) return;
    analyser.getByteFrequencyData(data);
    bars.forEach((b, i) => {
      const v = data[i] / 255;
      b.style.height  = Math.max(3, v * 26) + 'px';
      b.style.opacity = Math.max(0.15, v * 0.85);
    });
    vizRaf = requestAnimationFrame(frame);
  };
  frame();
}

function stopViz() {
  cancelAnimationFrame(vizRaf);
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (audioCtx)  { audioCtx.close(); audioCtx = null; }
  D.viz.querySelectorAll('.vbar').forEach(b => { b.style.height = '3px'; b.style.opacity = '0.2'; });
}

// ══════════════════════════════════════════════
//   COPY & CLEAR
// ══════════════════════════════════════════════

D.copyBtn.onclick = () => {
  const text = transcriptLines.map(l => `[${l.ts}] ${l.speaker}: ${l.text}`).join('\n');
  navigator.clipboard.writeText(text).then(() => {
    D.copyBtn.textContent = '✓ Copied!';
    setTimeout(() => D.copyBtn.textContent = 'Copy', 2000);
  });
};

D.clearBtn.onclick = () => {
  if (!confirm('Clear the transcript?')) return;
  transcriptLines = [];
  renderTranscript();
};

// ══════════════════════════════════════════════
//   AI SUMMARY — Transformers.js (on-device)
// ══════════════════════════════════════════════

D.summarizeBtn.onclick = async () => {
  if (!transcriptLines.length) {
    alert('Nothing to summarize yet — record a call first!');
    return;
  }

  switchTab('summary');

  D.summarizeBtn.disabled  = true;
  D.summarizeBtn.textContent = '…';
  D.sumPlaceholder.style.display = 'none';
  D.summaryContent.style.display = 'block';
  D.summaryContent.innerHTML = '<div class="ai-dots"><span></span><span></span><span></span></div>';

  try {
    // Lazy-load Transformers.js pipeline on first use
    if (!summarizer) {
      await loadModel();
    }

    const fullText  = transcriptLines.map(l => `${l.speaker}: ${l.text}`).join('\n');
    const youText   = transcriptLines.filter(l => l.speaker === 'You').map(l => l.text).join(' ');

    // Run overview + key points in parallel
    const [overviewRes, keyPointsRes] = await Promise.all([
      summarizer(fullText.slice(0, 1800), { max_new_tokens: 120, min_new_tokens: 30 }),
      summarizer(fullText.slice(0, 1800), { max_new_tokens: 160, min_new_tokens: 50 })
    ]);

    const overview   = overviewRes[0]?.summary_text || overviewRes[0]?.generated_text || '';
    const keyPoints  = keyPointsRes[0]?.summary_text || keyPointsRes[0]?.generated_text || '';

    // Action items — extract from "You" sentences with action verbs
    const actionItems = youText
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => /\b(will|should|need|must|going to|plan|follow|send|schedule|check|review|update|call|email|meet|book)\b/i.test(s) && s.length > 12)
      .slice(0, 4);

    const summary =
      `### Overview\n${overview}\n\n` +
      `### Key Points\n${keyPoints}\n\n` +
      `### Action Items\n${actionItems.length ? actionItems.map(s => `- ${s}`).join('\n') : '- No clear action items detected.'}\n\n` +
      `### Sentiment\nSummary generated on-device using Xenova/distilbart-cnn-12-6.`;

    showSummary(summary);
    const s = sessions.find(x => x.id === activeId);
    if (s) { s.summary = summary; saveSessions(); }

  } catch(e) {
    D.summaryContent.innerHTML = `<p style="color:var(--red)">Error: ${esc(e.message)}</p>`;
    console.error(e);
  }

  D.summarizeBtn.disabled  = false;
  D.summarizeBtn.textContent = 'Summarize';
};

async function loadModel() {
  if (modelLoading) return;
  modelLoading = true;

  D.modelStatus.classList.remove('hidden');
  D.modelStatusText.textContent = 'Downloading AI model (~50 MB)…';
  D.modelProgress.style.width = '0%';

  // Dynamically import Transformers.js from CDN
  const { pipeline, env } = await import(
    'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js'
  );

  // Use local cache when available (service worker will cache the model files)
  env.allowLocalModels = false;
  env.useBrowserCache  = true;

  summarizer = await pipeline('summarization', 'Xenova/distilbart-cnn-12-6', {
    progress_callback: ({ status, progress }) => {
      if (status === 'downloading') {
        const pct = Math.round(progress || 0);
        D.modelProgress.style.width = pct + '%';
        D.modelStatusText.textContent = `Downloading AI model… ${pct}%`;
      }
      if (status === 'ready') {
        D.modelProgress.style.width = '100%';
        D.modelStatusText.textContent = 'Model ready ✓';
        setTimeout(() => D.modelStatus.classList.add('hidden'), 1500);
      }
    }
  });

  modelLoading = false;
}

function showSummary(text) {
  D.sumPlaceholder.style.display = 'none';
  D.summaryContent.style.display = 'block';

  const html = text
    .replace(/### (.+)/g, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\s*[-•*]\s+(.+)/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[hup])(.+)$/gm, m => m.startsWith('<') ? m : `<p>${m}</p>`);

  D.summaryContent.innerHTML = html;
}

// ══════════════════════════════════════════════
//   AUTO SAVE
// ══════════════════════════════════════════════

function autoSave() {
  const s = sessions.find(x => x.id === activeId);
  if (!s) return;
  s.lines   = transcriptLines;
  s.name    = D.sessionName.value || 'Untitled';
  s.savedAt = new Date().toISOString();
  saveSessions();
  renderSessions();
}

// ══════════════════════════════════════════════
//   UTILITIES
// ══════════════════════════════════════════════

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date(), diff = now - d;
  if (diff < 60000)    return 'just now';
  if (diff < 3600000)  return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Start ──
init();
