'use client'

import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTauri } from './use-tauri'

/** Crash information from the backend */
export interface CrashInfo {
  timestamp: string
  message: string
  location: string | null
}

/**
 * Hook to manage crash recovery and notifications
 */
export function useCrashRecovery() {
  const { isTauri } = useTauri()
  const [crashInfo, setCrashInfo] = useState<CrashInfo | null>(null)
  const [hasCrash, setHasCrash] = useState(false)
  const [crashLog, setCrashLog] = useState<string>('')

  /** Check if there was a previous crash */
  const checkForCrash = useCallback(async () => {
    if (!isTauri) return null

    try {
      const info = await invoke<CrashInfo | null>('check_previous_crash')
      if (info) {
        setCrashInfo(info)
        setHasCrash(true)
      }
      return info
    } catch (error) {
      console.error('Failed to check for previous crash:', error)
      return null
    }
  }, [isTauri])

  /** Clear the crash notification (user acknowledged) */
  const clearCrashNotification = useCallback(async () => {
    if (!isTauri) return

    try {
      await invoke('clear_crash_notification')
      setCrashInfo(null)
      setHasCrash(false)
    } catch (error) {
      console.error('Failed to clear crash notification:', error)
    }
  }, [isTauri])

  /** Get the full crash log */
  const getCrashLog = useCallback(async () => {
    if (!isTauri) return ''

    try {
      const log = await invoke<string>('get_crash_log')
      setCrashLog(log)
      return log
    } catch (error) {
      console.error('Failed to get crash log:', error)
      return ''
    }
  }, [isTauri])

  /** Clear the crash log */
  const clearCrashLog = useCallback(async () => {
    if (!isTauri) return

    try {
      await invoke('clear_crash_log')
      setCrashLog('')
    } catch (error) {
      console.error('Failed to clear crash log:', error)
    }
  }, [isTauri])

  // Check for crashes on mount
  useEffect(() => {
    if (isTauri) {
      checkForCrash()
    }
  }, [isTauri, checkForCrash])

  return {
    hasCrash,
    crashInfo,
    crashLog,
    checkForCrash,
    clearCrashNotification,
    getCrashLog,
    clearCrashLog,
  }
}
