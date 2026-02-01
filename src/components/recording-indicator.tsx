'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useHotkey } from '@/hooks/use-hotkey'
import { useTauri } from '@/hooks/use-tauri'
import { Mic, Loader2 } from 'lucide-react'
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
  const [showWarning, setShowWarning] = useState(false)

  // Check if we should show warning
  useEffect(() => {
    if (recordingState === 'recording' && recordingDuration >= WARNING_TIME) {
      setShowWarning(true)
    } else {
      setShowWarning(false)
    }
  }, [recordingState, recordingDuration])

  // Don't show if not in Tauri or idle
  if (!isTauri || recordingState === 'idle') {
    return null
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
        variant={recordingState === 'recording' ? 'default' : 'secondary'}
        className={cn(
          'gap-1.5 transition-colors',
          recordingState === 'recording' && 'bg-red-500 hover:bg-red-600',
          showWarning && 'animate-pulse bg-yellow-500 hover:bg-yellow-600',
          className
        )}
      >
        {recordingState === 'recording' ? (
          <>
            <Mic className="h-3 w-3" />
            <span className="font-mono text-xs">{formatDuration(recordingDuration)}</span>
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
        recordingState === 'recording' && 'border-red-500/50 bg-red-500/10',
        recordingState === 'processing' && 'border-blue-500/50 bg-blue-500/10',
        showWarning && 'border-yellow-500/50 bg-yellow-500/10',
        className
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {recordingState === 'recording' ? (
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
          ) : (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span className="text-sm font-medium">Verarbeitung...</span>
            </>
          )}
        </div>
        {recordingState === 'recording' && (
          <span className="font-mono text-lg tabular-nums">
            {formatDuration(recordingDuration)}
          </span>
        )}
      </div>

      {recordingState === 'recording' && (
        <>
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
        </>
      )}
    </div>
  )
}
