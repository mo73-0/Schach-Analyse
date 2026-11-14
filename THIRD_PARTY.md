# Fremde Bestandteile und ihre Lizenzen

Jede Datei bzw. jeder Code, der nicht selbst geschrieben wurde, muss hier stehen – **bevor** er committet wird.
Nur frei lizenzierte Inhalte, deren Lizenz mit GPLv3 vereinbar ist, dürfen ins Repository.

| Bestandteil | Wo | Herkunft | Lizenz | Pflichten |
| --- | --- | --- | --- | --- |
| Stockfish 19 (Engine, inkl. NNUE-Netz „lite“) | `stockfish/` | [official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish), WASM-Build von [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js) v19.0.1 | GPLv3 | Quellcode des Projekts offen halten, `LICENSE` (GPLv3) beilegen, Urheberhinweis in App/README – erfüllt |
| Figuren „cburnett“ | `src/pieces.js`, App-Icons (weißer König; „!!“-Plakette und Brett selbst gezeichnet) | Colin M.L. Burnett (Wikimedia Commons, auch in Lichess) | GPLv2+ (laut Lichess `COPYING.md`), auf Wikimedia zusätzlich CC BY-SA 3.0 | Namensnennung – in App-Fußzeile und README erfüllt |
| Eröffnungsdatenbank (Theoriezüge, Eröffnungsnamen) | `src/openings.js` (erzeugt mit `src/gen_openings.js`) | [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), Stand 3ba6b20 | CC0 1.0 (Public Domain), geprüft in README und `COPYING.txt` des Repos | keine (Quellenangabe freiwillig, steht in der Fußzeile) |
| App-Code (`src/`) | `src/` | selbst geschrieben | GPLv3 | – |

## Bewusst NICHT im Repository
| Inhalt | Grund |
| --- | --- |
| Lichess-Standardtöne (Move.mp3, Capture.mp3) | In Lichess' `COPYING.md` als „Exceptions (non-free)“ geführt, enthalten Copyright-Vermerk „Sounddogs.com“. Werden vom Nutzer lokal in der App geladen. |
| Grafiken, Töne, Logos, Figuren von chess.com | urheber- bzw. markenrechtlich geschützt |

## Genutzte Dienste
- chess.com Published-Data API und Lichess API: offizielle, öffentliche Schnittstellen für genau diesen Zweck (nur Lesen öffentlicher Partiedaten, ohne Login).
