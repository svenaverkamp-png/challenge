'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useTauri } from '@/hooks/use-tauri'
import { useAutostart } from '@/hooks/use-autostart'
import {
  Settings,
  Power,
  AlertCircle,
} from 'lucide-react'


export function GeneralSettings() {
  const { isTauri } = useTauri()
  const { isEnabled: autostartEnabled, isLoading: autostartLoading, error: autostartError, toggle: toggleAutostart } = useAutostart()

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
        {autostartError && (
          <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{autostartError}</AlertDescription>
          </Alert>
        )}

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

