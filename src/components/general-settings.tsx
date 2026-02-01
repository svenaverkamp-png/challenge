'use client'

import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useTauri } from '@/hooks/use-tauri'
import { useAutostart } from '@/hooks/use-autostart'
import {
  Settings,
  Power,
  Palette,
  AlertCircle,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react'

/** Theme options */
type Theme = 'light' | 'dark' | 'system'

/** General settings from backend */
interface GeneralSettingsData {
  theme: Theme
}

const DEFAULT_SETTINGS: GeneralSettingsData = {
  theme: 'system',
}

export function GeneralSettings() {
  const { isTauri } = useTauri()
  const { isEnabled: autostartEnabled, isLoading: autostartLoading, error: autostartError, toggle: toggleAutostart } = useAutostart()
  const [settings, setSettings] = useState<GeneralSettingsData>(DEFAULT_SETTINGS)
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
      const generalSettings = await invoke<GeneralSettingsData>('get_general_settings')
      setSettings(generalSettings)
    } catch (err) {
      console.error('Failed to load general settings:', err)
      // Use defaults if no settings exist
      setSettings(DEFAULT_SETTINGS)
    } finally {
      setIsLoading(false)
    }
  }, [isTauri])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Apply theme to document
  useEffect(() => {
    const applyTheme = (theme: Theme) => {
      const root = document.documentElement

      if (theme === 'system') {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        root.classList.toggle('dark', systemPrefersDark)
      } else {
        root.classList.toggle('dark', theme === 'dark')
      }
    }

    applyTheme(settings.theme)

    // Listen for system theme changes if using system theme
    if (settings.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (e: MediaQueryListEvent) => {
        document.documentElement.classList.toggle('dark', e.matches)
      }
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    }
  }, [settings.theme])

  // Update settings
  const updateSettings = async (newSettings: Partial<GeneralSettingsData>) => {
    if (!isTauri) return

    const updated = { ...settings, ...newSettings }
    setSettings(updated)

    try {
      await invoke('set_general_settings', { settings: updated })
      setError(null)
    } catch (err) {
      console.error('Failed to update general settings:', err)
      setError('Einstellungen konnten nicht gespeichert werden')
    }
  }

  if (!isTauri) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Allgemein</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-border/50 bg-muted/30">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <AlertDescription className="text-muted-foreground">
              Allgemeine Einstellungen sind nur in der Desktop-App verfuegbar.
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
            <Settings className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Allgemein</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Allgemein</span>
        </CardTitle>
        <CardDescription>
          Grundlegende App-Einstellungen
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {(error || autostartError) && (
          <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error || autostartError}</AlertDescription>
          </Alert>
        )}

        {/* Theme Selection */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center space-x-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
              <Palette className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Erscheinungsbild</Label>
              <p className="text-xs text-muted-foreground">
                Farbschema der App anpassen
              </p>
            </div>
          </div>
          <Select
            value={settings.theme}
            onValueChange={(value) => updateSettings({ theme: value as Theme })}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  System
                </div>
              </SelectItem>
              <SelectItem value="light">
                <div className="flex items-center gap-2">
                  <Sun className="h-4 w-4" />
                  Hell
                </div>
              </SelectItem>
              <SelectItem value="dark">
                <div className="flex items-center gap-2">
                  <Moon className="h-4 w-4" />
                  Dunkel
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Autostart */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center space-x-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
              <Power className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="autostart" className="text-sm font-medium">
                Autostart
              </Label>
              <p className="text-xs text-muted-foreground">
                App beim Systemstart automatisch oeffnen
              </p>
            </div>
          </div>
          {autostartLoading ? (
            <Skeleton className="h-6 w-11 rounded-full" />
          ) : (
            <Switch
              id="autostart"
              checked={autostartEnabled}
              onCheckedChange={toggleAutostart}
              aria-label="Autostart aktivieren/deaktivieren"
              className="data-[state=checked]:bg-primary"
            />
          )}
        </div>

        {/* Info Box */}
        <div className="rounded-lg bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Die App laeuft im Hintergrund und ist ueber das System-Tray zugaenglich.
            Klicken Sie auf das Tray-Icon um das Hauptfenster zu oeffnen.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
