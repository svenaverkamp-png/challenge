'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { Mic, Loader2, CheckCircle2, XCircle, Brain, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTauri } from '@/hooks/use-tauri'

/** Maximum recording time in milliseconds (6 minutes) */
const MAX_RECORDING_TIME = 6 * 60 * 1000

/** Warning time (30 seconds before max) */
const WARNING_TIME = 5.5 * 60 * 1000

/** Overlay status states */
type OverlayStatus = 'idle' | 'recording' | 'processing' | 'transcribing' | 'improving' | 'done' | 'error' | 'cancelled'

/** Event payloads */
interface AudioLevelPayload {
  level: number
}

interface RecordingStartedPayload {
  timestamp: number
}

interface ErrorPayload {
  message: string
}

/**
 * Floating Recording Overlay Component
 *
 * Displays recording status, audio level, and timer in a compact overlay window.
 * Uses Tauri events for communication with the main app.
 */
export function RecordingOverlay() {
  const { isTauri } = useTauri()
  const [status, setStatus] = useState<OverlayStatus>('idle')
  const [audioLevel, setAudioLevel] = useState(0)
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null)
  const [duration, setDuration] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  // Calculate if we should show warning (30 seconds before max)
  const showWarning = duration >= WARNING_TIME

  // Format duration as M:SS
  const formatDuration = useCallback((ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }, [])

  // Update duration while recording
  useEffect(() => {
    if (status !== 'recording' || !recordingStartTime) {
      return
    }

    const interval = setInterval(() => {
      setDuration(Date.now() - recordingStartTime)
    }, 100)

    return () => clearInterval(interval)
  }, [status, recordingStartTime])

  // Listen for Tauri events
  useEffect(() => {
    if (!isTauri) return

    const unlisteners: UnlistenFn[] = []

    const setupListeners = async () => {
      // Recording started
      const unlistenStarted = await listen<RecordingStartedPayload>('overlay-recording-started', (event) => {
        setStatus('recording')
        setRecordingStartTime(event.payload?.timestamp || Date.now())
        setDuration(0)
        setErrorMessage(null)
        setIsVisible(true)
      })
      unlisteners.push(unlistenStarted)

      // Fallback: listen to regular recording-started event
      const unlistenStartedFallback = await listen('recording-started', () => {
        setStatus('recording')
        setRecordingStartTime(Date.now())
        setDuration(0)
        setErrorMessage(null)
        setIsVisible(true)
      })
      unlisteners.push(unlistenStartedFallback)

      // Audio level update
      const unlistenLevel = await listen<AudioLevelPayload>('overlay-audio-level', (event) => {
        setAudioLevel(event.payload?.level || 0)
      })
      unlisteners.push(unlistenLevel)

      // Recording stopped - start processing
      const unlistenStopped = await listen('overlay-recording-stopped', () => {
        setStatus('processing')
        setAudioLevel(0)
      })
      unlisteners.push(unlistenStopped)

      // Fallback: listen to regular recording-complete event
      const unlistenComplete = await listen('recording-complete', () => {
        setStatus('processing')
        setAudioLevel(0)
      })
      unlisteners.push(unlistenComplete)

      // Transcription started
      const unlistenTranscribing = await listen('overlay-transcribing', () => {
        setStatus('transcribing')
      })
      unlisteners.push(unlistenTranscribing)

      // Fallback: listen to whisper-transcription-start
      const unlistenTranscribingFallback = await listen('whisper-transcription-start', () => {
        setStatus('transcribing')
      })
      unlisteners.push(unlistenTranscribingFallback)

      // PROJ-7: AI improving (Ollama)
      const unlistenImproving = await listen('overlay-improving', () => {
        setStatus('improving')
      })
      unlisteners.push(unlistenImproving)

      // Fallback: listen to ollama-processing-started
      const unlistenImprovingFallback = await listen('ollama-processing-started', () => {
        setStatus('improving')
      })
      unlisteners.push(unlistenImprovingFallback)

      // Processing/transcription done
      const unlistenDone = await listen('overlay-done', () => {
        setStatus('done')
        // Hide after 1.5 seconds
        setTimeout(() => {
          setIsVisible(false)
          // Reset after fade out
          setTimeout(() => {
            setStatus('idle')
            setDuration(0)
            setRecordingStartTime(null)
          }, 300)
        }, 1500)
      })
      unlisteners.push(unlistenDone)

      // Fallback: listen to whisper-transcription-complete
      const unlistenDoneFallback = await listen('whisper-transcription-complete', () => {
        setStatus('done')
        setTimeout(() => {
          setIsVisible(false)
          setTimeout(() => {
            setStatus('idle')
            setDuration(0)
            setRecordingStartTime(null)
          }, 300)
        }, 1500)
      })
      unlisteners.push(unlistenDoneFallback)

      // Error
      const unlistenError = await listen<ErrorPayload>('overlay-error', (event) => {
        setStatus('error')
        setErrorMessage(event.payload?.message || 'Ein Fehler ist aufgetreten')
        setAudioLevel(0)
        // Hide after 3 seconds
        setTimeout(() => {
          setIsVisible(false)
          setTimeout(() => {
            setStatus('idle')
            setErrorMessage(null)
          }, 300)
        }, 3000)
      })
      unlisteners.push(unlistenError)

      // Cancelled
      const unlistenCancelled = await listen('overlay-cancelled', () => {
        setStatus('cancelled')
        setAudioLevel(0)
        // Hide after 1 second
        setTimeout(() => {
          setIsVisible(false)
          setTimeout(() => {
            setStatus('idle')
            setDuration(0)
            setRecordingStartTime(null)
          }, 300)
        }, 1000)
      })
      unlisteners.push(unlistenCancelled)

      // Hide overlay
      const unlistenHide = await listen('overlay-hide', () => {
        setIsVisible(false)
        setTimeout(() => {
          setStatus('idle')
          setDuration(0)
          setRecordingStartTime(null)
          setErrorMessage(null)
          setAudioLevel(0)
        }, 300)
      })
      unlisteners.push(unlistenHide)
    }

    setupListeners()

    return () => {
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [isTauri])

  // Don't render anything if not visible
  if (!isTauri) {
    return (
      <div className="flex h-screen items-center justify-center bg-black/85 rounded-xl">
        <p className="text-white/50 text-sm">Overlay Preview</p>
      </div>
    )
  }

  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="flex h-screen w-screen items-center justify-center"
        >
          <div
            className={cn(
              'flex items-center gap-3 rounded-xl px-4 py-3',
              'bg-black/85 backdrop-blur-sm shadow-2xl',
              'border border-white/10'
            )}
            style={{ minWidth: 200 }}
          >
            {/* Status Indicator */}
            <StatusIndicator status={status} />

            {/* Main Content */}
            <div className="flex flex-col gap-1 flex-1">
              {/* Status Text */}
              <StatusText status={status} errorMessage={errorMessage} />

              {/* Audio Level (only during recording) */}
              {status === 'recording' && (
                <AudioLevelMeter level={audioLevel} />
              )}
            </div>

            {/* Timer (only during recording) */}
            {status === 'recording' && (
              <Timer duration={duration} showWarning={showWarning} formatDuration={formatDuration} />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Status Indicator - Shows visual icon for current state
 */
function StatusIndicator({ status }: { status: OverlayStatus }) {
  switch (status) {
    case 'recording':
      return (
        <motion.div
          className="relative flex items-center justify-center"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
        >
          {/* Pulsing ring */}
          <motion.div
            className="absolute h-6 w-6 rounded-full bg-red-500/30"
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Solid dot */}
          <div className="h-3 w-3 rounded-full bg-red-500" />
        </motion.div>
      )

    case 'processing':
      return (
        <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
      )

    case 'transcribing':
      return (
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          <Brain className="h-5 w-5 text-purple-400" />
        </motion.div>
      )

    case 'improving':
      return (
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        >
          <Sparkles className="h-5 w-5 text-amber-400" />
        </motion.div>
      )

    case 'done':
      return (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        >
          <CheckCircle2 className="h-5 w-5 text-green-400" />
        </motion.div>
      )

    case 'error':
      return (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        >
          <XCircle className="h-5 w-5 text-red-400" />
        </motion.div>
      )

    case 'cancelled':
      return (
        <XCircle className="h-5 w-5 text-gray-400" />
      )

    default:
      return (
        <Mic className="h-5 w-5 text-white/50" />
      )
  }
}

/**
 * Status Text - Shows current state description
 */
function StatusText({ status, errorMessage }: { status: OverlayStatus; errorMessage: string | null }) {
  const getText = () => {
    switch (status) {
      case 'recording':
        return 'Aufnahme...'
      case 'processing':
        return 'Verarbeite...'
      case 'transcribing':
        return 'Transkribiere...'
      case 'improving':
        return 'Verbessern...'
      case 'done':
        return 'Fertig!'
      case 'error':
        return errorMessage || 'Fehler'
      case 'cancelled':
        return 'Abgebrochen'
      default:
        return 'Bereit'
    }
  }

  const getColor = () => {
    switch (status) {
      case 'recording':
        return 'text-white'
      case 'processing':
        return 'text-blue-300'
      case 'transcribing':
        return 'text-purple-300'
      case 'improving':
        return 'text-amber-300'
      case 'done':
        return 'text-green-300'
      case 'error':
        return 'text-red-300'
      case 'cancelled':
        return 'text-gray-400'
      default:
        return 'text-white/70'
    }
  }

  return (
    <motion.span
      key={status}
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('text-sm font-medium', getColor())}
    >
      {getText()}
    </motion.span>
  )
}

/**
 * Audio Level Meter - Visualizes microphone input level
 */
function AudioLevelMeter({ level }: { level: number }) {
  // Create 10 bars
  const bars = 10

  return (
    <div className="flex items-center gap-0.5 h-2">
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = (i + 1) * (100 / bars)
        const isActive = level >= threshold - (100 / bars / 2)

        // Color coding: green -> yellow -> red
        const getBarColor = () => {
          if (!isActive) return 'bg-white/20'
          if (i < 6) return 'bg-green-400'
          if (i < 8) return 'bg-yellow-400'
          return 'bg-red-400'
        }

        return (
          <motion.div
            key={i}
            className={cn('w-1.5 rounded-sm transition-colors', getBarColor())}
            initial={{ height: 4 }}
            animate={{
              height: isActive ? 8 + (i * 0.5) : 4,
              opacity: isActive ? 1 : 0.5
            }}
            transition={{ duration: 0.05 }}
          />
        )
      })}
    </div>
  )
}

/**
 * Timer - Shows recording duration with warning state
 */
function Timer({
  duration,
  showWarning,
  formatDuration
}: {
  duration: number
  showWarning: boolean
  formatDuration: (ms: number) => string
}) {
  return (
    <motion.span
      className={cn(
        'font-mono text-lg tabular-nums font-semibold',
        showWarning ? 'text-orange-400' : 'text-white'
      )}
      animate={showWarning ? { scale: [1, 1.05, 1] } : {}}
      transition={showWarning ? { duration: 0.5, repeat: Infinity } : {}}
    >
      {formatDuration(duration)}
    </motion.span>
  )
}

