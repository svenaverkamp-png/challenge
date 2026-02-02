'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useAutostart } from '@/hooks/use-autostart'
import { useTauri } from '@/hooks/use-tauri'
import { HotkeySettings } from '@/components/hotkey-settings'
import { MicrophoneSettings } from '@/components/microphone-settings'
import { WhisperSettings } from '@/components/whisper-settings'
import { TextInsertSettings } from '@/components/text-insert-settings'
import { OllamaSettings } from '@/components/ollama-settings'
import { ArchiveSettings } from '@/components/archive-settings'
import { AlertCircle, Power, Settings } from 'lucide-react'

export function SettingsPanel() {
  const { isTauri } = useTauri()
  const { isEnabled, isLoading, error, toggle } = useAutostart()

  return (
    <div className="space-y-6">
      {/* Hotkey Settings - shown first as it's the primary feature */}
      <HotkeySettings />

      {/* Microphone Settings (PROJ-3) */}
      <MicrophoneSettings />

      {/* Whisper Settings (PROJ-4) */}
      <WhisperSettings />

      {/* Text Insert Settings (PROJ-6) */}
      <TextInsertSettings />

      {/* AI Auto-Edit Settings (PROJ-7) */}
      <OllamaSettings />

      {/* Archive Settings (PROJ-18) */}
      <ArchiveSettings />

      {/* General Settings */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-light">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Allgemein</span>
          </CardTitle>
          {!isTauri && (
            <CardDescription>
              Desktop-App für alle Einstellungen erforderlich
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {!isTauri ? (
            <Alert className="border-border/50 bg-muted/30">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <AlertDescription className="text-muted-foreground">
                Diese Einstellungen sind nur in der Desktop-App verfügbar.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {/* Autostart Section */}
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
                      App beim Systemstart automatisch öffnen
                    </p>
                  </div>
                </div>
                {isLoading ? (
                  <Skeleton className="h-6 w-11 rounded-full" />
                ) : (
                  <Switch
                    id="autostart"
                    checked={isEnabled}
                    onCheckedChange={toggle}
                    aria-label="Autostart aktivieren/deaktivieren"
                    className="data-[state=checked]:bg-primary"
                  />
                )}
              </div>

              {error && (
                <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Info */}
              <div className="rounded-lg bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Die App läuft im Hintergrund und ist über das System-Tray zugänglich.
                  Klicke auf das Tray-Icon um das Hauptfenster zu öffnen.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

