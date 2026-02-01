'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { toast } from 'sonner'
import { useTauri } from './use-tauri'

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

/** Events emitted by the hotkey system */
export interface HotkeyEvents {
  onRecordingStart?: () => void
  onRecordingStop?: () => void
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
}

/** Default hotkey settings */
const DEFAULT_SETTINGS: HotkeySettings = {
  shortcut: 'CommandOrControl+Shift+Space',
  mode: 'PushToTalk',
  enabled: true,
}

/** Maximum recording time in milliseconds (6 minutes) */
const MAX_RECORDING_TIME = 6 * 60 * 1000

/** Warning time before max (5:30 = 5.5 minutes) */
const WARNING_TIME = 5.5 * 60 * 1000

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

  // Refs for debouncing and timeout
  const lastToggleRef = useRef<number>(0)
  const maxTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
  const startRecording = useCallback(async () => {
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

    // Sync state with backend (BUG-3 fix)
    if (isTauri) {
      try {
        await invoke('set_recording_state', { recording: true })
      } catch (err) {
        console.error('Failed to sync recording state:', err)
      }
    }

    // Start duration tracking
    durationIntervalRef.current = setInterval(() => {
      setRecordingDuration(Date.now() - now)
    }, 100)

    // Set warning timeout (5:30)
    warningTimeoutRef.current = setTimeout(() => {
      toast.warning('Noch 30 Sekunden', {
        description: 'Maximale Aufnahmezeit wird bald erreicht',
      })
    }, WARNING_TIME)

    // Set max timeout (6 minutes)
    maxTimeoutRef.current = setTimeout(() => {
      toast.info('Maximale Aufnahmezeit erreicht', {
        description: 'Aufnahme wird automatisch beendet',
      })
      stopRecording()
    }, MAX_RECORDING_TIME)

    events?.onRecordingStart?.()
  }, [settings.mode, events, isTauri])

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

    // Sync state with backend (BUG-3 fix)
    if (isTauri) {
      try {
        await invoke('set_recording_state', { recording: false })
      } catch (err) {
        console.error('Failed to sync recording state:', err)
      }
    }

    setRecordingState('processing')
    events?.onRecordingStop?.()

    // After processing is done, reset to idle (this should be called by the parent)
    // For now, we set a short timeout to simulate
    setTimeout(() => {
      setRecordingState('idle')
      setRecordingStartTime(null)
      setRecordingDuration(0)
    }, 100)
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

      // Sync state with backend (BUG-3 fix)
      if (isTauri) {
        try {
          await invoke('set_recording_state', { recording: false })
        } catch (err) {
          console.error('Failed to sync recording state:', err)
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
      const unlistenPressed = await listen('hotkey-pressed', () => {
        if (recordingState === 'idle') {
          startRecording()
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
      const unlistenStart = await listen('hotkey-start-recording', () => {
        if (recordingState === 'idle') {
          startRecording()
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
        toast.info('Verarbeitung läuft...', {
          description: 'Bitte warte bis die aktuelle Aufnahme verarbeitet wurde',
        })
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
  }
}
