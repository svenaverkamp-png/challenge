# PROJ-12: Error Handling & Notifications

## Status: ✅ Deployed (2026-02-01)

## Beschreibung
Zentrales System für Fehlerbehandlung und User-Benachrichtigungen. Zeigt Toasts, Fehler-Overlays und bietet Retry-Funktionalität.

## Abhängigkeiten
- Benötigt: PROJ-1 (Desktop App Shell) - für System-Notifications
- Wird verwendet von: Allen anderen Features

## User Stories

### US-12.1: Fehler-Toast
Als User möchte ich bei Fehlern eine kurze, verständliche Benachrichtigung sehen.

### US-12.2: Retry-Option
Als User möchte ich fehlgeschlagene Aktionen mit einem Klick wiederholen können.

### US-12.3: Erfolgs-Feedback
Als User möchte ich kurze Bestätigungen sehen, wenn Aktionen erfolgreich waren.

### US-12.4: Keine Überflutung
Als User möchte ich nicht von Benachrichtigungen überflutet werden.

### US-12.5: Persistent Errors
Als User möchte ich wichtige Fehler (z.B. Mikrofon-Problem) dauerhaft sehen, bis ich sie behebe.

### US-12.6: Fehler-Details
Als User möchte ich bei Bedarf mehr Details zu einem Fehler sehen können.

## Acceptance Criteria

### Toast-Notifications
- [ ] Erscheinen am oberen rechten Bildschirmrand
- [ ] Auto-Dismiss nach 5 Sekunden (konfigurierbar)
- [ ] Manuell schließbar mit X-Button
- [ ] Max. 3 Toasts gleichzeitig (älteste verschwindet)
- [ ] Stack-Effekt: Mehrere Toasts übereinander

### Toast-Typen

#### Success (Grün)
- [ ] Icon: Checkmark
- [ ] Beispiel: "Text erfolgreich eingefügt"
- [ ] Auto-Dismiss: 3 Sekunden

#### Error (Rot)
- [ ] Icon: X oder Ausrufezeichen
- [ ] Beispiel: "Transkription fehlgeschlagen"
- [ ] Retry-Button wenn sinnvoll
- [ ] Auto-Dismiss: 10 Sekunden (oder nie bei kritisch)

#### Warning (Gelb)
- [ ] Icon: Warnung-Dreieck
- [ ] Beispiel: "Aufnahme-Zeitlimit fast erreicht"
- [ ] Auto-Dismiss: 5 Sekunden

#### Info (Blau)
- [ ] Icon: Info-Kreis
- [ ] Beispiel: "Modell wird heruntergeladen..."
- [ ] Progress-Bar bei laufenden Aktionen

### Retry-Funktionalität
- [ ] Button erscheint bei retriable Errors
- [ ] Retry startet letzte Aktion neu
- [ ] Max. 2 automatische Retries, dann manuell
- [ ] Exponential Backoff bei Auto-Retry (1s, 3s)

### Error-Kategorien

| Kategorie | Beschreibung | Retry? | Persistent? |
|-----------|--------------|--------|-------------|
| `transient` | Temporärer Fehler (Netzwerk) | Ja | Nein |
| `user_action` | User muss etwas tun | Nein | Ja |
| `fatal` | App-Fehler | Nein | Ja |
| `permission` | Berechtigung fehlt | Nein | Ja |

### Fehler-Details
- [ ] "Details anzeigen" Link bei komplexen Fehlern
- [ ] Öffnet Modal mit:
  - Vollständige Fehlermeldung
  - Error-Code
  - Timestamp
  - "In Zwischenablage kopieren" Button

### System-Notifications
- [ ] Nur für wichtige Fehler wenn App im Hintergrund
- [ ] macOS: Notification Center
- [ ] Windows: Action Center
- [ ] Klick auf Notification fokussiert App

### Logging
- [ ] Alle Errors werden lokal geloggt
- [ ] Log-Datei: `{app_data}/logs/app.log`
- [ ] Log-Rotation: Max 5 Dateien à 10MB
- [ ] Format: `[TIMESTAMP] [LEVEL] [COMPONENT] Message`

## Edge Cases

### EC-12.1: Viele Fehler gleichzeitig
- **Szenario:** 10 Fehler in 2 Sekunden
- **Verhalten:** Gruppieren: "5 weitere Fehler aufgetreten"
- **Nicht:** 10 einzelne Toasts

### EC-12.2: Fehler während Fehler-Anzeige
- **Szenario:** Neuer Fehler während Toast sichtbar
- **Verhalten:** Neuer Toast erscheint darüber (Stack)
- **Max:** 3 gleichzeitig, dann Queue

### EC-12.3: User klickt Retry sofort
- **Szenario:** User klickt Retry bevor Action wirklich bereit
- **Verhalten:** Button disabled während Retry läuft
- **UI:** Loading-Spinner im Button

### EC-12.4: Persistenter Fehler behoben
- **Szenario:** Mikrofon-Fehler, dann Mikrofon angeschlossen
- **Verhalten:** Automatische Re-Check, Toast verschwindet
- **Alternative:** "Erneut prüfen" Button

### EC-12.5: App im Hintergrund
- **Szenario:** Fehler tritt auf während App nicht fokussiert
- **Verhalten:** System-Notification, kein Toast
- **Wichtig:** Toast erscheint wenn App wieder fokussiert

### EC-12.6: Fehler ohne Kontext
- **Szenario:** Unbekannter Fehler (Exception)
- **Verhalten:** "Ein Fehler ist aufgetreten" + Error-Code
- **Log:** Vollständiger Stack-Trace im Log

### EC-12.7: Notification-Permission fehlt
- **Szenario:** User hat System-Notifications deaktiviert
- **Verhalten:** Nur In-App-Toasts, keine System-Notifications
- **UI:** Hinweis in Settings: "System-Benachrichtigungen sind deaktiviert"

### EC-12.8: Sehr langer Fehlertext
- **Szenario:** Fehler-Message ist 500 Zeichen lang
- **Verhalten:** Truncate auf 100 Zeichen + "Details"
- **Details:** Vollständiger Text im Modal

## Technische Anforderungen

### Toast-Komponente
```typescript
interface Toast {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
  duration?: number;  // ms, 0 = persistent
  retryAction?: () => void;
  detailsAction?: () => void;
}

// Toast-API
const { toast, dismiss, dismissAll } = useToast();
toast.success("Text eingefügt");
toast.error("Fehler", { retry: () => retryFn() });
```

### Error-Schema
```typescript
interface AppError {
  code: string;          // "ERR_MIC_NOT_FOUND"
  message: string;       // User-freundliche Nachricht
  details?: string;      // Technische Details
  category: ErrorCategory;
  timestamp: Date;
  component: string;     // "audio", "transcription", etc.
  retryable: boolean;
  action?: () => void;   // Retry-Action
}

type ErrorCategory = "transient" | "user_action" | "fatal" | "permission";
```

### Bekannte Error-Codes

| Code | Message | Retry | Persistent |
|------|---------|-------|------------|
| `ERR_MIC_NOT_FOUND` | Kein Mikrofon gefunden | No | Yes |
| `ERR_MIC_PERMISSION` | Mikrofon-Berechtigung fehlt | No | Yes |
| `ERR_WHISPER_LOAD` | Whisper-Modell konnte nicht geladen werden | Yes | No |
| `ERR_OLLAMA_UNREACHABLE` | Ollama nicht erreichbar | Yes | No |
| `ERR_TRANSCRIPTION_FAILED` | Transkription fehlgeschlagen | Yes | No |
| `ERR_INSERT_FAILED` | Text konnte nicht eingefügt werden | No | No |
| `ERR_NO_SPEECH` | Keine Sprache erkannt | No | No |
| `ERR_TIMEOUT` | Zeitüberschreitung | Yes | No |

### UI-Framework
- React-Komponenten
- Tailwind CSS
- Framer Motion für Animationen
- Sonner oder eigene Toast-Implementation

### Log-Format
```
[2024-01-15T14:32:00.123Z] [ERROR] [transcription] ERR_WHISPER_LOAD: Failed to load model
  Details: File not found: /path/to/model.bin
  Stack: Error: ENOENT...
```

## Out of Scope
- Crash-Reporting an Server
- User-Feedback-Formular
- Error-Übersetzung (immer System-Sprache)
- Custom Sound bei Errors
- Slack/Discord Webhook für Errors

---

## Tech-Design (Solution Architect)

### Bestehende Infrastruktur (Wiederverwendung)

Was bereits existiert und genutzt wird:
- **Sonner Toast-Bibliothek** → Bereits in 10+ Dateien aktiv genutzt
- **tauri-plugin-log** → Logging-Plugin bereits installiert
- **Crash-Notification Component** → Template für Error-Details Modal

### Component-Struktur

```
App Layout
├── Toaster (bereits vorhanden - wird erweitert)
│   └── Toast-Warteschlange (max 3 sichtbar)
│       ├── Success Toast (grün, 3s)
│       ├── Error Toast (rot, Retry-Button)
│       ├── Warning Toast (gelb, 5s)
│       └── Info Toast (blau, Progress-Bar)
│
├── Error-Details Modal (neu)
│   ├── Vollständige Fehlermeldung
│   ├── Error-Code Anzeige
│   ├── Zeitstempel
│   └── "In Zwischenablage kopieren" Button
│
└── System-Notification Trigger (neu)
    └── Zeigt OS-Benachrichtigung wenn App im Hintergrund
```

### Daten-Model

**Jeder Fehler hat:**
- Eindeutiger Error-Code (z.B. `ERR_MIC_NOT_FOUND`)
- User-freundliche Nachricht (kurz, verständlich)
- Optionale technische Details (für Entwickler)
- Kategorie:
  - `transient` = Temporär, kann wiederholt werden
  - `user_action` = User muss etwas tun
  - `fatal` = Schwerwiegend
  - `permission` = Berechtigung fehlt
- Zeitstempel
- Retry-Option (ja/nein)

**Gespeichert:**
- Toasts: Im Speicher (React State) - verschwinden nach Schließen
- Logs: Dateisystem (`{app_data}/logs/app.log`)
- Log-Rotation: Max 5 Dateien à 10MB

### Neue UI-Komponenten

| Komponente | Beschreibung | Basiert auf |
|------------|--------------|-------------|
| `ErrorToast` | Erweiterter Toast mit Retry + Details | Sonner (bestehend) |
| `ErrorDetailsModal` | Modal für technische Details | AlertDialog (bestehend) |
| `ToastQueue` | Verwaltet max 3 gleichzeitige Toasts | Neu |
| `NotificationBridge` | Verbindet Toasts mit System-Notifications | Neu |

### Tech-Entscheidungen

| Entscheidung | Warum? |
|--------------|--------|
| **Sonner beibehalten** | Bereits in 10+ Dateien genutzt, Team kennt es, alle Features vorhanden |
| **tauri-plugin-notification hinzufügen** | Einziger Weg für native macOS/Windows Benachrichtigungen |
| **React Context für Error-State** | Ermöglicht Retry von überall, zentrale Fehlersammlung |
| **Bestehende AlertDialog nutzen** | Bereits vorhanden für Crash-Notification, gleiches Design |

### Dependencies

**Bereits installiert (keine Änderung):**
- `sonner` (Toast-Bibliothek)
- `tauri-plugin-log` (Logging)
- `@radix-ui/react-alert-dialog` (Modals)

**Neu hinzuzufügen:**
- `tauri-plugin-notification` (System-Benachrichtigungen)

### Architektur-Fluss

```
1. Fehler tritt auf (z.B. Mikrofon nicht gefunden)
              ↓
2. Error wird kategorisiert (permission, transient, etc.)
              ↓
3. Toast erscheint in App
   ├── Mit Retry-Button (wenn sinnvoll)
   └── Mit "Details" Link (wenn vorhanden)
              ↓
4. Wenn App im Hintergrund → System-Notification
              ↓
5. Fehler wird in Log-Datei geschrieben
```

### Edge Case Handling

| Situation | Lösung |
|-----------|--------|
| 10 Fehler in 2 Sekunden | Gruppieren: "5 weitere Fehler" |
| Sehr langer Fehlertext | Abschneiden nach 100 Zeichen + "Details" |
| User klickt schnell Retry | Button wird disabled während Retry läuft |
| App im Hintergrund | System-Notification statt Toast |

### Implementierungs-Reihenfolge

1. **Error-Context** (zentrales Error-Management)
2. **Erweiterter Toast** (Retry + Details Buttons)
3. **Toast-Queue** (max 3 gleichzeitig)
4. **Error-Details Modal**
5. **System-Notifications** (Tauri Plugin)
6. **Logging-Integration**

### Kein Backend nötig

Alles läuft lokal:
- Fehler werden im Browser-Speicher verwaltet
- Logs werden lokal auf der Festplatte gespeichert
- Keine Server-Kommunikation erforderlich

