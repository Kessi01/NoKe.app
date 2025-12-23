# NoKe Browser-Plugin

Ein Browser-Plugin für den NoKe Passwort-Manager. Unterstützt Chrome, Edge und andere Chromium-basierte Browser.

## Features

- 🔐 **Sichere Authentifizierung** - Verbindung mit NoKe über API-Token
- 🔍 **Passwort-Suche** - Schnelles Finden von Zugangsdaten
- ✨ **Autofill** - Automatisches Ausfüllen von Login-Formularen
- 🔑 **Passwort-Generator** - Sichere Passwörter generieren
- 🌐 **URL-Matching** - Automatische Erkennung passender Einträge

## Installation

### Entwicklermodus (Chrome/Edge)

1. Öffne `chrome://extensions/` (Chrome) oder `edge://extensions/` (Edge)
2. Aktiviere den **Entwicklermodus** (oben rechts)
3. Klicke auf **"Entpackte Erweiterung laden"**
4. Wähle diesen Plugin-Ordner aus

### Icons generieren

1. Öffne `icons/generate-icons.html` im Browser
2. Rechtsklick auf jedes Canvas → "Bild speichern unter"
3. Speichere als `icon16.png`, `icon32.png`, `icon48.png`, `icon128.png` im `icons/` Ordner

## Verwendung

### Erstverbindung

1. Klicke auf das NoKe-Icon in der Browser-Toolbar
2. Klicke auf **"Mit NoKe verbinden"** oder gib ein Token manuell ein
3. Nach erfolgreicher Verbindung siehst du deine gespeicherten Passwörter

### Passwörter verwenden

- **Kopieren**: Klicke auf 👤 für Benutzername oder 🔑 für Passwort
- **Autofill**: Klicke auf ✨ um die Daten automatisch einzutragen
- **Suchen**: Nutze das Suchfeld im Popup

### Passwort generieren

1. Klicke auf **"Passwort generieren"**
2. Passe Länge und Zeichenoptionen an
3. Kopiere das generierte Passwort

## Dateistruktur

```
noke-browser-plugin/
├── manifest.json          # Plugin-Manifest (Manifest V3)
├── popup/
│   ├── popup.html         # Popup UI
│   ├── popup.css          # Popup Styles
│   └── popup.js           # Popup Logik
├── background/
│   └── service-worker.js  # Background Service Worker
├── content/
│   └── content.js         # Content Script für Autofill
├── lib/
│   └── api.js             # API-Wrapper
├── icons/
│   ├── icon.svg           # Vektor-Icon
│   ├── generate-icons.html # Icon-Generator
│   └── icon*.png          # PNG-Icons (müssen generiert werden)
├── options/
│   ├── options.html       # Einstellungsseite
│   └── options.js         # Einstellungen Logik
└── README.md              # Diese Datei
```

## API-Endpunkte

Das Plugin kommuniziert mit der NoKe-API:

- `POST /validate-token` - Token validieren
- `GET /plugin/entries` - Alle Passwörter abrufen
- `GET /plugin/search?url=...` - Nach URL suchen
- `POST /plugin/generate` - Passwort generieren

## Sicherheit

- Tokens werden sicher im Browser-Storage gespeichert
- Alle API-Kommunikation erfolgt über HTTPS
- Passwörter werden nur bei Bedarf entschlüsselt

## Entwicklung

### Debugging

- **Popup**: Rechtsklick auf Plugin-Icon → "Pop-up untersuchen"
- **Service Worker**: Auf der Extensions-Seite unter dem Plugin auf "Service Worker" klicken
- **Content Script**: DevTools der jeweiligen Website

### Logs

Öffne die DevTools Console um Debug-Ausgaben zu sehen.

## Version

1.0.0

## Lizenz

Proprietär - Nur für interne Verwendung
