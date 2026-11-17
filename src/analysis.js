// Move classification + accuracy, independent of UI.
const Analysis = (() => {
  const C = typeof Chess !== 'undefined' ? Chess : require('./chess.js');

  const winPct = cp => {
    const x = Math.max(-1000, Math.min(1000, cp));
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * x)) - 1);
  };
  const moveAccuracy = loss => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));

  const CLASSES = {
    book:       { desc: 'Ein bekannter Eröffnungszug aus der Theorie – so spielen ihn auch starke Spieler.', label: 'Theoriezug',     sym: '<svg viewBox="0 0 24 24" width="64%" height="64%" aria-hidden="true"><path fill="#fff" d="M3 5.2C3 4.5 3.6 4 4.3 4c2.6 0 5 .6 6.7 1.9V20c-1.7-1.2-4.1-1.8-6.7-1.8-.7 0-1.3-.5-1.3-1.2zm18 0V17c0 .7-.6 1.2-1.3 1.2-2.6 0-5 .6-6.7 1.8V5.9C14.7 4.6 17.1 4 19.7 4c.7 0 1.3.5 1.3 1.2z"/></svg>', color: '#a88865', phrase: 'ist ein Theoriezug' },
    brilliant:  { desc: 'Ein starkes Figurenopfer: Du gibst Material her, und die Stellung bleibt trotzdem gut. Selten und schwer zu finden.', label: 'Brillant',       sym: '!!', color: '#1baca6', phrase: 'ist brillant' },
    great:      { desc: 'Der einzige wirklich gute Zug: Fast jeder andere Zug hätte die Stellung deutlich verschlechtert.', label: 'Großartig',      sym: '!',  color: '#5b8baf', phrase: 'ist ein großartiger Zug' },
    best:       { desc: 'Der Zug, den die Engine in dieser Stellung als besten bewertet.', label: 'Bester Zug',     sym: '★',  color: '#81b64c', phrase: 'ist der beste Zug' },
    excellent:  { desc: 'Fast so gut wie der beste Zug – der Unterschied ist kaum messbar.', label: 'Exzellent',      sym: '✓', color: '#81b64c', phrase: 'ist exzellent' },
    good:       { desc: 'Ein solider Zug, der die Stellung im Wesentlichen hält, aber es gab etwas Besseres.', label: 'Gut',            sym: '✓',  color: '#95b776', phrase: 'ist gut' },
    forced:     { label: 'Erzwungen',      sym: '→',  color: '#96af8b', phrase: 'ist erzwungen' },
    inaccuracy: { desc: 'Ein kleiner Fehler: Die Stellung wird etwas schlechter, aber nichts Entscheidendes geht verloren.', label: 'Ungenauigkeit',  sym: '?!', color: '#f7c631', phrase: 'ist eine Ungenauigkeit' },
    mistake:    { desc: 'Ein deutlicher Fehler, der deine Gewinnchancen spürbar senkt – etwa ein Bauer weniger oder eine klar schlechtere Stellung.', label: 'Fehler',         sym: '?',  color: '#ffa459', phrase: 'ist ein Fehler' },
    miss:       { desc: 'Der Gegner hatte gerade einen Fehler gemacht, und du hast die Gelegenheit, ihn zu bestrafen, nicht genutzt.', label: 'Verpasst',       sym: '<svg viewBox="0 0 24 24" width="66%" height="66%" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></svg>', color: '#ff7769', phrase: 'verpasst eine Chance' },
    blunder:    { desc: 'Ein schwerer Fehler, der die Partie kippen kann – meist wird eine Figur, die Dame oder ein Matt übersehen.', label: 'Patzer',         sym: '??', color: '#fa412d', phrase: 'ist ein Patzer' },
  };
  const ORDER = ['book', 'brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder'];

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
  // ---- chess.com-calibrated review model (fitted on the user's games vs. chess.com Game Review, see CLAUDE.md) ----
  // Expected points: logistic in centipawns, steepness grows with the mover's rating (weaker players convert less reliably).
  const EP = {
    k: 0.003, r0: 1300, base: 700,          // k(R) = k * (R + r0) / (base + r0)
    tE: 0.02, tG: 0.05, tI: 0.08, tM: 0.30,  // expected-points loss limits: excellent/good/inaccuracy/mistake (else blunder)
    bestRaw: 0.02,                           // engine's top move only counts as "best" if it really keeps the evaluation
    brilTol: 0.05, brilMaxWin: 0.95, brilMinWin: 0.45,
    greatGap: 0.08, greatMinWin: 0.30,
    missOpp: 0.10, missMin: 0.05,            // opponent just lost >= 0.10 and this move gives >= 0.05 back
    accA: 16, accP: 0.7, accMin: -100,       // move accuracy = max(accMin, 100 - accA * (100*loss)^accP), book = 100, game accuracy = mean (clamped)
    bookExt: 10, bookLoss: 0.03,             // theory continues up to ply 10 while moves stay near-perfect
    defaultElo: 1000,
  };
  const ratingOf = (game, color) => {
    const h = game.headers || {};
    const v = parseInt(color === 'w' ? h.WhiteElo : h.BlackElo, 10);
    return v > 0 ? v : EP.defaultElo;
  };
  const expPts = (cp, rating) => {
    const k = EP.k * (rating + EP.r0) / (EP.base + EP.r0);
    const x = Math.max(-2000, Math.min(2000, cp));
    return 1 / (1 + Math.exp(-k * x));
  };
  const moveAcc = loss => Math.max(EP.accMin, 100 - EP.accA * Math.pow(loss * 100, EP.accP));

  // evals[i] = { lines:[{cpw, pv:[uci...]}], terminal } (white POV). Returns classification for move i.
  function classify(game, positions, evals, i, prevCls) {
    const m = game.moves[i];
    const e0 = evals[i], e1 = evals[i + 1];
    if (!e0 || !e1 || !e0.lines.length || !e1.lines.length) return null;
    const p0 = C.parseFen(positions[i]);
    const sgn = p0.turn === 'w' ? 1 : -1;
    const R = ratingOf(game, p0.turn);
    const l0 = e0.lines[0], l1 = e0.lines[1];
    const eb = expPts(sgn * l0.cpw, R), ea = expPts(sgn * e1.lines[0].cpw, R);
    const rawLoss = Math.max(0, eb - ea);
    const deliversMate = e1.terminal === 'mate';
    let isBest = deliversMate || (l0.pv && l0.pv[0] === m.uci);
    if (isBest && rawLoss > EP.bestRaw) isBest = false;
    const loss = isBest ? 0 : rawLoss;
    const res = { loss, eb, ea, acc: moveAcc(loss), bestUci: l0.pv && l0.pv[0], isBest };
    if (C.legal(p0).length === 1) { res.type = 'best'; res.isBest = true; return res; }
    if ((isBest || loss <= EP.brilTol) && eb <= EP.brilMaxWin && ea >= EP.brilMinWin && isSacrifice(m, positions[i + 1])) { res.type = 'brilliant'; return res; }
    const prevM = i > 0 ? game.moves[i - 1] : null;
    const isRecapture = prevM && prevM.captured && prevM.to === m.to;
    if (isBest && l1 && !isRecapture && !deliversMate && ea >= EP.greatMinWin && eb - expPts(sgn * l1.cpw, R) >= EP.greatGap) { res.type = 'great'; return res; }
    if (isBest) res.type = 'best';
    else if (loss < EP.tE) res.type = 'excellent';
    else if (loss < EP.tG) res.type = 'good';
    else if (loss < EP.tI) res.type = 'inaccuracy';
    else if (loss < EP.tM) res.type = 'mistake';
    else res.type = 'blunder';
    if (prevCls && prevCls.loss >= EP.missOpp && loss >= EP.missMin && ['inaccuracy', 'mistake', 'blunder'].includes(res.type)) res.type = 'miss';
    return res;
  }

  function accuracy(list) {
    // theory moves count as perfect (like chess.com; calibrated 17.11.2026: accuracy RMSE 5.6 → 5.2 / Lichess games 11.1 → 9.1)
    const a = list.filter(x => x).map(x => (x.type === 'book' ? 100 : x.acc));
    if (!a.length) return null;
    return Math.max(0, Math.min(100, a.reduce((s, x) => s + x, 0) / a.length));
  }

  return { winPct, moveAccuracy, CLASSES, ORDER, classify, accuracy, isSacrifice, EP, expPts };
})();
if (typeof module !== 'undefined') module.exports = Analysis;
