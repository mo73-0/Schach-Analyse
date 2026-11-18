# Zugzwang (Repo: Schach-Analyse) – Hinweise für Claude

Persönliche Schach-Analyse-Web-App **„Zugzwang“** (Deutsch), läuft komplett im Browser und wird über
**GitHub Pages** vom Branch `main` (Ordner `/`) ausgeliefert: https://mo73-0.github.io/Schach-Analyse/
Hauptnutzer: iPhone, als Homescreen-App (PWA). Alle Texte in der App sind Deutsch.

## Aufbau
- `src/` – **Quellcode, nur hier ändern**
  - `template.html` – HTML + CSS, Platzhalter `<!--HEAD-->`, `/*FLAGS*/`, `/*CHESS*/`, `/*PIECES*/`, `/*ANALYSIS*/`, `/*APP*/`
  - `chess.js` – eigene Schachlogik (Zuggenerator, SAN, FEN, PGN-Parser), Feld 0 = a8
  - `analysis.js` – Zugbewertung (Brillant…Patzer), Genauigkeit, Gewinnwahrscheinlichkeit; `CLASSES[x].desc` = Erklärung der Kategorie
  - `explain.js` – Erklärungen/Taktik-Motive aus Engine-Zeilen (`Explain.explain`, `lineMotif`: Matt, Gabel, ungedeckte Figur, Materialgewinn, Kombination)
  - `pieces.js` – Figuren (cburnett) als SVG-Data-URIs
  - `openings.js` – **generiert** von `gen_openings.js` aus lichess-org/chess-openings (CC0): Hashes aller Theoriestellungen + Eröffnungsnamen
  - `app.js` – UI, Engine-Steuerung (mehrere parallele Stockfish-Worker), Import von chess.com/Lichess, Töne, Einstellungen
  - `build.py` – baut `index.html`, schreibt `version.json` (App-Version = Hash der Quellen, für den Update-Hinweis) und setzt die Cache-Version in `sw.js`
  - `test_chess.js` – Perft-/PGN-Tests für `chess.js`
- `index.html` – **generiert**, nie von Hand bearbeiten
- `sw.js` – Service Worker (Offline): `index.html` network-first, `version.json` nie gecacht, alles andere cache-first
- `version.json` – **generiert**; die App vergleicht sie beim Start/Zurückkehren mit ihrer eigenen Version und zeigt „Neue Version verfügbar“
- `stockfish/` – Stockfish 19 Lite single-threaded (stockfish.js von nmrugg, GPLv3)
- `pieces/<set>/` – weitere Figurensets (SVG + Lizenzdatei je Ordner, siehe `THIRD_PARTY.md`); werden bei Auswahl geladen und vom Service Worker zur Laufzeit gecacht
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
- Figuren gleiten (Animation). Unter den Spielernamen: geschlagene Figuren (eigene cburnett-SVGs) + Materialvorsprung „+N“.
- Steuerleiste unter dem Brett: [Anfang] [◀ breit] [▶ breit] [Ende]; Brett drehen sitzt oben in der Kopfzeile (nur im Brett).
- Bewertungsleiste: bei erzwungenem Matt (und im Matt) komplett gefüllt.
- Theoriezüge: Züge gelten als „Theoriezug“, solange jede Stellung ab Partiebeginn in der Eröffnungsdatenbank liegt; Eröffnungsname wird angezeigt.
- Töne: Der Nutzer lädt seine Tondateien (Lichess-Standard Move.mp3/Capture.mp3) einmal in den Einstellungen,
  sie liegen nur in `localStorage` (`sa_snd_move`, `sa_snd_capture`). **Diese Töne sind nicht frei lizenziert
  und dürfen nie ins (öffentliche) Repository.** Generell: jede fremde Datei vor dem Commit auf ihre Lizenz prüfen.
- Daten (Einstellungen, letzte 25 Partien mit Analyse, Töne) liegen in `localStorage` (Schlüssel `sa_*`).
  Sicherung/Wiederherstellung als JSON-Datei unter Einstellungen → ganz unten „Daten“ (nicht eingeklappt, nur bewusst weit unten).
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
- **Bewertungsmodell an chess.com kalibriert** (`analysis.js`, Objekt `EP`): Erwartete Punkte = Logistik in Centipawns mit
  wertungsabhängiger Steilheit k(R) = 0.003·(R+1300)/2000 (R aus WhiteElo/BlackElo, sonst 1000); Grenzen Exzellent/Gut/
  Ungenauigkeit/Fehler = 0.02/0.05/0.08/0.30 verlorene erwartete Punkte; Bester Zug = Top-Zug der Engine mit Verlust ≤ 0.02;
  Verpasst = Gegner verlor zuvor ≥ 0.10 und dieser Zug gibt ≥ 0.05 zurück; Theorie läuft bis Halbzug 10 weiter, solange
  Verlust ≤ 0.03; Zug-Genauigkeit max(−100, 100 − 16·(100·Verlust)^0.7), Theoriezüge = 100 (seit 17.11.2026), Partie-Genauigkeit = Mittelwert; Spielstärke
  = −364 + 0.2·Genauigkeit² (gerundet auf 50). Gefittet am 14.11.2026 auf 10 Partien des Nutzers (~700 Elo) gegen
  chess.com-Screenshots: Genauigkeit RMSE 14,6 → 5,6; Zugbewertungen ca. 25 % weniger Abweichung (Kreuzvalidierung bestätigt).
  Kalibrierdaten (PGNs, Screenshots) liegen bewusst **nicht** im Repo (fremde Spielernamen). Für eine Nachkalibrierung:
  Export (s. u.) + neue Screenshots vom Nutzer anfordern. Gespeicherte Statistiken tragen `st.v = 6` (v3 gefilterte, v4 mehrzügige, v5 Aufgaben mit Vorzug `pre` und `bestCp`, v6 Theoriezüge = 100).
  Nachkalibrierung 17.11.2026 mit 3 Lichess-Partien (PGN bei chess.com eingefügt): Genauigkeit RMSE chess.com-Partien
  5,6 → 5,1, Lichess-Partien 11,1 → 8,4. Arbeitsdaten/Notizen außerhalb des Repos (`/home/claude/calib`, `li/NOTES.md`).
- Kalibrierungs-Export ist dauerhaft drin (Wunsch des Nutzers, 17.11.2026): „Gespeicherte Analysen“ → unten
  „Kalibrierungsdaten exportieren“ (`#bCalib`) → `zugzwang-kalibrierung-DATUM.json` mit analysierten Partien inkl.
  Engine-Daten (`ev`, `st`, Analyse-Stärke) und den PGNs der zuletzt gespielten Partien. Der Nutzer schickt immer mal
  2–3 Partien + chess.com-Review-Screenshots (Genauigkeit, Anzahl je Bewertung). Daten sammeln (außerhalb des Repos),
  bei genügend neuen Partien `EP` in `analysis.js` neu fitten (Kreuzvalidierung, nur übernehmen wenn besser), danach
  `st.v` erhöhen, damit gespeicherte Statistiken neu berechnet werden.
- Übersicht (`#viewReview`) nach jeder Analyse bzw. beim Öffnen einer analysierten Partie: Spieler, Genauigkeit,
  Bewertungsverlauf, Anzahl je Bewertung (alle Kategorien immer sichtbar, Reihenfolge wie chess.com: Brillant … Patzer), geschätzte Spielstärke (eigene Heuristik; alle Zahlen, Symbole und die Zugliste im selben Raster: Spalte Weiß | Symbol | Schwarz)
  aus der Genauigkeit, `estRating`), Zugliste; Knopf „Partieanalyse starten“ ist unten am Bildschirm fixiert (`.rvfoot`, position:fixed – sticky funktioniert wegen overflow-x auf body nicht). Im Brett führt „Übersicht“ zurück.
- Ergebnis-/Abschlusstext (Übersicht-Kopf, Startkarte im Brett) immer Deutsch über `resultText(h, letzteFen)`: übersetzt
  chess.com-`Termination` („X won by checkmate/on time/…“, „Game drawn by …“) und Lichess („Normal“ → aus Endstellung
  Matt/Patt/sonst Aufgabe, „Time forfeit“ → auf Zeit).
- App-Name „Zugzwang“ (Titel, Manifest, Homescreen). Der Name steht oben nur auf dem Startbildschirm, in Übersicht/Brett nicht.
  Sicherungsdateien behalten intern `app: 'schach-analyse'` (Kompatibilität mit alten Sicherungen).
- App-Icon (`icon-512.png`, `icon-192.png`, `apple-touch-icon.png` 180 px): weißer cburnett-König (Kreuz weiß) auf schwarzem Hintergrund,
  unten rechts eigene türkise „!!“-Plakette (Brillant), die den König überlappt. Erzeugt aus einer SVG mit `rsvg-convert`; die SVG liegt nicht im Repo.
- Eigene Varianten-Züge bekommen ebenfalls eine Bewertung (`classifyVariation`): Stellung vor/nach dem Zug wird mit dem
  Zeitbudget der Partieanalyse (MultiPV 2) auf einer Helfer-Engine bewertet (Cache `varEv`), dann `A.classify` wie bei
  Partiezügen. Anzeige: Symbol auf dem Brett, Feedback-Karte („Eigener Zug (Variante)“ / „Bester Zug war …“), Symbole in der Variantenleiste.
- Scroll-Sperre: Solange ein Fenster (`.modal.open`, Analyse-Overlay `#anaov`) offen ist, wird `body` per `position:fixed`
  festgehalten (`syncScrollLock`, MutationObserver auf Klassenänderungen) und die Scrollposition beim Schließen wiederhergestellt.
- Ton nach App-Wechsel (iOS): beim Verlassen (`visibilitychange` hidden / `pagehide`) wird `Sound.stale` gesetzt; bei der
  nächsten Berührung (`pointerdown`/`touchend`, Capture-Phase) wird ein neuer AudioContext erzeugt und mit einem stillen
  Sample entsperrt (die dekodierten Buffer werden weiterverwendet). Nur `resume()` reichte auf iOS nicht.
- Erklärungen: Feedback-Karte (Partie- und Variantenzüge) zeigt unter „Bester Zug war …“ einen Satz aus `Explain.explain`
  (was der Gegner jetzt kann: Matt/Gabel/ungedeckte Figur/Materialverlust; was übersehen wurde). Materialsätze nur, wenn die
  Bewertung um ≥ 1,5 Bauern fällt. In der Übersicht erklärt ein Tipp auf eine Bewertungszeile die Kategorie (`desc`).
- „Aus Fehlern lernen“ ist gefiltert (`trainTask`), Ziel: Mittelweg mit Fokus auf Lerneffekt (10 Kalibrierpartien: 47 → 13):
  (1) verpasste Taktik: Matt in ≤ 5 oder ≥ 2 Punkte Materialgewinn in ≤ 6 Halbzügen, Verlust ≥ 0.08, Partie nicht schon
  klar gewonnen (eb < 0.97); simples Zurückschlagen nur bei Verlust ≥ 0.20 („Zurückschlagen“).
  (2) eigener Zug stellte eine Figur ein / erlaubte Matt (Gegnergewinn ≥ 3 und Bewertung fällt ≥ 1,5 Bauern, eb > 0.15):
  „Figur nicht einstellen“ / „Drohung abwehren“ / „Matt verhindern“, einzügig.
  Gleiche Taktik nur einmal pro Partie. Gelöste Aufgaben verschwinden aus der Liste (`buildTasks(true)` = alle, für „gelöst“).
- Trainer: Aufgabe startet eine Stellung früher und spielt den Gegnerzug animiert (`t.pre`). Tipp (Motiv `mo`) nur per
  Knopf „Tipp“ neben „Lösung zeigen“. Lösung (`line`, `solutionLine`): Matt in N → alle Züge (nur wenn die Zeile im Matt
  endet); Material → nur der Schlüsselzug, wenn er das Material schon gewinnt, sonst max. 2 eigene Züge; Gegnerzüge spielt
  die App. Abweichender 1. Zug wird von der Engine geprüft (`checkTrainMove`): richtig, wenn er die Bewertung von `bestCp`
  hält (−60 cp; bei Matt-Aufgaben muss Matt bleiben). Jeder sofort mattsetzende Zug zählt. `why` nach der Lösung.
- Trainer-Navigation: Steuerleiste (Anfang/◀/▶/Ende) ist auch im Training sichtbar, z. B. um den Gegnerzug nochmal
  anzusehen. Züge nur in der aktuellen Aufgabenstellung (`ply === positions.length - 1`); ein Tipp aufs Brett beim
  Zurückblättern springt dorthin zurück. `trainerApply` setzt `ply` immer ans Ende.
- Gelöste Aufgabe deutlich markiert: Karte wird grün umrandet/hinterlegt mit großem ✓ „Aufgabe gelöst!“ (+ „Im ersten
  Versuch!“ bzw. „im N. Versuch“), Brett blinkt kurz grün (`flashSolved`), nur noch Knopf „Nächste Aufgabe“. Mit
  „Lösung zeigen“ geschafft → orange „Mit Lösungshilfe geschafft“ (Aufgabe bleibt offen).
- Falscher Zug im Training (`wrongTrainMove`): Zug bleibt stehen, Engine-Antwort des Gegners (aus `checkTrainMove` bzw.
  kurze Suche 200 ms; Prüfung des 1. Zugs 350 ms) kommt ca. 0,5 s nach dem eigenen Zug, Text erklärt sie („Na7? Rxa7
  schlägt deinen Springer.“, Matt, Gabel), nach 1,0 s werden Antwort und eigener Zug animiert zurückgenommen → neuer Versuch. Währenddessen kein Blättern (`goto` gesperrt).
- Nach gelöster Aufgabe geht es automatisch frei weiter (`continueFromTask`, kein Extra-Knopf): Aufgabe wird zur normalen
  Partie (`game.sandbox`), weitere Züge (beide Seiten) laufen als Variante mit Bewertungssymbolen, Engine-Zeilen und
  Bewertungsleiste. Die Aufgabenkarte (gelöst + „Nächste Aufgabe“) bleibt sichtbar über `body.traindone`.
- Bewertungsleiste ist im Training immer sichtbar: zeigt die bekannte Bewertung der Aufgabenstellung (`t.bestCp`,
  bei Matt „M N“ aus `t.mo`) über `currentLines()` – keine Live-Engine während des Lösens, Brett springt nicht.
- Aussehen (Einstellungen → „Aussehen“): 12 eigene Brettfarben (`THEMES`) + „Eigene Farben“ (`S.boardLight/boardDark`)
  + „Eigenes Bild“ (`sa_board_img`, quadratisch 720 px JPEG, Felder dann transparent); Muster (`S.pattern`: Holzmaserung,
  Leinen, Glanz – reines CSS). Figuren (`S.pieces`, `pieceUrl()`): cburnett (eingebaut) + chessnut, fantasy, spatial, celtic,
  firi, kiwen-suwi, shapes (`pieces/`) + „Eigene“ (`sa_pieces_custom`, 12 Dateien, Name → Figur über `pieceKeyFromName`,
  PNG auf 160 px verkleinert, SVG ≤ 150 KB). Neue Sets nur nach Lizenzprüfung an der Originalquelle (siehe THIRD_PARTY.md:
  geprüft 17.11.2026, nicht-freie bzw. unklare Sets bewusst ausgelassen).
- Töne: `S.soundSet` = wood/click/soft/digital/glass (im Code synthetisiert, `Synth`) oder custom (eigene Dateien wie bisher).
  Bestehende Nutzer mit eigenen Tönen starten mit „custom“. Beim Umschalten kurze Hörprobe (Zug + Schlag).
- Schachuhr: große Karte auf dem Startbildschirm direkt unter „Deine Eröffnungen“ (`#bHomeClock`). Erst Auswahl (`#clkMode`): „Klassische Uhr“
  oder „Uhr mit Spracheingabe“, dann Bedenkzeit (`#clkSetup`, Vorgaben 1+0 … 90+30 oder eigene, `S.clockTC`).
  `Clock` in `app.js` (Zeit über `performance.now()`, Wake Lock iOS 16.4+, `Clock.moved(side)` = Zug + Inkrement + Wechsel).
  Klassisch (`#clkPlay`): zwei große Hälften (obere 180° gedreht), Tippen auf die eigene Hälfte (`pointerdown`), Schwarz
  tippt zuerst; Pause, Neu, Ton, Zugzähler, unter 20 s orange, unter 10 s Zehntel, Zeitablauf rot + Ton.
- Spracheingabe-Modus (`#clkVoice`, Namen `S.clockNames`): oben/unten schmale Uhren, in der Mitte großes Brett (aktuelle
  Brettfarbe/Figuren). „Start“ startet die Uhr von Weiß (und entsperrt die Sprachausgabe). Züge werden angesagt, die Uhr
  wechselt nach erkanntem Zug selbst (kein Tippen). `src/voice.js` (`Voice.match`, `normalise`) wandelt gesprochenes Deutsch
  in legale Züge – Umgangssprache („Springer f drei“, „die vier“, „Läufer schlägt e5“, „kurze Rochade“, „a8 Dame“, „zurück“)
  und offizielle Notation (K D T L S, auch gesprochen „es f3“/„el e2“; „Sbd2“, „T1a3“, „cxd5“, „e schlägt d5“, „Sb1-d2“,
  „0-0“/„null null“, „0-0-0“, „a8D“/„a8=S“, „+“/„#“ werden ignoriert). Unvollständige Angaben werden über die legalen Züge
  ergänzt; nur bei echter Mehrdeutigkeit Rückfrage.
  `Dict` in `app.js`: Web Speech API (de-DE, continuous, 5 Alternativen, Neustart bei `onend`), Rückfragen per
  Sprachausgabe (`speechSynthesis`, Mikrofon pausiert solange): unklar aber schachartig → „Nochmal bitte.“ / „Der Zug geht
  nicht.“, sonstiges Gerede wird ignoriert; mehrdeutig → „Springer von F 3 oder B 1?“ und Antwort („b eins“, „b“, „f3“)
  über `pickFrom`. Zurücknehmen gibt den Zug an den Spieler zurück. Brett antippen = manuelle Eingabe. Matt/Patt/Zeitablauf
  → Ansage + Ergebnisdialog; „Beenden & analysieren“ → PGN → `importOne` → normale Analyse. Uhr-Klickton im Sprachmodus
  aus (iOS: Audio kann das Mikrofon blockieren). Spracherkennung/-ausgabe über Apple. Testknopf in der Einstellung.
