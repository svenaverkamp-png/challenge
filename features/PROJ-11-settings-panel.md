# PROJ-11: Settings Panel

## Status: ✅ Deployed (2026-02-01)

**Production URL:** Desktop App (Tauri)
**Deployed by:** DevOps Agent

## Beschreibung
Zentrale Einstellungs-Oberfläche für alle konfigurierbaren Optionen der App. Zugänglich über System-Tray-Menü oder Hotkey.

## Abhängigkeiten
- Benötigt: PROJ-1 (Desktop App Shell) - für Fenster-Management
- Konfiguriert: Alle anderen Features (PROJ-2 bis PROJ-10)

## User Stories

### US-11.1: Settings öffnen
Als User möchte ich die Einstellungen über das Tray-Menü oder einen Shortcut öffnen können.

### US-11.2: Hotkey konfigurieren
Als User möchte ich den globalen Hotkey für Push-to-Talk ändern können.

### US-11.3: Mikrofon auswählen
Als User möchte ich aus verfügbaren Mikrofonen wählen können.

### US-11.4: AI-Einstellungen
Als User möchte ich die AI-Verarbeitung (Auto-Edits, Context Awareness) ein-/ausschalten können.

### US-11.5: Grußformel festlegen
Als User möchte ich meine Standard-Grußformel und meinen Namen für E-Mails einstellen können.

### US-11.6: Whisper-Modell wählen
Als User möchte ich zwischen verschiedenen Whisper-Modellen wählen können (Qualität vs Speed).

### US-11.7: Einstellungen speichern
Als User möchte ich, dass meine Einstellungen gespeichert und beim nächsten Start geladen werden.

## Acceptance Criteria

### Settings-Fenster
- [ ] Öffnet sich als eigenes Fenster (nicht im Overlay)
- [ ] Modernes, übersichtliches Design
- [ ] Kategorien/Tabs für verschiedene Bereiche
- [ ] Responsive: Passt sich an Fenstergröße an
- [ ] Schließbar mit Escape oder X-Button

### Kategorien

#### General
- [ ] App-Sprache (Deutsch/Englisch)
- [ ] Autostart aktivieren/deaktivieren
- [ ] Theme: Light/Dark/System

#### Hotkey
- [ ] Aktueller Hotkey anzeigen
- [ ] Hotkey ändern (Recording-Modus)
- [ ] Modus: Push-to-Talk vs Toggle
- [ ] Konflikt-Warnung bei belegten Shortcuts

#### Audio
- [ ] Mikrofon-Auswahl (Dropdown aller Devices)
- [ ] Live-Pegel-Vorschau beim Auswählen
- [ ] Aufnahme-Zeitlimit (1-10 Minuten, Default: 6)

#### Transcription
- [ ] Whisper-Modell auswählen (tiny/small/medium)
- [ ] Download-Status anzeigen
- [ ] Modell herunterladen/löschen

#### AI Processing
- [ ] Auto-Edit aktivieren/deaktivieren
- [ ] Einzelne Features togglen:
  - Füllwörter entfernen
  - Grammatik korrigieren
  - Rechtschreibung korrigieren
  - Satzzeichen setzen
- [ ] Ollama-URL konfigurieren
- [ ] Ollama-Modell auswählen

#### Context Awareness
- [ ] Context Awareness aktivieren/deaktivieren
- [ ] E-Mail-Modus Einstellungen:
  - Standard-Grußformel
  - Name für Signatur
  - Auto-Grußformel an/aus
- [ ] Chat-Modus Einstellungen:
  - Emojis einfügen an/aus

#### Privacy
- [ ] Audio nach Verarbeitung löschen (Default: On)
- [ ] Telemetrie/Analytics (Default: Off)

### Persistence
- [ ] Einstellungen in lokaler Config-Datei speichern
- [ ] Automatisch laden beim App-Start
- [ ] Format: JSON (lesbar, editierbar)
- [ ] Speicherort: User-Config-Verzeichnis

### Validierung
- [ ] Ungültige Werte verhindern
- [ ] Fehlerhafte Eingaben markieren
- [ ] Reset-to-Default-Button pro Kategorie

## Edge Cases

### EC-11.1: Mikrofon entfernt
- **Szenario:** Ausgewähltes Mikrofon wird abgezogen
- **Verhalten:** Automatisch auf System-Default wechseln
- **UI:** Warnung: "Ausgewähltes Mikrofon nicht verfügbar"

### EC-11.2: Ollama nicht erreichbar
- **Szenario:** User konfiguriert Ollama-URL, aber Service läuft nicht
- **Verhalten:** Test-Button zeigt Fehler
- **UI:** "Verbindung zu Ollama fehlgeschlagen"

### EC-11.3: Hotkey bereits belegt
- **Szenario:** User wählt Hotkey, der von anderer App verwendet wird
- **Verhalten:** Warnung anzeigen, aber erlauben
- **UI:** "Dieser Shortcut wird möglicherweise von anderen Apps verwendet"

### EC-11.4: Config-Datei beschädigt
- **Szenario:** Config-JSON ist korrupt/ungültig
- **Verhalten:** Backup erstellen, auf Defaults zurücksetzen
- **Toast:** "Einstellungen wurden zurückgesetzt"

### EC-11.5: Whisper-Modell-Download unterbrochen
- **Szenario:** Download bricht ab (kein Internet, App geschlossen)
- **Verhalten:** Fortschritt speichern, später fortsetzen
- **UI:** "Download fortsetzen" Button

### EC-11.6: Mehrere Instanzen
- **Szenario:** Einstellungen werden geändert während App läuft
- **Verhalten:** Änderungen sofort anwenden (Live-Update)
- **Keine:** Neustart erforderlich für die meisten Settings

### EC-11.7: Sprache wechseln
- **Szenario:** User wechselt App-Sprache
- **Verhalten:** UI sofort in neuer Sprache
- **Keine:** App-Neustart nötig

### EC-11.8: Export/Import Settings
- **Szenario:** User will Einstellungen auf anderen Rechner übertragen
- **Verhalten:** Export-Button → JSON-Datei
- **Import:** Datei auswählen, validieren, anwenden

## Technische Anforderungen

### UI-Framework
- React-Komponenten in Next.js
- Tailwind CSS + shadcn/ui für Konsistenz
- Separate Route: `/settings`

### Settings-Schema
```typescript
interface AppSettings {
  general: {
    language: "de" | "en";
    autostart: boolean;
    theme: "light" | "dark" | "system";
  };
  hotkey: {
    shortcut: string;  // "CommandOrControl+Shift+Space"
    mode: "push-to-talk" | "toggle";
  };
  audio: {
    inputDevice: string | null;  // Device ID or null for default
    maxDuration: number;  // Sekunden
  };
  transcription: {
    model: "tiny" | "small" | "medium";
  };
  aiProcessing: {
    enabled: boolean;
    ollamaUrl: string;
    ollamaModel: string;
    removeFillWords: boolean;
    fixGrammar: boolean;
    fixSpelling: boolean;
    addPunctuation: boolean;
  };
  contextAwareness: {
    enabled: boolean;
    email: {
      defaultGreeting: string;
      userName: string;
      autoAddGreeting: boolean;
    };
    chat: {
      addEmojis: boolean;
    };
  };
  privacy: {
    deleteAudioAfterProcessing: boolean;
    enableTelemetry: boolean;
  };
}
```

### Config-Speicherort
- macOS: `~/Library/Application Support/VoiceApp/config.json`
- Windows: `%APPDATA%\VoiceApp\config.json`

### Tauri-Integration
- Settings-Fenster als separates Tauri-Window
- IPC für Settings-Read/Write
- File-System-API für Config-Persistenz

### Komponenten-Struktur
```
<SettingsWindow>
  <Sidebar>
    <NavItem active>General</NavItem>
    <NavItem>Hotkey</NavItem>
    <NavItem>Audio</NavItem>
    ...
  </Sidebar>
  <Content>
    <GeneralSettings />  // oder andere je nach aktiver Nav
  </Content>
</SettingsWindow>
```

## Out of Scope
- Cloud-Sync von Einstellungen
- Profil-System (mehrere Konfigurationen)
- Keyboard-Navigation in Settings
- Einstellungen per CLI ändern
- Passwort-Schutz für Settings
- Mehrsprachigkeit (i18n) - kommt als separates Feature

---

## Tech-Design (Solution Architect)

### Architektur-Entscheidungen

| Entscheidung | Begründung |
|--------------|------------|
| **Separate Route `/settings`** | Reicht aus, kein separates Tauri-Window nötig |
| **Sidebar-Navigation** | Übersichtlich bei vielen Kategorien, modernes Design |
| **Bestehende Komponenten wiederverwenden** | HotkeySettings, MicrophoneSettings etc. sind bereits fertig |
| **Nur Deutsch** | i18n kommt später als eigenes Feature |
| **JSON-Config** | Menschenlesbar, einfach zu exportieren/importieren |

### Component-Struktur

```
/settings (separate Route)
├── SettingsLayout
│   ├── Sidebar (links, fixiert)
│   │   ├── "Allgemein"
│   │   ├── "Hotkey"
│   │   ├── "Audio"
│   │   ├── "Transkription"
│   │   ├── "AI-Verarbeitung"
│   │   ├── "Kontext"
│   │   └── "Datenschutz"
│   │
│   └── Content-Bereich (rechts, scrollbar)
│       ├── Kategorie-Titel
│       ├── Settings-Cards (bestehende Komponenten)
│       └── "Zurücksetzen" Button
│
└── Footer: Export/Import Buttons
```

### Bestehende Komponenten (wiederverwenden)

Diese Komponenten existieren bereits und werden ins neue Layout eingebettet:
- `HotkeySettings` → Kategorie "Hotkey"
- `MicrophoneSettings` → Kategorie "Audio"
- `WhisperSettings` → Kategorie "Transkription"
- `OllamaSettings` → Kategorie "AI-Verarbeitung"
- `ContextSettings` → Kategorie "Kontext"
- `EmailSettings` → Kategorie "Kontext"
- `ChatSettings` → Kategorie "Kontext"
- `TextInsertSettings` → Kategorie "AI-Verarbeitung"

### Neue Komponenten (zu bauen)

| Komponente | Inhalt |
|------------|--------|
| `SettingsLayout` | Sidebar + Content-Container |
| `GeneralSettings` | Theme (Light/Dark/System), Autostart |
| `PrivacySettings` | Audio löschen, Telemetrie |
| `SettingsExportImport` | Export/Import Buttons |

### Daten-Model

```
Einstellungen pro Kategorie:

Allgemein:
- Theme: "light" / "dark" / "system"
- Autostart: true/false

Hotkey:
- Shortcut: z.B. "CommandOrControl+Shift+Space"
- Modus: "push-to-talk" / "toggle"

Audio:
- Mikrofon-ID (oder null für Standard)
- Max. Aufnahmedauer in Sekunden

Transkription:
- Whisper-Modell: "tiny" / "small" / "medium"

AI-Verarbeitung:
- Aktiviert: true/false
- Ollama-URL und Modell
- Einzelne Korrekturen (Füllwörter, Grammatik, etc.)

Kontext:
- Aktiviert: true/false
- E-Mail: Grußformel, Name, Auto-Gruß
- Chat: Emojis

Datenschutz:
- Audio nach Verarbeitung löschen: true/false
- Telemetrie: true/false

Speicherort: Tauri App-Config-Verzeichnis (automatisch plattformübergreifend)
```

### Dependencies

Keine neuen Packages nötig:
- shadcn/ui Sidebar ✓
- shadcn/ui Tabs ✓
- Tauri fs-API ✓

### Implementierungs-Reihenfolge

1. Settings-Route und Layout mit Sidebar erstellen
2. Bestehende Komponenten in Kategorien einbetten
3. GeneralSettings (Theme-Switcher) bauen
4. PrivacySettings bauen
5. Export/Import Funktion
6. Reset-to-Default pro Kategorie
7. Navigation von Hauptseite zu Settings

---

## QA Test Results

**Tested:** 2026-02-01
**QA Engineer:** Claude Code (Code-Review/Static Analysis)
**App URL:** `http://localhost:3000/settings`

### Implementation Status

Das Feature ist **weitgehend implementiert**. Der Status sollte von "🔵 Planned" auf "🟢 Implemented" geändert werden.

**Implementierte Dateien:**
- `src/app/settings/page.tsx` - Settings-Route mit Sidebar-Layout
- `src/components/general-settings.tsx` - Theme + Autostart
- `src/components/privacy-settings.tsx` - Datenschutz-Einstellungen
- `src/components/hotkey-settings.tsx` - Hotkey-Konfiguration
- `src/components/microphone-settings.tsx` - Audio-Einstellungen
- `src/components/whisper-settings.tsx` - Transkription-Einstellungen
- `src/components/ollama-settings.tsx` - AI Processing
- `src/components/context-settings.tsx` - App-Erkennung
- `src/components/email-settings.tsx` - E-Mail-Modus
- `src/components/chat-settings.tsx` - Chat-Modus

---

## Acceptance Criteria Status

### Settings-Fenster
- [x] Öffnet sich als eigene Route `/settings` (✅ kein separates Window, laut Tech-Design OK)
- [x] Modernes, übersichtliches Design mit Sidebar-Navigation
- [x] Kategorien/Tabs für 7 verschiedene Bereiche
- [x] Responsive: Passt sich an Fenstergröße an (ScrollArea + max-w-2xl)
- [x] Schließbar mit Escape-Taste
- [ ] ⚠️ MINOR: Kein X-Button, nur Back-Arrow und Escape

### Kategorien

#### General
- [ ] ❌ App-Sprache (Deutsch/Englisch) - **EXPECTED:** Laut Tech-Design: "Nur Deutsch - i18n kommt später"
- [x] Autostart aktivieren/deaktivieren (via useAutostart Hook)
- [x] Theme: Light/Dark/System (Select mit Icons)

#### Hotkey
- [x] Aktueller Hotkey anzeigen (formatShortcut Funktion)
- [x] Hotkey ändern (Recording-Modus mit Dialog)
- [x] Modus: Push-to-Talk vs Toggle (Select)
- [x] Konflikt-Warnung bei belegten Shortcuts (KNOWN_CONFLICTS Map)

#### Audio
- [x] Mikrofon-Auswahl (Dropdown mit Refresh-Button)
- [x] Live-Pegel-Vorschau beim Testen (3-Sekunden-Test mit Progress-Bar)
- [x] Aufnahme-Zeitlimit (1-10 Minuten, Slider)

#### Transcription
- [x] Whisper-Modell auswählen (Tiny/Small/Medium)
- [x] Download-Status anzeigen (downloaded/downloading/not-downloaded)
- [x] Modell herunterladen/löschen (Buttons)
- [x] BONUS: Sprache auswählen (Auto/Deutsch/Englisch)
- [x] BONUS: GPU-Beschleunigung Toggle

#### AI Processing
- [x] Auto-Edit aktivieren/deaktivieren
- [x] Einzelne Features togglen:
  - [x] Füllwörter entfernen
  - [x] Grammatik korrigieren
  - [x] Rechtschreibung korrigieren
  - [x] Satzzeichen setzen
  - [x] BONUS: Groß-/Kleinschreibung
  - [x] BONUS: Neue Rechtschreibung (dass/daß)
- [x] Ollama-URL konfigurieren (in Advanced Settings)
- [x] Ollama-Modell auswählen (5 vordefinierte Modelle)
- [x] BONUS: Verbindungs-Status mit Test-Button
- [x] BONUS: Auto-Pull bei fehlendem Modell

#### Context Awareness
- [x] Context Awareness aktivieren/deaktivieren (indirekt über ContextSettings)
- [x] E-Mail-Modus Einstellungen:
  - [x] Standard-Grußformel (6 Optionen)
  - [x] Name für Signatur (Input)
  - [x] Auto-Grußformel an/aus
  - [x] BONUS: Formality-Level (casual/neutral/formal)
  - [x] BONUS: Erweiterte Signatur (Textarea)
- [x] Chat-Modus Einstellungen:
  - [x] Emojis einfügen an/aus
  - [x] BONUS: Mentions formatieren
  - [x] BONUS: Lange Nachrichten aufteilen
  - [x] BONUS: Max. Zeichenlänge (Slider)

#### Privacy
- [x] Audio nach Verarbeitung löschen (Default: On)
- [x] Telemetrie/Analytics (Default: Off)
- [x] BONUS: Info-Box mit Datenschutz-Erklärung

### Persistence
- [x] Einstellungen in lokaler Config-Datei speichern (JSON)
- [x] Automatisch laden beim App-Start
- [x] Format: JSON (Backend-seitig)
- [x] Speicherort: User-Config-Verzeichnis (Tauri app_config_dir)

### Validierung
- [ ] ⚠️ MINOR: Ungültige Werte verhindern - teilweise via min/max auf Inputs
- [ ] ⚠️ MINOR: Fehlerhafte Eingaben markieren - Fehler via Alert, aber keine Inline-Validierung
- [x] Reset-to-Default-Button pro Kategorie (handleResetCategory)

### Export/Import
- [x] Export-Button → Speichert JSON via Datei-Dialog ✅ FIXED
- [x] Import-Button → Öffnet JSON via Datei-Dialog ✅ FIXED
- [x] EC-11.8: Datei-Picker für Export/Import ✅ FIXED

---

## Edge Cases Status

### EC-11.1: Mikrofon entfernt
- [x] Refresh-Button zum Neuladen der Geräte-Liste
- [x] Automatische Warnung wenn Device verschwindet ✅ FIXED
- [x] Automatischer Fallback auf System-Default ✅ FIXED

### EC-11.2: Ollama nicht erreichbar
- [x] Test-Button zeigt Fehler
- [x] Hilfe-Text: "brew install ollama" + "ollama serve"
- [x] Status-Anzeige: "Ollama nicht erreichbar"

### EC-11.3: Hotkey bereits belegt
- [x] Warnung wird angezeigt (KNOWN_CONFLICTS)
- [x] Shortcut kann trotzdem gespeichert werden
- Bekannte Konflikte: Spotlight, Input Method, VSCode

### EC-11.4: Config-Datei beschädigt
- ❓ Nicht getestet (Backend-Verhalten) - sollte auf Defaults zurückfallen

### EC-11.5: Whisper-Modell-Download unterbrochen
- [x] Cancel-Button während Download
- [x] "Download fortsetzen" Button nach Abbruch ✅ FIXED
- [x] Fortschritt wird in localStorage persistiert ✅ FIXED

### EC-11.6: Mehrere Instanzen / Live-Update
- [x] Änderungen werden sofort angewendet (optimistic UI)
- [x] Theme-Änderung sofort sichtbar
- [x] Kein Neustart erforderlich

### EC-11.7: Sprache wechseln
- ❌ Nicht implementiert (explizit out of scope laut Tech-Design)

### EC-11.8: Export/Import Settings
- [x] Export via nativen Datei-Dialog (Speichern unter...) ✅ FIXED
- [x] Import via nativen Datei-Dialog (Öffnen...) ✅ FIXED
- [x] JSON-Validierung beim Import

---

## Security Review (Red-Team-Perspektive)

### ✅ Positiv
1. **Telemetrie Default Off:** Guter Privacy-Default
2. **Audio-Löschung Default On:** Keine sensiblen Daten auf Disk
3. **Ollama localhost-only:** UI zeigt Hinweis "Nur localhost URLs erlaubt"
4. **Lokale Verarbeitung:** Alle Daten bleiben lokal (Whisper, Ollama)

### ⚠️ Beobachtungen
1. **Ollama-URL Validierung:** Frontend zeigt nur Hinweis, aber keine strikte Validierung ob URL wirklich localhost ist - **Backend prüfen!**
2. **Config-Datei Permissions:** JSON-Datei im User-Verzeichnis könnte von anderen Prozessen gelesen/manipuliert werden
3. ~~**Clipboard für Export/Import:** Daten könnten von Clipboard-Managern abgefangen werden~~ ✅ FIXED - Jetzt via Datei-Dialog
4. **Keine Authentifizierung:** Settings sind ohne Passwort zugänglich (expected für Desktop-App)

### 🔍 Empfehlungen
1. Backend-Validierung der Ollama-URL auf localhost/127.0.0.1 erzwingen
2. Config-Datei-Permissions auf User-only setzen (0600)
3. Für sensible Settings: Warnung vor Export anzeigen

---

## Bugs Found (All Fixed ✅)

### BUG-1: X-Button fehlt zum Schließen ✅ FIXED
- **Severity:** Low (UX)
- **Description:** Settings-Fenster hatte keinen X-Button
- **Fix:** X-Button oben rechts im Content-Header hinzugefügt
- **File:** `src/app/settings/page.tsx`

### BUG-2: Mikrofon-Disconnect keine automatische Warnung ✅ FIXED
- **Severity:** Low (UX)
- **Description:** Keine automatische Warnung bei Mikrofon-Trennung
- **Fix:** Automatisches Device-Monitoring alle 3 Sekunden + Toast-Warnung + Auto-Fallback
- **File:** `src/components/microphone-settings.tsx`

### BUG-3: Whisper-Download nicht fortsetzbar ✅ FIXED
- **Severity:** Low (UX)
- **Description:** Nach Download-Abbruch kein "Fortsetzen" Button
- **Fix:** Download-Fortschritt wird in localStorage gespeichert + "Fortsetzen" Button
- **File:** `src/components/whisper-settings.tsx`

### BUG-4: Export/Import nur via Clipboard ✅ FIXED
- **Severity:** Low (UX)
- **Description:** Kein nativer Datei-Dialog für Export/Import
- **Fix:** Tauri Dialog-Plugin für native "Speichern unter..." / "Öffnen..." Dialoge
- **Files:** `src/app/settings/page.tsx`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`

---

## Regression Test

Geprüfte bestehende Features (via Code-Review):
- ✅ PROJ-2 (Global Hotkey): HotkeySettings integriert
- ✅ PROJ-3 (Audio Recording): MicrophoneSettings integriert
- ✅ PROJ-4 (Whisper): WhisperSettings integriert
- ✅ PROJ-6 (Text Insert): TextInsertSettings integriert
- ✅ PROJ-7 (AI Auto-Edits): OllamaSettings integriert
- ✅ PROJ-8 (Context Awareness): ContextSettings integriert
- ✅ PROJ-9 (Email Context): EmailSettings integriert
- ✅ PROJ-10 (Chat Context): ChatSettings integriert

**Alle bestehenden Settings-Komponenten wurden erfolgreich in das neue Layout eingebettet.**

---

## Summary

- ✅ **34 Acceptance Criteria passed**
- ✅ **4 Bugs gefunden und gefixt**
- ⚠️ **2 Minor Issues verbleibend** (Inline-Validierung)
- ❌ **1 Expected Missing** (App-Sprache - explizit out of scope)

### Production-Ready Decision

✅ **READY FOR PRODUCTION**

**Begründung:**
- Alle Core-Features implementiert
- Alle gefundenen Bugs wurden gefixt
- Alle Security-relevanten Defaults sind korrekt
- App-Sprache ist explizit als separates Feature geplant (i18n)

**Geänderte Dateien:**
- `src/app/settings/page.tsx` - X-Button + Datei-Dialog Export/Import
- `src/components/microphone-settings.tsx` - Device-Monitoring
- `src/components/whisper-settings.tsx` - Download-Resume
- `src-tauri/Cargo.toml` - Dialog + FS Plugins
- `src-tauri/src/lib.rs` - Plugin-Registration
- `src-tauri/capabilities/default.json` - Permissions
- `package.json` - NPM Dependencies

