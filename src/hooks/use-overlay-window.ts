'use client'

import { useCallback, useRef } from 'react'
import { Window, LogicalPosition, currentMonitor, getCurrentWindow } from '@tauri-apps/api/window'
import { emit } from '@tauri-apps/api/event'
import { useTauri } from './use-tauri'

/** Overlay window label */
const OVERLAY_LABEL = 'overlay'

/** Overlay window size */
const OVERLAY_WIDTH = 220
const OVERLAY_HEIGHT = 90

/** Margin from screen edge */
const SCREEN_MARGIN = 20

interface UseOverlayWindowReturn {
  /** Show the overlay window */
  showOverlay: () => Promise<void>
  /** Hide the overlay window */
  hideOverlay: () => Promise<void>
  /** Send recording started event to overlay */
  notifyRecordingStarted: () => Promise<void>
  /** Send recording stopped event to overlay */
  notifyRecordingStopped: () => Promise<void>
  /** Send audio level update to overlay */
  notifyAudioLevel: (level: number) => Promise<void>
  /** Send transcription started event to overlay */
  notifyTranscribing: () => Promise<void>
  /** Send AI improving event to overlay (PROJ-7) */
  notifyImproving: () => Promise<void>
  /** Send done event to overlay */
  notifyDone: () => Promise<void>
  /** Send error event to overlay */
  notifyError: (message: string) => Promise<void>
  /** Send cancelled event to overlay */
  notifyCancelled: () => Promise<void>
}

/**
 * Hook to manage the floating overlay window
 */
export function useOverlayWindow(): UseOverlayWindowReturn {
  const { isTauri } = useTauri()
  const overlayWindowRef = useRef<Window | null>(null)
  const audioLevelThrottleRef = useRef<number>(0)

  /**
   * Get or create the overlay window instance
   */
  const getOverlayWindow = useCallback(async (): Promise<Window | null> => {
    if (!isTauri) return null

    try {
      // Try to get existing window
      if (overlayWindowRef.current) {
        return overlayWindowRef.current
      }

      // Get the overlay window by label
      const window = await Window.getByLabel(OVERLAY_LABEL)
      if (window) {
        overlayWindowRef.current = window
        return window
      }

      return null
    } catch (error) {
      console.error('Failed to get overlay window:', error)
      return null
    }
  }, [isTauri])

  /**
   * Position the overlay window at the top-center of the current screen
   */
  const positionOverlay = useCallback(async (window: Window) => {
    try {
      // Get the current monitor
      const monitor = await currentMonitor()

      if (monitor) {
        const screenWidth = monitor.size.width / (monitor.scaleFactor || 1)
        const x = Math.round((screenWidth - OVERLAY_WIDTH) / 2)
        const y = SCREEN_MARGIN

        await window.setPosition(new LogicalPosition(x, y))
      }
    } catch (error) {
      console.error('Failed to position overlay:', error)
    }
  }, [])

  /**
   * Show the overlay window
   */
  const showOverlay = useCallback(async () => {
    if (!isTauri) return

    try {
      const window = await getOverlayWindow()
      if (!window) {
        console.warn('Overlay window not found')
        return
      }

      // Position and show the window
      await positionOverlay(window)
      await window.show()
      // Don't focus - we want to keep focus on the active app
    } catch (error) {
      console.error('Failed to show overlay:', error)
    }
  }, [isTauri, getOverlayWindow, positionOverlay])

  /**
   * Hide the overlay window
   */
  const hideOverlay = useCallback(async () => {
    if (!isTauri) return

    try {
      const window = await getOverlayWindow()
      if (window) {
        await window.hide()
      }
    } catch (error) {
      console.error('Failed to hide overlay:', error)
    }
  }, [isTauri, getOverlayWindow])

  /**
   * Send recording started event to overlay
   */
  const notifyRecordingStarted = useCallback(async () => {
    if (!isTauri) return

    try {
      await showOverlay()
      await emit('overlay-recording-started', { timestamp: Date.now() })
    } catch (error) {
      console.error('Failed to notify recording started:', error)
    }
  }, [isTauri, showOverlay])

  /**
   * Send recording stopped event to overlay
   */
  const notifyRecordingStopped = useCallback(async () => {
    if (!isTauri) return

    try {
      await emit('overlay-recording-stopped', {})
    } catch (error) {
      console.error('Failed to notify recording stopped:', error)
    }
  }, [isTauri])

  /**
   * Send audio level update to overlay (throttled to ~30fps)
   */
  const notifyAudioLevel = useCallback(async (level: number) => {
    if (!isTauri) return

    // Throttle to ~30fps (33ms)
    const now = Date.now()
    if (now - audioLevelThrottleRef.current < 33) {
      return
    }
    audioLevelThrottleRef.current = now

    try {
      await emit('overlay-audio-level', { level })
    } catch (error) {
      // Ignore errors for frequent updates
    }
  }, [isTauri])

  /**
   * Send transcription started event to overlay
   */
  const notifyTranscribing = useCallback(async () => {
    if (!isTauri) return

    try {
      await emit('overlay-transcribing', {})
    } catch (error) {
      console.error('Failed to notify transcribing:', error)
    }
  }, [isTauri])

  /**
   * Send AI improving event to overlay (PROJ-7: Ollama auto-edit)
   */
  const notifyImproving = useCallback(async () => {
    if (!isTauri) return

    try {
      await emit('overlay-improving', {})
    } catch (error) {
      console.error('Failed to notify improving:', error)
    }
  }, [isTauri])

  /**
   * Send done event to overlay
   */
  const notifyDone = useCallback(async () => {
    if (!isTauri) return

    try {
      await emit('overlay-done', {})
      // Window will hide itself after showing "Done" briefly
    } catch (error) {
      console.error('Failed to notify done:', error)
    }
  }, [isTauri])

  /**
   * Send error event to overlay
   */
  const notifyError = useCallback(async (message: string) => {
    if (!isTauri) return

    try {
      await emit('overlay-error', { message })
      // Window will hide itself after showing error
    } catch (error) {
      console.error('Failed to notify error:', error)
    }
  }, [isTauri])

  /**
   * Send cancelled event to overlay
   */
  const notifyCancelled = useCallback(async () => {
    if (!isTauri) return

    try {
      await emit('overlay-cancelled', {})
      // Window will hide itself after showing "Cancelled"
    } catch (error) {
      console.error('Failed to notify cancelled:', error)
    }
  }, [isTauri])

  return {
    showOverlay,
    hideOverlay,
    notifyRecordingStarted,
    notifyRecordingStopped,
    notifyAudioLevel,
    notifyTranscribing,
    notifyImproving,
    notifyDone,
    notifyError,
    notifyCancelled
  }
}
