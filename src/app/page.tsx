'use client'

import { useCallback, useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SettingsPanel } from '@/components/settings-panel'
import { StatusIndicator } from '@/components/status-indicator'
import { RecordingIndicator } from '@/components/recording-indicator'
import { AccessibilityPermissionDialog } from '@/components/accessibility-permission-dialog'
import { MicrophonePermissionDialog } from '@/components/microphone-permission-dialog'
import { useAppStatus } from '@/hooks/use-app-status'
import { useHotkey, RecordingStopResult } from '@/hooks/use-hotkey'
import { useWhisper } from '@/hooks/use-whisper'
import { useTauri } from '@/hooks/use-tauri'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'
import { Mic, X, Copy, Check, Brain } from 'lucide-react'

export default function Home() {
  const { status, errorMessage, setStatus } = useAppStatus()
  const { isTauri } = useTauri()

  // Whisper integration (PROJ-4)
  const {
    transcribe,
    isTranscribing,
    lastTranscription,
    modelStatus,
    settings: whisperSettings,
  } = useWhisper()

  // State for transcription result display
  const [transcriptionText, setTranscriptionText] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Hotkey integration - sync recording state with app status
  const handleRecordingStart = useCallback(() => {
    setStatus('recording')
    setTranscriptionText(null) // Clear previous transcription
  }, [setStatus])

  const handleRecordingStop = useCallback(async (result: RecordingStopResult) => {
    setStatus('processing')

    // Check if Whisper model is downloaded
    const currentModelStatus = modelStatus.find(s => s.model === whisperSettings.model)

    if (!currentModelStatus?.downloaded) {
      toast.warning('Kein Whisper-Modell', {
        description: 'Bitte laden Sie ein Modell in den Einstellungen herunter.',
      })
      setStatus('idle')
      return
    }

    // Start transcription (PROJ-4)
    if (result.file_path && isTauri) {
      try {
        const transcriptionResult = await transcribe(result.file_path)
        if (transcriptionResult?.text) {
          setTranscriptionText(transcriptionResult.text)
          toast.success('Transkription fertig', {
            description: `${transcriptionResult.text.length} Zeichen in ${(transcriptionResult.processing_time_ms / 1000).toFixed(1)}s`,
          })
        } else {
          toast.info('Keine Sprache erkannt', {
            description: 'Bitte versuche es erneut.',
          })
        }
      } catch (err) {
        console.error('Transcription failed:', err)
        toast.error('Transkription fehlgeschlagen')
      }
    }

    setStatus('idle')
  }, [setStatus, transcribe, modelStatus, whisperSettings.model, isTauri])

  const handleRecordingCancel = useCallback((reason: string) => {
    setStatus('idle')
    console.log('Recording cancelled:', reason)
  }, [setStatus])

  // Copy transcription to clipboard
  const copyToClipboard = useCallback(async () => {
    if (!transcriptionText) return

    try {
      await navigator.clipboard.writeText(transcriptionText)
      setCopied(true)
      toast.success('In Zwischenablage kopiert')
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
      toast.error('Kopieren fehlgeschlagen')
    }
  }, [transcriptionText])

  // Initialize hotkey with event handlers
  const {
    recordingState,
    settings,
    accessibilityPermissionRequired,
    requestAccessibilityPermission,
  } = useHotkey({
    onRecordingStart: handleRecordingStart,
    onRecordingStop: handleRecordingStop,
    onRecordingCancel: handleRecordingCancel,
  })

  // State for accessibility permission dialog
  const [showPermissionDialog, setShowPermissionDialog] = useState(false)

  // Show dialog when permission is required
  useEffect(() => {
    if (accessibilityPermissionRequired) {
      setShowPermissionDialog(true)
    }
  }, [accessibilityPermissionRequired])

  const handleHideWindow = async () => {
    if (isTauri) {
      try {
        await invoke('hide_main_window')
      } catch (err) {
        console.error('Failed to hide window:', err)
      }
    }
  }

  return (
    <div className="min-h-screen bg-background p-8 md:p-12">
      <div className="mx-auto max-w-xl space-y-10">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-light tracking-tight">
              Ever<span className="font-semibold">Voice</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Voice to Text with AI
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusIndicator status={status} errorMessage={errorMessage} />
            {isTauri && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleHideWindow}
                aria-label="Fenster minimieren"
                className="opacity-60 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </header>

        {/* Recording Indicator - shows when recording */}
        {recordingState !== 'idle' && (
          <RecordingIndicator />
        )}

        {/* Main Recording Area */}
        <Card className="overflow-hidden">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-lg font-light">
              <span className="font-medium">Aufnahme</span> starten
            </CardTitle>
            <CardDescription>
              {settings.enabled && isTauri ? (
                <>
                  Nutze <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded font-mono">
                    {settings.shortcut.split('+').map(key =>
                      key === 'CommandOrControl' ? '⌘/Ctrl' :
                      key === 'Shift' ? '⇧' : key
                    ).join(' + ')}
                  </kbd> oder klicke auf den Button
                </>
              ) : (
                'Klicke auf den Button zum Aufnehmen'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-10 pt-6">
            <div className="flex flex-col items-center justify-center space-y-8">
              {/* Recording Button */}
              <button
                onClick={() => {
                  if (status === 'recording') {
                    setStatus('processing')
                    setTimeout(() => setStatus('idle'), 2000)
                  } else {
                    setStatus('recording')
                  }
                }}
                aria-label={status === 'recording' ? 'Aufnahme stoppen' : 'Aufnahme starten'}
                className={`
                  relative h-28 w-28 rounded-full transition-all duration-300
                  flex items-center justify-center
                  ${status === 'recording'
                    ? 'bg-destructive animate-recording-pulse'
                    : status === 'processing'
                    ? 'bg-primary/50 cursor-wait'
                    : 'bg-primary shadow-glow hover:shadow-glow-lg hover:scale-105 active:scale-95'
                  }
                `}
              >
                <Mic
                  className={`
                    h-12 w-12 transition-all duration-200
                    ${status === 'recording'
                      ? 'text-white'
                      : 'text-primary-foreground'
                    }
                  `}
                />

                {/* Pulse rings for recording */}
                {status === 'recording' && (
                  <>
                    <span className="absolute inset-0 rounded-full bg-destructive/30 animate-ping" />
                    <span className="absolute inset-[-8px] rounded-full border-2 border-destructive/50 animate-pulse" />
                  </>
                )}
              </button>

              {/* Status Text */}
              <p className="text-sm text-muted-foreground text-center">
                {status === 'idle' && 'Bereit für Aufnahme'}
                {status === 'recording' && (
                  <span className="text-destructive font-medium">
                    Aufnahme läuft... Klicke zum Stoppen
                  </span>
                )}
                {status === 'processing' && (
                  <span className="text-primary">Wird verarbeitet...</span>
                )}
                {status === 'error' && (
                  <span className="text-destructive">Ein Fehler ist aufgetreten</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Transcription Result (PROJ-4) */}
        {(transcriptionText || isTranscribing) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-lg font-light">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Transkription</span>
                </div>
                {transcriptionText && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyToClipboard}
                    className="h-8 gap-1.5"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-green-500" />
                        <span className="text-xs">Kopiert</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span className="text-xs">Kopieren</span>
                      </>
                    )}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isTranscribing ? (
                <div className="flex items-center gap-3 py-4">
                  <div className="h-4 w-4 rounded-full bg-purple-500 animate-pulse" />
                  <span className="text-sm text-muted-foreground">
                    Wird mit Whisper transkribiert...
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {transcriptionText}
                  </p>
                  {lastTranscription && (
                    <p className="text-xs text-muted-foreground">
                      Sprache: {lastTranscription.language} · {lastTranscription.segments.length} Segment(e) · {(lastTranscription.processing_time_ms / 1000).toFixed(1)}s
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Settings */}
        <SettingsPanel />

        {/* Footer */}
        <footer className="text-center">
          <p className="text-xs text-muted-foreground/60">
            {isTauri
              ? 'Desktop-App v1.0.0 · Läuft im Hintergrund via System Tray'
              : 'Web-Version · Für alle Features Desktop-App verwenden'
            }
          </p>
        </footer>
      </div>

      {/* Accessibility Permission Dialog (macOS) */}
      <AccessibilityPermissionDialog
        open={showPermissionDialog}
        onOpenChange={setShowPermissionDialog}
        onRequestPermission={requestAccessibilityPermission}
      />

      {/* Microphone Permission Dialog (PROJ-3) */}
      <MicrophonePermissionDialog />
    </div>
  )
}
