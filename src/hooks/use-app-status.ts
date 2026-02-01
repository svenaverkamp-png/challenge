'use client'

import { useState, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

export type AppStatus = 'idle' | 'recording' | 'processing' | 'error'

interface UseAppStatusReturn {
  status: AppStatus
  errorMessage: string | null
  setStatus: (status: AppStatus, errorMessage?: string) => void
  isRecording: boolean
  isProcessing: boolean
  hasError: boolean
}

export function useAppStatus(): UseAppStatusReturn {
  const [status, setStatusState] = useState<AppStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const setStatus = useCallback(async (newStatus: AppStatus, error?: string) => {
    setStatusState(newStatus)
    setErrorMessage(error || null)

    // Update tray tooltip via Tauri command
    try {
      await invoke('update_tray_status', { status: capitalizeStatus(newStatus) })
    } catch (err) {
      console.error('Failed to update tray status:', err)
    }
  }, [])

  // Initialize status on mount
  useEffect(() => {
    setStatus('idle')
  }, [setStatus])

  return {
    status,
    errorMessage,
    setStatus,
    isRecording: status === 'recording',
    isProcessing: status === 'processing',
    hasError: status === 'error',
  }
}

// Helper to capitalize status for Rust enum
function capitalizeStatus(status: AppStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}
