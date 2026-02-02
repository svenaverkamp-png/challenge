# EverVoice - Deployment Guide

EverVoice ist eine **lokale Desktop-App** - kein Cloud-Deployment erforderlich.

## Release-Workflow

### Automatischer Release (empfohlen)

1. **Version in Dateien aktualisieren:**
   ```bash
   # src-tauri/tauri.conf.json
   "version": "1.1.0"

   # src-tauri/Cargo.toml
   version = "1.1.0"

   # package.json
   "version": "1.1.0"
   ```

2. **Änderungen committen:**
   ```bash
   git add .
   git commit -m "release: v1.1.0"
   ```

3. **Tag erstellen und pushen:**
   ```bash
   git tag v1.1.0
   git push origin main --tags
   ```

4. **GitHub Actions baut automatisch:**
   - macOS Intel (.dmg)
   - macOS Apple Silicon (.dmg)
   - Windows (.exe)

5. **Release veröffentlichen:**
   - GitHub → Releases → Draft Release reviewen
   - Release wird automatisch veröffentlicht nach erfolgreichem Build

### Manueller Release

Workflow manuell starten via GitHub Actions:
1. GitHub → Actions → "Release EverVoice"
2. "Run workflow" klicken
3. Version eingeben (z.B. `1.1.0`)

---

## Download-Links für User

Nach dem Release sind die Downloads verfügbar unter:

```
https://github.com/[OWNER]/[REPO]/releases/latest
```

### Direktlinks (nach Release):
- **macOS Intel:** `EverVoice_[VERSION]_x64.dmg`
- **macOS Apple Silicon:** `EverVoice_[VERSION]_aarch64.dmg`
- **Windows:** `EverVoice_[VERSION]_x64-setup.exe`

---

## Lokaler Build (Development)

### Voraussetzungen

- Node.js 20+
- Rust 1.77+
- Tauri CLI: `npm install -g @tauri-apps/cli`

### macOS zusätzlich:
- Xcode Command Line Tools: `xcode-select --install`

### Windows zusätzlich:
- Visual Studio Build Tools
- WebView2 (meist vorinstalliert)

### Build-Befehle

```bash
# Development Mode
npm run tauri dev

# Production Build
npm run tauri build

# Build für spezifisches Target
npm run tauri build -- --target x86_64-apple-darwin      # macOS Intel
npm run tauri build -- --target aarch64-apple-darwin    # macOS Apple Silicon
npm run tauri build -- --target x86_64-pc-windows-msvc  # Windows
```

### Build Output

Die fertigen Installer befinden sich in:
```
src-tauri/target/release/bundle/
├── dmg/          # macOS .dmg
├── macos/        # macOS .app
└── msi/          # Windows .msi (falls aktiviert)
    nsis/         # Windows .exe Installer
```

---

## Code Signing (Optional)

### macOS (Apple Developer Account erforderlich)

GitHub Secrets einrichten:
```
APPLE_CERTIFICATE          # Base64-encoded .p12 Certificate
APPLE_CERTIFICATE_PASSWORD # Certificate Password
APPLE_SIGNING_IDENTITY     # e.g., "Developer ID Application: Your Name (TEAM_ID)"
APPLE_ID                   # Apple ID Email
APPLE_PASSWORD             # App-specific Password
APPLE_TEAM_ID              # 10-character Team ID
```

**Ohne Signierung:** User müssen bei macOS Gatekeeper-Warnung Rechtsklick → Öffnen nutzen.

### Windows (Optional)

Für signierte Windows-Builds: EV Code Signing Certificate erforderlich.

---

## CI/CD Übersicht

| Workflow | Trigger | Aktion |
|----------|---------|--------|
| `ci.yml` | Push/PR auf main | Lint, Type Check, Build Check |
| `release.yml` | Tag `v*` oder manuell | Baut alle Plattformen, erstellt GitHub Release |

---

## Troubleshooting

### Build schlägt fehl auf GitHub Actions

1. **Rust Version prüfen:** `rust-version` in Cargo.toml muss mit Action kompatibel sein
2. **Dependencies prüfen:** `npm ci` muss erfolgreich laufen
3. **Tauri Version:** CLI und Rust Crate müssen übereinstimmen

### macOS Build lokal funktioniert, CI nicht

- Sicherstellen dass Targets installiert sind:
  ```bash
  rustup target add x86_64-apple-darwin
  rustup target add aarch64-apple-darwin
  ```

### Windows Build Fehler

- WebView2 muss installiert sein
- Visual Studio Build Tools benötigt

---

## Checklist vor Release

- [ ] Version in allen Dateien aktualisiert (tauri.conf.json, Cargo.toml, package.json)
- [ ] `npm run build` läuft lokal ohne Fehler
- [ ] `npm run tauri build` läuft lokal ohne Fehler
- [ ] Alle Tests bestanden
- [ ] CHANGELOG.md aktualisiert
- [ ] Git Tag erstellt und gepusht
- [ ] GitHub Release überprüft und veröffentlicht
