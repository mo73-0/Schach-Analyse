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
// Board colours (own choice of colours, no third-party assets). [light, dark, name]
const THEMES = {
  green: ['#ebecd0', '#739552', 'Grün'], brown: ['#f0d9b5', '#b58863', 'Holz'], walnut: ['#e6c9a8', '#8b5a3c', 'Nussbaum'],
  blue: ['#dee3e6', '#8ca2ad', 'Blau'], ice: ['#e5f0f5', '#6e9ab3', 'Eis'], purple: ['#e8e3f2', '#8d78b5', 'Lila'],
  pink: ['#f6e5ea', '#d58ea4', 'Rosa'], coral: ['#f3e2cf', '#c96f58', 'Koralle'], sand: ['#f4ead2', '#c9a76b', 'Sand'],
  olive: ['#eceacf', '#8c9157', 'Oliv'], gray: ['#e0e0e0', '#9a9a9a', 'Grau'], night: ['#8a97a8', '#4a5568', 'Nacht'],
};
const PATTERNS = { none: 'Keins', wood: 'Holzmaserung', linen: 'Leinen', gloss: 'Glanz' };
// Piece sets: cburnett is built in (src/pieces.js), the others live in pieces/<set>/ (licences: THIRD_PARTY.md).
const PIECE_SETS = {
  cburnett: 'Klassisch', chessnut: 'Chessnut', fantasy: 'Fantasy', spatial: 'Spatial', celtic: 'Celtic',
  firi: 'Firi', 'kiwen-suwi': 'Kiwen-suwi', shapes: 'Formen', custom: 'Eigene',
};
const STRENGTH = { fast: { label: 'Schnell', ms: 250, depth: 18 }, std: { label: 'Standard', ms: 600, depth: 20 }, deep: { label: 'Gründlich', ms: 1500, depth: 22 } };
const DEFAULTS = { ccUser: '', liUser: '', sound: true, anim: true, strength: 'std', liveDepth: 18, lines: 3, arrow: true, evalbar: true, badges: true, coords: true, theme: 'green',
  pattern: 'none', pieces: 'cburnett', boardLight: '#eeeed2', boardDark: '#6f8f9e', soundSet: '' };
let S = Object.assign({}, DEFAULTS, LS.get('sa_settings', {}));
if (!S.soundSet) S.soundSet = LS.get('sa_snd_move', null) ? 'custom' : 'wood'; // keep own sounds for existing users
let customPieces = LS.get('sa_pieces_custom', null) || {};
function pieceUrl(c) {
  const key = (c === c.toUpperCase() ? 'w' : 'b') + c.toUpperCase();
  if (S.pieces === 'custom') return customPieces[key] || PIECE_SVG[c];
  if (S.pieces && S.pieces !== 'cburnett' && PIECE_SETS[S.pieces]) return `pieces/${S.pieces}/${key}.svg`;
  return PIECE_SVG[c];
}
// preload the images of a set, so switching doesn't flicker
function preloadPieces() { 'KQRBNPkqrbnp'.split('').forEach(c => { const i = new Image(); i.src = pieceUrl(c); }); }
S.lines = Math.min(3, Math.max(1, S.lines));
if (!STRENGTH[S.strength]) S.strength = 'std';
const saveSettings = () => LS.set('sa_settings', S);

// ---------- sound (Lichess move/capture samples) ----------
// modes: [freq Hz, decay time-constant s, amplitude]
// Built-in sound sets, synthesised in code (own work, no third-party audio): short decaying resonators/tones.
const SOUND_SETS = { wood: 'Holz', click: 'Klick', soft: 'Weich', digital: 'Digital', glass: 'Glas', custom: 'Eigene Dateien' };
const Synth = {
  // fill an AudioBuffer with fn(t, i, sr), normalise, soft attack
  make(ctx, dur, gen) {
    const sr = ctx.sampleRate, n = Math.floor(sr * dur), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    gen(d, sr);
    for (let i = 0; i < n; i++) d[i] *= Math.min(1, i / (sr * 0.0008)) * Math.min(1, (n - i) / (sr * 0.004));
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
    const g = pk ? 0.8 / pk : 0;
    for (let i = 0; i < n; i++) d[i] *= g;
    return b;
  },
  // knock: noise burst exciting two resonators (wood/click/soft), optional second hit
  knock(d, sr, f1, f2, r1, r2, burst, hits) {
    for (const [at, amp] of hits) {
      let y1 = 0, y2 = 0, z1 = 0, z2 = 0;
      const w1 = 2 * Math.PI * f1 / sr, w2 = 2 * Math.PI * f2 / sr, c1 = 2 * r1 * Math.cos(w1), c2 = 2 * r2 * Math.cos(w2);
      let seed = 12345 + at * 1e5;
      for (let i = Math.floor(at * sr); i < d.length; i++) {
        const t = i / sr - at;
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const x = t < burst ? ((seed / 0x7fffffff) * 2 - 1) * (1 - t / burst) : 0;
        const a = x + c1 * y1 - r1 * r1 * y2; y2 = y1; y1 = a;
        const b2 = x + c2 * z1 - r2 * r2 * z2; z2 = z1; z1 = b2;
        d[i] += amp * (a * (1 - r1) + 0.6 * b2 * (1 - r2)) + amp * x * 0.03;
      }
    }
  },
  tone(d, sr, parts, at = 0, amp = 1) {
    for (const [f, dec, a, sq] of parts) for (let i = Math.floor(at * sr); i < d.length; i++) {
      const t = i / sr - at, s = Math.sin(2 * Math.PI * f * t);
      d[i] += amp * a * (sq ? Math.sign(s) * 0.5 + s * 0.5 : s) * Math.exp(-t / dec);
    }
  },
  build(ctx, set) {
    const S2 = this, k = (f1, f2, r1, r2, burst, hits, dur) => S2.make(ctx, dur, (d, sr) => S2.knock(d, sr, f1, f2, r1, r2, burst, hits));
    const t = (parts, dur, more) => S2.make(ctx, dur, (d, sr) => { S2.tone(d, sr, parts); if (more) more(d, sr); });
    switch (set) {
      case 'click': return { move: k(2600, 4200, 0.985, 0.97, 0.0012, [[0, 1]], 0.06), capture: k(2100, 3600, 0.987, 0.975, 0.0015, [[0, 0.8], [0.022, 1]], 0.09) };
      case 'soft': return { move: t([[190, 0.045, 1], [380, 0.02, 0.3]], 0.16), capture: t([[150, 0.06, 1], [300, 0.03, 0.4]], 0.2, (d, sr) => S2.tone(d, sr, [[210, 0.04, 0.7]], 0.03)) };
      case 'digital': return { move: t([[880, 0.03, 1, true]], 0.09), capture: t([[660, 0.025, 1, true]], 0.13, (d, sr) => S2.tone(d, sr, [[990, 0.03, 1, true]], 0.05)) };
      case 'glass': return { move: t([[1480, 0.12, 1], [3420, 0.06, 0.45], [5150, 0.035, 0.25]], 0.35), capture: t([[1110, 0.15, 1], [2570, 0.08, 0.5], [3900, 0.05, 0.3]], 0.42, (d, sr) => S2.tone(d, sr, [[1480, 0.1, 0.6]], 0.04)) };
      default: return { move: k(720, 1180, 0.994, 0.99, 0.002, [[0, 1]], 0.14), capture: k(540, 900, 0.995, 0.99, 0.0025, [[0, 0.75], [0.018, 1]], 0.17) };
    }
  },
};
const Sound = {
  ctx: null, bufs: null, building: null, stale: false,
  // Must run inside a user gesture. iOS suspends ("interrupted") the audio context whenever the app is left;
  // resume() alone often fails afterwards, so after a return to the app a fresh context is created
  // (decoded AudioBuffers can be reused across contexts) and primed with a silent sample.
  unlock() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (this.ctx && (this.stale || this.ctx.state === 'closed' || this.ctx.state === 'interrupted')) {
        try { this.ctx.close(); } catch (e) { /* ignore */ }
        this.ctx = null;
      }
      this.stale = false;
      if (!this.ctx) {
        this.ctx = new AC();
        const sil = this.ctx.createBufferSource(); sil.buffer = this.ctx.createBuffer(1, 1, 22050);
        sil.connect(this.ctx.destination); sil.start(0);
      }
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      if (!this.bufs && !this.building) this.build();
    } catch (e) { this.ctx = null; }
  },
  async build() {
    this.building = (async () => {
      const out = {};
      if (S.soundSet === 'custom') {
        for (const kind of ['move', 'capture']) {
          const b64 = LS.get('sa_snd_' + kind, null);
          const b = b64 ? await this.decodeB64(b64) : null;
          out[kind] = b ? [b] : [];
        }
      } else {
        const g = Synth.build(this.ctx, S.soundSet);
        out.move = [g.move]; out.capture = [g.capture];
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
['touchend', 'pointerdown'].forEach(ev => document.addEventListener(ev, () => { if (S.sound) Sound.unlock(); }, { passive: true, capture: true }));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Sound.stale = true; });
window.addEventListener('pagehide', () => { Sound.stale = true; });
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
const isStdStartOf = g => g && g.startFen.split(' ')[0] === C.START.split(' ')[0] && g.startFen.split(' ')[1] === 'w';
const isStdStart = () => isStdStartOf(game);
// Moves count as theory while every position from the start is in the book.
function applyBookTo(g, pos, ev, cl) {
  if (!g || g.free || !isStdStartOf(g)) return;
  let i = 0;
  for (; i < g.moves.length; i++) {
    if (!BOOK.has(fenHash(pos[i + 1]))) break;
    if (cl[i]) cl[i] = Object.assign({}, cl[i], { type: 'book' });
  }
  // a theory move is no mistake to punish: re-rate the first move after the book without "Verpasst"
  if (i > 0 && cl[i] && cl[i].type === 'miss') cl[i] = A.classify(g, pos, ev, i, cl[i - 1]);
  // like chess.com: theory continues a few more plies while the moves stay near-perfect
  while (i < A.EP.bookExt && i < g.moves.length && cl[i] && cl[i].loss <= A.EP.bookLoss && (i === 0 || (cl[i - 1] && cl[i - 1].type === 'book'))) { cl[i] = Object.assign({}, cl[i], { type: 'book' }); i++; }
}
function classifyGame(g, pos, ev) {
  const cl = [];
  for (let i = 0; i < g.moves.length; i++) cl[i] = A.classify(g, pos, ev, i, cl[i - 1]);
  applyBookTo(g, pos, ev, cl);
  return cl;
}
// Which colour did the app's user play? (matched against saved account names)
function myColor(h) {
  const names = [S.ccUser, S.liUser, LS.get('sa_me', null)].filter(Boolean).map(x => x.toLowerCase());
  if (h && h.White && names.includes(h.White.toLowerCase())) return 'w';
  if (h && h.Black && names.includes(h.Black.toLowerCase())) return 'b';
  return null;
}
// Per-game statistics + training tasks (own mistakes), stored with the saved analysis.
function gameStats(g, pos, ev, cl) {
  const wl = [], bl = [];
  cl.forEach((c, i) => { if (c) (C.parseFen(pos[i]).turn === 'w' ? wl : bl).push(c); });
  const me = myColor(g.headers);
  const tr = [];
  if (me) cl.forEach((c, i) => {
    if (!c || !['inaccuracy', 'mistake', 'blunder', 'miss'].includes(c.type) || !c.bestUci) return;
    if (C.parseFen(pos[i]).turn !== me) return;
    const task = trainTask(g, pos, ev, c, i, me);
    // the same tactic often stays on the board for several moves – keep it only once
    if (task && !tr.some(x => x.best === task.best && x.mo === task.mo)) tr.push(task);
  });
  return { v: 6, aw: A.accuracy(wl), ab: A.accuracy(bl), me, tr };
}
// Only mistakes with a real learning effect become training tasks:
//  - a missed tactic: mate in <= 5, or a short line that wins >= 2 points of material (fork, loose piece, combination),
//    not just a plain recapture and not when the game was already completely won anyway;
//  - or a threat that had to be met: the played move allowed mate / lost a piece and only one move held the position.
function trainTask(g, pos, ev, c, i, me) {
  const ls = ev[i] && ev[i].lines || [];
  if (!ls[0] || !ls[0].pv || !ls[0].pv.length) return null;
  const sg = me === 'w' ? 1 : -1;
  const wp = l => A.winPct(sg * l.cpw);
  const clampCp = x => Math.max(-100000, Math.min(100000, x));
  let mo = { kind: null, gain: 0 };
  try { mo = Explain.lineMotif(pos[i], ls[0]); } catch (e) { /* ignore */ }
  const prev = i > 0 ? g.moves[i - 1] : null;
  const recapture = prev && prev.captured && mo.m && mo.m.to === prev.to && !mo.m.promo && mo.kind !== 'mate';
  let kind = null, why = '', line = null;
  // 1) missed tactic / mate (a missed recapture only counts when it was really costly)
  if (mo.kind === 'mate' && mo.n <= 5) kind = Explain.label(mo);
  else if (mo.kind && mo.gain >= 2 && (!recapture || c.loss >= 0.20) && c.loss >= 0.08 && c.eb < 0.97) kind = recapture ? 'Zurückschlagen' : Explain.label(mo);
  if (kind) { why = Explain.bestText(mo); line = solutionLine(pos[i], ls[0], mo); }
  // 2) own move lost a piece / allowed mate: find a safe move (any move that keeps the evaluation counts, checked by the engine)
  else if (['mistake', 'blunder', 'miss'].includes(c.type) && c.eb > 0.15) {
    const e1 = ev[i + 1], l1 = e1 && !e1.terminal && e1.lines[0];
    let opp = { kind: null, gain: 0 };
    try { if (l1) opp = Explain.lineMotif(pos[i + 1], l1); } catch (e) { /* ignore */ }
    const drop = Math.min(3000, sg * ls[0].cpw) - Math.max(-3000, sg * (l1 ? l1.cpw : ls[0].cpw));
    if (opp.kind === 'mate' || (opp.gain >= 3 && drop >= 150)) {
      const own = opp.kind === 'hanging' && opp.sq === g.moves[i].to;
      kind = opp.kind === 'mate' ? 'Matt verhindern' : own ? 'Figur nicht einstellen' : 'Drohung abwehren';
      why = opp.kind === 'mate' ? `Nach ${g.moves[i].san} hätte der Gegner Matt gesetzt (${opp.san}). ${mo.san || ''} verhindert das.`
        : `Nach ${g.moves[i].san} gewinnt der Gegner mit ${opp.san} Material. Besser war zum Beispiel ${mo.san || ''}.`;
      line = ls[0].pv.slice(0, 1);
    }
  }
  if (!kind) return null;
  const alt = ls[1] && ls[1].pv && ls[1].pv[0] && wp(ls[0]) - wp(ls[1]) < 4 ? ls[1].pv[0] : null;
  const pre = prev ? { fen: pos[i - 1], uci: prev.uci } : null;
  return { ply: i, fen: pos[i], best: c.bestUci, alt, played: g.moves[i].san, type: c.type, pv: ls[0].pv.slice(0, 3), line, mo: kind, why, pre, bestCp: clampCp(sg * ls[0].cpw) };
}
// Moves the player has to find, like a puzzle: the whole mate (mate in 3 = 3 own moves), or the moves until the
// material is really won (e.g. fork + capture). Odd length: own move, reply, own move, …
function solutionLine(fen, l, mo) {
  const pv = l.pv || [];
  try {
    if (mo.kind === 'mate') {
      const n = 2 * mo.n - 1;
      if (pv.length < n) return pv.slice(0, 1);
      let p = C.parseFen(fen);
      for (const u of pv.slice(0, n)) { const m = C.legal(p).find(x => C.uci(x) === u); if (!m) return pv.slice(0, 1); p = C.make(p, m); }
      return C.status(p) === 'mate' ? pv.slice(0, n) : pv.slice(0, 1);
    }
    // the key move alone when it already wins the material, otherwise key move + follow-up (max. 2 own moves)
    for (let k = 1; k <= Math.min(3, pv.length); k += 2) {
      const g1 = Explain.pvGain(fen, pv, k), g2 = pv.length > k ? Explain.pvGain(fen, pv, k + 1) : g1;
      if (g1 >= 2 && g2 >= 2) return pv.slice(0, k);
    }
  } catch (e) { /* ignore */ }
  return pv.slice(0, 1);
}
// German result sentence from Result/Termination headers (chess.com: "X won by checkmate", Lichess: "Normal", "Time forfeit").
function resultText(h, lastFen) {
  const res = h.Result || '', term = (h.Termination || '').trim();
  const winner = res === '1-0' ? (h.White || 'Weiß') : res === '0-1' ? (h.Black || 'Schwarz') : '';
  const draw = res === '1/2-1/2';
  const t = term.toLowerCase();
  let how = '';
  const m = term.match(/^(.+?) won\b/i);
  if (/checkmate/.test(t)) how = 'durch Schachmatt';
  else if (/resign/.test(t)) how = 'durch Aufgabe';
  else if (/abandon/.test(t)) how = 'durch Spielabbruch';
  else if (/insufficient material/.test(t)) how = draw ? 'durch Zeitablauf bei ungenügendem Material' : '';
  else if (/on time|time forfeit|timeout/.test(t)) how = 'auf Zeit';
  else if (/agreement/.test(t)) how = 'durch Einigung';
  else if (/repetition/.test(t)) how = 'durch Stellungswiederholung';
  else if (/stalemate/.test(t)) how = 'durch Patt';
  else if (/50|fifty/.test(t)) how = 'durch 50-Züge-Regel';
  else if (/rules infraction/.test(t)) how = 'durch Regelverstoß';
  if (/insufficient material/.test(t) && !/time/.test(t)) how = 'durch ungenügendes Material';
  if (!how && (t === 'normal' || !t) && lastFen) {
    try {
      const st = C.status(C.parseFen(lastFen));
      if (st === 'mate') how = 'durch Schachmatt';
      else if (st === 'stalemate') how = 'durch Patt';
      else if (st === 'insufficient') how = 'durch ungenügendes Material';
      else if (st === 'fifty') how = 'durch 50-Züge-Regel';
      else if (winner && t === 'normal') how = 'durch Aufgabe';
    } catch (e) {}
  }
  const who = winner || (m && !draw ? m[1] : '');
  if (who) return `${who} gewinnt${how ? ' ' + how : ''}`;
  if (draw) return `Remis${how ? ' ' + how : ''}`;
  return res === '*' ? 'Partie läuft' : '';
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
  const complete = evals.length === positions.length && evals.every(Boolean);
  const entry = { id: game.id, pgn: game.pgn, h: game.headers, date: Date.now(), depth: game.depth, ev: complete ? slim : null };
  if (complete && cls.length) entry.st = gameStats(game, positions, evals, cls);
  list.unshift(entry);
  while (list.length > 25) list.pop();
  setGames(list);
}
function unslim(ev) {
  return ev.map(e => e && { terminal: e.t || undefined, lines: e.l.map(l => ({ cpw: l.c, mate: l.m == null ? undefined : l.m, cp: l.m == null ? l.c : undefined, pv: l.p, depth: l.d })) });
}

// ---------- load ----------
function loadGame(parsed, pgnText, cached) {
  document.body.classList.remove('traindone');
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
  cls = classifyGame(game, positions, evals);
}

let liveTimer = null;
function requestLive() {
  clearTimeout(liveTimer);
  Engine.cancel('live');
  if (game && game.trainer) return;
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
  // training: the evaluation of the task position is known (no live engine while solving)
  if (game && game.trainer && trainTasks[trainIdx] && trainTasks[trainIdx].bestCp != null) {
    const t = trainTasks[trainIdx], sg = t.color === 'w' ? 1 : -1;
    const mn = /Matt in (\d+)/.exec(t.mo || '');
    return { lines: [{ cpw: sg * t.bestCp, mate: t.bestCp > 90000 && mn ? sg * +mn[1] : undefined, pv: [] }] };
  }
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
  const boardImg = S.theme === 'image' ? LS.get('sa_board_img', null) : null;
  const [light, dark] = S.theme === 'custom' ? [S.boardLight, S.boardDark] : boardImg ? ['rgba(255,255,255,.9)', 'rgba(0,0,0,.55)'] : (THEMES[S.theme] || THEMES.green);
  boardEl.className = 'board' + (boardImg ? ' img' : ' pat-' + (S.pattern || 'none'));
  boardEl.style.backgroundImage = boardImg ? `url('${boardImg}')` : '';
  const lm = lastMove();
  const lmCls = inGamePos() ? (gamePly() > 0 && game && !game.free ? cls[gamePly() - 1] : null) : varCls();
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
    if (p.b[s]) inner += `<div class="pc" style="background-image:url('${pieceUrl(p.b[s])}')"></div>`;
    const tg = targets.find(m => m.to === s);
    if (tg) inner += tg.captured ? '<div class="ring"></div>' : '<div class="dot"></div>';
    if (S.badges && lmCls && lm && s === lm.to) inner += badge(lmCls.type);
    h += `<div class="sq ${isLight ? 'l' : 'd'}" data-s="${s}"${boardImg ? '' : ` style="background-color:${isLight ? light : dark}"`}>${inner}</div>`;
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
  if (trainArrow) h += arrowSvg(C.sqIdx(trainArrow.slice(0, 2)), C.sqIdx(trainArrow.slice(2, 4)), 'rgba(70,140,230,.85)');
  else if (S.arrow && game && !game.trainer) {
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
  if (cl && cl.lines[0]) {
    const L = cl.lines[0];
    // forced mate (or a mated position) fills the bar completely
    const mateSide = cl.terminal === 'mate' ? Math.sign(L.cpw) : L.mate != null && L.mate !== 0 ? Math.sign(L.mate) : 0;
    w = mateSide ? (mateSide > 0 ? 100 : 0) : A.winPct(L.cpw);
    txt = fmtScore(L, cl.terminal).replace('+', '');
  }
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
  // material: pieces each side has captured (missing from the opponent's starting set) + point difference
  const board = C.parseFen(curFen()).b;
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 }, START = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const have = { w: {}, b: {} };
  for (const x of board) if (x && x.toLowerCase() !== 'k') { const c = x === x.toUpperCase() ? 'w' : 'b', t = x.toLowerCase(); have[c][t] = (have[c][t] || 0) + 1; }
  const points = c => Object.entries(have[c]).reduce((s, [t, n]) => s + VAL[t] * n, 0);
  const diff = points('w') - points('b');
  const matHtml = color => {
    const opp = color === 'w' ? 'b' : 'w';
    let h2 = '';
    for (const t of ['p', 'b', 'n', 'r', 'q']) {
      const lost = Math.max(0, START[t] - (have[opp][t] || 0));
      if (!lost) continue;
      const key = opp === 'w' ? t.toUpperCase() : t;
      h2 += `<span class="mgrp">${`<i style="background-image:url('${pieceUrl(key)}')"></i>`.repeat(lost)}</span>`;
    }
    const adv = color === 'w' ? diff : -diff;
    return `<span class="mat">${h2}${adv > 0 ? `<b>+${adv}</b>` : ''}</span>`; // always present: reserves the row, no jump on first capture
  };
  const row = color => {
    const name = color === 'w' ? h.White : h.Black, elo = color === 'w' ? h.WhiteElo : h.BlackElo;
    const ck = clockOf(color);
    return `<span class="av ${color}">${color === 'w' ? '♔' : '♚'}</span><span class="pinfo"><span class="pname"><span class="pn">${esc(name || (color === 'w' ? 'Weiß' : 'Schwarz'))}</span>${elo && elo !== '?' ? `<span class="elo">(${esc(elo)})</span>` : ''}</span>${matHtml(color)}</span>${ck ? `<span class="clk">${esc(ck)}</span>` : ''}`;
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
// ---------- feedback for own moves in variations ----------
// Each variation move gets the same classification as game moves: both positions are evaluated with the
// game's time budget (MultiPV 2) on a helper engine, so live analysis keeps running on the main engine.
const varEv = new Map(); // fen -> eval
let varBusy = false;
function mkMove(p, m) { return { from: m.from, to: m.to, san: C.san(p, m), uci: C.uci(m), piece: m.piece, captured: m.captured || null, promo: m.promo || null }; }
function varCls() { return variation && variation.idx > 0 ? variation.moves[variation.idx - 1].cls || null : null; }
async function evalFen(fen) {
  if (varEv.has(fen)) return varEv.get(fen);
  const p = C.parseFen(fen), st = C.status(p);
  let e;
  if (st === 'mate') e = { terminal: 'mate', lines: [{ cpw: p.turn === 'w' ? -100000 : 100000, mate: 0, pv: [] }] };
  else if (st === 'stalemate' || st === 'insufficient') e = { terminal: 'draw', lines: [{ cpw: 0, cp: 0, pv: [] }] };
  else {
    try { await Engine.init(); } catch (err) { return null; }
    const en = await getHelper(1).catch(() => Engine);
    const prof = STRENGTH[game && game.depth] || STRENGTH[S.strength];
    const r = await en.search({ fen, depth: prof.depth, movetime: prof.ms, multipv: 2, kind: 'var' });
    if (!r || !r.lines.length) return null;
    e = { lines: r.lines };
  }
  if (varEv.size > 400) varEv.clear();
  varEv.set(fen, e);
  return e;
}
async function classifyVariation() {
  if (varBusy) return;
  varBusy = true;
  try {
    for (;;) {
      const v = variation;
      if (!v || !game || game.free || game.trainer) break;
      const k = v.moves.findIndex(m => m.cls === undefined);
      if (k < 0) break;
      const mv = v.moves[k], b = v.base;
      const fens = [...positions.slice(0, b + 1), ...v.fens];
      const e0 = k === 0 && evals[b] ? evals[b] : await evalFen(fens[b + k]);
      const e1 = e0 ? await evalFen(fens[b + k + 1]) : null;
      if (variation !== v || v.moves[k] !== mv) continue; // line changed meanwhile
      const evs = []; evs[b + k] = e0; evs[b + k + 1] = e1;
      const prev = k === 0 ? cls[b - 1] : v.moves[k - 1].cls;
      const pseudo = { headers: game.headers, moves: [...game.moves.slice(0, b), ...v.moves] };
      mv.cls = e0 && e1 ? A.classify(pseudo, fens, evs, b + k, prev) : null;
      mv.ev = e1; mv.e0 = e0;
      renderBoard(); renderFeedback(); renderVarbar();
    }
  } finally { varBusy = false; }
}
// Explanation sentence for a classified move (cached per position + move).
const whyCache = new Map();
function moveWhy(fen, uci, c, e0, e1) {
  if (!c || !e0 || !e1) return '';
  const key = fen + ' ' + uci + ' ' + c.type;
  if (!whyCache.has(key)) {
    let s = '';
    try { s = Explain.explain({ fen, uci, cls: c, e0, e1 }); } catch (e) { console.warn('explain', e); }
    if (whyCache.size > 500) whyCache.clear();
    whyCache.set(key, s);
  }
  return whyCache.get(key);
}
function renderVarFeedback(card) {
  const v = variation, k = v.idx - 1, m = v.moves[k], c = m.cls;
  const p0 = C.parseFen(k === 0 ? positions[v.base] : v.fens[k - 1]);
  const label = `${p0.full}${p0.turn === 'w' ? '.' : '…'} ${m.san}`;
  card.style.display = '';
  if (!c) { card.innerHTML = `<div class="fb"><div><div class="t">${esc(label)}</div><div class="s">${c === null ? 'Keine Bewertung möglich' : 'Eigener Zug wird bewertet …'}</div></div></div>`; return; }
  const info = A.CLASSES[c.type];
  let sub = 'Eigener Zug (Variante)';
  if (!c.isBest && c.bestUci && c.bestUci !== m.uci) {
    const bs = pvToSan(k === 0 ? positions[v.base] : v.fens[k - 1], [c.bestUci], 1)[0] || '';
    sub = `Bester Zug war <b style="color:#fff">${esc(bs.replace(/^\d+(\.|…)+ ?/, ''))}</b>`;
  }
  const sc = m.ev ? fmtScore(m.ev.lines[0], m.ev.terminal) : '';
  const why = moveWhy(k === 0 ? positions[v.base] : v.fens[k - 1], m.uci, c, m.e0, m.ev);
  card.innerHTML = `<div class="fb">${badge(c.type)}<div style="min-width:0"><div class="t" style="color:${info.color}">${esc(m.san)} ${info.phrase}</div><div class="s">${sub}</div>${why ? `<div class="fbwhy">${esc(why)}</div>` : ''}</div>${sc ? `<span class="ev ${m.ev.lines[0].cpw < 0 ? 'neg' : ''}">${esc(sc)}</span>` : ''}</div>`;
}
function renderFeedback() {
  const card = $('fbCard');
  if (game && !game.free && !game.trainer && !inGamePos()) { renderVarFeedback(card); return; }
  const p = gamePly();
  if (!game || game.free || !inGamePos() || p === 0) {
    if (game && !game.free && p === 0 && inGamePos()) {
      card.style.display = '';
      const h = game.headers;
      card.innerHTML = `<div class="fb"><div><div class="t">${esc(h.White || 'Weiß')} – ${esc(h.Black || 'Schwarz')}</div><div class="s">${esc([h.Event, h.Date && h.Date.replace(/\./g, '.'), ].filter(x => x && x !== '?' && x !== '????.??.??').join(' · '))}${resultText(h, positions[positions.length - 1]) ? '<br>' + esc(resultText(h, positions[positions.length - 1])) : ''}${openingName() ? '<br>Eröffnung: ' + esc(openingName()) : ''}</div></div></div>`;
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
  else if (!c.isBest && c.bestUci && c.bestUci !== m.uci && c.type !== 'forced') {
    const bs = pvToSan(positions[p - 1], [c.bestUci], 1)[0] || '';
    sub = `Bester Zug war <b style="color:#fff">${esc(bs.replace(/^\d+(\.|…)+ ?/, ''))}</b>`;
    showBest = true;
  }
  const why = c.type === 'book' ? '' : moveWhy(positions[p - 1], m.uci, c, evals[p - 1], e1);
  card.innerHTML = `<div class="fb">${badge(c.type)}<div style="min-width:0"><div class="t" style="color:${info.color}">${esc(m.san)} ${info.phrase}</div>${sub ? `<div class="s">${sub}</div>` : ''}${why ? `<div class="fbwhy">${esc(why)}</div>` : ''}${showBest ? '<button class="linkbtn" id="bShowBest">Besten Zug ansehen →</button>' : ''}</div>${sc ? `<span class="ev ${e1.lines[0].cpw < 0 ? 'neg' : ''}">${sc}</span>` : ''}</div>`;
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
    v.moves.push(mkMove(p, m));
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
    return `<tr><td class="c" style="color:${cw ? col : '#666'}">${cw}</td><td class="l"><span class="lw">${badge(t)}${A.CLASSES[t].label}</span></td><td class="c" style="color:${cb ? col : '#666'}">${cb}</td></tr>`;
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
    const bd = m.cls && S.badges ? badge(m.cls.type, 'vb') : '';
    s += k === variation.idx - 1 ? `<b style="color:#fff">${bd}${esc(m.san)}</b>` : bd + esc(m.san);
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
  if (variation) classifyVariation();
}
function renderAll() {
  if (!game) { freeBoardRender(); return; }
  renderBoardAndInfo(); renderSummary(); renderProgress();
}
function freeBoardRender() { renderEmpty(); }

// ---------- interaction ----------
function goto(p, fx = true) {
  if (!game) return;
  if (game.trainer && trainSt && trainSt.busy) return; // no browsing while moves are being shown
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
  if (game && game.trainer) { trainerMove(m); return; }
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
  const mv = mkMove(p, m);
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
  // training: while browsing earlier moves, a tap on the board returns to the task position
  if (game.trainer && ply !== positions.length - 1) { if (!trainSt || !trainSt.busy) goto(positions.length - 1); return; }
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
    return `<button data-pr="${t}" style="background-image:url('${pieceUrl(k)}')"></button>`;
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
      variation.moves.push(mkMove(p, m));
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
// While any sheet/overlay is open the page behind must not scroll (iOS ignores overflow:hidden on body,
// so the body is pinned with position:fixed and the scroll position restored afterwards).
let scrollLockY = null;
function syncScrollLock() {
  const open = !!document.querySelector('.modal.open, #anaov.open, #clockView.open');
  const b = document.body.style;
  if (open && scrollLockY == null) {
    scrollLockY = window.scrollY;
    Object.assign(b, { position: 'fixed', top: -scrollLockY + 'px', left: '0', right: '0', width: '100%' });
  } else if (!open && scrollLockY != null) {
    const y = scrollLockY; scrollLockY = null;
    Object.assign(b, { position: '', top: '', left: '', right: '', width: '' });
    window.scrollTo(0, y);
  }
}
new MutationObserver(syncScrollLock).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
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
      out.push({ src: 'chess.com', pgn: g.pgn, t: (g.end_time || 0) * 1000, white, me: me.username, op: op.username, opElo: op.rating, myElo: me.rating,
        res: me.result === 'win' ? 'w' : CC_DRAW.includes(me.result) ? 'd' : 'l', tc: g.time_class, open: openingFamily(g.eco || '') });
    }
  }
  st.done = st.idx < 0;
  return out;
}
async function loadLichess(user, st) {
  const u = user.toLowerCase(), max = 30;
  const r = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${max}&pgnInJson=true&clocks=true&opening=true${st.until ? '&until=' + st.until : ''}`, { headers: { Accept: 'application/x-ndjson' } });
  if (r.status === 404) throw new Error('Benutzer nicht gefunden');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const lines = (await r.text()).split('\n').filter(Boolean).map(l => JSON.parse(l));
  if (lines.length) st.until = Math.min(...lines.map(g => g.createdAt)) - 1;
  st.done = lines.length < max;
  return lines.filter(g => g.pgn && g.variant === 'standard' && g.status !== 'aborted' && g.status !== 'noStart').map(g => {
    const wName = (g.players.white.user && g.players.white.user.name) || 'Anonym', bName = (g.players.black.user && g.players.black.user.name) || 'Anonym';
    const white = wName.toLowerCase() === u;
    const color = white ? 'white' : 'black';
    const mine = white ? g.players.white : g.players.black;
    return { src: 'Lichess', pgn: g.pgn, t: g.lastMoveAt || g.createdAt, white, me: white ? wName : bName, op: white ? bName : wName,
      opElo: (white ? g.players.black : g.players.white).rating, myElo: mine.rating != null ? mine.rating + (mine.ratingDiff || 0) : null,
      res: !g.winner ? 'd' : g.winner === color ? 'w' : 'l', tc: g.speed, open: openingFamily(g.opening && g.opening.name || '') };
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
    fetchRatings();
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
  renderFilters();
  renderBilanz();
  renderOpenings();
  renderTiles();
  if (!accGames.length) {
    el.innerHTML = (S.ccUser || S.liUser) && !fetching ? '<div class="hint">Keine Partien gefunden.</div>' : '';
    return;
  }
  const done = analysedKeys();
  const canMore = accState && ((accState.cc && !accState.cc.done) || (accState.li && !accState.li.done));
  const shown = accGames.map((g, k) => [g, k]).filter(([g]) => passFilter(g));
  if (!shown.length) { el.innerHTML = '<div class="hint">Keine Partien für diesen Filter.</div>' + (canMore ? '<button class="iconbtn" id="bMoreGames" style="width:100%;margin-top:8px">Ältere Partien laden</button>' : ''); return; }
  const full = shown.length;
  const page = shown.slice(0, listLimit);
  el.innerHTML = page.map(([g, k]) => `<div class="g" data-acc="${k}"><span class="res ${g.res}">${g.res === 'w' ? 'S' : g.res === 'l' ? 'N' : '½'}</span><div class="nm"><div class="top"><span>${g.white ? '♔' : '♚'} gegen ${esc(g.op)} ${g.opElo ? `<span class="sub">(${esc(g.opElo)})</span>` : ''}</span><span class="ago">${timeAgo(g.t)}</span></div><div class="sub"><span class="srcchip ${g.src === 'Lichess' ? 'li' : 'cc'}">${esc(g.src)}</span>${esc(TC[g.tc] || g.tc || '')}${done.has(headerKey(pgnHeaders(g.pgn))) ? ' · <span style="color:#81b64c">✓ analysiert</span>' : ''}</div></div><span>›</span></div>`).join('') +
    (full > listLimit ? `<button class="iconbtn" id="bShowMore" style="width:100%;margin-top:8px">Mehr anzeigen (${full - listLimit} weitere)</button>`
      : canMore ? '<button class="iconbtn" id="bMoreGames" style="width:100%;margin-top:8px">Ältere Partien laden</button>' : '');
}
let listLimit = 10;
function openAccGame(g) {
  LS.set('sa_me', g.me.toLowerCase());
  importOne(g.pgn);
}
$('accList').onclick = e => {
  if (e.target.closest('#bMoreGames')) { listLimit += 15; loadAccountGames(true); return; }
  if (e.target.closest('#bShowMore')) { listLimit += 15; renderAccList(); return; }
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

// ---------- chess clock (for over-the-board games) ----------
const CLOCK_PRESETS = [[1, 0, 'Bullet'], [2, 1, 'Bullet'], [3, 0, 'Blitz'], [3, 2, 'Blitz'], [5, 0, 'Blitz'], [5, 3, 'Blitz'],
  [10, 0, 'Schnell'], [10, 5, 'Schnell'], [15, 10, 'Schnell'], [30, 0, 'Klassisch'], [60, 0, 'Klassisch'], [90, 30, 'Klassisch']];
const Clock = {
  tc: null, left: { w: 0, b: 0 }, moves: { w: 0, b: 0 }, turn: null, running: false, last: 0, timer: null, flag: null, lock: null, sound: true,
  open() {
    const tc = S.clockTC || [5, 0];
    $('clkMin').value = tc[0]; $('clkInc').value = tc[1];
    this.renderPresets();
    $('clkSetup').style.display = ''; $('clkPlay').style.display = 'none';
    $('clockView').classList.add('open');
  },
  close() { this.stop(); this.releaseLock(); $('clockView').classList.remove('open'); },
  renderPresets() {
    const m = +$('clkMin').value, i = +$('clkInc').value;
    $('clkPresets').innerHTML = CLOCK_PRESETS.map(([a, b, n]) => `<button class="clkpre${a === m && b === i ? ' on' : ''}" data-tc="${a},${b}">${a} + ${b}<small>${n}</small></button>`).join('');
  },
  start() {
    const m = Math.max(0, Math.min(180, +$('clkMin').value || 0)), inc = Math.max(0, Math.min(60, +$('clkInc').value || 0));
    if (!m && !inc) return;
    S.clockTC = [m, inc]; saveSettings();
    this.tc = { ms: m * 60000 || 10000, inc: inc * 1000 };
    this.left = { w: this.tc.ms, b: this.tc.ms }; this.moves = { w: 0, b: 0 };
    this.turn = null; this.running = false; this.flag = null;
    $('clkSetup').style.display = 'none'; $('clkPlay').style.display = '';
    $('clkPause').textContent = 'Pause';
    this.requestLock();
    this.render();
  },
  // tap on a half = that player finished his move
  press(side) {
    if (this.flag) return;
    if (this.turn && this.turn !== side) return;          // only the player whose clock runs can press
    if (!this.turn) { this.turn = side === 'b' ? 'w' : 'b'; this.go(); this.click(); this.render(); return; } // first tap starts the other clock
    if (!this.running) return;
    this.tick();
    this.left[side] += this.tc.inc; this.moves[side]++;
    this.turn = side === 'w' ? 'b' : 'w';
    this.click(); this.render();
  },
  go() { this.running = true; this.last = performance.now(); clearInterval(this.timer); this.timer = setInterval(() => { this.tick(); this.render(); }, 100); },
  stop() { this.tick(); this.running = false; clearInterval(this.timer); this.timer = null; },
  tick() {
    if (!this.running || !this.turn) return;
    const now = performance.now();
    this.left[this.turn] -= now - this.last; this.last = now;
    if (this.left[this.turn] <= 0) {
      this.left[this.turn] = 0; this.flag = this.turn; this.running = false; clearInterval(this.timer);
      if (this.sound) { Sound.play('capture'); setTimeout(() => Sound.play('capture'), 250); }
    }
  },
  pause() {
    if (this.flag || !this.turn) return;
    if (this.running) { this.stop(); $('clkPause').textContent = 'Weiter'; } else { this.go(); $('clkPause').textContent = 'Pause'; }
    this.render();
  },
  click() { if (this.sound && S.sound) Sound.play('move'); },
  fmt(ms) {
    if (ms < 10000) return (Math.floor(ms / 100) / 10).toFixed(1);
    const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return h ? `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
  },
  render() {
    for (const [side, id] of [['w', 'clkW'], ['b', 'clkB']]) {
      const el = $(id), ms = this.left[side];
      el.querySelector('.clkt').textContent = this.fmt(ms);
      el.querySelector('.clkm').textContent = this.flag === side ? 'Zeit abgelaufen' : !this.turn ? (side === 'b' ? 'Schwarz – tippen zum Start' : 'Weiß') : `${side === 'w' ? 'Weiß' : 'Schwarz'} · ${this.moves[side]} ${this.moves[side] === 1 ? 'Zug' : 'Züge'}${this.turn === side && !this.running && !this.flag ? ' · Pause' : ''}`;
      el.className = 'clkside ' + (id === 'clkB' ? 'top' : 'bottom') + (this.flag === side ? ' flag' : this.turn === side && this.running ? ' run' : ' wait') + (ms < 20000 ? ' low' : '');
    }
    $('clkSound').textContent = this.sound ? 'Ton an' : 'Ton aus';
  },
  // keep the screen on while the clock is in use (iOS 16.4+)
  async requestLock() { try { if ('wakeLock' in navigator) this.lock = await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ } },
  releaseLock() { try { if (this.lock) this.lock.release(); } catch (e) { /* ignore */ } this.lock = null; },
};
$('bHomeClock').onclick = () => Clock.open();
$('clkClose').onclick = () => Clock.close();
$('clkExit').onclick = () => { if (Clock.turn && !Clock.flag && !confirmClock('Uhr beenden?')) return; Clock.close(); };
$('clkReset').onclick = () => { if (Clock.turn && !Clock.flag && !confirmClock('Neue Partie? Die laufende Zeit wird zurückgesetzt.')) return; Clock.stop(); Clock.open(); };
$('clkPause').onclick = () => Clock.pause();
$('clkSound').onclick = () => { Clock.sound = !Clock.sound; Clock.render(); };
$('clkStart').onclick = () => { Sound.unlock(); Clock.start(); };
$('clkPresets').addEventListener('click', e => { const b = e.target.closest('[data-tc]'); if (!b) return; const [m, i] = b.dataset.tc.split(','); $('clkMin').value = m; $('clkInc').value = i; Clock.renderPresets(); });
['clkMin', 'clkInc'].forEach(id => $(id).addEventListener('input', () => Clock.renderPresets()));
$('clkW').addEventListener('pointerdown', e => { e.preventDefault(); Clock.press('w'); });
$('clkB').addEventListener('pointerdown', e => { e.preventDefault(); Clock.press('b'); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && $('clockView').classList.contains('open') && $('clkPlay').style.display !== 'none') Clock.requestLock(); });
function confirmClock(msg) { return window.confirm(msg); }

// Test: does speech recognition work here (Safari vs. home-screen app)? Basis for dictating moves at the clock.
let vRec = null;
$('vTest').onclick = () => {
  const out = $('vOut');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mode = (window.navigator.standalone || matchMedia('(display-mode: standalone)').matches) ? 'Homescreen-App' : 'Browser';
  if (vRec) { try { vRec.stop(); } catch (e) { /* ignore */ } return; }
  if (!SR) { out.textContent = `✗ Spracherkennung ist hier nicht verfügbar (${mode}).`; return; }
  let rec;
  try { rec = new SR(); } catch (e) { out.textContent = `✗ Spracherkennung konnte nicht gestartet werden (${mode}): ${e.message}`; return; }
  rec.lang = 'de-DE'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 3;
  let heard = '', alts = [];
  rec.onstart = () => { out.textContent = `🎤 Hört zu … sag z. B. „Springer d4“ (${mode})`; $('vTest').textContent = 'Stopp'; };
  rec.onresult = e => {
    const r = e.results[e.results.length - 1];
    heard = r[0].transcript;
    if (r.isFinal) alts = [...r].map(a => a.transcript);
    out.textContent = `🎤 „${heard}“`;
  };
  rec.onerror = e => { out.textContent = `✗ Fehler: ${e.error}${e.error === 'not-allowed' ? ' – Mikrofon oder Spracherkennung nicht erlaubt' : e.error === 'service-not-allowed' ? ' – in dieser Umgebung gesperrt (evtl. nur in Safari möglich) oder Diktieren in den iPhone-Einstellungen aus' : ''} (${mode})`; };
  rec.onend = () => {
    vRec = null; $('vTest').textContent = '🎤 Spracheingabe testen';
    if (heard) out.textContent = `✓ Funktioniert (${mode})!\nErkannt: „${heard}“${alts.length > 1 ? `\nAlternativen: ${alts.slice(1).map(a => `„${a}“`).join(', ')}` : ''}`;
  };
  vRec = rec;
  try { rec.start(); } catch (e) { vRec = null; out.textContent = `✗ Start fehlgeschlagen (${mode}): ${e.message}`; }
};
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
// Hand a generated JSON file to the user: share sheet on iPhone, download elsewhere. Returns 'shared' | 'downloaded' | 'aborted'.
async function giveFile(name, json, title) {
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return 'shared'; }
  } catch (e) { if (e.name === 'AbortError') return 'aborted'; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'downloaded';
}
$('bBackup').onclick = async () => {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('sa_') && !k.startsWith('sa_cch_')) data[k] = localStorage.getItem(k); }
  const json = JSON.stringify({ app: 'schach-analyse', format: 1, created: new Date().toISOString(), data });
  const name = `zugzwang-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  const r = await giveFile(name, json, 'Zugzwang Sicherung');
  if (r === 'shared') showAdv('Sicherung erstellt. Lege die Datei z. B. in „Dateien“ oder iCloud ab.');
  else if (r === 'downloaded') showAdv('Sicherung heruntergeladen: ' + name);
};
// Calibration export: analysed games (with our engine data) + the recently played games list (PGNs),
// so the analysis can be compared with chess.com's Game Review offline (see CLAUDE.md, calibration).
$('bCalib').onclick = async () => {
  const analysed = storedGames().filter(g => g.ev).map(g => ({ pgn: g.pgn, strength: g.depth, ev: g.ev, st: g.st || null }));
  const recent = accGames.slice(0, 60).map(g => ({ src: g.src, t: g.t, tc: g.tc, op: g.op, res: g.res, pgn: g.pgn }));
  const json = JSON.stringify({ app: 'schach-analyse', kind: 'calibration', version: window.SA_VERSION || '', created: new Date().toISOString(),
    settings: { strength: S.strength }, me: [S.ccUser, S.liUser].filter(Boolean), analysed, recent });
  const r = await giveFile(`zugzwang-kalibrierung-${new Date().toISOString().slice(0, 10)}.json`, json, 'Zugzwang Kalibrierung');
  $('calibMsg').textContent = r === 'aborted' ? '' : `Exportiert: ${analysed.length} analysierte und ${recent.length} zuletzt gespielte Partien.`;
};
$('restoreIn').onchange = e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    let b;
    try { b = JSON.parse(r.result); } catch (err) { showAdv('Diese Datei ist keine gültige Sicherung.'); return; }
    if (!b || b.app !== 'schach-analyse' || !b.data || typeof b.data !== 'object') { showAdv('Diese Datei ist keine Sicherung von Zugzwang.'); return; }
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
  if (del) {
    e.stopPropagation();
    setGames(storedGames().filter(g => g.id !== del.dataset.del));
    renderGameList();
    renderAccList(); renderHomeExtras(); // „analysiert“-Markierung, Training und Trends sofort aktualisieren
    return;
  }
  const g = e.target.closest('.g');
  if (!g) return;
  const item = storedGames().find(x => x.id === g.dataset.id);
  if (item) { try { loadGame(C.parsePgn(item.pgn), item.pgn, item); } catch (err) { showErr(err.message); } }
};

// ---------- settings UI ----------
function renderSettings() {
  const tog = (k, label, sub) => `<div class="set"><label>${label}${sub ? `<small>${sub}</small>` : ''}</label><button class="toggle ${S[k] ? 'on' : ''}" data-tog="${k}"></button></div>`;
  const rng = (k, label, min, max, sub) => `<div class="set"><label>${label}: <span id="v_${k}">${S[k]}</span>${sub ? `<small>${sub}</small>` : ''}</label><input type="range" min="${min}" max="${max}" value="${S[k]}" data-rng="${k}"></div>`;
  const PK = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];
  const nCustom = PK.filter(k => customPieces[k]).length;
  const sw = (k, l, d, name, extra = '') => `<button class="sw${S.theme === k ? ' on' : ''}" data-theme="${k}" title="${name}"><span class="swb"${extra}>${[l, d, d, l].map(c => `<i style="background:${c}"></i>`).join('')}</span><span>${name}</span></button>`;
  const setTile = k => {
    const prev = S.pieces; S.pieces = k; const a = pieceUrl('N'), b = pieceUrl('k'); S.pieces = prev;
    return `<button class="pset${S.pieces === k ? ' on' : ''}" data-pieces="${k}"><span class="psimg"><i style="background-image:url('${a}')"></i><i style="background-image:url('${b}')"></i></span><span>${PIECE_SETS[k]}</span></button>`;
  };
  const img = LS.get('sa_board_img', null);
  $('setList').innerHTML =
    `<div class="set"><label>Analyse-Stärke<small>Schnell ≈ 0,25 s, Standard ≈ 0,6 s, Gründlich ≈ 1,5 s pro Stellung</small></label><select data-sel="strength">${Object.entries(STRENGTH).map(([k, v]) => `<option value="${k}" ${S.strength === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>` +
    rng('liveDepth', 'Tiefe für eigene Varianten', 10, 24, 'Nur wenn du selbst Züge auf dem Brett ausprobierst') +
    rng('lines', 'Engine-Linien', 1, 3) +
    `<h4 class="seth">Aussehen</h4>` +
    `<div class="setblk"><label>Brett</label><div class="swgrid">${Object.entries(THEMES).map(([k, v]) => sw(k, v[0], v[1], v[2])).join('')}` +
      sw('custom', S.boardLight, S.boardDark, 'Eigene Farben') +
      `<button class="sw${S.theme === 'image' ? ' on' : ''}" data-theme="image"><span class="swb img"${img ? ` style="background-image:url('${img}')"` : ''}>${img ? '' : '<b>+</b>'}</span><span>Eigenes Bild</span></button></div>` +
      (S.theme === 'custom' ? `<div class="setrow"><label>Hell <input type="color" data-col="boardLight" value="${S.boardLight}"></label><label>Dunkel <input type="color" data-col="boardDark" value="${S.boardDark}"></label></div>` : '') +
      (S.theme === 'image' ? `<div class="setrow"><label class="iconbtn">${img ? 'Anderes Bild wählen' : 'Bild wählen'}<input type="file" accept="image/*" data-boardimg hidden></label><small>Ein Foto oder Bild eines Bretts (wird quadratisch zugeschnitten)</small></div>` : '') +
    `<div class="hint" id="setHint"></div></div>` +
    (S.theme === 'image' ? '' : `<div class="set"><label>Muster</label><select data-sel="pattern">${Object.entries(PATTERNS).map(([k, v]) => `<option value="${k}" ${S.pattern === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`) +
    `<div class="setblk"><label>Figuren</label><div class="psgrid">${Object.keys(PIECE_SETS).map(setTile).join('')}</div>` +
      (S.pieces === 'custom' ? `<div class="setrow"><label class="iconbtn">Bilder wählen<input type="file" accept="image/*,.svg" multiple data-piecefiles hidden></label><small>${nCustom}/12 geladen. Dateinamen wie wK, wQ … bP (oder „white-king“, „black-pawn“), SVG oder PNG.</small></div><div class="hint" id="pcHint"></div>` : '') +
    `</div>` +
    `<h4 class="seth">Ton</h4>` +
    tog('sound', 'Ton', 'Zug- und Schlaggeräusche') +
    `<div class="set"><label>Klang<small>Eingebaute Klänge sind selbst erzeugt</small></label><select data-sel="soundSet">${Object.entries(SOUND_SETS).map(([k, v]) => `<option value="${k}" ${S.soundSet === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>` +
    (S.soundSet === 'custom' ? ['move', 'capture'].map(k => `<div class="set"><label>${k === 'move' ? 'Zug-Ton' : 'Schlag-Ton'}<small>${LS.get('sa_snd_' + k, null) ? '✓ geladen' : 'noch keine Datei'}</small></label><label class="iconbtn">Datei wählen<input type="file" accept="audio/*,.mp3,.ogg,.wav,.m4a" data-sndfile="${k}" hidden></label></div>`).join('') : '') +
    `<div class="hint" id="sndHint"></div>` +
    `<h4 class="seth">Brett & Anzeige</h4>` +
    tog('anim', 'Animationen', 'Figuren gleiten beim Durchklicken') +
    tog('arrow', 'Pfeil für besten Zug') +
    tog('evalbar', 'Bewertungsleiste') +
    tog('badges', 'Bewertungssymbole auf dem Brett') +
    tog('coords', 'Koordinaten');
}
$('setList').addEventListener('click', e => {
  const th = e.target.closest('[data-theme]');
  if (th) { S.theme = th.dataset.theme; saveSettings(); renderSettings(); renderAll(); return; }
  const ps = e.target.closest('[data-pieces]');
  if (ps) { S.pieces = ps.dataset.pieces; saveSettings(); preloadPieces(); renderSettings(); renderAll(); return; }
  const t = e.target.closest('[data-tog]');
  if (!t) return;
  S[t.dataset.tog] = !S[t.dataset.tog]; saveSettings();
  t.classList.toggle('on', S[t.dataset.tog]);
  liveCache.clear(); renderAll();
});
$('setList').addEventListener('input', e => {
  const col = e.target.closest('[data-col]');
  if (col) { S[col.dataset.col] = col.value; saveSettings(); renderBoard(); return; }
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
  const bi = e.target.closest('[data-boardimg]');
  if (bi && bi.files[0]) { loadBoardImage(bi.files[0]); return; }
  const pf = e.target.closest('[data-piecefiles]');
  if (pf && pf.files.length) { loadPieceFiles([...pf.files]); return; }
  const s = e.target.closest('[data-sel]');
  if (s) {
    S[s.dataset.sel] = s.value; saveSettings();
    if (s.dataset.sel === 'soundSet') {
      Sound.bufs = null; renderSettings();
      Sound.unlock();
      (async () => { if (Sound.building) await Sound.building; const was = S.sound; S.sound = true; Sound.play('move'); setTimeout(() => { Sound.play('capture'); S.sound = was; }, 350); })();
    } else renderSettings();
    renderAll();
  }
  if (e.target.closest('[data-rng]')) { liveCache.clear(); if (game) renderBoardAndInfo(); }
});
// own board image: cropped to a square and stored as JPEG in localStorage
function loadImageFile(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { res(im); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    im.onerror = () => rej(new Error('Bild konnte nicht gelesen werden.'));
    im.src = url;
  });
}
async function loadBoardImage(file) {
  try {
    const im = await loadImageFile(file), n = 720, s = Math.min(im.width, im.height);
    const cv = document.createElement('canvas'); cv.width = cv.height = n;
    cv.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, n, n);
    if (!LS.set('sa_board_img', cv.toDataURL('image/jpeg', 0.85))) throw new Error('Speichern fehlgeschlagen (zu wenig Speicher).');
    S.theme = 'image'; saveSettings(); renderSettings(); renderAll();
  } catch (err) { const h = $('setHint'); if (h) h.textContent = err.message; }
}
// own piece set: file names decide which piece it is (wK.svg, black-knight.png, …)
function pieceKeyFromName(name) {
  const n = name.toLowerCase().replace(/\.[a-z0-9]+$/, '');
  let m = /^([wb])[-_ ]?([kqrbnp])$/.exec(n);
  if (m) return m[1] + m[2].toUpperCase();
  const col = /white|weiss|weiß|^w[-_ ]/.test(n) ? 'w' : /black|schwarz|^b[-_ ]/.test(n) ? 'b' : null;
  const words = { king: 'K', koenig: 'K', könig: 'K', queen: 'Q', dame: 'Q', rook: 'R', turm: 'R', bishop: 'B', laeufer: 'B', läufer: 'B', knight: 'N', springer: 'N', pawn: 'P', bauer: 'P' };
  const w = Object.keys(words).find(k => n.includes(k));
  return col && w ? col + words[w] : null;
}
async function loadPieceFiles(files) {
  const hint = $('pcHint'), next = Object.assign({}, customPieces), skipped = [];
  for (const f of files) {
    const key = pieceKeyFromName(f.name);
    if (!key) { skipped.push(f.name); continue; }
    try {
      if (/svg/.test(f.type) || /\.svg$/i.test(f.name)) {
        if (f.size > 150000) { skipped.push(f.name); continue; }
        next[key] = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
      } else {
        const im = await loadImageFile(f), cv = document.createElement('canvas'); cv.width = cv.height = 160;
        const sc = Math.min(160 / im.width, 160 / im.height), w = im.width * sc, h = im.height * sc;
        cv.getContext('2d').drawImage(im, (160 - w) / 2, (160 - h) / 2, w, h);
        next[key] = cv.toDataURL('image/png');
      }
    } catch (e) { skipped.push(f.name); }
  }
  if (!LS.set('sa_pieces_custom', next)) { if (hint) hint.textContent = 'Speichern fehlgeschlagen (zu wenig Speicher).'; return; }
  customPieces = next;
  renderSettings(); renderAll();
  const h2 = $('pcHint');
  if (h2 && skipped.length) h2.textContent = `Nicht erkannt: ${skipped.join(', ')}`;
}
$('bCancelAna').onclick = () => { analysisToken++; cancelAll('full'); analyzing = false; showOverlay(false); renderAll(); };

// ---------- review overview (shown after the analysis) ----------
// Rough playing-strength estimate from one game's accuracy (own heuristic, not chess.com's formula).
// Playing-strength estimate from one game's accuracy, fitted to chess.com's "Game Rating" on the user's games (~700 Elo).
function estRating(acc, nMoves) {
  if (acc == null || nMoves < 8) return null;
  return Math.max(100, Math.min(3000, Math.round((-364 + 0.2 * acc * acc) / 50) * 50));
}
let rvOpenCat = null;
const REVIEW_ROWS = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
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
  const row = t => rowHtml(t) + (rvOpenCat === t ? `<div class="rvdef">${esc(A.CLASSES[t].desc || '')}</div>` : '');
  const rowHtml = t => {
    const cw = wl.filter(c => c.type === t).length, cb = bl.filter(c => c.type === t).length, col = A.CLASSES[t].color;
    return `<div class="rvrow rvcat${rvOpenCat === t ? ' open' : ''}" data-cat="${t}"><span class="rvl">${A.CLASSES[t].label}</span><span class="rvc" style="color:${cw ? col : '#666'}">${cw}</span>${badge(t)}<span class="rvc" style="color:${cb ? col : '#666'}">${cb}</span></div>`;
  };
  const opn = openingName();
  const resText = resultText(h, positions[positions.length - 1]);
  el.innerHTML = `
    <div class="card rv">
      <div class="rvhead">${esc(resText)}${opn ? `<br><span>${esc(opn)}</span>` : ''}</div>
      <div class="rvrow rvtop"><span class="rvl">Spieler</span>${nameCell(h.White, 'w', winW)}${nameCell(h.Black, 'b', winB)}</div>
      <div class="rvrow"><span class="rvl">Genauigkeit</span><span class="rvbox w">${aw == null ? '–' : aw.toFixed(1)}</span><span class="rvbox b">${ab == null ? '–' : ab.toFixed(1)}</span></div>
      <svg class="graph rvgraph" id="rvGraph" viewBox="0 0 400 80" preserveAspectRatio="none">${graphSvg(400, 80, false)}</svg>
      <div class="rvsep"></div>
      ${REVIEW_ROWS.map(row).join('')}
      <div class="rvhint">Tippe auf eine Bewertung für eine Erklärung.</div>
      <div class="rvsep"></div>
      <div class="rvrow"><span class="rvl">Spielstärke</span><span class="rvbox w">${rw == null ? '–' : rw}</span><span class="rvbox b">${rb == null ? '–' : rb}</span></div>
    </div>
    <div class="card rv"><h3>Züge</h3><div class="moves rvmoves" id="rvMoves">${movesGridHtml(-1)}</div></div>
    <div class="rvfoot"><button class="primary rvstart" id="rvStart">Partieanalyse starten</button></div>`;
}
$('viewReview').addEventListener('click', e => {
  if (e.target.closest('#rvStart')) { goto(0, false); showView('board'); return; }
  const cat = e.target.closest('[data-cat]');
  if (cat) { rvOpenCat = rvOpenCat === cat.dataset.cat ? null : cat.dataset.cat; renderReview(); return; }
  const k = e.target.closest('[data-ply]');
  if (k) { showView('board'); goto(+k.dataset.ply, false); return; }
  const g = e.target.closest('#rvGraph');
  if (g) { const r = g.getBoundingClientRect(); showView('board'); goto(Math.round((e.clientX - r.left) / r.width * (positions.length - 1)), false); }
});
$('btnReview').onclick = () => showView('review');

// ---------- start screen extras: ratings, filters, balance, trends, openings, training ----------
const TCL = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Schnellschach', classical: 'Klassisch', daily: 'Täglich', correspondence: 'Fernschach', ultraBullet: 'UltraBullet' };
const tcGroup = tc => (['daily', 'classical', 'correspondence'].includes(tc) ? 'long' : tc === 'ultraBullet' ? 'bullet' : tc);
const TC_GROUPS = [['bullet', 'Bullet'], ['blitz', 'Blitz'], ['rapid', 'Schnell'], ['long', 'Lang']];
const srcKey = g => (g.src === 'Lichess' ? 'li' : 'cc');
function passFilter(g) {
  if (S.fTc && S.fTc !== 'all' && tcGroup(g.tc) !== S.fTc) return false;
  if (S.fSrc && S.fSrc !== 'all' && srcKey(g) !== S.fSrc) return false;
  return true;
}
function renderFilters() {
  const el = $('filterChips');
  const present = new Set(accGames.map(g => tcGroup(g.tc)));
  if (accGames.length < 2) { el.innerHTML = ''; return; }
  const chip = (kind, val, label) => `<button class="chip${(S[kind] || 'all') === val ? ' on' : ''}" data-f="${kind}" data-v="${val}">${label}</button>`;
  let h = chip('fTc', 'all', 'Alle') + TC_GROUPS.filter(([k]) => present.has(k)).map(([k, l]) => chip('fTc', k, l)).join('');
  if (S.ccUser && S.liUser) h += '<span class="chipsep"></span>' + chip('fSrc', 'all', 'Beide') + chip('fSrc', 'cc', 'chess.com') + chip('fSrc', 'li', 'Lichess');
  el.innerHTML = h;
}
$('filterChips').onclick = e => {
  const b = e.target.closest('[data-f]');
  if (!b) return;
  S[b.dataset.f] = b.dataset.v; saveSettings(); listLimit = 10; renderAccList();
};
function renderBilanz() {
  const el = $('bilanz');
  const list = accGames.filter(passFilter);
  if (!list.length) { el.innerHTML = ''; return; }
  const sc = l => { const w = l.filter(g => g.res === 'w').length, d = l.filter(g => g.res === 'd').length; return `<b class="cw">${w} S</b> · <b class="cd">${d} R</b> · <b class="cl">${l.length - w - d} N</b>`; };
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const today = list.filter(g => g.t >= day.getTime());
  const parts = [];
  if (today.length) parts.push(`Heute: ${today.length} ${today.length === 1 ? 'Partie' : 'Partien'} · ${sc(today)}`);
  const last = list.slice(0, 10);
  parts.push(`Letzte ${last.length}: ${sc(last)}`);
  let n = 0; while (n < list.length && list[n].res === list[0].res) n++;
  if (n >= 2 && list[0].res !== 'd') parts.push(`Serie: ${n} ${list[0].res === 'w' ? 'Siege' : 'Niederlagen'} in Folge ${list[0].res === 'w' ? '🔥' : ''}`);
  el.innerHTML = parts.map(p => `<div>${p}</div>`).join('');
}

// Opening families: Lichess-style family names from the opening database; chess.com URLs are matched against them.
const FAMILIES = (() => {
  const set = new Set(OPENINGS.names.map(n => n.slice(4).split(':')[0].trim()));
  return [...set].map(n => [n.toLowerCase().replace(/[^a-z]/g, ''), n]).sort((x, y) => y[0].length - x[0].length);
})();
function openingFamily(s) {
  if (!s) return '';
  if (/^https?:/.test(s)) {
    const slug = decodeURIComponent(s.split('/openings/')[1] || '').split('...')[0];
    if (!slug) return '';
    const norm = slug.toLowerCase().replace(/[^a-z]/g, '');
    const hit = FAMILIES.find(([k]) => k && norm.startsWith(k));
    return hit ? hit[1] : slug.split('-').slice(0, 3).join(' ');
  }
  return s.split(':')[0].trim();
}
let openColor = 'w';
function renderOpenings() {
  const el = $('openCard');
  const list = accGames.filter(g => g.open && passFilter(g));
  if (list.length < 3) { el.style.display = 'none'; return; }
  el.style.display = '';
  const mine = list.filter(g => (openColor === 'w') === !!g.white);
  const by = new Map();
  for (const g of mine) { const o = by.get(g.open) || { n: 0, s: 0 }; o.n++; o.s += g.res === 'w' ? 1 : g.res === 'd' ? 0.5 : 0; by.set(g.open, o); }
  const top = [...by.entries()].sort((x, y) => y[1].n - x[1].n).slice(0, 5);
  el.innerHTML = `<div class="cardhead"><h3>Deine Eröffnungen</h3><div class="seg"><button data-oc="w" class="${openColor === 'w' ? 'on' : ''}">Weiß</button><button data-oc="b" class="${openColor === 'b' ? 'on' : ''}">Schwarz</button></div></div>` +
    (top.length ? top.map(([name, o]) => { const p = Math.round(o.s / o.n * 100); return `<div class="orow"><span class="on">${esc(name)}</span><span class="oc">${o.n}×</span><span class="obar"><i style="width:${p}%;background:${p >= 55 ? '#81b64c' : p >= 45 ? '#c9b458' : '#e06a5a'}"></i></span><span class="op">${p}%</span></div>`; }).join('') + `<div class="hint" style="margin:8px 0 0">Aus ${list.length} geladenen Partien · Prozent = erzielte Punkte</div>`
      : `<div class="hint">Keine Partien mit ${openColor === 'w' ? 'Weiß' : 'Schwarz'} geladen.</div>`);
}
$('openCard').onclick = e => { const b = e.target.closest('[data-oc]'); if (b) { openColor = b.dataset.oc; renderOpenings(); } };

// Accuracy trend over analysed games (own colour only)
function gameTime(g) {
  const h = g.h || {};
  const d = (h.UTCDate || h.Date || '').replace(/\./g, '-'), tm = h.UTCTime || h.EndTime || '00:00:00';
  const t = Date.parse(d + 'T' + tm + 'Z');
  return isNaN(t) ? g.date || 0 : t;
}
function renderTrend() {
  const el = $('trendCard');
  const pts = storedGames().filter(g => g.st && g.st.me && (g.st.me === 'w' ? g.st.aw : g.st.ab) != null)
    .map(g => ({ t: gameTime(g), a: g.st.me === 'w' ? g.st.aw : g.st.ab })).sort((x, y) => x.t - y.t).slice(-20);
  if (pts.length < 2) { el.style.display = 'none'; return; }
  el.style.display = '';
  const W = 300, H = 70, n = pts.length;
  const lo = Math.max(0, Math.min(...pts.map(p => p.a)) - 5), hi = Math.min(100, Math.max(...pts.map(p => p.a)) + 5);
  const xy = pts.map((p, i) => [i / (n - 1) * (W - 8) + 4, H - 6 - (p.a - lo) / (hi - lo || 1) * (H - 12)]);
  const avg = pts.reduce((s, p) => s + p.a, 0) / n;
  const l5 = pts.slice(-5), p5 = pts.slice(-10, -5);
  const m = l => l.reduce((s, p) => s + p.a, 0) / l.length;
  const diff = p5.length ? m(l5) - m(p5) : null;
  el.innerHTML = `<div class="cardhead"><h3>Deine Genauigkeit</h3><span class="tstat">Ø ${avg.toFixed(1)}${diff != null ? ` · <b style="color:${diff >= 0 ? '#81b64c' : '#e06a5a'}">${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff).toFixed(1)}</b>` : ''}</span></div>
    <svg viewBox="0 0 ${W} ${H}" class="spark" preserveAspectRatio="none"><polyline points="${xy.map(p => p.join(',')).join(' ')}" fill="none" stroke="#81b64c" stroke-width="2" vector-effect="non-scaling-stroke"/>${xy.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="#81b64c"/>`).join('')}</svg>
    <div class="hint" style="margin:6px 0 0">Letzte ${n} analysierte Partien${diff != null ? ' · Pfeil: letzte 5 im Vergleich zu den 5 davor' : ''}</div>`;
}
// Fill in stats for analyses saved before stats existed (one game per tick, in the background).
function enrichStored() {
  const list = storedGames();
  const g = list.find(x => x.ev && (!x.st || x.st.v !== 6)); // v6 = book moves count 100 in accuracy; v5 = calibrated model + filtered multi-move training tasks with engine-checked answers
  if (!g) return;
  try {
    const pg = C.parsePgn(g.pgn);
    const pos = [pg.startFen, ...pg.moves.map(m => m.fenAfter)];
    const ev = unslim(g.ev);
    if (ev.length === pos.length) g.st = gameStats(pg, pos, ev, classifyGame(pg, pos, ev));
    else g.st = { v: 6, me: null, tr: [] };
  } catch (e) { g.st = { v: 6, me: null, tr: [] }; }
  setGames(list);
  renderHomeExtras();
  setTimeout(enrichStored, 50);
}

// Ratings (current values) from the official APIs
let ratings = LS.get('sa_ratings', null), lastRatings = 0;
async function fetchRatings() {
  if (!S.ccUser && !S.liUser) { ratings = null; renderTiles(); return; }
  lastRatings = Date.now();
  const list = [];
  const jobs = [];
  if (S.ccUser) jobs.push(getJson(`https://api.chess.com/pub/player/${encodeURIComponent(S.ccUser.toLowerCase())}/stats`).then(st => {
    for (const [k, tc] of [['chess_bullet', 'bullet'], ['chess_blitz', 'blitz'], ['chess_rapid', 'rapid'], ['chess_daily', 'daily']]) {
      const s = st[k];
      if (s && s.last) list.push({ src: 'cc', tc, rating: s.last.rating, best: s.best ? s.best.rating : null, rec: s.record || null });
    }
  }));
  if (S.liUser) jobs.push(getJson(`https://lichess.org/api/user/${encodeURIComponent(S.liUser)}`).then(u => {
    for (const tc of ['bullet', 'blitz', 'rapid', 'classical', 'correspondence']) {
      const p = u.perfs && u.perfs[tc];
      if (p && p.games > 0) list.push({ src: 'li', tc, rating: p.rating, prog: p.prog || 0, prov: !!p.prov, games: p.games });
    }
  }));
  await Promise.allSettled(jobs);
  if (list.length) { ratings = { t: Date.now(), list }; LS.set('sa_ratings', ratings); }
  renderTiles();
}
function tileChange(r) {
  const gl = accGames.filter(g => srcKey(g) === r.src && g.tc === r.tc && g.myElo != null);
  if (gl.length >= 2) { const k = Math.min(10, gl.length - 1); return gl[0].myElo - gl[k].myElo; }
  return r.src === 'li' ? r.prog : null;
}
function renderTiles() {
  const el = $('ratingTiles');
  const names = { cc: S.ccUser, li: S.liUser };
  const list = ratings && ratings.list ? ratings.list.filter(r => names[r.src]) : [];
  if (!list.length) { el.innerHTML = ''; return; }
  el.innerHTML = list.map(r => {
    const ch = tileChange(r);
    return `<button class="tile" data-rsrc="${r.src}" data-rtc="${r.tc}"><span class="srcchip ${r.src}">${r.src === 'li' ? 'Lichess' : 'chess.com'}</span><span class="tl">${TCL[r.tc] || r.tc}</span><span class="tr">${r.rating}${r.prov ? '?' : ''}</span>${ch ? `<span class="td ${ch > 0 ? 'up' : 'dn'}">${ch > 0 ? '▲' : '▼'} ${Math.abs(ch)}</span>` : '<span class="td">&nbsp;</span>'}</button>`;
  }).join('');
}
$('ratingTiles').onclick = e => { const t = e.target.closest('.tile'); if (t) openRating(t.dataset.rsrc, t.dataset.rtc); };

// Rating history (last 12 months), cached: finished chess.com months in localStorage, the rest in memory
const histMem = {};
const ym = d => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
async function ccHistory(onP) {
  const u = S.ccUser.toLowerCase();
  if (histMem['cc:' + u]) return histMem['cc:' + u];
  const arch = await getJson(`https://api.chess.com/pub/player/${encodeURIComponent(u)}/games/archives`);
  const since = new Date(); since.setMonth(since.getMonth() - 12); since.setDate(1);
  const cur = ym(new Date());
  const months = (arch.archives || []).filter(url => url.slice(-7) >= ym(since));
  const out = [];
  let done = 0, i = 0;
  const worker = async () => {
    while (i < months.length) {
      const url = months[i++], key = url.slice(-7), ck = `sa_cch_${u}_${key.replace('/', '-')}`;
      let items = key !== cur ? LS.get(ck, null) : null;
      if (!items) {
        const d = await getJson(url);
        items = (d.games || []).filter(g => !g.rules || g.rules === 'chess').map(g => {
          const w = (g.white.username || '').toLowerCase() === u, me = w ? g.white : g.black, op = w ? g.black : g.white;
          return [(g.end_time || 0) * 1000, g.time_class, me.rating, op.rating, me.result === 'win' ? 'w' : CC_DRAW.includes(me.result) ? 'd' : 'l', w ? 1 : 0];
        });
        if (key !== cur) LS.set(ck, items);
      }
      out.push(...items);
      onP && onP(++done, months.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const res = out.map(x => ({ t: x[0], tc: x[1], me: x[2], op: x[3], r: x[4], w: x[5] })).sort((x, y) => x.t - y.t);
  histMem['cc:' + u] = res;
  return res;
}
async function liHistory(tc) {
  const key = 'li:' + S.liUser.toLowerCase() + ':' + tc;
  if (histMem[key]) return histMem[key];
  const since = Date.now() - 365 * 86400000;
  const r = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(S.liUser)}?since=${since}&perfType=${tc}&moves=false&pgnInJson=false&max=3000`, { headers: { Accept: 'application/x-ndjson' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const u = S.liUser.toLowerCase();
  const res = (await r.text()).split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(g => g.rated !== false).map(g => {
    const w = ((g.players.white.user && g.players.white.user.name) || '').toLowerCase() === u;
    const me = w ? g.players.white : g.players.black, op = w ? g.players.black : g.players.white;
    return { t: g.lastMoveAt || g.createdAt, tc, me: me.rating != null ? me.rating + (me.ratingDiff || 0) : null, op: op.rating, r: !g.winner ? 'd' : g.winner === (w ? 'white' : 'black') ? 'w' : 'l', w: w ? 1 : 0 };
  }).filter(x => x.me != null).sort((x, y) => x.t - y.t);
  histMem[key] = res;
  return res;
}
let rState = null; // {src, tc, range, data}
async function openRating(src, tc) {
  rState = { src, tc, range: LS.get('sa_rrange', 90), data: null, err: '' };
  renderRating(); openModal('mRating');
  try {
    rState.data = src === 'cc'
      ? (await ccHistory((d, n) => { if (rState && !rState.data) { $('rLoad').textContent = `Lade Verlauf … ${d}/${n} Monate`; } })).filter(g => g.tc === tc)
      : await liHistory(tc);
  } catch (e) { rState.err = 'Verlauf konnte nicht geladen werden (' + (e.name === 'TypeError' ? 'keine Verbindung' : e.message) + ').'; }
  renderRating();
}
function fmtD(t, y) { return new Date(t).toLocaleDateString('de-DE', y ? { day: '2-digit', month: '2-digit', year: '2-digit' } : { day: '2-digit', month: '2-digit' }); }
function renderRating() {
  if (!rState) return;
  const r = (ratings && ratings.list || []).find(x => x.src === rState.src && x.tc === rState.tc) || {};
  const el = $('ratingSheet');
  const head = `<h2><span><span class="srcchip ${rState.src}">${rState.src === 'li' ? 'Lichess' : 'chess.com'}</span> ${TCL[rState.tc] || rState.tc}</span><button class="iconbtn" data-close>✕</button></h2>
    <div class="rbig">${r.rating || '–'}</div>
    <div class="seg rng">${[[30, '1 Monat'], [90, '3 Monate'], [365, '1 Jahr']].map(([d, l]) => `<button data-rg="${d}" class="${rState.range === d ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  if (rState.err) { el.innerHTML = head + `<div class="err" style="display:block">${esc(rState.err)}</div>`; return; }
  if (!rState.data) { el.innerHTML = head + `<div class="hint" id="rLoad">Lade Verlauf …</div>`; return; }
  const from = Date.now() - rState.range * 86400000;
  const all = rState.data;
  const pts = all.filter(g => g.t >= from && g.me != null);
  if (pts.length < 1) { el.innerHTML = head + '<div class="hint">In diesem Zeitraum keine Partien.</div>'; return; }
  const before = all.filter(g => g.t < from && g.me != null).pop();
  const startR = before ? before.me : pts[0].me;
  const nowR = pts[pts.length - 1].me;
  const W = 340, H = 150, padL = 34;
  const lo = Math.min(...pts.map(p => p.me), startR), hi = Math.max(...pts.map(p => p.me), startR);
  const span = Math.max(20, hi - lo), y0 = lo - span * 0.1, y1 = hi + span * 0.1;
  const X = t => padL + (t - from) / (Date.now() - from) * (W - padL - 4);
  const Y = v => H - 16 - (v - y0) / (y1 - y0) * (H - 24);
  const line = [[from, startR], ...pts.map(p => [p.t, p.me])];
  const path = line.map(([t, v], i) => (i ? 'L' : 'M') + X(t).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ');
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="rchart" id="rChart">
    ${ticks.map(v => `<line x1="${padL}" x2="${W}" y1="${Y(v)}" y2="${Y(v)}" stroke="#3a3733"/><text x="${padL - 4}" y="${Y(v) + 3}" text-anchor="end" fill="#999" font-size="10">${v}</text>`).join('')}
    <path d="${path} L${X(Date.now())},${Y(nowR)} L${X(Date.now())},${H - 16} L${padL},${H - 16} Z" fill="rgba(129,182,76,.15)"/>
    <path d="${path} L${X(Date.now())},${Y(nowR)}" fill="none" stroke="#81b64c" stroke-width="2"/>
    <text x="${padL}" y="${H - 3}" fill="#999" font-size="10">${fmtD(from, rState.range > 90)}</text><text x="${W}" y="${H - 3}" fill="#999" font-size="10" text-anchor="end">heute</text>
    <line id="rCur" x1="0" x2="0" y1="0" y2="${H - 16}" stroke="#fff" stroke-width="1" opacity="0"/></svg><div class="rtip" id="rTip">&nbsp;</div>`;
  // insights
  const w = pts.filter(g => g.r === 'w').length, d = pts.filter(g => g.r === 'd').length, l = pts.length - w - d;
  const ch = nowR - startR;
  const hiP = pts.reduce((m, p) => (p.me > m.me ? p : m)), loP = pts.reduce((m, p) => (p.me < m.me ? p : m));
  const wins = pts.filter(g => g.r === 'w' && g.op);
  const bestWin = wins.length ? wins.reduce((m, p) => (p.op > m.op ? p : m)) : null;
  let streak = 0, cur = 0; for (const p of pts) { cur = p.r === 'w' ? cur + 1 : 0; streak = Math.max(streak, cur); }
  const avgOp = Math.round(pts.filter(p => p.op).reduce((s, p) => s + p.op, 0) / (pts.filter(p => p.op).length || 1));
  const rate = (arr) => arr.length ? Math.round(arr.reduce((s, p) => s + (p.r === 'w' ? 1 : p.r === 'd' ? 0.5 : 0), 0) / arr.length * 100) + '%' : '–';
  const wW = pts.filter(p => p.w), wB = pts.filter(p => !p.w);
  const ins = [
    ['Veränderung', `<b style="color:${ch >= 0 ? '#81b64c' : '#e06a5a'}">${ch >= 0 ? '+' : ''}${ch}</b>`],
    ['Partien', pts.length],
    ['Bilanz', `<span class="cw">${w}</span> / <span class="cd">${d}</span> / <span class="cl">${l}</span>`],
    ['Punkte-Quote', rate(pts)],
    ['Höchstwert', `${hiP.me} <small>${fmtD(hiP.t)}</small>`],
    ['Tiefstwert', `${loP.me} <small>${fmtD(loP.t)}</small>`],
    ['Bester Sieg', bestWin ? `${bestWin.op} <small>${fmtD(bestWin.t)}</small>` : '–'],
    ['Längste Siegesserie', streak],
    ['Ø Gegner', avgOp || '–'],
    ['Quote Weiß / Schwarz', `${rate(wW)} / ${rate(wB)}`],
  ];
  if (r.best) ins.push(['Bestwert (insgesamt)', r.best]);
  el.innerHTML = head + svg + `<div class="ins">${ins.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
  const chart = $('rChart');
  const show = ev => {
    const b = chart.getBoundingClientRect();
    const x = (ev.clientX - b.left) / b.width * W;
    let best = pts[0]; for (const p of pts) if (Math.abs(X(p.t) - x) < Math.abs(X(best.t) - x)) best = p;
    const c = $('rCur'); c.setAttribute('x1', X(best.t)); c.setAttribute('x2', X(best.t)); c.setAttribute('opacity', '.5');
    $('rTip').innerHTML = `<b>${best.me}</b> · ${fmtD(best.t, true)} · ${best.r === 'w' ? 'Sieg' : best.r === 'd' ? 'Remis' : 'Niederlage'}${best.op ? ` gegen ${best.op}` : ''}`;
  };
  chart.addEventListener('pointerdown', show); chart.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') show(e); });
}
$('ratingSheet').addEventListener('click', e => { const b = e.target.closest('[data-rg]'); if (b && rState) { rState.range = +b.dataset.rg; LS.set('sa_rrange', rState.range); renderRating(); } });

// ---------- training: learn from own mistakes ----------
let trainTasks = [], trainIdx = 0, trainArrow = null, trainSt = null;
const trainProg = () => LS.get('sa_train', {});
function buildTasks(includeSolved = false) {
  const prog = trainProg();
  const all = [];
  for (const g of storedGames()) {
    if (!g.st || !g.st.tr || !g.st.me) continue;
    const h = g.h || {};
    for (const t of g.st.tr) all.push(Object.assign({ id: g.id + ':' + t.ply, color: g.st.me, h, gt: gameTime(g) }, t));
  }
  if (includeSolved) return all;
  return all.filter(t => !(prog[t.id] && prog[t.id].ok)); // solved tasks leave the list
}
function renderTrainHome() {
  const el = $('trainHome');
  const tasks = buildTasks();
  const analysed = storedGames().filter(g => g.st && g.st.me).length;
  if (!analysed) { el.style.display = 'none'; return; }
  el.style.display = '';
  const prog = trainProg();
  const solved = buildTasks(true).filter(t => prog[t.id] && prog[t.id].ok).length;
  el.innerHTML = `<div class="cardhead"><h3>Aus Fehlern lernen</h3></div>` + (tasks.length
    ? `<div class="trrow"><div><b>${tasks.length} ${tasks.length === 1 ? 'offene Aufgabe' : 'offene Aufgaben'}</b> aus deinen Fehlern<div class="sub">${solved} gelöst · aus ${analysed} analysierten Partien</div></div><button class="primary" id="bTrain">Starten</button></div>`
    : `<div class="hint" style="margin:0">Gerade keine offenen Aufgaben${solved ? ` – ${solved} gelöst` : ''}. Hier landen nur Fehler mit echtem Lerneffekt: verpasste Taktiken und Matts, eingestellte Figuren und übersehene Drohungen.</div>`);
}
$('trainHome').onclick = e => { if (e.target.closest('#bTrain')) startTraining(); };
function startTraining() {
  trainTasks = buildTasks();
  if (!trainTasks.length) return;
  openTask(0);
}
function openTask(i) {
  trainIdx = i;
  const t = trainTasks[i];
  Engine.cancel('live');
  const start = t.pre ? t.pre.fen : t.fen;
  game = { headers: { White: t.h.White, Black: t.h.Black, WhiteElo: t.h.WhiteElo, BlackElo: t.h.BlackElo }, startFen: start, moves: [], free: true, trainer: true };
  positions = [start]; evals = []; cls = []; variation = null; selected = null; ply = 0;
  liveLines = null;
  flipped = t.color === 'b';
  trainArrow = null;
  trainSt = { tries: 0, done: false, shown: false, msg: '', step: 0, tip: false, busy: !!t.pre };
  closeModals();
  showView('board');
  document.body.classList.add('training'); document.body.classList.remove('traindone');
  renderBoardAndInfo();
  renderTrainCard();
  // first show the opponent's move that led to the task position
  if (t.pre) setTimeout(() => {
    if (!game || !game.trainer || trainTasks[trainIdx] !== t) return;
    trainerApply(t.pre.uci);
    trainSt.busy = false;
    renderBoardAndInfo(); renderTrainCard();
  }, 450);
}
function renderTrainCard() {
  const t = trainTasks[trainIdx], el = $('trainCard');
  if (!t) return;
  const info = A.CLASSES[t.type];
  const opp = t.color === 'w' ? t.h.Black : t.h.White;
  const side = t.color === 'w' ? 'Weiß' : 'Schwarz';
  const nOwn = (taskLine(t).length + 1) >> 1;
  let status = '';
  if (trainSt.done) status = `<div class="tstat ok">✓ ${esc(trainSt.msg)}</div>${t.why ? `<div class="fbwhy">${esc(t.why)}</div>` : ''}`;
  else if (trainSt.msg) status = `<div class="tstat ${trainSt.good ? 'ok' : 'no'}">${esc(trainSt.msg)}</div>`;
  if (!trainSt.done && trainSt.tip && t.mo) status += `<div class="fbwhy">Tipp: ${esc(t.mo)}</div>`;
  el.classList.toggle('solved', !!trainSt.done && !trainSt.shown);
  el.classList.toggle('helped', !!trainSt.done && !!trainSt.shown);
  if (trainSt.done) {
    // clearly marked result: big banner instead of the task text
    const ok = !trainSt.shown;
    el.innerHTML = `<div class="meta"><span>Aufgabe ${trainIdx + 1} von ${trainTasks.length}</span><span>${t.gt ? timeAgo(t.gt) : ''}</span></div>
      <div class="tsolved"><div class="tsico">${ok ? '✓' : '!'}</div><div><div class="tst">${ok ? 'Aufgabe gelöst!' : 'Mit Lösungshilfe geschafft'}</div><div class="tss">${esc(ok ? trainSt.msg.replace(/^Richtig!\s*/, '') : 'Diese Aufgabe bleibt in deiner Liste, damit du sie später nochmal allein lösen kannst.')}</div></div></div>
      ${t.why ? `<div class="fbwhy">${esc(t.why)}</div>` : ''}
      <div class="row"><button class="primary" id="bTrNext">${trainIdx + 1 < trainTasks.length ? 'Nächste Aufgabe ›' : 'Fertig'}</button></div>`;
    return;
  }
  el.innerHTML = `<div class="meta"><span>Aufgabe ${trainIdx + 1} von ${trainTasks.length}${nOwn > 1 ? ` · Zug ${Math.min(Math.floor(trainSt.step / 2) + 1, nOwn)}/${nOwn}` : ''}</span><span>${t.gt ? timeAgo(t.gt) : ''}</span></div>
    <div class="fb">${badge(t.type)}<div><div class="t">${nOwn > 1 ? `Finde die beste Fortsetzung für ${side} (${nOwn} Züge)` : `Finde den besten Zug für ${side}`}</div><div class="s">Gegen ${esc(opp || '?')} hast du hier <b style="color:#fff">${esc(t.played)}</b> gespielt – ${info.label.toLowerCase() === 'verpasst' ? 'eine verpasste Chance' : info.label === 'Patzer' ? 'ein Patzer' : 'ein Fehler'}.</div></div></div>
    ${status}
    <div class="row">${trainSt.done ? '' : `${t.mo && !trainSt.tip ? '<button class="iconbtn" id="bTrTip">Tipp</button>' : ''}<button class="iconbtn" id="bTrHint">Lösung zeigen</button>`}<button class="${trainSt.done ? 'primary' : 'iconbtn'}" id="bTrNext">${trainIdx + 1 < trainTasks.length ? 'Nächste Aufgabe ›' : 'Fertig'}</button></div>`;
}
$('trainCard').onclick = e => {
  if (e.target.closest('#bTrNext')) {
    if (trainIdx + 1 < trainTasks.length) openTask(trainIdx + 1); else showView('home');
    return;
  }
  if (e.target.closest('#bTrTip')) { trainSt.tip = true; renderTrainCard(); return; }
  if (e.target.closest('#bTrHint')) {
    const t = trainTasks[trainIdx];
    if (trainSt.busy) return;
    trainSt.shown = true; trainArrow = taskLine(t)[trainSt.step] || t.best;
    trainSt.msg = 'Der blaue Pfeil zeigt den besten Zug – spiel ihn nach.'; trainSt.good = false;
    renderArrows(); renderTrainCard();
  }
};
function trainerApply(u) {
  const fen = curFen(), p = C.parseFen(fen), m = C.findMove(p, u);
  if (!m) return;
  const s = C.san(p, m);
  animMove({ from: m.from, to: m.to, san: s });
  const np = C.make(p, m);
  Sound.forMove({ san: s }, C.toFen(np));
  const mv = { san: s, uci: u, from: m.from, to: m.to, piece: m.piece, captured: m.captured, promo: m.promo || null, fenBefore: fen, fenAfter: C.toFen(np) };
  game.moves.push(mv);
  positions.push(C.toFen(np)); ply = positions.length - 1;
  return mv;
}
const taskLine = t => (t.line && t.line.length ? t.line : [t.best]);
function trainerMove(m) {
  const t = trainTasks[trainIdx];
  if (!t || trainSt.done || trainSt.busy) return;
  // moves only from the current task position; while browsing back, a move attempt jumps back to it
  if (ply !== positions.length - 1) { goto(positions.length - 1); return; }
  const u = C.uci(m), line = taskLine(t), step = trainSt.step;
  const p = C.parseFen(curFen()), san = C.san(p, m);
  const mates = C.status(C.make(p, m)) === 'mate';
  const isAlt = step === 0 && t.alt && u === t.alt && u !== line[0];
  if (u === line[step] || isAlt || mates) {
    trainArrow = null;
    trainerApply(u);
    trainSt.step = step + 1;
    const finished = mates || isAlt || trainSt.step >= line.length;
    if (finished) {
      trainSt.done = true;
      trainSt.msg = line.length > 1 && !isAlt ? `Richtig! ${mates ? 'Schachmatt.' : 'Alle Züge gefunden.'}` : `Richtig! ${san} ${isAlt ? 'ist genauso gut' : 'ist der beste Zug'}.`;
      if (!trainSt.shown) { const pr = trainProg(); pr[t.id] = { ok: true, tries: trainSt.tries + 1 }; LS.set('sa_train', pr); }
      renderBoardAndInfo(); renderTrainCard(); flashSolved();
      // single-move tasks: show the opponent's answer afterwards
      const reply = line.length === 1 && !isAlt && !mates && t.pv[1];
      if (reply) {
        trainSt.busy = true;
        setTimeout(() => {
          if (!(game && game.trainer && trainTasks[trainIdx] === t)) return;
          trainerApply(reply); trainSt.busy = false; continueFromTask();
        }, 700);
      } else continueFromTask();
    } else {
      // opponent answers with the engine move, then it's the player's turn again
      trainSt.msg = `Richtig, ${san}! Wie geht es weiter?`; trainSt.good = true;
      trainSt.busy = true;
      renderBoardAndInfo(); renderTrainCard();
      setTimeout(() => {
        if (!game || !game.trainer || trainTasks[trainIdx] !== t) return;
        trainerApply(line[trainSt.step]);
        trainSt.step++;
        trainSt.busy = false;
        renderBoardAndInfo(); renderTrainCard();
      }, 650);
    }
  } else if (step === 0 && t.bestCp != null && !trainSt.shown) {
    // a different first move can be just as good: let the engine judge it
    trainSt.busy = true; trainSt.msg = `${san} wird geprüft …`; trainSt.good = true; trainSt.moveAt = Date.now();
    const mv = trainerApply(u);
    renderBoard(); renderTrainCard();
    checkTrainMove(t, mv.fenAfter).then(res => {
      if (!game || !game.trainer || trainTasks[trainIdx] !== t) return;
      trainSt.busy = false;
      if (res.ok) {
        trainSt.done = true; trainSt.step = line.length;
        trainSt.msg = `Richtig! ${san} ist genauso gut.`;
        const pr = trainProg(); pr[t.id] = { ok: true, tries: trainSt.tries + 1 }; LS.set('sa_train', pr);
        renderBoardAndInfo(); renderTrainCard(); flashSolved(); continueFromTask();
      } else wrongTrainMove(t, san, mv, true, null, res.line);
    });
  } else {
    trainSt.moveAt = Date.now();
    wrongTrainMove(t, san, null, false, u);
  }
}
function flashSolved() {
  if (trainSt.shown) return;
  const bw = $('boardwrap'); bw.classList.remove('solvedflash'); void bw.offsetWidth; bw.classList.add('solvedflash');
  const tries = trainSt.tries;
  if (!/Versuch/.test(trainSt.msg)) trainSt.msg += tries ? ` (im ${tries + 1}. Versuch)` : ' Im ersten Versuch!';
  renderTrainCard();
  setTimeout(() => $('trainCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150);
}
// Engine check: does the player's move keep (almost) the evaluation of the best move?
async function checkTrainMove(t, fenAfter) {
  try {
    await Engine.init();
    const prof = STRENGTH[S.strength] || STRENGTH.std;
    const r = await Engine.search({ fen: fenAfter, depth: prof.depth, movetime: 350, multipv: 1, kind: 'train' });
    if (!r || !r.lines.length) return { ok: false };
    const line = r.lines[0];
    const sg = t.color === 'w' ? 1 : -1, cp = Math.max(-100000, Math.min(100000, sg * line.cpw));
    if (t.bestCp > 90000) return { ok: cp > 90000, line };               // mate tasks: the move must keep a forced mate
    return { ok: cp >= t.bestCp - 60 || (t.bestCp > 800 && cp > 800 && cp >= t.bestCp - 250), line };
  } catch (e) { return { ok: false }; }
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const PIECE_ACC = { p: 'deinen Bauern', n: 'deinen Springer', b: 'deinen Läufer', r: 'deinen Turm', q: 'deine Dame', k: 'deinen König' };
// Wrong move: show it, let the opponent answer with the engine's best reply, pause, then take both back.
async function wrongTrainMove(t, san, shown, already, u, line) {
  trainSt.tries++; trainSt.good = false; trainSt.busy = true;
  const mv = already ? shown : trainerApply(u);
  const t0 = trainSt.moveAt || Date.now();
  const alive = () => game && game.trainer && trainTasks[trainIdx] === t;
  trainSt.msg = `${san} ist nicht der beste Zug …`;
  renderBoard(); renderTrainCard();
  if (!mv) { trainSt.busy = false; return; }
  let reply = null, text = '';
  try {
    if (!line) {
      await Engine.init();
      const r = await Engine.search({ fen: mv.fenAfter, depth: 16, movetime: 200, multipv: 1, kind: 'train' });
      line = r && r.lines[0];
    }
    const ru = line && line.pv && line.pv[0];
    if (ru && alive()) {
      const p = C.parseFen(mv.fenAfter), rm = C.legal(p).find(x => C.uci(x) === ru);
      if (rm) {
        const rs = C.san(p, rm), after = C.make(p, rm);
        let mo = { kind: null };
        try { mo = Explain.lineMotif(mv.fenAfter, line); } catch (e) { /* ignore */ }
        if (C.status(after) === 'mate') text = `${rs} – Schachmatt!`;
        else if (mo.kind === 'mate') text = `${rs} – danach setzt der Gegner in ${mo.n} Zügen matt.`;
        else if (mo.kind === 'fork') text = `${rs} – eine Gabel!`;
        else if (rm.captured) text = `${rs} schlägt ${PIECE_ACC[rm.captured.toLowerCase()]}.`;
        else text = `Der Gegner antwortet ${rs}.`;
        reply = ru;
      }
    }
  } catch (e) { /* ignore */ }
  if (!alive()) return;
  await wait(Math.max(0, (reply ? 230 : 450) - (Date.now() - t0)));
  if (!alive()) return;
  let rmv = null;
  if (reply) {
    rmv = trainerApply(reply);
    trainSt.msg = `${san}? ${text}`;
    renderBoard(); renderTrainCard();
    await wait(1000);
    if (!alive()) return;
    game.moves.pop(); positions.pop(); ply = positions.length - 1;
    animMove(rmv, true); renderBoard();
    await wait(250);
    if (!alive()) return;
  }
  game.moves.pop(); positions.pop(); ply = positions.length - 1;
  animMove(mv, true); renderBoard();
  trainSt.msg = `${reply ? `${san}? ${text} ` : `${san} ist nicht der beste Zug. `}Versuch es nochmal.`;
  trainSt.busy = false;
  renderTrainCard();
}

// After a solved task: keep playing from here like an analysis variation (every move gets a feedback symbol).
function continueFromTask() {
  const g0 = game;
  game = { headers: g0.headers, startFen: g0.startFen, moves: g0.moves.slice(), free: false, trainer: false, sandbox: true };
  evals = []; cls = []; variation = null; selected = null; trainArrow = null; ply = positions.length - 1;
  document.body.classList.remove('training');
  document.body.classList.add('traindone'); // task card (solved + „Nächste Aufgabe“) stays visible
  renderBoardAndInfo(); renderTrainCard();
}

function renderHomeExtras() { renderTiles(); renderTrend(); renderTrainHome(); renderOpenings(); }

// ---------- views: start screen <-> board ----------
let view = 'home';
function showView(v) {
  view = v;
  document.body.dataset.view = v;
  $('viewHome').style.display = v === 'home' ? '' : 'none';
  $('viewBoard').style.display = v === 'board' ? '' : 'none';
  $('viewReview').style.display = v === 'review' ? '' : 'none';
  $('btnHome').style.display = v !== 'home' ? '' : 'none';
  $('bFlip').style.display = v === 'board' ? '' : 'none';
  $('btnReview').style.display = v === 'board' && game && !game.free && cls.some(Boolean) && !analyzing ? '' : 'none';
  if (v !== 'board' || !(game && game.trainer)) { document.body.classList.remove('training'); trainArrow = null; }
  if (v !== 'board') document.body.classList.remove('traindone');
  if (v === 'review') renderReview();
  if (v === 'home') {
    Engine.cancel('live');
    renderHomeExtras();
    renderAccList();
    if (Date.now() - lastRatings > 10 * 60000) fetchRatings();
    setTimeout(enrichStored, 400);
    if (Date.now() - lastFetch > 60000) loadAccountGames(false);
  }
  window.scrollTo(0, 0);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && view === 'home') { renderAccList(); if (Date.now() - lastFetch > 60000) loadAccountGames(false); if (Date.now() - lastRatings > 10 * 60000) fetchRatings(); }
});

// ---------- boot ----------
function boot() {
  renderAccInfo();
  showView('home');
}
boot();
Engine.init().catch(() => {});

})();
