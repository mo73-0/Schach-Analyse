# Schach-Analyse

Persönliches Schach-Analyse-Tool als Web-App (läuft komplett im Browser, auch offline).

- Importiert die letzten Partien von **chess.com** und **Lichess** über den Benutzernamen (oder per PGN)
- Partie-Review mit Stockfish 19 Lite: Zugbewertungen (Brillant … Patzer), Genauigkeit, Bewertungsverlauf
- Analysebrett mit Bewertungsleiste, Engine-Linien, eigenen Varianten

**Installation auf dem iPhone:** Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm“.

## Entwicklung
Quellcode liegt in `src/`, `index.html` wird mit `python3 src/build.py` erzeugt (Details: `CLAUDE.md`).

## Lizenzen
- Code dieses Projekts: GPLv3 (siehe `LICENSE`, wegen Stockfish)
- Engine: [Stockfish](https://github.com/official-stockfish/Stockfish) 19 via [stockfish.js](https://github.com/nmrugg/stockfish.js), GPLv3
- Figuren: „cburnett“ von Colin M.L. Burnett (GPLv2+ / CC BY-SA 3.0)
- Weitere Figurensets in `pieces/` (je mit Lizenzdatei): Chessnut von Alexis Luengas (Apache 2.0), Fantasy/Spatial/Celtic von Maurizio Monge (MIT), Firi von James Faure (CC BY 4.0), Kiwen-suwi von neverRare (CC BY 4.0), Formen/„shapes“ von flugsio (CC BY-SA 4.0) – SVGs aus lichess-org/lila, Details in `THIRD_PARTY.md`
- Brettfarben, Brettmuster und eingebaute Klänge: selbst erstellt
- Töne: nicht im Projekt enthalten – eigene Tondateien werden in den Einstellungen geladen und nur lokal gespeichert
