'use client'

import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface UseAutostartReturn {
  isEnabled: boolean
  isLoading: boolean
  error: string | null
  toggle: () => Promise<void>
  enable: () => Promise<void>
  disable: () => Promise<void>
}

export function useAutostart(): UseAutostartReturn {
  const [isEnabled, setIsEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch initial autostart status
  useEffect(() => {
    async function fetchStatus() {
      try {
        const enabled = await invoke<boolean>('get_autostart_status')
        setIsEnabled(enabled)
        setError(null)
      } catch (err) {
        console.error('Failed to get autostart status:', err)
        setError('Autostart-Status konnte nicht gelesen werden')
      } finally {
        setIsLoading(false)
      }
    }

    fetchStatus()
  }, [])

  const enable = useCallback(async () => {
    setIsLoading(true)
    try {
      await invoke('set_autostart', { enabled: true })
      setIsEnabled(true)
      setError(null)
    } catch (err) {
      console.error('Failed to enable autostart:', err)
      setError('Autostart konnte nicht aktiviert werden')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const disable = useCallback(async () => {
    setIsLoading(true)
    try {
      await invoke('set_autostart', { enabled: false })
      setIsEnabled(false)
      setError(null)
    } catch (err) {
      console.error('Failed to disable autostart:', err)
      setError('Autostart konnte nicht deaktiviert werden')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const toggle = useCallback(async () => {
    if (isEnabled) {
      await disable()
    } else {
      await enable()
    }
  }, [isEnabled, enable, disable])

  return {
    isEnabled,
    isLoading,
    error,
    toggle,
    enable,
    disable,
  }
}

