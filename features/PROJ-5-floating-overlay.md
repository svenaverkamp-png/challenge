# PROJ-5: Floating Recording Overlay

## Status: ✅ Deployed (2026-02-01)

## Beschreibung
Ein schwebendes Mini-Fenster, das während der Aufnahme erscheint und dem User visuelles Feedback gibt. Zeigt Recording-Status, Pegel und Timer.

## Abhängigkeiten
- Benötigt: PROJ-1 (Desktop App Shell) - für Fenster-Management
- Benötigt: PROJ-2 (Global Hotkey) - triggert Anzeige
- Benötigt: PROJ-3 (Audio Recording) - für Pegel-Daten

## User Stories

### US-5.1: Recording-Anzeige
Als User möchte ich während der Aufnahme eine klare visuelle Anzeige sehen, damit ich weiß, dass die App aufnimmt.

### US-5.2: Audio-Pegel
Als User möchte ich einen Audio-Pegel sehen, um sicherzugehen, dass mein Mikrofon funktioniert und ich laut genug spreche.

### US-5.3: Timer
Als User möchte ich sehen, wie lange ich bereits aufnehme, besonders wenn ich mich dem Zeitlimit nähere.

### US-5.4: Status-Wechsel
Als User möchte ich sehen, wenn die Aufnahme endet und die Verarbeitung beginnt (Processing-State).

### US-5.5: Position
Als User möchte ich, dass das Overlay an einer sinnvollen Position erscheint (z.B. nahe dem aktiven Textfeld oder am oberen Bildschirmrand).

### US-5.6: Nicht-störend
Als User möchte ich, dass das Overlay meine Arbeit nicht blockiert (keine Fokus-Übernahme, durchklickbar wenn nötig).

## Acceptance Criteria

### Fenster-Eigenschaften
- [ ] Floating Window: Immer im Vordergrund
- [ ] Kompakte Größe: ~200x80px
- [ ] Abgerundete Ecken, modernes Design
- [ ] Kein Focus-Steal: Aktive App bleibt aktiv
- [ ] Transparent/Durchsichtig: ~90% Opazität

### Status-Anzeigen
- [ ] **Recording**: Roter Punkt (pulsierend) + "Recording..." Text
- [ ] **Processing**: Spinner + "Verarbeite..." Text
- [ ] **Done**: Grüner Haken (kurz) + "Eingefügt!" Text
- [ ] **Error**: Rotes X + Fehlermeldung

### Pegel-Anzeige
- [ ] Echtzeit-Audio-Level-Meter
- [ ] Visuell: Balken oder Wellenform
- [ ] Update-Rate: ~30fps für flüssige Animation
- [ ] Farbe: Grün (normal) → Gelb (laut) → Rot (Clipping)

### Timer
- [ ] Format: "0:00" bis "6:00"
- [ ] Warnung ab 5:30 (Timer wird rot/orange)
- [ ] Timer nur während Recording sichtbar

### Position
- [ ] Default: Obere Mitte des aktiven Bildschirms
- [ ] Alternative: Nahe dem Cursor (konfigurierbar)
- [ ] Nicht außerhalb des sichtbaren Bereichs
- [ ] Merkt sich letzte Position nicht (immer Default)

### Animationen
- [ ] Einblenden: Fade-In (~200ms)
- [ ] Ausblenden: Fade-Out (~300ms)
- [ ] Pulsieren des roten Recording-Punkts
- [ ] Smooth Transitions zwischen Status

### Accessibility
- [ ] Hoher Kontrast Text
- [ ] Screen-Reader-Label für Status
- [ ] Keine schnellen Blink-Animationen (Epilepsie)

## Edge Cases

### EC-5.1: Multi-Monitor
- **Szenario:** User hat mehrere Bildschirme, aktive App auf Monitor 2
- **Verhalten:** Overlay erscheint auf dem Monitor mit aktivem Fenster
- **Implementierung:** Aktiven Monitor via Cursor-Position ermitteln

### EC-5.2: Vollbild-App aktiv
- **Szenario:** User nutzt Vollbild-Anwendung (Spiel, Präsentation)
- **Verhalten:** Overlay erscheint trotzdem (höchste z-Order)
- **Fallback:** Falls blockiert, nur Tray-Icon-Change als Feedback

### EC-5.3: Bildschirm sehr klein
- **Szenario:** Overlay würde über Bildschirmrand hinausragen
- **Verhalten:** Overlay an nächste passende Position verschieben
- **Implementierung:** Bounds-Checking beim Positionieren

### EC-5.4: Overlay blockiert wichtigen Inhalt
- **Szenario:** User kann wegen Overlay etwas nicht sehen
- **Verhalten:** Overlay ist per Drag verschiebbar (während Aufnahme)
- **Alternative:** Klick durch Overlay geht an App darunter

### EC-5.5: Sehr lange Aufnahme
- **Szenario:** User nimmt volle 6 Minuten auf
- **Verhalten:** Bei 5:30 → Timer wird rot + kurzer Pulse
- **Bei 6:00:** Auto-Stop + "Maximum erreicht" Hinweis

### EC-5.6: Schnelles Start/Stop
- **Szenario:** User startet und stoppt in < 1 Sekunde
- **Verhalten:** Overlay erscheint kurz, dann Processing-State
- **Implementierung:** Keine Mindest-Anzeigedauer für States

### EC-5.7: Abbruch durch Escape
- **Szenario:** User drückt Escape während Recording
- **Verhalten:** Overlay zeigt "Abgebrochen" (grau) für 1s, dann verschwinden
- **Keine Verarbeitung:** Audio wird verworfen

## Technische Anforderungen

### Fenster-Typ
- Tauri: `decorations: false`, `always_on_top: true`
- `skip_taskbar: true` (nicht in Taskbar/Dock zeigen)
- `resizable: false`, `focus_on_create: false`

### UI-Framework
- React-Komponente im Next.js
- Tailwind CSS für Styling
- Framer Motion für Animationen

### Kommunikation
- Tauri Events: `recording-started`, `recording-stopped`, `processing-started`, `processing-done`
- Audio-Level: Echtzeit via Event-Stream (~30 updates/sec)

### Design-Tokens
```css
--overlay-bg: rgba(0, 0, 0, 0.85);
--overlay-text: #ffffff;
--recording-red: #ef4444;
--processing-yellow: #eab308;
--success-green: #22c55e;
--error-red: #dc2626;
```

### Komponenten-Struktur
```
<RecordingOverlay>
  <StatusIndicator status={status} />
  <AudioLevelMeter level={level} />
  <Timer duration={duration} warning={duration > 330} />
</RecordingOverlay>
```

## Out of Scope
- Drag & Drop zum dauerhaft Verschieben
- Resize durch User
- Themes (folgt System-Theme)
- Waveform-Visualisierung (nur Pegel-Balken im MVP)

---

## Tech-Design (Solution Architect)

### Bestehende Architektur (Wiederverwendung)

**Bereits implementiert:**
- ✅ Audio-Level Hooks (`use-audio-recording`)
- ✅ Recording-State Management (`use-hotkey`)
- ✅ Status-Logik in `recording-indicator.tsx`
- ✅ Timer-Formatierung und Warn-Logik

**Noch nicht vorhanden:**
- ❌ Separates Floating-Window (zweites Tauri-Fenster)
- ❌ Framer Motion Animationen
- ❌ Multi-Monitor Positionierung

### Component-Struktur

```
Floating Overlay (separates Fenster)
├── Overlay-Container (dunkler Hintergrund, abgerundete Ecken)
│   ├── Status-Bereich (links)
│   │   ├── Pulsierender roter Punkt (Recording)
│   │   ├── Spinner (Processing)
│   │   ├── Grüner Haken (Done)
│   │   └── Rotes X (Error)
│   ├── Audio-Pegel-Balken (Mitte)
│   │   └── Farbcodierte Balken (grün → gelb → rot)
│   └── Timer-Anzeige (rechts)
│       └── "0:00" bis "6:00" (wird rot ab 5:30)
```

### Daten-Model

**Vom Haupt-Fenster übernommen (kein eigener State):**
- Recording-Status (idle, recording, processing, transcribing, done, error)
- Audio-Level (0-100%)
- Recording-Dauer (in Millisekunden)
- Fehlermeldung (falls vorhanden)

**Kommunikation:**
- Tauri Events verbinden Haupt-App und Overlay-Fenster
- Events: `recording-started`, `audio-level`, `recording-stopped`, `processing-done`, `error`

### Fenster-Architektur

```
Haupt-App (bestehendes Fenster)
    │
    │── Sendet Tauri Events ──►  Overlay-Fenster (NEU)
    │                                 │
    │                                 ├── Erscheint bei recording-started
    │                                 ├── Aktualisiert Audio-Level ~30fps
    │                                 └── Verschwindet nach processing-done
```

**Overlay-Fenster Eigenschaften:**
- Immer im Vordergrund (always_on_top)
- Kein Rahmen (decorations: false)
- Nicht in Taskbar/Dock (skip_taskbar)
- Keine Fokus-Übernahme (focus_on_create: false)
- Größe: 220x90px, nicht änderbar
- Position: Obere Mitte des aktiven Monitors

### Tech-Entscheidungen

| Entscheidung | Begründung |
|--------------|------------|
| **Framer Motion** für Animationen | Smooth Fade-In/Out, einfache API, perfekt für React |
| **Separates Tauri-Fenster** | Einzige Möglichkeit für always_on_top ohne Fokus-Verlust |
| **Tauri Events** für Kommunikation | Bereits in PROJ-3/4 etabliert, echtzeitfähig |
| **Bestehende Hooks wiederverwenden** | Timer/Audio-Level Logik existiert bereits |

### Dependencies

```
Benötigte Packages:
- framer-motion (Animationen: Fade, Pulse, Transitions)

Bereits vorhanden:
- lucide-react (Icons)
- tailwindcss (Styling)
- @tauri-apps/api (Fenster-Management)
```

### Implementierungs-Schritte (für Frontend Developer)

1. **Neues Tauri-Fenster konfigurieren** (tauri.conf.json)
2. **Overlay-Route erstellen** (/overlay Seite)
3. **RecordingOverlay Component** bauen (wiederverwendet Logik aus recording-indicator)
4. **Event-Listener** für Tauri Events im Overlay
5. **Fenster-Management** (öffnen/schließen vom Haupt-Prozess)
6. **Multi-Monitor Positionierung** implementieren

### Edge Cases Handling

| Edge Case | Lösung |
|-----------|--------|
| Multi-Monitor | Cursor-Position bestimmt aktiven Monitor |
| Vollbild-App aktiv | Overlay hat höchste z-Order, Fallback: Tray-Icon |
| Bildschirm zu klein | Bounds-Checking, Position anpassen |
| Escape gedrückt | "Abgebrochen" Nachricht, dann ausblenden |

---

## QA Test Results

**Tested:** 2026-02-01
**Tested by:** QA Engineer Agent
**App URL:** http://localhost:3000 (Next.js) + Tauri Desktop App
**Test-Methode:** Code-Review + Lokaler Server Test

---

## Acceptance Criteria Status

### Fenster-Eigenschaften
- [x] Floating Window: `alwaysOnTop: true` in tauri.conf.json
- [x] Kompakte Größe: 220x90px (etwas größer als 200x80px spec)
- [x] Abgerundete Ecken: `rounded-xl` in recording-overlay.tsx:233
- [x] Kein Focus-Steal: `focus: false` in tauri.conf.json
- [x] Transparent: `transparent: true`, bg-black/85 (85% statt 90% Opazität)

### Status-Anzeigen
- [x] **Recording**: Roter Punkt (pulsierend) + "Aufnahme..." Text
- [x] **Processing**: Spinner (Loader2) + "Verarbeite..." Text
- [x] **Transcribing**: Brain-Icon (pulsierend) + "Transkribiere..." Text (Bonus-State!)
- [x] **Done**: Grüner Haken (CheckCircle2) + "Fertig!" Text
- [x] **Error**: Rotes X (XCircle) + Fehlermeldung
- [x] **Cancelled**: Graues X + "Abgebrochen" Text (Bonus-State!)

### Pegel-Anzeige
- [x] Echtzeit-Audio-Level-Meter: 10 Balken in AudioLevelMeter Component
- [x] Visuell: Balken-Visualisierung
- [x] Update-Rate: ~30fps (throttled in use-overlay-window.ts:166)
- [x] Farbe: Grün (< 60%) → Gelb (60-80%) → Rot (> 80%)

### Timer
- [x] Format: "M:SS" korrekt implementiert
- [x] Warnung ab 5:30: Timer wird orange (`showWarning` bei 5.5 * 60 * 1000ms)
- [x] Timer nur während Recording sichtbar

### Position
- [x] Default: Obere Mitte des aktiven Bildschirms (use-overlay-window.ts:76-87)
- [ ] ❌ Alternative Cursor-Position: NICHT implementiert
- [ ] ⚠️ Multi-Monitor: Verwendet `currentMonitor()` nicht cursor-basiert
- [x] Merkt sich Position nicht (immer Default)

### Animationen
- [x] Einblenden: Fade-In + Scale (~200ms, ease-out)
- [x] Ausblenden: Fade-Out + Scale
- [x] Pulsieren des roten Recording-Punkts (1.5s Cycle)
- [x] Smooth Transitions zwischen Status (AnimatePresence)

### Accessibility
- [x] Hoher Kontrast Text: Weiß auf Schwarz/85%
- [ ] ❌ **BUG**: Screen-Reader-Label fehlt komplett (keine aria-labels)
- [x] Keine schnellen Blink-Animationen (1.5s Puls-Dauer = epilepsiesicher)

---

## Edge Cases Status

### EC-5.1: Multi-Monitor
- [ ] ⚠️ Cursor-basierte Monitor-Erkennung fehlt
- Actual: Verwendet `currentMonitor()` - funktioniert, aber nicht via Cursor-Position

### EC-5.2: Vollbild-App aktiv
- [x] Overlay hat `alwaysOnTop: true` - sollte funktionieren

### EC-5.3: Bildschirm sehr klein
- [ ] ❌ **BUG**: Kein Bounds-Checking implementiert
- Overlay könnte außerhalb des sichtbaren Bereichs landen

### EC-5.4: Overlay blockiert wichtigen Inhalt
- [ ] ❌ Drag ist NICHT implementiert (explizit Out of Scope)
- [ ] ❌ Click-Through ist NICHT implementiert

### EC-5.5: Sehr lange Aufnahme
- [x] Warnung bei 5:30: Toast + Timer wird orange
- [x] Auto-Stop bei 6:00: Implementiert in use-hotkey.ts:189-195

### EC-5.6: Schnelles Start/Stop
- [x] Debounce für Toggle-Mode (200ms)
- [x] Keine Mindest-Anzeigedauer für States

### EC-5.7: Abbruch durch Escape
- [x] "Abgebrochen" State mit grauem Icon + Text
- [x] Verschwindet nach 1s automatisch

---

## Bugs Found

### BUG-1: tauri.conf.json infoPlist Fehler - CRITICAL ✅ FIXED
- **Severity:** Critical (App startet nicht!)
- **File:** [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json)
- **Location:** Line 65-68, `bundle.macOS.infoPlist`
- **Steps to Reproduce:**
  1. Run `npm run tauri:dev`
  2. Expected: App startet
  3. Actual: Error - infoPlist ist Object statt String
- **Error:** `"bundle > macOS > infoPlist": {"NSMicrophoneUsageDescription":...} is not of types "null", "string"`
- **Priority:** Critical (Blocker - App kann nicht gestartet werden)
- **Fix:** ✅ Erstellt `Info.plist` Datei und `infoPlist` als Pfad-String gesetzt
- **Fixed:** 2026-02-01

### BUG-2: Overlay-Window fehlt in Capabilities ✅ FIXED
- **Severity:** High
- **File:** [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json)
- **Steps to Reproduce:**
  1. Prüfe `windows` Array in default.json
  2. Expected: `["main", "overlay"]`
  3. Actual: `["main"]`
- **Priority:** High (Overlay könnte Permission-Fehler haben)
- **Fix:** ✅ `"overlay"` zu windows Array hinzugefügt
- **Fixed:** 2026-02-01

### BUG-3: Keine Accessibility Labels
- **Severity:** Medium
- **File:** [src/components/recording-overlay.tsx](src/components/recording-overlay.tsx)
- **Steps to Reproduce:**
  1. Suche nach `aria-label` in recording-overlay.tsx
  2. Expected: Status-Anzeigen haben aria-labels für Screen-Reader
  3. Actual: Keine aria-labels vorhanden
- **Priority:** Medium (Accessibility Issue)

### BUG-4: Kein Bounds-Checking für Overlay-Position
- **Severity:** Medium
- **File:** [src/hooks/use-overlay-window.ts](src/hooks/use-overlay-window.ts)
- **Steps to Reproduce:**
  1. Kleiner Bildschirm (z.B. 800x600)
  2. Overlay-Position wird berechnet ohne zu prüfen ob es im sichtbaren Bereich ist
- **Priority:** Medium (UX Issue)

### BUG-5: Event-Payload nicht validiert
- **Severity:** Low (Security)
- **File:** [src/components/recording-overlay.tsx](src/components/recording-overlay.tsx)
- **Description:** `ErrorPayload.message` und `AudioLevelPayload.level` werden ohne Validierung verwendet
- **Priority:** Low (theoretisches XSS-Risiko, aber nur intern)

---

## Security Findings (Red-Team Check)

### SEC-1: Event-System ohne Authentifizierung
- **Risk:** Low
- **Description:** Tauri Events sind nicht signiert/authentifiziert. Ein kompromittiertes Script könnte fake Events senden.
- **Mitigation:** Da dies eine lokale Desktop-App ist, ist das Risiko minimal.

### SEC-2: CSP korrekt konfiguriert
- **Status:** ✅ OK
- **Details:** Strenge CSP in tauri.conf.json ohne `unsafe-eval`

### SEC-3: Sandbox deaktiviert
- **Risk:** Medium (akzeptiert)
- **Description:** macOS Sandbox ist deaktiviert für Global Hotkeys
- **Note:** Erforderlich für PROJ-2 Funktionalität

---

## Regression Tests

### PROJ-1 (Desktop App Shell)
- [x] Main Window konfiguriert
- [x] Overlay Window konfiguriert in tauri.conf.json
- ❌ BUG-1 verhindert App-Start

### PROJ-2 (Global Hotkey)
- [x] useHotkey Hook integriert Overlay-Notifications
- [x] Event-Flow: Hotkey → Recording → Overlay erscheint

### PROJ-3 (Audio Recording)
- [x] Audio-Level Events werden an Overlay gesendet
- [x] ~30fps Throttling implementiert

### PROJ-4 (Whisper Integration)
- [x] Transcribing-State im Overlay
- [x] Fallback-Events für whisper-transcription-start/complete

---

## Summary

| Status | Count |
|--------|-------|
| ✅ Acceptance Criteria passed | 23 |
| ❌ Acceptance Criteria failed | 3 |
| ⚠️ Edge Cases mit Issues | 3 |
| 🐛 Bugs gefunden | 5 (1 Critical, 1 High, 2 Medium, 1 Low) |
| 🔒 Security Findings | 3 (alle akzeptabel) |

---

## Recommendation

**❌ Feature ist NICHT production-ready.**

### Must Fix vor Deployment:
1. **BUG-1 (Critical):** tauri.conf.json infoPlist-Format korrigieren
2. **BUG-2 (High):** Overlay zu Capabilities hinzufügen

### Should Fix:
3. **BUG-3 (Medium):** Accessibility Labels hinzufügen
4. **BUG-4 (Medium):** Bounds-Checking implementieren

### Nice to Have:
5. **BUG-5 (Low):** Input-Validierung für Event-Payloads

---

## Status nach Fix

Nach Behebung von BUG-1 und BUG-2: **Feature kann getestet werden** (manuelles E2E-Testing erforderlich)
