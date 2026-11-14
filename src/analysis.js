// Move classification + accuracy, independent of UI.
const Analysis = (() => {
  const C = typeof Chess !== 'undefined' ? Chess : require('./chess.js');

  const winPct = cp => {
    const x = Math.max(-1000, Math.min(1000, cp));
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * x)) - 1);
  };
  const moveAccuracy = loss => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));

  const CLASSES = {
    book:       { label: 'Theoriezug',     sym: '<svg viewBox="0 0 24 24" width="64%" height="64%" aria-hidden="true"><path fill="#fff" d="M3 5.2C3 4.5 3.6 4 4.3 4c2.6 0 5 .6 6.7 1.9V20c-1.7-1.2-4.1-1.8-6.7-1.8-.7 0-1.3-.5-1.3-1.2zm18 0V17c0 .7-.6 1.2-1.3 1.2-2.6 0-5 .6-6.7 1.8V5.9C14.7 4.6 17.1 4 19.7 4c.7 0 1.3.5 1.3 1.2z"/></svg>', color: '#a88865', phrase: 'ist ein Theoriezug' },
    brilliant:  { label: 'Brillant',       sym: '!!', color: '#1baca6', phrase: 'ist brillant' },
    great:      { label: 'Großartig',      sym: '!',  color: '#5b8baf', phrase: 'ist ein großartiger Zug' },
    best:       { label: 'Bester Zug',     sym: '★',  color: '#81b64c', phrase: 'ist der beste Zug' },
    excellent:  { label: 'Exzellent',      sym: '✓', color: '#81b64c', phrase: 'ist exzellent' },
    good:       { label: 'Gut',            sym: '✓',  color: '#95b776', phrase: 'ist gut' },
    forced:     { label: 'Erzwungen',      sym: '→',  color: '#96af8b', phrase: 'ist erzwungen' },
    inaccuracy: { label: 'Ungenauigkeit',  sym: '?!', color: '#f7c631', phrase: 'ist eine Ungenauigkeit' },
    mistake:    { label: 'Fehler',         sym: '?',  color: '#ffa459', phrase: 'ist ein Fehler' },
    miss:       { label: 'Verpasst',       sym: '✕',  color: '#ff7769', phrase: 'verpasst eine Chance' },
    blunder:    { label: 'Patzer',         sym: '??', color: '#fa412d', phrase: 'ist ein Patzer' },
  };
  const ORDER = ['book', 'brilliant', 'great', 'best', 'excellent', 'good', 'forced', 'inaccuracy', 'mistake', 'miss', 'blunder'];

  // Did the move leave a piece en prise for a net material loss of >= 2?
  function isSacrifice(move, fenAfter) {
    const t = move.piece.toLowerCase();
    if (t === 'p' || t === 'k' || move.promo) return false;
    const pv = C.VAL[t], cv = move.captured ? C.VAL[move.captured.toLowerCase()] : 0;
    const p1 = C.parseFen(fenAfter);
    const caps = C.legal(p1).filter(x => x.to === move.to);
    if (!caps.length) return false;
    const v = m => (m.piece.toLowerCase() === 'k' ? 100 : C.VAL[m.piece.toLowerCase()]);
    caps.sort((a, b) => v(a) - v(b));
    const cap = caps[0];
    const p2 = C.make(p1, cap);
    const defended = C.legal(p2).some(x => x.to === move.to);
    const net = pv - cv - (defended ? Math.min(v(cap), 9) : 0);
    return net >= 2;
  }

  // evals[i] = { lines:[{cpw, pv:[uci...]}], terminal } (white POV). Returns classification for move i.
  function classify(game, positions, evals, i, prevCls) {
    const m = game.moves[i];
    const e0 = evals[i], e1 = evals[i + 1];
    if (!e0 || !e1 || !e0.lines.length || !e1.lines.length) return null;
    const p0 = C.parseFen(positions[i]);
    const sgn = p0.turn === 'w' ? 1 : -1;
    const l0 = e0.lines[0], l1 = e0.lines[1];
    const wb = winPct(sgn * l0.cpw), wa = winPct(sgn * e1.lines[0].cpw);
    const loss = Math.max(0, wb - wa);
    const nLegal = C.legal(p0).length;
    const deliversMate = e1.terminal === 'mate';
    const isBest = deliversMate || (l0.pv && l0.pv[0] === m.uci);
    const res = { loss, wb, wa, acc: moveAccuracy(loss), bestUci: l0.pv && l0.pv[0], isBest };
    if (nLegal === 1) { res.type = 'forced'; return res; }
    const nearBest = isBest || loss <= 2;
    if (nearBest && wb <= 95 && wa >= 45 && isSacrifice(m, positions[i + 1])) { res.type = 'brilliant'; return res; }
    const prevM = i > 0 ? game.moves[i - 1] : null;
    const isRecapture = prevM && prevM.captured && prevM.to === m.to;
    if (isBest && l1 && !isRecapture && !deliversMate) {
      const gap = winPct(sgn * l0.cpw) - winPct(sgn * l1.cpw);
      if (gap >= 20 && wa >= 30) { res.type = 'great'; return res; }
    }
    if (isBest) res.type = 'best';
    else if (loss < 2) res.type = 'excellent';
    else if (loss < 5) res.type = 'good';
    else if (loss < 10) res.type = 'inaccuracy';
    else if (loss < 20) res.type = 'mistake';
    else res.type = 'blunder';
    if (prevCls && ['mistake', 'blunder', 'miss'].includes(prevCls.type) && ['inaccuracy', 'mistake'].includes(res.type)) res.type = 'miss';
    return res;
  }

  function accuracy(list) {
    const a = list.filter(x => x).map(x => x.acc);
    if (!a.length) return null;
    const mean = a.reduce((s, x) => s + x, 0) / a.length;
    const harm = a.length / a.reduce((s, x) => s + 1 / Math.max(x, 1), 0);
    return (mean + harm) / 2;
  }

  return { winPct, moveAccuracy, CLASSES, ORDER, classify, accuracy, isSacrifice };
})();
if (typeof module !== 'undefined') module.exports = Analysis;
