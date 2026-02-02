# Template Changelog

> Dokumentiert Änderungen am Template.
> Für Feature-Änderungen siehe Git-History.

---

## v1.4.3 (2026-01-16)

**Requirements Engineer: PROJECT_CONTEXT.md automatisch aktualisieren**
- Neue Phase 5: Nach Feature-Specs → PROJECT_CONTEXT.md updaten
- Aktualisiert: "Aktueller Status", "Features Roadmap", optional "Vision"
- Neuer Checklist-Punkt: "PROJECT_CONTEXT.md aktualisiert"

**Geändert:** `.claude/agents/requirements-engineer.md`

---

## v1.4.2 (2026-01-16)

**Frontend Developer: Design-Vorgaben abfragen**
- Neuer Workflow-Schritt: Prüfe ob Design-Mockups existieren
- Bei fehlenden Vorgaben: Frage nach Stil, Farben, Inspiration
- Nutzt `AskUserQuestion` für interaktive Abfrage
- Neue Checklist-Item: "Design-Vorgaben geklärt"

**Geändert:** `.claude/agents/frontend-dev.md`

---

## v1.4.1 (2026-01-16)

**Requirements Engineer: Feature-Granularität**
- Neuer Abschnitt "Single Responsibility" für Feature Specs
- Regel: Jedes Feature-File = EINE testbare Einheit
- Faustregeln für Aufteilung (5 Kriterien)
- Abhängigkeiten zwischen Features dokumentieren

**Geändert:** `.claude/agents/requirements-engineer.md`

---

## v1.4.0 (2026-01-15)

**Git-basierter Workflow (Vereinfachung)**
- `FEATURE_CHANGELOG.md` entfernt → Git-History ist Source of Truth
- Agents nutzen `git log` statt manuelle Changelogs
- Weniger Dateipflege, gleiche Übersicht

**Entfernt:** `FEATURE_CHANGELOG.md`
**Geändert:** Alle 6 Agent-Files

---

## v1.3.0 (2026-01-12)

**DevOps Agent: Production-Ready Guides**
- Error Tracking (Sentry)
- Security Headers
- Environment Variables Best Practices
- Performance Monitoring (Lighthouse)
- Production Checklist

**Backend Agent: Performance & Scalability**
- Database Indexing
- Query Optimization (N+1 Problem)
- Caching Strategy
- Input Validation (Zod)
- Rate Limiting

**QA Agent: Test Reports**
- Neuer Ordner `/test-reports/`
- Report-Format dokumentiert

**Geändert:** `devops.md`, `backend-dev.md`, `qa-engineer.md`, `README.md`
**Neu:** `test-reports/README.md`

---

## v1.2.0 (2026-01-10)

**Feature Changelog System**
- `FEATURE_CHANGELOG.md` für Feature-Tracking
- Alle 6 Agents prüfen bestehende Features
- Verhindert Duplikate, ermöglicht Code-Reuse

**Neu:** `FEATURE_CHANGELOG.md`
**Geändert:** Alle 6 Agent-Files

---

## v1.1.0 (2026-01-10)

**Agent System Improvements**
- `.claude/skills/` → `.claude/agents/` umbenannt
- Requirements Engineer nutzt `AskUserQuestion` Tool
- Interaktive Single/Multiple-Choice statt Freitext

**Neu:** `HOW_TO_USE_AGENTS.md`, `TEMPLATE_CHANGELOG.md`
**Geändert:** `requirements-engineer.md`, `README.md`, `PROJECT_CONTEXT.md`

---

## v1.0.0 (2026-01-10)

**Initial Release**
- Next.js 15 + TypeScript + Tailwind CSS
- 6 AI Agents mit Checklisten
- Supabase-Ready, shadcn/ui-Ready, Vercel-Ready
- PROJECT_CONTEXT.md Template
- Feature Specs System (`/features/PROJ-X.md`)