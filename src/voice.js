// Spoken German chess moves → legal moves ("Springer d4", "Läufer schlägt e5", "e4", "kurze Rochade", "b d2" …).
// The recogniser often mishears letters/numbers ("die vier", "D4", "de 4"), so the text is normalised and then
// matched against the legal moves of the current position; only moves that fit are returned.
const Voice = (() => {
  const C = typeof Chess !== 'undefined' ? Chess : require('./chess.js');
  const PIECE = [
    [/springer|pferd|spring\w*|ross/, 'n'], [/l(ä|ae|e)ufer|leufer|laufer/, 'b'], [/turm|thurm|tour/, 'r'],
    [/dame|königin|koenigin/, 'q'], [/k(ö|oe|o)nig/, 'k'], [/bauer|bauern/, 'p'],
  ];
  const NUM = { eins: 1, ein: 1, eine: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8 };
  // spoken letter names → file letter
  const LETTER = { a: 'a', ah: 'a', b: 'b', be: 'b', beh: 'b', c: 'c', ce: 'c', ze: 'c', zeh: 'c', tse: 'c', d: 'd', de: 'd', die: 'd', dee: 'd', der: 'd', e: 'e', eh: 'e', ee: 'e', f: 'f', ef: 'f', eff: 'f', g: 'g', ge: 'g', geh: 'g', h: 'h', ha: 'h', hah: 'h' };

  function normalise(raw) {
    let t = ' ' + raw.toLowerCase().replace(/[.,!?;:]/g, ' ').replace(/-/g, ' ') + ' ';
    t = t.replace(/ß/g, 'ss');
    // numbers as words → digits
    for (const [w, n] of Object.entries(NUM)) t = t.replace(new RegExp(`\\b${w}\\b`, 'g'), String(n));
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
    // promotion: "… umwandlung in dame", "… wird dame"
    const sqs = toks.filter(w => /^[a-h][1-8]$/.test(w));
    const lastSq = sqs.length ? toks.lastIndexOf(sqs[sqs.length - 1]) : -1;
    // piece words: before the target square = the moving piece, after it = promotion piece ("a8 Dame", "a8 Umwandlung in Springer")
    toks.forEach((w, i) => {
      const hit = PIECE.find(([re]) => re.test(w));
      if (!hit) return;
      if (lastSq >= 0 && i > lastSq) { if (hit[1] !== 'k' && hit[1] !== 'p' && !r.promo) r.promo = hit[1]; }
      else if (!r.piece) r.piece = hit[1];
    });
    if (sqs.length) r.to = sqs[sqs.length - 1];
    if (sqs.length >= 2) r.fromSq = sqs[sqs.length - 2];
    // disambiguation: a lone file letter or rank digit right before the target ("Springer b d2", "Turm 1 e1")
    const ti = toks.lastIndexOf(r.to);
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
