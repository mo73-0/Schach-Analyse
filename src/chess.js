// Minimal chess core: board, legal moves, SAN, FEN, PGN. Square 0 = a8, 63 = h1.
const Chess = (() => {
  const FILES = 'abcdefgh';
  const sqName = s => FILES[s & 7] + (8 - (s >> 3));
  const sqIdx = n => (8 - parseInt(n[1], 10)) * 8 + FILES.indexOf(n[0]);
  const colorOf = p => (p === p.toUpperCase() ? 'w' : 'b');
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const KN = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  const KG = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const DIAG = [[-1,-1],[-1,1],[1,-1],[1,1]];
  const ORTH = [[-1,0],[1,0],[0,-1],[0,1]];
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  function parseFen(fen) {
    const parts = fen.trim().split(/\s+/);
    const b = new Array(64).fill(null);
    let i = 0;
    for (const ch of parts[0]) {
      if (ch === '/') continue;
      if (/\d/.test(ch)) i += +ch; else b[i++] = ch;
    }
    if (i !== 64) throw new Error('Ungültiges FEN');
    const c = parts[2] || '-';
    return {
      b, turn: parts[1] === 'b' ? 'b' : 'w',
      castle: { K: c.includes('K'), Q: c.includes('Q'), k: c.includes('k'), q: c.includes('q') },
      ep: parts[3] && parts[3] !== '-' ? sqIdx(parts[3]) : -1,
      half: +(parts[4] || 0), full: +(parts[5] || 1),
    };
  }

  function toFen(p) {
    let s = '';
    for (let r = 0; r < 8; r++) {
      let e = 0;
      for (let f = 0; f < 8; f++) {
        const x = p.b[r * 8 + f];
        if (!x) e++; else { if (e) { s += e; e = 0; } s += x; }
      }
      if (e) s += e;
      if (r < 7) s += '/';
    }
    let c = (p.castle.K ? 'K' : '') + (p.castle.Q ? 'Q' : '') + (p.castle.k ? 'k' : '') + (p.castle.q ? 'q' : '');
    // Only print en passant square if a capture is actually possible (keeps FENs canonical).
    let ep = '-';
    if (p.ep >= 0) {
      const pawn = p.turn === 'w' ? 'P' : 'p';
      const r = p.ep >> 3, f = p.ep & 7, fromR = p.turn === 'w' ? r + 1 : r - 1;
      for (const df of [-1, 1]) {
        const ff = f + df;
        if (ff >= 0 && ff < 8 && p.b[fromR * 8 + ff] === pawn) ep = sqName(p.ep);
      }
    }
    return `${s} ${p.turn} ${c || '-'} ${ep} ${p.half} ${p.full}`;
  }

  function attacked(p, sq, by) {
    const r = sq >> 3, f = sq & 7;
    const at = (rr, ff) => (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 ? p.b[rr * 8 + ff] : undefined);
    const own = t => (by === 'w' ? t.toUpperCase() : t);
    // pawns
    const pr = by === 'w' ? r + 1 : r - 1;
    if (at(pr, f - 1) === own('p') || at(pr, f + 1) === own('p')) return true;
    for (const [dr, df] of KN) if (at(r + dr, f + df) === own('n')) return true;
    for (const [dr, df] of KG) if (at(r + dr, f + df) === own('k')) return true;
    const ray = (dirs, a, c) => {
      for (const [dr, df] of dirs) {
        let rr = r + dr, ff = f + df;
        while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
          const x = p.b[rr * 8 + ff];
          if (x) { if (x === own(a) || x === own(c)) return true; break; }
          rr += dr; ff += df;
        }
      }
      return false;
    };
    return ray(DIAG, 'b', 'q') || ray(ORTH, 'r', 'q');
  }

  const kingSq = (p, c) => p.b.indexOf(c === 'w' ? 'K' : 'k');
  const inCheck = (p, c = p.turn) => attacked(p, kingSq(p, c), c === 'w' ? 'b' : 'w');

  function pseudo(p) {
    const out = [], us = p.turn, them = us === 'w' ? 'b' : 'w';
    const add = (from, to, extra = {}) => out.push({ from, to, piece: p.b[from], captured: p.b[to] || null, ...extra });
    for (let s = 0; s < 64; s++) {
      const x = p.b[s];
      if (!x || colorOf(x) !== us) continue;
      const t = x.toLowerCase(), r = s >> 3, f = s & 7;
      if (t === 'p') {
        const dir = us === 'w' ? -1 : 1, startR = us === 'w' ? 6 : 1, lastR = us === 'w' ? 0 : 7;
        const push = (from, to, extra) => {
          if ((to >> 3) === lastR) for (const pr of 'qrbn') add(from, to, { ...extra, promo: pr });
          else add(from, to, extra);
        };
        const r1 = r + dir;
        if (r1 >= 0 && r1 < 8 && !p.b[r1 * 8 + f]) {
          push(s, r1 * 8 + f);
          const r2 = r + 2 * dir;
          if (r === startR && !p.b[r2 * 8 + f]) add(s, r2 * 8 + f, { flag: 'double' });
        }
        for (const df of [-1, 1]) {
          const ff = f + df;
          if (ff < 0 || ff > 7 || r1 < 0 || r1 > 7) continue;
          const to = r1 * 8 + ff, y = p.b[to];
          if (y && colorOf(y) === them) push(s, to);
          else if (to === p.ep) add(s, to, { flag: 'ep', captured: us === 'w' ? 'p' : 'P' });
        }
      } else if (t === 'n' || t === 'k') {
        for (const [dr, df] of t === 'n' ? KN : KG) {
          const rr = r + dr, ff = f + df;
          if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
          const y = p.b[rr * 8 + ff];
          if (!y || colorOf(y) === them) add(s, rr * 8 + ff);
        }
        if (t === 'k') {
          const home = us === 'w' ? 60 : 4;
          if (s === home && !attacked(p, s, them)) {
            const [kc, qc] = us === 'w' ? ['K', 'Q'] : ['k', 'q'];
            if (p.castle[kc] && !p.b[s + 1] && !p.b[s + 2] && p.b[s + 3] === (us === 'w' ? 'R' : 'r') &&
                !attacked(p, s + 1, them) && !attacked(p, s + 2, them)) add(s, s + 2, { flag: 'K' });
            if (p.castle[qc] && !p.b[s - 1] && !p.b[s - 2] && !p.b[s - 3] && p.b[s - 4] === (us === 'w' ? 'R' : 'r') &&
                !attacked(p, s - 1, them) && !attacked(p, s - 2, them)) add(s, s - 2, { flag: 'Q' });
          }
        }
      } else {
        const dirs = t === 'b' ? DIAG : t === 'r' ? ORTH : DIAG.concat(ORTH);
        for (const [dr, df] of dirs) {
          let rr = r + dr, ff = f + df;
          while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
            const y = p.b[rr * 8 + ff];
            if (!y) add(s, rr * 8 + ff);
            else { if (colorOf(y) === them) add(s, rr * 8 + ff); break; }
            rr += dr; ff += df;
          }
        }
      }
    }
    return out;
  }

  function make(p, m) {
    const b = p.b.slice(), us = p.turn;
    const castle = { ...p.castle };
    b[m.to] = m.promo ? (us === 'w' ? m.promo.toUpperCase() : m.promo) : b[m.from];
    b[m.from] = null;
    if (m.flag === 'ep') b[m.to + (us === 'w' ? 8 : -8)] = null;
    if (m.flag === 'K') { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null; }
    if (m.flag === 'Q') { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null; }
    const t = m.piece.toLowerCase();
    if (t === 'k') { if (us === 'w') castle.K = castle.Q = false; else castle.k = castle.q = false; }
    for (const s of [m.from, m.to]) {
      if (s === 63) castle.K = false; if (s === 56) castle.Q = false;
      if (s === 7) castle.k = false; if (s === 0) castle.q = false;
    }
    return {
      b, castle, turn: us === 'w' ? 'b' : 'w',
      ep: m.flag === 'double' ? (m.from + m.to) / 2 : -1,
      half: t === 'p' || m.captured ? 0 : p.half + 1,
      full: p.full + (us === 'b' ? 1 : 0),
    };
  }

  function legal(p) {
    return pseudo(p).filter(m => !inCheck(make(p, m), p.turn));
  }

  function san(p, m, legalMoves = legal(p)) {
    let s;
    const t = m.piece.toLowerCase();
    if (m.flag === 'K') s = 'O-O';
    else if (m.flag === 'Q') s = 'O-O-O';
    else {
      const cap = !!m.captured;
      if (t === 'p') s = (cap ? FILES[m.from & 7] + 'x' : '') + sqName(m.to) + (m.promo ? '=' + m.promo.toUpperCase() : '');
      else {
        const amb = legalMoves.filter(o => o.to === m.to && o.from !== m.from && o.piece === m.piece);
        let dis = '';
        if (amb.length) {
          const sameFile = amb.some(o => (o.from & 7) === (m.from & 7));
          const sameRank = amb.some(o => (o.from >> 3) === (m.from >> 3));
          if (!sameFile) dis = FILES[m.from & 7];
          else if (!sameRank) dis = String(8 - (m.from >> 3));
          else dis = sqName(m.from);
        }
        s = t.toUpperCase() + dis + (cap ? 'x' : '') + sqName(m.to);
      }
    }
    const n = make(p, m);
    if (inCheck(n)) s += legal(n).length ? '+' : '#';
    return s;
  }

  const uci = m => sqName(m.from) + sqName(m.to) + (m.promo || '');

  function findMove(p, str) {
    const ms = legal(p);
    const clean = x => x.replace(/[+#!?]/g, '').replace(/0/g, 'O').replace(/=/g, '').replace(/^P(?=[a-h])/, '');
    const want = clean(str.trim());
    for (const m of ms) if (clean(san(p, m, ms)) === want) return m;
    // UCI fallback
    const u = str.trim().toLowerCase();
    for (const m of ms) if (uci(m) === u) return m;
    // lenient: missing capture 'x' or promotion lowercase
    const loose = x => clean(x).replace(/x/g, '').toLowerCase();
    const cand = ms.filter(m => loose(san(p, m, ms)) === loose(str));
    return cand.length === 1 ? cand[0] : null;
  }

  function status(p) {
    const ms = legal(p);
    if (!ms.length) return inCheck(p) ? 'mate' : 'stalemate';
    if (p.half >= 100) return 'fifty';
    const minors = p.b.filter(x => x && !/[kK]/.test(x));
    if (!minors.length || (minors.length === 1 && /[nNbB]/.test(minors[0]))) return 'insufficient';
    return null;
  }

  function splitPgn(text) {
    const t = text.replace(/\r/g, '').trim();
    const chunks = t.split(/\n\s*\n(?=\[)/);
    const games = [];
    let cur = '';
    for (const c of chunks) {
      cur += (cur ? '\n\n' : '') + c;
      // a game is complete once it has movetext (a line not starting with '[')
      if (cur.split('\n').some(l => l.trim() && !l.trim().startsWith('['))) { games.push(cur); cur = ''; }
    }
    if (cur.trim()) games.push(cur);
    return games;
  }

  function parsePgn(text) {
    const headers = {};
    text.replace(/\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/g, (_, k, v) => { headers[k] = v; return ''; });
    let body = text.replace(/\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/g, ' ');
    // collect clocks from comments in move order
    const clocks = [];
    body = body.replace(/\{([^}]*)\}/g, (_, c) => {
      const m = c.match(/%clk\s+([\d:.]+)/);
      return m ? ` __CLK_${m[1]}__ ` : ' ';
    });
    body = body.replace(/;[^\n]*/g, ' ');
    // strip variations (nested)
    let prev;
    do { prev = body; body = body.replace(/\([^()]*\)/g, ' '); } while (body !== prev);
    body = body.replace(/\$\d+/g, ' ');
    const tokens = body.split(/\s+/).filter(Boolean);
    let p = parseFen(headers.FEN || START);
    const startFen = toFen(p);
    const moves = [];
    for (let tok of tokens) {
      const ck = tok.match(/^__CLK_(.+)__$/);
      if (ck) { if (moves.length) moves[moves.length - 1].clock = ck[1]; continue; }
      tok = tok.replace(/^\d+\.(\.\.)?/, '');
      if (!tok || /^\.+$/.test(tok)) continue;
      if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) break;
      const m = findMove(p, tok);
      if (!m) throw new Error(`Unbekannter Zug "${tok}" (Zug ${p.full})`);
      const s = san(p, m);
      const fenBefore = toFen(p);
      p = make(p, m);
      moves.push({ san: s, uci: uci(m), from: m.from, to: m.to, piece: m.piece, captured: m.captured, promo: m.promo || null, flag: m.flag || null, fenBefore, fenAfter: toFen(p) });
    }
    return { headers, startFen, moves };
  }

  return { START, parseFen, toFen, legal, make, san, uci, findMove, inCheck, attacked, status, splitPgn, parsePgn, sqName, sqIdx, colorOf, VAL };
})();
if (typeof module !== 'undefined') module.exports = Chess;
