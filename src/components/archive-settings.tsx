'use client'

import { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useTauri } from '@/hooks/use-tauri'
import {
  Archive,
  AlertCircle,
  Folder,
  FolderTree,
  FileText,
  Loader2,
  FolderOpen,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

/** Folder structure options */
type FolderStructure = 'Flat' | 'Nested'

/** Archive settings from backend */
interface ArchiveSettings {
  enabled: boolean
  path: string
  include_original: boolean
  folder_structure: FolderStructure
}

const DEFAULT_SETTINGS: ArchiveSettings = {
  enabled: true,
  path: '',
  include_original: true,
  folder_structure: 'Flat',
}

/** Folder structure options */
const FOLDER_STRUCTURE_OPTIONS = [
  {
    value: 'Flat',
    label: 'Flach',
    description: 'Alle Dateien in einem Ordner',
    icon: Folder,
  },
  {
    value: 'Nested',
    label: 'Nach Datum',
    description: 'Unterordner für Jahr/Monat',
    icon: FolderTree,
  },
]

export function ArchiveSettings() {
  const { isTauri } = useTauri()
  const [settings, setSettings] = useState<ArchiveSettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pathValid, setPathValid] = useState<boolean | null>(null)
  const [isCheckingPath, setIsCheckingPath] = useState(false)

  // Load settings
  const loadSettings = useCallback(async () => {
    if (!isTauri) {
      setIsLoading(false)
      return
    }

    try {
      setError(null)
      const archiveSettings = await invoke<ArchiveSettings>('get_archive_settings')
      setSettings(archiveSettings)
      // Check if current path is valid
      if (archiveSettings.path) {
        checkPathValidity(archiveSettings.path)
      }
    } catch (err) {
      console.error('Failed to load archive settings:', err)
      // Load default path
      try {
        const defaultPath = await invoke<string>('get_default_archive_path')
        setSettings({ ...DEFAULT_SETTINGS, path: defaultPath })
      } catch {
        setSettings(DEFAULT_SETTINGS)
      }
    } finally {
      setIsLoading(false)
    }
  }, [isTauri])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Check if path is writable
  const checkPathValidity = async (path: string) => {
    if (!isTauri || !path) {
      setPathValid(null)
      return
    }

    setIsCheckingPath(true)
    try {
      const isValid = await invoke<boolean>('check_archive_path', { path })
      setPathValid(isValid)
    } catch (err) {
      console.error('Failed to check path:', err)
      setPathValid(false)
    } finally {
      setIsCheckingPath(false)
    }
  }

  // Update settings
  const updateSettings = async (newSettings: Partial<ArchiveSettings>) => {
    if (!isTauri) return

    const updated = { ...settings, ...newSettings }
    setSettings(updated)
    setIsSaving(true)

    try {
      await invoke('set_archive_settings', { settings: updated })
      setError(null)

      // Check path validity if path changed
      if (newSettings.path !== undefined) {
        checkPathValidity(updated.path)
      }
    } catch (err) {
      console.error('Failed to update archive settings:', err)
      setError('Einstellungen konnten nicht gespeichert werden')
    } finally {
      setIsSaving(false)
    }
  }

  // Open folder picker
  const selectFolder = async () => {
    if (!isTauri) return

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: settings.path || undefined,
        title: 'Archiv-Ordner auswählen',
      })

      if (selected && typeof selected === 'string') {
        updateSettings({ path: selected })
      }
    } catch (err) {
      console.error('Failed to open folder dialog:', err)
      setError('Ordner-Auswahl fehlgeschlagen')
    }
  }

  if (!isTauri) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Archive className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Transkriptions-Archiv</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-border/50 bg-muted/30">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <AlertDescription className="text-muted-foreground">
              Archiv-Einstellungen sind nur in der Desktop-App verfügbar.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Archive className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Transkriptions-Archiv</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Archive className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Transkriptions-Archiv</span>
          {isSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          Automatische Speicherung als Markdown-Dateien (Obsidian-kompatibel)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center space-x-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
              <Archive className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="archive-enabled" className="text-sm font-medium">
                Archivierung aktiv
              </Label>
              <p className="text-xs text-muted-foreground">
                Transkriptionen automatisch speichern
              </p>
            </div>
          </div>
          <Switch
            id="archive-enabled"
            checked={settings.enabled}
            onCheckedChange={(checked) => updateSettings({ enabled: checked })}
            className="data-[state=checked]:bg-primary"
          />
        </div>

        {settings.enabled && (
          <>
            {/* Archive Path */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                Archiv-Ordner
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    value={settings.path}
                    onChange={(e) => updateSettings({ path: e.target.value })}
                    placeholder="~/VoiceApp/transcriptions/"
                    className="pr-8"
                  />
                  {isCheckingPath && (
                    <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                  {!isCheckingPath && pathValid === true && (
                    <CheckCircle2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-green-500" />
                  )}
                  {!isCheckingPath && pathValid === false && (
                    <XCircle className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-destructive" />
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={selectFolder}
                  title="Ordner auswählen"
                >
                  <Folder className="h-4 w-4" />
                </Button>
              </div>
              {pathValid === false && (
                <p className="text-xs text-destructive">
                  Keine Schreibberechtigung für diesen Ordner
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Ordner wird automatisch erstellt wenn nicht vorhanden
              </p>
            </div>

            {/* Folder Structure */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <FolderTree className="h-4 w-4 text-muted-foreground" />
                Ordnerstruktur
              </Label>
              <Select
                value={settings.folder_structure}
                onValueChange={(value) => updateSettings({ folder_structure: value as FolderStructure })}
              >
                <SelectTrigger>
                  <SelectValue>
                    {FOLDER_STRUCTURE_OPTIONS.find((f) => f.value === settings.folder_structure)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {FOLDER_STRUCTURE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <option.icon className="h-4 w-4 text-muted-foreground" />
                        <div className="flex flex-col">
                          <span>{option.label}</span>
                          <span className="text-xs text-muted-foreground">{option.description}</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {settings.folder_structure === 'Nested'
                  ? 'Beispiel: 2024/01/2024-01-15_14-32_slack_nachricht.md'
                  : 'Beispiel: 2024-01-15_14-32_slack_nachricht.md'
                }
              </p>
            </div>

            {/* Include Original Text */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center space-x-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="space-y-0.5">
                  <Label htmlFor="include-original" className="text-sm font-medium">
                    Originaltext speichern
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Unbearbeiteten Whisper-Output zusätzlich speichern
                  </p>
                </div>
              </div>
              <Switch
                id="include-original"
                checked={settings.include_original}
                onCheckedChange={(checked) => updateSettings({ include_original: checked })}
                className="data-[state=checked]:bg-primary"
              />
            </div>

            {/* Preview */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Datei-Vorschau</Label>
              <div className="rounded-lg border border-border/50 bg-muted/20 p-4 font-mono text-xs whitespace-pre overflow-x-auto">
                <span className="text-muted-foreground">---</span>
                {'\n'}
                <span className="text-blue-500">date</span>: 2024-01-15T14:32:00+01:00
                {'\n'}
                <span className="text-blue-500">app</span>: Slack
                {'\n'}
                <span className="text-blue-500">category</span>: chat
                {'\n'}
                <span className="text-blue-500">duration</span>: 45
                {'\n'}
                <span className="text-blue-500">words</span>: 127
                {'\n'}
                <span className="text-blue-500">language</span>: de
                {'\n'}
                <span className="text-blue-500">tags</span>:
                {'\n'}
                {'  '}- transkription
                {'\n'}
                {'  '}- voice
                {'\n'}
                <span className="text-muted-foreground">---</span>
                {'\n\n'}
                <span className="text-green-600"># Transkription vom 15. Januar 2024</span>
                {'\n\n'}
                <span className="font-bold">App:</span> Slack
                {'\n'}
                <span className="font-bold">Zeit:</span> 14:32 Uhr
              </div>
            </div>

            {/* Info Box */}
            <div className="rounded-lg bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Jede Transkription wird automatisch als Markdown-Datei mit YAML-Frontmatter gespeichert.
                Die Dateien sind kompatibel mit Obsidian und anderen Markdown-Editoren.
                Nutze Obsidian&apos;s Dataview-Plugin um Transkriptionen nach Datum, App oder Tags zu filtern.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
