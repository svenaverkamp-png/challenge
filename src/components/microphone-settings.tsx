'use client'

import { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useTauri } from '@/hooks/use-tauri'
import { Mic, MicOff, Volume2, Shield, Clock, AlertCircle, RefreshCw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { showWarning, showSuccess } from '@/lib/app-error'

/** Audio device info from backend */
interface AudioDevice {
  id: string
  name: string
  is_default: boolean
}

/** Audio settings from backend */
interface AudioSettings {
  device_id: string | null
  max_duration_minutes: number
  privacy_mode: boolean
}

export function MicrophoneSettings() {
  const { isTauri } = useTauri()
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [settings, setSettings] = useState<AudioSettings>({
    device_id: null,
    max_duration_minutes: 6,
    privacy_mode: true,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [testLevel, setTestLevel] = useState(0)
  const [deviceDisconnected, setDeviceDisconnected] = useState(false)
  const [previousDeviceId, setPreviousDeviceId] = useState<string | null>(null)

  // Load devices and settings
  const loadData = useCallback(async () => {
    if (!isTauri) {
      setIsLoading(false)
      return
    }

    try {
      setError(null)
      const [deviceList, audioSettings] = await Promise.all([
        invoke<AudioDevice[]>('list_audio_devices'),
        invoke<AudioSettings>('get_audio_settings'),
      ])
      setDevices(deviceList)
      setSettings(audioSettings)
    } catch (err) {
      console.error('Failed to load audio data:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Audio-Einstellungen')
    } finally {
      setIsLoading(false)
    }
  }, [isTauri])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Monitor for device changes (BUG-2 fix)
  useEffect(() => {
    if (!isTauri) return

    // Store the currently selected device ID
    if (settings.device_id && !previousDeviceId) {
      setPreviousDeviceId(settings.device_id)
    }

    // Check for device changes every 3 seconds
    const checkDevices = async () => {
      try {
        const currentDevices = await invoke<AudioDevice[]>('list_audio_devices')

        // Check if selected device is still available
        if (settings.device_id) {
          const selectedExists = currentDevices.some(d => d.id === settings.device_id)
          if (!selectedExists && !deviceDisconnected) {
            setDeviceDisconnected(true)
            showWarning('Mikrofon getrennt', 'Das ausgewaehlte Mikrofon wurde getrennt. Wechsle zu Standard-Mikrofon.')
            // Auto-fallback to default
            await updateSettings({ device_id: null })
            setDevices(currentDevices)
          }
        }

        // Check if devices list changed (new device connected)
        if (currentDevices.length !== devices.length) {
          setDevices(currentDevices)
          if (deviceDisconnected && currentDevices.length > devices.length) {
            setDeviceDisconnected(false)
            showSuccess('Mikrofon verbunden', 'Ein neues Mikrofon wurde erkannt.')
          }
        }
      } catch {
        // Ignore polling errors
      }
    }

    const interval = setInterval(checkDevices, 3000)
    return () => clearInterval(interval)
  }, [isTauri, settings.device_id, devices.length, deviceDisconnected, previousDeviceId])

  // Update settings
  const updateSettings = async (newSettings: Partial<AudioSettings>) => {
    if (!isTauri) return

    const updated = { ...settings, ...newSettings }
    setSettings(updated)

    try {
      await invoke('set_audio_settings', { settings: updated })
      setError(null)
    } catch (err) {
      console.error('Failed to update audio settings:', err)
      setError('Einstellungen konnten nicht gespeichert werden')
    }
  }

  // Test microphone
  const startMicTest = async () => {
    if (!isTauri || isTesting) return

    setIsTesting(true)
    setTestLevel(0)

    try {
      await invoke('start_audio_recording')

      // Poll audio level for 3 seconds
      const startTime = Date.now()
      const pollInterval = setInterval(async () => {
        try {
          const level = await invoke<number>('get_audio_level')
          setTestLevel(level)

          if (Date.now() - startTime > 3000) {
            clearInterval(pollInterval)
            await invoke('stop_audio_recording')
            setIsTesting(false)
            setTestLevel(0)
          }
        } catch {
          clearInterval(pollInterval)
          setIsTesting(false)
          setTestLevel(0)
        }
      }, 100)
    } catch (err) {
      console.error('Mic test failed:', err)
      setIsTesting(false)
      setError('Mikrofon-Test fehlgeschlagen')
    }
  }

  // Get selected device display name
  const getSelectedDeviceName = () => {
    if (!settings.device_id) {
      const defaultDevice = devices.find((d) => d.is_default)
      return defaultDevice ? `${defaultDevice.name} (Standard)` : 'Standard-Mikrofon'
    }
    const device = devices.find((d) => d.id === settings.device_id)
    return device?.name || 'Unbekanntes Gerät'
  }

  if (!isTauri) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mic className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Mikrofon</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-border/50 bg-muted/30">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <AlertDescription className="text-muted-foreground">
              Mikrofon-Einstellungen sind nur in der Desktop-App verfügbar.
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
            <Mic className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Mikrofon</span>
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
          <Mic className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Mikrofon</span>
        </CardTitle>
        <CardDescription>Aufnahme-Einstellungen und Mikrofon-Auswahl</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {deviceDisconnected && (
          <Alert className="border-yellow-500/30 bg-yellow-500/10">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-700">
              Das zuvor ausgewaehlte Mikrofon wurde getrennt. Es wird jetzt das Standard-Mikrofon verwendet.
            </AlertDescription>
          </Alert>
        )}

        {/* Device Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Mikrofon auswählen</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadData}
              className="h-8 px-2"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {devices.length === 0 ? (
            <Alert className="border-yellow-500/30 bg-yellow-500/10">
              <MicOff className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-700">
                Kein Mikrofon gefunden. Bitte Mikrofon anschließen.
              </AlertDescription>
            </Alert>
          ) : (
            <Select
              value={settings.device_id || 'default'}
              onValueChange={(value) =>
                updateSettings({ device_id: value === 'default' ? null : value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Mikrofon auswählen">
                  {getSelectedDeviceName()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">
                  Standard-Mikrofon (System)
                </SelectItem>
                {devices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.name}
                    {device.is_default && ' (Standard)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Mic Test */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Mikrofon testen</Label>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={startMicTest}
              disabled={isTesting || devices.length === 0}
              className="gap-2"
            >
              <Volume2 className="h-4 w-4" />
              {isTesting ? 'Test läuft...' : 'Test starten'}
            </Button>
            {isTesting && (
              <div className="flex-1">
                <Progress
                  value={testLevel}
                  className={cn(
                    'h-2',
                    testLevel > 80 && '[&>div]:bg-red-500',
                    testLevel > 50 && testLevel <= 80 && '[&>div]:bg-yellow-500',
                    testLevel <= 50 && '[&>div]:bg-green-500'
                  )}
                />
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Sprechen Sie in das Mikrofon, um den Pegel zu testen.
          </p>
        </div>

        {/* Max Duration */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Maximale Aufnahmedauer
            </Label>
            <span className="text-sm text-muted-foreground">
              {settings.max_duration_minutes} Min.
            </span>
          </div>
          <Slider
            value={[settings.max_duration_minutes]}
            onValueChange={([value]) => updateSettings({ max_duration_minutes: value })}
            min={1}
            max={10}
            step={1}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Aufnahmen werden nach dieser Zeit automatisch beendet (1-10 Minuten).
          </p>
        </div>

        {/* Privacy Mode */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center space-x-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
              <Shield className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="privacy-mode" className="text-sm font-medium">
                Privacy-Modus
              </Label>
              <p className="text-xs text-muted-foreground">
                Audio-Dateien nach Verarbeitung automatisch löschen
              </p>
            </div>
          </div>
          <Switch
            id="privacy-mode"
            checked={settings.privacy_mode}
            onCheckedChange={(checked) => updateSettings({ privacy_mode: checked })}
            className="data-[state=checked]:bg-primary"
          />
        </div>

        {/* Info Box */}
        <div className="rounded-lg bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Audio wird in 16kHz Mono aufgenommen (optimal für Whisper).
            {settings.privacy_mode
              ? ' Aufnahmen werden nach der Transkription automatisch gelöscht.'
              : ' Aufnahmen werden im Cache-Verzeichnis gespeichert.'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
