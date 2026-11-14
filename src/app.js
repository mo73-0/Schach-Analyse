(() => {
'use strict';
const $ = id => document.getElementById(id);
const C = Chess, A = Analysis;
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
};
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- settings ----------
const THEMES = { green: ['#ebecd0', '#739552', 'Grün'], brown: ['#f0d9b5', '#b58863', 'Holz'], blue: ['#dee3e6', '#8ca2ad', 'Blau'], gray: ['#e0e0e0', '#9a9a9a', 'Grau'] };
const STRENGTH = { fast: { label: 'Schnell', ms: 250, depth: 18 }, std: { label: 'Standard', ms: 600, depth: 20 }, deep: { label: 'Gründlich', ms: 1500, depth: 22 } };
const DEFAULTS = { ccUser: '', liUser: '', sound: true, anim: true, strength: 'std', liveDepth: 18, lines: 3, arrow: true, evalbar: true, badges: true, coords: true, theme: 'green' };
let S = Object.assign({}, DEFAULTS, LS.get('sa_settings', {}));
S.lines = Math.min(3, Math.max(1, S.lines));
if (!STRENGTH[S.strength]) S.strength = 'std';
const saveSettings = () => LS.set('sa_settings', S);

// ---------- sound (Lichess move/capture samples) ----------
// modes: [freq Hz, decay time-constant s, amplitude]
const Sound = {
  ctx: null, bufs: null, building: null,
  unlock() {
    try {
      if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      if (this.ctx && !this.bufs && !this.building) this.build();
    } catch (e) { this.ctx = null; }
  },
  async build() {
    this.building = (async () => {
      const out = {};
      for (const kind of ['move', 'capture']) {
        const b64 = LS.get('sa_snd_' + kind, null);
        const b = b64 ? await this.decodeB64(b64) : null;
        out[kind] = b ? [b] : [];
      }
      this.bufs = out;
    })();
    try { await this.building; } catch (e) { console.warn('sound', e); }
    this.building = null;
  },
  async decodeB64(b64) {
    try {
      const bin = atob(b64), arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return await new Promise((res, rej) => {
        const p = this.ctx.decodeAudioData(arr.buffer, res, rej);
        if (p && p.then) p.then(res, rej);
      });
    } catch (e) { console.warn('decode', e); return null; }
  },
  playBuf(kind, when = 0, vol = 1) {
    const list = this.bufs && this.bufs[kind];
    if (!list || !list.length) return;
    const src = this.ctx.createBufferSource(); src.buffer = list[Math.floor(Math.random() * list.length)];
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(g).connect(this.ctx.destination);
    src.start(this.ctx.currentTime + 0.005 + when);
  },
  play(kind) {
    if (!S.sound) return;
    this.unlock();
    if (!this.ctx || !this.bufs) return;
    try { this.playBuf(kind === 'capture' ? 'capture' : 'move'); } catch (e) { /* ignore */ }
  },
  forMove(m, fenAfter) {
    if (!m) return;
    const san = m.san || '';
    if (san.includes('#') || (fenAfter && C.status(C.parseFen(fenAfter)) === 'stalemate')) this.play('end');
    else if (san.startsWith('O-O')) this.play('castle');
    else if (san.includes('x')) this.play('capture');
    else this.play('move');
  },
};
document.addEventListener('touchend', () => { if (S.sound) Sound.unlock(); }, { passive: true });
// block pinch / double-tap zoom (iOS ignores user-scalable=no)
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
document.addEventListener('click', () => { if (S.sound) Sound.unlock(); });

// ---------- piece animation ----------
let pendingAnim = null; // {from, to} in board squares: piece now on `to` slides in from `from`
function animMove(m, reverse) {
  if (!S.anim || !m) return;
  const list = [reverse ? { from: m.to, to: m.from } : { from: m.from, to: m.to }];
  // castling: animate the rook too
  if (Math.abs(m.from - m.to) === 2 && /^O-O/.test(m.san || '')) {
    const kside = m.to > m.from;
    const rf = kside ? m.to + 1 : m.to - 2, rt = kside ? m.to - 1 : m.to + 1;
    list.push(reverse ? { from: rt, to: rf } : { from: rf, to: rt });
  }
  pendingAnim = list;
}
function runAnim() {
  const list = pendingAnim; pendingAnim = null;
  if (!list) return;
  for (const a of list) {
    const el = boardEl.querySelector(`.sq[data-s="${a.to}"] .pc`);
    if (!el) continue;
    const [x1, y1] = sqXY(a.from), [x2, y2] = sqXY(a.to);
    el.classList.add('moving');
    el.style.transition = 'none';
    el.style.transform = `translate(${(x1 - x2) * 100}%, ${(y1 - y2) * 100}%)`;
    void el.offsetWidth;
    el.style.transition = 'transform 160ms cubic-bezier(.3,.7,.4,1)';
    el.style.transform = 'translate(0,0)';
    el.addEventListener('transitionend', () => el.classList.remove('moving'), { once: true });
  }
}

// ---------- engine ----------
const ENGINE_URLS = ['stockfish/stockfish-19-lite-single.js']; // shipped with the page
function makeEngine() { return {
  worker: null, current: null, queue: [], initP: null, status: 'idle',
  init() {
    if (this.initP) return this.initP;
    this.status = 'loading'; renderEngine();
    this.initP = (async () => {
      for (const url of ENGINE_URLS) {
        try { await this._try(url); ENGINE_URL = url; this.status = 'ready'; renderEngine(); return true; } catch (e) { console.warn('engine', url, e); }
      }
      this.status = 'failed'; renderEngine(); showOverlay(false);
      throw new Error('Stockfish konnte nicht geladen werden.');
    })();
    return this.initP;
  },
  _try(url) {
    return new Promise((resolve, reject) => {
      let w;
      try { w = new Worker(url); } catch (e) { reject(e); return; }
      const to = setTimeout(() => { w.terminate(); reject(new Error('timeout')); }, 30000);
      w.onerror = e => { clearTimeout(to); w.terminate(); reject(e); };
      w.onmessage = e => {
        const line = typeof e.data === 'string' ? e.data : '';
        if (line.trim() === 'uciok') {
          clearTimeout(to);
          this.worker = w;
          w.onerror = ev => console.warn('engine error', ev);
          w.onmessage = ev => this._line(typeof ev.data === 'string' ? ev.data : '');
          this.send('setoption name Hash value 32');
          this.send('isready');
          resolve();
        }
      };
      w.postMessage('uci');
    });
  },
  send(cmd) { this.worker && this.worker.postMessage(cmd); },
  search(job) { // {fen, depth, multipv, kind, onInfo, front}
    return new Promise(resolve => {
      job.resolve = resolve; job.lines = [];
      if (job.front) this.queue.unshift(job); else this.queue.push(job);
      this._pump();
    });
  },
  _pump() {
    if (this.current || !this.queue.length || !this.worker) return;
    const j = this.current = this.queue.shift();
    j.turn = j.fen.split(' ')[1];
    this.send('setoption name MultiPV value ' + j.multipv);
    this.send('position fen ' + j.fen);
    this.send('go depth ' + j.depth + (j.movetime ? ' movetime ' + j.movetime : ''));
  },
  _line(line) {
    const j = this.current;
    if (!j) return;
    if (line.startsWith('info') && line.includes(' pv ') && !/ (lower|upper)bound/.test(line)) {
      const t = line.split(' ');
      let depth = 0, mpv = 1, cp = null, mate = null, pv = [];
      for (let k = 1; k < t.length; k++) {
        if (t[k] === 'depth') depth = +t[++k];
        else if (t[k] === 'multipv') mpv = +t[++k];
        else if (t[k] === 'score') { const ty = t[++k], v = +t[++k]; if (ty === 'cp') cp = v; else mate = v; }
        else if (t[k] === 'pv') { pv = t.slice(k + 1); break; }
      }
      const sg = j.turn === 'w' ? 1 : -1;
      const L = { depth, pv };
      if (mate != null) { L.mate = sg * mate; L.cpw = Math.sign(L.mate || sg) * (100000 - Math.abs(mate)); }
      else { L.cp = sg * cp; L.cpw = L.cp; }
      j.lines[mpv - 1] = L;
      if (j.onInfo && mpv === j.multipv) j.onInfo(j.lines.filter(Boolean), depth);
    } else if (line.startsWith('bestmove')) {
      this.current = null;
      j.resolve(j.cancelled ? null : { lines: j.lines.filter(Boolean) });
      this._pump();
    }
  },
  cancel(kind) {
    this.queue = this.queue.filter(j => { if (!kind || j.kind === kind) { j.resolve(null); return false; } return true; });
    if (this.current && (!kind || this.current.kind === kind)) { this.current.cancelled = true; this.send('stop'); }
  },
}; }
const Engine = makeEngine();
const Helpers = [];
let ENGINE_URL = null;
async function getHelper(k) {
  if (Helpers[k - 1]) return Helpers[k - 1];
  const e = makeEngine();
  await e._try(ENGINE_URL);
  e.status = 'ready';
  Helpers[k - 1] = e;
  return e;
}
function cancelAll(kind) { Engine.cancel(kind); Helpers.forEach(h => h && h.cancel(kind)); }

// ---------- state ----------
let game = null;        // {id, headers, startFen, moves[], free}
let positions = [];     // fens
let evals = [];         // per position
let cls = [];           // per move
let ply = 0;
let variation = null;   // {base, moves:[], fens:[], idx}
let flipped = false;
let selected = null;
let analysisToken = 0;
let analyzing = false;
const liveCache = new Map();
let liveLines = null, liveDepth = 0, liveFen = null;
let pendingPromo = null;

// ---------- opening book (lichess-org/chess-openings, CC0) ----------
const fenHash = fen => {
  const s = fen.split(' ').slice(0, 4).join(' ');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
};
const BOOK = new Set(OPENINGS.book.split(','));
const OPEN_NAMES = new Map(OPENINGS.pos.split(',').map(s => { const [h, i] = s.split(':'); return [h, OPENINGS.names[parseInt(i, 36)]]; }));
const isStdStart = () => game && game.startFen.split(' ')[0] === C.START.split(' ')[0] && game.startFen.split(' ')[1] === 'w';
// Moves count as theory while every position from the start is in the book.
function applyBook() {
  if (!game || game.free || !isStdStart()) return;
  let i = 0;
  for (; i < game.moves.length; i++) {
    if (!BOOK.has(fenHash(positions[i + 1]))) break;
    if (cls[i]) cls[i] = Object.assign({}, cls[i], { type: 'book' });
  }
  // a theory move is no mistake to punish: re-rate the first move after the book without "Verpasst"
  if (i > 0 && cls[i] && cls[i].type === 'miss') cls[i] = A.classify(game, positions, evals, i, cls[i - 1]);
}
// Name of the deepest named opening position reached up to ply p.
function openingName(p = positions.length - 1) {
  if (!game || !isStdStart()) return '';
  let name = '';
  for (let i = 1; i <= p && i < positions.length; i++) {
    const n = OPEN_NAMES.get(fenHash(positions[i]));
    if (n) name = n; else if (!BOOK.has(fenHash(positions[i]))) break;
  }
  return name;
}

const gameId = g => {
  const s = g.startFen + '|' + g.moves.map(m => m.uci).join(' ');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + '_' + g.moves.length;
};

function curFen() {
  if (variation && variation.idx > 0) return variation.fens[variation.idx - 1];
  return positions[variation ? variation.base : ply];
}
function lastMove() {
  if (variation && variation.idx > 0) return variation.moves[variation.idx - 1];
  const p = variation ? variation.base : ply;
  return p > 0 ? game.moves[p - 1] : null;
}
const inGamePos = () => !variation || variation.idx === 0;
const gamePly = () => (variation ? variation.base : ply);

// ---------- storage of games ----------
let gamesCache = LS.get('sa_games', []);
function storedGames() { return gamesCache; }
function setGames(list) { gamesCache = list; if (!LS.set('sa_games', list)) LS.set('sa_games', list.map(g => ({ ...g, ev: null }))); }
function saveGame() {
  if (!game || game.free) return;
  const list = storedGames().filter(g => g.id !== game.id);
  const slim = evals.map(e => e && { t: e.terminal || 0, l: e.lines.map(l => ({ c: l.cpw, m: l.mate == null ? null : l.mate, p: l.pv.slice(0, 10), d: l.depth })) });
  const entry = { id: game.id, pgn: game.pgn, h: game.headers, date: Date.now(), depth: game.depth, ev: evals.length === positions.length && evals.every(Boolean) ? slim : null };
  list.unshift(entry);
  while (list.length > 25) list.pop();
  setGames(list);
}
function unslim(ev) {
  return ev.map(e => e && { terminal: e.t || undefined, lines: e.l.map(l => ({ cpw: l.c, mate: l.m == null ? undefined : l.m, cp: l.m == null ? l.c : undefined, pv: l.p, depth: l.d })) });
}

// ---------- load ----------
function loadGame(parsed, pgnText, cached) {
  cancelAll();
  analysisToken++;
  game = { ...parsed, pgn: pgnText };
  game.id = gameId(game);
  positions = [game.startFen, ...game.moves.map(m => m.fenAfter)];
  evals = []; cls = [];
  variation = null; selected = null;
  liveCache.clear(); liveLines = null;
  ply = 0;
  const me = guessMe(game.headers);
  flipped = me === 'b';
  if (cached && cached.ev && cached.depth) {
    evals = unslim(cached.ev); game.depth = cached.depth;
    classifyAll();
    ply = 0;
  }
  closeModals();
  const ready = !game.free && cached && cached.ev;
  showView(ready ? 'review' : 'board');
  renderAll();
  if (!game.free) { saveGame(); if (!ready) startAnalysis(); }
  else requestLive();
}
function guessMe(h) {
  const last = LS.get('sa_me', null);
  if (last && h.Black && h.Black.toLowerCase() === last) return 'b';
  return 'w';
}
function rememberMe(h) {
  // the player whose games are imported repeatedly is "me"
  const cnt = LS.get('sa_names', {});
  for (const n of [h.White, h.Black]) if (n && n !== '?') cnt[n.toLowerCase()] = (cnt[n.toLowerCase()] || 0) + 1;
  LS.set('sa_names', cnt);
  const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= 2) LS.set('sa_me', best[0]);
}

function freeBoard(fen) {
  const p = C.parseFen(fen || C.START);
  game = null;
  loadGame({ headers: { White: 'Weiß', Black: 'Schwarz' }, startFen: C.toFen(p), moves: [], free: true }, '');
}

// ---------- analysis ----------
async function startAnalysis() {
  if (!game || game.free) return;
  const token = ++analysisToken;
  const prof = STRENGTH[S.strength];
  game.depth = S.strength;
  analyzing = true; renderProgress(); showOverlay(true);
  try { await Engine.init(); } catch (e) { analyzing = false; showOverlay(false); renderProgress(); renderEngine(); return; }
  // run several Stockfish instances in parallel (one per spare CPU core)
  const nW = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
  const engines = [Engine];
  for (let k = 1; k < nW; k++) { try { engines.push(await getHelper(k)); } catch (e) { break; } }
  if (token !== analysisToken) return;
  engines.forEach(en => en.send('ucinewgame'));
  const t0 = Date.now();
  let next = 0, doneHere = 0;
  const tot = positions.length;
  const loop = async en => {
    while (token === analysisToken) {
      const i = next++;
      if (i >= tot) return;
      if (evals[i]) continue;
      const p = C.parseFen(positions[i]);
      const st = C.status(p);
      if (st === 'mate') evals[i] = { terminal: 'mate', lines: [{ cpw: p.turn === 'w' ? -100000 : 100000, mate: 0, pv: [] }] };
      else if (st === 'stalemate' || st === 'insufficient') evals[i] = { terminal: 'draw', lines: [{ cpw: 0, cp: 0, pv: [] }] };
      else {
        const r = await en.search({ fen: positions[i], depth: prof.depth, movetime: prof.ms, multipv: 2, kind: 'full' });
        if (token !== analysisToken || !r) return;
        evals[i] = { lines: r.lines };
        doneHere++;
      }
      const done = evals.filter(Boolean).length;
      updateOverlay(done, tot, doneHere ? (Date.now() - t0) / doneHere : 0);
    }
  };
  await Promise.all(engines.map(loop));
  if (token !== analysisToken) return;
  classifyAll();
  analyzing = false;
  showOverlay(false);
  saveGame();
  renderAll();
  showView('review');
}
function showOverlay(on) { $('anaov').classList.toggle('open', on); if (on) updateOverlay(evals.filter(Boolean).length, positions.length, 0); }
function updateOverlay(done, tot, msPer) {
  const pct = Math.round(done / tot * 100);
  $('anaBar').style.width = pct + '%';
  $('anaSt').textContent = Engine.status === 'loading' ? 'Stockfish 19 wird geladen …' : `Zug ${Math.min(Math.ceil(done / 2), Math.ceil((tot - 1) / 2))} von ${Math.ceil((tot - 1) / 2)} · ${pct} %`;
  const left = msPer ? Math.round((tot - done) * msPer / 1000) : null;
  $('anaEta').textContent = left == null ? '' : left > 0 ? `noch ca. ${left >= 60 ? Math.floor(left / 60) + ' min ' : ''}${left % 60} s` : 'gleich fertig …';
}
function classifyAll() {
  cls = [];
  for (let i = 0; i < game.moves.length; i++) cls[i] = A.classify(game, positions, evals, i, cls[i - 1]);
  applyBook();
}

let liveTimer = null;
function requestLive() {
  clearTimeout(liveTimer);
  Engine.cancel('live');
  const fen = curFen();
  liveFen = fen;
  liveLines = null; liveDepth = 0;
  const c = liveCache.get(fen);
  if (c) { liveLines = c.lines; liveDepth = c.depth; }
  if (inGamePos() && game && !game.free) return; // game positions: precomputed analysis only
  const p = C.parseFen(fen);
  if (C.status(p) === 'mate' || C.status(p) === 'stalemate') return;
  if (c && c.depth >= S.liveDepth && c.lines.length >= S.lines) return;
  liveTimer = setTimeout(async () => {
    try { await Engine.init(); } catch (e) { return; }
    if (liveFen !== fen) return;
    const r = await Engine.search({
      fen, depth: S.liveDepth, multipv: S.lines, kind: 'live', front: true,
      onInfo: (lines, d) => { if (liveFen === fen) { liveLines = lines; liveDepth = d; renderEngineLines(); renderEvalBar(); renderArrows(); } },
    });
    if (r && r.lines.length) { liveCache.set(fen, { lines: r.lines, depth: S.liveDepth }); if (liveFen === fen) { liveLines = r.lines; liveDepth = S.liveDepth; renderEngineLines(); renderEvalBar(); renderArrows(); } }
  }, 180);
}

// best known lines for current view position
function currentLines() {
  const stored = inGamePos() && game && !game.free ? evals[gamePly()] : null;
  if (stored) return { lines: stored.lines, depth: stored.lines[0] && stored.lines[0].depth, terminal: stored.terminal };
  if (liveLines) return { lines: liveLines, depth: liveDepth, live: true };
  return null;
}

// ---------- formatting ----------
function fmtScore(L, terminal) {
  if (terminal === 'mate') return L.cpw > 0 ? '1-0' : '0-1';
  if (terminal === 'draw') return '½-½';
  if (L.mate != null && L.mate !== 0) return (L.mate > 0 ? '' : '-') + 'M' + Math.abs(L.mate);
  const v = (L.cpw || 0) / 100;
  return (v > 0 ? '+' : '') + v.toFixed(Math.abs(v) >= 10 ? 0 : 2);
}
function pvToSan(fen, pv, max = 12) {
  let p = C.parseFen(fen);
  const out = [];
  for (const u of pv.slice(0, max)) {
    const m = C.findMove(p, u);
    if (!m) break;
    const s = C.san(p, m);
    const num = p.turn === 'w' ? p.full + '. ' : (out.length === 0 ? p.full + '… ' : '');
    out.push(num + s);
    p = C.make(p, m);
  }
  return out;
}
function badge(type, extra = '') {
  const c = A.CLASSES[type];
  if (!c) return '';
  return `<span class="badge ${extra}" style="background:${c.color}" title="${c.label}">${c.sym}</span>`;
}

// ---------- rendering ----------
const boardEl = $('board');
function renderBoard() {
  const fen = curFen();
  const p = C.parseFen(fen);
  const [light, dark] = THEMES[S.theme] || THEMES.green;
  const lm = lastMove();
  const lmCls = inGamePos() && gamePly() > 0 && game && !game.free ? cls[gamePly() - 1] : null;
  const lmColor = lmCls && S.badges ? hexA(A.CLASSES[lmCls.type].color, 0.5) : 'rgba(255,255,51,.5)';
  const targets = selected != null ? C.legal(p).filter(m => m.from === selected) : [];
  const kingInCheck = C.inCheck(p) ? p.b.indexOf(p.turn === 'w' ? 'K' : 'k') : -1;
  let h = '';
  for (let vi = 0; vi < 64; vi++) {
    const s = flipped ? 63 - vi : vi;
    const r = s >> 3, f = s & 7;
    const isLight = (r + f) % 2 === 0;
    let inner = '';
    if (lm && (s === lm.from || s === lm.to)) inner += `<div class="hl" style="background:${lmColor}"></div>`;
    if (s === selected) inner += `<div class="hl" style="background:rgba(255,255,51,.5)"></div>`;
    if (s === kingInCheck) inner += `<div class="hl" style="background:radial-gradient(circle, rgba(255,0,0,.85) 0%, rgba(231,0,0,.5) 35%, rgba(169,0,0,0) 75%)"></div>`;
    if (S.coords) {
      const col = isLight ? dark : light;
      if (vi % 8 === 0) inner += `<span class="co r" style="color:${col}">${8 - r}</span>`;
      if (vi >= 56) inner += `<span class="co f" style="color:${col}">${'abcdefgh'[f]}</span>`;
    }
    if (p.b[s]) inner += `<div class="pc" style="background-image:url('${PIECE_SVG[p.b[s]]}')"></div>`;
    const tg = targets.find(m => m.to === s);
    if (tg) inner += tg.captured ? '<div class="ring"></div>' : '<div class="dot"></div>';
    if (S.badges && lmCls && lm && s === lm.to) inner += badge(lmCls.type);
    h += `<div class="sq" data-s="${s}" style="background:${isLight ? light : dark}">${inner}</div>`;
  }
  boardEl.innerHTML = h;
  runAnim();
  renderArrows();
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function sqXY(s) {
  let x = (s & 7) + 0.5, y = (s >> 3) + 0.5;
  if (flipped) { x = 8 - x; y = 8 - y; }
  return [x, y];
}
function arrowSvg(from, to, color) {
  const [x1, y1] = sqXY(from), [x2, y2] = sqXY(to);
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const head = 0.42, w = 0.15;
  const bx = x2 - ux * head, by = y2 - uy * head;
  const sx = x1 + ux * 0.25, sy = y1 + uy * 0.25;
  const px = -uy, py = ux;
  const pts = [
    [sx + px * w / 2, sy + py * w / 2], [bx + px * w / 2, by + py * w / 2], [bx + px * 0.24, by + py * 0.24],
    [x2 - ux * 0.08, y2 - uy * 0.08], [bx - px * 0.24, by - py * 0.24], [bx - px * w / 2, by - py * w / 2], [sx - px * w / 2, sy - py * w / 2],
  ];
  return `<polygon points="${pts.map(p => p.map(n => n.toFixed(3)).join(',')).join(' ')}" fill="${color}"/>`;
}
function renderArrows() {
  const svg = $('arrows');
  let h = '';
  if (S.arrow && game) {
    const cl = currentLines();
    const u = cl && cl.lines[0] && cl.lines[0].pv[0];
    if (u) h += arrowSvg(C.sqIdx(u.slice(0, 2)), C.sqIdx(u.slice(2, 4)), 'rgba(129,182,76,.82)');
  }
  svg.innerHTML = h;
}
function renderEvalBar() {
  const bar = $('evalbar');
  bar.style.display = S.evalbar ? '' : 'none';
  const cl = currentLines();
  let w = 50, txt = '';
  if (cl && cl.lines[0]) { w = A.winPct(cl.lines[0].cpw); txt = fmtScore(cl.lines[0], cl.terminal).replace('+', ''); }
  // bar shows white from bottom (or top if flipped)
  const fill = $('evalfill');
  fill.style.height = w + '%';
  fill.style.bottom = flipped ? 'auto' : '0'; fill.style.top = flipped ? '0' : 'auto';
  bar.style.background = '#403d39';
  const whiteAhead = cl && cl.lines[0] ? cl.lines[0].cpw >= 0 : true;
  const top = $('evtop'), bot = $('evbot');
  top.textContent = ''; bot.textContent = '';
  const whiteEndIsTop = flipped;
  const lblAtTop = whiteAhead ? whiteEndIsTop : !whiteEndIsTop;
  const el = lblAtTop ? top : bot;
  el.textContent = cl ? txt.replace('-', '') : '';
  el.style.color = whiteAhead ? '#403d39' : '#fff';
}
function renderPlayers() {
  if (!game) { $('pTop').innerHTML = ''; $('pBot').innerHTML = ''; return; }
  const h = game.headers;
  const p = gamePly();
  const clockOf = color => {
    let c = '';
    for (let i = 0; i < p; i++) {
      const mover = C.parseFen(positions[i]).turn;
      if (mover === color && game.moves[i].clock) c = game.moves[i].clock;
    }
    return c ? c.replace(/^0:/, '').replace(/\.\d+$/, '') : '';
  };
  const row = color => {
    const name = color === 'w' ? h.White : h.Black, elo = color === 'w' ? h.WhiteElo : h.BlackElo;
    const ck = clockOf(color);
    return `<span class="av ${color}">${color === 'w' ? '♔' : '♚'}</span><span>${esc(name || (color === 'w' ? 'Weiß' : 'Schwarz'))}</span>${elo && elo !== '?' ? `<span class="elo">(${esc(elo)})</span>` : ''}${ck ? `<span class="clk">${esc(ck)}</span>` : ''}`;
  };
  $('pTop').innerHTML = row(flipped ? 'w' : 'b');
  $('pBot').innerHTML = row(flipped ? 'b' : 'w');
}
function renderEngine() {
  const meta = $('engMeta');
  if (!meta) return;
  if (Engine.status === 'loading') meta.innerHTML = '<span>Stockfish wird geladen …</span>';
  else if (Engine.status === 'failed') meta.innerHTML = '<span style="color:#ff9b8f">Stockfish 19 konnte nicht gestartet werden. Lade die Seite neu – klappt es dann immer noch nicht, läuft Stockfish 19 hier leider nicht.</span>';
  renderEngineLines();
}
function renderEngineLines() {
  const el = $('lines');
  el.style.minHeight = (game ? Math.max(S.lines, 1) * 32 : 0) + 'px';
  if (!game) { el.innerHTML = ''; return; }
  const cl = currentLines();
  const fen = curFen();
  if (Engine.status !== 'failed') {
    $('engMeta').innerHTML = cl ? `<span>Stockfish 19 Lite · Tiefe ${cl.depth || '–'}</span><span>${cl.live && liveDepth < S.liveDepth && Engine.current ? 'rechnet …' : ''}</span>` : `<span>${Engine.status === 'loading' ? 'Stockfish 19 wird geladen …' : 'Rechnet …'}</span>`;
  }
  if (!cl) { el.innerHTML = ''; return; }
  if (cl.terminal) { el.innerHTML = `<div class="line"><span class="sc ${cl.lines[0].cpw < 0 ? 'neg' : ''}">${fmtScore(cl.lines[0], cl.terminal)}</span><span class="pv">${cl.terminal === 'mate' ? 'Schachmatt' : 'Remis'}</span></div>`; return; }
  el.innerHTML = cl.lines.slice(0, Math.max(S.lines, 1)).map((L, k) => {
    const sans = pvToSan(fen, L.pv, 10);
    return `<div class="line"><span class="sc ${L.cpw < 0 ? 'neg' : ''}">${fmtScore(L)}</span><span class="pv" data-line="${k}"><b>${esc(sans[0] || '')}</b> ${esc(sans.slice(1).join(' '))}</span></div>`;
  }).join('');
}
function renderFeedback() {
  const card = $('fbCard');
  const p = gamePly();
  if (!game || game.free || !inGamePos() || p === 0) {
    if (game && !game.free && p === 0 && inGamePos()) {
      card.style.display = '';
      const h = game.headers;
      card.innerHTML = `<div class="fb"><div><div class="t">${esc(h.White || 'Weiß')} – ${esc(h.Black || 'Schwarz')}</div><div class="s">${esc([h.Event, h.Date && h.Date.replace(/\./g, '.'), h.Result].filter(x => x && x !== '?' && x !== '????.??.??').join(' · '))}${h.Termination ? '<br>' + esc(h.Termination) : ''}${openingName() ? '<br>Eröffnung: ' + esc(openingName()) : ''}</div></div></div>`;
    } else card.style.display = 'none';
    return;
  }
  card.style.display = '';
  const m = game.moves[p - 1], c = cls[p - 1];
  const num = Math.floor((p - 1) / 2) + 1, white = C.parseFen(positions[p - 1]).turn === 'w';
  const label = `${num}${white ? '.' : '…'} ${m.san}`;
  if (!c) { card.innerHTML = `<div class="fb"><div><div class="t">${esc(label)}</div><div class="s">${analyzing ? 'Wird analysiert …' : ''}</div></div></div>`; return; }
  const info = A.CLASSES[c.type];
  const e1 = evals[p];
  const sc = e1 ? fmtScore(e1.lines[0], e1.terminal) : '';
  let sub = '';
  let showBest = false;
  if (c.type === 'book') sub = esc(openingName(p) || 'Bekannte Eröffnungstheorie');
  else if (!c.isBest && c.bestUci && c.type !== 'forced') {
    const bs = pvToSan(positions[p - 1], [c.bestUci], 1)[0] || '';
    sub = `Bester Zug war <b style="color:#fff">${esc(bs.replace(/^\d+\.(…)? ?/, ''))}</b>`;
    showBest = true;
  } else if (c.type === 'brilliant') sub = 'Starkes Opfer!';
  else if (c.type === 'great') sub = 'Der einzige gute Zug in dieser Stellung.';
  card.innerHTML = `<div class="fb">${badge(c.type)}<div style="min-width:0"><div class="t" style="color:${info.color}">${esc(m.san)} ${info.phrase}</div><div class="s">${sub}</div>${showBest ? '<button class="linkbtn" id="bShowBest">Besten Zug ansehen →</button>' : ''}</div>${sc ? `<span class="ev ${e1.lines[0].cpw < 0 ? 'neg' : ''}">${sc}</span>` : ''}</div>`;
  const b = $('bShowBest');
  if (b) b.onclick = () => {
    const ev0 = evals[p - 1];
    const pv = (ev0 && ev0.lines[0] && ev0.lines[0].pv) || [c.bestUci];
    ply = p - 1; variation = null;
    playLine(pv.slice(0, 8));
  };
}
function playLine(pv) {
  let fen = curFen();
  const base = gamePly();
  const v = { base, moves: [], fens: [], idx: 0 };
  for (const u of pv) {
    const p = C.parseFen(fen);
    const m = C.findMove(p, u);
    if (!m) break;
    v.moves.push({ from: m.from, to: m.to, san: C.san(p, m), uci: C.uci(m) });
    fen = C.toFen(C.make(p, m));
    v.fens.push(fen);
  }
  if (!v.moves.length) return;
  v.idx = 1;
  variation = v; selected = null;
  animMove(v.moves[0]); Sound.forMove(v.moves[0], v.fens[0]);
  renderBoardAndInfo();
}
function renderSummary() {
  const card = $('sumCard');
  if (!game || game.free || !cls.some(Boolean)) { card.style.display = 'none'; return; }
  card.style.display = '';
  const wl = [], bl = [];
  cls.forEach((c, i) => { if (c) (C.parseFen(positions[i]).turn === 'w' ? wl : bl).push(c); });
  const aw = A.accuracy(wl), ab = A.accuracy(bl);
  const h = game.headers;
  const rows = A.ORDER.map(t => {
    const cw = wl.filter(c => c.type === t).length, cb = bl.filter(c => c.type === t).length;
    const col = A.CLASSES[t].color;
    return `<tr><td class="c" style="color:${cw ? col : '#666'}">${cw}</td><td class="l">${badge(t)}${A.CLASSES[t].label}</td><td class="c" style="color:${cb ? col : '#666'}">${cb}</td></tr>`;
  }).join('');
  const opn = openingName();
  card.innerHTML = `<h3>Partie-Review${analyzing ? ' (läuft …)' : ''}</h3>${opn ? `<div class="meta" style="margin:-2px 0 8px"><span>${esc(opn)}</span></div>` : ''}
    <div class="acc"><div class="w"><div class="k">${esc(h.White || 'Weiß')}</div><div class="n">${aw == null ? '–' : aw.toFixed(1)}</div><div class="k">Genauigkeit</div></div>
    <div><div class="k">${esc(h.Black || 'Schwarz')}</div><div class="n" style="color:#bbb">${ab == null ? '–' : ab.toFixed(1)}</div><div class="k">Genauigkeit</div></div></div>
    <table class="ctab">${rows}</table>`;
}
function graphSvg(W, H, marker) {
  const n = positions.length - 1 || 1;
  const pts = [];
  for (let i = 0; i < positions.length; i++) {
    const e = evals[i];
    if (!e) break;
    pts.push([i / n * W, H - A.winPct(e.lines[0].cpw) / 100 * H]);
  }
  let h = `<rect width="${W}" height="${H}" fill="#403d39"/>`;
  if (pts.length) h += `<path d="M0,${H} ${pts.map(p => 'L' + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')} L${pts[pts.length - 1][0].toFixed(1)},${H} Z" fill="#fff"/>`;
  h += `<line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#888" stroke-width=".6" stroke-dasharray="3 3"/>`;
  cls.forEach((c, i) => {
    if (!c || !['brilliant', 'great', 'mistake', 'miss', 'blunder'].includes(c.type) || !pts[i + 1]) return;
    h += `<circle cx="${pts[i + 1][0]}" cy="${pts[i + 1][1]}" r="3.6" fill="${A.CLASSES[c.type].color}" stroke="#222" stroke-width=".8"/>`;
  });
  if (marker) { const cx = gamePly() / n * W; h += `<line x1="${cx}" y1="0" x2="${cx}" y2="${H}" stroke="#81b64c" stroke-width="2"/>`; }
  return h;
}
function renderGraph() {
  const card = $('graphCard');
  if (!game || game.free || !evals.some(Boolean)) { card.style.display = 'none'; return; }
  card.style.display = '';
  const svg = $('graph');
  svg.setAttribute('viewBox', '0 0 400 90');
  svg.innerHTML = graphSvg(400, 90, true);
}
function movesGridHtml(curPly) {
  const startBlack = C.parseFen(game.startFen).turn === 'b';
  let h = '';
  const cell = i => {
    const m = game.moves[i], c = cls[i];
    return `<div class="mv ${curPly === i + 1 ? 'cur' : ''}" data-ply="${i + 1}">${c && !game.free ? badge(c.type) : ''}${esc(m.san)}</div>`;
  };
  let i = 0, num = C.parseFen(game.startFen).full;
  if (startBlack) { h += `<div class="no">${num}.</div><div class="mv">…</div>${cell(0)}`; i = 1; num++; }
  for (; i < game.moves.length; i += 2, num++) {
    h += `<div class="no">${num}.</div>${cell(i)}${i + 1 < game.moves.length ? cell(i + 1) : '<div></div>'}`;
  }
  return h;
}
function renderMoves() {
  const card = $('movesCard');
  if (!game || !game.moves.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  const h = movesGridHtml(inGamePos() ? gamePly() : -1);
  const el = $('moves');
  el.innerHTML = h;
  const cur = el.querySelector('.mv.cur');
  if (cur) {
    const top = cur.offsetTop - el.offsetTop;
    if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - 30) el.scrollTop = top - el.clientHeight / 2;
  }
}
function renderVarbar() {
  const vb = $('varbar');
  if (!variation) { vb.style.display = 'none'; return; }
  vb.style.display = '';
  const p0 = C.parseFen(positions[variation.base]);
  let num = p0.full, white = p0.turn === 'w';
  const parts = variation.moves.map((m, k) => {
    let s = '';
    if (white) s = num + '. ';
    else if (k === 0) s = num + '… ';
    s += k === variation.idx - 1 ? `<b style="color:#fff">${esc(m.san)}</b>` : esc(m.san);
    if (!white) num++;
    white = !white;
    return s;
  });
  $('vartext').innerHTML = 'Variante: ' + parts.join(' ');
}
function renderProgress() {
  const w = $('progressWrap');
  w.style.display = 'none';
  if (!analyzing || !game) return;
  const done = evals.filter(Boolean).length, tot = positions.length;
  const pct = Math.round(done / tot * 100);
  $('progBar').style.width = pct + '%';
  $('progPct').textContent = pct + '%';
  $('progText').textContent = Engine.status === 'loading' ? 'Stockfish 19 wird geladen …' : `Analysiere Zug ${Math.ceil(done / 2)} von ${Math.ceil((tot - 1) / 2)}`;
  renderSummary(); renderGraph();
}
function renderEmpty() {
  if (game) return;
  $('lines').innerHTML = '';
}
function renderBoardAndInfo() {
  renderBoard(); renderEvalBar(); renderPlayers(); renderFeedback(); renderVarbar();
  requestLive();
  renderEngineLines(); renderGraph();
  renderMoves();
}
function renderAll() {
  if (!game) { freeBoardRender(); return; }
  renderBoardAndInfo(); renderSummary(); renderProgress();
}
function freeBoardRender() { renderEmpty(); }

// ---------- interaction ----------
function goto(p, fx = true) {
  if (!game) return;
  const target = Math.max(0, Math.min(positions.length - 1, p));
  if (fx && !variation) {
    if (target === ply + 1) { animMove(game.moves[ply]); Sound.forMove(game.moves[ply], positions[target]); }
    else if (target === ply - 1) { animMove(game.moves[target], true); Sound.play('move'); }
  }
  variation = null; selected = null;
  ply = target;
  renderBoardAndInfo();
}
function next() {
  if (variation) {
    if (variation.idx < variation.moves.length) {
      const m = variation.moves[variation.idx];
      animMove(m); Sound.forMove(m, variation.fens[variation.idx]);
      variation.idx++; selected = null; renderBoardAndInfo();
    }
    return;
  }
  goto(ply + 1);
}
function prev() {
  if (variation) {
    if (variation.idx > 0) { animMove(variation.moves[variation.idx - 1], true); Sound.play('move'); variation.idx--; }
    if (variation.idx === 0) { ply = variation.base; variation = null; }
    selected = null; renderBoardAndInfo(); return;
  }
  goto(ply - 1);
}
function doMove(m) {
  const fen = curFen();
  const p = C.parseFen(fen);
  const u = C.uci(m);
  selected = null;
  const sanNow = C.san(p, m);
  animMove({ from: m.from, to: m.to, san: sanNow });
  Sound.forMove({ san: sanNow }, C.toFen(C.make(p, m)));
  if (game.free && !variation) {
    // free board: the line itself is the "game"
    const s = C.san(p, m);
    game.moves = game.moves.slice(0, ply);
    const np = C.make(p, m);
    game.moves.push({ san: s, uci: u, from: m.from, to: m.to, piece: m.piece, captured: m.captured, promo: m.promo || null, fenBefore: fen, fenAfter: C.toFen(np) });
    positions = [game.startFen, ...game.moves.map(x => x.fenAfter)];
    ply++;
    renderBoardAndInfo(); return;
  }
  if (!variation && ply < game.moves.length && game.moves[ply].uci === u) { goto(ply + 1, false); return; }
  if (variation && variation.idx < variation.moves.length && variation.moves[variation.idx].uci === u) { variation.idx++; renderBoardAndInfo(); return; }
  const nf = C.toFen(C.make(p, m));
  const mv = { from: m.from, to: m.to, san: C.san(p, m), uci: u };
  if (!variation) variation = { base: ply, moves: [mv], fens: [nf], idx: 1 };
  else {
    variation.moves = variation.moves.slice(0, variation.idx); variation.fens = variation.fens.slice(0, variation.idx);
    variation.moves.push(mv); variation.fens.push(nf); variation.idx++;
  }
  renderBoardAndInfo();
}
boardEl.addEventListener('click', e => {
  const sqEl = e.target.closest('.sq');
  if (!sqEl || !game) return;
  const s = +sqEl.dataset.s;
  const p = C.parseFen(curFen());
  const piece = p.b[s];
  if (selected != null) {
    const ms = C.legal(p).filter(m => m.from === selected && m.to === s);
    if (ms.length) {
      if (ms.length > 1) { askPromo(ms); return; }
      doMove(ms[0]); return;
    }
  }
  if (piece && C.colorOf(piece) === p.turn && s !== selected) selected = s;
  else selected = null;
  renderBoard();
});
function askPromo(ms) {
  pendingPromo = ms;
  const color = C.colorOf(ms[0].piece);
  $('promoChoices').innerHTML = ['q', 'r', 'b', 'n'].map(t => {
    const k = color === 'w' ? t.toUpperCase() : t;
    return `<button data-pr="${t}" style="background-image:url('${PIECE_SVG[k]}')"></button>`;
  }).join('');
  $('promo').classList.add('open');
}
$('promo').addEventListener('click', e => {
  const b = e.target.closest('button');
  $('promo').classList.remove('open');
  if (b && pendingPromo) { const m = pendingPromo.find(x => x.promo === b.dataset.pr); if (m) doMove(m); }
  pendingPromo = null;
});
$('lines').addEventListener('click', e => {
  const pv = e.target.closest('.pv');
  if (!pv || pv.dataset.line == null) return;
  const cl = currentLines();
  const L = cl && cl.lines[+pv.dataset.line];
  if (!L) return;
  if (variation) {
    // extend from the current variation position
    let fen = curFen();
    variation.moves = variation.moves.slice(0, variation.idx); variation.fens = variation.fens.slice(0, variation.idx);
    for (const u of L.pv.slice(0, 8)) {
      const p = C.parseFen(fen), m = C.findMove(p, u);
      if (!m) break;
      variation.moves.push({ from: m.from, to: m.to, san: C.san(p, m), uci: C.uci(m) });
      fen = C.toFen(C.make(p, m)); variation.fens.push(fen);
    }
    variation.idx++;
    renderBoardAndInfo();
  } else playLine(L.pv.slice(0, 8));
});
$('moves').addEventListener('click', e => { const m = e.target.closest('.mv[data-ply]'); if (m) goto(+m.dataset.ply); });
$('graph').addEventListener('click', e => {
  const r = e.currentTarget.getBoundingClientRect();
  goto(Math.round((e.clientX - r.left) / r.width * (positions.length - 1)));
});
$('bFirst').onclick = () => goto(0);
$('bPrev').onclick = prev;
$('bNext').onclick = next;
$('bLast').onclick = () => goto(positions.length - 1);
$('bFlip').onclick = () => { flipped = !flipped; renderBoardAndInfo(); };
$('bExitVar').onclick = () => { if (variation) goto(variation.base); };
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft') prev(); else if (e.key === 'ArrowRight') next();
  else if (e.key === 'ArrowUp') goto(0); else if (e.key === 'ArrowDown') goto(positions.length - 1);
  else if (e.key === 'f') $('bFlip').click();
});
// swipe left/right on the board to step through moves
(() => {
  let sx = null, sy = null;
  const bw = $('boardwrap');
  bw.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  bw.addEventListener('touchend', e => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > 2 * Math.abs(dy)) { dx < 0 ? next() : prev(); }
    sx = null;
  }, { passive: true });
})();

// ---------- modals ----------
function openModal(id) { $(id).classList.add('open'); }
function closeModals() { document.querySelectorAll('.modal').forEach(m => m.classList.remove('open')); }
document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) closeModals(); }));
function openPgnModal() { $('impErr').style.display = 'none'; $('multiPick').innerHTML = ''; openModal('mImport'); }
$('btnSettings').onclick = () => { renderSettings(); openModal('mSettings'); };

function showErr(msg) { const e = $('impErr'); e.textContent = msg; e.style.display = 'block'; }
function importText(text) {
  text = (text || '').trim();
  if (!text) { showErr('Bitte zuerst ein PGN einfügen.'); return; }
  if (/^([rnbqkpRNBQKP1-8]+\/){7}[rnbqkpRNBQKP1-8]+(\s+[wb])/.test(text)) {
    try { freeBoard(text); } catch (e) { showErr('FEN ungültig: ' + e.message); }
    return;
  }
  const games = C.splitPgn(text);
  if (games.length > 1) { pickGame(games); return; }
  importOne(games[0] || text);
}
function importOne(pgn) {
  try {
    const g = C.parsePgn(pgn);
    if (!g.moves.length) { showErr('In diesem PGN wurden keine Züge gefunden.'); return; }
    rememberMe(g.headers);
    const id = gameId(g);
    const cached = storedGames().find(x => x.id === id);
    loadGame(g, pgn, cached);
  } catch (e) { showErr('PGN konnte nicht gelesen werden: ' + e.message); }
}
function pickGame(games) {
  const items = games.map((t, k) => {
    const h = {}; t.replace(/\[(\w+)\s+"([^"]*)"\]/g, (_, a, b) => { h[a] = b; });
    return `<div class="g" data-k="${k}"><div class="nm">${esc(h.White || '?')} – ${esc(h.Black || '?')} <span class="sub">${esc(h.Result || '')}</span><div class="sub">${esc(h.Date || '')} ${esc(h.TimeControl ? '· ' + h.TimeControl : '')}</div></div><span>›</span></div>`;
  }).join('');
  $('multiPick').innerHTML = `<div class="hint" style="margin-top:14px">${games.length} Partien gefunden – wähle eine:</div><div class="glist">${items}</div>`;
  $('multiPick').onclick = e => { const g = e.target.closest('.g'); if (g) importOne(games[+g.dataset.k]); };
}
$('bAnalyze').onclick = () => importText($('pgnIn').value);

// ---------- import from chess.com / Lichess (external build only) ----------
const TC = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Schnellschach', classical: 'Klassisch', daily: 'Täglich', correspondence: 'Fernschach', ultraBullet: 'UltraBullet' };
const CC_DRAW = ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'];
let accGames = [];
async function getJson(url, opts) {
  const r = await fetch(url, opts);
  if (r.status === 404) throw new Error('Benutzer nicht gefunden');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
const errText = (src, e) => src + ': ' + (e.name === 'TypeError' ? 'keine Verbindung oder vom Browser blockiert' : e.message);
// Paging state per account: chess.com walks its monthly archives backwards, Lichess pages with `until`.
let accState = null;
async function loadChesscom(user, st) {
  const u = user.toLowerCase();
  if (!st.archives) {
    const arch = await getJson(`https://api.chess.com/pub/player/${encodeURIComponent(u)}/games/archives`);
    st.archives = arch.archives || []; st.idx = st.archives.length - 1;
  }
  const out = [];
  while (st.idx >= 0 && out.length < 20) {
    const d = await getJson(st.archives[st.idx--]);
    for (const g of (d.games || [])) {
      if (!g.pgn || (g.rules && g.rules !== 'chess')) continue;
      const white = (g.white.username || '').toLowerCase() === u;
      const me = white ? g.white : g.black, op = white ? g.black : g.white;
      out.push({ src: 'chess.com', pgn: g.pgn, t: (g.end_time || 0) * 1000, white, me: me.username, op: op.username, opElo: op.rating,
        res: me.result === 'win' ? 'w' : CC_DRAW.includes(me.result) ? 'd' : 'l', tc: g.time_class });
    }
  }
  st.done = st.idx < 0;
  return out;
}
async function loadLichess(user, st) {
  const u = user.toLowerCase(), max = 30;
  const r = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${max}&pgnInJson=true&clocks=true${st.until ? '&until=' + st.until : ''}`, { headers: { Accept: 'application/x-ndjson' } });
  if (r.status === 404) throw new Error('Benutzer nicht gefunden');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const lines = (await r.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));
  if (lines.length) st.until = Math.min(...lines.map(g => g.createdAt)) - 1;
  st.done = lines.length < max;
  return lines.filter(g => g.pgn && g.variant === 'standard' && g.status !== 'aborted' && g.status !== 'noStart').map(g => {
    const wName = (g.players.white.user && g.players.white.user.name) || 'Anonym', bName = (g.players.black.user && g.players.black.user.name) || 'Anonym';
    const white = wName.toLowerCase() === u;
    const color = white ? 'white' : 'black';
    return { src: 'Lichess', pgn: g.pgn, t: g.lastMoveAt || g.createdAt, white, me: white ? wName : bName, op: white ? bName : wName,
      opElo: (white ? g.players.black : g.players.white).rating, res: !g.winner ? 'd' : g.winner === color ? 'w' : 'l', tc: g.speed };
  });
}
// Identify a game by its headers (cheap, no move parsing) to mark already analysed games.
function pgnHeaders(pgn) { const h = {}; pgn.replace(/\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/g, (_, k, v) => { h[k] = v; return ''; }); return h; }
function headerKey(h) {
  if (h.Link) return h.Link;
  if (h.Site && /lichess\.org\/\w{8}/.test(h.Site)) return h.Site.slice(0, 28);
  return [h.White, h.Black, h.UTCDate || h.Date, h.UTCTime || h.StartTime || ''].join('|');
}
function analysedKeys() { return new Set(storedGames().filter(g => g.ev && g.h).map(g => headerKey(g.h))); }
// more=false: fresh first page; more=true: next (older) page. Returns error text or ''.
async function fetchAccountGames(more) {
  if (!more || !accState) accState = { cc: S.ccUser ? {} : null, li: S.liUser ? {} : null };
  const jobs = [];
  if (accState.cc && !accState.cc.done) jobs.push(loadChesscom(S.ccUser, accState.cc).catch(e => { accState.cc.done = true; throw new Error(errText('chess.com', e)); }));
  if (accState.li && !accState.li.done) jobs.push(loadLichess(S.liUser, accState.li).catch(e => { accState.li.done = true; throw new Error(errText('Lichess', e)); }));
  const res = await Promise.allSettled(jobs);
  const fresh = res.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
  accGames = (more ? accGames.concat(fresh) : fresh).sort((x, y) => y.t - x.t);
  if (!more) LS.set('sa_accgames', accGames.slice(0, 40));
  return res.filter(r => r.status === 'rejected').map(r => r.reason.message).join(' · ');
}
let lastFetch = 0, fetching = false;
async function loadAccountGames(more = false, fromInputs = false) {
  if (fromInputs) {
    S.ccUser = $('ccUser').value.trim(); S.liUser = $('liUser').value.trim(); saveSettings();
    if (S.ccUser || S.liUser) $('accCard').style.display = 'none';
    renderAccInfo();
  }
  const err = $('accErr'); err.style.display = 'none';
  if (!S.ccUser && !S.liUser) { if (fromInputs) { err.textContent = 'Gib mindestens einen Benutzernamen ein.'; err.style.display = 'block'; } return; }
  if (fetching) return;
  fetching = true; lastFetch = Date.now();
  $('bRefresh').classList.add('spinning');
  if (!more && !accGames.length) $('accList').innerHTML = '<div class="hint">Lade Partien …</div>';
  else { const b = $('bMoreGames'); if (b) { b.disabled = true; b.textContent = 'Lade …'; } }
  const msg = await fetchAccountGames(more);
  fetching = false;
  $('bRefresh').classList.remove('spinning');
  if (msg) { err.textContent = msg; err.style.display = 'block'; }
  renderAccList();
}
function timeAgo(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'gerade eben';
  const m = Math.floor(s / 60); if (m < 60) return `vor ${m} Min.`;
  const h = Math.floor(m / 60); if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24); if (d === 1) return 'gestern'; if (d < 7) return `vor ${d} Tagen`;
  const w = Math.floor(d / 7); if (d < 30) return w === 1 ? 'vor 1 Woche' : `vor ${w} Wochen`;
  const mo = Math.floor(d / 30); if (d < 365) return mo === 1 ? 'vor 1 Monat' : `vor ${mo} Monaten`;
  const y = Math.floor(d / 365); return y === 1 ? 'vor 1 Jahr' : `vor ${y} Jahren`;
}
function renderAccInfo() {
  const parts = [];
  if (S.ccUser) parts.push('chess.com: <b>' + esc(S.ccUser) + '</b>');
  if (S.liUser) parts.push('Lichess: <b>' + esc(S.liUser) + '</b>');
  $('accInfo').innerHTML = parts.length ? parts.join(' · ') + ' · <button id="bEditAcc">ändern</button>' : '';
  if (!parts.length) { $('accCard').style.display = ''; }
}
function renderAccList() {
  const el = $('accList');
  if (!accGames.length) {
    el.innerHTML = (S.ccUser || S.liUser) && !fetching ? '<div class="hint">Keine Partien gefunden.</div>' : '';
    return;
  }
  const done = analysedKeys();
  const canMore = accState && ((accState.cc && !accState.cc.done) || (accState.li && !accState.li.done));
  el.innerHTML = accGames.map((g, k) => `<div class="g" data-acc="${k}"><span class="res ${g.res}">${g.res === 'w' ? 'S' : g.res === 'l' ? 'N' : '½'}</span><div class="nm"><div class="top"><span>${g.white ? '♔' : '♚'} gegen ${esc(g.op)} ${g.opElo ? `<span class="sub">(${esc(g.opElo)})</span>` : ''}</span><span class="ago">${timeAgo(g.t)}</span></div><div class="sub"><span class="srcchip ${g.src === 'Lichess' ? 'li' : 'cc'}">${esc(g.src)}</span>${esc(TC[g.tc] || g.tc || '')}${done.has(headerKey(pgnHeaders(g.pgn))) ? ' · <span style="color:#81b64c">✓ analysiert</span>' : ''}</div></div><span>›</span></div>`).join('') +
    (canMore ? '<button class="iconbtn" id="bMoreGames" style="width:100%;margin-top:8px">Ältere Partien laden</button>' : '');
}
function openAccGame(g) {
  LS.set('sa_me', g.me.toLowerCase());
  importOne(g.pgn);
}
$('accList').onclick = e => {
  if (e.target.closest('#bMoreGames')) { loadAccountGames(true); return; }
  const it = e.target.closest('[data-acc]');
  if (!it) return;
  const g = accGames[+it.dataset.acc];
  if (g) openAccGame(g);
};
$('bLoadGames').onclick = () => loadAccountGames(false, true);
$('bRefresh').onclick = () => loadAccountGames(false);
$('accInfo').onclick = e => {
  if (!e.target.closest('#bEditAcc')) return;
  $('ccUser').value = S.ccUser || ''; $('liUser').value = S.liUser || '';
  const c = $('accCard'); c.style.display = c.style.display === 'none' ? '' : 'none';
};
$('bHomePgn').onclick = openPgnModal;
$('bHomeSaved').onclick = () => { renderGameList(); openModal('mSaved'); };
$('bHomeFree').onclick = () => freeBoard();
$('btnHome').onclick = () => showView('home');
{
  $('bPaste').onclick = async () => {
    try { const t = await navigator.clipboard.readText(); if (t) { $('pgnIn').value = t; importText(t); } }
    catch (e) { showErr('Einfügen wurde nicht erlaubt – tippe lange ins Textfeld und wähle „Einsetzen“.'); }
  };
  accGames = LS.get('sa_accgames', []);
}

// ---------- backup / restore (Einstellungen → Erweitert) ----------
function showAdv(msg) { $('advMsg').textContent = msg; }
$('bBackup').onclick = async () => {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('sa_')) data[k] = localStorage.getItem(k); }
  const json = JSON.stringify({ app: 'schach-analyse', format: 1, created: new Date().toISOString(), data });
  const name = `schach-analyse-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Schach-Analyse Sicherung' });
      showAdv('Sicherung erstellt. Lege die Datei z. B. in „Dateien“ oder iCloud ab.');
      return;
    }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  showAdv('Sicherung heruntergeladen: ' + name);
};
$('restoreIn').onchange = e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    let b;
    try { b = JSON.parse(r.result); } catch (err) { showAdv('Diese Datei ist keine gültige Sicherung.'); return; }
    if (!b || b.app !== 'schach-analyse' || !b.data || typeof b.data !== 'object') { showAdv('Diese Datei ist keine Sicherung der Schach-Analyse.'); return; }
    const keys = Object.keys(b.data).filter(k => k.startsWith('sa_') && typeof b.data[k] === 'string');
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('sa_')) localStorage.removeItem(k); }
      keys.forEach(k => localStorage.setItem(k, b.data[k]));
    } catch (err) { showAdv('Wiederherstellen fehlgeschlagen: ' + err.message); return; }
    showAdv('Wiederhergestellt – die App lädt neu …');
    setTimeout(() => location.reload(), 800);
  };
  r.readAsText(f);
};

// ---------- update notice ----------
async function checkUpdate() {
  if (!window.SA_VERSION) return;
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    if (j.version && j.version !== window.SA_VERSION) $('updBar').style.display = '';
  } catch (e) { /* offline */ }
}
$('bUpdate').onclick = () => location.reload();
setTimeout(checkUpdate, 3000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
$('verInfo').textContent = window.SA_VERSION ? `Version ${window.SA_VERSION} · ${window.SA_BUILT || ''}` : '';
$('fileIn').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { $('pgnIn').value = r.result; importText(r.result); };
  r.readAsText(f);
  e.target.value = '';
};
function renderGameList() {
  const list = storedGames();
  const el = $('glist');
  if (!list.length) { el.innerHTML = '<div class="hint">Noch keine Partien analysiert.</div>'; return; }
  el.innerHTML = list.map(g => {
    const h = g.h || {};
    return `<div class="g" data-id="${esc(g.id)}"><div class="nm">${esc(h.White || '?')} – ${esc(h.Black || '?')} <span class="sub">${esc(h.Result || '')}</span><div class="sub">${g.ev ? 'analysiert' : 'nicht fertig analysiert'} ${g.date ? timeAgo(g.date) : ''}</div></div><button class="iconbtn" data-del="${esc(g.id)}" aria-label="Löschen">✕</button></div>`;
  }).join('');
}
$('glist').onclick = e => {
  const del = e.target.closest('[data-del]');
  if (del) { e.stopPropagation(); setGames(storedGames().filter(g => g.id !== del.dataset.del)); renderGameList(); return; }
  const g = e.target.closest('.g');
  if (!g) return;
  const item = storedGames().find(x => x.id === g.dataset.id);
  if (item) { try { loadGame(C.parsePgn(item.pgn), item.pgn, item); } catch (err) { showErr(err.message); } }
};

// ---------- settings UI ----------
function renderSettings() {
  const tog = (k, label, sub) => `<div class="set"><label>${label}${sub ? `<small>${sub}</small>` : ''}</label><button class="toggle ${S[k] ? 'on' : ''}" data-tog="${k}"></button></div>`;
  const rng = (k, label, min, max, sub) => `<div class="set"><label>${label}: <span id="v_${k}">${S[k]}</span>${sub ? `<small>${sub}</small>` : ''}</label><input type="range" min="${min}" max="${max}" value="${S[k]}" data-rng="${k}"></div>`;
  $('setList').innerHTML =
    `<div class="set"><label>Analyse-Stärke<small>Schnell ≈ 0,25 s, Standard ≈ 0,6 s, Gründlich ≈ 1,5 s pro Stellung</small></label><select data-sel="strength">${Object.entries(STRENGTH).map(([k, v]) => `<option value="${k}" ${S.strength === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>` +
    rng('liveDepth', 'Tiefe für eigene Varianten', 10, 24, 'Nur wenn du selbst Züge auf dem Brett ausprobierst') +
    rng('lines', 'Engine-Linien', 1, 3) +
    tog('sound', 'Ton', 'Zug- und Schlaggeräusche') +
    ['move', 'capture'].map(k => `<div class="set"><label>${k === 'move' ? 'Zug-Ton' : 'Schlag-Ton'}<small>${LS.get('sa_snd_' + k, null) ? '✓ geladen' : 'noch keine Datei'}</small></label><label class="iconbtn">Datei wählen<input type="file" accept="audio/*,.mp3,.ogg,.wav,.m4a" data-sndfile="${k}" hidden></label></div>`).join('') +
    `<div class="hint" id="sndHint"></div>` +
    tog('anim', 'Animationen', 'Figuren gleiten beim Durchklicken') +
    tog('arrow', 'Pfeil für besten Zug') +
    tog('evalbar', 'Bewertungsleiste') +
    tog('badges', 'Bewertungssymbole auf dem Brett') +
    tog('coords', 'Koordinaten') +
    `<div class="set"><label>Brettfarbe</label><select data-sel="theme">${Object.entries(THEMES).map(([k, v]) => `<option value="${k}" ${S.theme === k ? 'selected' : ''}>${v[2]}</option>`).join('')}</select></div>`;
}
$('setList').addEventListener('click', e => {
  const t = e.target.closest('[data-tog]');
  if (!t) return;
  S[t.dataset.tog] = !S[t.dataset.tog]; saveSettings();
  t.classList.toggle('on', S[t.dataset.tog]);
  liveCache.clear(); renderAll();
});
$('setList').addEventListener('input', e => {
  const r = e.target.closest('[data-rng]');
  if (r) { S[r.dataset.rng] = +r.value; $('v_' + r.dataset.rng).textContent = r.value; saveSettings(); }
});
$('setList').addEventListener('change', e => {
  const sf = e.target.closest('[data-sndfile]');
  if (sf) {
    const f = sf.files[0];
    if (!f) return;
    const hint = $('sndHint');
    if (f.size > 600000) { hint.textContent = 'Die Datei ist zu groß (max. 600 KB).'; return; }
    const r = new FileReader();
    r.onload = async () => {
      const kind = sf.dataset.sndfile;
      if (!LS.set('sa_snd_' + kind, String(r.result).split(',')[1] || '')) { hint.textContent = 'Speichern fehlgeschlagen.'; return; }
      renderSettings();
      Sound.bufs = null; Sound.unlock();
      if (Sound.building) await Sound.building;
      const was = S.sound; S.sound = true; Sound.play(kind); S.sound = was; // short confirmation
    };
    r.readAsDataURL(f);
    return;
  }
  const s = e.target.closest('[data-sel]');
  if (s) { S[s.dataset.sel] = s.value; saveSettings(); renderAll(); }
  if (e.target.closest('[data-rng]')) { liveCache.clear(); if (game) renderBoardAndInfo(); }
});
$('bCancelAna').onclick = () => { analysisToken++; cancelAll('full'); analyzing = false; showOverlay(false); renderAll(); };
$('bReanalyze').onclick = () => {
  if (!game || game.free) { closeModals(); return; }
  cancelAll(); evals = []; cls = []; closeModals(); renderAll(); startAnalysis();
};

// ---------- review overview (shown after the analysis) ----------
// Rough playing-strength estimate from one game's accuracy (own heuristic, not chess.com's formula).
function estRating(acc, nMoves) {
  if (acc == null || nMoves < 8) return null;
  const pts = [[0, 100], [40, 400], [50, 600], [60, 900], [70, 1250], [75, 1450], [80, 1700], [85, 1950], [90, 2250], [95, 2600], [100, 3000]];
  for (let i = 1; i < pts.length; i++) {
    if (acc <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return Math.round((y0 + (acc - x0) / (x1 - x0) * (y1 - y0)) / 50) * 50;
    }
  }
  return 3000;
}
const REVIEW_MAIN = ['brilliant', 'great', 'best', 'mistake', 'miss', 'blunder'];
const REVIEW_MORE = ['book', 'excellent', 'good', 'forced', 'inaccuracy'];
let reviewMore = false;
function renderReview() {
  const el = $('viewReview');
  if (!game || game.free) { el.innerHTML = ''; return; }
  const h = game.headers;
  const wl = [], bl = [];
  cls.forEach((c, i) => { if (c) (C.parseFen(positions[i]).turn === 'w' ? wl : bl).push(c); });
  const aw = A.accuracy(wl), ab = A.accuracy(bl);
  const rw = estRating(aw, wl.length), rb = estRating(ab, bl.length);
  const res = h.Result || '';
  const winW = res === '1-0', winB = res === '0-1';
  const me = LS.get('sa_me', null);
  const nameCell = (name, color, win) => `<div class="rvp"><div class="rvn${me && name && name.toLowerCase() === me ? ' me' : ''}">${esc(name || (color === 'w' ? 'Weiß' : 'Schwarz'))}</div><div class="rva ${color}${win ? ' win' : ''}" style="background-image:url('${PIECE_SVG[color === 'w' ? 'K' : 'k']}')"></div></div>`;
  const row = t => {
    const cw = wl.filter(c => c.type === t).length, cb = bl.filter(c => c.type === t).length, col = A.CLASSES[t].color;
    return `<div class="rvrow"><span class="rvl">${A.CLASSES[t].label}</span><span class="rvc" style="color:${cw ? col : '#666'}">${cw}</span>${badge(t)}<span class="rvc" style="color:${cb ? col : '#666'}">${cb}</span></div>`;
  };
  const opn = openingName();
  const resText = res === '1-0' ? 'Weiß gewinnt' : res === '0-1' ? 'Schwarz gewinnt' : res === '1/2-1/2' ? 'Remis' : '';
  el.innerHTML = `
    <div class="card rv">
      <div class="rvhead">${esc([resText, h.Termination].filter(Boolean).join(' · '))}${opn ? `<br><span>${esc(opn)}</span>` : ''}</div>
      <div class="rvrow rvtop"><span class="rvl">Spieler</span>${nameCell(h.White, 'w', winW)}${nameCell(h.Black, 'b', winB)}</div>
      <div class="rvrow"><span class="rvl">Genauigkeit</span><span class="rvbox w">${aw == null ? '–' : aw.toFixed(1)}</span><span class="rvbox b">${ab == null ? '–' : ab.toFixed(1)}</span></div>
      <svg class="graph rvgraph" id="rvGraph" viewBox="0 0 400 80" preserveAspectRatio="none">${graphSvg(400, 80, false)}</svg>
      <div class="rvsep"></div>
      ${REVIEW_MAIN.map(row).join('')}
      <div id="rvMore" style="display:${reviewMore ? '' : 'none'}">${REVIEW_MORE.map(row).join('')}</div>
      <button class="rvtoggle" id="rvToggle" aria-label="Alle Bewertungen">${reviewMore ? '▲' : '▼'}</button>
      <div class="rvsep"></div>
      <div class="rvrow"><span class="rvl">Spielstärke</span><span class="rvbox w">${rw == null ? '–' : rw}</span><span class="rvbox b">${rb == null ? '–' : rb}</span></div>
    </div>
    <div class="card"><h3>Züge</h3><div class="moves rvmoves" id="rvMoves">${movesGridHtml(-1)}</div></div>
    <button class="primary rvstart" id="rvStart">Partie durchgehen</button>`;
}
$('viewReview').addEventListener('click', e => {
  if (e.target.closest('#rvToggle')) { reviewMore = !reviewMore; renderReview(); return; }
  if (e.target.closest('#rvStart')) { goto(0, false); showView('board'); return; }
  const k = e.target.closest('[data-ply]');
  if (k) { showView('board'); goto(+k.dataset.ply, false); return; }
  const g = e.target.closest('#rvGraph');
  if (g) { const r = g.getBoundingClientRect(); showView('board'); goto(Math.round((e.clientX - r.left) / r.width * (positions.length - 1)), false); }
});
$('btnReview').onclick = () => showView('review');

// ---------- views: start screen <-> board ----------
let view = 'home';
function showView(v) {
  view = v;
  $('viewHome').style.display = v === 'home' ? '' : 'none';
  $('viewBoard').style.display = v === 'board' ? '' : 'none';
  $('viewReview').style.display = v === 'review' ? '' : 'none';
  $('btnHome').style.display = v !== 'home' ? '' : 'none';
  $('btnReview').style.display = v === 'board' && game && !game.free && cls.some(Boolean) && !analyzing ? '' : 'none';
  if (v === 'review') renderReview();
  if (v === 'home') {
    Engine.cancel('live');
    renderAccList();
    if (Date.now() - lastFetch > 60000) loadAccountGames(false);
  }
  window.scrollTo(0, 0);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && view === 'home') { renderAccList(); if (Date.now() - lastFetch > 60000) loadAccountGames(false); }
});

// ---------- boot ----------
function boot() {
  renderAccInfo();
  showView('home');
}
boot();
Engine.init().catch(() => {});

})();
