// Padhai Saathi Mobile PWA Application Logic
(function() {
  'use strict';

  // State Management
  const state = {
    user: 'Student',
    streak: 7,
    dailyTargetMinutes: 180,
    focusedMinutesToday: 0,
    activeTab: 'home',
    timer: {
      mode: 'pomodoro', // pomodoro (25), deep (50), break (5)
      totalSeconds: 25 * 60,
      remainingSeconds: 25 * 60,
      isRunning: false,
      intervalId: null,
      targetEndTime: null
    },
    handbooks: [],
    formulas: [],
    selectedHandbookFilter: 'all',
    selectedFormulaFilter: 'all',
    deferredInstallPrompt: null
  };

  // Audio Chime Synthesizer using Web Audio API
  function playFocusChime() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 (Harmonic Chord)
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        
        const startTime = ctx.currentTime + (idx * 0.12);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.2);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 1.3);
      });
    } catch (e) {
      console.log('Audio chime error:', e);
    }
  }

  
  // Auto-Sync Configuration & Credentials
  const SYNC_CONFIG = {
    defaultServer: 'http://192.168.1.11:5088',
    intervalMs: 15000 // 15 seconds background heartbeat like desktop exe
  };

  async function performLogin(username, password, serverUrl) {
    serverUrl = serverUrl || localStorage.getItem('ps_server_url') || SYNC_CONFIG.defaultServer;
    serverUrl = serverUrl.replace(/\/+$/, '');
    try {
      showToast('Connecting to Padhai Saathi Server...');
      const res = await fetch(`${serverUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast('Login failed: ' + (err.error || res.statusText));
        return false;
      }
      const data = await res.json();
      localStorage.setItem('ps_auth_token', data.accessToken);
      localStorage.setItem('ps_auth_user', data.username);
      localStorage.setItem('ps_server_url', serverUrl);
      state.user = data.username;
      saveLocalState();
      updateDashboardStats();
      updateSyncStatusBadge(true, `Auto-Synced · ${data.username}`);
      showToast(`⚡ Connected as ${data.username}! Auto-Syncing Active.`);
      
      // Immediate sync
      syncHeartbeat();
      return true;
    } catch (e) {
      showToast('Could not reach server at ' + serverUrl + '. Check Wi-Fi connection.');
      return false;
    }
  }

  async function syncHeartbeat() {
    const token = localStorage.getItem('ps_auth_token');
    const serverUrl = localStorage.getItem('ps_server_url') || SYNC_CONFIG.defaultServer;
    if (!token) {
      updateSyncStatusBadge(false, 'Not Connected (Tap to Connect)');
      return;
    }

    try {
      // 1. Pull policy
      const policyRes = await fetch(`${serverUrl}/api/policy`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (policyRes.ok) {
        const policy = await policyRes.json();
        if (policy.controls) {
          if (policy.controls.dailyTargetMinutes) state.dailyTargetMinutes = policy.controls.dailyTargetMinutes;
        }
        updateSyncStatusBadge(true, `Auto-Synced · ${state.user}`);
      }

      // 2. Push mobile study progress
      const studyPayload = {
        user: state.user,
        streak: state.streak,
        focusedMinutesToday: state.focusedMinutesToday,
        lastActive: new Date().toISOString()
      };
      await fetch(`${serverUrl}/api/account/data`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deviceId: 'android-mobile-' + (localStorage.getItem('ps_device_id') || '01'),
          payloadJson: JSON.stringify(studyPayload)
        })
      });

      const lastSyncEl = document.getElementById('last-sync-time');
      if (lastSyncEl) {
        const now = new Date();
        lastSyncEl.textContent = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      }
    } catch (e) {
      updateSyncStatusBadge(false, 'Offline Mode (Local Cache Active)');
    }
  }

  function updateSyncStatusBadge(isOnline, text) {
    const badge = document.getElementById('sync-header-badge');
    const dot = document.getElementById('sync-header-dot');
    const label = document.getElementById('sync-header-label');
    if (dot) dot.style.background = isOnline ? '#64FFDA' : '#F5CB91';
    if (label) label.textContent = isOnline ? 'Synced' : 'Offline';
    
    const panelStatus = document.getElementById('panel-sync-status');
    if (panelStatus) {
      panelStatus.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${isOnline ? '#64FFDA' : '#F5CB91'};margin-right:6px;"></span> ${text}`;
    }
  }

// Load Saved Data from LocalStorage
  function loadLocalState() {
    try {
      const saved = localStorage.getItem('ps_mobile_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        state.user = parsed.user || state.user;
        state.streak = parsed.streak || state.streak;
        state.dailyTargetMinutes = parsed.dailyTargetMinutes || state.dailyTargetMinutes;
        state.focusedMinutesToday = parsed.focusedMinutesToday || state.focusedMinutesToday;
      }
    } catch (e) {}

    // Check URL params for Instant 1-Scan QR Sync from PC
    const params = new URLSearchParams(window.location.search);
    let synced = false;
    if (params.get('user')) {
      state.user = params.get('user');
      synced = true;
    }
    if (params.get('streak')) {
      state.streak = parseInt(params.get('streak'), 10) || state.streak;
      synced = true;
    }
    if (params.get('target')) {
      state.dailyTargetMinutes = parseInt(params.get('target'), 10) || state.dailyTargetMinutes;
      synced = true;
    }
    if (params.get('focus')) {
      state.focusedMinutesToday = parseInt(params.get('focus'), 10) || state.focusedMinutesToday;
      synced = true;
    }

    if (synced) {
      saveLocalState();
      // Clean URL without reloading
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
      showToast(`⚡ Synced with ${state.user}'s Desktop PC!`);
    }
  }

  function saveLocalState() {
    try {
      localStorage.setItem('ps_mobile_state', JSON.stringify({
        user: state.user,
        streak: state.streak,
        dailyTargetMinutes: state.dailyTargetMinutes,
        focusedMinutesToday: state.focusedMinutesToday
      }));
    } catch (e) {}
  }

  // UI Toast Message
  function showToast(msg) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#211727;border:1px solid #FF72B2;color:#FFF;padding:10px 18px;border-radius:9999px;font-size:13px;font-weight:700;box-shadow:0 6px 20px rgba(0,0,0,0.5);z-index:9999;transition:opacity 0.3s;pointer-events:none;';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 2600);
  }

  // Tab Switching
  function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.tab-content').forEach(tab => {
      tab.classList.toggle('active', tab.id === `tab-${tabId}`);
    });
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    window.location.hash = tabId;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Focus Timer Logic
  const CIRCLE_RADIUS = 105;
  const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

  function setTimerMode(mode) {
    if (state.timer.isRunning) pauseTimer();
    state.timer.mode = mode;
    let mins = 25;
    if (mode === 'deep') mins = 50;
    else if (mode === 'break') mins = 5;

    state.timer.totalSeconds = mins * 60;
    state.timer.remainingSeconds = mins * 60;
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    updateTimerDisplay();
  }

  function updateTimerDisplay() {
    const mins = Math.floor(state.timer.remainingSeconds / 60);
    const secs = state.timer.remainingSeconds % 60;
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    
    const displayEl = document.getElementById('timer-display');
    if (displayEl) displayEl.textContent = formatted;
    document.title = state.timer.isRunning ? `(${formatted}) Padhai Saathi` : 'Padhai Saathi';

    const circle = document.getElementById('timer-progress');
    if (circle) {
      const progress = state.timer.remainingSeconds / state.timer.totalSeconds;
      const offset = CIRCLE_CIRCUMFERENCE * (1 - progress);
      circle.style.strokeDashoffset = offset;
    }
  }

  function startTimer() {
    if (state.timer.isRunning) return;
    state.timer.isRunning = true;
    state.timer.targetEndTime = Date.now() + (state.timer.remainingSeconds * 1000);

    const playBtn = document.getElementById('btn-timer-play');
    if (playBtn) playBtn.innerHTML = '❚❚';

    state.timer.intervalId = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.round((state.timer.targetEndTime - now) / 1000));
      state.timer.remainingSeconds = remaining;
      updateTimerDisplay();

      if (remaining <= 0) {
        clearInterval(state.timer.intervalId);
        state.timer.isRunning = false;
        if (playBtn) playBtn.innerHTML = '▶';
        
        // Add to focused minutes
        const minsDone = Math.round(state.timer.totalSeconds / 60);
        state.focusedMinutesToday += minsDone;
        saveLocalState();
        updateDashboardStats();

        playFocusChime();
        showToast(`🎉 Focus Session Complete (+${minsDone} Mins)!`);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
      }
    }, 500);
  }

  function pauseTimer() {
    if (!state.timer.isRunning) return;
    clearInterval(state.timer.intervalId);
    state.timer.isRunning = false;
    const playBtn = document.getElementById('btn-timer-play');
    if (playBtn) playBtn.innerHTML = '▶';
  }

  function toggleTimer() {
    if (state.timer.isRunning) pauseTimer();
    else startTimer();
  }

  function resetTimer() {
    pauseTimer();
    state.timer.remainingSeconds = state.timer.totalSeconds;
    updateTimerDisplay();
  }

  // Dashboard Stats Update
  function updateDashboardStats() {
    const userEl = document.getElementById('dash-user-name');
    if (userEl) userEl.textContent = state.user;

    const streakEl = document.getElementById('streak-count');
    if (streakEl) streakEl.textContent = `${state.streak} Days`;

    const focusMinsEl = document.getElementById('stat-focus-mins');
    if (focusMinsEl) focusMinsEl.textContent = `${state.focusedMinutesToday}m`;

    const targetMinsEl = document.getElementById('stat-target-mins');
    if (targetMinsEl) targetMinsEl.textContent = `${state.dailyTargetMinutes}m`;

    const progressPct = Math.min(100, Math.round((state.focusedMinutesToday / state.dailyTargetMinutes) * 100));
    const pctEl = document.getElementById('stat-progress-pct');
    if (pctEl) pctEl.textContent = `${progressPct}%`;
  }

  // Handbooks Rendering
  async function loadHandbooks() {
    try {
      const res = await fetch('./handbooks.json');
      state.handbooks = await res.json();
    } catch (e) {
      console.log('Using offline handbook cache');
    }
    renderHandbooks();
  }

  function renderHandbooks() {
    const listEl = document.getElementById('handbooks-list');
    if (!listEl) return;

    const filter = state.selectedHandbookFilter.toLowerCase();
    const filtered = state.handbooks.filter(b => {
      if (filter === 'all') return true;
      if (filter === '11th') return b.level.includes('11');
      if (filter === '12th') return b.level.includes('12');
      if (filter === 'jee') return b.level.toLowerCase().includes('jee');
      if (filter === 'boards') return b.level.toLowerCase().includes('board');
      return true;
    });

    listEl.innerHTML = filtered.map(b => {
      let tagClass = 'p11';
      if (b.level.includes('12')) tagClass = 'p12';
      else if (b.level.toLowerCase().includes('jee')) tagClass = 'jee';
      else if (b.level.toLowerCase().includes('board')) tagClass = 'board';

      return `
        <div class="item-card">
          <div class="item-card-header">
            <span class="item-level-tag ${tagClass}">${b.level} · ${b.subject}</span>
            <span style="font-size:11px;color:var(--text-muted);">${b.pages} Pages</span>
          </div>
          <div class="item-title">${b.title}</div>
          <div class="item-desc">${b.description}</div>
          <div class="item-actions">
            <button class="btn-small primary" onclick="window.psApp.openPdfModal('./handbooks/${b.filename}', '${b.title.replace(/'/g, "\\'")}')">
              📖 Read in App
            </button>
            <a class="btn-small" href="./handbooks/${b.filename}" download target="_blank">
              ⬇ Download PDF
            </a>
          </div>
        </div>
      `;
    }).join('');
  }

  // Formula Hub Rendering
  async function loadFormulas() {
    try {
      const res = await fetch('./formulas.json');
      state.formulas = await res.json();
    } catch (e) {
      console.log('Using offline formula cache');
    }
    renderFormulas();
  }

  function renderFormulas() {
    const listEl = document.getElementById('formulas-list');
    const searchInput = document.getElementById('formula-search');
    if (!listEl) return;

    const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
    const filter = state.selectedFormulaFilter.toLowerCase();

    const filtered = state.formulas.filter(f => {
      const matchSubject = filter === 'all' || f.subject.toLowerCase() === filter;
      const matchSearch = !query || 
        f.title.toLowerCase().includes(query) || 
        f.topic.toLowerCase().includes(query) || 
        f.formula.toLowerCase().includes(query) ||
        (f.notes && f.notes.toLowerCase().includes(query));
      return matchSubject && matchSearch;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-muted);">No formulas found matching "${query}".</div>`;
      return;
    }

    listEl.innerHTML = filtered.slice(0, 40).map(f => `
      <div class="item-card">
        <div class="item-card-header">
          <span class="item-level-tag p12">${f.subject} · ${f.topic}</span>
          <span style="font-size:11px;color:var(--text-muted);">${f.level || 'Class 11/12'}</span>
        </div>
        <div class="item-title">${f.title}</div>
        <div class="item-formula-box">${escapeHtml(f.formula)}</div>
        ${f.notes ? `<div class="item-desc">${escapeHtml(f.notes)}</div>` : ''}
        <div class="item-actions">
          <button class="btn-small" onclick="window.psApp.copyFormula(\`${escapeFormulaForCopy(f.formula)}\`)">
            📋 Copy Formula
          </button>
        </div>
      </div>
    `).join('');
  }

  function escapeHtml(text) {
    return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeFormulaForCopy(text) {
    return (text || '').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
  }

  function copyFormula(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('📋 Formula Copied to Clipboard!');
    }).catch(() => {
      showToast('Failed to copy');
    });
  }

  // PDF Modal Viewer
  function openPdfModal(url, title) {
    const modal = document.getElementById('pdf-modal');
    const iframe = document.getElementById('pdf-frame');
    const titleEl = document.getElementById('modal-pdf-title');
    if (!modal || !iframe) return;

    titleEl.textContent = title;
    iframe.src = url;
    modal.style.display = 'flex';
  }

  function closePdfModal() {
    const modal = document.getElementById('pdf-modal');
    const iframe = document.getElementById('pdf-frame');
    if (modal && iframe) {
      iframe.src = 'about:blank';
      modal.style.display = 'none';
    }
  }

  // AI Doubt Solver Simulation / Local Engine
  function solveDoubt() {
    const input = document.getElementById('tutor-input');
    const levelSelect = document.getElementById('tutor-level');
    const resultBox = document.getElementById('tutor-solution');
    const resultText = document.getElementById('tutor-solution-text');
    if (!input || !resultBox || !resultText) return;

    const query = input.value.trim();
    if (!query) {
      showToast('Please type your question or doubt first!');
      return;
    }

    const examLevel = levelSelect ? levelSelect.value : 'CBSE Boards';
    resultBox.style.display = 'block';
    resultText.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;color:var(--accent-mint);font-weight:700;">
        <span>✦</span> Solving according to <strong>${examLevel}</strong> pattern...
      </div>
      <div style="font-size:13px;line-height:1.6;color:var(--text-soft);">
        <p><strong>Step 1: Given Data &amp; Core Concept:</strong></p>
        <p style="margin:4px 0 10px 0;padding:8px;background:var(--bg-deep);border-radius:6px;font-family:monospace;color:var(--accent-pink);">
          Identified Question: "${escapeHtml(query)}"
        </p>
        <p><strong>Step 2: Applicable Law / Master Formula:</strong></p>
        <p style="margin:4px 0 10px 0;color:var(--accent-mint);">
          Check standard formula from Padhai Saathi Compendium. Ensure SI units consistency.
        </p>
        <p><strong>Step 3: Marking Rubric &amp; Step Allocation (${examLevel}):</strong></p>
        <ul style="margin:4px 0 10px 18px;">
          <li>✓ Writing formula &amp; diagram: +1 Mark</li>
          <li>✓ Correct algebraic substitution: +1.5 Marks</li>
          <li>✓ Final numerical answer with unit: +0.5 Mark</li>
        </ul>
        <div style="margin-top:12px;padding:8px 12px;background:rgba(255,114,178,0.12);border-radius:6px;border:1px solid rgba(255,114,178,0.3);font-size:12px;color:var(--text-main);">
          💡 <strong>Topper Tip:</strong> Always underline the final answer with its standard units in the examination copy.
        </div>
      </div>
    `;
    showToast('✦ Solution Generated!');
  }

  // PWA Install Prompt Interceptor
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    const banner = document.getElementById('install-banner');
    if (banner) banner.style.display = 'flex';
  });

  function triggerPwaInstall() {
    if (state.deferredInstallPrompt) {
      state.deferredInstallPrompt.prompt();
      state.deferredInstallPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          showToast('🚀 Padhai Saathi Installed to Home Screen!');
          const banner = document.getElementById('install-banner');
          if (banner) banner.style.display = 'none';
        }
        state.deferredInstallPrompt = null;
      });
    } else {
      showToast('Tap browser menu (⋮) -> "Add to Home screen" to install!');
    }
  }

  // Initialization
  document.addEventListener('DOMContentLoaded', () => {
    loadLocalState();
    // Start background auto-sync heartbeat (every 15s, matching desktop exe)
    syncHeartbeat();
    setInterval(syncHeartbeat, SYNC_CONFIG.intervalMs);

    updateDashboardStats();
    setTimerMode('pomodoro');
    loadHandbooks();
    loadFormulas();

    // Register Service Worker for Offline PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then(() => {
        console.log('Padhai Saathi Mobile PWA Service Worker Registered');
      }).catch(err => console.log('SW registration error:', err));
    }

    // Hash navigation
    if (window.location.hash) {
      const hash = window.location.hash.replace('#', '');
      if (['home', 'focus', 'handbooks', 'formulas', 'aitutor', 'sync'].includes(hash)) {
        switchTab(hash);
      }
    }

    // Attach event listeners
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => setTimerMode(btn.dataset.mode));
    });

    const playBtn = document.getElementById('btn-timer-play');
    if (playBtn) playBtn.addEventListener('click', toggleTimer);

    const resetBtn = document.getElementById('btn-timer-reset');
    if (resetBtn) resetBtn.addEventListener('click', resetTimer);

    // Handbook filter chips
    document.querySelectorAll('.hb-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.hb-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.selectedHandbookFilter = chip.dataset.filter;
        renderHandbooks();
      });
    });

    // Formula filter chips
    document.querySelectorAll('.fm-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.fm-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.selectedFormulaFilter = chip.dataset.filter;
        renderFormulas();
      });
    });

    const formulaSearch = document.getElementById('formula-search');
    if (formulaSearch) {
      formulaSearch.addEventListener('input', renderFormulas);
    }
  });

  // Public API attached to window
  window.psApp = {
    switchTab,
    toggleTimer,
    resetTimer,
    setTimerMode,
    copyFormula,
    openPdfModal,
    closePdfModal,
    solveDoubt,
    triggerPwaInstall,
    showToast
  };

})();
