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
  - `openings.js` – **generiert** von `gen_openings.js` aus lichess-org/chess-openings (CC0): Hashes aller Theoriestellungen + Eröffnungsnamen
  - `app.js` – UI, Engine-Steuerung (mehrere parallele Stockfish-Worker), Import von chess.com/Lichess, Töne, Einstellungen
  - `build.py` – baut `index.html`, schreibt `version.json` (App-Version = Hash der Quellen, für den Update-Hinweis) und setzt die Cache-Version in `sw.js`
  - `test_chess.js` – Perft-/PGN-Tests für `chess.js`
- `index.html` – **generiert**, nie von Hand bearbeiten
- `sw.js` – Service Worker (Offline): `index.html` network-first, `version.json` nie gecacht, alles andere cache-first
- `version.json` – **generiert**; die App vergleicht sie beim Start/Zurückkehren mit ihrer eigenen Version und zeigt „Neue Version verfügbar“
- `stockfish/` – Stockfish 19 Lite single-threaded (stockfish.js von nmrugg, GPLv3)
- `manifest.webmanifest`, Icons – PWA

## Lizenzen – höchste Priorität
Das Repository ist öffentlich. Der Nutzer will ausdrücklich keinerlei rechtliche Probleme.
- **Vor jedem Commit**, der fremde Dateien, Code-Schnipsel, Grafiken, Töne, Schriften oder Bibliotheken hinzufügt:
  Lizenz an der Originalquelle prüfen (nicht raten), nur GPLv3-kompatible freie Lizenzen verwenden,
  und den Eintrag in `THIRD_PARTY.md` ergänzen. Im Zweifel: **nicht** einbauen und den Nutzer fragen.
- Nichts von chess.com übernehmen (Grafiken, Töne, Figuren, Logos, Namen als Markenzeichen).
- Keine nicht freien Inhalte ins Repo, auch nicht vorübergehend (sie bleiben sonst in der Git-Historie).
- Lizenzpflichten (Namensnennung, `LICENSE`) bei Änderungen erhalten.

## Arbeitsablauf bei Änderungen
1. Nur Dateien in `src/` (bzw. `sw.js`/Assets) ändern.
2. `node src/test_chess.js` (wenn `chess.js` geändert) und `python3 src/build.py` ausführen.
3. Im Browser testen: `python3 -m http.server` im Repo-Root, dann z. B. mit Playwright/Chrome
   (Stockfish braucht http, nicht file://). chess.com/Lichess-Antworten ggf. mocken.
4. Generierte `index.html`, `version.json` und `sw.js` mit committen, auf `main` pushen → GitHub Pages aktualisiert sich selbst.
   Wenn ein in `sw.js` gecachtes Asset neu hinzukommt, auch in `CORE` in `sw.js` eintragen.

## Wichtige Entscheidungen / Wünsche des Nutzers
- Optik an chess.com angelehnt (grünes Brett, dunkles UI), aber keine chess.com-Assets.
- Analyse wird beim Import komplett vorab berechnet (Ladeanzeige), danach beim Durchklicken keine Berechnung.
  Live-Engine nur für eigene Varianten.
- Analyse-Stärke als Zeitbudget pro Stellung (Schnell/Standard/Gründlich), nicht als feste Tiefe.
- Kein Zoomen, nur vertikales Scrollen; Layout darf nie breiter als der Bildschirm werden.
- Figuren gleiten (Animation).
- Theoriezüge: Züge gelten als „Theoriezug“, solange jede Stellung ab Partiebeginn in der Eröffnungsdatenbank liegt; Eröffnungsname wird angezeigt.
- Töne: Der Nutzer lädt seine Tondateien (Lichess-Standard Move.mp3/Capture.mp3) einmal in den Einstellungen,
  sie liegen nur in `localStorage` (`sa_snd_move`, `sa_snd_capture`). **Diese Töne sind nicht frei lizenziert
  und dürfen nie ins (öffentliche) Repository.** Generell: jede fremde Datei vor dem Commit auf ihre Lizenz prüfen.
- Daten (Einstellungen, letzte 25 Partien mit Analyse, Töne) liegen in `localStorage` (Schlüssel `sa_*`).
  Sicherung/Wiederherstellung als JSON-Datei unter Einstellungen → „Erweitert“ (bewusst versteckt).
- Import: Liste der letzten Partien (chess.com-Monatsarchive rückwärts, Lichess mit `until`), „Ältere Partien laden“,
  bereits analysierte Partien markiert (Abgleich über PGN-Header).
- Startbildschirm (`#viewHome`): beim Öffnen der App kein Brett, sondern „Zuletzt gespielt“ mit Plattform (chess.com/Lichess),
  Ergebnis, Gegner und „vor X Std.“; Tipp → Analyse (`#viewBoard`), „‹ Start“ führt zurück. Darunter: PGN einfügen,
  gespeicherte Analysen, Analysebrett. Konten (Benutzernamen) werden auf dem Startbildschirm eingetragen.
- Startbildschirm-Extras: Wertungs-Kacheln (chess.com `/stats`, Lichess `/api/user`; Tipp → Verlaufsdiagramm mit Insights,
  Daten 12 Monate: chess.com-Monatsarchive, abgeschlossene Monate kompakt in `localStorage` `sa_cch_*` gecacht, nicht in Sicherung;
  Lichess `/api/games/user?perfType=…`), Bilanz (heute / letzte 10 / Serie), Filter nach Zeitkontrolle und Plattform,
  Liste zeigt 10 Partien + „Mehr anzeigen“, Karten „Aus Fehlern lernen“, „Deine Genauigkeit“ (Trend), „Deine Eröffnungen“.
- Gespeicherte Analysen enthalten `st` (Genauigkeit, eigene Farbe, Trainingsaufgaben = eigene Fehler/Patzer/Verpasst mit bestem Zug);
  ältere Einträge werden im Hintergrund nachberechnet (`enrichStored`). Trainer: Brett im Modus `game.trainer` (`body.training`),
  Fortschritt in `sa_train`.
- Übersicht (`#viewReview`) nach jeder Analyse bzw. beim Öffnen einer analysierten Partie: Spieler, Genauigkeit,
  Bewertungsverlauf, Anzahl je Bewertung (Hauptkategorien, Rest aufklappbar), geschätzte Spielstärke (eigene Heuristik
  aus der Genauigkeit, `estRating`), Zugliste, „Partie durchgehen“. Im Brett führt „Übersicht“ zurück.
