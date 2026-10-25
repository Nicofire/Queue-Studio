# Projektstatus und Aufgaben

Stand: 24.10.2026. Grundlage: aktueller Code der Webapp, Abgleich mit
[improvments.md](improvments.md) und [feature_list.md](feature_list.md).

`[x]` = im Code vorhanden, `[ ]` = noch offen. Vorhanden bedeutet nicht,
dass alle Funktionen in dieser Bestandsaufnahme praktisch getestet wurden.

## Kurzfassung

Das Projekt ist deutlich weiter als die alte Architekturanalyse und die README:
Es gibt eine lokale Queue-Manager-Webapp mit Kategorien, zwei Ansichten,
Eintragseditor, Einstellungen und einer AUTOMATIC1111-Generierungswarteschlange.
Mehrere der damals wichtigsten Architekturprobleme wurden bereits bearbeitet.

Die Anwendung braucht weiterhin den Vite-Entwicklungsserver fuer ihre API.
Ein erfolgreicher Produktionsbuild ergibt noch keine eigenstaendig betreibbare
Gesamtanwendung. Die wichtigsten naechsten Arbeiten sind automatisierte Tests,
zuverlaessigere Speicherung und ein geklaerter Betriebsweg ohne Vite-Dev-Server.

## Bereits Implementiert

- [x] React-19-/TypeScript-/Vite-Webapp mit List View, Tile View und Settings.
- [x] Kategorien ueber `GET /api/categories` vom Backend laden.
- [x] Gemeinsame Kategorien und Auswahl in `App`, auch beim Ansichtswechsel.
- [x] Kategorien anlegen, umbenennen und ihre Reihenfolge bearbeiten.
- [x] Eintraege anlegen, bearbeiten, loeschen und als Favoriten markieren.
- [x] Gemeinsamer Hook fuer Eintragsaktionen in List und Tile View.
- [x] Suche, Favoritenfilter und Auswahlfunktionen in beiden Ansichten.
- [x] Eintragseditor mit Prompts, LoRAs, Modellwahl und Vorschaubildverwaltung.
- [x] PNG-Metadaten beim Bildimport auslesen.
- [x] Batch-Vorschau mit 4 oder 9 Bildern und Auswahl eines Bildes zum Speichern.
- [x] Gemeinsame Prompt-Zusammensetzung fuer Frontend und Generierungsbackend.
- [x] Globale positive und negative Presets in Queue-Prompts einbeziehen.
- [x] Einstellungen und Presets laden und speichern; lokale Browserablage vorhanden.
- [x] Queue aus ausgewaehlten Eintragskombinationen erstellen und ans Backend senden.
- [x] Queue anzeigen, leeren, starten, pausieren, fortsetzen und abbrechen.
- [x] Backend-Status regelmaessig abrufen und Fortschritt nach Auftragsanzahl anzeigen.
- [x] Bilder ueber AUTOMATIC1111 `txt2img` erzeugen und im Tagesordner speichern.
- [x] Aktuellen Ausgabeordner aus der Oberflaeche oeffnen.

## Abgleich Mit Der Alten Analyse

| Frueherer Kritikpunkt                                    | Aktueller Stand                                                                         |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Statische Kategorieimporte statt gemeinsamer Datenquelle | Behoben: Backend-GET und gemeinsamer App-State.                                         |
| Auswahl und Daten je Ansicht getrennt                    | Gemeinsame Kategorien und Auswahl vorhanden; noch keine dauerhafte Auswahlablage.       |
| Ungepruefte Kategorie-IDs in Dateipfaden                 | Slug-Pruefung und Kontrolle des Zielpfads vorhanden.                                    |
| Unbegrenzte Request-Bodies                               | Groessenlimits im gemeinsamen Body-Reader vorhanden.                                    |
| Keine Bildpruefung                                       | Groessenlimit und grundlegende Signaturpruefungen vorhanden; weiter testen und haerten. |
| Ueberlappende Kategorie-Schreibzugriffe                  | Innerhalb eines Serverprozesses global serialisiert.                                    |
| Direkte Kategorie-JSON-Schreibzugriffe                   | Temporaere Datei und anschliessendes Umbenennen vorhanden.                              |
| Mehrdatei-Reorder ohne Transaktion                       | Weiter offen: atomar pro Datei, nicht fuer die gesamte Reihenfolge.                     |
| API nur im Vite-Entwicklungsserver                       | Weiter offen.                                                                           |
| Keine automatisierten Webapp-Tests                       | Weiter offen: keine Testdateien oder Testskripte gefunden.                              |
| README beschreibt nur einen Starter                      | Weiter offen.                                                                           |

## Aufgaben Nach Prioritaet

### P1: Korrektheit Und Datensicherheit

- [ ] Automatisiertes Test-Setup fuer die Webapp einrichten.
- [ ] Queue-Kombinationen, Prompt-Zusammensetzung und PNG-Metadaten mit Unit-Tests absichern.
- [ ] Kategorie-API in temporaeren Verzeichnissen testen: CRUD, Favoriten,
      Umbenennen, Reorder, parallele Mutationen, ungueltige IDs und zu grosse Bodies.
- [ ] Settings und Presets vor dem Speichern mit gemeinsamen Laufzeitschemas
      validieren. Aktuell akzeptiert die Config-API beliebige JSON-Strukturen.
- [ ] Settings und Presets ebenfalls atomar speichern und Schreibzugriffe
      koordinieren. Dort wird bislang direkt mit `writeFile` geschrieben.
- [ ] Kategorie-Reorder als zusammenhaengende Operation absichern, etwa durch
      ein Reihenfolge-Manifest oder eine Datenbanktransaktion.
- [ ] Konsistenz zwischen Kategorie-JSON und Bilddateien bei Schreibfehlern
      absichern; Wiederherstellung und Bereinigung verwaister Dateien vorsehen.
- [ ] Upload-Limits abstimmen: Kategorie-Requests sind auf 2 MB begrenzt,
      waehrend das Bildlimit 8 MB betraegt. Base64 belegt zusaetzlichen Platz.
- [ ] Uebergrosse Requests praktisch testen: `req.destroy` beendet derzeit die
      Verbindung; eine verlässlich lesbare HTTP-413-Antwort ist damit zu pruefen.
- [ ] Generierungsfehler pro Auftrag sichtbar speichern und Erfolg, Fehler
      sowie nur abgearbeitete Auftraege unterscheiden. Der Worker erhoeht derzeit
      auch nach Fehlern `runCompleted` und arbeitet anschliessend weiter.

### P2: Betrieb Und Wiederaufnahme

- [ ] Zielbetrieb festlegen: lokale Webapp mit eigenem Node-Server oder Desktop-App.
- [ ] API aus dem Vite-Plugin in einen eigenstaendig startbaren Server auslagern.
- [ ] Start-, Stop-, Daten- und Ausgabepfade fuer diesen Betrieb dokumentieren.
- [ ] Queue dauerhaft speichern und Wiederaufnahme nach Serverneustart definieren.
      Aktuell liegen Queue und Laufstatus nur in Modulvariablen im Arbeitsspeicher.
- [ ] Eintragsauswahl und gewuenschten Workspace-Zustand dauerhaft speichern.
      Der gemeinsame React-State uebersteht einen Tabwechsel, aber keinen Reload.
- [ ] Grosse Queues begrenzen oder lazy/in Batches aufbauen. Aktuell erzeugt
      `buildQueueCombinations` das gesamte kartesische Produkt im Browser.
- [ ] Statusabfragen bei grossen Queues begrenzen oder paginieren; derzeit wird
      die komplette Liste wartender Auftraege bei jedem Poll uebertragen.
- [ ] API-Vertraege und Fehlerantworten vereinheitlichen; Validierungsfehler,
      Konflikte und interne Dateisystemfehler unterscheidbar machen.
- [ ] End-to-End-Tests fuer Ansichtswechsel, Eintragsbearbeitung, Vorschau und
      Queue-Steuerung ergaenzen; AUTOMATIC1111 dabei fuer reproduzierbare Tests mocken.

### P3: Funktionen Und Pflege

- [ ] Kategorien ein-/ausblenden und ausgeblendete Kategorien beim Queue-Aufbau
      ignorieren; ihre Reihenfolge trotzdem erhalten. Wunsch aus der Feature-Liste.
- [ ] Gewuenschte Statistiken definieren und implementieren. Bisher gibt es
      Queue-Fortschritt, aber keine eigene Statistikfunktion.
- [ ] README auf den echten Funktionsumfang, aktuelle Node-Anforderungen,
      AUTOMATIC1111-Anbindung und die Grenze von Build/Preview aktualisieren.
- [ ] Alte Feature-Liste bereinigen: Generation und Batch-Vorschau sind nicht mehr offen.
- [ ] SQLite bei wachsendem Bedarf an Transaktionen und Queue-Persistenz bewerten.
      Eine sofortige Komplettmigration ist keine Voraussetzung fuer die naechsten Schritte.

## Pruefung Bei Dieser Bestandsaufnahme

- `npm --prefix queue-manager run build`: erfolgreich.
- `npm --prefix queue-manager run lint`: erfolgreich.
- Keine automatisierten Tests fuer die Webapp gefunden; Python-Altbestand ausgenommen.
- Kein Browser-/Live-Test gegen AUTOMATIC1111 durchgefuehrt.
- Keine Laufzeitgarantie fuer Bildgenerierung, Pause/Abbruch oder Dateifehler aus
  Build und Lint ableiten; diese Ablaufe brauchen gezielte Integrationstests.
- Vorhandene lokale Aenderungen und Projektdaten wurden nicht bearbeitet.

## Relevante Code-Stellen

- [Gemeinsamer App-Zustand](src/App.tsx)
- [Kategorie-API und Dateischutz](dev-server/categorys-api.ts)
- [Request-Groessenlimits](dev-server/http-utils.ts)
- [Settings-/Preset-Speicherung](dev-server/config-files-api.ts)
- [Vite-API-Einbindung](dev-server/project-api-plugin.ts)
- [Generierungsbackend](dev-server/generation-api.ts)
- [Queue-Oberflaeche und Payload-Aufbau](src/components/GenerationQueueDock.tsx)
- [Queue-Kombinationen](src/features/categories/queueBuilder.ts)
- [Eintragseditor und Batch-Vorschau](src/components/CategoryEntryModal.tsx)
