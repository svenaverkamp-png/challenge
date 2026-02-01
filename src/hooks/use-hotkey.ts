'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { useTauri } from './use-tauri'
import { showErrorByCode, showWarning, showInfo } from '@/lib/app-error'

/** Hotkey mode: Push-to-Talk or Toggle */
export type HotkeyMode = 'PushToTalk' | 'Toggle'

/** Hotkey settings stored in config */
export interface HotkeySettings {
  shortcut: string
  mode: HotkeyMode
  enabled: boolean
}

/** Recording state for the hotkey system */
export type RecordingState = 'idle' | 'recording' | 'processing'

/** Recording result with file path */
export interface RecordingStopResult {
  file_path: string
  duration_ms: number
  privacy_mode: boolean
}

/** App category for context-aware processing (PROJ-8) */
export type AppCategory = 'email' | 'chat' | 'social' | 'code' | 'docs' | 'browser' | 'notes' | 'terminal' | 'remote_desktop' | 'other'

/** Application context detected at recording start (PROJ-8) */
export interface AppContext {
  app_name: string
  bundle_id?: string
  process_name?: string
  window_title: string
  category: AppCategory
}

/** Events emitted by the hotkey system */
export interface HotkeyEvents {
  /** Called when recording starts. Receives AppContext if detected (PROJ-8/PROJ-9) */
  onRecordingStart?: (context?: AppContext) => void
  /** Called when recording stops. Receives result and AppContext for context-aware processing */
  onRecordingStop?: (result: RecordingStopResult, context?: AppContext) => void
  onRecordingCancel?: (reason: string) => void
}

interface UseHotkeyReturn {
  /** Current hotkey settings */
  settings: HotkeySettings
  /** Whether settings are loading */
  isLoading: boolean
  /** Current recording state */
  recordingState: RecordingState
  /** Whether currently recording */
  isRecording: boolean
  /** Error message if any */
  error: string | null
  /** Whether macOS accessibility permission is required */
  accessibilityPermissionRequired: boolean
  /** Update hotkey settings */
  updateSettings: (settings: Partial<HotkeySettings>) => Promise<void>
  /** Check if a shortcut is available */
  checkShortcutAvailable: (shortcut: string) => Promise<boolean>
  /** Request accessibility permission (macOS only) */
  requestAccessibilityPermission: () => Promise<void>
  /** Recording start time (for duration display) */
  recordingStartTime: number | null
  /** Time elapsed since recording started (in ms) */
  recordingDuration: number
  /** Current app context detected at recording start (PROJ-8/PROJ-9) */
  currentContext: AppContext | null
}

/** Default hotkey settings */
const DEFAULT_SETTINGS: HotkeySettings = {
  shortcut: 'CommandOrControl+Shift+Space',
  mode: 'PushToTalk',
  enabled: true,
}

/** Default max recording time in minutes */
const DEFAULT_MAX_DURATION_MINUTES = 6

/** Warning offset before max (30 seconds) */
const WARNING_OFFSET_MS = 30 * 1000

/** Debounce time for toggle mode (200ms) */
const TOGGLE_DEBOUNCE_MS = 200

/**
 * Hook to manage global hotkey for voice recording
 */
export function useHotkey(events?: HotkeyEvents): UseHotkeyReturn {
  const { isTauri } = useTauri()
  const [settings, setSettings] = useState<HotkeySettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [accessibilityPermissionRequired, setAccessibilityPermissionRequired] = useState(false)
  const [maxDurationMinutes, setMaxDurationMinutes] = useState(DEFAULT_MAX_DURATION_MINUTES)
  // PROJ-8/PROJ-9: Store detected app context at recording start
  const [currentContext, setCurrentContext] = useState<AppContext | null>(null)

  // Refs for debouncing and timeout
  const lastToggleRef = useRef<number>(0)
  const maxTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const healthCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // PROJ-8/PROJ-9: Ref to access current context in callbacks
  const currentContextRef = useRef<AppContext | null>(null)

  // Load settings on mount
  useEffect(() => {
    if (!isTauri) {
      setIsLoading(false)
      return
    }

    const loadSettings = async () => {
      try {
        const loaded = await invoke<HotkeySettings>('get_hotkey_settings')
        setSettings(loaded)

        // Load audio settings for max duration (BUG-1 fix)
        const audioSettings = await invoke<{ max_duration_minutes: number }>('get_audio_settings')
        setMaxDurationMinutes(audioSettings.max_duration_minutes || DEFAULT_MAX_DURATION_MINUTES)
      } catch (err) {
        console.error('Failed to load hotkey settings:', err)
        setError('Hotkey-Einstellungen konnten nicht geladen werden')
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
  }, [isTauri])

  // Start recording handler
  // PROJ-8/PROJ-9: Accepts optional AppContext detected at hotkey press
  const startRecording = useCallback(async (context?: AppContext) => {
    const now = Date.now()

    // Debounce for toggle mode
    if (settings.mode === 'Toggle') {
      if (now - lastToggleRef.current < TOGGLE_DEBOUNCE_MS) {
        return
      }
      lastToggleRef.current = now
    }

    setRecordingState('recording')
    setRecordingStartTime(now)
    setRecordingDuration(0)
    setError(null)
    // PROJ-8/PROJ-9: Store context for later use in text processing
    setCurrentContext(context || null)
    currentContextRef.current = context || null

    // Sync state with backend (BUG-3 fix)
    if (isTauri) {
      try {
        await invoke('set_recording_state', { recording: true })
        // Start audio recording (PROJ-3)
        await invoke('start_audio_recording')
      } catch (err) {
        console.error('Failed to start recording:', err)
        setError('Aufnahme konnte nicht gestartet werden')
        setRecordingState('idle')
        return
      }
    }

    // Start duration tracking
    durationIntervalRef.current = setInterval(() => {
      setRecordingDuration(Date.now() - now)
    }, 100)

    // Start health check polling (BUG-2 fix: Device disconnect handling)
    if (isTauri) {
      healthCheckIntervalRef.current = setInterval(async () => {
        try {
          const streamError = await invoke<string | null>('check_audio_health')
          if (streamError) {
            // Device disconnected or stream error
            showErrorByCode('ERR_MIC_DISCONNECTED', 'hotkey', {
              details: 'Die Aufnahme wurde abgebrochen, da das Mikrofon getrennt wurde.',
            })
            cancelRecording('Mikrofon getrennt')
          }
        } catch (err) {
          console.error('Health check failed:', err)
        }
      }, 500) // Check every 500ms
    }

    // Calculate timeouts based on user settings (BUG-1 fix)
    const maxRecordingTimeMs = maxDurationMinutes * 60 * 1000
    const warningTimeMs = maxRecordingTimeMs - WARNING_OFFSET_MS

    // Set warning timeout (30 seconds before max)
    warningTimeoutRef.current = setTimeout(() => {
      showWarning('Noch 30 Sekunden', 'Maximale Aufnahmezeit wird bald erreicht')
    }, warningTimeMs)

    // Set max timeout (user-configured duration)
    maxTimeoutRef.current = setTimeout(() => {
      showInfo('Maximale Aufnahmezeit erreicht', 'Aufnahme wird automatisch beendet')
      stopRecording()
    }, maxRecordingTimeMs)

    // PROJ-8/PROJ-9: Pass context to callback
    events?.onRecordingStart?.(context)
  }, [settings.mode, events, isTauri, maxDurationMinutes])

  // Stop recording handler
  const stopRecording = useCallback(async () => {
    // Clear timeouts
    if (maxTimeoutRef.current) {
      clearTimeout(maxTimeoutRef.current)
      maxTimeoutRef.current = null
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current)
      warningTimeoutRef.current = null
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
    // Clear health check interval (BUG-2 fix)
    if (healthCheckIntervalRef.current) {
      clearInterval(healthCheckIntervalRef.current)
      healthCheckIntervalRef.current = null
    }

    setRecordingState('processing')

    // Stop audio recording and get result (PROJ-3)
    if (isTauri) {
      try {
        await invoke('set_recording_state', { recording: false })
        const result = await invoke<RecordingStopResult>('stop_audio_recording')
        console.log('Recording saved to:', result.file_path)
        // PROJ-8/PROJ-9: Pass file_path and context to callback for context-aware processing
        events?.onRecordingStop?.(result, currentContextRef.current || undefined)
      } catch (err) {
        console.error('Failed to stop recording:', err)
        setError('Aufnahme konnte nicht gespeichert werden')
      }
    } else {
      // Non-Tauri mode: pass dummy result
      events?.onRecordingStop?.({ file_path: '', duration_ms: 0, privacy_mode: false }, currentContextRef.current || undefined)
    }

    // After processing is done, reset to idle
    // In production, this should wait for transcription to complete (PROJ-4)
    setTimeout(() => {
      setRecordingState('idle')
      setRecordingStartTime(null)
      setRecordingDuration(0)
    }, 500)
  }, [events, isTauri])

  // Cancel recording handler
  const cancelRecording = useCallback(
    async (reason: string) => {
      // Clear timeouts
      if (maxTimeoutRef.current) {
        clearTimeout(maxTimeoutRef.current)
        maxTimeoutRef.current = null
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current)
        warningTimeoutRef.current = null
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
        durationIntervalRef.current = null
      }
      // Clear health check interval (BUG-2 fix)
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current)
        healthCheckIntervalRef.current = null
      }

      // Stop audio recording and discard (PROJ-3)
      if (isTauri) {
        try {
          await invoke('set_recording_state', { recording: false })
          // Stop and get the file, then delete it since cancelled
          const result = await invoke<{ file_path: string; duration_ms: number; privacy_mode: boolean }>('stop_audio_recording')
          // Delete the cancelled recording
          await invoke('delete_recording', { filePath: result.file_path })
        } catch (err) {
          console.error('Failed to cancel recording:', err)
        }
      }

      setRecordingState('idle')
      setRecordingStartTime(null)
      setRecordingDuration(0)

      events?.onRecordingCancel?.(reason)
    },
    [events, isTauri]
  )

  // Listen for Tauri events
  useEffect(() => {
    if (!isTauri) return

    const unlisteners: UnlistenFn[] = []

    const setupListeners = async () => {
      // Push-to-Talk: Start on press
      // PROJ-8/PROJ-9: Event payload contains AppContext for context-aware processing
      const unlistenPressed = await listen<AppContext | null>('hotkey-pressed', (event) => {
        if (recordingState === 'idle') {
          startRecording(event.payload || undefined)
        }
      })
      unlisteners.push(unlistenPressed)

      // Push-to-Talk: Stop on release (if held long enough)
      const unlistenReleased = await listen('hotkey-released', () => {
        if (recordingState === 'recording') {
          stopRecording()
        }
      })
      unlisteners.push(unlistenReleased)

      // Push-to-Talk: Cancel if not held long enough
      const unlistenCancelled = await listen<string>('hotkey-cancelled', (event) => {
        if (recordingState === 'recording') {
          cancelRecording(event.payload)
        }
      })
      unlisteners.push(unlistenCancelled)

      // Toggle mode: Start recording
      // PROJ-8/PROJ-9: Event payload contains AppContext for context-aware processing
      const unlistenStart = await listen<AppContext | null>('hotkey-start-recording', (event) => {
        if (recordingState === 'idle') {
          startRecording(event.payload || undefined)
        }
      })
      unlisteners.push(unlistenStart)

      // Toggle mode: Stop recording
      const unlistenStop = await listen('hotkey-stop-recording', () => {
        if (recordingState === 'recording') {
          stopRecording()
        }
      })
      unlisteners.push(unlistenStop)

      // EC-2.4: Hotkey pressed during processing
      const unlistenBusy = await listen('hotkey-busy', () => {
        showInfo('Verarbeitung läuft...', 'Bitte warte bis die aktuelle Aufnahme verarbeitet wurde')
      })
      unlisteners.push(unlistenBusy)

      // EC-2.2: Accessibility permission required (macOS)
      const unlistenPermission = await listen('accessibility-permission-required', () => {
        setAccessibilityPermissionRequired(true)
      })
      unlisteners.push(unlistenPermission)
    }

    setupListeners()

    return () => {
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [isTauri, recordingState, startRecording, stopRecording, cancelRecording])

  // Escape key handler for canceling in Toggle mode
  useEffect(() => {
    if (!isTauri || recordingState !== 'recording' || settings.mode !== 'Toggle') {
      return
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelRecording('Aufnahme abgebrochen')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isTauri, recordingState, settings.mode, cancelRecording])

  // Update settings
  const updateSettings = useCallback(
    async (newSettings: Partial<HotkeySettings>) => {
      if (!isTauri) return

      const updated = { ...settings, ...newSettings }

      try {
        await invoke('set_hotkey_settings', { settings: updated })
        setSettings(updated)
        setError(null)
      } catch (err) {
        console.error('Failed to update hotkey settings:', err)
        setError('Hotkey-Einstellungen konnten nicht gespeichert werden')
        throw err
      }
    },
    [isTauri, settings]
  )

  // Check if shortcut is available
  const checkShortcutAvailable = useCallback(
    async (shortcut: string): Promise<boolean> => {
      if (!isTauri) return true

      try {
        return await invoke<boolean>('check_shortcut_available', { shortcut })
      } catch (err) {
        console.error('Failed to check shortcut availability:', err)
        return false
      }
    },
    [isTauri]
  )

  // Request accessibility permission (macOS only)
  const requestAccessibilityPermission = useCallback(async () => {
    if (!isTauri) return

    try {
      await invoke('request_accessibility_permission')
      setAccessibilityPermissionRequired(false)
    } catch (err) {
      console.error('Failed to request accessibility permission:', err)
    }
  }, [isTauri])

  return {
    settings,
    isLoading,
    recordingState,
    isRecording: recordingState === 'recording',
    error,
    accessibilityPermissionRequired,
    updateSettings,
    checkShortcutAvailable,
    requestAccessibilityPermission,
    recordingStartTime,
    recordingDuration,
    // PROJ-8/PROJ-9: Expose current context for context-aware processing
    currentContext,
  }
}
