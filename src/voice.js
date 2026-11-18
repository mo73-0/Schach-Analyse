// Spoken German chess moves → legal moves ("Springer d4", "Läufer schlägt e5", "e4", "kurze Rochade", "b d2" …).
// The recogniser often mishears letters/numbers ("die vier", "D4", "de 4"), so the text is normalised and then
// matched against the legal moves of the current position; only moves that fit are returned.
const Voice = (() => {
  const C = typeof Chess !== 'undefined' ? Chess : require('./chess.js');
  const PIECE = [
    [/springer|pferd|spring\w*|ross/, 'n'], [/l(ä|ae|e)ufer|leufer|laufer/, 'b'], [/turm|thurm|tour/, 'r'],
    [/dame|königin|koenigin/, 'q'], [/k(ö|oe|o)nig/, 'k'], [/bauer|bauern/, 'p'],
  ];
  const NUM = { null: 0, eins: 1, ein: 1, eine: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8 };
  // spoken letter names → file letter
  const LETTER = { a: 'a', ah: 'a', b: 'b', be: 'b', beh: 'b', c: 'c', ce: 'c', ze: 'c', zeh: 'c', tse: 'c', d: 'd', de: 'd', die: 'd', dee: 'd', der: 'd', e: 'e', eh: 'e', ee: 'e', f: 'f', ef: 'f', eff: 'f', g: 'g', ge: 'g', geh: 'g', h: 'h', ha: 'h', hah: 'h' };

  // official German piece letters (K D T L S), also glued to the square ("Sf3", "Lxe5") or spoken ("es", "el", "ka", "te")
  const CODE = { K: 'k', D: 'q', T: 'r', L: 'b', S: 'n' };
  function normalise(raw) {
    let r0 = ' ' + raw + ' ';
    r0 = r0.replace(/([a-h][18])\s*=?\s*([DTLS])\b/g, (m, sq, c) => ` ${sq} §${CODE[c]} `); // promotion "a8D", "e8=S"
    r0 = r0.replace(/\b([KDTLS])\s*x?\s*(?=[a-h]\s*[1-8]\b|[a-h][1-8]\b|x)/g, (m, c) => ` §${CODE[c]} `); // capital code letter
    r0 = r0.replace(/\b([KDTLS])([a-h])x?([a-h][1-8])\b/g, (m, c, f, sq) => ` §${CODE[c]} ${f} ${sq} `);  // "Sbd2"
    r0 = r0.replace(/\b([KDTLS])([1-8])x?([a-h][1-8])\b/g, (m, c, n, sq) => ` §${CODE[c]} ${n} ${sq} `);  // "T1a3"
    r0 = r0.replace(/\b([a-h])x([a-h][1-8])\b/gi, ' $1 x $2 ');                                       // "cxd5"
    r0 = r0.replace(/\b([a-h][1-8])\s*[-–]\s*([a-h][1-8])\b/gi, ' $1 $2 ');                              // "b1-d2"
    let t = ' ' + r0.toLowerCase().replace(/[.,!?;:+#]/g, ' ').replace(/[-–]/g, ' ') + ' ';
    t = t.replace(/ß/g, 'ss');
    for (const [w, n] of Object.entries(NUM)) t = t.replace(new RegExp(`\\b${w}\\b`, 'g'), String(n));
    t = t.replace(/\b(es|ess)\s+(?=[a-h]\s*[1-8]|[a-h][1-8])/g, ' §n ').replace(/\b(el|ell)\s+(?=[a-h]\s*[1-8]|[a-h][1-8])/g, ' §b ')
      .replace(/\b(ka|kah)\s+(?=[a-h]\s*[1-8]|[a-h][1-8])/g, ' §k ').replace(/\b(te|tee|teh)\s+(?=[a-h]\s*[1-8]|[a-h][1-8])/g, ' §r ');
    // "d4" may come as "d 4", "de 4", "die 4", "D4"
    const toks = t.trim().split(/\s+/);
    const out = [];
    for (let i = 0; i < toks.length; i++) {
      const w = toks[i];
      if (/^[a-h][1-8]$/.test(w)) { out.push(w); continue; }
      const m = /^([a-z]+)([1-8])$/.exec(w);
      if (m && LETTER[m[1]]) { out.push(LETTER[m[1]] + m[2]); continue; }
      if (LETTER[w] && /^[1-8]$/.test(toks[i + 1] || '')) { out.push(LETTER[w] + toks[i + 1]); i++; continue; }
      out.push(w);
    }
    return out;
  }

  // Parse → { castle, piece, to, fromFile, fromRank, fromSq, capture, promo, undo }
  function parse(raw) {
    const toks = normalise(raw), text = ' ' + toks.join(' ') + ' ';
    const r = { piece: null, to: null, fromFile: null, fromRank: null, fromSq: null, capture: /schl(ä|ae)gt|nimmt|schlagen|x/.test(text), promo: null };
    if (/zur(ü|ue)ck|r(ü|ue)ckg(ä|ae)ngig|korrektur|falsch/.test(text)) return { undo: true };
    if (/rochade|rochiert/.test(text)) { r.castle = /lang|gro(ss|ß)/.test(text) ? 'long' : 'short'; return r; }
    const compact = toks.join('');
    if (/^[0o]{2,3}$/.test(compact)) { r.castle = compact.length === 3 ? 'long' : 'short'; return r; } // "0-0", "O-O-O", "null null"
    const sqs = toks.filter(w => /^[a-h][1-8]$/.test(w));
    const lastSq = sqs.length ? toks.lastIndexOf(sqs[sqs.length - 1]) : -1;
    // piece words: before the target square = the moving piece, after it = promotion piece ("a8 Dame", "a8 Umwandlung in Springer")
    toks.forEach((w, i) => {
      if (/^§[kqrbn]$/.test(w)) { if (lastSq >= 0 && i > lastSq) { if (!r.promo && w[1] !== 'k') r.promo = w[1]; } else if (!r.piece) r.piece = w[1]; return; }
      const hit = PIECE.find(([re]) => re.test(w));
      if (!hit) return;
      if (lastSq >= 0 && i > lastSq) { if (hit[1] !== 'k' && hit[1] !== 'p' && !r.promo) r.promo = hit[1]; }
      else if (!r.piece) r.piece = hit[1];
    });
    if (sqs.length) r.to = sqs[sqs.length - 1];
    if (sqs.length >= 2) r.fromSq = sqs[sqs.length - 2];
    // disambiguation: a lone file letter or rank digit right before the target ("Springer b d2", "Turm 1 e1")
    let ti = toks.lastIndexOf(r.to);
    while (ti > 0 && /^(x|schl(ä|ae)gt|nimmt|nach|auf)$/.test(toks[ti - 1])) ti--; // "e schlägt d5", "Springer b nach d2"
    if (ti > 0) {
      const prev = toks[ti - 1];
      if (LETTER[prev] && LETTER[prev] !== undefined && !sqs.includes(prev)) r.fromFile = LETTER[prev];
      else if (/^[1-8]$/.test(prev)) r.fromRank = prev;
    }
    return r;
  }

  const sqIdx = s => (8 - +s[1]) * 8 + (s.charCodeAt(0) - 97);
  const sqName = i => 'abcdefgh'[i & 7] + (8 - (i >> 3));

  // all legal moves that fit the spoken text (best first)
  function match(raw, p) {
    const r = parse(raw);
    if (r.undo) return { undo: true, moves: [] };
    const legal = C.legal(p);
    if (r.castle) {
      const k = legal.filter(m => m.piece.toLowerCase() === 'k' && Math.abs((m.to & 7) - (m.from & 7)) === 2 && ((m.to & 7) > (m.from & 7)) === (r.castle === 'short'));
      return { moves: k, parsed: r };
    }
    if (!r.to) return { moves: [], parsed: r };
    const to = sqIdx(r.to);
    let c = legal.filter(m => m.to === to);
    if (r.fromSq && sqIdx(r.fromSq) !== to) { const f = c.filter(m => m.from === sqIdx(r.fromSq)); if (f.length) c = f; }
    if (r.piece) { const f = c.filter(m => m.piece.toLowerCase() === r.piece); if (f.length || r.piece !== 'p') c = f; }
    else if (r.promo && !c.some(m => m.promo)) c = c.filter(m => m.piece.toLowerCase() === r.promo); // "Dame h5" said the other way round
    else { const pawns = c.filter(m => m.piece.toLowerCase() === 'p'); if (pawns.length) c = pawns; } // "e4" = pawn move
    if (r.fromFile) { const f = c.filter(m => sqName(m.from)[0] === r.fromFile); if (f.length) c = f; }
    if (r.fromRank) { const f = c.filter(m => sqName(m.from)[1] === r.fromRank); if (f.length) c = f; }
    if (r.capture) { const f = c.filter(m => m.captured); if (f.length) c = f; }
    if (c.some(m => m.promo)) c = c.filter(m => (m.promo || '').toLowerCase() === (r.promo || 'q'));
    return { moves: c, parsed: r };
  }

  return { normalise, parse, match };
})();
if (typeof module !== 'undefined') module.exports = Voice;
