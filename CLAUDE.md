# Schach-Analyse – Hinweise für Claude

Persönliche Schach-Analyse-Web-App (Deutsch), läuft komplett im Browser und wird über
**GitHub Pages** vom Branch `main` (Ordner `/`) ausgeliefert: https://mo73-0.github.io/Schach-Analyse/
Hauptnutzer: iPhone, als Homescreen-App (PWA). Alle Texte in der App sind Deutsch.

## Aufbau
- `src/` – **Quellcode, nur hier ändern**
  - `template.html` – HTML + CSS, Platzhalter `<!--HEAD-->`, `/*FLAGS*/`, `/*CHESS*/`, `/*PIECES*/`, `/*ANALYSIS*/`, `/*APP*/`
  - `chess.js` – eigene Schachlogik (Zuggenerator, SAN, FEN, PGN-Parser), Feld 0 = a8
  - `analysis.js` – Zugbewertung (Brillant…Patzer), Genauigkeit, Gewinnwahrscheinlichkeit
  - `pieces.js` – Figuren (cburnett) als SVG-Data-URIs
  - `app.js` – UI, Engine-Steuerung (mehrere parallele Stockfish-Worker), Import von chess.com/Lichess, Töne, Einstellungen
  - `build.py` – baut `index.html` und setzt die Cache-Version in `sw.js`
  - `test_chess.js` – Perft-/PGN-Tests für `chess.js`
- `index.html` – **generiert**, nie von Hand bearbeiten
- `sw.js` – Service Worker (Offline): `index.html` network-first, alles andere cache-first
- `stockfish/` – Stockfish 19 Lite single-threaded (stockfish.js von nmrugg, GPLv3)
- `manifest.webmanifest`, Icons – PWA

## Arbeitsablauf bei Änderungen
1. Nur Dateien in `src/` (bzw. `sw.js`/Assets) ändern.
2. `node src/test_chess.js` (wenn `chess.js` geändert) und `python3 src/build.py` ausführen.
3. Im Browser testen: `python3 -m http.server` im Repo-Root, dann z. B. mit Playwright/Chrome
   (Stockfish braucht http, nicht file://). chess.com/Lichess-Antworten ggf. mocken.
4. Generierte `index.html` und `sw.js` mit committen, auf `main` pushen → GitHub Pages aktualisiert sich selbst.
   Wenn ein in `sw.js` gecachtes Asset neu hinzukommt, auch in `CORE` in `sw.js` eintragen.

## Wichtige Entscheidungen / Wünsche des Nutzers
- Optik an chess.com angelehnt (grünes Brett, dunkles UI), aber keine chess.com-Assets.
- Analyse wird beim Import komplett vorab berechnet (Ladeanzeige), danach beim Durchklicken keine Berechnung.
  Live-Engine nur für eigene Varianten.
- Analyse-Stärke als Zeitbudget pro Stellung (Schnell/Standard/Gründlich), nicht als feste Tiefe.
- Kein Zoomen, nur vertikales Scrollen; Layout darf nie breiter als der Bildschirm werden.
- Figuren gleiten (Animation).
- Töne: Der Nutzer lädt seine Tondateien (Lichess-Standard Move.mp3/Capture.mp3) einmal in den Einstellungen,
  sie liegen nur in `localStorage` (`sa_snd_move`, `sa_snd_capture`). **Diese Töne sind nicht frei lizenziert
  und dürfen nie ins (öffentliche) Repository.** Generell: jede fremde Datei vor dem Commit auf ihre Lizenz prüfen.
- Daten (Einstellungen, letzte 25 Partien mit Analyse) liegen in `localStorage`.
