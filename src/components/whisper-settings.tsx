'use client'

import { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useTauri } from '@/hooks/use-tauri'
import {
  Brain,
  Download,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Languages,
  HardDrive,
  X,
  PlayCircle,
  PauseCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/** Available Whisper models */
type WhisperModel = 'Tiny' | 'Small' | 'Medium'

/** Supported languages */
type WhisperLanguage = 'Auto' | 'German' | 'English'

/** Whisper settings from backend */
interface WhisperSettings {
  model: WhisperModel
  language: WhisperLanguage
  use_gpu: boolean
}

/** Model status info */
interface ModelStatus {
  model: WhisperModel
  downloaded: boolean
  file_size: number | null
  loaded: boolean
  downloading: boolean
}

/** Download progress info */
interface DownloadProgress {
  model: WhisperModel
  downloaded_bytes: number
  total_bytes: number
  speed_bps: number
  complete: boolean
  error: string | null
}

const ALL_MODELS: WhisperModel[] = ['Tiny', 'Small', 'Medium']

const MODEL_INFO: Record<WhisperModel, { name: string; size: string; description: string }> = {
  Tiny: { name: 'Tiny', size: '~75 MB', description: 'Schnell, weniger genau' },
  Small: { name: 'Small', size: '~500 MB', description: 'Empfohlen - gute Balance' },
  Medium: { name: 'Medium', size: '~1.5 GB', description: 'Sehr genau, langsamer' },
}

const LANGUAGE_OPTIONS: { value: WhisperLanguage; label: string }[] = [
  { value: 'Auto', label: 'Automatisch erkennen' },
  { value: 'German', label: 'Deutsch' },
  { value: 'English', label: 'English' },
]

/** Format bytes to human-readable size */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

/** Format speed in bytes per second */
function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`
}

export function WhisperSettings() {
  const { isTauri } = useTauri()
  const [settings, setSettings] = useState<WhisperSettings>({
    model: 'Small',
    language: 'Auto',
    use_gpu: true,
  })
  const [modelStatus, setModelStatus] = useState<ModelStatus[]>([])
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [interruptedDownloads, setInterruptedDownloads] = useState<Record<string, number>>({})

  // Load interrupted downloads from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('whisper-interrupted-downloads')
    if (stored) {
      try {
        setInterruptedDownloads(JSON.parse(stored))
      } catch {
        // Ignore parse errors
      }
    }
  }, [])

  // Load settings and model status
  const loadData = useCallback(async () => {
    if (!isTauri) {
      setIsLoading(false)
      return
    }

    try {
      setError(null)
      const [whisperSettings, status] = await Promise.all([
        invoke<WhisperSettings>('get_whisper_settings'),
        invoke<ModelStatus[]>('get_whisper_model_status'),
      ])
      setSettings(whisperSettings)
      setModelStatus(status)
    } catch (err) {
      console.error('Failed to load whisper data:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Whisper-Einstellungen')
    } finally {
      setIsLoading(false)
    }
  }, [isTauri])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Poll download progress
  useEffect(() => {
    if (!isTauri || !downloadProgress || downloadProgress.complete) return

    const interval = setInterval(async () => {
      try {
        const progress = await invoke<DownloadProgress | null>('get_whisper_download_progress')
        if (progress) {
          setDownloadProgress(progress)
          if (progress.complete) {
            // Refresh model status
            const status = await invoke<ModelStatus[]>('get_whisper_model_status')
            setModelStatus(status)
          }
        } else {
          setDownloadProgress(null)
        }
      } catch {
        // Ignore polling errors
      }
    }, 200)

    return () => clearInterval(interval)
  }, [isTauri, downloadProgress?.complete])

  // Update settings
  const updateSettings = async (newSettings: Partial<WhisperSettings>) => {
    if (!isTauri) return

    const updated = { ...settings, ...newSettings }
    setSettings(updated)

    try {
      await invoke('set_whisper_settings', { settings: updated })
      setError(null)
    } catch (err) {
      console.error('Failed to update whisper settings:', err)
      setError('Einstellungen konnten nicht gespeichert werden')
    }
  }

  // Download model
  const downloadModel = async (model: WhisperModel) => {
    if (!isTauri) return

    try {
      setError(null)
      setDownloadProgress({
        model,
        downloaded_bytes: 0,
        total_bytes: 1,
        speed_bps: 0,
        complete: false,
        error: null,
      })

      await invoke('download_whisper_model', { model })

      // Clear any interrupted state for this model
      const newInterrupted = { ...interruptedDownloads }
      delete newInterrupted[model]
      setInterruptedDownloads(newInterrupted)
      localStorage.setItem('whisper-interrupted-downloads', JSON.stringify(newInterrupted))

      // Refresh status after download
      const status = await invoke<ModelStatus[]>('get_whisper_model_status')
      setModelStatus(status)
      setDownloadProgress(null)
    } catch (err) {
      console.error('Download failed:', err)
      setError(err instanceof Error ? err.message : 'Download fehlgeschlagen')
      setDownloadProgress(null)
    }
  }

  // Cancel download (BUG-3 fix: save progress for resume)
  const cancelDownload = async () => {
    if (!isTauri) return

    try {
      // Save the current progress before canceling
      if (downloadProgress && downloadProgress.downloaded_bytes > 0) {
        const newInterrupted = {
          ...interruptedDownloads,
          [downloadProgress.model]: downloadProgress.downloaded_bytes,
        }
        setInterruptedDownloads(newInterrupted)
        localStorage.setItem('whisper-interrupted-downloads', JSON.stringify(newInterrupted))
        toast.info('Download pausiert', {
          description: `${formatBytes(downloadProgress.downloaded_bytes)} gespeichert. Klicke "Fortsetzen" um weiterzumachen.`,
        })
      }
      await invoke('cancel_whisper_download')
      setDownloadProgress(null)
    } catch (err) {
      console.error('Failed to cancel download:', err)
    }
  }

  // Resume download (BUG-3 fix)
  const resumeDownload = async (model: WhisperModel) => {
    // Clear the interrupted state for this model
    const newInterrupted = { ...interruptedDownloads }
    delete newInterrupted[model]
    setInterruptedDownloads(newInterrupted)
    localStorage.setItem('whisper-interrupted-downloads', JSON.stringify(newInterrupted))

    // Start the download again (backend handles resume if supported)
    await downloadModel(model)
  }

  // Check if a model has an interrupted download
  const hasInterruptedDownload = (model: WhisperModel): boolean => {
    return model in interruptedDownloads && interruptedDownloads[model] > 0
  }

  // Get interrupted download progress
  const getInterruptedProgress = (model: WhisperModel): number => {
    return interruptedDownloads[model] || 0
  }

  // Delete model
  const deleteModel = async (model: WhisperModel) => {
    if (!isTauri) return

    try {
      await invoke('delete_whisper_model', { model })
      const status = await invoke<ModelStatus[]>('get_whisper_model_status')
      setModelStatus(status)
    } catch (err) {
      console.error('Failed to delete model:', err)
      setError(err instanceof Error ? err.message : 'Modell konnte nicht gelöscht werden')
    }
  }

  // Get status for a specific model
  const getStatus = (model: WhisperModel): ModelStatus | undefined => {
    return modelStatus.find((s) => s.model === model)
  }

  // Check if current model is ready
  const isCurrentModelReady = () => {
    const status = getStatus(settings.model)
    return status?.downloaded ?? false
  }

  if (!isTauri) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Whisper Transkription</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-border/50 bg-muted/30">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <AlertDescription className="text-muted-foreground">
              Whisper-Einstellungen sind nur in der Desktop-App verfügbar.
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
            <Brain className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Whisper Transkription</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Brain className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Whisper Transkription</span>
        </CardTitle>
        <CardDescription>Lokale Sprach-zu-Text-Umwandlung mit Whisper.cpp</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Model Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Modell auswählen</Label>
          <Select
            value={settings.model}
            onValueChange={(value) => updateSettings({ model: value as WhisperModel })}
          >
            <SelectTrigger>
              <SelectValue>
                {MODEL_INFO[settings.model].name} ({MODEL_INFO[settings.model].size})
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ALL_MODELS.map((model) => {
                const status = getStatus(model)
                const info = MODEL_INFO[model]
                return (
                  <SelectItem key={model} value={model}>
                    <div className="flex items-center gap-2">
                      <span>
                        {info.name} ({info.size})
                      </span>
                      {status?.downloaded && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      )}
                    </div>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {MODEL_INFO[settings.model].description}
          </p>
        </div>

        {/* Model Status / Download */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            Modell-Status
          </Label>

          {downloadProgress && downloadProgress.model === settings.model ? (
            // Download in progress
            <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Download läuft...
                </span>
                <span className="text-muted-foreground">
                  {formatBytes(downloadProgress.downloaded_bytes)} /{' '}
                  {formatBytes(downloadProgress.total_bytes)}
                </span>
              </div>
              <Progress
                value={
                  downloadProgress.total_bytes > 0
                    ? (downloadProgress.downloaded_bytes / downloadProgress.total_bytes) * 100
                    : 0
                }
                className="h-2"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatSpeed(downloadProgress.speed_bps)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancelDownload}
                  className="h-6 gap-1 px-2 text-xs hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                  Abbrechen
                </Button>
              </div>
            </div>
          ) : isCurrentModelReady() ? (
            // Model downloaded
            <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/10 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm font-medium text-green-700">Modell bereit</p>
                  <p className="text-xs text-green-600">
                    {formatBytes(getStatus(settings.model)?.file_size ?? 0)}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteModel(settings.model)}
                className="h-8 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Löschen
              </Button>
            </div>
          ) : hasInterruptedDownload(settings.model) ? (
            // BUG-3 fix: Interrupted download - show resume button
            <div className="flex items-center justify-between rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
              <div className="flex items-center gap-2">
                <PauseCircle className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-blue-700">Download pausiert</p>
                  <p className="text-xs text-blue-600">
                    {formatBytes(getInterruptedProgress(settings.model))} heruntergeladen
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => resumeDownload(settings.model)}
                className="h-8 gap-1 border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20"
              >
                <PlayCircle className="h-4 w-4" />
                Fortsetzen
              </Button>
            </div>
          ) : (
            // Model not downloaded
            <div className="flex items-center justify-between rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                <div>
                  <p className="text-sm font-medium text-yellow-700">Modell nicht heruntergeladen</p>
                  <p className="text-xs text-yellow-600">
                    {MODEL_INFO[settings.model].size} benötigt
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadModel(settings.model)}
                className="h-8 gap-1 border-yellow-500/50 bg-yellow-500/10 hover:bg-yellow-500/20"
              >
                <Download className="h-4 w-4" />
                Herunterladen
              </Button>
            </div>
          )}
        </div>

        {/* Language Selection */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <Languages className="h-4 w-4 text-muted-foreground" />
            Sprache
          </Label>
          <Select
            value={settings.language}
            onValueChange={(value) => updateSettings({ language: value as WhisperLanguage })}
          >
            <SelectTrigger>
              <SelectValue>
                {LANGUAGE_OPTIONS.find((l) => l.value === settings.language)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            "Automatisch" erkennt die Sprache selbst. Explizite Auswahl kann die Genauigkeit
            verbessern.
          </p>
        </div>

        {/* GPU Acceleration */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center space-x-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
              <Cpu className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="use-gpu" className="text-sm font-medium">
                GPU-Beschleunigung
              </Label>
              <p className="text-xs text-muted-foreground">
                Metal (macOS) oder CUDA (Windows) nutzen
              </p>
            </div>
          </div>
          <Switch
            id="use-gpu"
            checked={settings.use_gpu}
            onCheckedChange={(checked) => updateSettings({ use_gpu: checked })}
            className="data-[state=checked]:bg-primary"
          />
        </div>

        {/* Info Box */}
        <div className="rounded-lg bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Whisper transkribiert Ihre Sprache komplett lokal auf Ihrem Gerät. Keine Audio-Daten
            werden ins Internet gesendet. Die Modelle werden beim ersten Start von Hugging Face
            heruntergeladen.
          </p>
        </div>

        {/* All Models Overview */}
        <div className="space-y-3">
          <Label className="text-sm font-medium text-muted-foreground">Alle Modelle</Label>
          <div className="grid gap-2">
            {ALL_MODELS.map((model) => {
              const status = getStatus(model)
              const info = MODEL_INFO[model]
              const isSelected = settings.model === model
              const isDownloading =
                downloadProgress?.model === model && !downloadProgress.complete

              return (
                <div
                  key={model}
                  className={cn(
                    'flex items-center justify-between rounded-lg border p-3 transition-colors',
                    isSelected
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border/50 bg-muted/20'
                  )}
                >
                  <div className="flex items-center gap-3">
                    {status?.downloaded ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : isDownloading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : hasInterruptedDownload(model) ? (
                      <PauseCircle className="h-4 w-4 text-blue-500" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{info.name}</p>
                      <p className="text-xs text-muted-foreground">{info.size}</p>
                    </div>
                  </div>
                  {status?.downloaded && status.file_size && (
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(status.file_size)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

