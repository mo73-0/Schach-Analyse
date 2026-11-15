// Plain-language explanations for moves and tactic detection ("motifs") from engine lines.
// Works only on positions + engine lines (no UI), so it can be tested in Node.
const Explain = (() => {
  const C = typeof Chess !== 'undefined' ? Chess : require('./chess.js');
  const VAL = C.VAL;
  const NAME = { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' };
  const ACC = { p: 'den Bauern', n: 'den Springer', b: 'den Läufer', r: 'den Turm', q: 'die Dame', k: 'den König' }; // accusative
  const NOM = { p: 'Der Bauer', n: 'Der Springer', b: 'Der Läufer', r: 'Der Turm', q: 'Die Dame', k: 'Der König' };
  const type = x => x.toLowerCase();
  const colorOf = x => (x === x.toUpperCase() ? 'w' : 'b');
  const other = c => (c === 'w' ? 'b' : 'w');

  function byUci(p, u) { return C.legal(p).find(m => C.uci(m) === u) || null; }

  function material(p, side) {
    let s = 0;
    for (const x of p.b) if (x && colorOf(x) === side) s += VAL[type(x)];
    return s;
  }
  const balance = (p, side) => material(p, side) - material(p, other(side));

  // Squares attacked by the piece standing on s.
  function attacksFrom(b, s) {
    const x = b[s]; if (!x) return [];
    const t = type(x), w = colorOf(x) === 'w', r = s >> 3, f = s & 7, out = [];
    const add = (rr, ff) => { if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) { out.push(rr * 8 + ff); return !b[rr * 8 + ff]; } return false; };
    if (t === 'p') { const d = w ? -1 : 1; add(r + d, f - 1); add(r + d, f + 1); }
    else if (t === 'n') [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach(([a, c]) => add(r + a, f + c));
    else if (t === 'k') { for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) if (a || c) add(r + a, f + c); }
    else {
      const dirs = [];
      if (t === 'r' || t === 'q') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
      if (t === 'b' || t === 'q') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
      for (const [a, c] of dirs) for (let k = 1; k < 8 && add(r + a * k, f + c * k); k++);
    }
    return out;
  }

  // Net material the side to move wins along the first plies of the line (engine lines include the recaptures).
  function pvGain(fen, pv, maxPlies = 6) {
    let p = C.parseFen(fen);
    const me = p.turn, start = balance(p, me);
    const n = Math.min(pv.length, maxPlies);
    for (let i = 0; i < n; i++) {
      const m = byUci(p, pv[i]); if (!m) break;
      p = C.make(p, m);
    }
    return balance(p, me) - start;
  }

  // Pieces forked by the piece that just moved to `to` (position q, opponent to move).
  function forkTargets(q, to) {
    const x = q.b[to]; if (!x) return [];
    const me = colorOf(x), mv = VAL[type(x)];
    return attacksFrom(q.b, to).filter(s => {
      const y = q.b[s]; if (!y || colorOf(y) === me) return false;
      const t = type(y);
      if (t === 'k') return true;
      return VAL[t] > mv || !C.attacked(q, s, other(me));
    }).map(s => ({ sq: s, t: type(q.b[s]) }));
  }

  // What does the engine line do for the side to move? -> { kind, n, gain, san, m, targets }
  // kind: 'mate' | 'fork' | 'hanging' | 'trade' | 'material' | null
  function lineMotif(fen, line) {
    if (!line || !line.pv || !line.pv.length) return { kind: null, gain: 0 };
    const p = C.parseFen(fen), me = p.turn, sg = me === 'w' ? 1 : -1;
    const m = byUci(p, line.pv[0]); if (!m) return { kind: null, gain: 0 };
    const san = C.san(p, m);
    if (line.mate != null && line.mate !== 0 && Math.sign(line.mate) === sg) return { kind: 'mate', n: Math.abs(line.mate), san, m, gain: 0 };
    const gain = pvGain(fen, line.pv);
    const q = C.make(p, m);
    const res = { kind: null, gain, san, m };
    if (gain < 2) return res;
    if (m.captured && VAL[type(m.captured)] >= 3) {
      const ct = type(m.captured);
      if (!C.attacked(q, m.to, other(me))) return Object.assign(res, { kind: 'hanging', piece: ct, sq: m.to });
      if (VAL[ct] > VAL[type(m.piece)]) return Object.assign(res, { kind: 'trade', piece: ct });
    }
    const tg = forkTargets(q, m.to);
    if (tg.length >= 2 && tg.some(t => t.t !== 'p')) return Object.assign(res, { kind: 'fork', targets: tg });
    if (m.captured) {
      const ct = type(m.captured);
      if (!C.attacked(q, m.to, other(me))) return Object.assign(res, { kind: 'hanging', piece: ct, sq: m.to });
    }
    return Object.assign(res, { kind: 'material' });
  }

  const sqName = s => C.sqName(s);
  function matWord(g) {
    if (g >= 8) return 'die Dame';
    if (g >= 5) return 'einen Turm';
    if (g >= 3) return 'eine Figur';
    if (g >= 2) return 'Material';
    return 'einen Bauern';
  }
  const list = arr => (arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' und ' + arr[arr.length - 1]);
  const targetsText = tg => list(tg.map(t => (t.t === 'k' ? 'den König' : ACC[t.t] + ' auf ' + sqName(t.sq))));

  // Short label for a tactic (used for training tasks).
  function label(mo) {
    if (!mo || !mo.kind) return '';
    if (mo.kind === 'mate') return 'Matt in ' + mo.n;
    if (mo.kind === 'fork') return 'Gabel';
    if (mo.kind === 'hanging') return 'Ungedeckte Figur';
    if (mo.kind === 'trade') return 'Materialgewinn';
    return 'Kombination';
  }

  // Sentence describing what the best line achieves (for "Bester Zug war …" and the trainer).
  function bestText(mo) {
    if (!mo || !mo.kind) return '';
    if (mo.kind === 'mate') return mo.n === 1 ? `${mo.san} setzt sofort matt.` : `${mo.san} erzwingt Matt in ${mo.n} Zügen.`;
    if (mo.kind === 'fork') return `${mo.san} ist eine Gabel: Sie greift ${targetsText(mo.targets)} gleichzeitig an und gewinnt ${matWord(mo.gain)}.`;
    if (mo.kind === 'hanging') return `${mo.san} schlägt ${ACC[mo.piece]} auf ${sqName(mo.sq)}, der ungedeckt war.`;
    if (mo.kind === 'trade') return `${mo.san} schlägt ${ACC[mo.piece]} und gewinnt ${matWord(mo.gain)}.`;
    return `${mo.san} leitet eine Kombination ein, die ${matWord(mo.gain)} gewinnt.`;
  }

  // Explanation for a played move.
  // a = { fen (before), uci, cls, e0 (eval before), e1 (eval after) }
  function explain(a) {
    const c = a.cls; if (!c || !a.e0 || !a.e1) return '';
    const p = C.parseFen(a.fen), me = p.turn;
    const m = byUci(p, a.uci); if (!m) return '';
    const after = C.toFen(C.make(p, m));
    const t = c.type;
    const out = [];
    if (['inaccuracy', 'mistake', 'blunder', 'miss'].includes(t)) {
      // Material sentences only when the evaluation really reflects them (>= 1.5 pawns), mates always.
      const sg = me === 'w' ? 1 : -1, cl = x => Math.max(-3000, Math.min(3000, x));
      const drop = a.e0.lines[0] ? cl(sg * a.e0.lines[0].cpw) - cl(sg * a.e1.lines[0].cpw) : 0;
      const real = mo => mo.kind === 'mate' || (mo.kind && drop >= 150);
      // 1) what the opponent can do now
      let opp = a.e1.terminal ? { kind: null, gain: 0 } : lineMotif(after, a.e1.lines[0]);
      if (!real(opp)) opp = { kind: null, gain: 0 };
      if (opp.kind === 'mate') out.push(opp.n === 1 ? `Danach setzt der Gegner mit ${opp.san} sofort matt.` : `Erlaubt dem Gegner Matt in ${opp.n} (beginnend mit ${opp.san}).`);
      else if (opp.kind === 'fork') out.push(`Erlaubt eine Gabel: ${opp.san} greift ${targetsText(opp.targets)} an.`);
      else if (opp.kind === 'hanging' && opp.sq === m.to) out.push(`${NOM[opp.piece]} auf ${sqName(opp.sq)} steht danach ungedeckt und geht verloren.`);
      else if (opp.kind === 'hanging') out.push(`Lässt ${ACC[opp.piece]} auf ${sqName(opp.sq)} ungedeckt stehen – der Gegner schlägt mit ${opp.san}.`);
      else if (opp.kind) out.push(`Verliert ${matWord(opp.gain)}, der Gegner antwortet mit ${opp.san}.`);
      // 2) what was missed
      const best = a.e0.lines[0];
      if (best && best.pv && best.pv[0] !== a.uci) {
        let mo = lineMotif(a.fen, best);
        if (!real(mo)) mo = { kind: null };
        if (mo.kind === 'mate') out.push(mo.n === 1 ? `Übersieht Matt in 1 mit ${mo.san}.` : `Übersieht Matt in ${mo.n} mit ${mo.san}.`);
        else if (mo.kind === 'fork') out.push(`Übersieht eine Gabel mit ${mo.san}, die ${matWord(mo.gain)} gewinnt.`);
        else if (mo.kind === 'hanging') out.push(`Übersieht, dass ${NOM[mo.piece].replace(/^D/, 'd')} auf ${sqName(mo.sq)} ungedeckt war (${mo.san}).`);
        else if (mo.kind) out.push(`Übersieht ${mo.san}, das ${matWord(mo.gain)} gewinnt.`);
      }
      if (!out.length) {
        if (t === 'miss') out.push('Der Gegner hatte gerade einen Fehler gemacht – diesen Vorteil gibst du hier wieder ab.');
        else if (t === 'inaccuracy') out.push('Kein grober Fehler, aber es gab einen genaueren Zug.');
        else out.push('Verschlechtert die Stellung deutlich, auch ohne sofortigen Materialverlust.');
      } else if (t === 'miss' && out.length === 1 && !/^Übersieht/.test(out[0])) out.unshift('Der Gegner hatte gerade einen Fehler gemacht.');
    } else if (t === 'brilliant') {
      out.push('Ein Figurenopfer, das sich lohnt: Der Gegner kann die Figur nehmen, steht danach aber nicht besser.');
    } else if (t === 'great') {
      out.push('Der einzige Zug, der die Stellung hält – alle anderen Züge wären deutlich schlechter gewesen.');
    } else if (t === 'best' || t === 'excellent') {
      const l1 = a.e1.lines[0] || {};
      const mo = lineMotif(a.fen, { pv: [a.uci].concat(l1.pv || []), mate: l1.mate });
      if (a.e1.terminal === 'mate') out.push('Schachmatt!');
      else if (mo.kind) out.push(bestText(mo));
    }
    return out.slice(0, 2).join(' ');
  }

  return { lineMotif, label, bestText, explain, pvGain, forkTargets, attacksFrom };
})();
if (typeof module !== 'undefined') module.exports = Explain;
