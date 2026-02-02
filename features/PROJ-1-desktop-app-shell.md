# PROJ-1: Desktop App Shell & System Tray

## Status: 🔵 Planned

## Beschreibung
Die Basis-Infrastruktur der Desktop-Anwendung mit Tauri. Die App läuft als Hintergrund-Prozess mit System-Tray-Integration und startet automatisch beim Systemstart.

## Abhängigkeiten
- Keine (Basis-Feature)

## User Stories

### US-1.1: App als Hintergrund-Prozess
Als User möchte ich, dass die App im Hintergrund läuft, ohne ein sichtbares Fenster zu benötigen, um jederzeit per Hotkey darauf zugreifen zu können.

### US-1.2: System-Tray Icon
Als User möchte ich ein Icon in der Taskleiste/Menu Bar sehen, um den Status der App zu erkennen und schnell auf Einstellungen zugreifen zu können.

### US-1.3: Tray-Status-Anzeige
Als User möchte ich am Tray-Icon erkennen können, ob die App:
- Bereit ist (idle)
- Gerade aufnimmt (recording)
- Verarbeitet (processing)
- Einen Fehler hat (error)

### US-1.4: Autostart
Als User möchte ich, dass die App automatisch beim Systemstart läuft, damit ich sie nicht manuell starten muss.

### US-1.5: Tray-Kontextmenü
Als User möchte ich per Rechtsklick auf das Tray-Icon ein Menü öffnen können mit:
- Status anzeigen
- Einstellungen öffnen
- App beenden

## Acceptance Criteria

### Infrastruktur
- [ ] Tauri-Projekt ist korrekt konfiguriert für macOS und Windows
- [ ] Next.js läuft als Frontend im Tauri-Fenster
- [ ] App startet ohne sichtbares Hauptfenster (Background-Mode)
- [ ] App kann über Tray-Menü oder Hotkey ein Fenster öffnen

### System Tray
- [ ] Tray-Icon wird auf macOS in der Menu Bar angezeigt
- [ ] Tray-Icon wird auf Windows in der Taskleiste angezeigt
- [ ] Icon wechselt je nach Status (4 verschiedene Icons/Farben)
- [ ] Rechtsklick öffnet Kontextmenü
- [ ] Linksklick zeigt Status-Tooltip oder öffnet Quick-Panel

### Autostart
- [ ] Autostart kann in Settings aktiviert/deaktiviert werden
- [ ] macOS: Login Items Integration
- [ ] Windows: Startup-Folder oder Registry-Eintrag
- [ ] Default: Autostart ist AUS (User muss aktivieren)

### Performance
- [ ] App verbraucht < 50MB RAM im Idle-Zustand
- [ ] CPU-Last im Idle < 1%
- [ ] Startup-Zeit < 3 Sekunden

## Edge Cases

### EC-1.1: Mehrere Instanzen
- **Szenario:** User startet App, obwohl sie bereits läuft
- **Verhalten:** Keine neue Instanz starten, sondern existierende fokussieren
- **Implementierung:** Single-Instance-Lock via Tauri

### EC-1.2: Tray-Icon verschwindet
- **Szenario:** System-Tray wird vom OS neu geladen (z.B. Explorer-Restart)
- **Verhalten:** Icon automatisch neu registrieren
- **Implementierung:** Event-Listener für System-Tray-Changes

### EC-1.3: Kein Tray-Support
- **Szenario:** Linux ohne System-Tray oder ältere OS-Versionen
- **Verhalten:** Fallback auf kleines Fenster oder Dock-Icon
- **Implementierung:** Feature-Detection beim Start

### EC-1.4: App-Crash
- **Szenario:** App stürzt unerwartet ab
- **Verhalten:** Crash-Log speichern, beim nächsten Start Hinweis zeigen
- **Implementierung:** Tauri panic handler + lokale Log-Datei

### EC-1.5: Autostart blockiert
- **Szenario:** Antivirus oder OS blockiert Autostart-Registrierung
- **Verhalten:** User informieren, manuelle Anleitung anbieten
- **Implementierung:** Fehler abfangen und Toast-Notification zeigen

## Technische Anforderungen

### Tauri-Konfiguration
- Tauri v2 (stable)
- Window: `visible: false` beim Start
- System Tray mit Icon-Assets für alle Status
- Single-Instance-Plugin

### Assets benötigt
- Tray-Icon: idle (default)
- Tray-Icon: recording (rot/pulsierend)
- Tray-Icon: processing (gelb/animiert)
- Tray-Icon: error (rot mit Ausrufezeichen)
- App-Icon für Dock/Taskbar

### Plattform-spezifisch
- macOS: `.app` Bundle, Notarisierung für Distribution
- Windows: `.msi` oder `.exe` Installer, Code-Signing

## Out of Scope
- Linux-Support (kann später hinzugefügt werden)
- Auto-Update-Mechanismus (separates Feature)
- Crash-Reporting an Server (nur lokale Logs)

---

## Tech-Design (Solution Architect)

### Zusammenfassung
PROJ-1 ist das **Basis-Feature** für die Desktop-App. Es wandelt die bestehende Next.js Web-App in eine native Desktop-Anwendung um, die im Hintergrund läuft und über ein Tray-Icon steuerbar ist.

### Component-Struktur

```
Desktop App (Tauri)
├── System Tray
│   ├── Tray-Icon (wechselt je nach Status)
│   │   ├── Idle (Standard-Icon)
│   │   ├── Recording (Rot)
│   │   ├── Processing (Gelb)
│   │   └── Error (Rot mit Warnung)
│   │
│   ├── Linksklick → Status-Tooltip
│   │
│   └── Rechtsklick → Kontextmenü
│       ├── "Status: [Aktueller Status]"
│       ├── ─────────────────────────
│       ├── "Einstellungen öffnen"
│       └── "App beenden"
│
├── Hauptfenster (versteckt beim Start)
│   └── Next.js App (bestehendes Frontend)
│
└── Hintergrund-Services
    ├── Single-Instance-Prüfung
    ├── Autostart-Manager
    └── Crash-Handler
```

### Daten-Model

**App-Status (wird im Speicher gehalten):**
- Aktueller Status: `idle`, `recording`, `processing`, `error`
- Fehlermeldung (falls Status = error)
- Zeitpunkt der letzten Statusänderung

**Einstellungen (werden lokal gespeichert):**
- Autostart aktiviert: Ja/Nein (Standard: Nein)
- Letzter bekannter Status vor Beenden

**Crash-Logs (lokale Datei):**
- Zeitpunkt des Absturzes
- Fehlerbeschreibung
- Stack-Trace (technische Details für Debugging)

### Tech-Entscheidungen

| Entscheidung | Begründung |
|--------------|------------|
| **Tauri v2** statt Electron | Tauri ist ~10x kleiner, schneller, und nutzt weniger RAM. Perfekt für eine App die im Hintergrund laufen soll. |
| **Next.js bleibt als Frontend** | Bereits vorhanden, alle UI-Components können wiederverwendet werden. Tauri "wrapp" einfach das bestehende Frontend. |
| **Lokale Dateien** statt Datenbank | Für Settings und Logs reicht lokale Speicherung. Kein Backend nötig für dieses Feature. |
| **macOS + Windows** (kein Linux) | Linux hat inkonsistenten Tray-Support. Fokus auf die zwei Hauptplattformen. |

### Plattform-Unterschiede

| Feature | macOS | Windows |
|---------|-------|---------|
| Tray-Icon | Menu Bar (oben rechts) | Taskleiste (unten rechts) |
| Autostart | Login Items | Startup-Ordner/Registry |
| App-Format | `.app` Bundle | `.exe` / `.msi` |
| Code-Signing | Apple Notarisierung nötig | Windows Code-Signing nötig |

### Dependencies

**Tauri Core:**
- `@tauri-apps/cli` → Build-Werkzeug für Desktop-App
- `@tauri-apps/api` → JavaScript-API für Tauri-Features

**Tauri Plugins:**
- `tauri-plugin-autostart` → Autostart-Funktionalität
- `tauri-plugin-single-instance` → Verhindert mehrere App-Instanzen
- `tauri-plugin-shell` → System-Befehle (für Fallbacks)

### Benötigte Assets

| Asset | Beschreibung | Formate |
|-------|--------------|---------|
| Icon Idle | Standard Tray-Icon (grau/neutral) | PNG, ICO |
| Icon Recording | Aufnahme aktiv (rot/auffällig) | PNG, ICO |
| Icon Processing | Wird verarbeitet (gelb/orange) | PNG, ICO |
| Icon Error | Fehler aufgetreten (rot mit !) | PNG, ICO |
| App Icon | Für Dock/Taskbar | ICNS (macOS), ICO (Windows) |

**Hinweis:** Icons müssen in mehreren Größen bereitgestellt werden (16x16, 32x32, 64x64, 128x128 für Tray).

### User Flow

```
App-Start
    │
    ▼
Bereits eine Instanz aktiv? ──Ja──→ Existierende App fokussieren, neue beenden
    │
    Nein
    │
    ▼
Tray-Icon in System-Leiste platzieren
    │
    ▼
Warten auf User-Interaktion (Hotkey oder Klick auf Tray)
    │
    ▼
Bei Linksklick: Status-Info zeigen
Bei Rechtsklick: Menü öffnen
Bei Hotkey: Hauptfenster öffnen (kommt in PROJ-2)
```

### Edge Case Handling

| Szenario | Lösung |
|----------|--------|
| App läuft schon | Neue Instanz schließt sich, alte wird fokussiert |
| Tray-Icon verschwindet | Automatisches Neu-Registrieren bei System-Events |
| Autostart wird blockiert | User bekommt Hinweis mit manueller Anleitung |
| App-Crash | Log wird gespeichert, beim nächsten Start Hinweis |

### Scope-Abgrenzung

**In diesem Feature:**
- ✅ Tauri-Projekt Setup
- ✅ System Tray mit Status-Icons
- ✅ Kontextmenü
- ✅ Autostart-Option
- ✅ Single-Instance

**Nicht in diesem Feature:**
- ❌ Global Hotkey (→ PROJ-2)
- ❌ Audio-Aufnahme (→ PROJ-3)
- ❌ Floating Overlay (→ PROJ-5)
- ❌ Auto-Update
- ❌ Linux-Support

---

## QA Test Results

**Tested:** 2026-02-01
**Test Type:** Code Review (Runtime-Tests nicht moeglich - Rust/Cargo nicht installiert)
**Reviewer:** QA Engineer Agent

---

## Acceptance Criteria Status

### Infrastruktur

| AC | Beschreibung | Status | Bemerkung |
|----|--------------|--------|-----------|
| AC-1.1 | Tauri-Projekt ist korrekt konfiguriert fuer macOS und Windows | [x] PASS | `tauri.conf.json` korrekt konfiguriert mit Tauri v2, Bundle-Targets fuer alle Plattformen |
| AC-1.2 | Next.js laeuft als Frontend im Tauri-Fenster | [x] PASS | `devUrl: "http://localhost:3000"` und `frontendDist: "../out"` korrekt gesetzt |
| AC-1.3 | App startet ohne sichtbares Hauptfenster (Background-Mode) | [x] PASS | `visible: false` in window config |
| AC-1.4 | App kann ueber Tray-Menu oder Hotkey ein Fenster oeffnen | [x] PASS | `show_main_window` Command implementiert, Linksklick und Menu-Event-Handler vorhanden |

### System Tray

| AC | Beschreibung | Status | Bemerkung |
|----|--------------|--------|-----------|
| AC-2.1 | Tray-Icon wird auf macOS in der Menu Bar angezeigt | [x] PASS | `trayIcon` in config, `TrayIconBuilder` in lib.rs |
| AC-2.2 | Tray-Icon wird auf Windows in der Taskleiste angezeigt | [?] UNGETESTET | Konfiguration vorhanden, aber Windows-Test nicht moeglich |
| AC-2.3 | Icon wechselt je nach Status (4 verschiedene Icons/Farben) | [ ] BUG | Nur 1 Icon vorhanden (icon.png), keine Status-spezifischen Icons |
| AC-2.4 | Rechtsklick oeffnet Kontextmenue | [x] PASS | Menu mit Status, Einstellungen, Beenden implementiert |
| AC-2.5 | Linksklick zeigt Status-Tooltip oder oeffnet Quick-Panel | [x] PASS | Oeffnet Hauptfenster bei Linksklick |

### Autostart

| AC | Beschreibung | Status | Bemerkung |
|----|--------------|--------|-----------|
| AC-3.1 | Autostart kann in Settings aktiviert/deaktiviert werden | [x] PASS | `set_autostart` und `get_autostart_status` Commands, UI Switch in SettingsPanel |
| AC-3.2 | macOS: Login Items Integration | [x] PASS | `MacosLauncher::LaunchAgent` korrekt konfiguriert |
| AC-3.3 | Windows: Startup-Folder oder Registry-Eintrag | [?] UNGETESTET | Plugin sollte das automatisch handlen |
| AC-3.4 | Default: Autostart ist AUS | [x] PASS | `useState(false)` als Default in useAutostart Hook |

### Performance

| AC | Beschreibung | Status | Bemerkung |
|----|--------------|--------|-----------|
| AC-4.1 | App verbraucht < 50MB RAM im Idle-Zustand | [?] UNGETESTET | Rust nicht installiert, keine Live-Tests moeglich |
| AC-4.2 | CPU-Last im Idle < 1% | [?] UNGETESTET | Rust nicht installiert |
| AC-4.3 | Startup-Zeit < 3 Sekunden | [?] UNGETESTET | Rust nicht installiert |

---

## Edge Cases Status

### EC-1.1: Mehrere Instanzen
- **Status:** [x] PASS (Code Review)
- **Implementierung:** `tauri_plugin_single_instance::init()` korrekt eingebunden
- **Verhalten:** Bei zweiter Instanz wird Hauptfenster der ersten Instanz fokussiert
- **Code-Referenz:** `/src-tauri/src/lib.rs` Zeile 101-108

### EC-1.2: Tray-Icon verschwindet
- **Status:** [ ] NICHT IMPLEMENTIERT
- **Bemerkung:** Kein Event-Listener fuer System-Tray-Changes gefunden
- **Risiko:** Medium - Tray-Icon koennte nach Explorer-Restart verschwinden

### EC-1.3: Kein Tray-Support
- **Status:** [ ] NICHT IMPLEMENTIERT
- **Bemerkung:** Keine Feature-Detection oder Fallback-Mechanismus implementiert
- **Risiko:** Low - macOS/Windows haben stabilen Tray-Support

### EC-1.4: App-Crash
- **Status:** [~] TEILWEISE
- **Implementierung:** Logging-Plugin vorhanden (`tauri_plugin_log`)
- **Fehlt:** Kein Panic-Handler, keine Crash-Benachrichtigung beim naechsten Start
- **Risiko:** Medium - User erhaelt keine Information bei Absturz

### EC-1.5: Autostart blockiert
- **Status:** [x] PASS
- **Implementierung:** Error-Handling im useAutostart Hook mit User-Feedback
- **UI:** Alert-Component zeigt Fehlermeldung an

---

## Bugs Found

### BUG-1: Fehlende Status-Icons fuer Tray
- **Severity:** High
- **Beschreibung:** Laut Spec sollen 4 verschiedene Icons fuer die Status-Anzeige existieren (Idle, Recording, Processing, Error). Es existiert nur ein einziges Icon (icon.png).
- **Aktueller Zustand:**
  - Vorhandene Icons: icon.png, icon.ico, icon.icns (alle identisch)
  - Fehlend: icon-recording.png, icon-processing.png, icon-error.png
- **Impact:** User kann Status der App nicht visuell am Tray-Icon erkennen
- **Betroffene Dateien:**
  - `/src-tauri/icons/` - nur Standard-Icons vorhanden
  - `/src-tauri/src/lib.rs` - `update_tray_status` aendert nur Tooltip, nicht Icon
- **Priority:** High (Core Feature laut Spec)

### BUG-2: Content Security Policy (CSP) ist deaktiviert
- **Severity:** Critical (Security)
- **Beschreibung:** In `tauri.conf.json` ist `"csp": null` gesetzt, was alle Content Security Policies deaktiviert.
- **Risiko:**
  - XSS-Angriffe moeglich
  - Injection von externen Scripts
  - Potenzielle Remote Code Execution
- **Betroffene Datei:** `/src-tauri/tauri.conf.json` Zeile 32
- **Empfohlene Loesung:** Restriktive CSP konfigurieren:
  ```json
  "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
  ```
- **Priority:** Critical (Security Issue - MUSS vor Production gefixt werden)

### BUG-3: Potentieller Panic bei fehlendem Window-Icon
- **Severity:** Medium
- **Beschreibung:** In lib.rs Zeile 124 wird `.unwrap()` auf `app.default_window_icon()` aufgerufen.
- **Code:** `.icon(app.default_window_icon().unwrap().clone())`
- **Risiko:** App stuerzt ab wenn kein Default-Icon definiert ist
- **Betroffene Datei:** `/src-tauri/src/lib.rs` Zeile 124
- **Empfohlene Loesung:** Graceful Error-Handling mit `if let Some(icon) = ...` oder `.unwrap_or_default()`
- **Priority:** Medium

### BUG-4: Tray-Icon Neu-Registrierung bei System-Events fehlt
- **Severity:** Medium
- **Beschreibung:** Kein Handler fuer System-Events wenn Tray neu geladen wird (z.B. nach Explorer-Restart auf Windows).
- **Impact:** Tray-Icon koennte verschwinden und nicht automatisch zurueckkehren
- **Priority:** Medium

### BUG-5: Keine Crash-Recovery Implementierung
- **Severity:** Low
- **Beschreibung:**
  - Kein Panic-Handler konfiguriert
  - Keine Speicherung von Crash-Logs
  - Keine Benachrichtigung beim naechsten Start nach Crash
- **Laut Spec gefordert:** EC-1.4 erfordert Crash-Log und Hinweis beim naechsten Start
- **Priority:** Low (UX Improvement)

---

## Security Analysis (Red-Team Check)

### Geprueft

| Aspekt | Status | Bemerkung |
|--------|--------|-----------|
| CSP (Content Security Policy) | KRITISCH | `csp: null` - deaktiviert alle Schutzmaßnahmen |
| Permissions (capabilities) | OK | Minimale Permissions, nur notwendige Rechte |
| Shell-Zugriff | OK | Nur `shell:allow-open` (Links oeffnen), kein Execute |
| Filesystem-Zugriff | OK | Keine FS-Permissions angefordert |
| HTTP/Network-Zugriff | OK | devUrl nur fuer Development |
| Code-Injection | OK | Kein dangerouslySetInnerHTML, eval() oder new Function() |
| Autostart-Permissions | OK | Korrekt beschraenkt auf enable/disable/is-enabled |

### Sicherheitsempfehlungen

1. **KRITISCH:** CSP aktivieren und restriktiv konfigurieren
2. **EMPFOHLEN:** Panic-Handler implementieren fuer sichere Fehlerbehandlung
3. **OPTIONAL:** Code-Signing fuer macOS und Windows vor Distribution

---

## Performance Analysis (Code Review)

| Metrik | Erwartung | Analyse |
|--------|-----------|---------|
| RAM-Verbrauch | < 50MB | Tauri v2 typisch ~15-30MB, sollte erfuellt sein |
| CPU Idle | < 1% | Keine aktiven Loops im Code, sollte erfuellt sein |
| Startup-Zeit | < 3s | Minimaler Rust-Code, sollte erfuellt sein |

**Hinweis:** Echte Performance-Tests erfordern laufende App.

---

## Test Coverage Summary

| Kategorie | Getestet | Bestanden | Fehlgeschlagen | Nicht getestet |
|-----------|----------|-----------|----------------|----------------|
| Infrastruktur | 4 | 4 | 0 | 0 |
| System Tray | 5 | 3 | 1 | 1 |
| Autostart | 4 | 3 | 0 | 1 |
| Performance | 3 | 0 | 0 | 3 |
| Edge Cases | 5 | 2 | 2 | 1 |
| **Gesamt** | **21** | **12** | **3** | **6** |

---

## Summary

- **Acceptance Criteria Passed:** 12/21 (57%)
- **Bugs Found:** 5 (1 Critical, 2 High, 2 Medium, 1 Low)
- **Security Issues:** 1 Critical (CSP deaktiviert)
- **Runtime Tests:** Nicht moeglich (Rust/Cargo nicht installiert)

---

## Production-Ready Decision

### NICHT READY

Das Feature ist **NICHT production-ready** aufgrund folgender kritischer Issues:

1. **BUG-2 (Critical):** CSP ist deaktiviert - massive Sicherheitsluecke
2. **BUG-1 (High):** Status-Icons fehlen - Core Feature nicht implementiert
3. **BUG-3 (Medium):** Potentieller App-Crash durch unwrap()

### Vor Deployment erforderlich:

1. [ ] CSP konfigurieren (BUG-2) - **BLOCKER**
2. [ ] Status-Icons erstellen und Icon-Wechsel implementieren (BUG-1)
3. [ ] Error-Handling bei default_window_icon() verbessern (BUG-3)
4. [ ] Runtime-Tests mit installiertem Rust durchfuehren
5. [ ] Performance-Metriken validieren

### Nach Deployment empfohlen:

- [ ] Tray-Icon Neu-Registrierung implementieren (BUG-4)
- [ ] Crash-Recovery implementieren (BUG-5)

---

## Naechste Schritte

1. **Backend Dev:** BUG-2 (CSP) und BUG-3 (unwrap) fixen
2. **Designer:** 4 Status-Icons fuer Tray erstellen
3. **Backend Dev:** Icon-Wechsel-Logik implementieren
4. **QA:** Erneuter Test nach Fixes mit installiertem Rust

