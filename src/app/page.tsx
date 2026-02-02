'use client'

import { useCallback, useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusIndicator } from '@/components/status-indicator'
import { AccessibilityPermissionDialog } from '@/components/accessibility-permission-dialog'
import { MicrophonePermissionDialog } from '@/components/microphone-permission-dialog'
import { useAppStatus } from '@/hooks/use-app-status'
import { useHotkey, RecordingStopResult, AppContext } from '@/hooks/use-hotkey'
import { useWhisper } from '@/hooks/use-whisper'
import { useTextInsert } from '@/hooks/use-text-insert'
import { useOllama } from '@/hooks/use-ollama'
import { useTauri } from '@/hooks/use-tauri'
import { invoke } from '@tauri-apps/api/core'
import { Mic, X, Copy, Check, Brain, Settings } from 'lucide-react'
import { showSuccess, showWarning, showInfo, showErrorByCode } from '@/lib/app-error'
import Link from 'next/link'

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

  // Text insert integration (PROJ-6)
  const {
    insertText,
    settings: textInsertSettings,
  } = useTextInsert()

  // Ollama integration (PROJ-7)
  const {
    improveText,
    settings: ollamaSettings,
  } = useOllama()

  // State for transcription result display
  const [transcriptionText, setTranscriptionText] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Hotkey integration - sync recording state with app status
  const handleRecordingStart = useCallback(() => {
    setStatus('recording')
    setTranscriptionText(null) // Clear previous transcription
  }, [setStatus])

  // PROJ-8/PROJ-9: Accept AppContext for context-aware text processing
  const handleRecordingStop = useCallback(async (result: RecordingStopResult, context?: AppContext) => {
    setStatus('processing')

    // Check if Whisper model is downloaded
    const currentModelStatus = modelStatus.find(s => s.model === whisperSettings.model)

    if (!currentModelStatus?.downloaded) {
      showWarning('Kein Whisper-Modell', 'Bitte laden Sie ein Modell in den Einstellungen herunter.')
      setStatus('idle')
      return
    }

    // PROJ-9: Detect if we're in an email context
    const isEmailContext = context?.category === 'email'
    // PROJ-10: Detect if we're in a chat context
    const isChatContext = context?.category === 'chat'

    // Start transcription (PROJ-4)
    if (result.file_path && isTauri) {
      try {
        const transcriptionResult = await transcribe(result.file_path)
        if (transcriptionResult?.text) {
          let finalText = transcriptionResult.text
          let totalProcessingTime = transcriptionResult.processing_time_ms

          // PROJ-7: Improve text with Ollama (Auto-Edit)
          // PROJ-9: Pass email context for email-specific formatting
          if (ollamaSettings.enabled) {
            try {
              const improveResult = await improveText(
                transcriptionResult.text,
                transcriptionResult.language,
                isEmailContext, // PROJ-9: Pass email context flag
                isChatContext   // PROJ-10: Pass chat context flag
              )
              if (improveResult?.was_edited && improveResult.edited_text) {
                finalText = improveResult.edited_text
                totalProcessingTime += improveResult.processing_time_ms
              } else if (improveResult?.error) {
                // Ollama failed - use original text, show warning
                console.warn('Ollama auto-edit failed:', improveResult.error)
                showWarning('AI-Bearbeitung fehlgeschlagen', 'Rohtext wird verwendet.')
              }
            } catch (ollamaErr) {
              console.warn('Ollama error:', ollamaErr)
              // Continue with original text
            }
          }

          setTranscriptionText(finalText)

          // PROJ-6: Automatically insert text into active text field
          // PROJ-6 FIX: Pass the original app's bundle_id to focus it before inserting
          // This ensures the text goes to the app where the user was when they pressed the hotkey
          if (textInsertSettings.enabled) {
            const insertResult = await insertText(finalText, context?.bundle_id)
            if (insertResult?.success) {
              showSuccess('Text eingefuegt', `${finalText.length} Zeichen in ${(totalProcessingTime / 1000).toFixed(1)}s`)
            } else if (insertResult?.in_clipboard) {
              // Fallback to clipboard - toast already shown by hook
            } else {
              // Show transcription success even if insert failed
              showSuccess('Transkription fertig', `${finalText.length} Zeichen in ${(totalProcessingTime / 1000).toFixed(1)}s`)
            }
          } else {
            // Text insert disabled - just show transcription success
            showSuccess('Transkription fertig', `${finalText.length} Zeichen in ${(totalProcessingTime / 1000).toFixed(1)}s`)
          }

          // PROJ-18: Archive transcription to Markdown file (async, non-blocking)
          // BUG-3 Fix: Copy to clipboard as fallback on archive error
          try {
            const archiveData = {
              date: new Date().toISOString(),
              app_name: context?.app_name || 'Desktop',
              category: context?.category || 'other',
              duration_seconds: Math.round(result.duration_ms / 1000),
              word_count: finalText.split(/\s+/).filter(Boolean).length,
              language: transcriptionResult.language || 'de',
              was_edited: ollamaSettings.enabled && finalText !== transcriptionResult.text,
              edited_text: finalText,
              original_text: transcriptionResult.text,
            }
            invoke<{ success: boolean; error?: string }>('archive_transcription', { data: archiveData })
              .then((archiveResult) => {
                if (!archiveResult.success && archiveResult.error) {
                  // BUG-3 Fix: Archive failed, ensure text is in clipboard as fallback
                  console.warn('Archive failed, copying to clipboard as fallback:', archiveResult.error)
                  navigator.clipboard.writeText(finalText).catch(() => {
                    // Clipboard also failed - text should already be in clipboard from text insert
                  })
                  showWarning('Archivierung fehlgeschlagen', 'Text wurde in Zwischenablage kopiert.')
                }
              })
              .catch((archiveErr) => {
                // BUG-3 Fix: Archive failed, ensure text is in clipboard
                console.warn('Archive failed (non-blocking):', archiveErr)
                navigator.clipboard.writeText(finalText).catch(() => {})
              })
          } catch (archiveErr) {
            // Archive errors are non-blocking - just log
            console.warn('Archive error:', archiveErr)
          }
        } else {
          showInfo('Keine Sprache erkannt', 'Bitte versuche es erneut.')
        }
      } catch (err) {
        console.error('Transcription failed:', err)
        showErrorByCode('ERR_TRANSCRIPTION_FAILED', 'page')
      }
    }

    setStatus('idle')
  }, [setStatus, transcribe, improveText, ollamaSettings.enabled, insertText, textInsertSettings.enabled, modelStatus, whisperSettings.model, isTauri])

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
      showSuccess('In Zwischenablage kopiert')
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
      showErrorByCode('ERR_CLIPBOARD', 'page')
    }
  }, [transcriptionText])

  // Initialize hotkey with event handlers
  const {
    recordingState,
    recordingDuration,
    settings,
    accessibilityPermissionRequired,
    requestAccessibilityPermission,
    error: hotkeyError, // BUG-9 FIX: Capture hotkey errors for display
    toggleRecording, // For button click
  } = useHotkey({
    onRecordingStart: handleRecordingStart,
    onRecordingStop: handleRecordingStop,
    onRecordingCancel: handleRecordingCancel,
  })

  // BUG-9 FIX: Show hotkey errors (e.g., "Recording too short")
  useEffect(() => {
    if (hotkeyError) {
      showWarning(hotkeyError)
    }
  }, [hotkeyError])

  // Format duration as M:SS
  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // Filter internal markers from transcription text for display
  const filterInternalMarkers = (text: string): string => {
    return text.replace(/<<<USER_TEXT>>>/g, '').trim()
  }

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
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="opacity-60 hover:opacity-100"
            >
              <Link href="/settings" aria-label="Einstellungen">
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
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
                  </kbd> zum Aufnehmen
                </>
              ) : (
                'Hotkey zum Aufnehmen verwenden'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-10 pt-6">
            <div className="flex flex-col items-center justify-center space-y-4">
              {/* Timer - shows above button during recording */}
              {recordingState === 'recording' && (
                <div className="text-2xl font-mono font-semibold text-destructive tabular-nums">
                  {formatDuration(recordingDuration)}
                </div>
              )}

              {/* Recording Button - Click or use Hotkey to toggle */}
              <button
                type="button"
                onClick={isTauri ? toggleRecording : undefined}
                disabled={!isTauri || status === 'processing' || recordingState === 'processing'}
                aria-label={recordingState === 'recording' ? 'Aufnahme stoppen' : 'Aufnahme starten'}
                title={recordingState === 'recording'
                  ? 'Klicken zum Stoppen'
                  : isTauri
                  ? 'Klicken oder Hotkey zum Aufnehmen'
                  : 'Nur in Desktop-App verfügbar'}
                className={`
                  relative h-28 w-28 rounded-full transition-all duration-300
                  flex items-center justify-center cursor-pointer
                  disabled:cursor-not-allowed disabled:opacity-50
                  focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background
                  ${recordingState === 'recording'
                    ? 'bg-destructive animate-recording-pulse hover:bg-destructive/90'
                    : status === 'processing' || recordingState === 'processing'
                    ? 'bg-primary/50'
                    : 'bg-primary shadow-glow hover:bg-primary/90'
                  }
                `}
              >
                <Mic
                  className={`
                    h-12 w-12 transition-all duration-200
                    ${recordingState === 'recording'
                      ? 'text-white'
                      : 'text-primary-foreground'
                    }
                  `}
                />

                {/* Pulse rings for recording */}
                {recordingState === 'recording' && (
                  <>
                    <span className="absolute inset-0 rounded-full bg-destructive/30 animate-ping" />
                    <span className="absolute inset-[-8px] rounded-full border-2 border-destructive/50 animate-pulse" />
                  </>
                )}
              </button>

              {/* Status Text */}
              <p className="text-sm text-muted-foreground text-center">
                {recordingState === 'idle' && status === 'idle' && (
                  isTauri
                    ? 'Klicken oder Hotkey drücken zum Aufnehmen'
                    : 'Nur in Desktop-App verfügbar'
                )}
                {recordingState === 'recording' && (
                  <span className="text-destructive font-medium">
                    Aufnahme läuft... Klicken oder Hotkey zum Stoppen
                  </span>
                )}
                {(status === 'processing' || recordingState === 'processing') && (
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
                    {transcriptionText && filterInternalMarkers(transcriptionText)}
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

