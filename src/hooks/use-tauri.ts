'use client'

import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

/** App status for tray icon */
export type AppStatus = 'Idle' | 'Recording' | 'Processing' | 'Error'

/**
 * Check if running inside Tauri environment (works for Tauri 2.x)
 * Only call this on the client side!
 */
function checkIsTauri(): boolean {
  // Tauri 2.x uses __TAURI_INTERNALS__
  if ('__TAURI_INTERNALS__' in window) return true

  // Fallback: check for __TAURI__ (Tauri 1.x compatibility)
  if ('__TAURI__' in window) return true

  return false
}

/**
 * Hook to detect if running inside Tauri environment
 * Uses useEffect to avoid hydration mismatch between server and client
 */
export function useTauri() {
  // Always start with false to match server rendering
  const [isTauri, setIsTauri] = useState(false)

  useEffect(() => {
    // Only check on client after hydration
    setIsTauri(checkIsTauri())
  }, [])

  return { isTauri }
}

/**
 * Hook to manage tray icon status and health
 */
export function useTrayStatus() {
  const { isTauri } = useTauri()
  const [currentStatus, setCurrentStatus] = useState<AppStatus>('Idle')
  const [trayHealthy, setTrayHealthy] = useState(true)

  /** Update the tray icon status */
  const updateStatus = useCallback(async (status: AppStatus) => {
    if (!isTauri) return

    try {
      await invoke('update_tray_status', { status })
      setCurrentStatus(status)
      setTrayHealthy(true)
    } catch (error) {
      console.error('Failed to update tray status:', error)
      setTrayHealthy(false)
    }
  }, [isTauri])

  /** Check if tray icon is healthy */
  const checkTrayHealth = useCallback(async () => {
    if (!isTauri) return true

    try {
      const exists = await invoke<boolean>('check_tray_status')
      setTrayHealthy(exists)
      return exists
    } catch (error) {
      console.error('Failed to check tray status:', error)
      setTrayHealthy(false)
      return false
    }
  }, [isTauri])

  /** Manually recreate tray icon (useful after system events) */
  const recreateTray = useCallback(async () => {
    if (!isTauri) return

    try {
      await invoke('recreate_tray_icon')
      setTrayHealthy(true)
      console.info('Tray icon recreated successfully')
    } catch (error) {
      console.error('Failed to recreate tray icon:', error)
      setTrayHealthy(false)
    }
  }, [isTauri])

  // Check tray health on visibility change (e.g., when app regains focus)
  useEffect(() => {
    if (!isTauri) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkTrayHealth().then(healthy => {
          if (!healthy) {
            console.warn('Tray icon missing, attempting recreation...')
            recreateTray()
          }
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [isTauri, checkTrayHealth, recreateTray])

  return {
    currentStatus,
    trayHealthy,
    updateStatus,
    checkTrayHealth,
    recreateTray,
  }
}
