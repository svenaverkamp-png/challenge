'use client'

import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useTauri } from '@/hooks/use-tauri'
import {
  Shield,
  Trash2,
  BarChart3,
  AlertCircle,
  Lock,
} from 'lucide-react'

/** Privacy settings from backend */
interface PrivacySettingsData {
  delete_audio_after_processing: boolean
  enable_telemetry: boolean
}

const DEFAULT_SETTINGS: PrivacySettingsData = {
  delete_audio_after_processing: true,
  enable_telemetry: false,
}

export function PrivacySettings() {
  const { isTauri } = useTauri()
  const [settings, setSettings] = useState<PrivacySettingsData>(DEFAULT_SETTINGS)
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
      const privacySettings = await invoke<PrivacySettingsData>('get_privacy_settings')
      setSettings(privacySettings)
    } catch (err) {
      console.error('Failed to load privacy settings:', err)
      // Use defaults if no settings exist
      setSettings(DEFAULT_SETTINGS)
    } finally {
      setIsLoading(false)
    }
  }, [isTauri])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Update settings
  const updateSettings = async (newSettings: Partial<PrivacySettingsData>) => {
    if (!isTauri) return

    const updated = { ...settings, ...newSettings }
    setSettings(updated)

    try {
      await invoke('set_privacy_settings', { settings: updated })
      setError(null)
    } catch (err) {
      console.error('Failed to update privacy settings:', err)
      setError('Einstellungen konnten nicht gespeichert werden')
    }
  }

  if (!isTauri) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Datenschutz</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-border/50 bg-muted/30">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <AlertDescription className="text-muted-foreground">
              Datenschutz-Einstellungen sind nur in der Desktop-App verfuegbar.
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
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Datenschutz</span>
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
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Datenschutz</span>
        </CardTitle>
        <CardDescription>
          Kontrolle ueber Ihre Daten und Privatshaere
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Delete Audio After Processing */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center space-x-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
              <Trash2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="delete-audio" className="text-sm font-medium">
                Audio nach Verarbeitung loeschen
              </Label>
              <p className="text-xs text-muted-foreground">
                Audiodateien werden automatisch geloescht
              </p>
            </div>
          </div>
          <Switch
            id="delete-audio"
            checked={settings.delete_audio_after_processing}
            onCheckedChange={(checked) =>
              updateSettings({ delete_audio_after_processing: checked })
            }
            aria-label="Audio nach Verarbeitung loeschen"
            className="data-[state=checked]:bg-primary"
          />
        </div>

        {/* Telemetry */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center space-x-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="telemetry" className="text-sm font-medium">
                Anonyme Nutzungsdaten
              </Label>
              <p className="text-xs text-muted-foreground">
                Hilft uns, die App zu verbessern
              </p>
            </div>
          </div>
          <Switch
            id="telemetry"
            checked={settings.enable_telemetry}
            onCheckedChange={(checked) =>
              updateSettings({ enable_telemetry: checked })
            }
            aria-label="Telemetrie aktivieren/deaktivieren"
            className="data-[state=checked]:bg-primary"
          />
        </div>

        {/* Privacy Info Box */}
        <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-green-600 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                Ihre Daten bleiben lokal
              </p>
              <p className="text-xs text-green-600 dark:text-green-500 leading-relaxed">
                Alle Audiodaten und Transkriptionen werden ausschliesslich auf Ihrem
                Geraet verarbeitet. Es werden keine Sprachaufnahmen an externe
                Server gesendet. Die KI-Verarbeitung erfolgt ueber lokales Ollama.
              </p>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="rounded-lg bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong>Audio loeschen:</strong> Wenn aktiviert, werden Audiodateien
            sofort nach der Transkription geloescht. Deaktivieren Sie dies nur,
            wenn Sie Aufnahmen manuell archivieren moechten.
            <br /><br />
            <strong>Telemetrie:</strong> Sendet nur anonyme Statistiken wie
            App-Version und Fehlerberichte. Keine Audiodaten oder Transkriptionen.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

