# Fremde Bestandteile und ihre Lizenzen

Jede Datei bzw. jeder Code, der nicht selbst geschrieben wurde, muss hier stehen – **bevor** er committet wird.
Nur frei lizenzierte Inhalte, deren Lizenz mit GPLv3 vereinbar ist, dürfen ins Repository.

| Bestandteil | Wo | Herkunft | Lizenz | Pflichten |
| --- | --- | --- | --- | --- |
| Stockfish 19 (Engine, inkl. NNUE-Netz „lite“) | `stockfish/` | [official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish), WASM-Build von [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js) v19.0.1 | GPLv3 | Quellcode des Projekts offen halten, `LICENSE` (GPLv3) beilegen, Urheberhinweis in App/README – erfüllt |
| Figuren „cburnett“ | `src/pieces.js`, App-Icons (weißer König, Kreuz weiß umgefärbt; „!!“-Plakette selbst gezeichnet) | Colin M.L. Burnett (Wikimedia Commons, auch in Lichess) | GPLv2+ (laut Lichess `COPYING.md`), auf Wikimedia zusätzlich CC BY-SA 3.0 | Namensnennung – in App-Fußzeile und README erfüllt |
| Figuren „Chessnut“ | `pieces/chessnut/` (+ `LICENSE.txt`, `COPYRIGHT.txt`) | Alexis Luengas, [LexLuengas/chessnut-pieces](https://github.com/LexLuengas/chessnut-pieces); SVGs aus [lichess-org/lila](https://github.com/lichess-org/lila) `public/piece/chessnut` | Apache 2.0 (geprüft: `LICENSE.txt` im Original-Repo; Lichess `COPYING.md`) | Lizenztext + Copyright beilegen (im Ordner), Namensnennung in Fußzeile – erfüllt |
| Figuren „Fantasy“, „Spatial“, „Celtic“ | `pieces/fantasy/`, `pieces/spatial/`, `pieces/celtic/` (+ `LICENSE`) | Maurizio Monge, [maurimo/chess-art](https://github.com/maurimo/chess-art); SVGs über lichess-org/lila | MIT (geprüft: `LICENSE` + README im Original-Repo) | Copyright- und Lizenzhinweis beilegen (im Ordner), Namensnennung – erfüllt |
| Figuren „Firi“ | `pieces/firi/` (+ `LICENSE.txt`) | James Faure, [jfaure/Firi-pieceset](https://github.com/jfaure/Firi-pieceset); SVGs über lichess-org/lila | CC BY 4.0 (geprüft: `LICENSE.txt` im Original-Repo) | Namensnennung + Lizenzhinweis – erfüllt (Fußzeile, Ordner) |
| Figuren „Kiwen-suwi“ | `pieces/kiwen-suwi/` (+ `LICENSE.txt`) | neverRare, [neverRare/kiwen-suwi](https://github.com/neverRare/kiwen-suwi); SVGs über lichess-org/lila | CC BY 4.0 für Grafiken (geprüft: README + `LICENSE-CC-BY-4.0` im Original-Repo) | Namensnennung + Lizenzhinweis – erfüllt |
| Figuren „Formen“ (shapes) | `pieces/shapes/` (+ `LICENSE.html`) | flugsio, [flugsio/chess_shapes](https://github.com/flugsio/chess_shapes); SVGs über lichess-org/lila | CC BY-SA 4.0 (geprüft: `LICENSE.html` im Original-Repo); laut Creative Commons einseitig GPLv3-kompatibel | Namensnennung, Lizenzhinweis, Weitergabe unter gleichen Bedingungen – erfüllt |
| Eröffnungsdatenbank (Theoriezüge, Eröffnungsnamen) | `src/openings.js` (erzeugt mit `src/gen_openings.js`) | [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), Stand 3ba6b20 | CC0 1.0 (Public Domain), geprüft in README und `COPYING.txt` des Repos | keine (Quellenangabe freiwillig, steht in der Fußzeile) |
| App-Code (`src/`) | `src/` | selbst geschrieben | GPLv3 | – |
| Brettfarben, Brettmuster (CSS), eingebaute Klänge (im Code synthetisiert, `Synth` in `src/app.js`) | `src/` | selbst erstellt | GPLv3 | – |

## Bewusst NICHT im Repository
| Inhalt | Grund |
| --- | --- |
| Lichess-Standardtöne (Move.mp3, Capture.mp3) | In Lichess' `COPYING.md` als „Exceptions (non-free)“ geführt, enthalten Copyright-Vermerk „Sounddogs.com“. Werden vom Nutzer lokal in der App geladen. |
| Grafiken, Töne, Logos, Figuren von chess.com | urheber- bzw. markenrechtlich geschützt |
| Weitere Lichess-Figurensets (alpha, california, cardinal, staunty, maestro, merida u. a.) | nicht frei (CC BY-NC-SA, „freeware“, „personal use“) oder Lizenz nicht eindeutig: merida ist im Original nur informell „freeware“, mpchess steht upstream unter LPPL (nicht GPL-kompatibel), rhosgfx/totoy/papercut nicht an der Quelle prüfbar bzw. von Lichess als „non-free“ geführt |
| Lichess-Klänge (auch futuristic/nes/piano/sfx, AGPLv3+) | bewusst nicht übernommen; eingebaute Klänge sind selbst erzeugt |
| Eigene Bretter, Figuren, Töne des Nutzers | liegen nur im Browser-Speicher (`sa_board_img`, `sa_pieces_custom`, `sa_snd_*`), nie im Repository |

## Genutzte Dienste
- chess.com Published-Data API und Lichess API: offizielle, öffentliche Schnittstellen für genau diesen Zweck (nur Lesen öffentlicher Partiedaten, ohne Login).
