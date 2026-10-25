# Desktop-UI: Redesign und Abnahme

## Ziel und Umfang

Umgesetzt ist die freigegebene grundlegende Neugestaltung fuer Desktop.
Die Oberflaeche bleibt ein kompaktes Arbeitswerkzeug, keine Landingpage.
Bestehende Kategorie-, Prompt-, Vorschau-, Preset- und Queue-APIs bleiben erhalten.
UI-Beschriftungen sind weiterhin Englisch; eine Internationalisierung wurde nicht eingefuehrt.

## Umsetzung

- **Navigation:** Library, Queue und Settings in einer beschrifteten Seitenleiste. List und Tiles sind Ansichten innerhalb der Library.
- **Layout:** feste Bereiche fuer Navigation, Kontextleiste, scrollbaren Inhalt und die gemeinsame Generierungsleiste. Die beiden ueberlagernden Floating-Docks und ihre alten Komponenten wurden entfernt.
- **Design:** semantische Hell-/Dunkel-Tokens, neutrale Flaechen, gezielter Teal-Akzent, lokal ausgelieferte IBM Plex Sans, Lucide-Icons und kompakte Controls. Iconaktionen haben sichtbare Tooltips bei Hover und Tastaturfokus.
- **Library:** Listen mit kleinen Bildvorschauen, getrennten Auswahl-/Favorit-/Edit-Aktionen, explizitem Rename-Button und erhaltenem Drag-Reorder. Tiles haben eine eigene native Auswahltaste ohne verschachtelte Aktionsbuttons.
- **Zustand:** Beide Library-Ansichten bleiben beim Navigieren gemountet und werden ausgeblendet. So bleiben vorhandene Such-, Filter-, Kategorie- und Auswahlzustaende erhalten, ohne eine zweite State-Abstraktion einzufuehren.
- **Queue:** Ein App-weiter Hook kontrolliert Statuspolling und Befehle. Veraltete Pollantworten ueberschreiben keine neueren Commands; ein erfolgreicher Poll loescht keinen Befehlsfehler. Die Queue-Seite trennt aktuellen Auftrag und wartende Jobs. Fortschritt, Status und Aktionen bleiben auf allen Seiten sichtbar.
- **Editor:** nativer Modal-Dialog mit Formular-/Medienbereich, erreichbarem Footer, initialem Fokus, Fokusbegrenzung und Rueckgabe an den Ausloeser. Ungespeicherte Aenderungen benoetigen eine Verwerfungsbestaetigung. Batch 4/9, Auswahl eines Bildes, Upload/Ersetzen/Entfernen und Loeschbestaetigung bleiben erhalten.
- **Settings:** Connection & Generation, Prompt Presets und Appearance als getrennte Bereiche. Seed als Zahleneingabe mit Random-Aktion statt Slider. Speicherrueckmeldungen sind abschnittsbezogen; bestehende Persistenzsektionen und explizite Save-Aktionen bleiben erhalten.

Es gibt keine neue Queuepersistenz, Jobbearbeitung oder Smartphone-Produktfassung.
Promptzusammensetzung, Kombinationslogik und Nutzerdaten wurden nicht umgebaut.

### Generierungsstatistik

- Die Queue-Seite zeigt erfolgreich gespeicherte Bilder, durchschnittliche Sekunden pro Bild, die letzte Bilddauer, die Laufzeit des aktuellen Auftrags und eine geschaetzte Restzeit. Die Restzeit erscheint auch kompakt in der Statusleiste.
- Der Status-Endpunkt liefert dazu das zusaetzliche Feld `statistics`. Die Messung laeuft serverseitig mit einer monotonen Uhr, vom Auftragsbeginn bis einschliesslich Bildspeicherung. Editor-Vorschauen zaehlen nicht mit.
- Der Bilddurchschnitt verwendet die tatsaechliche Anzahl erfolgreich gespeicherter Bilder. Fehlgeschlagene und abgebrochene Auftraege zaehlen nicht als erfolgreiche Bilder. Pause zwischen Auftraegen geht nicht in deren Dauer ein; der beim Pausieren bereits laufende Auftrag darf wie bisher fertiglaufen.
- Die ETA verwendet die durchschnittliche erfolgreiche Auftragsdauer fuer wartende Jobs und beruecksichtigt die bereits verstrichene Laufzeit des aktuellen Auftrags. Vor dem ersten erfolgreichen Bild gibt es keinen erfundenen Schaetzwert. Ein ueberdurchschnittlich langsamer laufender Auftrag wird nicht als bereits fertig dargestellt.
- Bei Pause bedeutet die Restzeit reine noch benoetigte Verarbeitungszeit, ohne die unbekannte Laenge der Pause. Modellwechsel, Aufloesung, Steps und andere Auslastung koennen die Schaetzung veraendern; sie ist keine zugesicherte Fertigstellungszeit.
- Die Werte gelten fuer den aktuellen Lauf. Fortsetzen behaelt sie; ein neuer Lauf, Hinzufuegen oder Leeren setzt sie zurueck. Abbruch behaelt bereits gemessene Bildwerte, zeigt aber keine Restzeit mehr. Die Werte werden nicht dauerhaft gespeichert.

## Verifikation

Die Playwright-Suite enthaelt **26 Tests**: 20 Browsertests mit isolierten API-Mocks, 5 Berechnungstests und 1 Backend-Integrationstest:

- Hell/Dunkel bei 1920x1080, 1440x900, 1280x800 und 1024x768, mit Screenshots und Overflow-/Layoutpruefungen.
- Kontrast von Text, Primaeraktion und Eingabekonturen; der Themewechsel animiert keine gegeneinander versetzten Text-/Hintergrundfarben mehr.
- Auswahl und Suche ueber Seiten-/Ansichtswechsel; Favoritenfilter und Select All mit nicht sichtbarer Auswahl.
- Tile-Favorit/Edit per Tastatur ohne versehentliche Auswahl; Tooltips bei Fokus; Dialogfokus, Escape, Fokus-Rueckgabe und Dirty-Bestaetigung.
- Kategorieerstellung/-umbenennung und Drag-Reorder einschliesslich Rollback bei fehlgeschlagener Persistenz.
- Vorschau-Batches 4/9, Bildauswahl und Save-/Delete-Payloads sowie Bildimport, Ersetzen, Entfernen und Modell-Fallback bei API-Fehlern.
- Queue Add/Start/Pause/Resume/Abort/Clear/Open Output, globale Presets, passende Disabled-Zustaende und seitenuebergreifender Status.
- Queue-Screenshots fuer running, paused, completed, aborted und Fehler; Befehlsfehler bleiben nach erfolgreichen Polls sichtbar.
- Unabhaengige Settings-Saves, Retry nach Kategorienfehlern, leere Daten und lange Namen/Modelle/Prompts.
- Schmale Fenster und eine effektive Desktop-Viewportgroesse von 960x540 als Layoutpruefung fuer 1920x1080 bei 200 Prozent Zoom.
- Statistikberechnung ohne Samples, mit mehreren Bildern, laufendem Auftrag, Pause, Fehler, Abbruch und Reset; Statistikdarstellung einschliesslich Restzeitanzeige.
- Der echte Queue-Handler wird gegen eine lokale simulierte Bild-API mit einem temporaeren Projektverzeichnis geprueft. Bilddateien werden ausschliesslich dort geschrieben und danach entfernt.

Build, ESLint und die vollstaendige UI-Suite wurden erfolgreich ausgefuehrt.
Screenshots werden pro Lauf unter `test-results/` erzeugt und sind nicht versioniert.
Die Suite ist eine Regressionstestbasis, kein vollstaendiges Accessibility-Audit.

### Befehle

Aus dem Repository-Hauptverzeichnis:

```powershell
npm run dev -- --host 127.0.0.1
npm run build
npm run lint
npm run test:ui
```

Vor dem ersten Browser-Testlauf einmal Chromium installieren:

```powershell
& .\node_modules\.bin\playwright.cmd install chromium
```

Die Tests starten ihren eigenen Vite-Server auf Port 5181. Browser-API-Aufrufe werden
abgefangen; der Backendtest verwendet separate lokale Testserver und temporaere Dateien.
Es werden keine echten Bilder generiert, Nutzerdaten geaendert oder Ausgabeordner
geoeffnet. Ein regulaerer Dev-Server kann daneben laufen.

## Grenzen und Offene Punkte

- Keine neue Live-Abnahme gegen Automatic1111: echte Generierung, Dateisystemintegration und PNG-Metadaten-End-to-End sind nicht Teil dieser gemockten UI-Abnahme.
- Die Zoompruefung verwendet eine aequivalente CSS-Viewportgroesse, keinen automatisierten Browser-Zoom. Native Browser-/Betriebssystemkombinationen und Screenreader wurden nicht vollstaendig abgenommen.
- Die Abhaengigkeitsinstallation meldete 8 npm-Audit-Befunde: 1 moderate und 7 high. Keine automatischen Major-Upgrades oder pauschalen Audit-Fixes wurden in das UI-Redesign aufgenommen.
