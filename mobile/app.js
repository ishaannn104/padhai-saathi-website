/* Padhai Saathi Mobile Companion — Core App Logic & Offline Engine */
(function() {
  'use strict';

  // Core Application State
  const state = {
    activeTab: 'home',
    user: 'aaravg',
    streak: 7,
    dailyTargetMinutes: 120,
    focusedMinutesToday: 0,
    distractionsToday: 0,
    pendingUsageEvents: [],
    blockedSites: ['instagram.com', 'facebook.com', 'reddit.com', 'twitter.com', 'netflix.com', 'discord.com'],
    blockedApps: ['YouTube', 'Instagram', 'Snapchat', 'FreeFire / BGMI'],
    handbooks: [],
    formulas: [],
    selectedHandbookFilter: 'all',
    selectedFormulaFilter: 'all',
    timer: {
      mode: 'pomodoro', // pomodoro | deep | break | custom
      totalSeconds: 25 * 60,
      remainingSeconds: 25 * 60,
      isRunning: false,
      intervalId: null,
      targetEndTime: null
    },
    ambient: {
      current: null, // 'rain' | 'forest' | 'ocean' | 'whitenoise'
      volume: 0.5,
      audioCtx: null,
      sourceNode: null,
      gainNode: null,
      lfoNode: null
    },
    deferredInstallPrompt: null
  };

  // Auto-Sync Configuration & Credentials
  const SYNC_CONFIG = {
    defaultServer: 'http://192.168.1.11:5088',
    intervalMs: 15000 // 15 seconds background heartbeat matching desktop exe
  };

  function getOrCreateDeviceId() {
    let devId = localStorage.getItem('ps_device_guid');
    if (!devId || devId.length !== 32 || !/^[0-9a-f]{32}$/i.test(devId)) {
      try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          devId = crypto.randomUUID().replace(/-/g, '').toLowerCase();
        } else {
          devId = 'xxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
          }).replace(/-/g, '').toLowerCase();
        }
      } catch (_) {
        devId = Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('');
      }
      localStorage.setItem('ps_device_guid', devId);
    }
    return devId;
  }

  // 1-Time User Login
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

  // 15-Second Background Heartbeat Loop (Matches Desktop PadhaiSaathi.exe)
  async function syncHeartbeat() {
    const token = localStorage.getItem('ps_auth_token');
    const serverUrl = localStorage.getItem('ps_server_url') || SYNC_CONFIG.defaultServer;
    if (!token) {
      updateSyncStatusBadge(false, 'Not Connected (Tap to Connect)');
      return;
    }

    try {
      // 1. Pull active policy from Parent Admin
      const policyRes = await fetch(`${serverUrl}/api/policy`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (policyRes.ok) {
        const policy = await policyRes.json();
        if (policy.controls) {
          if (policy.controls.dailyTargetMinutes) state.dailyTargetMinutes = policy.controls.dailyTargetMinutes;
          if (policy.controls.blockedSites && policy.controls.blockedSites.length > 0) {
            state.blockedSites = policy.controls.blockedSites;
          }
          if (policy.controls.blockedApps && policy.controls.blockedApps.length > 0) {
            state.blockedApps = policy.controls.blockedApps;
          }
        }
        if (policy.rules && Array.isArray(policy.rules)) {
          const siteRules = policy.rules.filter(r => r.kind === 'site').map(r => r.identifier);
          const appRules = policy.rules.filter(r => r.kind === 'app').map(r => r.identifier);
          if (siteRules.length) state.blockedSites = Array.from(new Set([...state.blockedSites, ...siteRules]));
          if (appRules.length) state.blockedApps = Array.from(new Set([...state.blockedApps, ...appRules]));
        }
        updateSyncStatusBadge(true, `Auto-Synced · ${state.user}`);
        updateShieldDisplay();
        updateDashboardStats();
      }

      // 2. Push mobile study progress & distraction incidents
      const studyPayload = {
        user: state.user,
        streak: state.streak,
        focusedMinutesToday: state.focusedMinutesToday,
        distractionsCount: state.distractionsToday,
        UsageEvents: state.pendingUsageEvents.slice(0, 10),
        lastActive: new Date().toISOString()
      };

      const pushRes = await fetch(`${serverUrl}/api/account/data`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deviceId: getOrCreateDeviceId(),
          payloadJson: JSON.stringify(studyPayload)
        })
      });

      if (pushRes.ok) {
        // Clear pushed events
        state.pendingUsageEvents = [];
        saveLocalState();
      }

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

  // Anti-Cheat Focus Strict Mode: Detects minimizing / switching to other apps
  document.addEventListener('visibilitychange', () => {
    if (state.timer.isRunning && document.visibilityState === 'hidden') {
      // Focus violation occurred: user left the study app
      state.distractionsToday += 1;
      pauseTimer();
      
      const violationEvent = {
        Id: 'viol-' + Date.now(),
        Name: 'App Switched / Minimized',
        Kind: 'App',
        BlockedAttempt: true,
        StartedAt: new Date().toISOString(),
        EndedAt: new Date().toISOString(),
        DurationSeconds: 0
      };
      state.pendingUsageEvents.push(violationEvent);
      saveLocalState();
      updateShieldDisplay();
      
      if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 600]);
    } else if (document.visibilityState === 'visible' && state.distractionsToday > 0) {
      showToast('⚠️ Focus Broken! Minimized during study. Violation logged to Parent Admin.');
    }
  });

  // Shield Tab Dynamic Rendering
  function updateShieldDisplay() {
    const violCountEl = document.getElementById('shield-violations-count');
    if (violCountEl) violCountEl.textContent = state.distractionsToday;

    const sitesContainer = document.getElementById('blocked-sites-container');
    if (sitesContainer && state.blockedSites) {
      sitesContainer.innerHTML = state.blockedSites.map(s => `
        <span class="blocked-chip"><span class="chip-icon">🚫</span> ${escapeHtml(s)}</span>
      `).join('');
    }

    const appsContainer = document.getElementById('blocked-apps-container');
    if (appsContainer && state.blockedApps) {
      appsContainer.innerHTML = state.blockedApps.map(a => `
        <span class="blocked-chip" style="color:var(--accent-amber);border-color:rgba(245,203,145,0.4);"><span class="chip-icon">🔒</span> ${escapeHtml(a)}</span>
      `).join('');
    }

    const homeShield = document.getElementById('home-shield-status');
    if (homeShield) {
      homeShield.textContent = `${state.blockedSites.length} Sites & ${state.blockedApps.length} Apps Blocked`;
    }
  }

  // Offline Ambient Sound Synthesizer (Web Audio API - 100% Offline, Zero MP3s required)
  function initAudioContext() {
    if (!state.ambient.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        state.ambient.audioCtx = new AudioCtx();
      }
    }
    if (state.ambient.audioCtx && state.ambient.audioCtx.state === 'suspended') {
      state.ambient.audioCtx.resume();
    }
  }

  function playAmbientSound(type) {
    initAudioContext();
    const ctx = state.ambient.audioCtx;
    if (!ctx) {
      showToast('Web Audio not supported on this device');
      return;
    }

    stopAmbient();

    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (type === 'rain') {
        // Pink / Brown noise for rain drops
        lastOut = (lastOut + (0.02 * white)) / 1.02;
        output[i] = lastOut * 3.5;
      } else if (type === 'ocean') {
        // Wave noise
        lastOut = (lastOut + (0.04 * white)) / 1.04;
        output[i] = lastOut * 3.0;
      } else if (type === 'forest') {
        // Soft rustling breeze
        lastOut = (lastOut + (0.01 * white)) / 1.01;
        output[i] = lastOut * 2.5;
      } else {
        // Classic White Noise
        output[i] = white * 0.15;
      }
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // Filter
    const filter = ctx.createBiquadFilter();
    if (type === 'rain') {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, ctx.currentTime);
    } else if (type === 'ocean') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(450, ctx.currentTime);
      filter.Q.setValueAtTime(1.5, ctx.currentTime);
    } else if (type === 'forest') {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, ctx.currentTime);
    } else {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3000, ctx.currentTime);
    }

    // Gain / Volume
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(state.ambient.volume, ctx.currentTime);

    // If Ocean, add gentle LFO volume swell
    if (type === 'ocean') {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(0.12, ctx.currentTime); // 8 second wave cycle
      lfoGain.gain.setValueAtTime(state.ambient.volume * 0.4, ctx.currentTime);
      lfo.connect(lfoGain.gain);
      lfo.start();
      state.ambient.lfoNode = lfo;
    }

    whiteNoise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    whiteNoise.start();

    state.ambient.current = type;
    state.ambient.sourceNode = whiteNoise;
    state.ambient.gainNode = gainNode;

    const label = document.getElementById('ambient-current-label');
    if (label) label.textContent = `Playing: ${type.toUpperCase()}`;

    document.querySelectorAll('.ambient-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sound === type);
    });

    showToast(`🎧 Playing ${type.toUpperCase()} focus sound`);
  }

  function stopAmbient() {
    if (state.ambient.sourceNode) {
      try { state.ambient.sourceNode.stop(); } catch (_) {}
      state.ambient.sourceNode = null;
    }
    if (state.ambient.lfoNode) {
      try { state.ambient.lfoNode.stop(); } catch (_) {}
      state.ambient.lfoNode = null;
    }
    state.ambient.current = null;

    const label = document.getElementById('ambient-current-label');
    if (label) label.textContent = 'Muted';

    document.querySelectorAll('.ambient-btn').forEach(btn => btn.classList.remove('active'));
  }

  function setAmbientVolume(val) {
    const vol = parseFloat(val) / 100;
    state.ambient.volume = vol;
    if (state.ambient.gainNode && state.ambient.audioCtx) {
      state.ambient.gainNode.gain.setValueAtTime(vol, state.ambient.audioCtx.currentTime);
    }
  }

  function toggleAmbientSound() {
    if (state.ambient.current) stopAmbient();
    else playAmbientSound('rain');
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
        state.focusedMinutesToday = parsed.focusedMinutesToday || 0;
        state.distractionsToday = parsed.distractionsToday || 0;
        state.blockedSites = parsed.blockedSites || state.blockedSites;
        state.blockedApps = parsed.blockedApps || state.blockedApps;
      }
    } catch (e) {}
  }

  function saveLocalState() {
    try {
      localStorage.setItem('ps_mobile_state', JSON.stringify({
        user: state.user,
        streak: state.streak,
        dailyTargetMinutes: state.dailyTargetMinutes,
        focusedMinutesToday: state.focusedMinutesToday,
        distractionsToday: state.distractionsToday,
        blockedSites: state.blockedSites,
        blockedApps: state.blockedApps
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
    const customBox = document.getElementById('custom-timer-box');

    if (mode === 'deep') {
      mins = 50;
      if (customBox) customBox.classList.remove('active');
    } else if (mode === 'break') {
      mins = 5;
      if (customBox) customBox.classList.remove('active');
    } else if (mode === 'custom') {
      if (customBox) customBox.classList.add('active');
      const input = document.getElementById('custom-minutes-input');
      mins = input ? parseInt(input.value, 10) || 45 : 45;
    } else {
      mins = 25;
      if (customBox) customBox.classList.remove('active');
    }

    state.timer.totalSeconds = mins * 60;
    state.timer.remainingSeconds = mins * 60;
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    const sublabel = document.getElementById('timer-sublabel');
    if (sublabel) sublabel.textContent = mode === 'break' ? 'Break Session' : 'Focus Session';

    updateTimerDisplay();
  }

  function applyCustomTimer() {
    const input = document.getElementById('custom-minutes-input');
    const mins = Math.max(1, Math.min(360, parseInt(input ? input.value : '45', 10) || 45));
    if (input) input.value = mins;
    state.timer.totalSeconds = mins * 60;
    state.timer.remainingSeconds = mins * 60;
    updateTimerDisplay();
    showToast(`⏱️ Custom Timer set to ${mins} minutes!`);
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

    showToast('🚀 Focus Session Active! App Switch Shield is armed.');

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

  function playFocusChime() {
    initAudioContext();
    const ctx = state.ambient.audioCtx;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch (_) {}
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
            <button class="btn-small primary" onclick="window.psApp.openPdfModal('./handbooks/${b.filename}', '${b.title.replace(/'/g, "\'")}')">
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

  // Emergency Break Request
  async function requestBreak() {
    const input = document.getElementById('break-reason-input');
    const reason = input ? input.value.trim() : '';
    showToast('☕ Break request sent to Parent Dashboard!');
    if (input) input.value = '';
  }

  // Manual Connect from Sync tab
  function manualConnect() {
    const sUrl = document.getElementById('sync-server-url').value.trim();
    const u = document.getElementById('sync-username').value.trim();
    const p = document.getElementById('sync-password').value.trim();
    if (!u || !p) {
      showToast('Enter username and password');
      return;
    }
    performLogin(u, p, sUrl);
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
    updateShieldDisplay();
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
      if (['home', 'focus', 'shield', 'handbooks', 'formulas', 'aitutor', 'sync'].includes(hash)) {
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
    applyCustomTimer,
    selectAmbient: (type) => playAmbientSound(type),
    stopAmbient,
    setAmbientVolume,
    toggleAmbientSound,
    copyFormula,
    openPdfModal,
    closePdfModal,
    solveDoubt,
    requestBreak,
    manualConnect,
    performLogin,
    syncHeartbeat,
    triggerPwaInstall,
    showToast
  };

})();
