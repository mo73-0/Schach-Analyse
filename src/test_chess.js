// Sanity test for the chess core (move generator + PGN parser).  Run: node src/test_chess.js
const C = require('./chess.js');
const perft = (p, d) => (d ? C.legal(p).reduce((n, m) => n + perft(C.make(p, m), d - 1), 0) : 1);
const cases = [
  [C.START, [20, 400, 8902]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486]],
];
let fail = 0;
for (const [fen, exp] of cases) exp.forEach((e, i) => { const r = perft(C.parseFen(fen), i + 1); if (r !== e) { fail++; console.log('FAIL', fen, i + 1, r, e); } });
const g = C.parsePgn('[White "a"]\n\n1. e4 {[%clk 0:09:58]} e5 2. Nf3 Nc6 (2... d6) 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1');
if (g.moves.length !== 14 || C.status(C.parseFen(g.moves[13].fenAfter)) !== 'mate') { fail++; console.log('FAIL pgn'); }
console.log(fail ? fail + ' Fehler' : 'Alle Tests OK');
process.exit(fail ? 1 : 0);
