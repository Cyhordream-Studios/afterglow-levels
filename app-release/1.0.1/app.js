(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const laneSymbols = ['←', '↑', '↓', '→'];
  const laneNames = ['LINKS', 'OBEN', 'UNTEN', 'RECHTS'];
  const laneNamesEn = ['LEFT', 'UP', 'DOWN', 'RIGHT'];
  const laneLabel = index => state.language === 'en' ? laneNamesEn[index] : laneNames[index];
  const difficultyOrder = ['Easy', 'Normal', 'Hard', 'Expert', 'Expert+'];
  const skins = [
    { id: 'neon-diamond', name: 'Neon Diamond', shape: 'diamond', color: '#fb45b7', price: 0, desc: 'Pink · Diamond' },
    { id: 'cyan-orbit', name: 'Cyan Orbit', shape: 'circle', color: '#43e8ed', price: 80, desc: 'Cyan · Circle' },
    { id: 'violet-core', name: 'Violet Core', shape: 'square', color: '#9572ff', price: 100, desc: 'Violett · Square' },
    { id: 'solar-flare', name: 'Solar Flare', shape: 'star', color: '#ffc34f', price: 120, desc: 'Gold · Star' },
    { id: 'mint-crystal', name: 'Mint Crystal', shape: 'hex', color: '#80f4b4', price: 140, desc: 'Mint · Hexagon' },
    { id: 'pulse-cross', name: 'Pulse Cross', shape: 'cross', color: '#ff647d', price: 150, desc: 'Coral · Cross' },
    { id: 'ice-ring', name: 'Ice Ring', shape: 'ring', color: '#9edaff', price: 175, desc: 'Ice · Ring' },
    { id: 'laser-chevron', name: 'Laser Chevron', shape: 'chevron', color: '#fa824e', price: 190, desc: 'Orange · Chevron' },
    { id: 'hyper-bolt', name: 'Hyper Bolt', shape: 'bolt', color: '#e7f368', price: 210, desc: 'Lime · Bolt' },
    { id: 'dream-wave', name: 'Dream Wave', shape: 'wave', color: '#d485ff', price: 240, desc: 'Lilac · Wave' },
  ];

  function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
  const defaults = { songs: [], selectedSongId: null, selectedDifficulty: 'Normal', keybinds: ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'], graphic: 'neon', postprocess: true, particles: true, drumEffects:true, language:'en', volume: 80, latency: 0, credits: 250, ownedSkins: ['neon-diamond'], equippedSkin: 'neon-diamond', bestScores: {}, leaderboard:[], levelsSeen:{} };
  let state;
  try {
    const saved = JSON.parse(localStorage.getItem('afterglow-state') || 'null');
    state = { ...defaults, ...(saved || {}) };
    if (!Array.isArray(state.songs)) state.songs = [];
    state.songs = state.songs.filter(song => song && typeof song === 'object' && !song.demo);
    if (!state.songs.some(s => s.id === state.selectedSongId)) state.selectedSongId = state.songs[0]?.id || null;
  } catch (_) { state = { ...defaults }; }
  state.songs = state.songs.filter(song => song && typeof song === 'object' && !song.demo);
  for (const song of state.songs) {
    song.difficulties = normalizeDifficulties(song.difficulties, Number(song.bpm) || 128);
    if (!Object.keys(song.difficulties).length) song.difficulties = { Easy: { bpm: Number(song.bpm) || 128, notes: [], events: [] } };
    song.title = String(song.title || 'Untitled Track');
    song.duration = Math.max(1, Number(song.duration) || 60);
  }
  state.bestScores = state.bestScores && typeof state.bestScores === 'object' ? state.bestScores : {};
  state.bestAccuracy = state.bestAccuracy && typeof state.bestAccuracy === 'object' ? state.bestAccuracy : {};
  state.leaderboard = Array.isArray(state.leaderboard) ? state.leaderboard.filter(run=>run&&typeof run==='object') : [];
  state.levelsSeen = state.levelsSeen && typeof state.levelsSeen === 'object' ? state.levelsSeen : {};
  state.cloudLevels = state.cloudLevels && typeof state.cloudLevels === 'object' ? state.cloudLevels : {};
  state.ownedSkins = Array.isArray(state.ownedSkins) ? state.ownedSkins : ['neon-diamond'];
  state.keybinds = Array.isArray(state.keybinds) && state.keybinds.length === 4 ? state.keybinds : [...defaults.keybinds];
  state.credits = Number.isFinite(Number(state.credits)) ? Math.max(0, Number(state.credits)) : defaults.credits;
  state.language = state.language === 'de' ? 'de' : 'en';
  state.drumEffects = state.drumEffects !== false;
  state.postprocess = state.postprocess !== false;
  state.particles = state.particles !== false;
  state.volume = Number.isFinite(Number(state.volume)) ? Math.max(0, Math.min(100, Math.round(Number(state.volume)))) : 80;
  state.latency = Number.isFinite(Number(state.latency)) ? Math.max(-150, Math.min(150, Math.round(Number(state.latency)))) : 0;
  state.graphic = ['neon', 'aurora', 'arcade'].includes(state.graphic) ? state.graphic : 'neon';
  const loadedSelectedSong = state.songs.find(song => song.id === state.selectedSongId);
  if (loadedSelectedSong && !loadedSelectedSong.difficulties[state.selectedDifficulty]) state.selectedDifficulty = Object.keys(loadedSelectedSong.difficulties)[0];

  const mapKey = (songId, diff) => `${songId}::${diff}`;
  const getSong = (id = state.selectedSongId) => state.songs.find(s => s.id === id) || state.songs[0];
  const getDifficulty = (song = getSong(), diff = state.selectedDifficulty) => song?.difficulties?.[diff] || Object.values(song?.difficulties || {})[0];
  function mappedDuration(song,map,floor=16){let duration=Math.max(Number(song?.duration)||0,floor);for(const note of map?.notes||[])duration=Math.max(duration,(Number(note.t)||0)+(Number(note.duration)||0)+1);for(const event of map?.events||[])duration=Math.max(duration,(Number(event.t)||0)+1);return duration;}
  let selectedEditorSong = state.selectedSongId;
  let selectedEditorDifficulty = state.selectedDifficulty;
  let editorLane = 0;
  let selectedObject = null;
  let cursorTime = 0;
  let copiedObject = null;
  let undoStack = [];
  let redoStack = [];
  let mediaUrls = new Map();
  let toastTimer;
  let previewTimeout;
  let editorPreviewRAF = 0;
  let editorPreviewPlaying = false;
  let editorPreviewStart = 0;
  let editorPreviewTime = 0;
  let audioElement = null;
  let audioContext = null;
  let game = null;
  let gameStarting = false;
  let gameRaf = 0;
  let keybindCapture = -1;
  let pendingAudio = null;
  let pendingCover = null;
  let objectUrlCache = new Map();
  let lastGameMessageTimer;
  let pendingNewAudio = null;
  let pendingNewCover = null;
  let appMode = 'player';
  let firebaseAuthState = { configured: false, signedIn: false, user: null };
  let contentVersion = '1.0.0';
  let levelsSyncPromise = null;
  let menuMusicGain = null;
  let menuMusicTimer = 0;
  let menuMusicIndex = 0;

  function persist() {
    try { localStorage.setItem('afterglow-state', JSON.stringify(state)); } catch (e) { toast('Speicher fast voll. Exportiere deine Songs als Level.'); }
  }
  const showToast = (message) => {
    const node = $('toast'); node.textContent = message; node.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 2600);
  };
  const toast = showToast;
  // Electron does not support window.prompt(); use an in-app modal instead.
  function askText(message, defaultValue = '', { password = false } = {}) {
    return new Promise((resolve) => {
      const existing = document.getElementById('afterglow-ask-modal');
      if (existing) existing.remove();
      const backdrop = document.createElement('div');
      backdrop.id = 'afterglow-ask-modal';
      backdrop.className = 'modal-backdrop';
      backdrop.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(4,6,14,.72);backdrop-filter:blur(6px);';
      backdrop.innerHTML = `<div style="width:min(420px,92vw);background:#121526;border:1px solid #2a3358;border-radius:16px;padding:22px 22px 18px;box-shadow:0 24px 60px #0008;color:#e8ecff;font-family:inherit">
        <div style="font-size:13px;letter-spacing:.04em;opacity:.7;margin-bottom:8px">AFTERGLOW</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:14px;line-height:1.35">${escapeHtml(message)}</div>
        <input id="afterglow-ask-input" type="${password ? 'password' : 'text'}" value="${attr(defaultValue)}" style="width:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;border:1px solid #3a4570;background:#0b0e1a;color:#fff;font-size:14px;outline:none;margin-bottom:16px" />
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button type="button" data-ask="cancel" style="padding:10px 16px;border-radius:10px;border:1px solid #3a4570;background:transparent;color:#c8d0f0;cursor:pointer">Abbrechen</button>
          <button type="button" data-ask="ok" style="padding:10px 18px;border-radius:10px;border:0;background:linear-gradient(135deg,#fb45b7,#9572ff);color:#fff;font-weight:600;cursor:pointer">OK</button>
        </div>
      </div>`;
      const finish = (value) => { backdrop.remove(); resolve(value); };
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(null); });
      backdrop.querySelector('[data-ask="cancel"]').addEventListener('click', () => finish(null));
      backdrop.querySelector('[data-ask="ok"]').addEventListener('click', () => finish(backdrop.querySelector('#afterglow-ask-input').value));
      backdrop.querySelector('#afterglow-ask-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(backdrop.querySelector('#afterglow-ask-input').value); }
        if (e.key === 'Escape') { e.preventDefault(); finish(null); }
      });
      document.body.appendChild(backdrop);
      requestAnimationFrame(() => backdrop.querySelector('#afterglow-ask-input').focus());
    });
  }
  function mediaDb() {
    if (!window.indexedDB) return Promise.reject(new Error('IndexedDB nicht verfügbar'));
    if (!window._afterglowDbPromise) window._afterglowDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('afterglow-media', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('media');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return window._afterglowDbPromise;
  }
  async function mediaPut(key, blob) {
    if (!blob) return;
    const db = await mediaDb();
    return new Promise((resolve, reject) => { const tx = db.transaction('media', 'readwrite'); tx.objectStore('media').put(blob, key); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  }
  async function mediaGet(key) {
    if (!key) return null;
    const db = await mediaDb();
    return new Promise((resolve, reject) => { const r = db.transaction('media').objectStore('media').get(key); r.onsuccess = () => resolve(r.result || null); r.onerror = () => reject(r.error); });
  }
  async function mediaDelete(key) {
    if (!key) return;
    try { const db=await mediaDb(); await new Promise((resolve,reject)=>{const tx=db.transaction('media','readwrite');tx.objectStore('media').delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}); } catch (_) { /* metadata deletion still succeeds when media storage is unavailable */ }
  }
  function cacheSongMedia(song, audioBlob, coverBlob) {
    if (audioBlob) mediaUrls.set(`${song.id}:audio`, URL.createObjectURL(audioBlob));
    if (coverBlob) {
      const url = URL.createObjectURL(coverBlob);
      mediaUrls.set(`${song.id}:cover`, url);
      objectUrlCache.set(`${song.id}:cover`, url);
    }
  }
  async function storeSongMedia(song, audioBlob, coverBlob) {
    await mediaPut(song.audioKey, audioBlob);
    if (coverBlob) await mediaPut(song.coverKey, coverBlob);
    cacheSongMedia(song, audioBlob, coverBlob);
  }
  function releaseSongMedia(song) {
    if (!song) return;
    for (const kind of ['audio', 'cover']) {
      const key = `${song.id}:${kind}`;
      const url = mediaUrls.get(key) || objectUrlCache.get(key);
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
      mediaUrls.delete(key);
      objectUrlCache.delete(key);
      mediaDelete(kind === 'audio' ? song.audioKey : song.coverKey);
    }
  }
  async function songMedia(song, kind) {
    if (!song) return null;
    const cacheKey = `${song.id}:${kind}`;
    if (mediaUrls.has(cacheKey)) return mediaUrls.get(cacheKey);
    try {
      const blob = await mediaGet(kind === 'audio' ? song.audioKey : song.coverKey);
      if (blob) { const url = URL.createObjectURL(blob); mediaUrls.set(cacheKey, url); return url; }
    } catch (_) { /* stored media may be unavailable in restricted browser sessions */ }
    if (kind === 'audio' && song.assetUrl) { const url = new URL(song.assetUrl,window.location.href).href; mediaUrls.set(cacheKey,url); return url; }
    return null;
  }
  function selectedSkin() { return skins.find(s => s.id === state.equippedSkin) || skins[0]; }
  function setGraphic(value) {
    const next = ['neon', 'aurora', 'arcade'].includes(value) ? value : 'neon';
    state.graphic = next;
    document.body.dataset.graphic = next;
    document.body.classList.remove('graphic-neon', 'graphic-aurora', 'graphic-arcade');
    document.body.classList.add(`graphic-${next}`);
    const overlay = $('game-overlay');
    if (overlay) overlay.dataset.graphic = next;
    document.querySelectorAll('.graphic-choice').forEach(b => b.classList.toggle('selected', b.dataset.graphic === next));
  }
  function renderAll() { renderSongs(); renderEditor(); renderShop(); renderSettings(); setGraphic(state.graphic); $('song-count').textContent = String(state.songs.length).padStart(2, '0'); applyLanguage(); }

  const songGrid = $('song-grid');
  function renderSongs(filter = '') {
    const song = getSong();
    $('hero-total').textContent=String(state.songs.length).padStart(2,'0');
    if(!song){
      $('hero-title').innerHTML=`${tr('KEIN SONG','NO SONG')}<br><em>${tr('HOCHLADEN','UPLOAD')}</em>`;$('hero-bpm').textContent='— BPM';$('hero-artist').textContent=tr('Lade eine OGG-Datei hoch, um ein Level zu generieren.','Upload an OGG file to generate a level.');$('hero-best').textContent='—';$('hero-accuracy').textContent='—';$('hero-play').disabled=true;$('preview-btn').disabled=true;$('song-heading-count').textContent='00 TRACKS';songGrid.innerHTML=`<div class="empty-inspector"><span>♫</span><b>${tr('NOCH KEINE SONGS','NO SONGS YET')}</b><small>${tr('Öffne Generate Level und lade einen OGG-Song hoch.','Open Generate Level and upload an OGG song.')}</small></div>`;return;
    }
    $('hero-play').disabled=false;$('preview-btn').disabled=false;
    // Keep compact one-word titles on the first line and the remainder in the accent color.
    const titleParts = escapeHtml(song.title).split(/\s+/);
    $('hero-title').innerHTML = titleParts.length > 1 ? `${titleParts[0]}<br><em>${titleParts.slice(1).join(' ')}</em>` : `${titleParts[0]}<br><em>TRACK</em>`;
    const diff = getDifficulty(song, state.selectedDifficulty);
    $('hero-bpm').textContent = `${diff?.bpm || song.bpm} BPM`;
    $('hero-artist').textContent = `${song.artist || 'UNKNOWN ARTIST'} · ${formatDuration(song.duration || 32)}`;
    $('hero-total').textContent = String(state.songs.length).padStart(2, '0');
    const best = state.bestScores[mapKey(song.id, state.selectedDifficulty)];
    $('hero-best').textContent = best ? best.toLocaleString('de-DE') : '—';
    $('hero-accuracy').textContent = best ? `${state.bestAccuracy?.[mapKey(song.id, state.selectedDifficulty)] || '100'}%` : '—';
    const q = filter.trim().toLowerCase();
    const visibleSongs = state.songs.filter(s => `${s.title} ${s.artist}`.toLowerCase().includes(q));
    $('song-heading-count').textContent = `${String(visibleSongs.length).padStart(2, '0')} TRACK${visibleSongs.length === 1 ? '' : 'S'}`;
    songGrid.innerHTML = visibleSongs.map((s) => {      const difficulties = Object.keys(s.difficulties || {}).sort((a,b) => difficultyOrder.indexOf(a)-difficultyOrder.indexOf(b));
      const cover = objectUrlCache.get(`${s.id}:cover`);
      return `<article class="song-card ${s.id === state.selectedSongId ? 'selected' : ''}" data-song="${attr(s.id)}"><div class="song-cover">${cover ? `<img src="${attr(cover)}" alt="">` : '<b>✦</b>'}</div><div class="song-meta"><b>${escapeHtml(s.title)}</b><small>${escapeHtml(s.artist || 'Unknown artist')} · ${Number(s.bpm || 128)} BPM</small><div class="diff-pills">${difficulties.map(d => `<button class="diff-pill ${s.id === state.selectedSongId && d === state.selectedDifficulty ? 'active' : ''}" data-difficulty="${attr(d)}">${escapeHtml(d.toUpperCase())}</button>`).join('')}</div></div>${deleteControlFor(s)}<button class="song-play" data-play-song="${attr(s.id)}" title="${tr('Song spielen','Play song')}">▶</button></article>`;
    }).join('') || `<div class="empty-inspector"><span>♫</span><b>${tr('KEIN TRACK GEFUNDEN','NO TRACK FOUND')}</b><small>${tr('Ändere die Suche oder lade einen OGG-Song hoch.','Change your search or upload an OGG song.')}</small></div>`;
    songGrid.querySelectorAll('.song-card').forEach(card => card.addEventListener('click', (e) => {
      const deleteBtn=e.target.closest('[data-delete-song]');if(deleteBtn){e.stopPropagation();deleteSong(deleteBtn.dataset.deleteSong);return;}
      const devDeleteBtn=e.target.closest('[data-dev-delete]');if(devDeleteBtn){e.stopPropagation();developerDeleteLevel(devDeleteBtn.dataset.devDelete);return;}
      const diffBtn = e.target.closest('[data-difficulty]');
      if (diffBtn) { state.selectedSongId = card.dataset.song; state.selectedDifficulty = diffBtn.dataset.difficulty; persist(); renderSongs($('song-search').value); renderEditor(); return; }
      const playBtn = e.target.closest('[data-play-song]');
      if (playBtn) { state.selectedSongId = card.dataset.song; if (!getSong().difficulties[state.selectedDifficulty]) state.selectedDifficulty = Object.keys(getSong().difficulties)[0]; persist(); renderSongs($('song-search').value); startGame(); return; }
      state.selectedSongId = card.dataset.song;
      if (!getSong().difficulties[state.selectedDifficulty]) state.selectedDifficulty = Object.keys(getSong().difficulties)[0];
      persist(); renderSongs($('song-search').value);
    }));
    loadCoverThumbnails();
  }
  // Players never delete levels. Only the developer can remove a level, and that removes it for everyone.
  function deleteControlFor(song) {
    if (appMode !== 'developer' || !song.packageId) return '';
    return `<button class="song-delete" data-dev-delete="${attr(song.packageId)}" title="${tr('Level global löschen (Developer)','Delete level globally (developer)')}">×</button>`;
  }
  // Remember the GitHub token: localStorage + encrypted main-process store.
  // Prompt only when neither place has a usable token.
  async function ensureDeveloperKey({ forcePrompt = false } = {}) {
    let key = localStorage.getItem('afterglow-developer-key') || '';
    if (key && !forcePrompt) return key;
    if (!forcePrompt && window.afterglowDesktop?.getContext) {
      try {
        const ctx = await window.afterglowDesktop.getContext();
        if (ctx?.deviceKey) return ''; // main process already has the encrypted token
      } catch (_) { /* fall through to prompt */ }
    }
    if (forcePrompt) await forgetDeveloperKey();
    key = await askText(tr('GitHub-Token eingeben (Classic, repo-Rechte):','Enter GitHub token (classic, repo scope):'), '', { password: true }) || '';
    key = key.trim();
    if (!key) return '';
    localStorage.setItem('afterglow-developer-key', key);
    if (window.afterglowDesktop?.setDeveloperKey) {
      try { await window.afterglowDesktop.setDeveloperKey(key); } catch (error) {
        localStorage.removeItem('afterglow-developer-key');
        throw error;
      }
    }
    return key;
  }
  async function rememberDeveloperKey(key) {
    const value = String(key || '').trim();
    if (!value) return;
    localStorage.setItem('afterglow-developer-key', value);
    if (window.afterglowDesktop?.setDeveloperKey) {
      try { await window.afterglowDesktop.setDeveloperKey(value); } catch (_) { /* ignore */ }
    }
  }
  async function forgetDeveloperKey() {
    localStorage.removeItem('afterglow-developer-key');
    if (window.afterglowDesktop?.clearDeveloperKey) {
      try { await window.afterglowDesktop.clearDeveloperKey(); } catch (_) {}
    } else if (window.afterglowDesktop?.setDeveloperKey) {
      try { await window.afterglowDesktop.setDeveloperKey(''); } catch (_) {}
    }
  }
  async function changeDeveloperKey() {
    await forgetDeveloperKey();
    try {
      const key = await ensureDeveloperKey({ forcePrompt: true });
      if (key) toast(tr('GitHub-Token gespeichert.','GitHub token saved.'));
      else toast(tr('Kein Token eingegeben.','No token entered.'));
      if ($('developer-status')) $('developer-status').textContent = key ? tr('Token OK','Token OK') : tr('Kein Token','No token');
    } catch (error) {
      toast(error.message || String(error));
      if ($('developer-status')) $('developer-status').textContent = error.message || String(error);
    }
  }
  async function developerDeleteLevel(packageId) {
    if (appMode !== 'developer' || !packageId || !window.afterglowDesktop) return;
    const song = state.songs.find(item => item.packageId === packageId);
    let key = await ensureDeveloperKey();
    if (key === '' && !(await window.afterglowDesktop.getContext().catch(() => ({})))?.deviceKey) {
      toast(tr('Ohne GitHub-Token kann nicht gelöscht werden.','A GitHub token is required to delete.'));
      return;
    }
    if (!confirm(tr(`Level „${song?.title || packageId}“ wirklich für alle Spieler löschen?`,`Really delete the level “${song?.title || packageId}” for all players?`))) return;
    try {
      const result = await window.afterglowDesktop.deleteLevel(packageId, key);
      if (key) await rememberDeveloperKey(key);
      toast(`${tr('Global gelöscht:','Deleted globally:')} ${result.packageId}`);
      state.songs = state.songs.filter(item => item.packageId !== packageId);
      delete state.cloudLevels[packageId];
      persist(); renderAll(); renderDeveloperCloud();
    } catch (error) {
      const message = error?.message || String(error);
      if (/GitHub-Token stimmt nicht|401|abgelaufen|Kein GitHub-Token/i.test(message)) {
        forgetDeveloperKey();
        const retry = await ensureDeveloperKey({ forcePrompt: true });
        if (retry) {
          try {
            const result = await window.afterglowDesktop.deleteLevel(packageId, retry);
            await rememberDeveloperKey(retry);
            toast(`${tr('Global gelöscht:','Deleted globally:')} ${result.packageId}`);
            state.songs = state.songs.filter(item => item.packageId !== packageId);
            delete state.cloudLevels[packageId];
            persist(); renderAll(); renderDeveloperCloud();
            return;
          } catch (err2) {
            toast(`${tr('Löschen fehlgeschlagen:','Delete failed:')} ${err2.message}`);
            return;
          }
        }
      }
      toast(`${tr('Löschen fehlgeschlagen:','Delete failed:')} ${message}`);
    }
  }
  function deleteSong(id) {
    const song=state.songs.find(item=>item.id===id);if(!song)return;
    if(!confirm(tr(`Song „${song.title}“ und seine gespeicherten Dateien wirklich löschen?`,`Delete “${song.title}” and its saved media?`)))return;
    if (audioElement && state.selectedSongId === id) stopPreview();
    if (game?.song?.id === id) exitGame();
    state.songs=state.songs.filter(item=>item.id!==id);releaseSongMedia(song);
    for(const key of Object.keys(state.bestScores))if(key.startsWith(`${id}::`))delete state.bestScores[key];
    for(const key of Object.keys(state.bestAccuracy||{}))if(key.startsWith(`${id}::`))delete state.bestAccuracy[key];
    if(state.selectedSongId===id){state.selectedSongId=state.songs[0]?.id||null;state.selectedDifficulty=Object.keys(getSong()?.difficulties||{})[0]||'Normal';}
    if(selectedEditorSong===id){selectedEditorSong=state.selectedSongId;selectedEditorDifficulty=state.selectedDifficulty;selectedObject=null;clearHistory();}
    persist();renderAll();toast(tr('Song und Dateien gelöscht.','Song and media deleted.'));
  }
  async function loadCoverThumbnails() {
    for (const song of state.songs) {
      if (!song.coverKey || objectUrlCache.has(`${song.id}:cover`)) continue;
      const url = await songMedia(song, 'cover');
      if (url) { objectUrlCache.set(`${song.id}:cover`, url); const card = songGrid.querySelector(`[data-song="${cssEscape(song.id)}"] .song-cover`); if (card && !card.querySelector('img')) card.insertAdjacentHTML('afterbegin', `<img src="${attr(url)}" alt="">`); }
    }
  }
  function formatDuration(seconds) { const s = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function attr(s) { return escapeHtml(s); }
  function cssEscape(s) { return window.CSS?.escape ? CSS.escape(s) : String(s).replace(/[^a-z0-9_-]/gi, '\\$&'); }
  const localePairs=[
    ['DEIN STUDIO','YOUR STUDIO'],['Spielen','Play'],['Einstellungen','Settings'],['DEIN NÄCHSTER RUN','YOUR NEXT RUN'],['Warte nicht auf den Beat.','Don’t wait for the beat.'],['DEIN RHYTHMUS. DEIN LICHT.','YOUR RHYTHM. YOUR LIGHT.'],['FÜHL DEN','FEEL THE'],['Vier Spuren. Ein Flow. Mach jeden Song zu deiner eigenen Lightshow.','Four lanes. One flow. Turn every song into your own lightshow.'],['SONG IMPORTIEREN','IMPORT SONG'],['FEATURED TRACK','FEATURED TRACK'],['JETZT SPIELEN','PLAY NOW'],['KURZ REINHÖREN','QUICK PREVIEW'],['VORSCHAU LÄUFT','PREVIEW PLAYING'],['DEINE BÜHNE','YOUR STAGE'],['SONGAUSWAHL','SONG LIBRARY'],['Song suchen …','Search songs…'],['DEINE LANES','YOUR LANES'],['TASTEN ÄNDERN','CHANGE KEYS'],['BUILD · PREVIEW · PLAY','LISTEN · GENERATE · PLAY'],['Erstelle ein Level, mappe im vertikalen Flow und sieh deine Lightshow sofort.','Upload an OGG song to generate a full level and preview its lightshow.'],['NEUES LEVEL','NEW LEVEL'],['LEVEL EXPORTIEREN','EXPORT LEVEL'],['SONG / LEVEL','SONG / LEVEL'],['UMGEBUNG','ENVIRONMENT'],['SPEICHERN','SAVE'],['Click setzt eine Note · Shift+Click setzt den Cursor · nach unten scrollen','Click to add a note · Shift+Click to move the cursor · scroll down'],['GRID','GRID'],['ZOOM','ZOOM'],['COPY','COPY'],['PASTE','PASTE'],['LÖSCHEN','DELETE'],['WÄHLE EINE NOTE','SELECT A NOTE'],['Klicke links eine Lane im Mapping.','Click a lane in the map.'],['LANE','LANE'],['ZEIT (SEK.)','TIME (SEC.)'],['NOTE ART','NOTE TYPE'],['Tap Note','Tap note'],['FORM','SHAPE'],['NOTE LÖSCHEN','DELETE NOTE'],['EVENT TYP','EVENT TYPE'],['Farbwechsel','Color change'],['Rotation','Rotation'],['Smooth Keyframe','Smooth keyframe'],['Flash / Splash','Flash / splash'],['FARBE','COLOR'],['MOVE X %','MOVE X %'],['MOVE Y %','MOVE Y %'],['ROTATION °','ROTATION °'],['EVENT LÖSCHEN','DELETE EVENT'],['AUTOSAVE AKTIV','AUTOSAVE ON'],['Notes, Events und Keyframes bleiben lokal.','Notes, events, and keyframes are saved locally.'],['AKTIVE LANE','ACTIVE LANE'],['NEUER TRACK','NEW TRACK'],['BRING DEINEN','BRING YOUR'],['BEAT.','BEAT.'],['Importiere deinen Song und gestalte danach Cover, Difficulty und Lightshow.','Import your song, then build its cover, difficulty, and lightshow.'],['OGG ODER AUDIO-DATEI','OGG AUDIO FILE'],['Audiodatei auswählen','Choose an audio file'],['COVER ART','COVER ART'],['Optional · eigenes Bild wählen','Optional · choose cover art'],['TRACK NAME','TRACK NAME'],['Dein Name','Your name'],['TRACK HINZUFÜGEN','ADD TRACK'],['LEVEL-ORDNER LADEN','LOAD LEVEL FOLDER'],['LEVEL-ZIP LADEN','LOAD LEVEL ZIP'],['OHNE COVER VERWENDEN WIR EIN PASSENDES AFTERGLOW ARTWORK.','NO COVER? WE’LL USE AFTERGLOW ARTWORK.'],['FULL TRACK ANALYSIS','FULL TRACK ANALYSIS'],['NEUES','NEW'],['LEVEL.','LEVEL.'],['Upload an OGG song. The generator listens through the full track, detects its BPM, and builds five difficulties.','Upload an OGG song. The generator analyzes the full track, detects its BPM, and builds five difficulties.'],['LEVEL NAME','LEVEL NAME'],['Wähle eine OGG-Datei zum Generieren','Choose an OGG file to generate'],['OGG SONG · REQUIRED','OGG SONG · REQUIRED'],['COVER (OPTIONAL)','COVER (OPTIONAL)'],['Eigenes Bild verwenden','Choose cover art'],['WARTET AUF OGG','WAITING FOR OGG'],['LEVEL ERSTELLEN','GENERATE LEVEL'],['MACH DEINE NOTES ZU DEINEN NOTES','MAKE YOUR NOTES YOURS'],['NOTE','NOTE'],['NOTE SHOP','NOTE SHOP'],['Zehn Farben und Formen für deine eigene Lichtsignatur.','Ten colors and shapes for your own light signature.'],['AKTUELL AUSGERÜSTET','CURRENTLY EQUIPPED'],['Dein Look erscheint in jeder Lane.','Your style appears in every lane.'],['AUSRÜSTEN','EQUIP'],['KAUFEN','BUY'],['DEINE SETTINGS.','YOUR SETTINGS.'],['STELL DEIN STUDIO EIN','SET UP YOUR STUDIO'],['Finde dein perfektes Timing und stell das Licht ganz auf dich ein.','Find your timing and tune the lights to your style.'],['KEYBINDS','KEYBINDS'],['Wähle deine vier persönlichen Lane-Tasten.','Choose your four lane keys.'],['ZURÜCKSETZEN','RESET'],['AUDIO & TIMING','AUDIO & TIMING'],['Kalibriere Lautstärke und Audio-Latenz.','Calibrate volume and audio latency.'],['MASTER VOLUME','MASTER VOLUME'],['AUDIO LATENZ','AUDIO LATENCY'],['Negativ = Notes früher · positiv = Notes später.','Negative = notes earlier · positive = notes later.'],['Kalibrierung wird beim Spielen berücksichtigt.','Timing calibration applies in game.'],['GRAFIK & POST PROCESS','GRAPHICS & POST PROCESSING'],['Wähle den Vibe deiner Bühne.','Choose your stage style.'],['Glow & Grid','Glow & grid'],['Soft Light','Soft light'],['Post Processing','Post processing'],['Bloom, Glow & chromatische Lichtakzente','Bloom, glow, and color accents'],['Partikeleffekte','Particle effects'],['Mehr Licht, wenn du den Beat triffst','More light when you hit the beat'],['Kick und Snare synchron zum Level-Tempo','Kick and snare synced to the level tempo'],['Post Processing','Post processing'],['LOCAL PLAY','LOCAL PLAY'],['SCORE','SCORE'],['VERLASSEN','EXIT'],['COMBO','COMBO'],['ACCURACY','ACCURACY'],['Drücke eine beliebige Lane zum Starten','Press any lane to start'],['Drücke Leertaste oder Play zum Weiterspielen','Press Space or Play to resume'],['NOCH EIN RUN','PLAY AGAIN'],['KEIN SONG','NO SONG'],['HOCHLADEN','UPLOAD'],['Lade eine OGG-Datei hoch, um ein Level zu generieren.','Upload an OGG file to generate a level.'],['NOCH KEINE SONGS','NO SONGS YET'],['Öffne Generate Level und lade einen OGG-Song hoch.','Open Generate Level and upload an OGG song.'],['Ändere die Suche oder lade einen OGG-Song hoch.','Change your search or upload an OGG song.'],['KEIN TRACK GEFUNDEN','NO TRACK FOUND'],['Song löschen','Delete song'],['Song spielen','Play song'],['LINKS','LEFT'],['OBEN','UP'],['UNTEN','DOWN'],['RECHTS','RIGHT'],['ANALYSE FEHLGESCHLAGEN','ANALYSIS FAILED'],['Der Generator akzeptiert nur OGG-Dateien.','The generator only accepts OGG files.'],['Nur .ogg-Dateien werden unterstützt','Only .ogg files are supported'],['Die Audiodatei konnte nicht analysiert werden. Nutze einen aktuellen Browser mit OGG-Unterstützung.','Audio analysis failed. Use a current browser with OGG support.'],['Lade zuerst einen Song im .ogg-Format hoch.','Upload an .ogg song before generating.'],['Der Song konnte nicht vollständig analysiert werden. Prüfe die OGG-Datei und versuche es erneut.','The full track could not be analyzed. Check the OGG file and try again.'],['Level generiert: Easy bis Expert+.','Level generated: Easy through Expert+.'],['Song und Dateien gelöscht.','Song and media deleted.'],['Dieser Track hat keine Audiodatei. Lade einen OGG-Song hoch.','This track has no audio. Upload an OGG song.'],['Lade zuerst einen OGG-Song hoch, um weiterzumachen.','Upload an OGG song before continuing.'],['Dieses Level hat keinen Song. Lade eine OGG-Datei hoch.','This level has no song. Upload an OGG file.'],['Song konnte nicht gestartet werden.','Could not start the song.'],['SONG WIRD GELESEN…','READING FULL TRACK…'],['BPM UND BEATS IM GANZEN SONG ANALYSIEREN…','ANALYZING BPM AND BEATS ACROSS THE FULL SONG…'],['FERTIG','DONE'],['GENERATOR','GENERATOR'],['SPIELEN','PLAY'],['EINSTELLUNGEN','SETTINGS'],['Level-Generator','Generate Level'],['Neues Level','Generate level'],['Fertig · Easy bis Expert+','Done · Easy through Expert+'],['Song importiert · Easy Mapping erstellt.','Song imported · Easy map created.'],['Pfeiltasten wiederhergestellt.','Arrow keys restored.'],['Diese Taste ist schon einer anderen Lane zugewiesen.','That key is already assigned to another lane.'],['Taste geändert.','Key changed.']
    ,['Level-Generator','Generate Level'],['AUS OGG GENERIEREN','GENERATE FROM OGG'],['Lade einen OGG-Song hoch. AFTERGLOW analysiert den ganzen Track und generiert ein spielbares Level.','Upload an OGG song. AFTERGLOW analyzes the full track and generates a playable level.'],['Lade eine OGG-Datei hoch. Der Generator analysiert den gesamten Song, erkennt das Tempo und erstellt fünf Schwierigkeitsgrade.','Upload an OGG file. The generator analyzes the full song, detects its tempo, and creates five difficulties.'],['LEVEL-NAME','LEVEL NAME'],['OGG-SONG · ERFORDERLICH','OGG SONG · REQUIRED'],['LEVEL GENERIEREN','GENERATE LEVEL'],['Beat-Drum-Effekte','Beat drum effects'],['Kick und Snare synchron zum Level-Tempo','Kick and snare synced to the level tempo.'],['Öffne den Level-Generator und lade einen OGG-Song hoch.','Open Generate Level and upload an OGG song.'],['Der Level-Generator analysiert Tempo, Beats und Songstruktur.','The level generator analyzes tempo, beats, and song structure.'],['Song-Auswahl','Song selection'],['Lade einen Song hoch','Upload a song'],['Song löschen?','Delete song?'],['Diese Schwierigkeit','This difficulty'],['Level generieren','Generate level'],['Level exportieren','Export level'],['GENERATOR','GENERATOR'],['SPIELEN','PLAY'],['AUSSTATTEN','EQUIP'],['AUDIO-DATEI','AUDIO FILE'],['Level im Generator erstellen','Create a level in the generator'],['Bitte lade zuerst eine OGG-Datei hoch.','Upload an OGG file first.'],['Der Song konnte nicht analysiert werden.','The song could not be analyzed.'],['Level wurde generiert.','Level generated.'],['Song wurde gelöscht.','Song deleted.'],['Level kann ohne Song nicht gestartet werden.','Cannot start a level without a song.'],['SOLO','SOLO'],['z. B. Midnight Run','e.g. Midnight Run'],['Unbekannter Künstler','Unknown artist'],['RUN BEENDET','RUN COMPLETE'],['BESTE COMBO','BEST COMBO'],['TREFFER','HITS'],['GENAUIGKEIT','ACCURACY'],['Unbekannter Künstler','Unknown Artist']
  ];
  localePairs.push(
    ['Dein nächster Run','Your next run'],['4 SPUREN','4 LANES'],['TIMING ZÄHLT','TIMING MATTERS'],['LICHT AN','LIGHTS ON'],['Dann Event hinzufügen.','Then add an event.'],['TAP: CLICK · STRG+C / STRG+V COPY','TAP: CLICK · CTRL+C / CTRL+V COPY'],['MACH DEINE NOTES ZU DEINEN NOTES','MAKE YOUR NOTES YOURS'],['STELL DEIN STUDIO EIN','SET UP YOUR STUDIO'],['DEINE','YOUR'],['KEYBINDS','KEYBINDS'],['ARTIST','ARTIST'],['NORMAL · 128 BPM','NORMAL · 128 BPM'],['NEON PULSE','NEON PULSE'],['SOUND IN MOTION','SOUND IN MOTION'],['8 SEK.','8 SEC.'],['01 TRACK','01 TRACK'],['EVENT / KEYFRAME','EVENT / KEYFRAME'],['LIGHT EVENT','LIGHT EVENT'],['ACTIVE LANE','ACTIVE LANE'],['SHOP.','SHOP.'],['LEVEL 01','LEVEL 01'],['FULL TRACK ANALYSIS','FULL TRACK ANALYSIS'],['SCORE','SCORE'],['READY?','READY?'],['GENERATOR.','GENERATOR.'],['Lade eine OGG-Datei hoch. AFTERGLOW analysiert den Song und generiert ein spielbares Level.','Upload an OGG file. AFTERGLOW analyzes the song and generates a playable level.'],['OGG-Datei auswählen','Choose an OGG file'],['Song konnte nicht lokal gespeichert werden. Prüfe den Browser-Speicher und versuche es erneut.','The song could not be saved locally. Check browser storage and try again.'],['SPEICHERN FEHLGESCHLAGEN','SAVE FAILED'],['Die OGG-Datei konnte nicht geladen werden.','The OGG file could not be loaded.'],['BEREIT?','READY?'],['TREFFER','HITS'],['BESTE COMBO','BEST COMBO'],['GENAUIGKEIT','ACCURACY'],
  );
  localePairs.push(['ONLINE & LOKAL','ONLINE & LOCAL'],['BESTENLISTE.','LEADERBOARD.'],['Deine Runs bleiben lokal gespeichert. Für das Online-Ranking ist ein Konto nötig.','Your runs stay saved locally. An account is required for the online leaderboard.'],['NICHT ANGEMELDET','NOT SIGNED IN'],['Online-Ranking ist gesperrt. Offline spielen funktioniert weiterhin.','The online leaderboard is locked. Offline play is still available.'],['◎ MIT GOOGLE ANMELDEN','◎ SIGN IN WITH GOOGLE'],['ABMELDEN','SIGN OUT'],['Google-Anmeldung ist noch nicht konfiguriert','Google sign-in is not configured yet'],['LOKALE BESTEN RUNS','LOCAL BEST RUNS'],['Nur auf diesem PC sichtbar','Visible only on this PC'],['OFFLINE · RANKING GESPERRT','OFFLINE · RANKING LOCKED']);
  localePairs.push(['Firebase-Anmeldung ist für diesen Build noch nicht eingerichtet.','Firebase sign-in is not configured for this build yet.'],['Du kannst offline weiterspielen. Das Online-Ranking ist nicht verfügbar.','You can keep playing offline. The online leaderboard is unavailable.'],['Melde dich mit Google an, um dein Online-Konto zu verbinden.','Sign in with Google to connect your online account.'],['Google-Konto verbunden. Die Cloud-Bestenliste wird noch eingerichtet.','Google account connected. The cloud leaderboard is still being set up.'],['Mit Google anmelden','Sign in with Google'],['0 lokale Runs warten auf Cloud-Synchronisierung.','0 local runs are waiting for cloud sync.']);
  const deToEn=new Map(localePairs),enToDe=new Map(localePairs.map(([de,en])=>[en,de]));
  const tr=(de,en)=>state.language==='en'?en:de;
  function translateTree(root){
    const map=state.language==='en'?deToEn:enToDe,alreadyTarget=state.language==='en'?enToDe:deToEn;
    const translateNode=node=>{const original=node.nodeValue,trimmed=original.trim();if(alreadyTarget.has(trimmed))return;const translated=map.get(trimmed);if(translated)node.nodeValue=original.replace(trimmed,translated);};
    if(root.nodeType===Node.TEXT_NODE)translateNode(root);
    else if(root.nodeType===Node.ELEMENT_NODE||root.nodeType===Node.DOCUMENT_NODE){const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);while(walker.nextNode())translateNode(walker.currentNode);const elements=root.nodeType===Node.ELEMENT_NODE?[root,...root.querySelectorAll('*')]:[...root.querySelectorAll('*')];for(const element of elements)for(const attrName of ['placeholder','title','aria-label']){const value=element.getAttribute(attrName);if(value&&!alreadyTarget.has(value)&&map.has(value))element.setAttribute(attrName,map.get(value));}}
  }
  function applyLanguage(){document.documentElement.lang=state.language;if($('language-select'))$('language-select').value=state.language;translateTree(document.body);}
  $('language-select')?.addEventListener('change',e=>{state.language=e.target.value==='en'?'en':'de';persist();applyLanguage();renderAll();});
  const languageObserver=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===Node.TEXT_NODE||node.nodeType===Node.ELEMENT_NODE)translateTree(node);})));languageObserver.observe(document.body,{childList:true,subtree:true});

  function switchView(viewName) {
    if(appMode==='player'&&viewName==='editor')return;
    if(viewName!=='editor'&&editorPreviewPlaying){editorPreviewPlaying=false;cancelAnimationFrame(editorPreviewRAF);$('editor-preview-toggle').textContent='▶ PREVIEW';}
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === `view-${viewName}`));
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewName));
    $('crumb-current').textContent = ({play:tr('SPIELEN','PLAY'), editor:tr('GENERATOR','GENERATOR'), leaderboard:tr('BESTENLISTE','LEADERBOARD'), shop:tr('NOTE SHOP','NOTE SHOP'), settings:tr('EINSTELLUNGEN','SETTINGS')})[viewName] || 'STUDIO';
    if (viewName === 'editor') renderEditor();
  }
  function applyAppMode(){
    document.body.classList.toggle('developer-mode',appMode==='developer');
    document.body.classList.toggle('player-mode',appMode!=='developer');
    if(appMode==='developer'){
      $('developer-version').value=contentVersion;
      switchView('editor');
    }else{
      $('build-version').textContent=`LOCAL PLAY · v${contentVersion}`;
      switchView('play');
    }
  }
  document.querySelectorAll('.nav-item[data-view],.text-button[data-view]').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => $(btn.dataset.close).classList.add('hidden')));
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.classList.add('hidden'); }));

  $('song-search').addEventListener('input', e => renderSongs(e.target.value));
  $('hero-play').addEventListener('click', () => startGame());
  $('preview-btn').addEventListener('click', () => previewSong(getSong()));
  async function previewSong(song) {
    if(!song||(!song.audioKey&&!song.assetUrl)){toast(tr('Dieser Track hat keine Audiodatei. Lade einen OGG-Song hoch.','This level has no audio. Upload an OGG song.'));return;}
    stopPreview();
    const url = await songMedia(song, 'audio');
    if (url) {
      audioElement = new Audio(url); audioElement.volume = Number(state.volume)/100; audioElement.currentTime = 0; audioElement.play().catch(() => toast(tr('Audio konnte nicht gestartet werden.','Audio could not be started.')));
      previewTimeout = setTimeout(stopPreview, 8000); $('preview-btn').innerHTML = `<span>◼</span> ${tr('VORSCHAU LÄUFT','PREVIEW PLAYING')} <small>${tr('8 SEK.','8 SEC.')}</small>`;
    } else toast(tr('Die OGG-Datei konnte nicht geladen werden.','The OGG file could not be loaded.'));
  }
  function stopPreview() { clearTimeout(previewTimeout); if (audioElement) { audioElement.pause(); audioElement = null; } $('preview-btn').innerHTML = `<span>▶</span> ${tr('KURZ REINHÖREN','QUICK PREVIEW')} <small>${tr('8 SEK.','8 SEC.')}</small>`; }

  // Import track, image, folder package or a previously exported .zip level.
  $('import-open').addEventListener('click', () => $('import-modal').classList.remove('hidden'));
  $('audio-file').addEventListener('change', e => { const file=e.target.files[0]||null;pendingAudio=file&&/\.ogg$/i.test(file.name)?file:null;$('audio-file-label').textContent=pendingAudio?.name||(file?tr('Bitte eine .ogg-Datei wählen','Please choose an .ogg file'):'Audiodatei auswählen');if(file&&!pendingAudio)toast(tr('Der Generator akzeptiert nur OGG-Dateien.','The generator only accepts OGG files.'));if (!$('import-title').value && pendingAudio) $('import-title').value = pendingAudio.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '); });
  $('cover-file').addEventListener('change', e => { pendingCover = e.target.files[0] || null; $('cover-file-label').textContent = pendingCover?.name || 'Optional · eigenes Bild wählen'; });
  $('import-submit').addEventListener('click', async () => {
    if (!pendingAudio) { toast(tr('Bitte lade zuerst eine OGG-Datei hoch.','Upload an OGG file first.')); return; }
    const song = createSong($('import-title').value.trim() || pendingAudio.name.replace(/\.[^.]+$/, ''), $('import-artist').value.trim() || 'MY LIGHTSHOW', pendingAudio, pendingCover, $('import-environment').value);
    try { await storeSongMedia(song, pendingAudio, pendingCover); } catch (_) { releaseSongMedia(song); toast(tr('Song konnte nicht lokal gespeichert werden. Prüfe den Browser-Speicher und versuche es erneut.','The song could not be saved locally. Check browser storage and try again.')); return; }
    await readSongDuration(song, pendingAudio);
    const analyzed=await autoMapSong(song,pendingAudio);if(!analyzed){releaseSongMedia(song);toast(tr('Die Audiodatei konnte nicht analysiert werden. Nutze einen aktuellen Browser mit OGG-Unterstützung.','Audio analysis failed. Use a current browser with OGG support.'));return;}
    state.songs.push(song); state.selectedSongId = song.id; state.selectedDifficulty = 'Easy'; selectedEditorSong = song.id; selectedEditorDifficulty = 'Easy'; persist();
    $('import-modal').classList.add('hidden'); $('audio-file').value = ''; $('cover-file').value = ''; pendingAudio = pendingCover = null; $('import-title').value = ''; $('import-artist').value = ''; $('audio-file-label').textContent = 'Audiodatei auswählen'; $('cover-file-label').textContent = 'Optional · eigenes Bild wählen';
    renderAll(); toast(tr('Track importiert · Easy bis Expert+ generiert.','Track imported · Easy through Expert+ generated.'));
  });
  $('editor-new-level').addEventListener('click',()=>{pendingNewAudio=pendingNewCover=null;$('new-level-audio').value='';$('new-level-cover').value='';$('new-level-title').value='';$('new-level-artist').value='';$('new-audio-label').textContent=tr('Wähle eine OGG-Datei zum Generieren','Choose an OGG file to generate');$('new-cover-label').textContent=tr('Eigenes Bild verwenden','Choose cover art');$('create-level-submit').disabled=true;$('generator-progress').classList.add('hidden');$('generator-progress-fill').style.width='0%';$('generator-progress-label').textContent=tr('WARTET AUF OGG','WAITING FOR OGG');$('new-level-modal').classList.remove('hidden');$('new-level-title').focus();});
  $('new-level-audio').addEventListener('change',e=>{const file=e.target.files[0]||null;pendingNewAudio=file&&/\.ogg$/i.test(file.name)?file:null;$('new-audio-label').textContent=pendingNewAudio?.name||(file?tr('Nur .ogg-Dateien werden unterstützt','Only .ogg files are supported'):tr('Wähle eine OGG-Datei zum Generieren','Choose an OGG file to generate'));$('create-level-submit').disabled=!pendingNewAudio;if(file&&!pendingNewAudio)toast(tr('Der Generator akzeptiert nur OGG-Dateien.','The generator only accepts OGG files.'));});
  $('new-level-cover').addEventListener('change',e=>{$('new-cover-label').textContent=e.target.files[0]?.name||'Eigenes Bild verwenden';pendingNewCover=e.target.files[0]||null;});
  $('create-level-submit').addEventListener('click',async()=>{
    if(!pendingNewAudio||!/\.ogg$/i.test(pendingNewAudio.name)){toast(tr('Lade zuerst einen Song im .ogg-Format hoch.','Upload an .ogg song before generating.'));return;}
    const submit=$('create-level-submit'),progress=$('generator-progress'),fill=$('generator-progress-fill'),label=$('generator-progress-label');submit.disabled=true;progress.classList.remove('hidden');fill.style.width='18%';label.textContent=tr('SONG WIRD GELESEN…','READING FULL TRACK…');
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const title=$('new-level-title').value.trim()||pendingNewAudio.name.replace(/\.ogg$/i,'').replace(/[_-]+/g,' ');const song=createSong(title,$('new-level-artist').value.trim()||'MY LIGHTSHOW',pendingNewAudio,pendingNewCover,$('new-level-environment').value,{bpm:128});
    try{await storeSongMedia(song,pendingNewAudio,pendingNewCover);}catch(_){releaseSongMedia(song);label.textContent=tr('SPEICHERN FEHLGESCHLAGEN','SAVE FAILED');fill.style.width='100%';submit.disabled=false;toast(tr('Song konnte nicht lokal gespeichert werden. Prüfe den Browser-Speicher und versuche es erneut.','The song could not be saved locally. Check browser storage and try again.'));return;}
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const analyzed=await autoMapSong(song,pendingNewAudio,(percent,message)=>{fill.style.width=`${percent}%`;label.textContent=message;});if(!analyzed){releaseSongMedia(song);label.textContent=tr('ANALYSE FEHLGESCHLAGEN','ANALYSIS FAILED');fill.style.width='100%';submit.disabled=false;toast(tr('Der Song konnte nicht vollständig analysiert werden. Prüfe die OGG-Datei und versuche es erneut.','The full track could not be analyzed. Check the OGG file and try again.'));return;}
    fill.style.width='100%';label.textContent=tr(`FERTIG · ${song.bpm} BPM · 5 SCHWIERIGKEITEN`,`DONE · ${song.bpm} BPM · 5 DIFFICULTIES`);state.songs.push(song);state.selectedSongId=song.id;state.selectedDifficulty='Normal';selectedEditorSong=song.id;selectedEditorDifficulty='Normal';selectedObject=null;clearHistory();persist();
    pendingNewAudio=pendingNewCover=null;$('new-level-audio').value='';$('new-level-cover').value='';$('new-level-title').value='';$('new-level-artist').value='';$('new-audio-label').textContent=tr('Wähle eine OGG-Datei zum Generieren','Choose an OGG file to generate');$('create-level-submit').disabled=true;$('new-level-modal').classList.add('hidden');$('generator-progress').classList.add('hidden');renderAll();switchView('editor');toast(tr('Level generiert: Easy bis Expert+.','Level generated: Easy through Expert+.'));
  });
  $('folder-import-open')?.addEventListener('click', () => $('folder-import').click());
  $('folder-import').addEventListener('change', async e => { const files = [...e.target.files]; if (files.length) await importFolderFiles(files); e.target.value = ''; });
  $('zip-import-open')?.addEventListener('click', () => $('zip-import').click());
  $('zip-import').addEventListener('change', async e => { const file = e.target.files[0]; if (file) await importZip(file); e.target.value = ''; });
  function createSong(title, artist, audioBlob, coverBlob, environment = 'neon', settings = {}) {
    const packageId=String(settings.packageId||settings.levelId||'')||null;const id = packageId ? `level-${slug(packageId)}` : `song-${uid()}`; const bpm = Number(settings.bpm) || 128;
    return { id, packageId, title, artist, bpm, duration: 60, environment, demo: false, autoMapped:false, audioKey: audioBlob ? `${id}:audio` : null, coverKey: coverBlob ? `${id}:cover` : null, difficulties: { Easy: { bpm, notes: [], events: [] } } };
  }
  function readSongDuration(song, blob) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(blob); const probe = new Audio(); probe.preload = 'metadata';let settled=false,timeout;
      const finish=()=>{if(settled)return;settled=true;if(timeout)clearTimeout(timeout);probe.onloadedmetadata=null;probe.onerror=null;probe.src='';URL.revokeObjectURL(url);resolve();};
      probe.onloadedmetadata = () => { if (Number.isFinite(probe.duration) && probe.duration > 0) song.duration = probe.duration; finish(); };
      probe.onerror = finish;
      timeout=setTimeout(finish, 4500);probe.src=url;
    });
  }
  async function importFolderFiles(files) {
    const jsonFile = files.find(f => f.name.toLowerCase() === 'song.json' || f.name.toLowerCase() === 'level.json');
    let spec = {};
    if (jsonFile) { try { spec = JSON.parse(await jsonFile.text()); } catch (_) { toast('song.json konnte nicht gelesen werden.'); return; } }
    const audio = files.find(f => /\.ogg$/i.test(f.name));
    const cover = files.find(f => /^image\//.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name));
    if (!audio) { toast(tr('Im Ordner wurde keine OGG-Datei gefunden.','No OGG audio file was found in that folder.')); return; }
    await importSongFiles(spec, audio, cover);
  }
  async function importSongFiles(spec, audio, cover, {silent=false}={}) {
    if(!audio||!/\.ogg$/i.test(audio.name||'')){toast(tr('Ein Level braucht eine OGG-Datei.','A level requires an OGG audio file.'));return;}
    const packageId=String(spec.packageId||spec.levelId||'')||null;const existing=packageId?state.songs.find(item=>item.packageId===packageId):null;
    const song = createSong(spec.title || ((audio?.name || 'Imported Track').replace(/\.[^.]+$/, '')), spec.artist || 'MY LIGHTSHOW', audio, cover, spec.environment || 'neon', {...spec,packageId});
    if(existing){song.id=existing.id;song.audioKey=audio?`${song.id}:audio`:null;song.coverKey=cover?`${song.id}:cover`:null;for(const kind of ['audio','cover']){const key=`${existing.id}:${kind}`,url=mediaUrls.get(key)||objectUrlCache.get(key);if(url?.startsWith('blob:'))URL.revokeObjectURL(url);mediaUrls.delete(key);objectUrlCache.delete(key);}if(existing.coverKey&&!cover)mediaDelete(existing.coverKey);state.songs=state.songs.filter(item=>item!==existing);}
    if (spec.difficulties && Object.keys(spec.difficulties).length) song.difficulties = normalizeDifficulties(spec.difficulties, song.bpm);
    if (spec.bpm) song.bpm = Number(spec.bpm);
    if (spec.duration) song.duration = Number(spec.duration);
    try { await storeSongMedia(song, audio, cover); } catch (_) { releaseSongMedia(song); toast(tr('Song konnte nicht lokal gespeichert werden. Prüfe den Browser-Speicher und versuche es erneut.','The song could not be saved locally. Check browser storage and try again.')); return; }
    if (!spec.duration && audio) await readSongDuration(song, audio);
    const hasMappedNotes=Object.values(song.difficulties).some(chart=>chart.notes?.length);
    if(!hasMappedNotes&&audio){const analyzed=await autoMapSong(song,audio);if(!analyzed){releaseSongMedia(song);toast(tr('Der Song konnte nicht analysiert werden.','The song could not be analyzed.'));return;}}
    state.songs.push(song); if(!silent){state.selectedSongId = song.id; state.selectedDifficulty = Object.keys(song.difficulties)[0]; selectedEditorSong=song.id; selectedEditorDifficulty=state.selectedDifficulty; selectedObject=null; clearHistory();} persist(); renderAll(); $('import-modal').classList.add('hidden'); if(!silent)toast(tr('Level importiert.','Level imported.'));return true;
  }
  function normalizeDifficulties(difficulties, bpm) {
    const out = {};
    for (const [name, raw] of Object.entries(difficulties || {})) {
      const data = raw || {};
      out[name] = { bpm: Number(data.bpm) || bpm || 128, notes: Array.isArray(data.notes) ? data.notes.map(n => ({ id: n.id || uid(), t: Math.max(0, Number(n.t ?? n.time) || 0), lane: Math.max(0, Math.min(3, Number(n.lane) || 0)), shape: n.shape || null, duration:0 })) : [], events: Array.isArray(data.events) ? data.events.map(ev => ({ id: ev.id || uid(), t: Math.max(0, Number(ev.t ?? ev.time) || 0), type: ev.type || 'color', color: ev.color || '#f83ab7', x: Number(ev.x) || 0, y: Number(ev.y) || 0, rotation: Number(ev.rotation) || 0, scale: Number(ev.scale) || 1, style: ev.style || ev.pattern || null, intensity: Math.max(0, Number(ev.intensity) || 1) })) : [] };
    }
    return out;
  }

  function quantile(values, q) {
    if (!values.length) return 0;
    const sorted=[...values].sort((a,b)=>a-b);
    return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*q))];
  }
  function estimateTempoAndOnsets(buffer) {
    const frameSeconds=.025, frameSize=Math.max(256,Math.floor(buffer.sampleRate*frameSeconds));
    const count=Math.ceil(buffer.length/frameSize), channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
    const rms=new Float32Array(count);
    for(let frame=0;frame<count;frame++){const start=frame*frameSize,end=Math.min(buffer.length,start+frameSize);let sum=0,n=0;for(const channel of channels){for(let i=start;i<end;i+=2){const value=channel[i];sum+=value*value;n++;}}rms[frame]=Math.sqrt(sum/Math.max(1,n));}
    const flux=new Float32Array(count),positive=[];let peakFlux=0;
    for(let i=2;i<count;i++){let prior=(rms[i-1]+rms[i-2])*.5;const value=Math.max(0,rms[i]-prior*.88);flux[i]=value;if(value>0){positive.push(value);peakFlux=Math.max(peakFlux,value);}}
    const maxFrames=count;let peakLevel=0;for(let i=0;i<rms.length;i++)if(rms[i]>peakLevel)peakLevel=rms[i];
    if (!rms.length || peakLevel < .003 || positive.length < 8 || peakFlux < .00002) return null;
    const soundThreshold=Math.max(.0015,peakLevel*.028);let firstSoundFrame=-1;
    for(let i=0;i<rms.length-1;i++)if(rms[i]>=soundThreshold&&rms[i+1]>=soundThreshold){firstSoundFrame=i;break;}
    if(firstSoundFrame<0)return null;
    let winner={bpm:128,score:-1,lag:Math.round(60/128/frameSeconds)};
    for(let bpm=82;bpm<=178;bpm+=.5){const lag=Math.round(60/bpm/frameSeconds);let score=0,n=0;for(let i=lag+2;i<maxFrames;i+=2){score+=flux[i]*flux[i-lag];n++;}score/=Math.max(1,n);if(score>winner.score)winner={bpm,score,lag};}
    const lag=winner.lag,step=Math.max(1,Math.floor(lag/36));let phase=0,phaseScore=-1;
    for(let offset=0;offset<lag;offset+=step){let score=0;for(let frame=offset+2;frame<maxFrames;frame+=lag)score+=flux[frame]||0;if(score>phaseScore){phaseScore=score;phase=offset;}}
    const onsetFloor=Math.max(quantile(positive,.46),peakFlux*.025,.000001),onsetEvents=[];let lastOnset=-Infinity;
    const contextFrames=Math.max(2,Math.round(.48/frameSeconds));
    for(let i=2;i<count-2;i++){
      const strength=flux[i],time=i*frameSeconds;if(strength<onsetFloor||strength<flux[i-1]||strength<flux[i+1]||time-lastOnset<.075)continue;
      let localPeak=0;for(let j=Math.max(0,i-contextFrames);j<=Math.min(count-1,i+contextFrames);j++)if(flux[j]>localPeak)localPeak=flux[j];
      if(strength<localPeak*.15)continue;onsetEvents.push({t:time,strength});lastOnset=time;
    }
    const bpm=Number(winner.bpm.toFixed(1));return {bpm,beat:60/bpm,phase:phase*frameSeconds,firstSoundTime:firstSoundFrame*frameSeconds,flux,rms,onsets:onsetEvents.map(onset=>onset.t),onsetEvents,frameSeconds,duration:buffer.duration,peakRms:peakLevel};
  }
  function nearestOnset(onsets,time,tolerance){let low=0,high=onsets.length;while(low<high){const mid=(low+high)>>1;if(onsets[mid].t<time)low=mid+1;else high=mid;}const before=onsets[low-1],after=onsets[low];let best=!before?after:!after?before:Math.abs(before.t-time)<=Math.abs(after.t-time)?before:after;return best&&Math.abs(best.t-time)<=tolerance?best:null;}
  function makeLightshowEvents(bpm,duration,analysis=null,song={}) {
    const beat=60/bpm,barLength=beat*4,startTime=Math.max(0,Number(analysis?.firstSoundTime)||0),rms=analysis?.rms||[],frameSeconds=analysis?.frameSeconds||.025;
    const palettes={neon:['#ff48bd','#52eaff','#a17bff','#ffda67','#78f4ba'],aurora:['#63f2cd','#65c9ff','#9ff5df','#a3a7ff','#e7fbff'],sunset:['#ff7057','#ffbd59','#ff4faa','#9a75ff','#ffdca1'],void:['#a97aff','#53dcff','#f8f3ff','#7468d8','#ff53b4']};
    const colors=palettes[song.environment]||palettes.neon;let seed=2166136261;for(const ch of String(song.id||song.title||'afterglow'))seed=Math.imul(seed^ch.charCodeAt(0),16777619);seed>>>=0;
    const barCount=Math.max(1,Math.ceil((duration-startTime)/barLength)),energy=[],peaks=[];
    for(let bar=0;bar<barCount;bar++){const from=Math.floor((startTime+bar*barLength)/frameSeconds),to=Math.min(rms.length,Math.ceil((startTime+(bar+1)*barLength)/frameSeconds));let sum=0,count=0,peak=0;for(let i=from;i<to;i++){sum+=rms[i];count++;peak=Math.max(peak,rms[i]);}energy.push(count?sum/count:0);peaks.push(peak);}
    const ceiling=Math.max(.0001,quantile(energy,.88)),floorE=Math.max(.00001,quantile(energy,.18));
    const onsets=analysis?.onsetEvents||[],onsetCeiling=Math.max(.00001,quantile(onsets.map(onset=>onset.strength),.9));
    const styles=['fan','tunnel','cross','sweep','orbit','burst'];
    const events=[
      {id:uid(),t:startTime,type:'color',color:colors[0],x:0,y:0,rotation:0,scale:1},
      {id:uid(),t:startTime,type:'keyframe',color:colors[0],x:0,y:0,rotation:0,scale:1},
      {id:uid(),t:startTime,type:'laser',color:colors[1],x:0,y:-4,rotation:0,scale:.92,style:styles[seed%4],intensity:.8},
      {id:uid(),t:startTime,type:'orb',color:colors[2],x:-18,y:-12,rotation:0,scale:1,intensity:.7},
      {id:uid(),t:startTime,type:'orb',color:colors[3],x:18,y:10,rotation:0,scale:.9,intensity:.6},
    ];
    for(let bar=1;bar<barCount;bar++){
      const t=startTime+bar*barLength;
      const level=Math.min(1.6,(energy[bar]-floorE)/Math.max(.0001,ceiling-floorE));
      const prior=Math.min(1.6,(energy[bar-1]-floorE)/Math.max(.0001,ceiling-floorE));
      const change=level-prior;
      const drop=change>.2&&level>.68;
      const build=change>.1&&level>prior;
      const calm=level<.35&&change<-.08;
      const phrase=Math.floor(bar/4);
      const section=Math.floor(bar/16);
      // Motion amplitude follows energy — soft in quiet, punchy on drops
      const motion=.18+Math.min(.95,level)*.72;
      const sway=Math.sin((bar+seed%13)*.55)*motion;
      const lift=Math.cos((bar+seed%7)*.38)*motion*.75;
      if(bar%2===0||level>.8||drop||change<-.16){
        events.push({id:uid(),t,type:'color',color:colors[(section+Math.floor(level*3)+seed+bar)%colors.length],x:0,y:0,rotation:0,scale:1});
      }
      // Milder camera zoom — never aggressive
      if(bar%2===0||level>.5||Math.abs(change)>.12||drop){
        const zoom=drop?1.04+Math.min(.06,level*.05):(build?1.02+level*.03:1+level*.02);
        const rot=(sway*7+(drop?(bar%2?1:-1)*4:0))*(.4+level*.35);
        events.push({
          id:uid(),t,type:'keyframe',color:colors[(phrase+seed)%colors.length],
          x:sway*7*(.5+level*.5),
          y:lift*4.5*(.4+level*.55)+(drop?-1.5:0),
          rotation:rot,
          scale:Math.max(.96,Math.min(1.1,zoom)),
        });
      }
      // Mid-bar keyframe on energy shifts
      if((level>.9||drop||build)&&bar%2===1){
        const mid=t-barLength*.5;
        if(mid>startTime){
          events.push({
            id:uid(),t:mid,type:'keyframe',color:colors[(phrase+1+seed)%colors.length],
            x:Math.sin((bar+seed)*.85)*5*motion,y:Math.cos((bar+seed)*.65)*3.2*motion,
            rotation:Math.sin((bar+seed)*.5)*5*motion,scale:1+.02*level+(drop?.03:0),
          });
        }
      }
      // Lasers follow energy shape
      if(bar%2===0||level>.65||drop||build){
        const style=styles[(phrase+seed+(drop?2:calm?4:0))%styles.length];
        const sweep=Math.sin((bar+seed%11)*.68);
        events.push({
          id:uid(),t,type:'laser',color:colors[(bar+1+Math.floor(level*2)+seed)%colors.length],
          x:sweep*(10+level*8),y:Math.cos((bar+seed%5)*.46)*(4+level*4),
          rotation:sweep*(12+level*10)+(drop?8:0),
          scale:.72+Math.min(.55,level*.35)+(drop?.08:0),
          style,intensity:.42+Math.min(.7,level*.48)+(drop?.18:0)+(calm?-.12:0),
        });
      }
      // Moving orbs / light objects — denser on energetic bars
      if(bar%1===0&&(level>.4||drop||bar%3===0)){
        const angle=(bar*1.37+seed*.1)%(Math.PI*2);
        const radius=12+level*14+(drop?6:0);
        events.push({
          id:uid(),t,type:'orb',color:colors[(bar+seed+2)%colors.length],
          x:Math.cos(angle)*radius,y:Math.sin(angle)*radius*.62-4,
          rotation:angle*40,scale:.7+level*.45+(drop?.2:0),intensity:.45+level*.5+(drop?.2:0),
        });
        if(level>.7||drop){
          events.push({
            id:uid(),t:t+beat*.5,type:'orb',color:colors[(bar+seed+4)%colors.length],
            x:Math.cos(angle+Math.PI)*radius*.85,y:Math.sin(angle+Math.PI)*radius*.5+3,
            rotation:(angle+Math.PI)*40,scale:.55+level*.35,intensity:.4+level*.4,
          });
        }
      }
      // Spot beams that drift across on builds
      if((build||drop||bar%4===0)&&level>.45){
        events.push({
          id:uid(),t,type:'spot',color:colors[(phrase+seed+1)%colors.length],
          x:sway*16,y:lift*10-8,rotation:sway*20,scale:.8+level*.3,intensity:.35+level*.4+(drop?.25:0),
        });
      }
      const barStart=startTime+(bar-1)*barLength;
      const barPeaks=onsets.filter(o=>o.t>=barStart&&o.t<t).sort((a,b)=>b.strength-a.strength);
      // Onset-locked flashes + orb pops for true music hits
      for(let oi=0;oi<Math.min(3,barPeaks.length);oi++){
        const o=barPeaks[oi];
        if(o.strength<onsetCeiling*(oi===0?.55:.78))continue;
        if(oi===0&&level>.4){
          events.push({id:uid(),t:o.t,type:'flash',color:colors[(bar+2+seed+oi)%colors.length],x:0,y:0,rotation:0,scale:1});
        }
        if(o.strength>=onsetCeiling*.7){
          const a=(o.t*3.1+seed)%(Math.PI*2);
          events.push({
            id:uid(),t:o.t,type:'orb',color:colors[(bar+seed+oi*2)%colors.length],
            x:Math.cos(a)*(14+level*10),y:Math.sin(a)*(8+level*6),
            rotation:a*50,scale:.8+o.strength*.4,intensity:.55+Math.min(.45,o.strength),
          });
        }
      }
      if((bar%8===0&&level>.7)||(drop&&level>.9)){
        events.push({id:uid(),t,type:'rotate',color:colors[(bar+seed)%colors.length],x:0,y:0,rotation:(bar%16===0||drop?1:-1)*(6+Math.min(6,level*5)),scale:1});
      }
    }
    return events.sort((a,b)=>a.t-b.t);
  }
  async function buildMappedDifficulties(song,analysis,onProgress=()=>{}) {
    const {bpm,beat,phase,firstSoundTime,rms,frameSeconds,duration}=analysis,charts={},onsets=analysis.onsetEvents||[];
    const settings={Easy:{step:1,quantile:.68,cap:3,doubles:0,doubleEvery:0,sync:.08},Normal:{step:.5,quantile:.55,cap:6,doubles:.96,doubleEvery:4,sync:.2},Hard:{step:.5,quantile:.44,cap:8,doubles:.93,doubleEvery:2,sync:.38},Expert:{step:.25,quantile:.38,cap:13,doubles:.92,doubleEvery:1,sync:.62},'Expert+':{step:.125,quantile:.32,cap:17,doubles:.86,doubleEvery:1,sync:1}};
    const patterns=[[0,1,3,2,0,2,3,1],[3,2,0,1,3,1,0,2],[0,2,3,1,0,1,3,2],[2,0,1,3,2,3,1,0],[1,3,2,0,1,0,2,3]];
    const lightEvents=makeLightshowEvents(bpm,duration,analysis,song),seed=(Number.parseInt(String(song.id||'').slice(-6),36)||0)%patterns.length;
    const rmsFloor=Math.max(.0004,quantile(Array.from(rms),.2)*.62),maxRms=Math.max(.0001,analysis.peakRms||Math.max(...Array.from(rms).slice(0,Math.min(rms.length,2000))));
    for(const [difficultyIndex,name] of difficultyOrder.entries()){
      const config=settings[name],step=beat*config.step,tolerance=name==='Expert+'?beat*.5:name==='Expert'?beat*.25:Math.min(beat*.17,step*.46),candidateByGrid=new Map();
      for(const onset of onsets){if(onset.t<firstSoundTime-.015)continue;const index=Math.round((onset.t-phase)/step),gridTime=phase+index*step;if(gridTime<firstSoundTime-.015||gridTime>=duration-.04||Math.abs(onset.t-gridTime)>tolerance)continue;
        const frame=Math.max(0,Math.min(rms.length-1,Math.round(onset.t/frameSeconds))),energy=rms[frame]||0,score=onset.strength*(.72+Math.min(1,energy/Math.max(.0005,maxRms*.22))*.28),candidate={t:gridTime,hitTime:onset.t,score,onset,index,bar:Math.floor(gridTime/(beat*4)),phrase:Math.floor(gridTime/(beat*16)),lane:0};
        const existing=candidateByGrid.get(index);if(!existing||existing.score<score)candidateByGrid.set(index,candidate);
      }
      const candidates=[...candidateByGrid.values()].sort((a,b)=>a.t-b.t);
      const values=candidates.map(candidate=>candidate.score),globalFloor=Math.max(.000001,quantile(values,.2)*.58),bySection=new Map();
      for(const candidate of candidates){const section=Math.floor(candidate.t/(beat*8));if(!bySection.has(section))bySection.set(section,[]);bySection.get(section).push(candidate.score);}
      const filtered=candidates.filter(candidate=>{const local=bySection.get(Math.floor(candidate.t/(beat*8)))||[];return candidate.score>=Math.max(globalFloor,quantile(local,config.quantile)*.76);});
      const byBar=new Map();for(const candidate of filtered){if(!byBar.has(candidate.bar))byBar.set(candidate.bar,[]);byBar.get(candidate.bar).push(candidate);}
      const picked=[];for(const group of byBar.values()){group.sort((a,b)=>b.score-a.score);picked.push(...group.slice(0,config.cap));}picked.sort((a,b)=>a.t-b.t);
      const minGap=beat*({Easy:.68,Normal:.38,Hard:.27,Expert:.19,'Expert+':.16}[name]||.25),spaced=[];
      for(const candidate of picked){const mappedTime=candidate.t+(candidate.hitTime-candidate.t)*config.sync,last=spaced.at(-1),lastTime=last?last.t+(last.hitTime-last.t)*config.sync:-Infinity;if(last&&mappedTime-lastTime<minGap){if(candidate.score>last.score)spaced[spaced.length-1]=candidate;}else spaced.push(candidate);}
      picked.splice(0,picked.length,...spaced);
      const notes=[];let previousLane=-1;
      for(const candidate of picked){const phraseStart=candidate.phrase*beat*16,phraseStyle=(candidate.phrase+seed+difficultyIndex)%patterns.length,template=patterns[phraseStyle],stepInPhrase=Math.floor((candidate.t-phraseStart)/step),rotation=(candidate.phrase+seed+difficultyIndex)%4;let lane=(template[stepInPhrase%template.length]+rotation)%4;if(lane===previousLane)lane=(lane+((stepInPhrase+candidate.phrase)%2?1:3))%4;previousLane=lane;candidate.lane=lane;const hitTime=candidate.t+(candidate.hitTime-candidate.t)*config.sync;notes.push({id:uid(),t:Math.max(0,hitTime),lane,shape:null,duration:0,_strength:candidate.score,_phrase:candidate.phrase});}
      if(config.doubles){const accentFloor=quantile(values,config.doubles),sections=new Map();for(const note of notes){if(note._strength<accentFloor)continue;const section=Math.floor(note.t/(beat*16));if((section+seed)%config.doubleEvery!==0)continue;if(!sections.has(section)||sections.get(section)._strength<note._strength)sections.set(section,note);}
        for(const note of sections.values()){const lane=(note.lane+2+(difficultyIndex===1?0:(seed%2)))%4;if(!notes.some(other=>other!==note&&Math.abs(other.t-note.t)<.005&&other.lane===lane))notes.push({id:uid(),t:note.t,lane,shape:null,duration:0,_strength:note._strength,_phrase:note._phrase});}}
      notes.sort((a,b)=>a.t-b.t||a.lane-b.lane);for(const note of notes){delete note._strength;delete note._phrase;}
      charts[name]={bpm,notes,events:lightEvents.map(event=>({...event,id:uid()}))};onProgress(68+Math.round((difficultyIndex+1)*7),tr(`MAPPING ${name.toUpperCase()}…`,`MAPPING ${name.toUpperCase()}…`));await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    return charts;
  }
  async function autoMapSong(song,blob,onProgress=()=>{}) {
    try{
      let analysis=null;const ctx=getAudioContext();onProgress(12,tr('OGG-DATEI VORBEREITEN…','PREPARING OGG FILE…'));
      if(ctx&&blob){const encoded=await blob.arrayBuffer();onProgress(28,tr('GANZEN TRACK DEKODIEREN…','DECODING THE FULL TRACK…'));await new Promise(resolve=>requestAnimationFrame(resolve));const decoded=await ctx.decodeAudioData(encoded.slice(0));onProgress(52,tr('TEMPO, TAKT UND TRANSIENTEN PRÜFEN…','ANALYZING TEMPO, BEATS AND TRANSIENTS…'));await new Promise(resolve=>requestAnimationFrame(resolve));analysis=estimateTempoAndOnsets(decoded);}
      if(!analysis)return false;
      song.bpm=analysis.bpm;song.duration=analysis.duration;onProgress(65,tr('SONGSTRUKTUR ERKANNT · CHARTS AUFBAUEN…','SONG STRUCTURE DETECTED · BUILDING CHARTS…'));song.difficulties=await buildMappedDifficulties(song,analysis,onProgress);song.autoMapped=true;song.mapSource='audio-analysis';song.mapVersion=5;onProgress(100,tr('GENERATOR FERTIG','GENERATOR COMPLETE'));return true;
    }catch(_){return false;}
  }
  // Song editor and timeline.
  const editorContent = $('timeline-content');
  const editorMap = () => getSong(selectedEditorSong)?.difficulties?.[selectedEditorDifficulty];
  function renderEditor() {
    const song=getSong(), empty=$('generator-empty'),card=$('generator-level-card'),exportButton=$('export-level');
    empty.classList.toggle('hidden',!!song);card.classList.toggle('hidden',!song);exportButton.disabled=!song;
    if(!song)return;
    const map=getDifficulty(song,state.selectedDifficulty);if(!map)return;
    $('generator-track-title').textContent=song.title||'Untitled Track';
    $('generator-track-meta').textContent=`${song.artist||'UNKNOWN ARTIST'} · ${formatDuration(song.duration||0)} · ${(song.environment||'neon').toUpperCase()}`;
    const pkgEl=$('generator-package-id');if(pkgEl)pkgEl.textContent=song.packageId?`package: ${song.packageId}`:tr('noch nicht veröffentlicht','not published yet');
    card.querySelector('.eyebrow').textContent=tr('GENERIERTE LEVEL','GENERATED LEVEL');const statLabels=card.querySelectorAll('.generator-stats small');statLabels[1].textContent=tr('NOTEN','NOTES');
    $('generator-bpm').textContent=String(map.bpm||song.bpm||128);
    $('generator-note-count').textContent=String(map.notes.length);
    $('generator-difficulties').innerHTML=Object.keys(song.difficulties).sort((a,b)=>difficultyOrder.indexOf(a)-difficultyOrder.indexOf(b)).map(name=>`<span>${escapeHtml(name.toUpperCase())}</span>`).join('');
    const art=$('generator-level-art'),cover=objectUrlCache.get(`${song.id}:cover`);
    art.innerHTML=cover?`<img src="${attr(cover)}" alt="">`:'<span>✦</span>';
  }  function eventIcon(type) { return ({color:'◉',rotate:'↻',keyframe:'◇',flash:'✦'})[type] || '✧'; }
  $('editor-song').addEventListener('change', e => { editorPreviewPlaying=false;cancelAnimationFrame(editorPreviewRAF);$('editor-preview-toggle').textContent='▶ PREVIEW';selectedEditorSong = e.target.value; const names = Object.keys(getSong(selectedEditorSong).difficulties); selectedEditorDifficulty = names.includes(state.selectedDifficulty) ? state.selectedDifficulty : names[0]; state.selectedSongId=selectedEditorSong;state.selectedDifficulty=selectedEditorDifficulty;selectedObject = null; cursorTime = 0;editorPreviewTime=0; clearHistory();persist();renderSongs($('song-search').value);renderEditor(); });
  $('editor-difficulty').addEventListener('change', e => { editorPreviewPlaying=false;cancelAnimationFrame(editorPreviewRAF);$('editor-preview-toggle').textContent='▶ PREVIEW';selectedEditorDifficulty = e.target.value;state.selectedDifficulty=selectedEditorDifficulty;selectedObject = null; cursorTime = 0;editorPreviewTime=0; clearHistory();persist();renderSongs($('song-search').value);renderEditor(); });
  $('editor-environment').addEventListener('change', e => { getSong(selectedEditorSong).environment = e.target.value; persist(); });
  $('editor-bpm').addEventListener('change', e => { const before = snapshotMap(); editorMap().bpm = Math.max(40, Math.min(300, Number(e.target.value) || 128)); recordHistory(before); persist(); renderEditor(); });
  $('timeline-zoom').addEventListener('input', renderEditor);
  $('snap-select').addEventListener('change',e=>{$('snap-select-foot').value=e.target.value;});
  $('snap-select-foot').addEventListener('change',e=>{$('snap-select').value=e.target.value;});
  $('timeline-scroll').addEventListener('scroll',()=>{$('timeline-ruler').style.transform=`translateY(-${$('timeline-scroll').scrollTop}px)`;});
  $('lane-labels').addEventListener('click',e=>{const label=e.target.closest('[data-lane]');if(label){editorLane=Number(label.dataset.lane);updateLaneButtons();renderEditor();}});
  document.querySelectorAll('.lane-chip').forEach(btn => btn.addEventListener('click', () => { editorLane = Number(btn.dataset.lane); updateLaneButtons(); renderEditor(); }));
  function updateLaneButtons() { document.querySelectorAll('.lane-chip').forEach(b => b.classList.toggle('selected', Number(b.dataset.lane) === editorLane)); }
  $('timeline-content').addEventListener('click', e => {
    if(!editorMap())return;
    const marker = e.target.closest('[data-object]');
    if (marker) { selectedObject = { kind: marker.dataset.object, id: marker.dataset.id }; const chosen = selectedObject.kind === 'note' ? editorMap().notes.find(n => n.id === selectedObject.id) : editorMap().events.find(ev => ev.id === selectedObject.id); if (chosen) cursorTime = chosen.t; $('event-panel').classList.toggle('hidden', selectedObject.kind !== 'event'); $('note-panel').classList.toggle('hidden', selectedObject.kind !== 'note'); document.querySelectorAll('.inspector-tabs button').forEach(b => b.classList.toggle('selected', b.dataset.panel === `${selectedObject.kind}-panel`)); renderEditor(); return; }
    const scroll=$('timeline-scroll');const rect=editorContent.getBoundingClientRect();const scale=22*Number($('timeline-zoom').value);const t=(e.clientY-rect.top+scroll.scrollTop)/scale;const lane=Math.max(0,Math.min(3,Math.floor((e.clientX-rect.left)/rect.width*4)));const beat=60/(Number(editorMap().bpm)||128);const snap=Number($('snap-select').value)*beat;cursorTime=Math.max(0,Math.round(t/snap)*snap);editorLane=lane;
    if(e.shiftKey){renderEditor();return;}
    const before=snapshotMap();const note={id:uid(),t:cursorTime,lane,shape:selectedSkin().shape,duration:0};editorMap().notes.push(note);editorMap().notes.sort((a,b)=>a.t-b.t);selectedObject={kind:'note',id:note.id};recordHistory(before);persist();renderEditor();
  });
  document.querySelectorAll('.inspector-tabs button').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('.inspector-tabs button').forEach(b => b.classList.toggle('selected', b === btn)); $('note-panel').classList.toggle('hidden', btn.dataset.panel !== 'note-panel'); $('event-panel').classList.toggle('hidden', btn.dataset.panel !== 'event-panel'); }));
  function renderInspector() {
    const note = selectedObject?.kind === 'note' ? editorMap()?.notes.find(n => n.id === selectedObject.id) : null;
    const event = selectedObject?.kind === 'event' ? editorMap()?.events.find(ev => ev.id === selectedObject.id) : null;
    $('note-empty').classList.toggle('hidden', !!note); $('note-fields').classList.toggle('hidden', !note);
    $('event-empty').classList.toggle('hidden', !!event); $('event-fields').classList.toggle('hidden', !event);
    if (note) { $('note-lane').value = note.lane; $('note-time').value = note.t.toFixed(2); $('note-shape').value = note.shape || selectedSkin().shape; }
    if (event) { $('event-type').value = event.type; $('event-time').value = Number(event.t).toFixed(2); $('event-color').value = event.color || '#f83ab7'; $('event-x').value = event.x || 0; $('event-y').value = event.y || 0; $('event-rotation').value = event.rotation || 0; $('event-scale').value = event.scale || 1; }
  }
  function interpolateKeyframes(events,time,type='keyframe') {
    const frames=(events||[]).filter(ev=>ev.type===type).sort((a,b)=>a.t-b.t);if(!frames.length)return{x:0,y:0,rotation:0,scale:1,intensity:1,style:null,color:null};
    let previous=null,next=frames.find(ev=>ev.t>time);for(const frame of frames){if(frame.t<=time)previous=frame;else break;}
    const from=previous||{t:0,x:0,y:0,rotation:0,scale:1,intensity:1,style:null,color:null};if(!next||!previous)return{x:Number(from.x)||0,y:Number(from.y)||0,rotation:Number(from.rotation)||0,scale:Number(from.scale)||1,intensity:Number(from.intensity)||1,style:from.style||null,color:from.color||null};
    const raw=Math.max(0,Math.min(1,(time-from.t)/Math.max(.001,next.t-from.t)));const eased=raw*raw*(3-2*raw);
    const mix=(a,b)=>Number(a||0)+(Number(b||0)-Number(a||0))*eased;
    return{x:mix(from.x,next.x),y:mix(from.y,next.y),rotation:mix(from.rotation,next.rotation),scale:mix(from.scale||1,next.scale||1),intensity:mix(from.intensity||1,next.intensity||1),style:from.style||next.style||null,color:from.color||next.color||null};
  }
  function interpolateEventColor(events,time){const frames=(events||[]).filter(ev=>ev.type==='color').sort((a,b)=>a.t-b.t);if(!frames.length)return '#f044b1';let previous=null,next=frames.find(ev=>ev.t>time);for(const frame of frames){if(frame.t<=time)previous=frame;else break;}if(!previous)return next?.color||frames[0].color||'#f044b1';if(!next)return previous.color||'#f044b1';const parse=value=>{const match=/^#([0-9a-f]{6})$/i.exec(value||'');return match?[parseInt(match[1].slice(0,2),16),parseInt(match[1].slice(2,4),16),parseInt(match[1].slice(4,6),16)]:null;};const from=parse(previous.color),to=parse(next.color);if(!from||!to)return previous.color||'#f044b1';const raw=Math.max(0,Math.min(1,(time-previous.t)/Math.max(.001,next.t-previous.t))),eased=raw*raw*(3-2*raw);return '#'+from.map((value,i)=>Math.round(value+(to[i]-value)*eased).toString(16).padStart(2,'0')).join('');}
  function renderEditorPreview() {
    const canvas=$('editor-preview-canvas');if(!canvas)return;const ctx=canvas.getContext('2d');const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
    const map=editorMap();if(!map){ctx.fillStyle='#0e111d';ctx.fillRect(0,0,w,h);return;}
    const time=editorPreviewPlaying?editorPreviewTime:cursorTime;const colors=['#f044b1','#4ce5ef','#9d7aff','#ffca58'];const tint=interpolateEventColor(map.events,time);
    const transform=interpolateKeyframes(map.events,time);const latestRotate=map.events.filter(ev=>ev.type==='rotate'&&ev.t<=time).sort((a,b)=>b.t-a.t)[0];const environment=getSong(selectedEditorSong)?.environment||'neon';
    ctx.save();ctx.translate(w/2+(transform.x||0)*w/100,h/2+(transform.y||0)*h/100);ctx.rotate(((transform.rotation||0)+(latestRotate?.rotation||0))*Math.PI/180);ctx.scale(transform.scale||1,transform.scale||1);ctx.translate(-w/2,-h/2);
    const gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,environment==='aurora'?'#0b2428':environment==='sunset'?'#261523':environment==='void'?'#090b13':'#14142a');gradient.addColorStop(1,'#090b13');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
    for(let lane=0;lane<4;lane++){const x=lane*w/4;ctx.fillStyle=lane%2?'rgba(255,255,255,.018)':'rgba(255,255,255,.045)';ctx.fillRect(x,0,w/4,h);ctx.strokeStyle=colors[lane];ctx.globalAlpha=.23;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();ctx.globalAlpha=1;}
    for(let y=0;y<h;y+=20){ctx.strokeStyle=`rgba(150,170,210,${y%80===0?.14:.045})`;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    const start=time-.5,span=5.5;
    for(const note of map.notes){if(note.t<start||note.t>start+span)continue;const y=((note.t-start)/span)*h;const x=(note.lane+.5)*w/4;const color=selectedSkin().color||colors[note.lane];const shape=note.shape||selectedSkin().shape;ctx.save();ctx.shadowColor=color;ctx.shadowBlur=state.postprocess?14:0;ctx.fillStyle=color;ctx.strokeStyle='#fff';ctx.globalAlpha=.92;
      ctx.translate(x,y);if(shape==='diamond')ctx.rotate(Math.PI/4);drawShape(ctx,shape,12);if(shape==='ring'){ctx.lineWidth=2.5;ctx.stroke();}else ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#121522';ctx.font='bold 9px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(laneSymbols[note.lane],0,0);ctx.restore();}
    ctx.strokeStyle=tint;ctx.globalAlpha=.9;ctx.lineWidth=2;if(state.postprocess){ctx.shadowColor=tint;ctx.shadowBlur=14;}else{ctx.shadowBlur=0;}ctx.beginPath();ctx.moveTo(0,h*.78);ctx.lineTo(w,h*.78);ctx.stroke();for(const ev of map.events){if(ev.type!=='flash'||!state.postprocess)continue;const age=time-ev.t;if(age>=0&&age<.36){ctx.globalAlpha=(1-age/.36)*.24;ctx.fillStyle=ev.color||'#fff';ctx.fillRect(0,0,w,h);}}ctx.restore();
    $('preview-time-label').textContent=formatDuration(time);$('preview-bpm').textContent=`${map.bpm||128} BPM`;
  }
  function editorPreviewFrame(){if(!editorPreviewPlaying)return;const map=editorMap();const duration=Number(getSong(selectedEditorSong)?.duration)||60;editorPreviewTime=(performance.now()-editorPreviewStart)/1000;if(editorPreviewTime>duration){editorPreviewPlaying=false;$('editor-preview-toggle').textContent='▶ PREVIEW';renderEditor();return;}
    $('preview-time').value=String(Math.round(editorPreviewTime));$('playhead').style.top=`${editorPreviewTime*22*Number($('timeline-zoom').value)}px`;renderEditorPreview();editorPreviewRAF=requestAnimationFrame(editorPreviewFrame);
  }
  $('editor-preview-toggle').addEventListener('click',()=>{editorPreviewPlaying=!editorPreviewPlaying;if(editorPreviewPlaying){editorPreviewStart=performance.now()-editorPreviewTime*1000;$('editor-preview-toggle').textContent='Ⅱ PAUSE';editorPreviewRAF=requestAnimationFrame(editorPreviewFrame);}else{cancelAnimationFrame(editorPreviewRAF);$('editor-preview-toggle').textContent='▶ PREVIEW';renderEditorPreview();}});
  $('preview-time').addEventListener('input',e=>{editorPreviewPlaying=false;cancelAnimationFrame(editorPreviewRAF);editorPreviewTime=Number(e.target.value);cursorTime=editorPreviewTime;$('editor-preview-toggle').textContent='▶ PREVIEW';renderEditor();});
  function editSelectedObject(kind, field, value) {
    const item = kind === 'note' ? editorMap()?.notes.find(n => n.id === selectedObject?.id) : editorMap()?.events.find(ev => ev.id === selectedObject?.id);
    if (!item) return;
    const before = snapshotMap(); item[field] = value; if (field === 'lane') item.lane = Math.max(0, Math.min(3, Number(value))); if (field === 't') item.t = Math.max(0, Number(value) || 0); recordHistory(before); persist(); renderEditor();
  }
  $('note-lane').addEventListener('change', e => editSelectedObject('note','lane',Number(e.target.value)));
  $('note-time').addEventListener('change', e => editSelectedObject('note','t',Number(e.target.value)));
  $('note-shape').addEventListener('change', e => editSelectedObject('note','shape',e.target.value));
  $('event-type').addEventListener('change', e => editSelectedObject('event','type',e.target.value));
  $('event-time').addEventListener('change', e => editSelectedObject('event','t',Number(e.target.value)));
  $('event-color').addEventListener('change', e => editSelectedObject('event','color',e.target.value));
  $('event-x').addEventListener('change', e => editSelectedObject('event','x',Number(e.target.value)));
  $('event-y').addEventListener('change', e => editSelectedObject('event','y',Number(e.target.value)));
  $('event-rotation').addEventListener('change', e => editSelectedObject('event','rotation',Number(e.target.value)));
  $('event-scale').addEventListener('change', e => editSelectedObject('event','scale',Number(e.target.value)));
  $('add-event').addEventListener('click', () => { if(!editorMap())return;const before = snapshotMap(); const event = { id: uid(), t: cursorTime, type: 'color', color: '#f83ab7', x: 0, y: 0, rotation: 0, scale: 1 }; editorMap().events.push(event); editorMap().events.sort((a,b) => a.t-b.t); selectedObject = { kind: 'event', id: event.id }; recordHistory(before); persist(); renderEditor(); document.querySelector('[data-panel="event-panel"]').click(); });
  $('delete-note').addEventListener('click', () => deleteSelected('note'));
  $('delete-event').addEventListener('click', () => deleteSelected('event'));
  function deleteSelected(kind) { const key = kind === 'note' ? 'notes' : 'events'; const before = snapshotMap(); editorMap()[key] = editorMap()[key].filter(x => x.id !== selectedObject?.id); selectedObject = null; recordHistory(before); persist(); renderEditor(); }
  function snapshotMap() { return JSON.stringify(editorMap()); }
  function recordHistory(before) { if (!before) return; const song=getSong(selectedEditorSong); if(song)song.mapEdited=true; undoStack.push(before); if (undoStack.length > 50) undoStack.shift(); redoStack = []; }
  function clearHistory() { undoStack = []; redoStack = []; }
  $('undo-btn').addEventListener('click', () => { if (!undoStack.length) return; redoStack.push(snapshotMap()); Object.assign(editorMap(), JSON.parse(undoStack.pop())); persist(); renderEditor(); });
  $('redo-btn').addEventListener('click', () => { if (!redoStack.length) return; undoStack.push(snapshotMap()); Object.assign(editorMap(), JSON.parse(redoStack.pop())); persist(); renderEditor(); });
  $('save-map').addEventListener('click', () => { persist(); toast('Mapping gespeichert.'); });
  $('add-difficulty')?.addEventListener('click', async () => {
    const song = getSong(selectedEditorSong);if(!song)return;const name = await askText('Difficulty Name (z. B. Expert):', ''); if (!name) return; const cleanName = name.trim();
    if (!cleanName || song.difficulties[cleanName]) { toast('Dieser Schwierigkeitsgrad existiert bereits.'); return; }
    song.difficulties[cleanName] = { bpm: Number(song.bpm) || 128, notes: [], events: [] }; selectedEditorDifficulty = cleanName; state.selectedSongId = song.id; state.selectedDifficulty = cleanName; clearHistory(); persist(); renderAll(); toast(`${cleanName} erstellt.`);
  });
  document.addEventListener('keydown', e => {
    if (keybindCapture >= 0) { if (['Escape','Tab'].includes(e.key)) { keybindCapture = -1; renderSettings(); return; } e.preventDefault(); const duplicate=state.keybinds.indexOf(e.code); if(duplicate>=0&&duplicate!==keybindCapture){keybindCapture=-1;renderSettings();toast('Diese Taste ist schon einer anderen Lane zugewiesen.');return;}state.keybinds[keybindCapture] = e.code; keybindCapture = -1; persist(); renderSettings(); renderGameKeys(); toast('Keybind geändert.'); return; }
    if (!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName) && document.querySelector('#view-editor.active')) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedObject) { e.preventDefault(); const collection = selectedObject.kind === 'note' ? 'notes' : 'events'; const obj = editorMap()[collection].find(x => x.id === selectedObject.id); copiedObject = { kind: selectedObject.kind, data: JSON.parse(JSON.stringify(obj)) }; toast(`${selectedObject.kind === 'note' ? 'Note' : 'Licht-Event'} kopiert.`); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && copiedObject) { e.preventDefault(); const before = snapshotMap(); const copy = { ...copiedObject.data, id: uid(), t: Math.max(0,cursorTime) }; const collection = copiedObject.kind === 'note' ? 'notes' : 'events'; editorMap()[collection].push(copy); editorMap()[collection].sort((a,b) => a.t-b.t); selectedObject = { kind: copiedObject.kind, id: copy.id }; recordHistory(before); persist(); renderEditor(); }
      if (e.key === 'Delete' && selectedObject) { e.preventDefault(); deleteSelected(selectedObject.kind); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const beat = 60/(editorMap()?.bpm||128); cursorTime = Math.max(0, cursorTime + (e.key === 'ArrowLeft' ? -beat : beat)); renderEditor(); }
    }
    if (game && e.code === 'Escape') { exitGame(); return; }
    if (game && e.code === 'Space') { e.preventDefault(); togglePause(); return; }
    if (game) { const lane = state.keybinds.indexOf(e.code); if (lane >= 0 && !e.repeat) { e.preventDefault();game.heldLanes.add(lane);handleLanePress(lane); } }
  });
  document.addEventListener('keyup', e => { if (game) { const lane = state.keybinds.indexOf(e.code); if(lane>=0)releaseLanePress(lane); } });

  // Editor exports are portable ZIP levels. In the developer window a level is published straight
  // to the cloud instead of a local folder, so every player downloads it automatically in game.
  $('export-level').addEventListener('click', exportSelectedLevel);
  async function buildLevelPackage(song) {
    const packageData = { format: 'afterglow-level', version: 1, packageId: song.packageId || song.id, title: song.title, artist: song.artist, bpm: song.bpm, duration: song.duration, environment: song.environment, difficulties: song.difficulties, audioFile: null, coverFile: null };
    const entries = [];
    let audio = await mediaGet(song.audioKey).catch(() => null);
    if(!audio){const liveUrl=mediaUrls.get(`${song.id}:audio`);if(liveUrl){try{audio=await fetch(liveUrl).then(response=>response.blob());}catch(_){audio=null;}}}
    if (!audio && song.assetUrl) { try { const response=await fetch(song.assetUrl); if(response.ok)audio=await response.blob(); } catch (_) { /* the level can still be exported without bundled audio */ } }
    if(!audio){toast(tr('Die OGG-Datei dieses Levels ist nicht verfügbar.','The OGG audio for this level is unavailable.'));return null;}
    const cover = await mediaGet(song.coverKey).catch(() => null);
    if (audio) { packageData.audioFile = 'audio.ogg'; entries.push({ name: packageData.audioFile, data: new Uint8Array(await audio.arrayBuffer()) }); }
    if (cover) { packageData.coverFile = `cover${extensionFromType(cover.type)}`; entries.push({ name: packageData.coverFile, data: new Uint8Array(await cover.arrayBuffer()) }); }
    entries.unshift({ name: 'song.json', data: new TextEncoder().encode(JSON.stringify(packageData, null, 2)) });
    return { packageData, zip: await makeZip(entries) };
  }
  async function exportSelectedLevel() {
    const song = getSong();
    if (!song) {
      toast(tr('Kein Song ausgewählt.','No song selected.'));
      return;
    }
    if (appMode === 'developer') {
      if (!window.afterglowDesktop?.publishLevel) {
        toast(tr('Desktop-API fehlt (preload). Starte die App neu im Developer-Modus.','Desktop API missing (preload). Restart the app in developer mode.'));
        return;
      }
      return publishLevelToCloud(song);
    }
    const built = await buildLevelPackage(song); if (!built) return;
    const link = document.createElement('a'); link.href = URL.createObjectURL(built.zip); link.download = `${slug(song.packageId || song.id)}.zip`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 10000); toast(tr('Level-Paket exportiert.','Level package exported.'));
  }
  let publishInFlight = false;
  async function publishLevelToCloud(song) {
    if (publishInFlight) {
      toast(tr('Upload läuft bereits …','Upload already in progress…'));
      return;
    }
    if (!window.afterglowDesktop?.publishLevel) {
      toast(tr('Veröffentlichen nicht verfügbar. Starte die App mit --developer und prüfe preload.cjs.','Publish unavailable. Start the app with --developer and check preload.cjs.'));
      return;
    }
    let deviceKey = await ensureDeveloperKey();
    // empty deviceKey is OK when the main process already stores the token
    publishInFlight = true;
    const button = $('export-level');
    const label = button?.innerHTML;
    if (button) { button.disabled = true; button.innerHTML = `… ${tr('WIRD HOCHGELADEN','UPLOADING')}`; }
    const runPublish = async (key) => {
      const built = await buildLevelPackage(song);
      if (!built) {
        toast(tr('Level-Paket konnte nicht gebaut werden (Audio fehlt?).','Could not build level package (missing audio?).'));
        return null;
      }
      let packageId = slug(built.packageData.packageId || song.packageId || song.id || song.title || 'level');
      if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(packageId)) {
        packageId = `level-${Date.now().toString(36)}`;
      }
      const version = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
      const bytes = new Uint8Array(await built.zip.arrayBuffer());
      if (!bytes.length) throw new Error(tr('Das ZIP ist leer.','The ZIP is empty.'));
      return window.afterglowDesktop.publishLevel({
        packageId,
        version,
        bytes,
        title: built.packageData.title,
        artist: built.packageData.artist,
        deviceKey: key || '',
      });
    };
    try {
      let result;
      try {
        result = await runPublish(deviceKey);
      } catch (error) {
        const message = error?.message || String(error);
        // Saved token missing/invalid → ask once, then retry.
        if (/Kein GitHub-Token|GitHub-Token stimmt nicht|401|abgelaufen|nicht in das Level-Repo schreiben/i.test(message)) {
          forgetDeveloperKey();
          deviceKey = await ensureDeveloperKey({ forcePrompt: true });
          if (!deviceKey) {
            toast(tr('Ohne GitHub-Token kann nicht veröffentlicht werden.','A GitHub token is required to publish.'));
            return;
          }
          result = await runPublish(deviceKey);
        } else {
          throw error;
        }
      }
      if (!result) return;
      if (deviceKey) await rememberDeveloperKey(deviceKey);
      const current = state.songs.find(item => item.id === song.id) || song;
      if (current) current.packageId = result.packageId;
      persist();
      toast(`${tr('Global veröffentlicht:','Published globally:')} ${result.packageId} · v${result.version}`);
      // Force local cloud fingerprint refresh so we don't re-download our own publish as "unknown".
      lastCloudFingerprint='';localStorage.removeItem('afterglow-cloud-fingerprint');
      state.cloudLevels[result.packageId]=result.version;persist();
      if ($('developer-status')) $('developer-status').textContent = `${result.packageId} · v${result.version} live`;
      renderDeveloperCloud();
      renderDeveloperCloud();
      renderSongs($('song-search')?.value || '');
    } catch (error) {
      const message = error?.message || String(error);
      if (/GitHub-Token stimmt nicht|401|abgelaufen/i.test(message)) forgetDeveloperKey();
      toast(`${tr('Veröffentlichen fehlgeschlagen:','Publish failed:')} ${message}`);
      if ($('developer-status')) $('developer-status').textContent = message;
      console.error('[afterglow] publish failed', error);
    } finally {
      publishInFlight = false;
      if (button) { button.disabled = false; button.innerHTML = label; }
    }
  }
  function extensionFromType(type = '') { return ({'audio/ogg':'.ogg','audio/mpeg':'.mp3','audio/wav':'.wav','audio/mp4':'.m4a','image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'})[type] || (type.startsWith('audio/') ? '.ogg' : '.png'); }
  function slug(s) { return String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'afterglow-level'; }
  const crcTable = (() => { const table = new Uint32Array(256); for (let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}return table; })();
  function crc32(data) { let c=0xffffffff; for(const b of data)c=crcTable[(c^b)&255]^(c>>>8); return (c^0xffffffff)>>>0; }
  async function compressRaw(data) { try { if (!window.CompressionStream) return null; const cs = new CompressionStream('deflate-raw'); const writer = cs.writable.getWriter(); writer.write(data); writer.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); } catch (_) { return null; } }
  async function makeZip(entries) {
    const local = []; const central = []; let offset = 0; const enc = new TextEncoder();
    for (const entry of entries) {
      const name = enc.encode(entry.name); const original = entry.data; const packed = await compressRaw(original); const method = packed ? 8 : 0; const content = packed || original; const crc = crc32(original); const time = new Date(); const dosTime = (time.getHours()<<11)|(time.getMinutes()<<5)|(time.getSeconds()>>1); const dosDate = ((time.getFullYear()-1980)<<9)|((time.getMonth()+1)<<5)|time.getDate();
      const lh = new Uint8Array(30+name.length); const ld=new DataView(lh.buffer); ld.setUint32(0,0x04034b50,true);ld.setUint16(4,20,true);ld.setUint16(6,0x800,true);ld.setUint16(8,method,true);ld.setUint16(10,dosTime,true);ld.setUint16(12,dosDate,true);ld.setUint32(14,crc,true);ld.setUint32(18,content.length,true);ld.setUint32(22,original.length,true);ld.setUint16(26,name.length,true);lh.set(name,30);
      local.push(lh,content);
      const ch=new Uint8Array(46+name.length);const cd=new DataView(ch.buffer);cd.setUint32(0,0x02014b50,true);cd.setUint16(4,20,true);cd.setUint16(6,20,true);cd.setUint16(8,0x800,true);cd.setUint16(10,method,true);cd.setUint16(12,dosTime,true);cd.setUint16(14,dosDate,true);cd.setUint32(16,crc,true);cd.setUint32(20,content.length,true);cd.setUint32(24,original.length,true);cd.setUint16(28,name.length,true);cd.setUint32(42,offset,true);ch.set(name,46);central.push(ch);offset+=lh.length+content.length;
    }
    const centralSize=central.reduce((n,a)=>n+a.length,0);const end=new Uint8Array(22);const dv=new DataView(end.buffer);dv.setUint32(0,0x06054b50,true);dv.setUint16(8,entries.length,true);dv.setUint16(10,entries.length,true);dv.setUint32(12,centralSize,true);dv.setUint32(16,offset,true);return new Blob([...local,...central,end],{type:'application/zip'});
  }
  function levelBytes(data){if(!data)return null;if(data instanceof Uint8Array)return data;if(ArrayBuffer.isView(data))return new Uint8Array(data.buffer,data.byteOffset,data.byteLength);if(data instanceof ArrayBuffer)return new Uint8Array(data);if(data.type==='Buffer'&&Array.isArray(data.data))return new Uint8Array(data.data);return null;}
  async function importZip(file, {silent=false,throwOnError=false}={}) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer()); const view = new DataView(bytes.buffer); let eocd=-1;
      for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65558);i--){if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}}
      if(eocd<0) throw new Error('ZIP footer missing');
      const count=view.getUint16(eocd+10,true);let ptr=view.getUint32(eocd+16,true);const files={};const dec=new TextDecoder();
      for(let i=0;i<count;i++){if(view.getUint32(ptr,true)!==0x02014b50)throw new Error('Bad ZIP entry');const method=view.getUint16(ptr+10,true);const csize=view.getUint32(ptr+20,true);const nlen=view.getUint16(ptr+28,true);const xlen=view.getUint16(ptr+30,true);const clen=view.getUint16(ptr+32,true);const loff=view.getUint32(ptr+42,true);const name=dec.decode(bytes.slice(ptr+46,ptr+46+nlen));const ln=view.getUint16(loff+26,true);const lx=view.getUint16(loff+28,true);const start=loff+30+ln+lx;let data=bytes.slice(start,start+csize);if(method===8){if(!window.DecompressionStream)throw new Error('Dieser Browser kann deflate nicht öffnen.');const ds=new DecompressionStream('deflate-raw');const writer=ds.writable.getWriter();writer.write(data);writer.close();data=new Uint8Array(await new Response(ds.readable).arrayBuffer());}else if(method!==0)throw new Error('ZIP-Kompressionsformat nicht unterstützt.');files[name.split('/').pop()]=data;ptr+=46+nlen+xlen+clen;}
      const jsonData=files['song.json']||files['level.json'];if(!jsonData)throw new Error('song.json fehlt');const spec=JSON.parse(dec.decode(jsonData));const audioName=(spec.audioFile&&files[spec.audioFile]?spec.audioFile:spec.audioFile?.split('/').pop())||Object.keys(files).find(n=>/\.ogg$/i.test(n));if(!audioName||!audioName.toLowerCase().endsWith('.ogg')||!files[audioName])throw new Error('Eine OGG-Audiodatei fehlt');const coverName=(spec.coverFile&&files[spec.coverFile]?spec.coverFile:spec.coverFile?.split('/').pop())||Object.keys(files).find(n=>/\.(png|jpe?g|webp)$/i.test(n));const coverType=coverName?.toLowerCase().endsWith('.png')?'image/png':coverName?.toLowerCase().endsWith('.webp')?'image/webp':'image/jpeg';const audio=new File([files[audioName]],audioName.split('/').pop(),{type:'audio/ogg'});const cover=coverName&&files[coverName]?new Blob([files[coverName]],{type:coverType}):null;return await importSongFiles(spec,audio,cover,{silent});
    }catch(err){if(!silent)toast(`Level konnte nicht geladen werden: ${err.message}`);if(throwOnError)throw err;return false;}
  }

  // Visual customization shop.
  function renderShop() {
    $('wallet-balance').textContent = Number(state.credits).toLocaleString('de-DE'); $('profile-credits').textContent = Number(state.credits).toLocaleString('de-DE'); const skin=selectedSkin(); $('equipped-name').textContent=skin.name; const preview=$('shop-preview').querySelector('.preview-note'); preview.className=`preview-note shape-${skin.shape}`; preview.style.setProperty('--item-color',skin.color); preview.style.background=skin.shape==='ring'?'transparent':skin.color; preview.style.borderColor=skin.color; $('shop-preview').style.filter=state.postprocess?'drop-shadow(0 0 12px #d33ac466)':'';
    $('shop-grid').innerHTML=skins.map((item)=>{const owned=state.ownedSkins.includes(item.id);const equipped=state.equippedSkin===item.id;return `<article class="shop-item ${equipped?'equipped':''}" style="--item-color:${item.color}"><div class="item-art"><span class="item-shape shape-${item.shape}"></span></div><div class="item-name">${escapeHtml(item.name)}</div><div class="item-desc">${escapeHtml(item.desc)}</div><button class="item-action ${owned?'owned':''}" data-skin="${item.id}">${equipped?tr('✓ AUSGERÜSTET','✓ EQUIPPED'):owned?tr('AUSRÜSTEN','EQUIP'):`<span class="item-cost">✦ ${item.price}</span> ${tr('KAUFEN','BUY')}`}</button></article>`;}).join('');
    $('shop-grid').querySelectorAll('[data-skin]').forEach(btn=>btn.addEventListener('click',()=>{const skin=skins.find(s=>s.id===btn.dataset.skin);if(state.ownedSkins.includes(skin.id)){state.equippedSkin=skin.id;persist();renderShop();toast(`${skin.name} ausgerüstet.`);}else if(state.credits>=skin.price){state.credits-=skin.price;state.ownedSkins.push(skin.id);state.equippedSkin=skin.id;persist();renderShop();toast(`${skin.name} freigeschaltet.`);}else toast('Dafür fehlen dir noch Credits.');}));
  }
  function renderSettings() {
    $('keybind-grid').innerHTML=laneNames.map((name,i)=>`<div class="keybind-card"><small>LANE ${i+1} · ${laneLabel(i)}</small><button class="bind-key ${keybindCapture===i?'waiting':''}" data-bind="${i}">${keybindCapture===i?tr('DRÜCK…','PRESS…'):displayKey(state.keybinds[i])}</button></div>`).join('');
    $('keybind-grid').querySelectorAll('[data-bind]').forEach(btn=>btn.addEventListener('click',()=>{keybindCapture=Number(btn.dataset.bind);renderSettings();}));
    $('volume-slider').value=state.volume; $('volume-label').textContent=`${state.volume}%`; $('latency-slider').value=state.latency; $('latency-label').textContent=`${state.latency>0?'+':''}${state.latency} ms`;
    $('postprocess-toggle') && ($('postprocess-toggle').checked=state.postprocess);
    $('particles-toggle') && ($('particles-toggle').checked=state.particles);
    $('drumfx-toggle') && ($('drumfx-toggle').checked=state.drumEffects);
    document.body.classList.toggle('no-post', !state.postprocess);
    document.querySelectorAll('.graphic-choice').forEach(b => b.classList.toggle('selected', b.dataset.graphic === state.graphic));
    document.body.classList.remove('graphic-neon', 'graphic-aurora', 'graphic-arcade');
    document.body.classList.add(`graphic-${state.graphic || 'neon'}`);
    document.body.dataset.graphic = state.graphic || 'neon';
  }
  function displayKey(code) { return ({ArrowLeft:'←',ArrowUp:'↑',ArrowDown:'↓',ArrowRight:'→',Space:'SPACE',ShiftLeft:'L-SHIFT',ShiftRight:'R-SHIFT',ControlLeft:'L-CTRL',AltLeft:'ALT'})[code] || String(code||'').replace(/^Key/,'').replace(/^Digit/,''); }

  // Audio latency calibration: auto from AudioContext + interactive click taps.
  let calibrateSession = null;
  function playCalibrateClick(when) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.18 * (state.volume / 100 || 0.5), when + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.09);
  }
  function stopCalibrate() {
    if (!calibrateSession) return;
    window.removeEventListener('keydown', calibrateSession.onKey, true);
    window.removeEventListener('pointerdown', calibrateSession.onPtr, true);
    clearTimeout(calibrateSession.timer);
    calibrateSession = null;
    const btn = $('calibrate-latency');
    if (btn) { btn.disabled = false; btn.textContent = tr('⚡ AUTO-KALIBRIERUNG', '⚡ AUTO CALIBRATE'); }
  }
  function applyLatencyMs(ms) {
    state.latency = Math.max(-150, Math.min(150, Math.round(ms)));
    persist();
    if ($('latency-slider')) $('latency-slider').value = state.latency;
    if ($('latency-label')) $('latency-label').textContent = `${state.latency > 0 ? '+' : ''}${state.latency} ms`;
  }
  function autoLatencyFromDevice() {
    const ctx = getAudioContext();
    if (!ctx) return 0;
    const base = Number(ctx.baseLatency) || 0;
    const out = Number(ctx.outputLatency) || 0;
    // Convert seconds → ms; typical devices report ~5–40 ms.
    return Math.round((base + out) * 1000);
  }
  async function startLatencyCalibration() {
    if (calibrateSession) { stopCalibrate(); return; }
    const ctx = getAudioContext();
    if (!ctx) {
      toast(tr('Audio-Kontext nicht verfügbar.', 'Audio context unavailable.'));
      return;
    }
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const btn = $('calibrate-latency');
    const hint = $('calibrate-hint');
    if (btn) { btn.disabled = true; btn.textContent = tr('… TIPPE ZUM CLICK', '… TAP TO THE CLICK'); }
    if (hint) hint.textContent = tr('8 Clicks — tippe genau im Moment des Tons (Leertaste oder Klick).', '8 clicks — tap exactly when you hear each beep (Space or click).');

    const interval = 0.55; // seconds between clicks
    const count = 8;
    const startAt = ctx.currentTime + 0.55;
    const clickTimes = [];
    for (let i = 0; i < count; i++) {
      const t = startAt + i * interval;
      clickTimes.push(t);
      playCalibrateClick(t);
    }
    const offsets = []; // userTap - scheduledClick, in ms (audio clock mapped via performance)

    // Map audio time ↔ performance.now using a sample at session start.
    const perfAtStart = performance.now();
    const audioAtStart = ctx.currentTime;
    const audioToPerf = (audioT) => perfAtStart + (audioT - audioAtStart) * 1000;

    const recordTap = () => {
      if (!calibrateSession) return;
      const nowPerf = performance.now();
      // Find nearest upcoming/past click within window
      let best = null;
      for (const ct of clickTimes) {
        const clickPerf = audioToPerf(ct);
        const delta = nowPerf - clickPerf; // positive = tapped after hearing schedule
        if (best === null || Math.abs(delta) < Math.abs(best)) best = delta;
      }
      if (best !== null && Math.abs(best) < 350) {
        offsets.push(best);
        if (hint) hint.textContent = tr(`Treffer ${offsets.length}/${count} …`, `Hit ${offsets.length}/${count} …`);
      }
    };

    const onKey = (e) => {
      if (['Escape'].includes(e.key)) { e.preventDefault(); stopCalibrate(); toast(tr('Kalibrierung abgebrochen.', 'Calibration cancelled.')); return; }
      if (e.repeat) return;
      e.preventDefault();
      recordTap();
    };
    const onPtr = (e) => { recordTap(); };

    calibrateSession = { onKey, onPtr, timer: null };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPtr, true);

    const durationMs = (0.55 + count * interval + 0.3) * 1000;
    calibrateSession.timer = setTimeout(() => {
      stopCalibrate();
      const deviceMs = autoLatencyFromDevice();
      let result = deviceMs;
      if (offsets.length >= 3) {
        const sorted = [...offsets].sort((a, b) => a - b);
        const mid = sorted[Math.floor(sorted.length / 2)];
        // If user taps after the scheduled time, audio felt late → push notes later (positive latency).
        result = Math.round(mid);
      } else if (offsets.length > 0) {
        result = Math.round(offsets.reduce((a, b) => a + b, 0) / offsets.length);
      }
      // Blend a little with device latency when few taps
      if (offsets.length < 4 && deviceMs) {
        result = Math.round(result * 0.7 + deviceMs * 0.3);
      }
      applyLatencyMs(result);
      if (hint) {
        hint.textContent = offsets.length
          ? tr(`Kalibriert: ${state.latency > 0 ? '+' : ''}${state.latency} ms (${offsets.length} Treffer).`, `Calibrated: ${state.latency > 0 ? '+' : ''}${state.latency} ms (${offsets.length} hits).`)
          : tr(`Geräte-Offset übernommen: ${state.latency > 0 ? '+' : ''}${state.latency} ms. Tippe nächstes Mal mit.`, `Device offset applied: ${state.latency > 0 ? '+' : ''}${state.latency} ms. Try tapping next time.`);
      }
      toast(tr(`Latenz gesetzt: ${state.latency > 0 ? '+' : ''}${state.latency} ms`, `Latency set: ${state.latency > 0 ? '+' : ''}${state.latency} ms`));
    }, durationMs);
  }
  function bindSetting(id, events, handler) {
    const node = $(id);
    if (!node) return;
    for (const ev of events.split(' ')) node.addEventListener(ev, handler);
  }
  bindSetting('reset-keybinds', 'click', () => {
    state.keybinds = ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'];
    persist(); renderSettings(); renderGameKeys();
    toast(tr('Pfeiltasten wiederhergestellt.', 'Arrow keys restored.'));
  });
  bindSetting('volume-slider', 'input change', (e) => {
    state.volume = Math.max(0, Math.min(100, Number(e.target.value) || 0));
    if ($('volume-label')) $('volume-label').textContent = `${state.volume}%`;
    if (audioElement) audioElement.volume = state.volume / 100;
    if (menuMusicGain && audioContext) menuMusicGain.gain.setTargetAtTime(.08 * (state.volume / 100), audioContext.currentTime, .08);
    persist();
  });
  bindSetting('latency-slider', 'input change', (e) => {
    state.latency = Math.max(-150, Math.min(150, Number(e.target.value) || 0));
    if ($('latency-label')) $('latency-label').textContent = `${state.latency > 0 ? '+' : ''}${state.latency} ms`;
    persist();
  });
  $('calibrate-latency')?.addEventListener('click', () => { startLatencyCalibration(); });

  function wireToggle(id, apply) {
    const input = $(id);
    if (!input) return;
    // Native <label> already toggles the checkbox — only react to change, no second flip.
    input.addEventListener('change', () => {
      apply(!!input.checked);
      persist();
      renderSettings();
    });
  }
  wireToggle('postprocess-toggle', (on) => {
    state.postprocess = on;
    document.body.classList.toggle('no-post', !on);
  });
  wireToggle('particles-toggle', (on) => { state.particles = on; });
  wireToggle('drumfx-toggle', (on) => { state.drumEffects = on; });
  document.querySelectorAll('.graphic-choice').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const value = btn.dataset.graphic || 'neon';
      setGraphic(value);
      persist();
      renderSettings();
      toast(tr(`Grafik: ${value.toUpperCase()}`, `Graphics: ${value.toUpperCase()}`));
    });
  });

  // Game play uses the imported OGG as its audio source and the generated map for timing.
  function renderGameKeys() { $('game-lane-keys').innerHTML=laneSymbols.map((symbol,i)=>`<button type="button" class="game-lane-key lane-${i}" data-lane="${i}"><span>${symbol}</span><b>${escapeHtml(displayKey(state.keybinds[i]))}</b></button>`).join(''); $('game-lane-keys').querySelectorAll('[data-lane]').forEach(button=>{button.addEventListener('pointerdown',e=>{e.preventDefault();const lane=Number(button.dataset.lane);game?.heldLanes.add(lane);handleLanePress(lane);});const release=()=>releaseLanePress(Number(button.dataset.lane));button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('pointerleave',e=>{if(e.buttons)release();});}); }
  const GAME_APPROACH=2.15;
  function startGame() {
    if(gameStarting)return;stopMenuMusic();const song=getSong();if(!song){toast(tr('Lade zuerst einen OGG-Song hoch, um weiterzumachen.','Upload an OGG song before continuing.'));return;}if(!song.audioKey&&!song.assetUrl){toast(tr('Dieses Level hat keinen Song. Lade eine OGG-Datei hoch.','This level has no song. Upload an OGG file.'));return;}
    gameStarting=true;
    (async()=>{try{
      cancelAnimationFrame(gameRaf);stopPreview();const audioUrl=await songMedia(song,'audio');if(!audioUrl||!state.songs.some(item=>item.id===song.id)){toast(tr('Die OGG-Datei konnte nicht geladen werden.','The OGG file could not be loaded.'));return;}
      if(!song.difficulties[state.selectedDifficulty])state.selectedDifficulty=Object.keys(song.difficulties)[0];const map=getDifficulty(song,state.selectedDifficulty);audioElement=new Audio(audioUrl);audioElement.preload='auto';audioElement.volume=state.volume/100;
      game={song,diffName:state.selectedDifficulty,map,status:'ready',score:0,combo:0,maxCombo:0,judged:0,hits:0,misses:0,perfects:0,greats:0,goods:0,health:100,judgedNotes:new Set(),heldLanes:new Set(),startAt:0,pausedAt:0,pausedGameTime:0,audioClock:null,audioPending:false,audioPendingTime:0,audioStartedOnce:false,audioAttempt:0,elapsed:0,duration:mappedDuration(song,map,8),particles:[],flash:0,drumFlash:0,hitShake:0,lastDrumBeat:-1,lastComboMilestone:0,musicStarted:false,audioTimer:0,sectionEnergy:.35};
      $('game-title').textContent=song.title.toUpperCase();$('game-difficulty').textContent=`${String(state.selectedDifficulty).toUpperCase()} · ${game.map.bpm||song.bpm} BPM`;$('game-score-value').textContent='000000';$('game-combo').textContent='0';$('game-combo').nextElementSibling.textContent=tr('COMBO','COMBO');$('game-accuracy-value').textContent='100%';$('game-accuracy').querySelector('small').textContent=tr('GENAUIGKEIT','ACCURACY');$('game-health').querySelector('.health-label small').textContent=tr('LEBEN','LIFE');$('game-health-fill').style.width='100%';$('game-health-fill').classList.remove('low');$('game-health-label').textContent='100%';$('game-progress-fill').style.width='0%';if($('game-time-label'))$('game-time-label').textContent='0:00 / 0:00';$('game-message').innerHTML=`<small>${tr('BEREIT?','READY?')}</small><b>3</b><span>${tr('Drücke eine beliebige Lane zum Starten','Press any lane to start')}</span>`;$('game-message').classList.remove('hidden');renderGameKeys();$('game-overlay').dataset.environment=song.environment||'neon';$('game-overlay').style.transform='';document.body.classList.add('in-game');$('game-overlay').classList.remove('hidden');game.status='countdown';game.countdown=3;game.countdownAt=performance.now();renderGame();
    }catch(_){toast(tr('Song konnte nicht gestartet werden.','Could not start the song.'));if(audioElement){audioElement.pause();audioElement=null;}}finally{gameStarting=false;}})();
  }
  $('game-exit').addEventListener('click',exitGame); $('pause-game').addEventListener('click',togglePause);
  function exitGame(){if(!game)return;cancelAnimationFrame(gameRaf);clearTimeout(game.audioTimer);if(audioElement){audioElement.pause();audioElement=null;}document.body.classList.remove('in-game');$('game-overlay').style.transform='';$('game-overlay').classList.add('hidden');game=null;if(appMode==='player')startMenuMusic();}
  function scheduleGameAudio(delay){if(!game)return;clearTimeout(game.audioTimer);game.audioTimer=setTimeout(()=>{if(game?.status==='playing')startGameAudio();},Math.max(0,delay));}
  function togglePause(){if(!game)return;if(game.status==='playing'){game.pausedGameTime=gameTime();game.status='paused';game.pausedAt=performance.now();game.audioAttempt++;game.audioPending=false;if(audioElement)audioElement.pause();$('game-message').innerHTML=`<small>${tr('PAUSE','PAUSED')}</small><b>Ⅱ</b><span>${tr('Drücke Leertaste oder Play zum Weiterspielen','Press Space or Play to resume')}</span>`;$('game-message').classList.remove('hidden');}else if(game.status==='paused'){game.status='playing';$('game-message').classList.add('hidden');if(audioElement)startGameAudio(game.pausedGameTime);}}
  function hitSfx(quality){
    const ctx=getAudioContext();if(!ctx)return;
    const now=ctx.currentTime;const vol=(state.volume/100)*0.12;
    if(quality==='PERFECT'){tone(880,.06,'sine',vol*1.2,now);tone(1320,.05,'triangle',vol*.7,now+.01);}
    else if(quality==='GREAT'){tone(660,.055,'sine',vol,now);tone(990,.04,'triangle',vol*.5,now+.008);}
    else if(quality==='GOOD'){tone(520,.05,'sine',vol*.85,now);}
    else {tone(140,.12,'sawtooth',vol*.5,now);tone(90,.14,'sine',vol*.4,now);}
  }
  function checkComboMilestone(){
    if(!game)return;
    const marks=[10,25,50,75,100,150,200];
    for(const m of marks){
      if(game.combo>=m&&game.lastComboMilestone<m){
        game.lastComboMilestone=m;
        game.score+=m*8;
        game.hitShake=Math.max(game.hitShake||0,.35+m/400);
        if(state.particles)for(let i=0;i<4;i++)spawnParticles(i%4,8+Math.min(12,m/10));
        showJudgement(`${m} COMBO`,true);
        toast(tr(`${m} Combo!`,` ${m} combo!`));
        state.credits+=Math.floor(m/10);
        persist();
        break;
      }
    }
  }
  function handleLanePress(lane){if(!game)return;if(game.status==='countdown'||game.status==='ready'){beginPlaying();return;}if(game.status==='paused'){togglePause();return;}if(game.status!=='playing')return;if(!game.musicStarted){if(!game.audioPending)startGameAudio(0);return;}const now=gameTime();const latency=Number(state.latency)/1000;let best=null,bestDelta=Infinity;for(const note of game.map.notes){if(note.lane!==lane||game.judgedNotes.has(note.id))continue;const delta=Math.abs(now-(note.t+latency));if(delta<bestDelta){bestDelta=delta;best=note;}}document.querySelector(`.game-lane-key[data-lane="${lane}"]`)?.classList.add('pressed');
    if(best&&bestDelta<=.19){
      game.judgedNotes.add(best.id);game.judged++;game.hits++;game.combo++;game.maxCombo=Math.max(game.combo,game.maxCombo);
      const quality=bestDelta<=.05?'PERFECT':bestDelta<=.1?'GREAT':'GOOD';
      if(quality==='PERFECT')game.perfects++;else if(quality==='GREAT')game.greats++;else game.goods++;
      game.score+=(quality==='PERFECT'?1200:quality==='GREAT'?850:550)+Math.min(game.combo,120)*4;
      recoverHealth(quality==='PERFECT'?1.2:quality==='GREAT'?.7:.4);
      game.hitShake=(quality==='PERFECT'?0.55:quality==='GREAT'?0.32:0.16);
      game.flash=Math.max(game.flash||0,quality==='PERFECT'?0.35:0.18);
      showJudgement(quality);hitSfx(quality);spawnParticles(lane,quality==='PERFECT'?22:quality==='GREAT'?14:9);checkComboMilestone();
    }else if(bestDelta>0.22){
      // empty tap near nothing — soft miss feedback without killing combo
      hitSfx('MISS');
    }
    updateGameHud();}
  function releaseLanePress(lane){if(!game)return;game.heldLanes.delete(lane);document.querySelector(`.game-lane-key[data-lane="${lane}"]`)?.classList.remove('pressed');}
  function beginPlaying(){if(!game)return;game.heldLanes.clear();game.status='playing';game.audioClock=null;game.audioPending=false;game.lastDrumBeat=-1;game.lastFrameAt=performance.now();$('game-message').classList.add('hidden');startGameAudio(0);}
  function gameTime(){if(!game)return 0;if(game.status==='paused')return game.pausedGameTime;if(game.audioPending)return game.audioPendingTime;if(game.musicStarted&&audioElement&&!audioElement.paused&&Number.isFinite(audioElement.currentTime))return audioElement.currentTime;if(game.audioClock)return game.audioClock.mediaTime+(performance.now()-game.audioClock.perfTime)/1000;return -GAME_APPROACH;}
  function updateGameHud(){if(!game)return;$('game-score-value').textContent=String(game.score).padStart(6,'0');$('game-combo').textContent=String(game.combo);$('game-combo').classList.toggle('hot',game.combo>=25);$('game-combo').classList.toggle('blazing',game.combo>=50);$('game-accuracy-value').textContent=game.judged?`${Math.round(game.hits/game.judged*100)}%`:'100%';$('game-health-fill').style.width=`${game.health}%`;$('game-health-fill').classList.toggle('low',game.health<=30);$('game-health-label').textContent=`${Math.ceil(game.health)}%`;}
  function damageHealth(amount){if(!game)return false;game.health=Math.max(0,game.health-amount);updateGameHud();if(game.health<=0){game.failed=true;endGame();return true;}return false;}
  function recoverHealth(amount){if(!game)return;game.health=Math.min(100,game.health+amount);}
  function showJudgement(label,milestone=false){
    const el=$('hit-feedback');if(!el)return;
    el.textContent=label;
    el.classList.remove('show','perfect','great','good','miss','milestone');
    const kind=milestone?'milestone':String(label).toLowerCase();
    el.classList.add('show',kind);
    clearTimeout(lastGameMessageTimer);
    lastGameMessageTimer=setTimeout(()=>el.classList.remove('show','perfect','great','good','miss','milestone'),milestone?520:280);
  }
  function spawnParticles(lane,count){if(!state.particles||!game)return;const canvas=$('game-canvas');const width=canvas.clientWidth,height=canvas.clientHeight;const laneW=Math.min(780,width*.72)/4;const baseX=(width-Math.min(780,width*.72))/2+laneW*(lane+.5);const y=height*.8;const color=selectedSkin().color;game.particles.push({type:'ring',x:baseX,y,radius:10,life:1,color});for(let i=0;i<count;i++){const angle=Math.random()*Math.PI*2,speed=2+Math.random()*6.5;game.particles.push({type:'spark',x:baseX,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-1.4,life:.75+Math.random()*.4,color});}}
  function startGameAudio(resumeAt=0){if(!game||!audioElement||game.status!=='playing')return;const attempt=++game.audioAttempt;game.audioPending=true;game.audioPendingTime=Math.max(0,resumeAt);game.musicStarted=false;audioElement.volume=state.volume/100;try{audioElement.currentTime=Math.max(0,resumeAt);}catch(_){}audioElement.onended=()=>{if(game&&game.status==='playing')endGame();};audioElement.play().then(()=>{if(!game||game.audioAttempt!==attempt||game.status!=='playing')return;game.audioPending=false;game.musicStarted=true;game.audioStartedOnce=true;game.audioClock={mediaTime:audioElement.currentTime,perfTime:performance.now()};}).catch(()=>{if(!game||game.audioAttempt!==attempt)return;game.audioPending=false;toast(tr('Drücke eine Lane, um den Browser-Audiozugriff zu erlauben.','Press a lane to allow audio playback.'));});}
  function getAudioContext(){if(!audioContext){const AudioCtx=window.AudioContext||window.webkitAudioContext;if(AudioCtx)audioContext=new AudioCtx();}if(audioContext?.state==='suspended')audioContext.resume().catch(()=>{});return audioContext;}
  function scheduleMenuChord(){if(!menuMusicGain||!audioContext||audioContext.state!=='running')return;const roots=[130.81,110,146.83,123.47],intervals=[0,3,7,12,19],root=roots[menuMusicIndex%roots.length],now=audioContext.currentTime+.04;menuMusicIndex++;for(let i=0;i<intervals.length;i++){const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=i<3?'sine':'triangle';osc.frequency.setValueAtTime(root*2**(intervals[i]/12),now);gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(i===0?.14:.06,now+.35);gain.gain.setValueAtTime(i===0?.14:.06,now+2.5);gain.gain.exponentialRampToValueAtTime(.0001,now+3.8);osc.connect(gain).connect(menuMusicGain);osc.start(now);osc.stop(now+3.85);}}
  function startMenuMusic(){if(appMode==='developer'||game||gameStarting||state.volume<=0)return;const ctx=getAudioContext();if(!ctx)return;if(ctx.state!=='running'){ctx.resume().then(()=>{if(appMode==='player'&&!game&&!gameStarting)startMenuMusic();}).catch(()=>{});return;}if(menuMusicGain)return;menuMusicGain=ctx.createGain();menuMusicGain.gain.setValueAtTime(.08*(state.volume/100),ctx.currentTime);menuMusicGain.connect(ctx.destination);scheduleMenuChord();menuMusicTimer=setInterval(scheduleMenuChord,3600);}
  function stopMenuMusic(){if(!menuMusicGain)return;clearInterval(menuMusicTimer);const gain=menuMusicGain;menuMusicGain=null;try{gain.gain.setTargetAtTime(.0001,audioContext.currentTime,.12);setTimeout(()=>gain.disconnect(),700);}catch(_){}}
  function tone(freq,duration,type='sine',volume=.05,when){const ctx=getAudioContext();if(!ctx)return;const osc=ctx.createOscillator();const gain=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,when||ctx.currentTime);gain.gain.setValueAtTime(Math.max(.0001,volume*(state.volume/80)),when||ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,(when||ctx.currentTime)+duration);osc.connect(gain).connect(ctx.destination);osc.start(when||ctx.currentTime);osc.stop((when||ctx.currentTime)+duration+.01);}
  function kick(when,strength=1){const ctx=getAudioContext();if(!ctx)return;const osc=ctx.createOscillator();const gain=ctx.createGain();osc.type='sine';osc.frequency.setValueAtTime(120,when);osc.frequency.exponentialRampToValueAtTime(42,when+.13);gain.gain.setValueAtTime(Math.max(.0001,.32*strength*(state.volume/80)),when);gain.gain.exponentialRampToValueAtTime(.001,when+.17);osc.connect(gain).connect(ctx.destination);osc.start(when);osc.stop(when+.19);}
  function snare(when,strength=1){tone(190,.11,'triangle',.055*strength,when);tone(760,.04,'square',.018*strength,when);}
  
  function renderGame(){if(!game||game.status==='ended')return;gameRaf=requestAnimationFrame(renderGame);const canvas=$('game-canvas');const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;const dpr=Math.min(window.devicePixelRatio||1,2);if(canvas.width!==Math.floor(width*dpr)||canvas.height!==Math.floor(height*dpr)){canvas.width=Math.floor(width*dpr);canvas.height=Math.floor(height*dpr);}const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);drawEnvironment(ctx,width,height,game.song.environment||'neon');if(game.status==='countdown'){const elapsed=(performance.now()-game.countdownAt)/1000;const number=3-Math.floor(elapsed);if(number>0){$('game-message').innerHTML=`<small>${tr('BEREIT?','READY?')}</small><b>${number}</b><span>${tr('Drücke eine beliebige Lane zum Starten','Press any lane to start')}</span>`;}else{game.status='ready';$('game-message').innerHTML=`<small>${tr('BEREIT?','READY?')}</small><b>♫</b><span>${tr('Drücke eine Lane, um den Song zu starten','Press any lane to start the song')}</span>`;}}
    if(game.status==='playing'&&game.musicStarted){const now=gameTime();const beatIndex=Math.floor(now/(60/(game.map.bpm||128)));if(beatIndex>=0&&beatIndex!==game.lastDrumBeat){game.lastDrumBeat=beatIndex;if(state.drumEffects){const when=(getAudioContext()?.currentTime||0)+.015;if(beatIndex%4===0||beatIndex%4===2)kick(when,.2);else snare(when,.38);game.drumFlash=.7;}}const delta=Math.min(.05,(performance.now()-(game.lastFrameAt||performance.now()))/1000);game.lastFrameAt=performance.now();game.drumFlash=Math.max(0,game.drumFlash-delta*2.8);const latency=state.latency/1000;for(const note of game.map.notes){if(game.judgedNotes.has(note.id))continue;if(now>note.t+latency+.22){game.judgedNotes.add(note.id);game.judged++;game.misses++;game.combo=0;game.lastComboMilestone=0;showJudgement('MISS');hitSfx('MISS');damageHealth(5);if(game.status==='ended')return;}}
      const duration=game.duration||32;const progress=Math.max(0,Math.min(100,now/duration*100));const left=Math.max(0,duration-now);if($('game-progress-fill'))$('game-progress-fill').style.width=`${progress}%`;if($('game-time-label')){const fmt=s=>{const m=Math.floor(s/60),ss=Math.floor(s%60);return `${m}:${String(ss).padStart(2,'0')}`;};$('game-time-label').textContent=`${fmt(now)} / ${fmt(duration)} · −${fmt(left)}`;}if(now>=duration){endGame();return;}}
    drawPlayfield(ctx,width,height);}
  function drawEnvironment(ctx,w,h,name){
    const sky=ctx.createLinearGradient(0,0,0,h);const themes={neon:['#080c18','#11132b','#080913'],aurora:['#05141e','#0b2932','#081320'],sunset:['#190f26','#4a1d35','#10101e'],void:['#03050d','#090b19','#02030a']},stops=themes[name]||themes.neon;sky.addColorStop(0,stops[0]);sky.addColorStop(.58,stops[1]);sky.addColorStop(1,stops[2]);ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);ctx.save();
    if(name==='aurora'){
      for(let band=0;band<4;band++){const y=h*(.13+band*.105),grad=ctx.createLinearGradient(0,y,0,y+h*.22);grad.addColorStop(0,'#5fffff00');grad.addColorStop(.45,band%2?'#65ffc52b':'#58dcff30');grad.addColorStop(1,'#8cffd300');ctx.beginPath();ctx.moveTo(-w*.1,y+h*.12);ctx.bezierCurveTo(w*.2,y-h*.08,w*.31,y+h*.2,w*.54,y+h*.06);ctx.bezierCurveTo(w*.73,y-h*.06,w*.85,y+h*.16,w*1.1,y-h*.01);ctx.lineWidth=h*.1;ctx.strokeStyle=grad;if(state.postprocess){ctx.shadowColor='#55f5de';ctx.shadowBlur=25;}else{ctx.shadowBlur=0;}ctx.stroke();}
      ctx.shadowBlur=0;for(let i=0;i<36;i++){const x=(i*97%997)/997*w,y=(i*193%641)/641*h*.66;ctx.globalAlpha=.25+(i%4)*.1;ctx.fillStyle='#d2fff7';ctx.fillRect(x,y,1.5,1.5);}
    }else if(name==='sunset'){
      const sun=ctx.createRadialGradient(w*.5,h*.38,2,w*.5,h*.38,h*.28);sun.addColorStop(0,'#fff4d8');sun.addColorStop(.16,'#ffbb7e');sun.addColorStop(.55,'#ff6e87aa');sun.addColorStop(1,'#ff557500');ctx.fillStyle=sun;ctx.beginPath();ctx.arc(w*.5,h*.38,h*.28,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.8;ctx.fillStyle='#ffce9c';ctx.fillRect(w*.5-h*.18,h*.38,w*.36,2);ctx.globalAlpha=.34;ctx.fillStyle='#fc719f';for(let i=0;i<6;i++)ctx.fillRect(w*.5-h*.23,h*.42+i*7,h*.46,2);ctx.globalAlpha=1;ctx.fillStyle='#120f20';ctx.beginPath();ctx.moveTo(0,h*.68);ctx.lineTo(w*.18,h*.47);ctx.lineTo(w*.32,h*.68);ctx.lineTo(w*.58,h*.44);ctx.lineTo(w*.81,h*.69);ctx.lineTo(w,h*.51);ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.fill();ctx.strokeStyle='#ff9a9a66';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,h*.69);ctx.lineTo(w,h*.69);ctx.stroke();
    }else if(name==='void'){
      for(let i=0;i<90;i++){const x=(i*137%997)/997*w,y=(i*281%991)/991*h,size=i%13===0?2:1;ctx.globalAlpha=.22+(i%5)*.12;ctx.fillStyle=i%7===0?'#b5a7ff':'#d9f4ff';ctx.fillRect(x,y,size,size);}
      ctx.globalAlpha=1;for(let i=0;i<9;i++){ctx.beginPath();ctx.ellipse(w*.5,h*.42,h*(.13+i*.045),h*(.045+i*.013),0,0,Math.PI*2);ctx.strokeStyle=i%2?'#9868ff38':'#4ae5ff3d';ctx.lineWidth=1.5;if(state.postprocess){ctx.shadowColor=i%2?'#985bff':'#43e2ff';ctx.shadowBlur=16;}else{ctx.shadowBlur=0;}ctx.stroke();}ctx.shadowBlur=0;
    }else{
      ctx.globalAlpha=.4;ctx.strokeStyle='#3ce7ff45';ctx.lineWidth=2;for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(w*.5,h*.38,w*(.16+i*.07),h*(.1+i*.038),0,Math.PI,Math.PI*2);ctx.stroke();}ctx.globalAlpha=.18;for(let i=0;i<13;i++){const x=w*.12+i*w*.065;ctx.beginPath();ctx.moveTo(x,h*.08);ctx.lineTo(w*.5+(x-w*.5)*.25,h*.65);ctx.stroke();}
    }
    ctx.restore();ctx.globalAlpha=1;
  }
  function drawPlayfield(ctx,w,h){
    if(!game)return;
    const boardW=Math.min(820,w*.76),left=(w-boardW)/2,laneW=boardW/4,topY=h*.075,hitY=h*.79,now=game.musicStarted?gameTime():-GAME_APPROACH,latency=Number(state.latency)/1000,skin=selectedSkin();
    const palette=['#ff4aa9','#43e8f2','#9a72ff','#ffd05a','#76f2b6'];
    const currentEvents=game.map.events.filter(ev=>ev.t<=now).sort((a,b)=>b.t-a.t);const colorEvent=currentEvents.find(ev=>ev.type==='color');const activeColor=interpolateEventColor(game.map.events,Math.max(0,now));const colorIndex=Math.max(0,palette.indexOf(activeColor));const laneColors=colorEvent?[activeColor,palette[(colorIndex+1)%palette.length],palette[(colorIndex+2)%palette.length],palette[(colorIndex+3)%palette.length]]:palette.slice(0,4);
    const eventTime=game.musicStarted?Math.max(0,now):0;const transform=interpolateKeyframes(game.map.events,eventTime);const laser=game.musicStarted?interpolateKeyframes(game.map.events,eventTime,'laser'):{x:0,y:0,rotation:0,scale:1,intensity:.7,style:'fan'};const activeLaser=currentEvents.find(ev=>ev.type==='laser');laser.style=activeLaser?.style||laser.style;laser.intensity=activeLaser?.intensity||laser.intensity;const laserColor=activeLaser?.color||activeColor||'#57eaff';const latestRotate=currentEvents.find(ev=>ev.type==='rotate');const rotateAge=latestRotate?Math.max(0,now-latestRotate.t):Infinity;const rotateFade=latestRotate?Math.max(0,1-Math.min(1,rotateAge/Math.max(.5,60/(game.map.bpm||128)*4))):0;const rotation=transform.rotation+(latestRotate?.rotation||0)*rotateFade;
    const beatPhase=game.musicStarted?now/(60/(game.map.bpm||128)):0;const beatPulse=game.musicStarted ? .5+.5*Math.cos(beatPhase*Math.PI*2) : 0;
    // Song arc: soft intro → build → peak → outro (drives lights intensity)
    const progress=game.duration?Math.max(0,Math.min(1,now/game.duration)):0;
    let sectionEnergy=.35;
    if(progress<.12)sectionEnergy=.22+progress*1.2;
    else if(progress<.35)sectionEnergy=.4+(progress-.12)*1.1;
    else if(progress<.72)sectionEnergy=.75+beatPulse*.2+(game.drumFlash||0)*.25;
    else if(progress<.88)sectionEnergy=.9+beatPulse*.15;
    else sectionEnergy=.35+(1-progress)*1.2;
    game.sectionEnergy=sectionEnergy;
    if(game.hitShake>0)game.hitShake=Math.max(0,game.hitShake-0.045);
    const glow=state.postprocess?1:0;
    if(glow){
      const bloom=ctx.createRadialGradient(w/2,h*.52,20,w/2,h*.52,h*.78);bloom.addColorStop(0,`${activeColor||'#d636b2'}${Math.round(28+beatPulse*22).toString(16).padStart(2,'0')}`);bloom.addColorStop(.45,`${activeColor||'#d636b2'}18`);bloom.addColorStop(1,'#07091300');ctx.fillStyle=bloom;ctx.fillRect(0,0,w,h);
    }
    laser.intensity=(Number(laser.intensity)||.7)*(0.55+sectionEnergy*.7);drawLaserRig(ctx,w,h,laser,laserColor,glow);
    // Moving light objects (orbs + spots) interpolated from map events
    if(game.musicStarted){
      const orbA=interpolateKeyframes(game.map.events,eventTime,'orb');
      const orbB=interpolateKeyframes(game.map.events,eventTime+.12,'orb');
      for(const [orb,alphaMul] of [[orbA,1],[orbB,.55]]){
        const ox=w/2+(orb.x||0)*w/100,oy=h*.42+(orb.y||0)*h/100,or=18+12*(orb.scale||1),ocolor=orb.color||laserColor,oint=Math.max(.2,Math.min(1.2,orb.intensity||.7))*alphaMul;
        ctx.save();
        if(glow){const g=ctx.createRadialGradient(ox,oy,2,ox,oy,or*2.4);g.addColorStop(0,`${ocolor}${Math.round(90*oint).toString(16).padStart(2,'0')}`);g.addColorStop(.45,`${ocolor}${Math.round(40*oint).toString(16).padStart(2,'0')}`);g.addColorStop(1,`${ocolor}00`);ctx.fillStyle=g;ctx.beginPath();ctx.arc(ox,oy,or*2.4,0,Math.PI*2);ctx.fill();}
        ctx.globalAlpha=.85*oint;ctx.fillStyle=ocolor;ctx.shadowColor=glow?ocolor:'transparent';ctx.shadowBlur=glow?22:0;ctx.beginPath();ctx.arc(ox,oy,or*.35,0,Math.PI*2);ctx.fill();
        ctx.restore();
      }
      const spot=interpolateKeyframes(game.map.events,eventTime,'spot');
      if((spot.intensity||0)>.05){
        const sx=w/2+(spot.x||0)*w/100,sy=h*.3+(spot.y||0)*h/100,srot=((spot.rotation||0)*Math.PI)/180,sint=Math.max(.15,Math.min(1.2,spot.intensity||.5)),scol=spot.color||activeColor||'#fff';
        ctx.save();ctx.translate(sx,sy);ctx.rotate(srot);
        const beam=ctx.createLinearGradient(0,-h*.05,0,h*.55);beam.addColorStop(0,`${scol}${Math.round(70*sint).toString(16).padStart(2,'0')}`);beam.addColorStop(.55,`${scol}${Math.round(22*sint).toString(16).padStart(2,'0')}`);beam.addColorStop(1,`${scol}00`);
        ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(-28*sint,-h*.04);ctx.lineTo(28*sint,-h*.04);ctx.lineTo(90*sint,h*.55);ctx.lineTo(-90*sint,h*.55);ctx.closePath();ctx.fill();
        if(glow){ctx.shadowColor=scol;ctx.shadowBlur=28;ctx.globalAlpha=.5*sint;ctx.fillStyle=scol;ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.fill();}
        ctx.restore();
      }
    }
    const camBoost=.85;const beatScale=1+(game.musicStarted?beatPulse*.01+game.drumFlash*.025:0)*(0.7+sectionEnergy*.3);const rawScale=Number(transform.scale)||1;const liveScale=1+(rawScale-1)*.55*beatScale;const shake=(game.hitShake||0)*10;const sx=(Math.random()-.5)*shake,sy=(Math.random()-.5)*shake;
    ctx.save();ctx.translate(w/2+(transform.x||0)*w/100*camBoost+sx,h/2+(transform.y||0)*h/100*camBoost+sy);ctx.rotate(rotation*Math.PI/180*.7);ctx.scale(liveScale,liveScale);ctx.translate(-w/2,-h/2);
    const topWidth=boardW*.58,topLeft=(w-topWidth)/2;
    for(let lane=0;lane<4;lane++){
      const bottomX=left+lane*laneW,topX=topLeft+lane*topWidth/4,color=laneColors[lane];
      const fill=ctx.createLinearGradient(0,topY,0,hitY);fill.addColorStop(0,'rgba(12,15,28,.02)');fill.addColorStop(1,`${color}12`);ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(topX,topY);ctx.lineTo(topX+topWidth/4,topY);ctx.lineTo(bottomX+laneW,hitY);ctx.lineTo(bottomX,hitY);ctx.closePath();ctx.fill();
      ctx.save();ctx.strokeStyle=color;ctx.globalAlpha=.22;ctx.lineWidth=1;ctx.shadowColor=color;ctx.shadowBlur=glow?12:0;ctx.beginPath();ctx.moveTo(topX,topY);ctx.lineTo(bottomX,hitY+24);ctx.stroke();ctx.restore();
    }
    for(let i=0;i<=12;i++){const p=i/12,y=topY+(hitY-topY)*p;const rowWidth=topWidth+(boardW-topWidth)*p;const rowLeft=(w-rowWidth)/2;const alpha=.025+p*.055;ctx.strokeStyle=`rgba(168,183,221,${alpha})`;ctx.lineWidth=i%3===0?1.2:.7;ctx.beginPath();ctx.moveTo(rowLeft,y);ctx.lineTo(rowLeft+rowWidth,y);ctx.stroke();}
    ctx.save();ctx.strokeStyle='#f4f7ff';ctx.globalAlpha=.55;ctx.lineWidth=2.4;ctx.shadowColor=glow?'#9ef6ff':'transparent';ctx.shadowBlur=glow?14:0;ctx.beginPath();ctx.moveTo(left-4,hitY);ctx.lineTo(left+boardW+4,hitY);ctx.stroke();ctx.globalAlpha=.2;ctx.lineWidth=8;ctx.stroke();ctx.shadowBlur=0;ctx.restore();
    const yForDelta=delta=>topY+(hitY-topY)*(1-delta/GAME_APPROACH);
    for(let lane=0;lane<4;lane++){
      const cx=left+laneW*(lane+.5),color=laneColors[lane],pulse=beatPulse+(game.heldLanes.has(lane)?.35:0);
      ctx.save();ctx.shadowColor=color;ctx.shadowBlur=glow?18+24*pulse:0;ctx.strokeStyle=color;ctx.globalAlpha=glow?.72+.42*pulse:.42+.16*pulse;ctx.lineWidth=glow?2.6:1.6;ctx.beginPath();ctx.moveTo(cx-laneW*.28,hitY);ctx.lineTo(cx+laneW*.28,hitY);ctx.stroke();ctx.globalAlpha=glow?.38+.4*pulse:.18;ctx.lineWidth=glow?1.6:1;ctx.beginPath();ctx.ellipse(cx,hitY,glow?18+9*pulse:12,glow?8+5*pulse:5,0,0,Math.PI*2);ctx.stroke();ctx.restore();
      ctx.fillStyle='#dce4f5';ctx.globalAlpha=.5;ctx.font='600 13px sans-serif';ctx.textAlign='center';ctx.fillText(laneSymbols[lane],cx,hitY+29);ctx.globalAlpha=1;
    }
    if(game.musicStarted&&game.status==='playing')for(const note of game.map.notes){
      if(game.judgedNotes.has(note.id))continue;const startDelta=note.t+latency-now;if(startDelta>GAME_APPROACH||startDelta<-.25)continue;
      const y=yForDelta(startDelta),cx=left+laneW*(note.lane+.5),approach=Math.max(0,Math.min(1,1-startDelta/GAME_APPROACH)),size=Math.min(64,laneW*.58)*(0.82+.18*approach),color=skin.color||laneColors[note.lane],noteShape=note.shape||skin.shape;
      ctx.save();ctx.translate(cx,y);if(noteShape==='diamond')ctx.rotate(Math.PI/4);
      // approach ring for readability
      ctx.globalAlpha=.15+.35*approach;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,size*.85*(1.35-approach*.35),0,Math.PI*2);ctx.stroke();
      if(glow){ctx.shadowColor=color;ctx.shadowBlur=28+14*approach*sectionEnergy;ctx.globalAlpha=.3+.2*approach;drawShape(ctx,noteShape,size*1.3);ctx.fill();ctx.shadowBlur=18;}
      ctx.fillStyle=color;ctx.strokeStyle='#fff';ctx.globalAlpha=.98;drawShape(ctx,noteShape,size);if(noteShape==='ring'){ctx.lineWidth=4;ctx.stroke();}else ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=.9;ctx.lineWidth=1.5;drawShape(ctx,noteShape,size);ctx.stroke();ctx.restore();
      ctx.fillStyle='#101321';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(laneSymbols[note.lane],cx,y);ctx.textBaseline='alphabetic';
    }
    ctx.restore();for(const event of game.map.events){if(event.type!=='flash'||!game.musicStarted||!glow)continue;const age=now-event.t;if(age>=0&&age<.42){const a=(1-age/.42)*.42;ctx.fillStyle=event.color||'#fff';ctx.globalAlpha=a;ctx.fillRect(0,0,w,h);ctx.globalAlpha=1;}}if(glow&&game.drumFlash>0){ctx.fillStyle=activeColor||'#fff';ctx.globalAlpha=game.drumFlash*.18;ctx.fillRect(0,0,w,h);ctx.globalAlpha=1;}
    if(game.particles?.length){ctx.save();ctx.translate(w/2+(transform.x||0)*w/100,h/2+(transform.y||0)*h/100);ctx.rotate(rotation*Math.PI/180);ctx.scale((Number(transform.scale)||1)*beatScale,(Number(transform.scale)||1)*beatScale);ctx.translate(-w/2,-h/2);for(const p of game.particles){p.life-=p.type==='ring'?.035:.022;if(p.type==='ring'){p.radius+=2.6;ctx.globalAlpha=Math.max(0,p.life);ctx.strokeStyle=p.color;ctx.lineWidth=2;ctx.shadowColor=p.color;ctx.shadowBlur=glow?15:0;ctx.beginPath();ctx.arc(p.x,p.y,p.radius,0,Math.PI*2);ctx.stroke();}else{p.x+=p.vx;p.y+=p.vy;p.vy+=.08;ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=glow?10:0;ctx.beginPath();ctx.arc(p.x,p.y,2.2,0,Math.PI*2);ctx.fill();}}ctx.restore();game.particles=game.particles.filter(p=>p.life>0);ctx.globalAlpha=1;ctx.shadowBlur=0;}
  }
  function drawLaserRig(ctx,w,h,event,color,glow){
    const x=(event.x||0)*w/100,y=(event.y||0)*h/100,scale=Math.max(.5,Math.min(1.7,Number(event.scale)||1)),intensity=Math.max(.3,Math.min(1.55,Number(event.intensity)||1));
    ctx.save();ctx.translate(w/2+x,h*.45+y);ctx.rotate((Number(event.rotation)||0)*Math.PI/180);ctx.scale(scale,scale);
    const rays=[],style=event.style||'fan';
    if(style==='tunnel'){
      const focusY=-h*.08;for(let i=0;i<9;i++){const edgeX=-w*.54+i*w*.135;rays.push([edgeX,-h*.5,edgeX*.24,focusY]);rays.push([edgeX,h*.42,edgeX*.24,focusY]);}
    }else if(style==='cross'){
      rays.push([-w*.52,-h*.48,w*.52,h*.42],[-w*.52,h*.42,w*.52,-h*.48],[-w*.34,-h*.5,w*.34,h*.4],[-w*.34,h*.4,w*.34,-h*.5]);
    }else if(style==='sweep'){
      for(let i=0;i<6;i++){const startX=-w*.55+i*w*.22;rays.push([startX,-h*.48,startX+w*.18,h*.43]);}
    }else if(style==='orbit'){
      for(let i=0;i<10;i++){const a=i/10*Math.PI*2;const r1=h*.12,r2=h*.38;rays.push([Math.cos(a)*r1,Math.sin(a)*r1*.6,Math.cos(a+0.4)*r2,Math.sin(a+0.4)*r2*.65]);}
    }else if(style==='burst'){
      for(let i=0;i<12;i++){const a=i/12*Math.PI*2;rays.push([0,0,Math.cos(a)*w*.48,Math.sin(a)*h*.38]);}
    }else{
      for(let i=0;i<9;i++){const endX=-w*.52+i*w*.13;rays.push([0,-h*.42,endX,h*.43]);}
    }
    ctx.save();ctx.lineCap='round';
    if(glow){
      ctx.globalAlpha=.42*intensity;ctx.shadowColor=color;ctx.shadowBlur=42;ctx.strokeStyle=color;ctx.lineWidth=16;
      for(const [x1,y1,x2,y2] of rays){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
      ctx.globalAlpha=.82*intensity;ctx.shadowBlur=22;ctx.lineWidth=6;
      for(const [x1,y1,x2,y2] of rays){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
      ctx.globalAlpha=.95*intensity;ctx.shadowBlur=8;ctx.strokeStyle='#f7fdff';ctx.lineWidth=1.6;
      for(const [x1,y1,x2,y2] of rays){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
    }else{
      ctx.shadowBlur=0;ctx.shadowColor='transparent';ctx.globalAlpha=.55*Math.min(1,intensity);ctx.strokeStyle=color;ctx.lineWidth=2.2;
      for(const [x1,y1,x2,y2] of rays){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
    }
    ctx.restore();ctx.restore();
  }
  function drawShape(ctx,shape,size){ctx.beginPath();if(shape==='circle')ctx.arc(0,0,size*.52,0,Math.PI*2);else if(shape==='ring')ctx.arc(0,0,size*.52,0,Math.PI*2);else if(shape==='star'){for(let i=0;i<10;i++){const r=i%2?size*.22:size*.55;const a=-Math.PI/2+i*Math.PI/5;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();}else if(shape==='hex'){for(let i=0;i<6;i++){const a=i*Math.PI/3;const x=Math.cos(a)*size*.5,y=Math.sin(a)*size*.5;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();}else if(shape==='cross'){ctx.rect(-size*.18,-size*.55,size*.36,size*1.1);ctx.rect(-size*.55,-size*.18,size*1.1,size*.36);}else if(shape==='chevron'){ctx.moveTo(-size*.48,-size*.45);ctx.lineTo(0,-size*.45);ctx.lineTo(size*.48,0);ctx.lineTo(0,size*.45);ctx.lineTo(-size*.48,size*.45);ctx.lineTo(-size*.05,0);ctx.closePath();}else if(shape==='bolt'){ctx.moveTo(size*.15,-size*.55);ctx.lineTo(-size*.35,size*.05);ctx.lineTo(-size*.03,size*.05);ctx.lineTo(-size*.18,size*.55);ctx.lineTo(size*.38,-size*.12);ctx.lineTo(size*.06,-size*.12);ctx.closePath();}else if(shape==='wave'){ctx.ellipse(0,0,size*.55,size*.22,-.5,0,Math.PI*2);}else ctx.rect(-size*.5,-size*.5,size,size);}
  function endGame(){if(!game)return;cancelAnimationFrame(gameRaf);clearTimeout(game.audioTimer);game.status='ended';if(audioElement){audioElement.pause();audioElement=null;}const key=mapKey(game.song.id,game.diffName),accuracy=game.judged?Math.round(game.hits/game.judged*100):100;
    const perfectRate=game.judged?game.perfects/game.judged:0;
    let grade='C';
    if(!game.failed&&accuracy>=99&&perfectRate>=.7)grade='S';
    else if(!game.failed&&accuracy>=96)grade='A';
    else if(!game.failed&&accuracy>=90)grade='B';
    else if(game.failed)grade='F';
    const isPb=game.score>(state.bestScores[key]||0);
    if(isPb){state.bestScores[key]=game.score;state.bestAccuracy[key]=accuracy;}
    state.leaderboard.unshift({songId:game.song.id,title:game.song.title,difficulty:game.diffName,score:game.score,accuracy,combo:game.maxCombo,grade,playedAt:new Date().toISOString()});
    state.leaderboard=state.leaderboard.sort((a,b)=>Number(b.score)-Number(a.score)).slice(0,100);
    let earned=Math.max(10,Math.floor(game.score/3500)*10)+Math.floor(game.maxCombo/10)*5;
    if(grade==='S')earned+=40;else if(grade==='A')earned+=20;else if(grade==='B')earned+=10;
    if(isPb)earned+=15;
    state.credits+=earned;persist();updateGameHud();$('game-overlay').style.transform='';
    $('game-message').innerHTML=`<small>${game.failed?tr('RUN GESCHEITERT','RUN FAILED'):tr('RUN BEENDET','RUN COMPLETE')} · ${game.diffName.toUpperCase()}${isPb?' · PB':''}</small>
      <div class="run-grade grade-${grade}">${grade}</div>
      <b>${game.score.toLocaleString(state.language==='de'?'de-DE':'en-US')}</b>
      <span>${game.perfects} PERFECT · ${game.greats} GREAT · ${game.goods} GOOD · ${game.misses} MISS</span>
      <span>${tr('BESTE COMBO','BEST COMBO')} ${game.maxCombo} · ${accuracy}% ${tr('GENAUIGKEIT','ACCURACY')} · +${earned} ✦</span>
      <button class="play-btn" id="play-again" style="margin-top:14px">${tr('NOCH EIN RUN','PLAY AGAIN')} <i>↻</i></button>`;
    $('game-message').classList.remove('hidden');$('play-again').addEventListener('click',startGame);renderSongs($('song-search').value);renderShop();}
  window.addEventListener('resize',()=>{if(game)renderGameKeys();});

  async function boot() {
    const desktop=window.afterglowDesktop;
    if(desktop){try{const context=await desktop.getContext();appMode=context.mode==='developer'?'developer':'player';contentVersion=context.version||contentVersion;if(appMode==='developer'){const catalog=await desktop.listLevels();contentVersion=String(catalog.version||contentVersion);}}catch(_){appMode='player';}}
    $('language-select').value=state.language;setGraphic(state.graphic);applyAppMode();renderAll();
    state.songs.forEach(s=>{if(s.coverKey)songMedia(s,'cover').then(url=>{if(url){objectUrlCache.set(`${s.id}:cover`,url);renderSongs($('song-search').value);renderEditor();}});});
    refreshLegacyAutoMaps();applyLanguage();
    if(desktop){
      // Local folder still auto-imports when files appear next to the portable EXE.
      desktop.onLevelsChanged?.(()=>{if(!isGameplayActive())syncLevelsFromFolder({quiet:true});});
      await syncLevelsFromFolder({quiet:true});
      // Cloud: only a silent badge check — no auto download, no spam during play.
      await checkAppUpdates({silent:true});
      await checkCloudUpdates({silent:true});
    }
    if(appMode==='developer'){
      renderDeveloperCloud();
      // Show real package/app version (not only Levels content version).
      if(desktop?.getAppVersion){
        desktop.getAppVersion().then(info=>{
          const v=String(info?.version||'').trim();
          if(v&&$('developer-version')){
            // Prefer higher of contentVersion vs package version for the input.
            const cur=($('developer-version').value||'').trim();
            if(!cur||cur==='1.0.0'||cur===contentVersion) $('developer-version').value=v;
            if($('developer-status'))$('developer-status').textContent=`lokal v${v}`;
          }
        }).catch(()=>{});
      }
    }
    if(appMode==='player')document.addEventListener('pointerdown',startMenuMusic);
  }
  function isGameplayActive(){
    return Boolean(game && (game.status==='playing'||game.status==='countdown'||game.status==='paused'||document.body.classList.contains('in-game')));
  }
  function setCloudLoading(visible, title='', detail='', progress=0){
    const el=$('cloud-loading');if(!el)return;
    // Never cover the playfield mid-run.
    if(visible&&isGameplayActive())return;
    el.classList.toggle('hidden',!visible);
    if(title&&$('cloud-loading-title'))$('cloud-loading-title').textContent=title;
    if(detail&&$('cloud-loading-detail'))$('cloud-loading-detail').textContent=detail;
    if($('cloud-loading-fill'))$('cloud-loading-fill').style.width=`${Math.max(4,Math.min(100,progress))}%`;
  }
  let lastCloudFingerprint = localStorage.getItem('afterglow-cloud-fingerprint') || '';

  let pendingCloudUpdates = [];
  let pendingAppUpdate = null;
  function refreshUpdateBadge(){
    const on=Boolean((pendingCloudUpdates&&pendingCloudUpdates.length)||(pendingAppUpdate&&pendingAppUpdate.available));
    for(const id of ['settings-update-dot','cloud-card-dot']){
      const el=$(id);if(el)el.classList.toggle('hidden',!on);
    }
    const apply=$('cloud-apply-updates');
    if(apply)apply.disabled=!pendingCloudUpdates.length;
    const appBtn=$('app-download-update');
    if(appBtn)appBtn.disabled=!(pendingAppUpdate&&pendingAppUpdate.available);
  }
  function setUpdateBadge(on){
    // legacy helper — prefer refreshUpdateBadge
    if(!on){pendingCloudUpdates=[];}
    refreshUpdateBadge();
  }
  function setCloudStatus(text){
    const el=$('cloud-update-status');if(el)el.textContent=text;
  }
  function setAppStatus(text){
    const el=$('app-update-status');if(el)el.textContent=text;
  }
  function fillAppVersionSelect(info){
    const sel=$('app-version-select');if(!sel)return;
    const local=info?.localVersion||'';
    const versions=[...(info?.versions||[])];
    if(info?.remoteVersion&&!versions.includes(info.remoteVersion))versions.unshift(info.remoteVersion);
    if(local&&!versions.includes(local))versions.unshift(local);
    const uniq=[...new Set(versions.filter(Boolean))];
    sel.innerHTML=uniq.length?uniq.map(v=>{
      const tag=v===local?tr(' (aktuell)',' (current)'):compareVersionClient(v,local)<0?tr(' (älter)',' (older)'):tr(' (neuer)',' (newer)');
      return `<option value="${attr(v)}" ${v===local?'selected':''}>v${escapeHtml(v)}${tag}</option>`;
    }).join(''):`<option value="">${tr('Keine Versionen gefunden','No versions found')}</option>`;
    const apply=$('app-download-update');
    if(apply)apply.disabled=!uniq.some(v=>v&&v!==local)&&!uniq.length;
    // Enable install whenever a different version exists or same (reinstall)
    if(apply)apply.disabled=!uniq.length;
  }
  function compareVersionClient(a,b){
    const pa=String(a||'0').replace(/^v/i,'').split(/[.+-]/).map(x=>parseInt(x,10)||0);
    const pb=String(b||'0').replace(/^v/i,'').split(/[.+-]/).map(x=>parseInt(x,10)||0);
    const n=Math.max(pa.length,pb.length);
    for(let i=0;i<n;i++){const d=(pa[i]||0)-(pb[i]||0);if(d)return d<0?-1:1;}
    return 0;
  }
  async function checkAppUpdates({silent=false}={}){
    const desktop=window.afterglowDesktop;
    if(!desktop?.checkAppUpdate){
      if(!silent)setAppStatus(tr('Spiel-Update nicht verfügbar.','App update not available.'));
      pendingAppUpdate=null;refreshUpdateBadge();return null;
    }
    if(!silent)setAppStatus(tr('Prüfe Spiel-Version…','Checking app version…'));
    try{
      const info=await desktop.checkAppUpdate();
      pendingAppUpdate=info;
      fillAppVersionSelect(info);
      if(info.available){
        setAppStatus(tr(
          `Online: v${info.remoteVersion} · installiert: v${info.localVersion}${info.notes?': '+info.notes:''}`,
          `Online: v${info.remoteVersion} · installed: v${info.localVersion}${info.notes?': '+info.notes:''}`
        ));
      }else{
        setAppStatus(tr(`Spiel v${info.localVersion||'?'} · ${ (info.versions||[]).length } Version(en) online`,`App v${info.localVersion||'?'} · ${ (info.versions||[]).length } version(s) online`));
      }
      refreshUpdateBadge();
      return info;
    }catch(error){
      if(!silent)setAppStatus(error.message||String(error));
      pendingAppUpdate=null;refreshUpdateBadge();return null;
    }
  }
  /** Silent/manual catalog check. Does NOT download — only sets red dot + pending list. */
  async function checkCloudUpdates({silent=false}={}){
    const desktop=window.afterglowDesktop;
    if(!desktop?.listCloudLevels){
      if(!silent)setCloudStatus(tr('Cloud ist in diesem Build nicht verfügbar.','Cloud is not available in this build.'));
      pendingCloudUpdates=[];refreshUpdateBadge();return [];
    }
    if(!silent)setCloudStatus(tr('Suche nach Updates…','Checking for updates…'));
    try{
      const catalog=await desktop.listCloudLevels();
      if(!catalog||catalog.configured===false){
        setCloudStatus(tr('Cloud ist nicht konfiguriert.','Cloud is not configured.'));
        pendingCloudUpdates=[];refreshUpdateBadge();return [];
      }
      if(catalog.error){
        setCloudStatus(catalog.error);
        pendingCloudUpdates=[];refreshUpdateBadge();return [];
      }
      const remote=catalog.levels||[];
      const fingerprint=String(catalog.fingerprint||'');
      pendingCloudUpdates=remote.filter(level=>state.cloudLevels[level.packageId]!==level.version);
      if(fingerprint&&!pendingCloudUpdates.length){
        lastCloudFingerprint=fingerprint;
        localStorage.setItem('afterglow-cloud-fingerprint',fingerprint);
      }
      if(pendingCloudUpdates.length){
        refreshUpdateBadge();
        const names=pendingCloudUpdates.slice(0,3).map(l=>l.title||l.packageId).join(', ');
        setCloudStatus(tr(
          `${pendingCloudUpdates.length} Update(s) verfügbar: ${names}${pendingCloudUpdates.length>3?' …':''}`,
          `${pendingCloudUpdates.length} update(s) available: ${names}${pendingCloudUpdates.length>3?' …':''}`
        ));
      }else{
        refreshUpdateBadge();
        setCloudStatus(tr('Alles aktuell — keine neuen Cloud-Level.','Everything up to date — no new cloud levels.'));
      }
      return pendingCloudUpdates;
    }catch(error){
      if(!silent)setCloudStatus(error.message||String(error));
      pendingCloudUpdates=[];refreshUpdateBadge();return [];
    }
  }
  // Cloud levels: only download when packageId/version actually changed.
  async function syncCloudLevels({quiet=false,force=false}={}){
    const desktop=window.afterglowDesktop;
    if(!desktop?.listCloudLevels||cloudSyncPromise)return cloudSyncPromise;
    if(isGameplayActive()&&!force)return null;
    cloudSyncPromise=(async()=>{try{
      // Silent catalog check first — no overlay while only comparing fingerprints.
      const catalog=await desktop.listCloudLevels();
      if(!catalog||catalog.configured===false||catalog.error)return;
      const fingerprint=String(catalog.fingerprint||'');
      const remote=catalog.levels||[];
      const known=new Set(remote.map(level=>level.packageId));
      const pending=remote.filter(level=>state.cloudLevels[level.packageId]!==level.version);
      // Nothing new and catalog unchanged → stop completely (no UI, no import).
      if(!force&&fingerprint&&fingerprint===lastCloudFingerprint&&!pending.length)return;
      if(fingerprint){lastCloudFingerprint=fingerprint;localStorage.setItem('afterglow-cloud-fingerprint',fingerprint);}
      if(!pending.length){
        // Catalog meta changed but every package already matches local versions.
        let removed=0;
        for(const song of [...state.songs]){
          if(song.packageId&&!known.has(song.packageId)&&state.cloudLevels[song.packageId]){removeSongLocal(song.id);removed++;}
        }
        if(removed){persist();renderAll();if(!quiet)toast(tr(`${removed} Level wurden vom Entwickler entfernt.`,`${removed} level(s) were removed by the developer.`));}
        return;
      }
      // Real downloads pending → show loader (unless quiet background with user in menus is ok to show).
      if(!quiet)setCloudLoading(true,tr('CLOUD DOWNLOAD','CLOUD DOWNLOAD'),tr(`${pending.length} neues Level…`,`${pending.length} new level(s)…`),12);
      let imported=0;const failures=[];
      for(let i=0;i<pending.length;i++){
        if(isGameplayActive())break;
        const level=pending[i];
        const label=level.title||level.packageId||'Level';
        const pct=12+Math.round((i/Math.max(1,pending.length))*80);
        if(!quiet)setCloudLoading(true,tr('CLOUD DOWNLOAD','CLOUD DOWNLOAD'),tr(`Lade „${label}“ (${i+1}/${pending.length})…`,`Downloading “${label}” (${i+1}/${pending.length})…`),pct);
        try{
          const pack=await desktop.downloadLevel(level.packageId);
          const bytes=levelBytes(pack?.data);if(!bytes)throw new Error('Leeres Paket');
          const existed=state.songs.some(song=>song.packageId===level.packageId);
          const file=new File([bytes],`${level.packageId}.zip`,{type:'application/zip'});
          if(await importZip(file,{silent:true,throwOnError:true})){state.cloudLevels[level.packageId]=level.version;if(!existed)imported++;}
        }catch(error){failures.push(`${level.title||level.packageId}: ${error.message}`);}
      }
      for(const song of [...state.songs]){
        if(song.packageId&&!known.has(song.packageId)&&state.cloudLevels[song.packageId]){removeSongLocal(song.id);}
      }
      persist();
      if(imported&&!quiet){renderAll();toast(tr(`${imported} Level aus der Cloud geladen.`,`Loaded ${imported} level(s) from the cloud.`));}
      else if(imported)renderAll();
      if(failures.length&&!quiet)toast(`${tr('Cloud-Level fehlgeschlagen:','Cloud level failed:')} ${failures[0]}`);
    }catch(_){/* local library stays playable */}
    finally{setCloudLoading(false);cloudSyncPromise=null;}})();return cloudSyncPromise;
  }
  function removeSongLocal(id){
    const song=state.songs.find(item=>item.id===id);if(!song)return;
    if(audioElement&&state.selectedSongId===id)stopPreview();
    if(game?.song?.id===id)exitGame();
    state.songs=state.songs.filter(item=>item!==song);releaseSongMedia(song);
    for(const key of Object.keys(state.bestScores))if(key.startsWith(`${id}::`))delete state.bestScores[key];
    for(const key of Object.keys(state.bestAccuracy||{}))if(key.startsWith(`${id}::`))delete state.bestAccuracy[key];
    if(state.selectedSongId===id){state.selectedSongId=state.songs[0]?.id||null;}
  }
  async function renderDeveloperCloud(){
    const list=$('developer-cloud-list');if(!list||appMode!=='developer'||!window.afterglowDesktop?.listCloudLevels)return;
    list.innerHTML=`<div class="cloud-empty">… ${tr('Cloud wird geladen','Loading cloud')}</div>`;
    const catalog=await window.afterglowDesktop.listCloudLevels().catch(error=>({error:error.message}));
    if(!catalog||catalog.configured===false){list.innerHTML=`<div class="cloud-empty">${tr('Cloud ist in diesem Build nicht konfiguriert.','The cloud is not configured in this build.')}</div>`;return;}
    if(catalog.error){list.innerHTML=`<div class="cloud-empty">${escapeHtml(catalog.error)}</div>`;return;}
    const levels=catalog.levels||[];
    list.innerHTML=levels.length?levels.map(level=>`<div class="cloud-row"><div><b>${escapeHtml(level.title||level.packageId)}</b><small>${escapeHtml(level.artist||'')} · ${escapeHtml(level.packageId)}</small></div><div class="cloud-meta"><small>v${escapeHtml(level.version)} · ${(level.size/1048576).toFixed(1)} MB</small><button class="small-action danger" data-cloud-delete="${attr(level.packageId)}">${tr('LÖSCHEN','DELETE')}</button></div></div>`).join(''):`<div class="cloud-empty">${tr('Noch keine Level in der Cloud.','No levels in the cloud yet.')}</div>`;
    list.querySelectorAll('[data-cloud-delete]').forEach(button=>button.addEventListener('click',()=>developerDeleteLevel(button.dataset.cloudDelete)));
  }
  let cloudSyncPromise=null;
  async function syncLevelsFromFolder({quiet=false}={}){
    if(!window.afterglowDesktop||levelsSyncPromise)return levelsSyncPromise;
    if(isGameplayActive())return null;
    levelsSyncPromise=(async()=>{try{
      const catalog=await window.afterglowDesktop.listLevels(),oldVersion=contentVersion;contentVersion=String(catalog.version||contentVersion);$('build-version').textContent=`LOCAL PLAY · v${contentVersion}`;
      let imported=0;for(const entry of catalog.files||[]){const stamp=`${entry.size}:${Math.floor(entry.modified)}`;if(state.levelsSeen[entry.name]===stamp)continue;const pack=await window.afterglowDesktop.readLevel(entry.name),file=new File([pack.data],entry.name,{type:'application/zip'});if(await importZip(file,{silent:true})){state.levelsSeen[entry.name]=stamp;persist();imported++;}}
      if(imported){renderAll();if(!quiet)toast(tr(`${imported} neue/geänderte Level geladen.`,`Loaded ${imported} new or updated level(s).`));}
      if(oldVersion!==contentVersion&&!quiet)toast(`${tr('Neue Content-Version:','New content version:')} ${contentVersion}`);
    }catch(_){/* Keep the local library available if the hidden level directory cannot be read. */}})().finally(()=>{levelsSyncPromise=null;});return levelsSyncPromise;
  }
  $('developer-cloud-refresh')?.addEventListener('click',()=>renderDeveloperCloud());
  $('developer-change-token')?.addEventListener('click',()=>changeDeveloperKey());
  $('developer-save-version').addEventListener('click',async()=>{if(appMode!=='developer'||!window.afterglowDesktop)return;try{const result=await window.afterglowDesktop.saveVersion($('developer-version').value);contentVersion=result.version;$('developer-version').value=contentVersion;$('developer-status').textContent=`v${contentVersion} lokal gespeichert`;toast(tr('Version lokal gespeichert. Für Spieler: APP-UPDATE VERÖFFENTLICHEN.','Version saved locally. For players: PUBLISH APP UPDATE.'));}catch(error){$('developer-status').textContent=error.message;toast(`${tr('Version ungültig:','Invalid version:')} ${error.message}`);}});
  async function refreshLegacyAutoMaps(){for(const song of state.songs){if(song.mapSource!=='audio-analysis'||Number(song.mapVersion)>=5)continue;const audio=await mediaGet(song.audioKey).catch(()=>null);if(!audio)continue;const edited=Boolean(song.mapEdited),previous=song.difficulties;if(await autoMapSong(song,audio)){if(edited){const generated=song.difficulties;song.difficulties={...previous,'Expert+':generated['Expert+']};song.mapVersion=5;}persist();renderSongs($('song-search').value);renderEditor();}}}
  $('cloud-check-updates')?.addEventListener('click',async()=>{
    const btn=$('cloud-check-updates');if(btn)btn.disabled=true;
    try{
      const appInfo=await checkAppUpdates({silent:false});
      const list=await checkCloudUpdates({silent:false});
      const parts=[];
      if(appInfo?.available)parts.push(tr(`Spiel v${appInfo.remoteVersion}`,`App v${appInfo.remoteVersion}`));
      if(list.length)parts.push(tr(`${list.length} Level`,`${list.length} level(s)`));
      if(parts.length)toast(tr(`Update gefunden: ${parts.join(' · ')}`,`Update found: ${parts.join(' · ')}`));
      else toast(tr('Alles aktuell.','Everything up to date.'));
    }finally{if(btn)btn.disabled=false;}
  });
  $('app-download-update')?.addEventListener('click',async()=>{
    if(!window.afterglowDesktop?.downloadAppUpdate){
      toast(tr('Kein Spiel-Update verfügbar.','No app update available.'));return;
    }
    const selected=($('app-version-select')?.value||'').trim()||pendingAppUpdate?.remoteVersion||'';
    if(!selected){toast(tr('Bitte eine Version wählen.','Please choose a version.'));return;}
    const local=pendingAppUpdate?.localVersion||'';
    const isDown=local&&compareVersionClient(selected,local)<0;
    if(isDown&&!confirm(tr(`Zu älterer Version v${selected} zurück (jetzt v${local})?`,`Roll back to older v${selected} (now v${local})?`)))return;
    const btn=$('app-download-update');if(btn)btn.disabled=true;
    setAppStatus(tr(`Lade v${selected}…`,`Downloading v${selected}…`));
    try{
      const result=await window.afterglowDesktop.downloadAppUpdate({version:selected});
      if(result.downloaded){
        const err=(result.applyErrors&&result.applyErrors.slice(0,2).join(' | '))||'';
        setAppStatus(tr(
          `v${result.remoteVersion||result.version}: ${result.copied||0} Dateien → ${result.targetDir||'?'} ${err?('· '+err):''}. Neustart…`,
          `v${result.remoteVersion||result.version}: ${result.copied||0} files → ${result.targetDir||'?'} ${err?('· '+err):''}. Restarting…`
        ));
        toast(tr('Update geladen — App startet neu…','Update downloaded — app restarting…'));
      }else if(result.asar){
        setAppStatus(tr('Build mit app.asar erkannt. Bitte mit asar:false neu bauen (win-unpacked).','asar build detected. Rebuild with asar:false (win-unpacked).'));
        toast(tr('asar-Build kann sich nicht selbst updaten.','asar build cannot self-update.'));
      }else{
        setAppStatus(tr('Bereits aktuell.','Already up to date.'));
      }
      await checkAppUpdates({silent:true});
    }catch(error){
      setAppStatus(error.message||String(error));
      toast(error.message||String(error));
    }finally{if(btn)btn.disabled=false;refreshUpdateBadge();}
  });
  $('cloud-apply-updates')?.addEventListener('click',async()=>{
    if(!pendingCloudUpdates.length){toast(tr('Keine Level-Updates ausstehend.','No level updates pending.'));return;}
    const btn=$('cloud-apply-updates');if(btn)btn.disabled=true;
    try{
      await syncCloudLevels({quiet:false,force:true});
      await checkCloudUpdates({silent:true});
    }finally{if(btn)btn.disabled=false;}
  });
  $('app-publish-update-top')?.addEventListener('click',()=>$('app-publish-update')?.click());
  $('app-publish-update')?.addEventListener('click',async()=>{
    if(appMode!=='developer'||!window.afterglowDesktop?.publishAppUpdate)return;
    let versionInput=($('developer-version')?.value||'').trim();
    if(!versionInput&&window.afterglowDesktop.getAppVersion){
      try{versionInput=(await window.afterglowDesktop.getAppVersion()).version||'';}catch(_){ }
    }
    if(!versionInput)versionInput=contentVersion||'1.0.0';
    const notes=await askText(
      tr(`App-Update v${versionInput} — Notiz für Spieler (optional):`,`App update v${versionInput} — note for players (optional):`),
      ''
    ).catch(()=>null);
    if(notes===null)return;
    let key=await ensureDeveloperKey();
    try{
      try{await window.afterglowDesktop.saveVersion(versionInput);}catch(_){ }
      const result=await window.afterglowDesktop.publishAppUpdate({deviceKey:key||'',notes:notes||'',version:versionInput});
      contentVersion=result.version;
      if($('developer-version'))$('developer-version').value=result.version;
      if($('developer-status'))$('developer-status').textContent=`App v${result.version} live`;
      toast(tr(`App v${result.version} veröffentlicht (${result.files} Dateien).`,`App v${result.version} published (${result.files} files).`));
      setAppStatus(tr(`Zuletzt veröffentlicht: v${result.version}`,`Last published: v${result.version}`));
    }catch(error){
      toast(error.message||String(error));
      if($('developer-status'))$('developer-status').textContent=error.message||String(error);
    }
  });
  boot();
})();
