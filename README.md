# Sing Local

Sing Local ist eine vollständig lokale Browser-Karaoke-App für UltraStar-TXT-Dateien. Sie läuft als statische Website auf GitHub Pages; es gibt keinen Server-Upload und keine Datenbank.

## Funktionen

- einzelne TXT-/Audiodateien oder komplette Ordner mit mehreren Songs laden
- UltraStar-TXT mit `#BPM`, `#GAP`, Tempoänderungen, relativen Charts, Duetten und Stimmenmarkern lesen
- 1–4 Spieler mit jeweils eigenem USB-Mikrofon
- Solo-Zeilen reihum auf alle Spieler verteilen; zusätzliche Duett-Spieler teilen sich die jeweiligen Rollen
- Echtzeit-Tonhöhenerkennung und Wertung in Easy, Normal oder Hard
- aktuelle und nächste Gesangszeile sowie Silbentext direkt auf den Notenbalken
- große, bildschirmfüllende Karaoke-Ansicht mit eigener Bahn pro Spieler
- Musiklautstärke, Mikrofonverstärkung und optionale Mikrofon-Ausgabe pro Spieler
- Audioausgabe auswählen, wenn der Browser `setSinkId()` unterstützt
- lokale Instrumental-Version aus Stereo-Audio erzeugen und während des Songs umschalten
- TXT im Browser prüfen, ändern und wieder herunterladen
- Spielernamen, Farben, Geräte-IDs, Schwierigkeit und Latenz lokal speichern

## Datenschutz

Song-TXT und Audiodateien bleiben ausschließlich im Arbeitsspeicher des geöffneten Tabs. Sie werden nicht hochgeladen und nicht in `localStorage` oder IndexedDB abgelegt. Beim Neuladen oder Schließen der Seite verschwinden sie. Nur die Einstellungen werden in `localStorage` gespeichert.

## Nutzung

1. Website in aktuellem Chrome oder Edge öffnen. GitHub Pages liefert die für Mikrofonzugriff nötige HTTPS-Verbindung.
2. `Dateien wählen` für TXT + Audio oder `Song-Ordner wählen` für mehrere Songs verwenden.
3. Beim gewünschten Song `Singen` drücken.
4. `Geräte freigeben` drücken und die Browserberechtigung erlauben.
5. Jedem Spieler ein anderes Mikrofon zuweisen und starten.

Firefox und Safari können die System-Standardausgabe verwenden, unterstützen die direkte Lautsprecherauswahl aber je nach Version nicht. Verfügbare Audioformate hängen vom Browser ab; MP3, WAV und OGG sind die sichersten Varianten.

Die Instrumental-Funktion reduziert das Signal in der Stereomitte und speichert das Ergebnis als temporäre WAV-Version im Arbeitsspeicher. Sie funktioniert besonders bei mittig abgemischtem Gesang. Bei Mono-Dateien oder stark verteilten Vocals kann sie den Gesang nicht zuverlässig entfernen. Mikrofon-Monitoring sollte mit Kopfhörern verwendet werden, um Rückkopplungen zu vermeiden.

## Lokal entwickeln

ES-Module und Mikrofone benötigen einen Webserver. Nicht direkt per `file://` öffnen.

```bash
python3 -m http.server 8080 -d site
```

Dann `http://localhost:8080` öffnen. `localhost` gilt für Browserberechtigungen als sicherer Kontext.

## Tests

Node.js 20 oder neuer:

```bash
npm test
```

## Deployment

Der Workflow `.github/workflows/pages.yml` testet den Parser, aktiviert GitHub Pages und veröffentlicht den Ordner `site`. Falls die automatische Aktivierung durch Repository-Richtlinien blockiert wird, unter **Settings → Pages → Build and deployment → Source** einmalig **GitHub Actions** auswählen.

## Technische Hinweise

- [GitHub Pages mit GitHub Actions](https://docs.github.com/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [MediaDevices.enumerateDevices()](https://developer.mozilla.org/docs/Web/API/MediaDevices/enumerateDevices)
- [HTMLMediaElement.setSinkId()](https://developer.mozilla.org/docs/Web/API/HTMLMediaElement/setSinkId)

## Lizenz

MIT – siehe `LICENSE`.
