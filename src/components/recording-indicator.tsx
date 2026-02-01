'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useHotkey } from '@/hooks/use-hotkey'
import { useAudioRecording } from '@/hooks/use-audio-recording'
import { useTauri } from '@/hooks/use-tauri'
import { useWhisper } from '@/hooks/use-whisper'
import { Mic, Loader2, Volume2, Brain, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Maximum recording time in milliseconds (6 minutes) */
const MAX_RECORDING_TIME = 6 * 60 * 1000

/** Warning time (30 seconds before max) */
const WARNING_TIME = 5.5 * 60 * 1000

interface RecordingIndicatorProps {
  /** Show compact version */
  compact?: boolean
  /** Additional class names */
  className?: string
}

/**
 * Visual indicator for recording state
 * Shows current status, duration, and progress
 */
export function RecordingIndicator({ compact = false, className }: RecordingIndicatorProps) {
  const { isTauri } = useTauri()
  const { recordingState, recordingDuration, settings } = useHotkey()
  const { audioLevel } = useAudioRecording()
  const { isTranscribing, lastTranscription } = useWhisper()
  const [showWarning, setShowWarning] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  // Show success briefly after transcription completes
  useEffect(() => {
    if (lastTranscription && !isTranscribing) {
      setShowSuccess(true)
      const timer = setTimeout(() => setShowSuccess(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [lastTranscription, isTranscribing])

  // Check if we should show warning
  useEffect(() => {
    if (recordingState === 'recording' && recordingDuration >= WARNING_TIME) {
      setShowWarning(true)
    } else {
      setShowWarning(false)
    }
  }, [recordingState, recordingDuration])

  // Determine effective state (include transcription state)
  const effectiveState = isTranscribing ? 'transcribing' : recordingState

  // Don't show if not in Tauri or idle (unless showing success)
  if (!isTauri || (effectiveState === 'idle' && !showSuccess)) {
    return null
  }

  // Show success state briefly
  if (showSuccess && effectiveState === 'idle') {
    return (
      <Badge
        variant="default"
        className={cn(
          'gap-1.5 bg-green-500 hover:bg-green-600',
          className
        )}
      >
        <CheckCircle2 className="h-3 w-3" />
        <span className="text-xs">Transkription fertig!</span>
      </Badge>
    )
  }

  // Format duration as MM:SS
  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // Calculate progress percentage
  const progressPercent = Math.min((recordingDuration / MAX_RECORDING_TIME) * 100, 100)

  if (compact) {
    return (
      <Badge
        variant={effectiveState === 'recording' ? 'default' : 'secondary'}
        className={cn(
          'gap-1.5 transition-colors',
          effectiveState === 'recording' && 'bg-red-500 hover:bg-red-600',
          effectiveState === 'transcribing' && 'bg-purple-500 hover:bg-purple-600',
          showWarning && 'animate-pulse bg-yellow-500 hover:bg-yellow-600',
          className
        )}
      >
        {effectiveState === 'recording' ? (
          <>
            <Mic className="h-3 w-3" />
            <span className="font-mono text-xs">{formatDuration(recordingDuration)}</span>
            {/* Mini level indicator */}
            <div className="flex items-center gap-0.5 ml-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={cn(
                    'w-0.5 rounded-full transition-all',
                    audioLevel > i * 33 ? 'bg-white' : 'bg-white/30',
                    i === 0 && 'h-1',
                    i === 1 && 'h-1.5',
                    i === 2 && 'h-2'
                  )}
                />
              ))}
            </div>
          </>
        ) : effectiveState === 'transcribing' ? (
          <>
            <Brain className="h-3 w-3 animate-pulse" />
            <span className="text-xs">Transkribiere...</span>
          </>
        ) : (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-xs">Verarbeitung...</span>
          </>
        )}
      </Badge>
    )
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-colors',
        effectiveState === 'recording' && 'border-red-500/50 bg-red-500/10',
        effectiveState === 'processing' && 'border-blue-500/50 bg-blue-500/10',
        effectiveState === 'transcribing' && 'border-purple-500/50 bg-purple-500/10',
        showWarning && 'border-yellow-500/50 bg-yellow-500/10',
        className
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {effectiveState === 'recording' ? (
            <>
              <div
                className={cn(
                  'h-3 w-3 rounded-full bg-red-500',
                  !showWarning && 'animate-pulse'
                )}
              />
              <span className="text-sm font-medium">
                Aufnahme aktiv
              </span>
            </>
          ) : effectiveState === 'transcribing' ? (
            <>
              <Brain className="h-4 w-4 animate-pulse text-purple-500" />
              <span className="text-sm font-medium">Transkribiere mit Whisper...</span>
            </>
          ) : (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span className="text-sm font-medium">Verarbeitung...</span>
            </>
          )}
        </div>
        {effectiveState === 'recording' && (
          <span className="font-mono text-lg tabular-nums">
            {formatDuration(recordingDuration)}
          </span>
        )}
      </div>

      {effectiveState === 'recording' && (
        <>
          {/* Audio Level Indicator */}
          <div className="flex items-center gap-2 mb-3">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1 flex items-center gap-1">
              {/* Level bars visualization */}
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex-1 h-4 rounded-sm transition-all',
                    audioLevel > i * 5
                      ? i < 12
                        ? 'bg-green-500'
                        : i < 16
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                      : 'bg-muted/30'
                  )}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground w-8 text-right">
              {audioLevel}%
            </span>
          </div>

          {/* Time Progress */}
          <Progress
            value={progressPercent}
            className={cn(
              'h-1.5',
              showWarning && '[&>div]:bg-yellow-500'
            )}
          />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>
              {settings.mode === 'PushToTalk'
                ? 'Loslassen zum Beenden'
                : 'Hotkey oder Esc zum Beenden'}
            </span>
            <span>Max: 6:00</span>
          </div>
          {showWarning && (
            <p className="mt-2 text-xs text-yellow-600 font-medium">
              Noch 30 Sekunden verbleibend
            </p>
          )}
          {/* Low audio warning */}
          {audioLevel < 5 && recordingDuration > 3000 && (
            <p className="mt-2 text-xs text-yellow-600 font-medium">
              Mikrofon-Eingabe sehr leise. Bitte näher sprechen.
            </p>
          )}
        </>
      )}

      {/* Transcription status */}
      {effectiveState === 'transcribing' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-purple-500/20 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full animate-pulse w-full" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Audio wird lokal mit Whisper transkribiert...
          </p>
        </div>
      )}
    </div>
  )
}
