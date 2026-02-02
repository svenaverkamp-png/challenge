'use client'

import { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useTauri } from '@/hooks/use-tauri'
import {
  Type,
  Clipboard,
  Keyboard,
  Zap,
  RotateCcw,
  AlertCircle,
} from 'lucide-react'

/** Text insert method */
type InsertMethod = 'Auto' | 'Clipboard' | 'Keyboard'

/** Text insert settings from backend */
interface TextInsertSettings {
  insert_method: InsertMethod
  clipboard_restore: boolean
  type_speed: number
  bulk_threshold: number
  enabled: boolean
}

const METHOD_OPTIONS: { value: InsertMethod; label: string; icon: typeof Zap; description: string }[] = [
  {
    value: 'Auto',
    label: 'Automatisch',
    icon: Zap,
    description: 'Beste Methode je nach Text automatisch waehlen (empfohlen)',
  },
  {
    value: 'Clipboard',
    label: 'Zwischenablage',
    icon: Clipboard,
    description: 'Text in Zwischenablage kopieren und Cmd/Ctrl+V simulieren',
  },
  {
    value: 'Keyboard',
    label: 'Tastatur',
    icon: Keyboard,
    description: 'Zeichen einzeln tippen (langsamer, aber kompatibler)',
  },
]

export function TextInsertSettings() {
  const { isTauri } = useTauri()
  const [settings, setSettings] = useState<TextInsertSettings>({
    insert_method: 'Auto',
    clipboard_restore: true,
    type_speed: 10,
    bulk_threshold: 1000,
    enabled: true,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load settings
  const loadSettings = useCallback(async () => {
    if (!isTauri) {
      setIsLoading(false)
      return
    }

    try {
      setError(null)
      const textInsertSettings = await invoke<TextInsertSettings>('get_text_insert_settings')
      setSettings(textInsertSettings)
    } catch (err) {
      console.error('Failed to load text insert settings:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Einstellungen')
    } finally {
      setIsLoading(false)
    }
  }, [isTauri])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Update settings
  const updateSettings = async (newSettings: Partial<TextInsertSettings>) => {
    if (!isTauri) return

    const updated = { ...settings, ...newSettings }
    setSettings(updated)

    try {
      await invoke('set_text_insert_settings', { settings: updated })
      setError(null)
    } catch (err) {
      console.error('Failed to update text insert settings:', err)
      setError('Einstellungen konnten nicht gespeichert werden')
    }
  }

  if (!isTauri) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Type className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Text einfuegen</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-border/50 bg-muted/30">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <AlertDescription className="text-muted-foreground">
              Text-Einfuege-Einstellungen sind nur in der Desktop-App verfuegbar.
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
            <Type className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Text einfuegen</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
          <Type className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Text einfuegen</span>
        </CardTitle>
        <CardDescription>
          Automatisches Einfuegen des transkribierten Texts in das aktive Textfeld
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Enable/Disable Text Insert */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center space-x-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
              <Zap className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="text-insert-enabled" className="text-sm font-medium">
                Automatisches Einfuegen
              </Label>
              <p className="text-xs text-muted-foreground">
                Text nach Transkription automatisch ins aktive Textfeld einfuegen
              </p>
            </div>
          </div>
          <Switch
            id="text-insert-enabled"
            checked={settings.enabled}
            onCheckedChange={(checked) => updateSettings({ enabled: checked })}
            className="data-[state=checked]:bg-primary"
          />
        </div>

        {settings.enabled && (
          <>
            {/* Insert Method Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Einfuege-Methode</Label>
              <Select
                value={settings.insert_method}
                onValueChange={(value) => updateSettings({ insert_method: value as InsertMethod })}
              >
                <SelectTrigger>
                  <SelectValue>
                    {METHOD_OPTIONS.find((m) => m.value === settings.insert_method)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {METHOD_OPTIONS.map((option) => {
                    const Icon = option.icon
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span>{option.label}</span>
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {METHOD_OPTIONS.find((m) => m.value === settings.insert_method)?.description}
              </p>
            </div>

            {/* Clipboard Restore */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center space-x-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
                  <RotateCcw className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="space-y-0.5">
                  <Label htmlFor="clipboard-restore" className="text-sm font-medium">
                    Zwischenablage wiederherstellen
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Urspruenglichen Inhalt der Zwischenablage nach Einfuegen wiederherstellen
                  </p>
                </div>
              </div>
              <Switch
                id="clipboard-restore"
                checked={settings.clipboard_restore}
                onCheckedChange={(checked) => updateSettings({ clipboard_restore: checked })}
                className="data-[state=checked]:bg-primary"
              />
            </div>

            {/* Bulk Threshold (only shown for Auto mode) */}
            {settings.insert_method === 'Auto' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Bulk-Schwelle</Label>
                  <span className="text-sm text-muted-foreground">
                    {settings.bulk_threshold} Zeichen
                  </span>
                </div>
                <Slider
                  value={[settings.bulk_threshold]}
                  onValueChange={([value]) => updateSettings({ bulk_threshold: value })}
                  min={100}
                  max={5000}
                  step={100}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Ab dieser Zeichenanzahl wird immer die Zwischenablage verwendet (schneller fuer
                  lange Texte)
                </p>
              </div>
            )}

            {/* Type Speed (only shown for Keyboard mode) */}
            {settings.insert_method === 'Keyboard' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Tipp-Geschwindigkeit</Label>
                  <span className="text-sm text-muted-foreground">{settings.type_speed} ms</span>
                </div>
                <Slider
                  value={[settings.type_speed]}
                  onValueChange={([value]) => updateSettings({ type_speed: value })}
                  min={0}
                  max={50}
                  step={5}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Verzoegerung zwischen einzelnen Zeichen (0 = so schnell wie moeglich)
                </p>
              </div>
            )}
          </>
        )}

        {/* Info Box */}
        <div className="rounded-lg bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {settings.enabled
              ? 'Nach erfolgreicher Transkription wird der Text automatisch in das aktive Textfeld eingefuegt. Stellen Sie sicher, dass ein Textfeld fokussiert ist bevor Sie aufnehmen.'
              : 'Wenn deaktiviert, wird der transkribierte Text nur in der App angezeigt und muss manuell kopiert werden.'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

