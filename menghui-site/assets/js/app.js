/* ══════════════════════════════════════════════════════════════
   Sylcla · 交互脚本
   开屏 / 六板块 / 自定义档案 / 增删改 / 本地存储 / 氛围动效
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const S = window.SYLCLA;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const MODULES = S.modules;
  const MOD_IDS = MODULES.filter((m) => m.id !== 'anniversary').map((m) => m.id);
  const MOD_BY_ID = {};
  MODULES.forEach((m) => { MOD_BY_ID[m.id] = m; });
  const ENTRY_KEYS = ['daily', 'mail', 'space', 'calls'];

  const MONTH_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const WEATHER_ICON = { 晴: '☀', 雨: '☂', 雪: '❄', 阴: '☁', 雾: '≋', 夜: '☾' };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    data: null,
    tab: 'home',
    composer: null,
    viewer: null,
    lastFocus: null,
    storageOK: true,
    toastTimer: null,
    splashTimers: [],
    splashDone: false,
    replays: 0,
    scrollLocked: false,
    lockY: 0,
    admin: false,
    chatUnlocked: false,
    gatePurpose: 'admin',
    pendingAction: null,
    bgm: null,
    ocrWorker: null,
    ocrProgress: null,
    paddle: null,
    paddlePromise: null,
    chat: null,
    importToken: 0,
    importUrls: []
  };

  /* ══════════════════ 工具 ══════════════════ */

  const pad = (n, len) => String(n).padStart(len || 2, '0');

  function uid(prefix) {
    return `${prefix || 'id'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function parseDate(str) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(str || Date.now());
    return isNaN(d.getTime()) ? new Date() : d;
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function fmtDot(str) {
    const d = parseDate(str);
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  }

  function fmtCN(str) {
    const d = parseDate(str);
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${WEEKDAY_CN[d.getDay()]}`;
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function truncate(text, n) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? `${s.slice(0, n)}…` : s;
  }

  function parseTags(value) {
    return String(value || '')
      .split(/[\/,，、;；]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  function compressImage(file, max, quality) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const limit = max || 900;
          const ratio = Math.min(1, limit / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * ratio));
          const h = Math.max(1, Math.round(img.height * ratio));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('no canvas context');
          ctx.fillStyle = '#080506';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality || 0.82));
        } catch (e) {
          reject(e);
        }
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('image load failed'));
      };
      img.src = url;
    });
  }

  function toast(msg) {
    const node = $('#toast');
    if (!node) return;
    node.textContent = msg;
    node.classList.add('is-on');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => node.classList.remove('is-on'), 2800);
  }

  function sortByDate(list) {
    return list.slice().sort((a, b) => {
      const da = parseDate(a.date).getTime();
      const db = parseDate(b.date).getTime();
      return db - da || String(b.id).localeCompare(String(a.id));
    });
  }

  function partnerName() {
    const c = state.data.dossiers.find((x) => x.id === 'qinche') || state.data.dossiers[0];
    return c ? c.name : '秦彻';
  }

  function findEntry(moduleId, id) {
    return (state.data[moduleId] || []).find((x) => x.id === id) || null;
  }

  /* ══════════════════ 存储 ══════════════════ */

  function blankData() {
    return { dossiers: [], lore: [], daily: [], mail: [], space: [], calls: [], anniversary: [] };
  }

  function defaultDossiers() {
    return (S.dossiers || []).map((p) => Object.assign({}, p, { tags: (p.tags || []).slice() }));
  }

  function defaultLore() {
    return (S.lore || []).map((p) => Object.assign({}, p, { tags: (p.tags || []).slice() }));
  }

  function migrate(parsed) {
    const data = blankData();

    let source = [];
    if (Array.isArray(parsed.dossiers)) source = parsed.dossiers;
    else if (Array.isArray(parsed.characters)) source = parsed.characters;
    else if (Array.isArray(parsed.lore)) source = parsed.lore.filter((x) => x.id === 'chunbao' || x.id === 'qinche');

    data.dossiers = defaultDossiers().map((def) => {
      const found = source.find((x) => x.id === def.id);
      if (!found) return def;
      const mapped = Object.assign({}, found);
      if (!mapped.en && mapped.subtitle) mapped.en = mapped.subtitle;
      if (!mapped.intro && mapped.desc) mapped.intro = mapped.desc;
      if (!Array.isArray(mapped.experience)) mapped.experience = [];
      delete mapped.subtitle;
      delete mapped.body;
      delete mapped.desc;
      delete mapped.kind;
      delete mapped.emblems;
      delete mapped.emblem;
      return Object.assign({}, def, mapped);
    });

    data.lore = Array.isArray(parsed.lore)
      ? parsed.lore.filter((x) => x.id !== 'chunbao' && x.id !== 'qinche')
      : [];

    ENTRY_KEYS.forEach((key) => {
      if (Array.isArray(parsed[key])) data[key] = parsed[key];
    });
    data.anniversary = Array.isArray(parsed.anniversary) ? parsed.anniversary : [];
    data.calls = data.calls.map((c) => (c && c.direction === '聊天' ? Object.assign({}, c, { direction: '拨出' }) : c));

    return data;
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(S.storageKey);
      if (raw === null) {
        const data = blankData();
        data.dossiers = defaultDossiers();
        data.lore = defaultLore();
        try { localStorage.setItem(S.storageKey, JSON.stringify(data)); } catch (e) { state.storageOK = false; }
        return data;
      }
      const parsed = JSON.parse(raw);
      try {
        if (!localStorage.getItem('sylcla.backup.v1')) localStorage.setItem('sylcla.backup.v1', raw);
      } catch (e) { /* ignore */ }
      const data = migrate(parsed);
      try { localStorage.setItem(S.storageKey, JSON.stringify(data)); } catch (e) { state.storageOK = false; }
      return data;
    } catch (e) {
      state.storageOK = false;
      const fallback = blankData();
      fallback.dossiers = defaultDossiers();
      fallback.lore = defaultLore();
      return fallback;
    }
  }

  function persist() {
    if (!state.storageOK) return;
    try {
      localStorage.setItem(S.storageKey, JSON.stringify(state.data));
    } catch (e) {
      state.storageOK = false;
      toast('浏览器拒绝保存 · 本次内容仅存在于当前页面');
    }
  }

  /* ══════════════════ 滚动锁定 ══════════════════ */

  function lockScroll() {
    if (state.scrollLocked) return;
    state.lockY = window.scrollY || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${state.lockY}px`;
    document.body.style.width = '100%';
    state.scrollLocked = true;
  }

  function unlockScroll() {
    if (!state.scrollLocked) return;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    state.scrollLocked = false;
    window.scrollTo(0, state.lockY);
  }

  /* ══════════════════ 访客 / 管理员 ══════════════════ */

  const ADMIN_PASSWORD = '20240715';

  function setAdmin(on) {
    state.admin = !!on;
    try {
      if (on) sessionStorage.setItem('sylcla.admin', '1');
      else sessionStorage.removeItem('sylcla.admin');
    } catch (e) { /* ignore */ }
    const btn = $('#modeBtn');
    if (btn) {
      btn.textContent = on ? '管理' : '访客';
      btn.classList.toggle('is-on', !!on);
      btn.title = on ? '退出管理员模式' : '进入管理员模式';
    }
    document.body.classList.toggle('is-admin', !!on);
    if (!on) state.chatUnlocked = false;
    const dailyCta = $('#heroDailyCta');
    if (dailyCta) dailyCta.textContent = on ? '记录点滴' : '查看点滴';
    applyChatLock();
  }

  function openGate(purpose) {
    const gate = $('#gate');
    if (!gate) return;
    state.gatePurpose = purpose === 'chat' ? 'chat' : 'admin';
    const input = $('#gateInput');
    const err = $('#gateError');
    if (input) input.value = '';
    if (err) err.hidden = true;
    gate.hidden = false;
    lockScroll();
    setTimeout(() => { if (input) input.focus({ preventScroll: true }); }, 60);
  }

  function closeGate() {
    const gate = $('#gate');
    if (gate) gate.hidden = true;
    state.pendingAction = null;
    state.gatePurpose = 'admin';
    unlockScroll();
  }

  function requireAdmin(action) {
    if (state.admin) { action(); return; }
    state.pendingAction = action;
    openGate();
  }

  function submitGate(e) {
    if (e) e.preventDefault();
    const input = $('#gateInput');
    const err = $('#gateError');
    const value = input ? input.value.trim() : '';
    if (value !== ADMIN_PASSWORD) {
      if (err) err.hidden = false;
      if (input) { input.select(); }
      return;
    }
    const action = state.pendingAction;
    state.pendingAction = null;
    const gate = $('#gate');
    if (state.gatePurpose === 'chat' && !state.admin) {
      state.chatUnlocked = true;
      state.gatePurpose = 'admin';
      if (gate) gate.hidden = true;
      unlockScroll();
      applyChatLock();
      toast('聊天记录已解锁');
      return;
    }
    state.gatePurpose = 'admin';
    setAdmin(true);
    if (gate) gate.hidden = true;
    unlockScroll();
    if (action) action();
    toast('已进入管理员模式');
  }

  /* ══════════════════ 开屏动画 ══════════════════ */

  const splash = $('#splash');

  function hasSeenSplash() {
    const forced = new URLSearchParams(location.search).get('splash');
    if (forced === '1') return false;
    if (forced === '0') return true;
    try { return sessionStorage.getItem('sylcla.splash') === '1'; } catch (e) { return false; }
  }

  function markSplashSeen() {
    try { sessionStorage.setItem('sylcla.splash', '1'); } catch (e) { /* ignore */ }
  }

  function restartAnimations(root) {
    $$('*', root).concat([root]).forEach((node) => {
      if (getComputedStyle(node).animationName !== 'none') {
        node.style.animation = 'none';
        void node.offsetWidth;
        node.style.animation = '';
      }
    });
  }

  function clearSplashTimers() {
    state.splashTimers.forEach(clearTimeout);
    state.splashTimers = [];
  }

  function startSplash() {
    if (!splash) return;
    state.splashDone = false;
    state.replays += 1;
    clearSplashTimers();
    splash.hidden = false;
    splash.classList.remove('is-leaving', 'is-stage2', 'is-ready');
    document.body.classList.add('is-locked');
    if (state.replays > 1) restartAnimations(splash);
    void splash.offsetWidth;

    const stage2At = reduceMotion ? 500 : 5200;
    const readyAt = reduceMotion ? 1100 : 8800;

    state.splashTimers.push(setTimeout(() => splash.classList.add('is-stage2'), stage2At));
    state.splashTimers.push(setTimeout(() => {
      splash.classList.add('is-ready');
      const btn = $('#enterSplash');
      if (btn && !reduceMotion) btn.focus({ preventScroll: true });
    }, readyAt));
  }

  /* ══════════════════ 背景音乐 ══════════════════ */

  const BGM_TRACKS = [
    { title: '不设防禁区', artist: '恋与深空', src: 'assets/audio/budang-fang-jinqu.mp3' },
    { title: 'French Movie Waltz', artist: 'Relivka', src: 'assets/audio/french-movie-waltz.mp3' },
    { title: '灰绣球', artist: 'M3mo / Zy', src: 'assets/audio/hui-xiu-qiu.mp3' },
    { title: 'You Are All I Need', artist: 'FLY COAST / 二宮愛', src: 'assets/audio/you-are-all-i-need.mp3' },
    { title: 'Forever', artist: 'The Little Dippers', src: 'assets/audio/forever.mp3' },
    { title: "Trees don't speak", artist: 'Luis Berra', src: 'assets/audio/trees-dont-speak.mp3' }
  ];

  function readBgmIndex() {
    try {
      const n = Number(localStorage.getItem('sylcla.bgm.track'));
      return Number.isInteger(n) && n >= 0 && n < BGM_TRACKS.length ? n : 0;
    } catch (e) { return 0; }
  }

  function saveBgmIndex(index) {
    try { localStorage.setItem('sylcla.bgm.track', String(index)); } catch (e) { /* ignore */ }
  }

  function setupBgm() {
    if (state.bgm) return;
    if (!window.Audio) return;
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = 0.55;
    state.bgm = { audio, index: readBgmIndex(), on: false, started: false, panelDismissed: false };
    audio.addEventListener('ended', () => {
      if (!state.bgm) return;
      playBgm((state.bgm.index + 1) % BGM_TRACKS.length);
    });
    audio.addEventListener('play', () => updateBgmUI());
    audio.addEventListener('pause', () => updateBgmUI());
    audio.addEventListener('error', () => {
      if (!state.bgm) return;
      state.bgm.on = false;
      updateBgmUI();
    });
    renderBgmList();
    updateBgmUI();
  }

  function renderBgmList() {
    const list = $('#bgmList');
    if (!list) return;
    list.innerHTML = '';
    BGM_TRACKS.forEach((track, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bgm-item';
      btn.dataset.bgmTrack = String(i);
      const num = el('span', 'bgm-item__num', String(i + 1).padStart(2, '0'));
      const meta = el('span', 'bgm-item__meta');
      meta.appendChild(el('strong', '', track.title));
      meta.appendChild(el('small', '', track.artist));
      btn.append(num, meta);
      list.appendChild(btn);
    });
  }

  function updateBgmUI() {
    const bgm = state.bgm;
    const playing = !!(bgm && bgm.on);
    const btn = $('#bgmBtn');
    if (btn) btn.classList.toggle('is-on', playing);
    const panel = $('#bgmPanel');
    if (panel) panel.classList.toggle('is-playing', playing);
    const play = $('#bgmPlay');
    if (play) play.textContent = playing ? '暂停' : '播放';
    const miniPlay = $('#bgmMiniPlay');
    if (miniPlay) miniPlay.textContent = playing ? '❚❚' : '▶';
    const title = $('#bgmTitle');
    const artist = $('#bgmArtist');
    const miniTitle = $('#bgmMiniTitle');
    if (bgm) {
      const track = BGM_TRACKS[bgm.index];
      if (title) title.textContent = track ? track.title : '未播放';
      if (artist) artist.textContent = track ? track.artist : '';
      if (miniTitle) miniTitle.textContent = track ? track.title : '未播放';
    } else {
      if (title) title.textContent = '未播放';
      if (artist) artist.textContent = '';
      if (miniTitle) miniTitle.textContent = '未播放';
    }
    $$('#bgmList .bgm-item').forEach((item) => {
      item.classList.toggle('is-active', !!bgm && Number(item.dataset.bgmTrack) === bgm.index);
    });
  }

  function loadBgm(index, autoplay) {
    if (!state.bgm) setupBgm();
    if (!state.bgm) return;
    const bgm = state.bgm;
    const i = ((index % BGM_TRACKS.length) + BGM_TRACKS.length) % BGM_TRACKS.length;
    bgm.index = i;
    saveBgmIndex(i);
    bgm.audio.src = BGM_TRACKS[i].src;
    bgm.audio.load();
    updateBgmUI();
    if (autoplay) playBgm(i);
  }

  function playBgm(index) {
    if (!state.bgm) setupBgm();
    if (!state.bgm) return;
    const bgm = state.bgm;
    if (typeof index === 'number' && index !== bgm.index) loadBgm(index, false);
    if (!bgm.audio.src) {
      bgm.audio.src = BGM_TRACKS[bgm.index].src;
      bgm.audio.load();
    }
    const promise = bgm.audio.play();
    if (promise && promise.then) {
      promise.then(() => {
        if (!state.bgm) return;
        state.bgm.on = true;
        updateBgmUI();
        const panel = $('#bgmPanel');
        if (panel && !state.bgm.panelDismissed) {
          panel.hidden = false;
          applyBgmPosition();
        }
      }).catch(() => {
        if (!state.bgm) return;
        state.bgm.on = false;
        updateBgmUI();
      });
    } else {
      bgm.on = true;
      updateBgmUI();
    }
  }

  function startBgm() {
    if (!state.bgm) setupBgm();
    if (!state.bgm) return;
    state.bgm.started = true;
    playBgm();
  }

  function pauseBgm() {
    if (!state.bgm) return;
    state.bgm.audio.pause();
    state.bgm.on = false;
    updateBgmUI();
  }

  function toggleBgm() {
    if (!state.bgm || !state.bgm.on) startBgm();
    else pauseBgm();
  }

  function stepBgm(dir) {
    if (!state.bgm) setupBgm();
    if (!state.bgm) return;
    playBgm((state.bgm.index + dir + BGM_TRACKS.length) % BGM_TRACKS.length);
  }

  function openBgmPanel() {
    const panel = $('#bgmPanel');
    if (!panel) return;
    if (!panel.hidden) {
      panel.hidden = true;
      if (state.bgm) state.bgm.panelDismissed = true;
      return;
    }
    if (state.bgm) state.bgm.panelDismissed = false;
    panel.hidden = false;
    applyBgmPosition();
    if (!state.bgm) setupBgm();
    if (state.bgm && !state.bgm.on) startBgm();
    updateBgmUI();
  }

  function closeBgmPanel() {
    const panel = $('#bgmPanel');
    if (panel) panel.hidden = true;
    if (state.bgm) state.bgm.panelDismissed = true;
  }

  function toggleBgmExpanded() {
    const panel = $('#bgmPanel');
    const btn = $('#bgmExpand');
    if (!panel) return;
    const expanded = panel.classList.toggle('is-expanded');
    if (btn) {
      btn.textContent = expanded ? '−' : '≡';
      btn.setAttribute('aria-label', expanded ? '收起曲目' : '展开曲目');
      btn.title = expanded ? '收起曲目' : '展开曲目';
    }
    requestAnimationFrame(() => applyBgmPosition());
  }

  const BGM_POS_KEY = 'sylcla.bgm.pos';

  function clampBgmPosition(left, top) {
    const panel = $('#bgmPanel');
    if (!panel) return { left, top };
    const w = panel.offsetWidth || 330;
    const h = panel.offsetHeight || 420;
    return {
      left: Math.min(Math.max(8, left), Math.max(8, window.innerWidth - w - 8)),
      top: Math.min(Math.max(8, top), Math.max(8, window.innerHeight - h - 8))
    };
  }

  function applyBgmPosition() {
    const panel = $('#bgmPanel');
    if (!panel || panel.hidden) return;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(BGM_POS_KEY) || 'null'); } catch (e) { saved = null; }
    if (!saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)) return;
    const pos = clampBgmPosition(saved.left, saved.top);
    panel.style.left = `${pos.left}px`;
    panel.style.top = `${pos.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function initBgmDrag() {
    const panel = $('#bgmPanel');
    const head = $('#bgmDrag');
    if (!panel || !head) return;
    let drag = null;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      if (e.button !== undefined && e.button !== 0) return;
      const rect = panel.getBoundingClientRect();
      drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, id: e.pointerId };
      panel.classList.add('is-dragging');
      head.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    head.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const pos = clampBgmPosition(e.clientX - drag.dx, e.clientY - drag.dy);
      panel.style.left = `${pos.left}px`;
      panel.style.top = `${pos.top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });
    const stop = (e) => {
      if (!drag) return;
      drag = null;
      panel.classList.remove('is-dragging');
      try {
        const rect = panel.getBoundingClientRect();
        localStorage.setItem(BGM_POS_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
      } catch (err) { /* ignore */ }
      if (e && e.pointerId !== undefined && head.hasPointerCapture(e.pointerId)) {
        head.releasePointerCapture(e.pointerId);
      }
    };
    head.addEventListener('pointerup', stop);
    head.addEventListener('pointercancel', stop);
    window.addEventListener('resize', () => applyBgmPosition());
  }

  function armBgmGesture() {
    const handler = (e) => {
      if (e && e.target && e.target.closest && e.target.closest('#bgmBtn')) return;
      startBgm();
      document.removeEventListener('pointerdown', handler);
      document.removeEventListener('keydown', handler);
    };
    document.addEventListener('pointerdown', handler);
    document.addEventListener('keydown', handler);
  }

  function finishSplash() {
    startBgm();
    if (!splash || splash.hidden || splash.classList.contains('is-leaving')) return;
    clearSplashTimers();
    markSplashSeen();
    splash.classList.add('is-leaving');
    state.scrollLocked = false;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.classList.remove('is-locked');
    state.splashDone = true;

    if (!reduceMotion) {
      setTimeout(() => {
        const hero = $('.hero');
        if (hero) restartAnimations(hero);
      }, 220);
    }

    setTimeout(() => {
      splash.hidden = true;
      splash.classList.remove('is-leaving', 'is-stage2', 'is-ready');
      revealAll();
    }, reduceMotion ? 60 : 1050);
  }

  function bootSplash() {
    if (!splash) return;
    if (hasSeenSplash()) {
      splash.hidden = true;
      splash.classList.add('is-leaving');
      document.body.classList.remove('is-locked');
      state.splashDone = true;
      return;
    }
    startSplash();
  }

  /* ══════════════════ 进场动画 ══════════════════ */

  let io = null;

  function watch(node) {
    if (!node) return;
    if (!('IntersectionObserver' in window) || reduceMotion) {
      node.classList.add('is-in');
      return;
    }
    if (!io) {
      io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
    }
    io.observe(node);
  }

  function revealAll() {
    $$('.reveal').forEach(watch);
    $$('.dossier, .record, .moment, .mail-card, .space-card, .call-row, .anniv-card').forEach(watch);
  }

  /* ══════════════════ 渲染：统计与计数 ══════════════════ */

  function entryTotal() {
    return ENTRY_KEYS.reduce((sum, k) => sum + state.data[k].length, 0);
  }

  function renderStats() {
    const entries = $('#statEntries');
    const diaries = $('#statDiaries');
    const calls = $('#statCalls');
    if (entries) entries.textContent = pad(entryTotal());
    if (diaries) diaries.textContent = pad(state.data.daily.length);
    if (calls) calls.textContent = pad(state.data.calls.length);
  }

  function renderCounts() {
    const labels = {
      dossiers: ['位', '位'],
      lore: ['条', '条'],
      daily: ['条', '条'],
      mail: ['封', '封'],
      space: ['条', '条'],
      calls: ['通', '通'],
      anniversary: ['个', '个']
    };
    MODULES.forEach((m) => {
      const node = $(`[data-count="${m.id}"]`);
      if (!node) return;
      const n = state.data[m.id].length;
      node.textContent = `${n} ${labels[m.id][0]}`;
    });
  }

  /* ══════════════════ 渲染：通用零件 ══════════════════ */

  function emptyNode(moduleId) {
    const m = MOD_BY_ID[moduleId];
    const box = el('div', 'empty');
    box.appendChild(el('p', 'empty__mark', '＋'));
    box.appendChild(el('p', 'empty__cn', m.emptyTitle));
    box.appendChild(el('p', 'empty__desc', m.emptyDesc));
    box.appendChild(el('p', 'empty__en', m.emptyEn));
    const btn = el('button', 'btn btn--line btn--sm', `＋ ${m.addLabel}`);
    btn.type = 'button';
    btn.dataset.add = moduleId;
    box.appendChild(btn);
    return box;
  }

  function cardActions(moduleId, id, opts) {
    const options = opts || {};
    const box = el('div', 'card-actions');
    const mk = (label, attr) => {
      const b = el('button', 'card-act', label);
      b.type = 'button';
      b.dataset[attr] = id;
      b.dataset.module = moduleId;
      return b;
    };
    if (options.view !== false) box.appendChild(mk('查看', 'view'));
    if (options.edit !== false) box.appendChild(mk('编辑', 'edit'));
    if (options.del !== false) box.appendChild(mk('删除', 'del'));
    return box;
  }

  function moodChip(mood) {
    if (!mood) return null;
    return el('span', 'chip-mood', mood);
  }

  /* ══════════════════ 渲染：档案 ══════════════════ */

  const CREST_NAMES = {
    lily: '百合',
    rose: '玫瑰',
    cross: '十字架',
    floral: '曼陀罗花',
    feather: '羽毛',
    raven: '渡鸦'
  };

  function crestNodes(keys) {
    const box = el('div', 'dossier__crests');
    (keys || []).forEach((key) => {
      if (!S.emblems[key]) return;
      const crest = el('span', 'dossier__crest');
      crest.title = CREST_NAMES[key] || '';
      crest.innerHTML = S.emblems[key];
      box.appendChild(crest);
    });
    return box;
  }

  function renderDossiers() {
    const box = $('#list-dossiers');
    if (!box) return;
    box.innerHTML = '';
    const list = state.data.dossiers;
    if (!list.length) {
      box.appendChild(emptyNode('dossiers'));
      return;
    }

    list.forEach((item, i) => {
      const card = el('article', 'dossier dossier--file');
      card.style.transitionDelay = `${Math.min(i, 4) * 80}ms`;

      const photo = el('div', 'dossier__photo');
      if (item.photo) {
        const img = document.createElement('img');
        img.src = item.photo;
        img.alt = item.name ? `${item.name} 的档案照片` : '档案照片';
        photo.appendChild(img);
      } else {
        photo.appendChild(el('span', 'dossier__photo-mark', (item.name || '·').slice(0, 1)));
        photo.appendChild(el('span', 'dossier__photo-hint', 'NO PHOTO'));
      }
      card.appendChild(photo);

      const body = el('div', 'dossier__body');

      const crests = crestNodes(S.dossierCrests[item.id]);
      if (crests.children.length) {
        crests.setAttribute('aria-hidden', 'true');
        body.appendChild(crests);
      }

      body.appendChild(el('p', 'dossier__index', `NO.${pad(i + 1)}${item.alias ? ` · ${item.alias}` : ''}`));
      body.appendChild(el('h3', 'dossier__name', item.name || '未命名'));
      if (item.en) body.appendChild(el('p', 'dossier__en', item.en));
      body.appendChild(el('p', 'dossier__work', item.work ? `出自 ${item.work}` : '出处未记'));

      const facts = el('dl', 'dossier__facts');
      [
        ['年龄', item.age],
        ['生日', item.birthday],
        ['身高', item.height],
        ['身份', item.identity],
        ['地点', item.place],
        ['性别', item.gender],
        ['关系', item.relation]
      ].forEach(([key, val]) => {
        const row = el('div', 'dossier__fact');
        row.appendChild(el('dt', '', key));
        row.appendChild(el('dd', '', val || '—'));
        facts.appendChild(row);
      });
      body.appendChild(facts);

      if (item.intro) {
        body.appendChild(el('p', 'dossier__intro', item.intro));
        body.appendChild(el('div', 'dossier__rule'));
      }

      [
        ['外貌', item.appearance],
        ['习惯', item.habits],
        ['喜欢', item.likes],
        ['讨厌', item.dislikes]
      ].forEach(([label, val]) => {
        if (!val) return;
        const section = el('div', 'dossier__section');
        section.appendChild(el('h4', '', label));
        section.appendChild(el('p', '', val));
        body.appendChild(section);
      });

      if (Array.isArray(item.experience) && item.experience.length) {
        const section = el('div', 'dossier__section');
        section.appendChild(el('h4', '', '个人经历'));
        const list = el('ul', 'dossier__exp');
        item.experience.forEach((node) => {
          if (!node || (!node.date && !node.text)) return;
          const li = document.createElement('li');
          if (node.date) li.appendChild(el('b', '', node.date));
          if (node.text) li.appendChild(el('span', '', node.text));
          list.appendChild(li);
        });
        section.appendChild(list);
        body.appendChild(section);
      }

      if (item.tags && item.tags.length) {
        const tags = el('div', 'dossier__tags');
        item.tags.forEach((t) => tags.appendChild(el('span', '', t)));
        body.appendChild(tags);
      }

      const bond = Math.max(0, Math.min(100, Number(item.bond) || 0));
      const bondBox = el('div', 'dossier__bond');
      const head = el('div', 'dossier__bond-head');
      head.appendChild(el('span', '', 'BOND'));
      head.appendChild(el('em', '', `${bond}%`));
      const bar = el('div', 'dossier__bar');
      const fill = el('i');
      fill.style.setProperty('--bond', `${bond}%`);
      bar.appendChild(fill);
      bondBox.append(head, bar);
      body.appendChild(bondBox);

      body.appendChild(cardActions('dossiers', item.id, { del: false }));
      card.appendChild(body);
      box.appendChild(card);
      watch(card);
    });
  }

  /* ══════════════════ 渲染：设定集 ══════════════════ */

  const KIND_EN = {
    人物: 'CHARACTER',
    世界观: 'WORLD',
    地点: 'PLACE',
    关系: 'RELATION',
    其他: 'NOTE'
  };

  function renderLore() {
    const box = $('#list-lore');
    if (!box) return;
    box.innerHTML = '';
    const list = state.data.lore;
    if (!list.length) {
      box.appendChild(emptyNode('lore'));
      return;
    }

    list.forEach((item, i) => {
      const row = el('article', 'record lore-row');
      row.style.transitionDelay = `${Math.min(i, 6) * 55}ms`;

      const rail = el('div', 'record__date');
      rail.appendChild(el('span', 'record__day', pad(i + 1)));
      rail.appendChild(el('span', 'record__ym', item.kind || '设定'));
      rail.appendChild(el('span', 'record__weekday', KIND_EN[item.kind] || 'LORE'));

      const main = el('div', 'record__main');
      const top = el('div', 'record__top');
      top.appendChild(el('h3', 'record__title', item.name || '未命名'));
      main.appendChild(top);

      const meta = el('p', 'record__meta');
      if (item.subtitle) {
        const sub = el('span', 'lore__subtitle', item.subtitle);
        meta.appendChild(sub);
      }
      if (item.work) meta.appendChild(el('span', '', item.work));
      if (item.tags && item.tags.length) {
        const tags = el('span', 'record__moods');
        item.tags.forEach((t) => tags.appendChild(el('span', '', t)));
        meta.appendChild(tags);
      }
      if (meta.children.length) main.appendChild(meta);

      if (item.relation) {
        main.appendChild(el('p', 'record__relation', `关系 · ${item.relation}`));
      }

      main.appendChild(el('p', 'record__excerpt', item.body || ''));

      const actions = el('div', 'record__actions');
      const read = el('button', 'record__read', '阅读全文');
      read.type = 'button';
      read.dataset.view = item.id;
      read.dataset.module = 'lore';
      read.appendChild(el('span', '', '→'));
      actions.appendChild(read);

      const edit = el('button', 'card-act', '编辑');
      edit.type = 'button';
      edit.dataset.edit = item.id;
      edit.dataset.module = 'lore';
      actions.appendChild(edit);

      const del = el('button', 'card-act', '删除');
      del.type = 'button';
      del.dataset.del = item.id;
      del.dataset.module = 'lore';
      actions.appendChild(del);

      main.appendChild(actions);
      row.append(rail, main);

      box.appendChild(row);
      watch(row);
    });
  }

  /* ══════════════════ 渲染：日常 ══════════════════ */

  function renderDaily() {
    const box = $('#list-daily');
    if (!box) return;
    box.innerHTML = '';
    const list = sortByDate(state.data.daily);
    if (!list.length) { box.appendChild(emptyNode('daily')); return; }

    list.forEach((rec, i) => {
      const d = parseDate(rec.date);
      const row = el('article', 'moment');
      row.style.transitionDelay = `${Math.min(i, 6) * 50}ms`;

      const rail = el('div', 'moment__rail');
      rail.appendChild(el('span', 'moment__day', pad(d.getDate())));
      rail.appendChild(el('span', 'moment__ym', `${MONTH_EN[d.getMonth()]} ${d.getFullYear()}`));
      rail.appendChild(el('span', 'moment__weekday', WEEKDAY_CN[d.getDay()]));

      const body = el('div', 'moment__body');
      const meta = el('div', 'moment__meta');
      const mood = moodChip(rec.mood);
      if (mood) meta.appendChild(mood);
      if (meta.children.length) body.appendChild(meta);
      if (rec.image) {
        const img = document.createElement('img');
        img.className = 'moment__image';
        img.src = rec.image;
        img.alt = '点滴图片';
        body.appendChild(img);
      }
      body.appendChild(el('p', 'moment__text', rec.text));
      body.appendChild(cardActions('daily', rec.id));

      row.append(rail, body);
      box.appendChild(row);
      watch(row);
    });
  }

  /* ══════════════════ 渲染：邮箱 ══════════════════ */

  function renderMail() {
    const box = $('#list-mail');
    if (!box) return;
    box.innerHTML = '';
    const list = sortByDate(state.data.mail);
    if (!list.length) { box.appendChild(emptyNode('mail')); return; }

    list.forEach((rec, i) => {
      const card = el('article', 'mail-card');
      card.dataset.dir = rec.direction === '收到' ? 'in' : 'out';
      card.style.transitionDelay = `${Math.min(i, 6) * 55}ms`;

      const top = el('div', 'mail-card__top');
      top.appendChild(el('span', 'mail-card__dir', rec.direction || '寄出'));
      top.appendChild(el('span', 'mail-card__date', fmtDot(rec.date)));
      card.appendChild(top);

      card.appendChild(el('h4', 'mail-card__subject', rec.subject || '无主题'));
      card.appendChild(el('p', 'mail-card__excerpt', truncate(rec.body, 78)));

      const foot = el('div', 'mail-card__foot');
      foot.appendChild(cardActions('mail', rec.id));
      card.appendChild(foot);

      box.appendChild(card);
      watch(card);
    });
  }

  /* ══════════════════ 渲染：空间 ══════════════════ */

  function renderSpace() {
    const box = $('#list-space');
    if (!box) return;
    box.innerHTML = '';
    const list = sortByDate(state.data.space);
    if (!list.length) { box.appendChild(emptyNode('space')); return; }

    list.forEach((rec, i) => {
      const card = el('article', 'space-card');
      card.style.transitionDelay = `${Math.min(i, 6) * 55}ms`;
      card.appendChild(el('span', 'space-card__pin'));
      if (rec.image) {
        const img = document.createElement('img');
        img.className = 'space__image';
        img.src = rec.image;
        img.alt = '你我之间图片';
        card.appendChild(img);
      }
      card.appendChild(el('p', 'space-card__text', rec.text));

      const foot = el('div', 'space-card__foot');
      const bits = [rec.place, fmtDot(rec.date)].filter(Boolean).join(' · ');
      foot.appendChild(el('span', 'space-card__meta', bits));
      card.appendChild(foot);

      const acts = cardActions('space', rec.id);
      acts.classList.add('space-card__actions');
      card.appendChild(acts);

      box.appendChild(card);
      watch(card);
    });
  }

  /* ══════════════════ 渲染：纪念日 ══════════════════ */

  function renderAnniversary() {
    const box = $('#list-anniversary');
    if (!box) return;
    box.innerHTML = '';
    const list = (state.data.anniversary || []).slice().sort((a, b) => parseDate(a.date) - parseDate(b.date));
    if (!list.length) {
      box.appendChild(el('p', 'anniv-empty', '还没有纪念日。把想记住的日子留在这里。'));
      return;
    }
    const today = new Date();
    const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    list.forEach((rec, i) => {
      const card = el('article', 'anniv-card');
      card.style.transitionDelay = `${Math.min(i, 6) * 45}ms`;
      const d = parseDate(rec.date);
      const dayUTC = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
      const days = Math.round((todayUTC - dayUTC) / 86400000);
      card.appendChild(el('p', 'anniv-card__date', fmtDot(rec.date)));
      card.appendChild(el('h3', 'anniv-card__title', rec.title || '未命名'));
      const daysEl = el('p', 'anniv-card__days', String(Math.abs(days)));
      daysEl.appendChild(el('em', '', days >= 0 ? '天 · 已经走过' : '天 · 还有'));
      card.appendChild(daysEl);
      if (rec.note) card.appendChild(el('p', 'anniv-card__note', rec.note));
      card.appendChild(cardActions('anniversary', rec.id, { view: false }));
      box.appendChild(card);
      watch(card);
    });
  }

  /* ══════════════════ 渲染：通话 ══════════════════ */

  function renderCalls() {
    const box = $('#list-calls');
    const summary = $('#callsSummary');
    if (!box) return;
    box.innerHTML = '';
    const list = sortByDate(state.data.calls);

    if (summary) {
      if (!list.length) {
        summary.hidden = true;
        summary.innerHTML = '';
      } else {
        const minutes = list.reduce((sum, r) => sum + (Number(r.minutes) || 0), 0);
        const missed = list.filter((r) => r.direction === '未接').length;
        summary.hidden = false;
        summary.innerHTML = '';
        [
          ['记录', `${list.length}`, '条'],
          ['通话', `${list.length}`, '次'],
          ['累计', `${minutes}`, '分钟'],
          ['未接', `${missed}`, '次']
        ].forEach(([label, value, unit]) => {
          const item = el('span', 'calls-summary__item');
          item.appendChild(el('b', '', value));
          item.appendChild(document.createTextNode(` ${unit} · ${label}`));
          summary.appendChild(item);
        });
      }
    }

    if (!list.length) { box.appendChild(emptyNode('calls')); return; }

    list.forEach((rec, i) => {
      const isChat = Array.isArray(rec.chat) && rec.chat.length > 0;
      const direction = rec.direction === '来电' ? '来电' : rec.direction === '未接' ? '未接' : '拨出';
      const type = direction === '来电' ? 'in' : direction === '未接' ? 'missed' : 'out';
      const row = el('article', 'call-row');
      row.dataset.type = type;
      if (isChat) row.dataset.chat = rec.id;
      row.style.transitionDelay = `${Math.min(i, 6) * 50}ms`;

      row.appendChild(el('span', 'call-row__icon', type === 'in' ? '↙' : type === 'missed' ? '✕' : '↗'));

      const main = el('div', 'call-row__main');
      const title = el('p', 'call-row__title', partnerName());
      title.appendChild(el('em', '', direction));
      main.appendChild(title);
      if (!isChat && rec.note) {
        main.appendChild(el('p', 'call-row__note', truncate(rec.note, 64)));
      }
      row.appendChild(main);

      const right = el('div', 'call-row__right');
      right.appendChild(el('span', 'call-row__date', fmtDot(rec.date)));
      right.appendChild(el('span', 'call-row__dur', `${Number(rec.minutes) || 0} 分钟`));
      row.appendChild(right);

      row.appendChild(cardActions('calls', rec.id));
      box.appendChild(row);
      watch(row);
    });
  }

  function renderAll() {
    renderStats();
    renderCounts();
    renderDossiers();
    renderLore();
    renderDaily();
    renderMail();
    renderSpace();
    renderCalls();
    renderAnniversary();
  }

  /* ══════════════════ 页面路由 ══════════════════ */

  function currentRoute() {
    const h = (location.hash || '').replace(/^#\/?/, '');
    return MOD_IDS.includes(h) || h === 'home' || h === '' ? (h || 'home') : 'home';
  }

  function go(route, opts) {
    const options = opts || {};
    const id = MOD_IDS.includes(route) ? route : 'home';
    state.tab = id;

    $$('.view').forEach((view) => { view.hidden = view.id !== `view-${id}`; });
    $$('.nav__links a[data-route], .nav__mobile a[data-route]').forEach((link) => {
      link.classList.toggle('is-active', link.dataset.route === id);
    });

    if (options.hash !== false) {
      try { history.replaceState(null, '', id === 'home' ? '#/' : `#/${id}`); } catch (e) { /* ignore */ }
    }
    if (options.scroll !== false) window.scrollTo({ top: 0, behavior: 'auto' });
    document.title = id === 'home' ? 'Cheun · 纯宝与秦彻的档案' : `${MOD_BY_ID[id].name} · Cheun`;
    closeMobileNav();
    requestAnimationFrame(() => revealAll());
  }

  function initRouter() {
    go(currentRoute(), { hash: false, scroll: false });
    window.addEventListener('hashchange', () => go(currentRoute(), { hash: false }));
  }

  /* ══════════════════ 新建 / 编辑弹层 ══════════════════ */

  const composer = $('#composer');

  function openComposer(moduleId, editId) {
    if (!state.admin) {
      requireAdmin(() => openComposer(moduleId, editId));
      return;
    }
    const module = MOD_BY_ID[moduleId];
    if (!module) return;
    if (moduleId === 'dossiers' && !editId) {
      toast('档案固定为纯宝和秦彻，点卡片上的「编辑」修改');
      return;
    }
    const rec = editId ? findEntry(moduleId, editId) : null;
    state.composer = { moduleId, id: editId || null };
    state.lastFocus = document.activeElement;

    $('#composerKicker').textContent = `${module.en} · ${editId ? 'EDIT' : 'NEW'}`;
    $('#composerTitle').textContent = `${editId ? '编辑' : '新建'}${module.formName || module.name}`;
    const fields = $('#composerFields');
    fields.innerHTML = '';
    module.fields.forEach((f) => {
      fields.appendChild(buildField(f, rec ? rec[f.key] : undefined));
    });
    const error = $('#composerError');
    if (error) { error.hidden = true; error.textContent = ''; }

    composer.hidden = false;
    lockScroll();
    setTimeout(() => {
      const first = fields.querySelector('input, textarea, select');
      if (first) first.focus({ preventScroll: true });
    }, 60);
  }

  function closeComposer() {
    if (!composer || composer.hidden) return;
    composer.hidden = true;
    state.composer = null;
    unlockScroll();
    if (state.lastFocus && state.lastFocus.focus) {
      try { state.lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    state.lastFocus = null;
  }

  function buildField(f, value) {
    const wrap = el('div', `field${f.wide ? ' field--wide' : ''}`);
    const label = el('span', 'field__label');
    label.appendChild(document.createTextNode(f.label));
    if (f.en) label.appendChild(el('em', '', f.en));
    wrap.appendChild(label);

    if (f.type === 'mood') {
      const box = el('div', 'chips');
      box.dataset.field = f.key;
      box.dataset.value = value || '';
      S.moods.forEach((m) => {
        const btn = el('button', `chip-btn${value === m ? ' is-on' : ''}`, m);
        btn.type = 'button';
        btn.dataset.value = m;
        btn.addEventListener('click', () => {
          const off = box.dataset.value === m;
          box.dataset.value = off ? '' : m;
          $$('.chip-btn', box).forEach((x) => x.classList.toggle('is-on', !off && x.dataset.value === m));
        });
        box.appendChild(btn);
      });
      wrap.appendChild(box);
      return wrap;
    }

    if (f.type === 'segmented') {
      const box = el('div', 'segmented');
      box.dataset.field = f.key;
      box.dataset.value = value || f.value || (f.options && f.options[0]) || '';
      (f.options || []).forEach((txt) => {
        const btn = el('button', `seg-btn${box.dataset.value === txt ? ' is-on' : ''}`, txt);
        btn.type = 'button';
        btn.dataset.value = txt;
        btn.addEventListener('click', () => {
          box.dataset.value = txt;
          $$('.seg-btn', box).forEach((x) => x.classList.toggle('is-on', x.dataset.value === txt));
        });
        box.appendChild(btn);
      });
      wrap.appendChild(box);
      return wrap;
    }

    if (f.type === 'tags') {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = f.placeholder || '';
      input.value = Array.isArray(value) ? value.join(' / ') : (value || '');
      input.dataset.field = f.key;
      wrap.appendChild(input);
      return wrap;
    }

    if (f.type === 'image') {
      const holder = el('div', 'photo-field');
      const preview = el('div', 'photo-preview');
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.dataset.field = f.key;
      hidden.value = value || '';

      const renderPreview = (src) => {
        preview.innerHTML = '';
        if (src) {
          const img = document.createElement('img');
          img.src = src;
          img.alt = '档案照片';
          preview.appendChild(img);
        } else {
          preview.appendChild(el('span', 'photo-preview__empty', '暂无照片'));
        }
      };
      renderPreview(hidden.value);

      const controls = el('div', 'photo-controls');
      const labelBtn = el('label', 'btn btn--line btn--sm', '选择照片');
      const file = document.createElement('input');
      file.type = 'file';
      file.accept = 'image/*';
      file.hidden = true;
      labelBtn.appendChild(file);

      const clear = el('button', 'card-act', '移除照片');
      clear.type = 'button';
      const hint = el('p', 'photo-hint', '建议 4:3；会自动压缩到 900px 以内');

      file.addEventListener('change', async () => {
        const picked = file.files && file.files[0];
        if (!picked) return;
        try {
          const dataUrl = await compressImage(picked);
          hidden.value = dataUrl;
          renderPreview(dataUrl);
        } catch (e) {
          toast('照片读取失败，换一张试试');
        }
        file.value = '';
      });
      clear.addEventListener('click', () => {
        hidden.value = '';
        renderPreview('');
      });

      controls.append(labelBtn, clear, hint);
      holder.append(preview, hidden, controls);
      wrap.appendChild(holder);
      return wrap;
    }

    if (f.type === 'nodes') {
      const holder = el('div', 'nodes-field');
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.dataset.field = f.key;
      const rows = el('div', 'nodes-rows');
      const sync = () => {
        const arr = $$('.node-row', rows).map((row) => ({
          date: ($('.node-date', row) || {}).value ? $('.node-date', row).value.trim() : '',
          text: ($('.node-text', row) || {}).value ? $('.node-text', row).value.trim() : ''
        })).filter((n) => n.date || n.text);
        hidden.value = JSON.stringify(arr);
      };
      const addRow = (node) => {
        const row = el('div', 'node-row');
        const date = document.createElement('input');
        date.type = 'text';
        date.className = 'node-date';
        date.placeholder = '时间 / 节点';
        date.value = (node && node.date) || '';
        const text = document.createElement('textarea');
        text.rows = 2;
        text.className = 'node-text';
        text.placeholder = '发生了什么';
        text.value = (node && node.text) || '';
        const del = el('button', 'node-del', '×');
        del.type = 'button';
        del.setAttribute('aria-label', '删除这个节点');
        [date, text].forEach((node2) => node2.addEventListener('input', sync));
        del.addEventListener('click', () => { row.remove(); sync(); });
        row.append(date, text, del);
        rows.appendChild(row);
      };
      const initial = Array.isArray(value) ? value : [];
      initial.forEach(addRow);
      if (!initial.length) addRow({});
      const add = el('button', 'btn btn--line btn--sm', '＋ 加一个节点');
      add.type = 'button';
      add.addEventListener('click', () => addRow({}));
      holder.append(rows, add, hidden);
      sync();
      wrap.appendChild(holder);
      return wrap;
    }

    if (f.type === 'range') {
      const row = el('div', 'range-row');
      const input = document.createElement('input');
      input.type = 'range';
      input.min = f.min === undefined ? 0 : f.min;
      input.max = f.max === undefined ? 100 : f.max;
      input.value = value === undefined ? (f.value || 50) : value;
      input.dataset.field = f.key;
      const out = el('output', '', String(input.value));
      input.addEventListener('input', () => { out.textContent = input.value; });
      row.append(input, out);
      wrap.appendChild(row);
      return wrap;
    }

    if (f.type === 'select') {
      const select = document.createElement('select');
      select.dataset.field = f.key;
      (f.options || []).forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.v;
        opt.textContent = o.t;
        select.appendChild(opt);
      });
      const fallback = f.value || (f.options && f.options[0] ? f.options[0].v : '');
      select.value = value === undefined || value === '' ? fallback : value;
      wrap.appendChild(select);
      return wrap;
    }

    if (f.type === 'textarea') {
      const area = document.createElement('textarea');
      area.rows = f.rows || 5;
      area.maxLength = f.max || 1200;
      area.placeholder = f.placeholder || '';
      area.value = value || '';
      area.dataset.field = f.key;
      wrap.appendChild(area);
      return wrap;
    }

    const input = document.createElement('input');
    input.type = f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text';
    input.dataset.field = f.key;
    if (f.type === 'date') input.value = value || todayISO();
    else if (f.type === 'number') {
      input.min = f.min === undefined ? 0 : f.min;
      input.max = f.max === undefined ? 9999 : f.max;
      input.value = value === undefined ? (f.value || 0) : value;
    } else {
      input.maxLength = f.max || 80;
      input.placeholder = f.placeholder || '';
      input.value = value || '';
    }
    wrap.appendChild(input);
    return wrap;
  }

  function readFields(module) {
    const out = {};
    module.fields.forEach((f) => {
      const node = $(`#composerFields [data-field="${f.key}"]`);
      if (!node) return;
      if (f.type === 'mood' || f.type === 'segmented') out[f.key] = node.dataset.value || '';
      else if (f.type === 'range' || f.type === 'number') out[f.key] = Math.max(0, Number(node.value) || 0);
      else if (f.type === 'tags') out[f.key] = parseTags(node.value);
      else if (f.type === 'nodes') {
        try { out[f.key] = JSON.parse(node.value || '[]'); } catch (e) { out[f.key] = []; }
      }
      else if (f.type === 'character') out[f.key] = node.value || null;
      else out[f.key] = (node.value || '').trim();
    });
    return out;
  }

  function submitComposer(e) {
    e.preventDefault();
    if (!state.composer) return;
    const moduleId = state.composer.moduleId;
    const module = MOD_BY_ID[moduleId];
    const values = readFields(module);
    const error = $('#composerError');

    for (const f of module.fields) {
      if (!f.required) continue;
      let v = values[f.key];
      if (f.type === 'number') {
        const rawNode = $(`#composerFields [data-field="${f.key}"]`);
        if (rawNode && String(rawNode.value).trim() === '') v = '';
      }
      if (v === '' || v === null || v === undefined) {
        if (error) {
          error.hidden = false;
          error.textContent = `还差一点：${f.label}还没有填。`;
        }
        const node = $(`#composerFields [data-field="${f.key}"]`);
        if (node && node.focus) node.focus();
        return;
      }
    }
    if (error) error.hidden = true;

    const editingId = state.composer.id;
    let record;
    if (moduleId === 'dossiers') {
      if (!editingId) {
        if (error) { error.hidden = false; error.textContent = '档案固定为纯宝和秦彻，不能新增第三个人。'; }
        return;
      }
      record = Object.assign({ id: editingId }, values);
    } else if (moduleId === 'lore') {
      record = Object.assign({ id: editingId || uid('l') }, values);
    } else {
      record = Object.assign({ id: editingId || uid('e') }, values);
      if (!record.date) record.date = todayISO();
    }

    const list = state.data[moduleId];
    if (editingId) {
      const i = list.findIndex((x) => x.id === editingId);
      if (i >= 0) list[i] = Object.assign({}, list[i], record);
      else list.unshift(record);
    } else {
      list.unshift(record);
    }

    persist();
    renderAll();
    closeComposer();
    if (moduleId === 'anniversary') go('dossiers', { hash: true, scroll: false });
    else go(moduleId, { hash: true, scroll: false });
    toast(editingId ? '已更新' : '已保存');
  }

  /* ══════════════════ 详情 / 删除 ══════════════════ */

  const reader = $('#reader');

  function buildDossierReader(rec) {
    const root = el('div', 'reader-dossier');
    const facts = [
      ['年龄', rec.age],
      ['生日', rec.birthday],
      ['身高', rec.height],
      ['身份', rec.identity],
      ['地点', rec.place],
      ['性别', rec.gender],
      ['关系', rec.relation]
    ].filter(([, v]) => v);
    if (facts.length) {
      const dl = el('dl', 'reader-dossier__facts');
      facts.forEach(([k, v]) => {
        const row = el('div', 'reader-dossier__fact');
        row.appendChild(el('dt', '', k));
        row.appendChild(el('dd', '', v));
        dl.appendChild(row);
      });
      root.appendChild(dl);
    }
    if (rec.intro) root.appendChild(el('p', 'reader-dossier__intro', rec.intro));
    root.appendChild(el('div', 'reader-dossier__rule'));
    [
      ['外貌', rec.appearance],
      ['习惯', rec.habits],
      ['喜欢', rec.likes],
      ['讨厌', rec.dislikes]
    ].forEach(([label, val]) => {
      if (!val) return;
      const section = el('section', 'reader-dossier__section');
      section.appendChild(el('h4', '', label));
      section.appendChild(el('p', '', val));
      root.appendChild(section);
    });
    if (Array.isArray(rec.experience) && rec.experience.length) {
      const section = el('section', 'reader-dossier__section reader-dossier__section--timeline');
      section.appendChild(el('h4', '', '个人经历'));
      const ol = el('ol', 'reader-timeline');
      rec.experience.forEach((node) => {
        if (!node || (!node.date && !node.text)) return;
        const li = el('li', 'reader-timeline__item');
        li.appendChild(el('span', 'reader-timeline__dot'));
        const body = el('div', 'reader-timeline__body');
        if (node.date) body.appendChild(el('b', '', node.date));
        if (node.text) body.appendChild(el('p', '', node.text));
        li.appendChild(body);
        ol.appendChild(li);
      });
      section.appendChild(ol);
      root.appendChild(section);
    }
    return root;
  }

  function openViewer(moduleId, id) {
    const module = MOD_BY_ID[moduleId];
    const rec = findEntry(moduleId, id);
    if (!module || !rec || !reader) return;
    if (moduleId === 'calls' && Array.isArray(rec.chat) && rec.chat.length) {
      openChatView(rec);
      return;
    }

    state.viewer = { moduleId, id };
    state.lastFocus = document.activeElement;

    const kickerDate = rec.date ? fmtDot(rec.date) : (moduleId === 'dossiers' ? (rec.alias || 'DOSSIER') : (rec.kind || 'LORE'));
    $('#readerKicker').textContent = `${module.en} · ${kickerDate}`;

    let title = '';
    let meta = [];
    let body = '';
    let quote = '';

    if (moduleId === 'dossiers') {
      title = rec.name || '未命名';
      meta = [rec.en, rec.alias, rec.work ? `出自 ${rec.work}` : '', `羁绊 ${Number(rec.bond) || 0}%`].filter(Boolean);
      const facts = [
        ['年龄', rec.age],
        ['生日', rec.birthday],
        ['身高', rec.height],
        ['身份', rec.identity],
        ['地点', rec.place],
        ['性别', rec.gender],
        ['关系', rec.relation]
      ].filter(([, v]) => v).map(([k, v]) => `${k}：${v}`).join('\n');
      const sections = [
        ['外貌', rec.appearance],
        ['习惯', rec.habits],
        ['喜欢', rec.likes],
        ['讨厌', rec.dislikes]
      ].filter(([, v]) => v).map(([k, v]) => `${k}\n${v}`).join('\n\n');
      const exp = (rec.experience || []).filter((n) => n && (n.date || n.text))
        .map((n) => `${n.date || ''}${n.date && n.text ? ' · ' : ''}${n.text || ''}`).join('\n');
      body = [facts, rec.intro, sections, exp].filter(Boolean).join('\n\n') || '还没有写下简介。';
      quote = (rec.tags || []).join(' · ');
    } else if (moduleId === 'lore') {
      title = rec.name || '未命名';
      meta = [rec.subtitle, rec.work ? `出自 ${rec.work}` : '', rec.kind, rec.relation ? `关系 · ${rec.relation}` : ''].filter(Boolean);
      body = rec.body || '还没有写下设定。';
      quote = (rec.tags || []).join(' · ');
    } else if (moduleId === 'daily') {
      title = '点滴';
      meta = [fmtCN(rec.date), rec.mood].filter(Boolean);
      body = rec.text || '';
    } else if (moduleId === 'mail') {
      title = rec.subject || '无主题';
      meta = [rec.direction, fmtCN(rec.date)].filter(Boolean);
      body = rec.body || '';
    } else if (moduleId === 'space') {
      title = rec.place ? `在${rec.place}` : '你我之间';
      meta = [fmtCN(rec.date), rec.mood].filter(Boolean);
      body = rec.text || '';
    } else {
      title = `与${partnerName()}的通话`;
      meta = [rec.direction, fmtCN(rec.date), `${Number(rec.minutes) || 0} 分钟`].filter(Boolean);
      body = rec.note || '没有留下备注。';
    }

    $('#readerTitle').textContent = title;

    const metaBox = $('#readerMeta');
    metaBox.innerHTML = '';
    meta.forEach((bit, i) => {
      const span = document.createElement('span');
      if (i === 0) {
        const strong = document.createElement('b');
        strong.textContent = bit;
        span.appendChild(strong);
      } else {
        span.textContent = bit;
      }
      metaBox.appendChild(span);
    });

    const readerBody = $('#readerBody');
    readerBody.innerHTML = '';
    if (moduleId === 'dossiers') readerBody.appendChild(buildDossierReader(rec));
    else readerBody.textContent = body;
    const readerImage = $('#readerImage');
    if (readerImage) {
      const src = rec.image || rec.photo || '';
      if (src) {
        readerImage.src = src;
        readerImage.alt = rec.title || rec.name || '图片';
        readerImage.hidden = false;
      } else {
        readerImage.removeAttribute('src');
        readerImage.hidden = true;
      }
    }
    const quoteBox = $('#readerQuote');
    quoteBox.textContent = quote ? `“${quote}”` : '';

    const delBtn = $('#readerDelete');
    if (delBtn) delBtn.hidden = moduleId === 'dossiers';

    reader.hidden = false;
    lockScroll();
    const close = $('#readerClose');
    if (close) close.focus({ preventScroll: true });
  }

  function closeViewer() {
    if (!reader || reader.hidden) return;
    reader.hidden = true;
    state.viewer = null;
    unlockScroll();
    if (state.lastFocus && state.lastFocus.focus) {
      try { state.lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    state.lastFocus = null;
  }

  /* ══════════════════ 聊天图片 → 聊天记录 ══════════════════ */

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('script load failed: ' + src));
      document.head.appendChild(s);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image load failed'));
      img.src = src;
    });
  }

  const AI_PRESETS = {
    deepseek: { base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', mode: 'vision' },
    openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', mode: 'vision' },
    qwen: { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-vl-max', mode: 'vision' },
    gemini: { base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', mode: 'vision' },
    custom: { base: '', model: '', mode: 'vision' }
  };
  const AI_KEY = 'sylcla.ai.v1';
  const AI_DEFAULT = {
    preset: 'deepseek',
    mode: 'vision',
    base: '/api/ai/v1',
    model: 'deepseek-chat',
    key: 'proxy'
  };

  function readAiConfig() {
    try {
      const raw = localStorage.getItem(AI_KEY);
      if (raw === null) return Object.assign({}, AI_DEFAULT);
      const cfg = JSON.parse(raw || '{}');
      if (cfg.disabled) return { preset: 'custom', mode: 'vision', base: '', model: '', key: '' };
      const preset = cfg.preset || 'custom';
      let base = (cfg.base || '').trim();
      if (!['127.0.0.1', 'localhost'].includes(location.hostname) && /127\.0\.0\.1:8787/.test(base)) {
        base = base.replace('127.0.0.1', location.hostname);
      }
      return {
        preset,
        mode: preset === 'deepseek' ? 'vision' : (cfg.mode || 'vision'),
        base,
        model: (cfg.model || '').trim(),
        key: (cfg.key || '').trim()
      };
    } catch (e) {
      return Object.assign({}, AI_DEFAULT);
    }
  }

  function aiReady(cfg) {
    return !!(cfg && cfg.base && cfg.model && cfg.key);
  }

  function updateAiStatus() {
    const node = $('#aiOcrStatus');
    if (!node) return;
    const cfg = readAiConfig();
    if (aiReady(cfg)) {
      node.textContent = cfg.mode === 'text'
        ? `DeepSeek 整理 · ${cfg.model}`
        : `AI 视觉 · ${cfg.model}`;
      node.classList.add('is-ai');
    } else {
      node.textContent = '本地识别 · PaddleOCR';
      node.classList.remove('is-ai');
    }
  }

  function openAiConfig() {
    const modal = $('#aiConfig');
    if (!modal) return;
    const cfg = readAiConfig();
    const preset = $('#aiPreset');
    const mode = $('#aiMode');
    const base = $('#aiBase');
    const model = $('#aiModel');
    const key = $('#aiKey');
    const stateNode = $('#aiConfigState');
    if (preset) preset.value = cfg.preset || 'custom';
    if (mode) mode.value = cfg.mode || 'vision';
    if (base) base.value = cfg.base;
    if (model) model.value = cfg.model;
    if (key) key.value = cfg.key;
    if (stateNode) {
      stateNode.textContent = aiReady(cfg)
        ? `当前：${cfg.model} · ${cfg.base}`
        : '当前未配置 AI，使用本地 PaddleOCR / Tesseract。';
    }
    modal.hidden = false;
    lockScroll();
    setTimeout(() => { if (base) base.focus({ preventScroll: true }); }, 60);
  }

  function closeAiConfig() {
    const modal = $('#aiConfig');
    if (modal) modal.hidden = true;
    const importModal = $('#chatImport');
    if (!importModal || importModal.hidden) unlockScroll();
  }

  function saveAiConfig() {
    const base = ($('#aiBase') && $('#aiBase').value || '').trim().replace(/\/+$/, '');
    const model = ($('#aiModel') && $('#aiModel').value || '').trim();
    const key = ($('#aiKey') && $('#aiKey').value || '').trim();
    const preset = ($('#aiPreset') && $('#aiPreset').value) || 'custom';
    const mode = ($('#aiMode') && $('#aiMode').value) || 'vision';
    const stateNode = $('#aiConfigState');
    if (!base && !model && !key) {
      try { localStorage.setItem(AI_KEY, JSON.stringify({ disabled: true })); } catch (e) { /* ignore */ }
      if (stateNode) stateNode.textContent = '已清除 AI 设置，使用本地识别。';
      updateAiStatus();
      toast('已清除 AI 设置');
      return;
    }
    if (!base || !model || !key) {
      if (stateNode) stateNode.textContent = 'API Base、模型、API Key 三项都要填。';
      return;
    }
    try {
      localStorage.setItem(AI_KEY, JSON.stringify({ preset, mode, base, model, key }));
    } catch (e) {
      if (stateNode) stateNode.textContent = '浏览器无法保存设置。';
      return;
    }
    if (stateNode) stateNode.textContent = `已保存：${model} · ${mode === 'text' ? '本地 OCR + AI 整理' : 'AI 视觉识别'} · ${base}`;
    updateAiStatus();
    toast('AI 识别设置已保存');
  }

  async function aiChatMessages(img) {
    const cfg = readAiConfig();
    if (!aiReady(cfg)) return [];
    const maxSide = 1600;
    const longSide = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = longSide < 1000
      ? Math.min(3, 1200 / Math.max(1, longSide))
      : Math.min(1, maxSide / Math.max(1, longSide));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const prompt = [
      '你是聊天截图结构化识别器。只输出 JSON 数组，不要解释、不要 Markdown。',
      '每个元素格式：{"from":"me"|"him","text":"消息原文"}。',
      'from=me 表示截图主人发出的右侧气泡（通常是绿色或蓝色）；from=him 表示左侧收到的气泡。',
      '严格按从上到下的顺序输出；忽略顶部标题、状态栏、时间、日期、头像里的“我/他”、系统提示和输入框。',
      '忽略灰色引用框、回复预览、以“某某：”开头的引用文字；只输出真实聊天气泡，引用框里的内容不算消息。',
      '不要把不同消息合并，不要改写错别字，不要补写看不清的内容。'
    ].join('\n');
    const res = await (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      try {
        return await fetch(`${cfg.base}/chat/completions`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cfg.key}`
          },
          body: JSON.stringify({
            model: cfg.model,
            temperature: 0,
            max_tokens: 2000,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
              ]
            }]
          })
        });
      } finally {
        clearTimeout(timer);
      }
    })();
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`AI ${res.status}: ${detail.slice(0, 180)}`);
    }
    const json = await res.json();
    let content = json && json.choices && json.choices[0] && json.choices[0].message
      ? json.choices[0].message.content
      : '';
    if (Array.isArray(content)) content = content.map((part) => part.text || '').join('');
    content = String(content || '').replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = content.indexOf('[');
    const end = content.lastIndexOf(']');
    if (start < 0 || end <= start) throw new Error('AI 没有返回 JSON');
    const arr = JSON.parse(content.slice(start, end + 1));
    if (!Array.isArray(arr)) throw new Error('AI 返回格式不对');
    return arr
      .map((m) => ({
        from: m && m.from === 'me' ? 'me' : 'him',
        text: String((m && m.text) || '').trim()
      }))
      .filter((m) => m.text && !/^(凌晨|彻の传话筒|秦彻|纯宝)\s*[：:]/.test(m.text))
      .slice(0, 300);
  }

  async function aiCleanMessages(messages) {
    const cfg = readAiConfig();
    if (!aiReady(cfg) || !messages.length) return [];
    const payload = messages.map((m, i) => ({ index: i, from: m.from === 'me' ? 'me' : 'him', text: m.text }));
    const prompt = [
      '你是聊天截图的 OCR 校对器。下面是本地 OCR 读出来的消息 JSON。',
      '只输出 JSON 数组，不要解释、不要 Markdown：',
      '[{"from":"me"|"him","text":"整理后的消息"}]',
      '规则：保留每条的 from 方向；按原顺序；修正明显的错字和断行；',
      '删掉误识别成消息的标题、头像文字（我/他）、时间、日期、系统提示；',
      '不要把不同消息合并，不要编造截图里没有的内容。',
      JSON.stringify(payload)
    ].join('\n');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    let res;
    try {
      res = await fetch(`${cfg.base}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.key}`
        },
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0,
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }]
        })
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`AI ${res.status}: ${detail.slice(0, 180)}`);
    }
    const json = await res.json();
    let content = json && json.choices && json.choices[0] && json.choices[0].message
      ? json.choices[0].message.content
      : '';
    if (Array.isArray(content)) content = content.map((part) => part.text || '').join('');
    content = String(content || '').replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = content.indexOf('[');
    const end = content.lastIndexOf(']');
    if (start < 0 || end <= start) throw new Error('AI 没有返回 JSON');
    const arr = JSON.parse(content.slice(start, end + 1));
    if (!Array.isArray(arr)) throw new Error('AI 返回格式不对');
    return arr
      .map((m) => ({
        from: m && m.from === 'me' ? 'me' : 'him',
        text: String((m && m.text) || '').trim()
      }))
      .filter((m) => m.text && !/^(凌晨|彻の传话筒|秦彻|纯宝)\s*[：:]/.test(m.text))
      .slice(0, 300);
  }

  async function ensurePaddle() {
    if (state.paddle) return state.paddle;
    if (!state.paddlePromise) {
      state.paddlePromise = (async () => {
        const mod = await import('https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/dist/index.mjs');
        const base = new URL('assets/vendor/paddle/', window.location.href).href;
        const ocr = await mod.PaddleOCR.create({
          lang: 'ch',
          textDetectionModelName: 'PP-OCRv5_mobile_det',
          textRecognitionModelName: 'PP-OCRv5_mobile_rec',
          textDetectionModelAsset: { url: base + 'det.tar' },
          textRecognitionModelAsset: { url: base + 'rec.tar' },
          ortOptions: { backend: 'wasm', wasmPaths: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/' }
        });
        state.paddle = ocr;
        return ocr;
      })();
      state.paddlePromise.catch(() => { state.paddlePromise = null; });
    }
    return state.paddlePromise;
  }

  function groupChatLines(lines, width) {
    const messages = [];
    lines.forEach((line) => {
      const cx = (line.bbox.x0 + line.bbox.x1) / 2;
      const from = line.side || (cx > width * 0.52 ? 'me' : 'him');
      const lineH = Math.max(1, line.bbox.y1 - line.bbox.y0);
      const last = messages[messages.length - 1];
      if (last && last.from === from && line.bbox.y0 - last.y1 < Math.max(8, lineH * 0.55)) {
        last.text = `${last.text}${/[\u4e00-\u9fff]$/.test(last.text) ? '' : ' '}${line.text}`.trim();
        last.y1 = line.bbox.y1;
      } else {
        messages.push({ from, text: line.text, y1: line.bbox.y1 });
      }
    });
    return messages;
  }

  function mergeSameRow(lines) {
    const sorted = lines.slice().sort((a, b) => (a.bbox.y0 - b.bbox.y0) || (a.bbox.x0 - b.bbox.x0));
    const out = [];
    sorted.forEach((line) => {
      const last = out[out.length - 1];
      if (last) {
        const overlap = Math.min(last.bbox.y1, line.bbox.y1) - Math.max(last.bbox.y0, line.bbox.y0);
        const minH = Math.min(last.bbox.y1 - last.bbox.y0, line.bbox.y1 - line.bbox.y0);
        const gap = line.bbox.x0 - last.bbox.x1;
        if (overlap > minH * 0.5 && gap > -10 && gap < 40) {
          last.text += line.text;
          last.bbox.x1 = Math.max(last.bbox.x1, line.bbox.x1);
          last.bbox.y0 = Math.min(last.bbox.y0, line.bbox.y0);
          last.bbox.y1 = Math.max(last.bbox.y1, line.bbox.y1);
          return;
        }
      }
      out.push({ text: line.text, bbox: Object.assign({}, line.bbox), conf: line.conf });
    });
    return out;
  }

  async function paddleChatMessages(img) {
    const ocr = await ensurePaddle();
    const [res] = await ocr.predict(img, {
      textDetLimitSideLen: 1600,
      textDetMaxSideLimit: 4000,
      textRecScoreThresh: 0.5
    });
    const width = (res.image && res.image.width) || img.naturalWidth;
    const items = (res.items || []).filter((i) => i && i.text && i.text.trim() && (i.score === undefined || i.score >= 0.5));
    let lines = items
      .map((i) => {
        const xs = (i.poly || []).map((p) => p[0]);
        const ys = (i.poly || []).map((p) => p[1]);
        if (!xs.length || !ys.length) return null;
        return {
          text: tidyChatText(i.text),
          bbox: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) },
          conf: (i.score === undefined ? 1 : i.score) * 100
        };
      })
      .filter((l) => l && l.text)
      .filter((l) => !/^\d{1,2}月\d{1,2}/.test(l.text))
      .filter((l) => !/^\d{1,2}[:：]\d{2}$/.test(l.text))
      .filter((l) => !/^\d{4}[.\-/]\d{1,2}/.test(l.text));

    const imageH = img.naturalHeight || (res.image && res.image.height) || 0;
    lines = lines.filter((line) => {
      const boxW = line.bbox.x1 - line.bbox.x0;
      if ((line.text === '我' || line.text === '他') && boxW < 120) return false;
      if (imageH && line.bbox.y0 < imageH * 0.12 && (line.text === '秦彻' || line.text === '纯宝')) return false;
      return true;
    });

    lines = mergeSameRow(lines);

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const W = canvas.width;
    const H = canvas.height;
    const isBubbleColor = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      const j = (y * W + x) * 4;
      const r = pixels[j];
      const g = pixels[j + 1];
      const b = pixels[j + 2];
      return (g > r + 25 && g > b + 20) || (b > r + 30 && b > g + 10);
    };
    lines.forEach((line) => {
      const cx = (line.bbox.x0 + line.bbox.x1) / 2;
      const cy = (line.bbox.y0 + line.bbox.y1) / 2;
      const points = [
        [line.bbox.x0 - 6, cy],
        [line.bbox.x1 + 6, cy],
        [cx, line.bbox.y0 - 5],
        [cx, line.bbox.y1 + 5]
      ];
      let votes = 0;
      let total = 0;
      points.forEach(([x, y]) => {
        if (x < 0 || x >= W || y < 0 || y >= H) return;
        total += 1;
        if (isBubbleColor(x, y)) votes += 1;
      });
      line.side = (total && votes >= 2) ? 'me' : 'him';
      if (total && votes === 1 && cx > W * 0.5) line.side = 'me';
    });

    lines.sort((a, b) => a.bbox.y0 - b.bbox.y0);
    return groupChatLines(lines, width);
  }

  async function ensureOcrWorker(onProgress) {
    state.ocrProgress = onProgress || null;
    if (state.ocrWorker) return state.ocrWorker;
    await loadScriptOnce('assets/vendor/tesseract/tesseract.min.js');
    if (!window.Tesseract) throw new Error('Tesseract unavailable');
    const base = new URL('assets/vendor/tesseract/', window.location.href).href;
    try {
      state.ocrWorker = await window.Tesseract.createWorker('chi_sim+eng', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base,
        langPath: base + 'lang',
        cacheMethod: 'none',
        logger: (m) => {
          if (state.ocrProgress && m && m.status) state.ocrProgress(m);
        }
      });
      await state.ocrWorker.setParameters({
        tessedit_pageseg_mode: '11',
        preserve_interword_spaces: '1',
        user_defined_dpi: '300'
      });
    } catch (e) {
      state.ocrWorker = null;
      throw e;
    }
    return state.ocrWorker;
  }

  function preprocessChatImage(img) {
    const targetW = 1100;
    let scale = Math.min(1.6, Math.max(1, targetW / img.naturalWidth));
    if (img.naturalWidth * scale > 1600) scale = 1600 / img.naturalWidth;
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const p = imageData.data;

    let blue = 0;
    let lumSum = 0;
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i];
      const g = p[i + 1];
      const b = p[i + 2];
      if (b > r + 30 && b > g + 20) blue += 1;
      lumSum += 0.299 * r + 0.587 * g + 0.114 * b;
    }
    const px = w * h;
    const blueRatio = blue / px;
    const avgLum = lumSum / px;

    if (blueRatio > 0.004) {
      normalizeBlueBubbles(imageData, w, h);
    } else if (avgLum < 92) {
      for (let i = 0; i < p.length; i += 4) {
        p[i] = 255 - p[i];
        p[i + 1] = 255 - p[i + 1];
        p[i + 2] = 255 - p[i + 2];
      }
    } else {
      for (let i = 0; i < p.length; i += 4) {
        const v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
        const c = Math.max(0, Math.min(255, (v - 128) * 1.2 + 128));
        p[i] = p[i + 1] = p[i + 2] = c;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return { canvas, width: w, height: h };
  }

  function sliceChatCanvas(canvas, maxH, overlap) {
    const slices = [];
    const limit = maxH || 1200;
    const step = Math.max(200, limit - (overlap || 100));
    for (let y = 0; y < canvas.height; y += step) {
      const h = Math.min(limit, canvas.height - y);
      const part = document.createElement('canvas');
      part.width = canvas.width;
      part.height = h;
      part.getContext('2d').drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      slices.push({ dataUrl: part.toDataURL('image/png'), offset: y });
      if (y + h >= canvas.height) break;
    }
    return slices;
  }

  function extractOcrLines(data, offset) {
    const shift = offset || 0;
    const out = [];
    const push = (line) => {
      if (!line || !line.bbox) return;
      out.push({
        text: line.text,
        bbox: { x0: line.bbox.x0, y0: line.bbox.y0 + shift, x1: line.bbox.x1, y1: line.bbox.y1 + shift },
        conf: line.confidence === undefined ? 100 : Number(line.confidence)
      });
    };
    if (Array.isArray(data.lines) && data.lines.length) {
      data.lines.forEach(push);
    } else {
      (data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((pg) => (pg.lines || []).forEach(push)));
    }
    return out;
  }

  function normalizeBlueBubbles(imageData, w, h) {
    const p = imageData.data;
    const n = w * h;
    const blue = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) {
      const j = i * 4;
      const r = p[j];
      const g = p[j + 1];
      const b = p[j + 2];
      if (b > r + 30 && b > g + 20) blue[i] = 1;
    }

    const outside = new Uint8Array(n);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    const seed = (idx) => {
      if (!outside[idx] && !blue[idx]) {
        outside[idx] = 1;
        queue[tail++] = idx;
      }
    };
    for (let x = 0; x < w; x += 1) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y += 1) { seed(y * w); seed(y * w + w - 1); }

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % w;
      const y = (idx / w) | 0;
      if (x > 0) seed(idx - 1);
      if (x < w - 1) seed(idx + 1);
      if (y > 0) seed(idx - w);
      if (y < h - 1) seed(idx + w);
    }

    for (let i = 0; i < n; i += 1) {
      const j = i * 4;
      if (blue[i]) {
        p[j] = 255; p[j + 1] = 255; p[j + 2] = 255;
      } else if (!outside[i]) {
        p[j] = 0; p[j + 1] = 0; p[j + 2] = 0;
      } else {
        const v = 0.299 * p[j] + 0.587 * p[j + 1] + 0.114 * p[j + 2];
        p[j] = p[j + 1] = p[j + 2] = v;
      }
    }
  }

  function tidyChatText(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2')
      .replace(/^[\s·•]+|[\s·•]+$/g, '')
      .trim();
  }

  function cleanChatLine(text, bbox, width) {
    let t = tidyChatText(text);
    if (bbox && bbox.x0 < width * 0.08) {
      t = t.replace(/^(他|我|fe|FE|1|\||<)\s*/, '');
    }
    if (bbox && bbox.x1 > width * 0.92) {
      t = t.replace(/\s+[我他”"]+$/, '');
    }
    t = t.replace(/[”"]+$/, '');
    t = t.replace(/([。！？!?])\s*[。，、]+\s*$/, '$1');
    return t.trim();
  }

  function parseChatLines(input, width, height) {
    let lines = Array.isArray(input) ? input : extractOcrLines(input, 0);
    const h = Number(height) || 0;
    lines = lines
      .map((l) => ({ text: cleanChatLine(l.text, l.bbox, width), bbox: l.bbox, conf: Number.isFinite(l.conf) ? l.conf : 100 }))
      .filter((l) => l.text && l.bbox && l.conf >= 40)
      .filter((l) => {
        const chars = (l.text.match(/[\u4e00-\u9fffA-Za-z0-9]/g) || []).length;
        return chars > 0 && chars / l.text.length >= 0.35;
      })
      .filter((l) => !/^\d{1,2}[:：]\d{2}$/.test(l.text))
      .filter((l) => !/^(上午|下午|晚上)?\s*\d{1,2}[:：]\d{2}$/.test(l.text))
      .filter((l) => !/^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}$/.test(l.text))
      .filter((l) => !h || (l.bbox.y0 > h * 0.045 && l.bbox.y1 < h * 0.965))
      .sort((a, b) => a.bbox.y0 - b.bbox.y0);

    lines = lines.filter((line, i, arr) => !arr.slice(0, i).some((prev) => (
      prev.text === line.text && Math.abs(prev.bbox.y0 - line.bbox.y0) < 28
    )));

    return groupChatLines(lines, width);
  }

  function openChatImport() {
    const modal = $('#chatImport');
    if (!modal) return;
    const previews = $('#chatImportPreviews');
    const editor = $('#chatImportEditor');
    const rows = $('#chatImportRows');
    const progress = $('#chatImportProgress');
    const save = $('#chatImportSave');
    const date = $('#chatImportDate');
    const minutes = $('#chatImportMinutes');
    const direction = $('#chatImportDirection');
    const error = $('#chatImportError');
    revokeImportUrls();
    if (previews) { previews.innerHTML = ''; previews.hidden = true; }
    if (editor) editor.hidden = true;
    if (rows) rows.innerHTML = '';
    if (progress) progress.textContent = '先填通话时长；聊天截图可选，不导入也可以直接保存通话。';
    if (save) save.disabled = false;
    if (date) date.value = todayISO();
    if (minutes) minutes.value = '';
    if (direction) direction.value = '来电';
    if (error) error.hidden = true;
    modal.hidden = false;
    updateAiStatus();
    lockScroll();
  }

  function revokeImportUrls() {
    state.importUrls.forEach((url) => URL.revokeObjectURL(url));
    state.importUrls = [];
  }

  function closeChatImport() {
    const modal = $('#chatImport');
    if (modal) modal.hidden = true;
    state.importToken += 1;
    revokeImportUrls();
    unlockScroll();
  }

  function updateChatImportCount() {
    const count = $('#chatImportCount');
    if (!count) return;
    const n = $$('#chatImportRows .chat-edit-row').filter((row) => {
      const ta = $('textarea', row);
      return ta && ta.value.trim();
    }).length;
    count.textContent = `${n} 条`;
  }

  function addChatRow(from, text) {
    const rows = $('#chatImportRows');
    if (!rows) return;
    const row = el('div', 'chat-edit-row');
    row.dataset.from = from === 'me' ? 'me' : 'him';
    const side = el('button', 'chat-edit-side', row.dataset.from === 'me' ? '我' : '他');
    side.type = 'button';
    side.addEventListener('click', () => {
      row.dataset.from = row.dataset.from === 'me' ? 'him' : 'me';
      side.textContent = row.dataset.from === 'me' ? '我' : '他';
    });
    const ta = document.createElement('textarea');
    ta.rows = 1;
    ta.value = text || '';
    ta.placeholder = row.dataset.from === 'me' ? '我说的话…' : '他说的话…';
    ta.addEventListener('input', updateChatImportCount);
    const del = el('button', 'chat-edit-del', '×');
    del.type = 'button';
    del.setAttribute('aria-label', '删除这句');
    del.addEventListener('click', () => {
      row.remove();
      updateChatImportCount();
    });
    row.append(side, ta, del);
    rows.appendChild(row);
    updateChatImportCount();
  }

  function renderChatEditor(messages) {
    const rows = $('#chatImportRows');
    const editor = $('#chatImportEditor');
    const save = $('#chatImportSave');
    if (!rows) return;
    rows.innerHTML = '';
    (messages.length ? messages : [{ from: 'him', text: '' }]).forEach((m) => addChatRow(m.from, m.text));
    if (editor) editor.hidden = false;
    if (save) save.disabled = false;
    updateChatImportCount();
  }

  async function ocrChatImage(img, token, label) {
    const progress = $('#chatImportProgress');
    const tag = label ? `${label} · ` : '';
    let messages = [];
    const aiCfg = readAiConfig();
    const textMode = aiReady(aiCfg) && aiCfg.mode === 'text';
    if (aiReady(aiCfg) && !textMode) {
      try {
        if (progress) progress.textContent = `${tag}AI 识别中…`;
        const aiMessages = await aiChatMessages(img);
        if (token !== state.importToken) return [];
        if (aiMessages.length) return aiMessages;
      } catch (e) {
        console.warn('AI OCR failed', e);
        if (progress) progress.textContent = `${tag}AI 识别失败，改用本地识别…`;
      }
    }
    try {
      if (progress) progress.textContent = `${tag}正在加载更准的中文识别模型…（第一次会慢一点）`;
      await ensurePaddle();
      if (token !== state.importToken) return [];
      if (progress) progress.textContent = `${tag}正在识别…`;
      messages = await paddleChatMessages(img);
    } catch (e) {
      console.warn('Paddle OCR unavailable', e);
    }
    if (token !== state.importToken) return [];

    if (!messages.length) {
      const prepared = preprocessChatImage(img);
      const slices = sliceChatCanvas(prepared.canvas, 1200, 100);
      if (progress) progress.textContent = `${tag}正在用备用模型识别…`;
      const worker = await ensureOcrWorker((m) => {
        if (!progress || token !== state.importToken) return;
        if (m.status === 'recognizing text') {
          progress.textContent = `${tag}备用识别… ${Math.round((m.progress || 0) * 100)}%`;
        }
      });
      if (token !== state.importToken) return [];
      const allLines = [];
      for (let i = 0; i < slices.length; i += 1) {
        if (token !== state.importToken) return [];
        if (progress && slices.length > 1) progress.textContent = `${tag}备用识别第 ${i + 1}/${slices.length} 段…`;
        const result = await worker.recognize(slices[i].dataUrl);
        allLines.push(...extractOcrLines(result.data, slices[i].offset));
      }
      if (token !== state.importToken) return [];
      messages = parseChatLines(allLines, prepared.width, prepared.height);
    }
    if (textMode && messages.length) {
      try {
        if (progress) progress.textContent = `${tag}DeepSeek 整理中…`;
        const cleaned = await aiCleanMessages(messages);
        if (token !== state.importToken) return [];
        if (cleaned.length) return cleaned;
      } catch (e) {
        console.warn('AI clean failed', e);
        if (progress) progress.textContent = `${tag}DeepSeek 整理失败，保留本地结果…`;
      }
    }
    return messages;
  }

  async function handleChatFiles(files) {
    const list = Array.from(files || []).filter((file) => {
      if (!file) return false;
      if (file.type) return file.type.indexOf('image/') === 0;
      return /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name || '');
    });
    if (!list.length) return;
    const token = ++state.importToken;
    const previews = $('#chatImportPreviews');
    const progress = $('#chatImportProgress');
    const collected = [];
    if (previews) previews.hidden = false;

    for (let i = 0; i < list.length; i += 1) {
      if (token !== state.importToken) return;
      const url = URL.createObjectURL(list[i]);
      state.importUrls.push(url);
      if (previews) {
        const pic = document.createElement('img');
        pic.src = url;
        pic.alt = `聊天截图 ${i + 1}`;
        previews.appendChild(pic);
      }
      if (progress) progress.textContent = `正在读取第 ${i + 1}/${list.length} 张…`;
      try {
        const img = await loadImage(url);
        if (token !== state.importToken) return;
        const messages = await ocrChatImage(img, token, `第 ${i + 1}/${list.length} 张`);
        if (token !== state.importToken) return;
        collected.push(...messages);
        if (progress) progress.textContent = `已完成 ${i + 1}/${list.length} 张，共 ${collected.length} 条…`;
      } catch (e) {
        console.warn('OCR image failed', e);
      }
    }

    if (token !== state.importToken) return;
    const editor = $('#chatImportEditor');
    const rowCount = $$('#chatImportRows .chat-edit-row').length;
    if (collected.length) {
      if (editor && !editor.hidden && rowCount > 0) {
        collected.forEach((m) => addChatRow(m.from, m.text));
        updateChatImportCount();
      } else {
        renderChatEditor(collected);
      }
    } else if (!editor || editor.hidden) {
      renderChatEditor([]);
    }
    const total = $$('#chatImportRows .chat-edit-row').filter((row) => {
      const ta = $('textarea', row);
      return ta && ta.value.trim();
    }).length;
    if (progress) {
      progress.textContent = collected.length
        ? `新增 ${collected.length} 条，共 ${total} 条，校对后保存。`
        : '这一批没识别出文字，已有的消息不会丢，可以继续补。';
    }
    const input = $('#chatFile');
    if (input) input.value = '';
  }

  function splitCsvLine(line) {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i += 1; }
          else quoted = false;
        } else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  function normalizeRecordMessages(arr) {
    return (Array.isArray(arr) ? arr : []).map((m) => {
      if (!m) return null;
      const sender = m.from ?? m.sender ?? m.isSender ?? m.IsSender ?? m.is_send ?? m.isSend ?? m.self;
      let from = 'him';
      if (typeof sender === 'boolean') from = sender ? 'me' : 'him';
      else if (typeof sender === 'number' || /^\d+$/.test(String(sender || ''))) from = Number(sender) === 1 ? 'me' : 'him';
      else if (/^(me|self|我|纯宝|clara|true)$/i.test(String(sender || '').trim())) from = 'me';
      else if (/^him$/i.test(String(sender || '').trim())) from = 'him';
      const text = m.text ?? m.content ?? m.StrContent ?? m.message ?? m.msg ?? m.body ?? '';
      return { from, text: String(text).replace(/\r/g, '').trim() };
    }).filter((m) => m && m.text);
  }

  function parseRecordJson(text) {
    const data = JSON.parse(text);
    const arr = Array.isArray(data)
      ? data
      : (data.messages || data.data || data.list || data.records || data.chat || []);
    return normalizeRecordMessages(arr);
  }

  function parseRecordCsv(text) {
    const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
    if (!rows.length) return [];
    const table = rows.map(splitCsvLine);
    const header = table[0].map((h) => h.trim().toLowerCase());
    const find = (names) => header.findIndex((h) => names.some((n) => h.includes(n)));
    let senderIdx = find(['issender', 'is_send', 'sender', 'from', 'is_self']);
    let textIdx = find(['strcontent', 'content', 'text', 'message', 'msg']);
    let typeIdx = find(['type']);
    let start = 1;
    if (textIdx < 0) {
      senderIdx = 0;
      textIdx = 1;
      typeIdx = -1;
      start = 0;
    }
    const messages = [];
    for (let i = start; i < table.length; i += 1) {
      const row = table[i];
      if (!row || row.length <= textIdx) continue;
      const body = String(row[textIdx] || '').trim();
      if (!body) continue;
      if (typeIdx >= 0) {
        const t = String(row[typeIdx] || '').trim();
        if (t === '10000') continue;
      }
      const rawSender = String(row[senderIdx] || '').trim();
      const from = /^(1|true|me|self|我|纯宝|clara)$/i.test(rawSender) ? 'me' : 'him';
      messages.push({ from, text: body });
    }
    return messages;
  }

  function parseRecordTxt(text) {
    const messages = [];
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    lines.forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      if (/^\d{4}[-/.]\d{1,2}/.test(line) || /^\d{1,2}:\d{2}/.test(line) || /^[-—]{2,}/.test(line)) return;
      const match = line.match(/^([^：:]{1,16})[：:]\s*(.+)$/);
      if (match && /^(我|他|她|纯宝|秦彻|凌晨|彻の传话筒|sylus|clara|me|him)$/i.test(match[1].trim())) {
        const from = /^(我|纯宝|clara|me)$/i.test(match[1].trim()) ? 'me' : 'him';
        messages.push({ from, text: match[2].trim() });
      } else if (messages.length && /^\s+/.test(raw)) {
        messages[messages.length - 1].text += `\n${line}`;
      } else {
        messages.push({ from: 'him', text: line });
      }
    });
    return messages;
  }

  function parseRecordHtml(text) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const nodes = doc.querySelectorAll('.message, .msg, .chat-message, .mes, [data-message]');
    const messages = [];
    nodes.forEach((node) => {
      const body = (node.textContent || '').trim();
      if (!body) return;
      const cls = `${node.className || ''} ${node.parentElement ? node.parentElement.className : ''}`;
      const from = /(^|\s)(me|self|right|send|sender-me|is-me)(\s|$)/i.test(cls) ? 'me' : 'him';
      messages.push({ from, text: body });
    });
    if (messages.length) return messages;
    return parseRecordTxt(doc.body ? doc.body.innerText : text);
  }

  async function handleChatRecordFile(file) {
    if (!file) return;
    const token = ++state.importToken;
    const progress = $('#chatImportProgress');
    const error = $('#chatImportError');
    try {
      if (progress) progress.textContent = '正在读取聊天记录文件…';
      const text = await file.text();
      const name = (file.name || '').toLowerCase();
      let messages = [];
      if (/\.json$/i.test(name)) messages = parseRecordJson(text);
      else if (/\.csv$/i.test(name)) messages = parseRecordCsv(text);
      else if (/\.html?$/i.test(name)) messages = parseRecordHtml(text);
      else messages = parseRecordTxt(text);
      if (token !== state.importToken) return;
      if (!messages.length) throw new Error('没有读到消息');
      renderChatEditor(messages);
      if (error) error.hidden = true;
      if (progress) progress.textContent = `已从文件读取 ${messages.length} 条，校对后保存。`;
      toast(`已读取 ${messages.length} 条`);
    } catch (e) {
      if (progress) progress.textContent = '这个文件没有读到聊天消息，检查格式后再试。';
      toast('聊天记录文件读取失败');
      console.warn('chat record file failed', e);
    } finally {
      const input = $('#chatRecordFile');
      if (input) input.value = '';
    }
  }

  function saveChatImport() {
    if (!state.admin) { requireAdmin(saveChatImport); return; }
    const minsInput = $('#chatImportMinutes');
    const error = $('#chatImportError');
    const raw = minsInput ? minsInput.value.trim() : '';
    const minutes = Number(raw);
    if (raw === '' || !Number.isFinite(minutes) || minutes < 0) {
      if (error) {
        error.hidden = false;
        error.textContent = '先填通话时长，再保存。';
      }
      if (minsInput) minsInput.focus();
      return;
    }
    if (error) error.hidden = true;

    const rows = $$('#chatImportRows .chat-edit-row');
    const messages = rows
      .map((row) => ({ from: row.dataset.from === 'me' ? 'me' : 'him', text: ($('textarea', row) || {}).value ? $('textarea', row).value.trim() : '' }))
      .filter((m) => m.text && !/^(凌晨|彻の传话筒|秦彻|纯宝)\s*[：:]/.test(m.text));
    const dateInput = $('#chatImportDate');
    const dirInput = $('#chatImportDirection');
    const direction = dirInput && dirInput.value === '来电' ? '来电' : '拨出';
    const rec = {
      id: uid('call'),
      date: (dateInput && dateInput.value) || todayISO(),
      direction,
      minutes,
      note: messages.length
        ? `通话 ${minutes} 分钟 · 聊天 ${messages.length} 条`
        : `通话 ${minutes} 分钟`
    };
    if (messages.length) rec.chat = messages;
    state.data.calls.unshift(rec);
    persist();
    renderAll();
    closeChatImport();
    go('calls', { hash: true, scroll: false });
    if (messages.length) {
      openChatView(rec);
      toast('通话与聊天已保存');
    } else {
      toast('通话已保存');
    }
  }

  function updateChatMeta() {
    const rec = findEntry('calls', state.chat);
    const meta = $('#chatMeta');
    if (!rec || !meta) return;
    const base = `${fmtDot(rec.date)} · ${rec.direction || '拨出'} · ${Number(rec.minutes) || 0} 分钟`;
    const locked = !(state.admin || state.chatUnlocked);
    meta.textContent = locked ? base : `${base} · ${(rec.chat || []).length} 条`;
  }

  function applyChatLock() {
    const panel = document.querySelector('.chat-panel');
    const lock = $('#chatLock');
    if (!panel || !lock) return;
    const locked = !(state.admin || state.chatUnlocked);
    panel.classList.toggle('is-locked', locked);
    lock.hidden = !locked;
    updateChatMeta();
  }

  function openChatView(rec) {
    const view = $('#chatView');
    const body = $('#chatBody');
    if (!view || !body || !rec) return;
    state.chat = rec.id;
    $('#chatTitle').textContent = partnerName();
    updateChatMeta();
    body.innerHTML = '';
    body.appendChild(el('p', 'chat-date', fmtCN(rec.date)));
    (rec.chat || []).forEach((m) => {
      const row = el('div', `chat-row chat-row--${m.from === 'me' ? 'me' : 'him'}`);
      row.appendChild(el('div', 'chat-bubble', m.text));
      body.appendChild(row);
    });
    view.hidden = false;
    applyChatLock();
    lockScroll();
    body.scrollTop = body.scrollHeight;
  }

  function closeChatView() {
    const view = $('#chatView');
    if (!view) return;
    view.hidden = true;
    state.chat = null;
    unlockScroll();
  }

  function deleteEntry(moduleId, id) {
    if (!state.admin) {
      requireAdmin(() => deleteEntry(moduleId, id));
      return;
    }
    if (moduleId === 'dossiers') {
      toast('档案固定为纯宝和秦彻，不能删除');
      return;
    }
    const module = MOD_BY_ID[moduleId];
    const rec = findEntry(moduleId, id);
    if (!module || !rec) return;

    let name = `这条${module.name}`;
    let extra = '';
    if (moduleId === 'lore') {
      name = `「${rec.name || '未命名'}」这条设定`;
      extra = '\n删除后，其他板块不会受影响。';
    }
    if (!window.confirm(`确定删除${name}？\n删除后无法恢复。${extra}`)) return;

    state.data[moduleId] = state.data[moduleId].filter((x) => x.id !== id);

    persist();
    renderAll();
    if (state.viewer && state.viewer.id === id) closeViewer();
    toast('已删除');
  }

  /* ══════════════════ 导航与全局事件 ══════════════════ */

  function initNav() {
    const nav = $('#siteNav');
    const burger = $('#navToggle');
    const bar = $('#scrollProgress');

    const onScroll = () => {
      const y = window.scrollY || 0;
      if (nav) nav.classList.toggle('is-scrolled', y > 24);
      if (bar) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = `${(max > 0 ? Math.min(1, y / max) * 100 : 0).toFixed(2)}%`;
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    if (burger && nav) {
      burger.addEventListener('click', () => {
        const open = nav.classList.toggle('is-open');
        burger.setAttribute('aria-expanded', String(open));
        burger.setAttribute('aria-label', open ? '收起菜单' : '打开菜单');
      });
    }

    const quick = $('#quickAdd');
    if (quick) quick.addEventListener('click', () => {
      if (state.tab === 'home') {
        go('daily', { scroll: false });
        openComposer('daily');
        return;
      }
      if (state.tab === 'dossiers') {
        const target = state.data.dossiers.find((x) => x.id === 'qinche') || state.data.dossiers[0];
        if (target) openComposer('dossiers', target.id);
        return;
      }
      openComposer(state.tab);
    });
  }

  function closeMobileNav() {
    const nav = $('#siteNav');
    const burger = $('#navToggle');
    if (nav) nav.classList.remove('is-open');
    if (burger) {
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', '打开菜单');
    }
  }

  function bindGlobal() {
    document.addEventListener('click', (e) => {
      const importBtn = e.target.closest('[data-import-chat]');
      if (importBtn) { e.preventDefault(); requireAdmin(() => openChatImport()); return; }

      const closeGateBtn = e.target.closest('[data-close-gate]');
      if (closeGateBtn) { closeGate(); return; }

      const closeAiBtn = e.target.closest('[data-close-ai]');
      if (closeAiBtn) { closeAiConfig(); return; }

      const closeImport = e.target.closest('[data-close-chat-import]');
      if (closeImport) { closeChatImport(); return; }

      const closeChat = e.target.closest('[data-close-chat]');
      if (closeChat) { closeChatView(); return; }

      const add = e.target.closest('[data-add]');
      if (add) { e.preventDefault(); openComposer(add.dataset.add); return; }

      const view = e.target.closest('[data-view]');
      if (view) { openViewer(view.dataset.module, view.dataset.view); return; }

      const edit = e.target.closest('[data-edit]');
      if (edit) { openComposer(edit.dataset.module, edit.dataset.edit); return; }

      const del = e.target.closest('[data-del]');
      if (del) { deleteEntry(del.dataset.module, del.dataset.del); return; }

      const chatRow = e.target.closest('[data-chat]');
      if (chatRow) {
        const rec = findEntry('calls', chatRow.dataset.chat);
        if (rec) openChatView(rec);
        return;
      }
    });

    const enter = $('#enterSplash');
    if (enter) enter.addEventListener('click', finishSplash);
    const skip = $('#skipSplash');
    if (skip) skip.addEventListener('click', finishSplash);

    const replay = $('#replaySplash');
    if (replay) replay.addEventListener('click', () => {
      try { sessionStorage.removeItem('sylcla.splash'); } catch (e) { /* ignore */ }
      window.scrollTo({ top: 0, behavior: 'auto' });
      startSplash();
      if (enter) enter.blur();
    });
    const replay2 = $('#replaySplash2');
    if (replay2) replay2.addEventListener('click', () => {
      try { sessionStorage.removeItem('sylcla.splash'); } catch (e) { /* ignore */ }
      window.scrollTo({ top: 0, behavior: 'auto' });
      startSplash();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const bgmPanel = $('#bgmPanel');
        if (bgmPanel && !bgmPanel.hidden) { closeBgmPanel(); return; }
        const aiModal = $('#aiConfig');
        if (aiModal && !aiModal.hidden) { closeAiConfig(); return; }
        const gateModal = $('#gate');
        if (gateModal && !gateModal.hidden) { closeGate(); return; }
        const chatModal = $('#chatView');
        if (chatModal && !chatModal.hidden) { closeChatView(); return; }
        const importModal = $('#chatImport');
        if (importModal && !importModal.hidden) { closeChatImport(); return; }
        if (composer && !composer.hidden) { closeComposer(); return; }
        if (reader && !reader.hidden) { closeViewer(); return; }
        if (splash && !splash.hidden) finishSplash();
      }
    });

    const gateForm = $('#gateForm');
    if (gateForm) gateForm.addEventListener('submit', submitGate);
    const bgmBtn = $('#bgmBtn');
    if (bgmBtn) bgmBtn.addEventListener('click', openBgmPanel);
    initBgmDrag();
    const bgmPanelClose = $('#bgmPanelClose');
    if (bgmPanelClose) bgmPanelClose.addEventListener('click', closeBgmPanel);
    const bgmExpand = $('#bgmExpand');
    if (bgmExpand) bgmExpand.addEventListener('click', toggleBgmExpanded);
    const bgmPlay = $('#bgmPlay');
    if (bgmPlay) bgmPlay.addEventListener('click', toggleBgm);
    const bgmMiniPlay = $('#bgmMiniPlay');
    if (bgmMiniPlay) bgmMiniPlay.addEventListener('click', toggleBgm);
    const bgmPrev = $('#bgmPrev');
    if (bgmPrev) bgmPrev.addEventListener('click', () => stepBgm(-1));
    const bgmNext = $('#bgmNext');
    if (bgmNext) bgmNext.addEventListener('click', () => stepBgm(1));
    const bgmList = $('#bgmList');
    if (bgmList) {
      bgmList.addEventListener('click', (e) => {
        const item = e.target.closest('[data-bgm-track]');
        if (!item) return;
        playBgm(Number(item.dataset.bgmTrack));
      });
    }
    armBgmGesture();
    const modeBtn = $('#modeBtn');
    if (modeBtn) {
      modeBtn.addEventListener('click', () => {
        if (state.admin) {
          setAdmin(false);
          toast('已回到访客模式');
        } else {
          openGate();
        }
      });
    }

    const chatFile = $('#chatFile');
    if (chatFile) {
      chatFile.multiple = true;
      chatFile.addEventListener('change', () => {
        const files = chatFile.files;
        if (files && files.length) handleChatFiles(files);
      });
    }
    const chatRecordPick = $('#chatRecordPick');
    if (chatRecordPick) {
      chatRecordPick.addEventListener('click', () => {
        const input = $('#chatRecordFile');
        if (input) { input.value = ''; input.click(); }
      });
    }
    const chatRecordFile = $('#chatRecordFile');
    if (chatRecordFile) {
      chatRecordFile.addEventListener('change', () => {
        const file = chatRecordFile.files && chatRecordFile.files[0];
        if (file) handleChatRecordFile(file);
      });
    }
    const importPick = $('#chatImportPick');
    if (importPick) {
      importPick.addEventListener('click', () => {
        const fileInput = $('#chatFile');
        if (fileInput) { fileInput.value = ''; fileInput.click(); }
      });
    }
    const aiConfigBtn = $('#aiConfigBtn');
    if (aiConfigBtn) aiConfigBtn.addEventListener('click', openAiConfig);
    const aiSave = $('#aiSave');
    if (aiSave) aiSave.addEventListener('click', saveAiConfig);
    const aiPreset = $('#aiPreset');
    if (aiPreset) {
      aiPreset.addEventListener('change', () => {
        const preset = AI_PRESETS[aiPreset.value];
        if (!preset) return;
        const base = $('#aiBase');
        const model = $('#aiModel');
        const mode = $('#aiMode');
        if (base) base.value = preset.base;
        if (model) model.value = preset.model;
        if (mode) mode.value = preset.mode || 'vision';
      });
    }
    const importAdd = $('#chatImportAdd');
    if (importAdd) importAdd.addEventListener('click', () => addChatRow('him', ''));
    const importSave = $('#chatImportSave');
    if (importSave) importSave.addEventListener('click', saveChatImport);
    const chatUnlock = $('#chatUnlock');
    if (chatUnlock) {
      chatUnlock.addEventListener('click', () => {
        if (state.admin) {
          applyChatLock();
          return;
        }
        openGate('chat');
      });
    }

    const chatDelete = $('#chatDelete');
    if (chatDelete) {
      chatDelete.addEventListener('click', () => {
        const id = state.chat;
        if (!id) return;
        closeChatView();
        deleteEntry('calls', id);
      });
    }

    if (composer) {
      composer.addEventListener('click', (e) => {
        if (e.target.closest('[data-close-composer]')) closeComposer();
      });
      const form = $('#composerForm');
      if (form) form.addEventListener('submit', submitComposer);
    }

    if (reader) {
      reader.addEventListener('click', (e) => {
        if (e.target.closest('[data-close-reader]')) closeViewer();
      });
      const del = $('#readerDelete');
      if (del) del.addEventListener('click', () => {
        if (state.viewer) deleteEntry(state.viewer.moduleId, state.viewer.id);
      });
      const edit = $('#readerEdit');
      if (edit) edit.addEventListener('click', () => {
        if (!state.viewer) return;
        const target = Object.assign({}, state.viewer);
        closeViewer();
        openComposer(target.moduleId, target.id);
      });
    }

    window.addEventListener('pageshow', () => {
      if (state.splashDone && document.body.classList.contains('is-locked')) {
        document.body.classList.remove('is-locked');
      }
    });
  }

  /* ══════════════════ 氛围 ══════════════════ */

  function initEmbers() {
    const canvas = $('#embers');
    if (!canvas || reduceMotion) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const hero = canvas.parentElement;
    let w = 0;
    let h = 0;
    let particles = [];
    let raf = null;
    let running = true;

    function spawn() {
      return {
        x: Math.random() * w,
        y: h + Math.random() * h * 0.5,
        r: Math.random() * 1.6 + 0.4,
        vy: Math.random() * 0.42 + 0.12,
        vx: (Math.random() - 0.5) * 0.22,
        a: Math.random() * 0.55 + 0.12,
        ph: Math.random() * Math.PI * 2
      };
    }

    function resize() {
      w = hero.clientWidth;
      h = hero.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(64, Math.round((w * h) / 34000));
      particles = new Array(count).fill(0).map(spawn);
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      particles.forEach((p) => {
        p.y -= p.vy;
        p.x += p.vx + Math.sin(t * 0.0006 + p.ph) * 0.16;
        if (p.y < -12) Object.assign(p, spawn(), { y: h + 8 });
        const fade = Math.max(0, 1 - Math.abs(p.y / h - 0.55) * 1.5);
        const alpha = p.a * fade;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 7);
        g.addColorStop(0, `rgba(255, 86, 104, ${alpha})`);
        g.addColorStop(0.4, `rgba(224, 22, 43, ${alpha * 0.55})`);
        g.addColorStop(1, 'rgba(224, 22, 43, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 7, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
      if (running) raf = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if (running && !raf) raf = requestAnimationFrame(draw);
    });
    raf = requestAnimationFrame(draw);
  }

  function initSiteEmbers() {
    const canvas = $('#siteEmbers');
    if (!canvas || reduceMotion) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0;
    let h = 0;
    let particles = [];
    let raf = null;
    let running = true;

    function spawn() {
      return {
        x: Math.random() * w,
        y: h + Math.random() * h * 0.4,
        r: Math.random() * 3.2 + 2.6,
        vy: Math.random() * 0.1 + 0.04,
        vx: (Math.random() - 0.5) * 0.06,
        a: Math.random() * 0.22 + 0.14,
        ph: Math.random() * Math.PI * 2
      };
    }

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(9, Math.min(13, Math.round((w * h) / 190000)));
      particles = new Array(count).fill(0).map(spawn);
      particles.forEach((p) => { p.y = Math.random() * h; });
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      particles.forEach((p) => {
        p.y -= p.vy;
        p.x += p.vx + Math.sin(t * 0.0005 + p.ph) * 0.12;
        if (p.y < -14) Object.assign(p, spawn(), { y: h + 10 });
        const fade = Math.max(0, 1 - Math.abs(p.y / h - 0.5) * 1.4);
        const alpha = p.a * fade;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 12);
        g.addColorStop(0, `rgba(255, 92, 108, ${alpha})`);
        g.addColorStop(0.35, `rgba(224, 22, 43, ${alpha * 0.5})`);
        g.addColorStop(1, 'rgba(224, 22, 43, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 12, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
      if (running) raf = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if (running && !raf) raf = requestAnimationFrame(draw);
    });
    raf = requestAnimationFrame(draw);
  }

  function initCursorGlow() {
    if (reduceMotion || !window.matchMedia('(pointer: fine)').matches) return;
    const glow = el('div', 'cursor-glow');
    glow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(glow);

    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx;
    let cy = ty;
    let active = false;

    window.addEventListener('pointermove', (e) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!active) {
        active = true;
        glow.style.opacity = '1';
        cx = tx;
        cy = ty;
      }
    }, { passive: true });

    (function loop() {
      cx += (tx - cx) * 0.09;
      cy += (ty - cy) * 0.09;
      glow.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;
      requestAnimationFrame(loop);
    })();
  }

  /* ══════════════════ 启动 ══════════════════ */

  function init() {
    state.data = loadData();
    initRouter();
    renderAll();
    initNav();
    bindGlobal();
    let adminSession = false;
    try { adminSession = sessionStorage.getItem('sylcla.admin') === '1'; } catch (e) { /* ignore */ }
    setAdmin(adminSession);
    initEmbers();
    initSiteEmbers();
    initCursorGlow();
    bootSplash();
    revealAll();

    if (!state.storageOK) {
      setTimeout(() => toast('当前环境无法写入本地存储 · 内容仅保留在本页'), 1200);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__sylcla = { state, go, currentRoute, openComposer, openViewer, closeViewer, closeComposer, renderAll, finishSplash, startSplash, openChatImport, openChatView };
})();
