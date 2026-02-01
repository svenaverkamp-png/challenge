'use client'

import { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useTauri } from '@/hooks/use-tauri'
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  Download,
  Settings2,
  Type,
  SpellCheck,
  CaseSensitive,
  MessageSquareQuote,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/** Ollama settings from backend */
interface OllamaSettings {
  enabled: boolean
  ollama_url: string
  model: string
  remove_fill_words: boolean
  fix_grammar: boolean
  fix_spelling: boolean
  add_punctuation: boolean
  fix_capitalization: boolean
  timeout_seconds: number
  /** BUG-2 fix: Use new German spelling reform */
  use_new_spelling: boolean
}

/** Ollama connection status */
interface OllamaStatus {
  connected: boolean
  available_models: string[]
  model_available: boolean
  error: string | null
}

const DEFAULT_SETTINGS: OllamaSettings = {
  enabled: true,
  ollama_url: 'http://localhost:11434',
  model: 'llama3.2:3b',
  remove_fill_words: true,
  fix_grammar: true,
  fix_spelling: true,
  add_punctuation: true,
  fix_capitalization: true,
  timeout_seconds: 10,
  use_new_spelling: true,
}

/** Common Ollama models for quick selection */
const COMMON_MODELS = [
  { value: 'llama3.2:3b', label: 'Llama 3.2 3B (empfohlen)', size: '~2 GB' },
  { value: 'llama3.2:1b', label: 'Llama 3.2 1B (schnell)', size: '~1 GB' },
  { value: 'mistral:7b', label: 'Mistral 7B (genau)', size: '~4 GB' },
  { value: 'gemma2:2b', label: 'Gemma 2 2B', size: '~1.6 GB' },
  { value: 'phi3:mini', label: 'Phi-3 Mini', size: '~2.3 GB' },
]

export function OllamaSettings() {
  const { isTauri } = useTauri()
  const [settings, setSettings] = useState<OllamaSettings>(DEFAULT_SETTINGS)
  const [status, setStatus] = useState<OllamaStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCheckingStatus, setIsCheckingStatus] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  // BUG-4 fix: Track if we've already tried auto-pulling
  const [hasTriedAutoPull, setHasTriedAutoPull] = useState(false)
  const [isPulling, setIsPulling] = useState(false)

  // Load settings
  const loadSettings = useCallback(async () => {
    if (!isTauri) {
      setIsLoading(false)
      return
    }

    try {
      setError(null)
      const ollamaSettings = await invoke<OllamaSettings>('get_ollama_settings')
      setSettings(ollamaSettings)
    } catch (err) {
      console.error('Failed to load ollama settings:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Einstellungen')
    } finally {
      setIsLoading(false)
    }
  }, [isTauri])

  // Check Ollama status
  const checkStatus = useCallback(async () => {
    if (!isTauri) return

    setIsCheckingStatus(true)
    try {
      const ollamaStatus = await invoke<OllamaStatus>('check_ollama_status')
      setStatus(ollamaStatus)
    } catch (err) {
      console.error('Failed to check ollama status:', err)
      setStatus({
        connected: false,
        available_models: [],
        model_available: false,
        error: err instanceof Error ? err.message : 'Verbindung fehlgeschlagen',
      })
    } finally {
      setIsCheckingStatus(false)
    }
  }, [isTauri])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Check status when settings load or enabled changes
  useEffect(() => {
    if (isTauri && settings.enabled && !isLoading) {
      checkStatus()
    }
  }, [isTauri, settings.enabled, isLoading, checkStatus])

  // BUG-4 fix: Auto-pull model if connected but model not available
  useEffect(() => {
    if (
      isTauri &&
      status?.connected &&
      !status?.model_available &&
      !hasTriedAutoPull &&
      !isPulling &&
      settings.model
    ) {
      setHasTriedAutoPull(true)
      setIsPulling(true)
      console.log('Auto-pulling model:', settings.model)
      invoke('pull_ollama_model', { model: settings.model })
        .then(() => {
          // Recheck status after pull starts
          setTimeout(() => {
            checkStatus()
            setIsPulling(false)
          }, 2000)
        })
        .catch((err) => {
          console.error('Auto-pull failed:', err)
          setIsPulling(false)
        })
    }
  }, [isTauri, status, hasTriedAutoPull, isPulling, settings.model, checkStatus])

  // Update settings
  const updateSettings = async (newSettings: Partial<OllamaSettings>) => {
    if (!isTauri) return

    const updated = { ...settings, ...newSettings }
    setSettings(updated)

    try {
      await invoke('set_ollama_settings', { settings: updated })
      setError(null)

      // Recheck status if model changed
      if (newSettings.model) {
        checkStatus()
      }
    } catch (err) {
      console.error('Failed to update ollama settings:', err)
      setError('Einstellungen konnten nicht gespeichert werden')
    }
  }

  // Pull model
  const pullModel = async (model: string) => {
    if (!isTauri) return

    try {
      await invoke('pull_ollama_model', { model })
    } catch (err) {
      console.error('Failed to pull model:', err)
    }
  }

  if (!isTauri) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">AI Auto-Edit</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-border/50 bg-muted/30">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <AlertDescription className="text-muted-foreground">
              AI Auto-Edit ist nur in der Desktop-App verfuegbar.
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
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">AI Auto-Edit</span>
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
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">AI Auto-Edit</span>
        </CardTitle>
        <CardDescription>
          Automatische Textverbesserung mit lokalem LLM (Ollama)
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
              <Sparkles className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="auto-edit-enabled" className="text-sm font-medium">
                Auto-Edit aktivieren
              </Label>
              <p className="text-xs text-muted-foreground">
                Verbessert transkribierten Text automatisch
              </p>
            </div>
          </div>
          <Switch
            id="auto-edit-enabled"
            checked={settings.enabled}
            onCheckedChange={(checked) => updateSettings({ enabled: checked })}
            className="data-[state=checked]:bg-primary"
          />
        </div>

        {settings.enabled && (
          <>
            {/* Connection Status */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-sm font-medium">
                Verbindungs-Status
              </Label>

              <div
                className={cn(
                  'flex items-center justify-between rounded-lg border p-4',
                  status?.connected
                    ? 'border-green-500/30 bg-green-500/10'
                    : 'border-yellow-500/30 bg-yellow-500/10'
                )}
              >
                <div className="flex items-center gap-2">
                  {isCheckingStatus ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : status?.connected ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-yellow-600" />
                  )}
                  <div>
                    <p
                      className={cn(
                        'text-sm font-medium',
                        status?.connected ? 'text-green-700' : 'text-yellow-700'
                      )}
                    >
                      {isCheckingStatus
                        ? 'Pruefe Verbindung...'
                        : status?.connected
                          ? 'Ollama verbunden'
                          : 'Ollama nicht erreichbar'}
                    </p>
                    {status?.error && (
                      <p className="text-xs text-yellow-600">{status.error}</p>
                    )}
                    {status?.connected && !status.model_available && (
                      <p className="text-xs text-yellow-600">
                        Modell &quot;{settings.model}&quot; nicht verfuegbar
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={checkStatus}
                  disabled={isCheckingStatus}
                  className="h-8 gap-1"
                >
                  <RefreshCw
                    className={cn('h-4 w-4', isCheckingStatus && 'animate-spin')}
                  />
                  Pruefen
                </Button>
              </div>

              {!status?.connected && (
                <Alert className="border-border/50 bg-muted/30">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  <AlertDescription className="text-muted-foreground text-xs">
                    Stellen Sie sicher, dass Ollama installiert und gestartet ist.
                    <br />
                    Installation: <code className="bg-muted px-1 rounded">brew install ollama</code>{' '}
                    dann <code className="bg-muted px-1 rounded">ollama serve</code>
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Model Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Modell auswaehlen</Label>
              <Select
                value={settings.model}
                onValueChange={(value) => updateSettings({ model: value })}
              >
                <SelectTrigger>
                  <SelectValue>
                    {COMMON_MODELS.find((m) => m.value === settings.model)?.label ||
                      settings.model}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {COMMON_MODELS.map((model) => {
                    const isAvailable = status?.available_models.some(
                      (m) =>
                        m.startsWith(model.value) ||
                        model.value.startsWith(m.split(':')[0])
                    )
                    return (
                      <SelectItem key={model.value} value={model.value}>
                        <div className="flex items-center gap-2">
                          <span>{model.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {model.size}
                          </span>
                          {isAvailable && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          )}
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>

              {status?.connected && !status.model_available && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsPulling(true)
                    pullModel(settings.model)
                  }}
                  disabled={isPulling}
                  className="h-8 gap-1"
                >
                  {isPulling ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Wird heruntergeladen...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Modell herunterladen
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Correction Options */}
            <div className="space-y-4">
              <Label className="text-sm font-medium">Korrekturen</Label>

              <div className="space-y-3">
                {/* Remove filler words */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MessageSquareQuote className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm">Fuellwoerter entfernen</p>
                      <p className="text-xs text-muted-foreground">
                        aehm, also, halt, sozusagen, etc.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.remove_fill_words}
                    onCheckedChange={(checked) =>
                      updateSettings({ remove_fill_words: checked })
                    }
                  />
                </div>

                {/* Fix grammar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Type className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm">Grammatik korrigieren</p>
                      <p className="text-xs text-muted-foreground">
                        Satzbau, Artikel, Faelle
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.fix_grammar}
                    onCheckedChange={(checked) =>
                      updateSettings({ fix_grammar: checked })
                    }
                  />
                </div>

                {/* Fix spelling */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <SpellCheck className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm">Rechtschreibung korrigieren</p>
                      <p className="text-xs text-muted-foreground">
                        dass/das, seit/seid, etc.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.fix_spelling}
                    onCheckedChange={(checked) =>
                      updateSettings({ fix_spelling: checked })
                    }
                  />
                </div>

                {/* Add punctuation */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-4 w-4 items-center justify-center text-muted-foreground font-mono text-sm">
                      .,
                    </span>
                    <div>
                      <p className="text-sm">Satzzeichen setzen</p>
                      <p className="text-xs text-muted-foreground">
                        Punkte, Kommas, Fragezeichen
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.add_punctuation}
                    onCheckedChange={(checked) =>
                      updateSettings({ add_punctuation: checked })
                    }
                  />
                </div>

                {/* Fix capitalization */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CaseSensitive className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm">Gross-/Kleinschreibung</p>
                      <p className="text-xs text-muted-foreground">
                        Nomen, Satzanfaenge
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.fix_capitalization}
                    onCheckedChange={(checked) =>
                      updateSettings({ fix_capitalization: checked })
                    }
                  />
                </div>
              </div>
            </div>

            {/* Advanced Settings */}
            <div className="space-y-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="h-8 gap-1 text-muted-foreground"
              >
                <Settings2 className="h-4 w-4" />
                {showAdvanced ? 'Erweitert ausblenden' : 'Erweiterte Einstellungen'}
              </Button>

              {showAdvanced && (
                <div className="space-y-4 rounded-lg border border-border/50 bg-muted/20 p-4">
                  {/* Ollama URL */}
                  <div className="space-y-2">
                    <Label htmlFor="ollama-url" className="text-sm">
                      Ollama URL
                    </Label>
                    <Input
                      id="ollama-url"
                      value={settings.ollama_url}
                      onChange={(e) => updateSettings({ ollama_url: e.target.value })}
                      placeholder="http://localhost:11434"
                    />
                    <p className="text-xs text-muted-foreground">
                      Nur localhost URLs erlaubt (Sicherheit)
                    </p>
                  </div>

                  {/* Timeout */}
                  <div className="space-y-2">
                    <Label htmlFor="timeout" className="text-sm">
                      Timeout (Sekunden)
                    </Label>
                    <Input
                      id="timeout"
                      type="number"
                      min={5}
                      max={60}
                      value={settings.timeout_seconds}
                      onChange={(e) =>
                        updateSettings({ timeout_seconds: parseInt(e.target.value) || 10 })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Bei Timeout wird der Rohtext verwendet
                    </p>
                  </div>

                  {/* BUG-2 fix: Spelling reform option */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm">Neue Rechtschreibung</p>
                      <p className="text-xs text-muted-foreground">
                        dass statt daß, Stopp statt Stop
                      </p>
                    </div>
                    <Switch
                      checked={settings.use_new_spelling}
                      onCheckedChange={(checked) =>
                        updateSettings({ use_new_spelling: checked })
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Info Box */}
        <div className="rounded-lg bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Auto-Edit verbessert Ihre Transkription automatisch mit einem lokalen KI-Modell.
            Alle Daten bleiben auf Ihrem Geraet - keine Cloud-Verbindung noetig.
            Ollama muss separat installiert sein.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
