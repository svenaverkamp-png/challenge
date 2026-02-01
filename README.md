# EverVoice

> **Lokale Voice-to-Text Desktop App** - Diktiere Text in jede Anwendung mit Whisper AI und automatischer Textverbesserung durch Ollama.

[![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)]()
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-blue)]()
[![License](https://img.shields.io/badge/License-MIT-yellow)]()

---

## Highlights

- **100% Lokal** - Alle Daten bleiben auf deinem Gerät. Keine Cloud, kein Internet erforderlich.
- **Global Hotkey** - Drücke `Cmd+Shift+Space` in jeder App und diktiere.
- **KI-Textverbesserung** - Entfernt Füllwörter, korrigiert Grammatik, setzt Satzzeichen.
- **Kontext-Aware** - Erkennt E-Mail vs. Chat-Apps und passt den Ton automatisch an.
- **Obsidian-Archiv** - Speichert alle Transkriptionen als durchsuchbare Markdown-Dateien.

---

## Features

### Core Features

| Feature | Beschreibung |
|---------|--------------|
| **Desktop App Shell** | Native macOS/Windows App mit System Tray, Autostart und Single-Instance |
| **Global Hotkey** | System-weiter Push-to-Talk oder Toggle-Modus |
| **Audio Recording** | 16kHz Mono-Aufnahme mit Mikrofon-Auswahl und Pegel-Anzeige |
| **Whisper Integration** | Lokale Speech-to-Text mit whisper.cpp (Tiny/Small/Medium Modelle) |
| **Floating Overlay** | Schwebendes Mini-Fenster zeigt Recording-Status und Timer |
| **Direct Text Insert** | Fügt Text direkt per Tastatur-Simulation in die aktive App ein |

### AI Features

| Feature | Beschreibung |
|---------|--------------|
| **AI Auto-Edits** | Ollama-Integration für Füllwort-Entfernung, Grammatik, Rechtschreibung |
| **Context Awareness** | Erkennt aktive App (60+ Apps gemappt) und passt Verarbeitung an |
| **E-Mail Context** | Formeller Ton, automatische Anrede und Grußformel |
| **Chat Context** | Lockerer Ton, kurze Sätze, optionale Emojis |

### System Features

| Feature | Beschreibung |
|---------|--------------|
| **Settings Panel** | Zentrale Einstellungen mit Sidebar-Navigation |
| **Error Handling** | Toast-Benachrichtigungen, Retry-Funktionalität, System-Notifications |
| **Markdown Archive** | Speichert Transkriptionen als Obsidian-kompatible Markdown-Dateien |

---

## Quick Start

### Voraussetzungen

- **Node.js** 18+
- **Rust** 1.77+
- **Ollama** (optional, für KI-Textverbesserung): [ollama.com](https://ollama.com)

### Installation

```bash
# Repository klonen
git clone https://github.com/YOUR_USERNAME/evervoice.git
cd evervoice

# Dependencies installieren
npm install

# Development Server starten
npm run tauri:dev
```

### Ollama Setup (optional)

```bash
# Ollama installieren (macOS)
brew install ollama

# Ollama starten
ollama serve

# Empfohlenes Modell herunterladen
ollama pull llama3.2:3b
```

---

## Tech Stack

| Kategorie | Technologie | Warum? |
|-----------|-------------|--------|
| **Desktop** | Tauri 2.0 | 10x kleiner als Electron, native Performance |
| **Frontend** | Next.js 16 + React 19 | Modernes UI mit App Router |
| **Styling** | Tailwind CSS + shadcn/ui | Konsistentes, modernes Design |
| **Backend** | Rust | Systemzugriff, Audio-Verarbeitung, Performance |
| **Speech-to-Text** | whisper.cpp | Lokale Transkription, GPU-beschleunigt |
| **LLM** | Ollama | Lokale KI-Textverbesserung |

### Rust Dependencies

```toml
# Audio
cpal = "0.15"          # Plattformübergreifende Audio-Aufnahme
hound = "3.5"          # WAV-Export
rubato = "0.15"        # Audio-Resampling

# Whisper
whisper-rs = "0.11"    # Rust-Bindings für whisper.cpp

# System
enigo = "0.2"          # Keyboard-Simulation
arboard = "3"          # Clipboard-Zugriff
```

---

## Architektur

```
EverVoice
├── Tauri Backend (Rust)
│   ├── Audio Recording (cpal)
│   ├── Whisper Transcription (whisper-rs)
│   ├── Ollama Integration (HTTP API)
│   ├── Context Detection (AppleScript/PowerShell)
│   ├── Text Insert (enigo/arboard)
│   └── Markdown Archive (async fs)
│
├── React Frontend (Next.js)
│   ├── Settings Panel
│   ├── Recording Overlay
│   └── System Tray Menu
│
└── System Integration
    ├── Global Hotkey (tauri-plugin-global-shortcut)
    ├── System Notifications (tauri-plugin-notification)
    └── Autostart (tauri-plugin-autostart)
```

---

## Feature Details

### PROJ-1: Desktop App Shell & System Tray

Die Basis-Infrastruktur der Desktop-Anwendung. Die App läuft als Hintergrund-Prozess mit System-Tray-Integration.

- System Tray Icon mit Status-Anzeige (Idle, Recording, Processing, Error)
- Autostart beim Systemstart (optional)
- Single-Instance-Lock verhindert mehrere App-Instanzen
- Background-Mode ohne sichtbares Hauptfenster

### PROJ-2: Global Hotkey System

System-weite Tastenkombinationen, die in jeder App funktionieren.

- **Push-to-Talk**: Taste gedrückt halten zum Aufnehmen
- **Toggle-Mode**: Einmal drücken zum Starten, erneut zum Stoppen
- Default: `Cmd+Shift+Space` (Mac) / `Ctrl+Shift+Space` (Windows)
- Hotkey in Settings konfigurierbar
- Escape bricht Aufnahme ab

### PROJ-3: Audio Recording

Aufnahme über das System-Mikrofon mit Whisper-kompatiblem Output.

- 16kHz Mono WAV-Export (optimal für Whisper)
- Mikrofon-Auswahl aus verfügbaren Devices
- Live-Pegel-Anzeige während Aufnahme
- 6 Minuten Zeitlimit (konfigurierbar 1-10 Min)
- Automatische Speicherbereinigung (Privacy-Mode)

### PROJ-4: Whisper.cpp Integration

Lokale, offline Speech-to-Text-Transkription.

- **Whisper Tiny** (~75MB): Schnell, weniger genau
- **Whisper Small** (~500MB): Gute Balance (Default)
- **Whisper Medium** (~1.5GB): Sehr genau, langsamer
- Modell-Download mit Fortschrittsanzeige
- GPU-Beschleunigung (Metal auf macOS)
- Auto-Spracherkennung (Deutsch/Englisch)

### PROJ-5: Floating Recording Overlay

Schwebendes Mini-Fenster während der Aufnahme.

- Always-on-top, kein Focus-Steal
- Pulsierender roter Punkt während Recording
- Audio-Pegel-Meter (Grün → Gelb → Rot)
- Timer mit Warnung bei 5:30
- Status-Wechsel Animation (Recording → Processing → Done)

### PROJ-6: Direct Text Insert

Automatisches Einfügen in das aktive Textfeld.

- Clipboard + Cmd/Ctrl+V Simulation (schnell)
- Keyboard-Simulation als Fallback
- Original-Clipboard wird gesichert und wiederhergestellt
- Terminal-sichere Newline-Entfernung
- Timeout-basierter Fallback

### PROJ-7: AI Auto-Edits (Ollama)

Automatische Textverbesserung durch lokales LLM.

**Korrekturen:**
- Füllwörter entfernen (ähm, also, halt, sozusagen)
- Grammatik korrigieren
- Rechtschreibung prüfen
- Satzzeichen setzen
- Groß-/Kleinschreibung

**Ollama-Modelle:**
- llama3.2:3b (Default, schnell)
- mistral:7b (genauer)
- Benutzerdefinierte Modelle

### PROJ-8: Context Awareness Engine

Erkennt die aktive Anwendung und Kategorie.

**Kategorien:**
- `email`: Gmail, Outlook, Apple Mail, Thunderbird
- `chat`: Slack, Teams, Discord, WhatsApp, Telegram
- `social`: LinkedIn, Twitter/X, Facebook
- `code`: VS Code, Cursor, IntelliJ, Xcode
- `docs`: Google Docs, Notion, Word
- `browser`: Chrome, Safari, Firefox, Arc
- `notes`: Apple Notes, Obsidian, Bear
- `terminal`: Terminal, iTerm2, Hyper

**60+ Apps** vordefiniert, eigene Mappings möglich.

### PROJ-9: E-Mail Context Rules

Kontextspezifische Verarbeitung für E-Mail-Apps.

- Formeller, professioneller Ton
- Automatische Anrede erkennen und formatieren
- Standard-Grußformel konfigurierbar
- Name für Signatur aus Settings
- Englische E-Mail-Konventionen bei EN-Diktat

### PROJ-10: Chat Context Rules

Kontextspezifische Verarbeitung für Chat-Apps.

- Lockerer, informeller Ton
- Kurze Sätze und Absätze
- Keine formellen Anreden/Grußformeln
- Optionale Emoji-Einfügung
- @Mentions formatieren ("at Thomas" → "@Thomas")

### PROJ-11: Settings Panel

Zentrale Einstellungs-Oberfläche.

**Kategorien:**
- **Allgemein**: Theme (Light/Dark/System), Autostart
- **Hotkey**: Tastenkombination, Push-to-Talk/Toggle
- **Audio**: Mikrofon, Zeitlimit, Pegel-Test
- **Transkription**: Whisper-Modell, Sprache
- **AI-Verarbeitung**: Ollama-Einstellungen, Korrekturen
- **Kontext**: E-Mail/Chat-Modus Konfiguration
- **Datenschutz**: Audio löschen, Telemetrie
- **Archiv**: Speicherpfad, Ordnerstruktur

Export/Import von Einstellungen als JSON.

### PROJ-12: Error Handling & Notifications

Zentrales Fehlerbehandlungs-System.

- Toast-Notifications (Success, Error, Warning, Info)
- Retry-Button bei retriable Errors
- System-Notifications wenn App im Hintergrund
- Error-Details Modal mit Copy-to-Clipboard
- Lokales Logging mit Rotation

### PROJ-18: Markdown Transcription Archive

Automatisches Speichern als Obsidian-kompatible Dateien.

**Dateiformat:**
```markdown
---
date: 2024-01-15T14:32:00+01:00
app: Slack
category: chat
duration: 45
words: 127
language: de
edited: true
tags:
  - transkription
  - voice
---

# Transkription vom 15. Januar 2024

## Bearbeiteter Text
[AI-bearbeiteter Text]

## Originaltext
<details>
<summary>Original anzeigen</summary>
[Unbearbeiteter Whisper-Output]
</details>
```

**Features:**
- Default-Ordner: `~/VoiceApp/transcriptions/`
- Ordnerstruktur: Flat oder Jahr/Monat
- Dateiname: `YYYY-MM-DD_HH-MM_appname_snippet.md`
- Obsidian Dataview-kompatibel

---

## Screenshots

> *Screenshots werden hier eingefügt*

---

## Entwicklung

### Projektstruktur

```
evervoice/
├── src/                      # Next.js Frontend
│   ├── app/
│   │   ├── page.tsx          # Hauptseite
│   │   ├── settings/         # Settings-Route
│   │   └── overlay/          # Recording-Overlay
│   ├── components/           # React-Komponenten
│   ├── hooks/                # Custom Hooks
│   └── lib/                  # Utilities
├── src-tauri/                # Rust Backend
│   ├── src/
│   │   ├── lib.rs            # Tauri-Commands
│   │   ├── audio.rs          # Audio-Recording
│   │   ├── whisper.rs        # Whisper-Integration
│   │   ├── ollama.rs         # Ollama-Integration
│   │   ├── context.rs        # Context-Detection
│   │   ├── text_insert.rs    # Text-Einfügung
│   │   └── archive.rs        # Markdown-Archive
│   ├── icons/                # App-Icons
│   └── Cargo.toml            # Rust-Dependencies
├── features/                 # Feature-Spezifikationen
└── package.json
```

### Befehle

```bash
# Development
npm run dev              # Next.js Dev Server
npm run tauri:dev        # Tauri + Next.js Dev

# Production
npm run build            # Next.js Build
npm run tauri:build      # Tauri App Build

# Linting
npm run lint             # ESLint
```

---

## Roadmap

### Geplante Features

- [ ] **PROJ-13**: Command Mode (Übersetzen, Zusammenfassen)
- [ ] **PROJ-14**: Personal Dictionary (Fachbegriffe)
- [ ] **PROJ-15**: Voice Commands ("Absatz", "neuer Satz")
- [ ] **PROJ-16**: Snippet-Bibliothek
- [ ] **PROJ-17**: Transkriptions-Historie mit Suche

---

## Beitragen

Beiträge sind willkommen! Bitte erstelle einen Issue oder Pull Request.

1. Fork das Repository
2. Erstelle einen Feature-Branch (`git checkout -b feature/AmazingFeature`)
3. Committe deine Änderungen (`git commit -m 'Add AmazingFeature'`)
4. Push zum Branch (`git push origin feature/AmazingFeature`)
5. Öffne einen Pull Request

---

## Lizenz

MIT License - siehe [LICENSE](LICENSE) für Details.

---

## Acknowledgments

- [Tauri](https://tauri.app/) - Desktop Framework
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) - Speech-to-Text
- [Ollama](https://ollama.com/) - Lokale LLMs
- [shadcn/ui](https://ui.shadcn.com/) - UI-Komponenten

---

**Built with Tauri, Whisper & Ollama**
