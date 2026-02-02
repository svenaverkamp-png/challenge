'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { toast } from 'sonner'

/**
 * PROJ-12: Error Categories
 * - transient: Temporary error (network), can be retried
 * - user_action: User needs to take action
 * - fatal: Severe app error
 * - permission: Missing permission
 */
export type ErrorCategory = 'transient' | 'user_action' | 'fatal' | 'permission'

/**
 * PROJ-12: App Error Interface
 */
export interface AppError {
  code: string
  message: string
  details?: string
  category: ErrorCategory
  timestamp: Date
  component: string
  retryable: boolean
  action?: () => Promise<void> | void
}

/**
 * PROJ-12: Known Error Codes
 */
export const ERROR_CODES = {
  ERR_MIC_NOT_FOUND: {
    message: 'Kein Mikrofon gefunden',
    category: 'permission' as ErrorCategory,
    retryable: false,
  },
  ERR_MIC_PERMISSION: {
    message: 'Mikrofon-Berechtigung fehlt',
    category: 'permission' as ErrorCategory,
    retryable: false,
  },
  ERR_WHISPER_LOAD: {
    message: 'Whisper-Modell konnte nicht geladen werden',
    category: 'transient' as ErrorCategory,
    retryable: true,
  },
  ERR_OLLAMA_UNREACHABLE: {
    message: 'Ollama nicht erreichbar',
    category: 'transient' as ErrorCategory,
    retryable: true,
  },
  ERR_TRANSCRIPTION_FAILED: {
    message: 'Transkription fehlgeschlagen',
    category: 'transient' as ErrorCategory,
    retryable: true,
  },
  ERR_INSERT_FAILED: {
    message: 'Text konnte nicht eingefuegt werden',
    category: 'user_action' as ErrorCategory,
    retryable: false,
  },
  ERR_NO_SPEECH: {
    message: 'Keine Sprache erkannt',
    category: 'user_action' as ErrorCategory,
    retryable: false,
  },
  ERR_TIMEOUT: {
    message: 'Zeitueberschreitung',
    category: 'transient' as ErrorCategory,
    retryable: true,
  },
} as const

export type ErrorCode = keyof typeof ERROR_CODES

/**
 * PROJ-12: Toast Duration Configuration (in ms)
 */
const TOAST_DURATIONS = {
  success: 3000,
  warning: 5000,
  info: 5000,
  error: 10000,
  persistent: Infinity,
}

/**
 * PROJ-12: Retry Configuration
 */
const RETRY_CONFIG = {
  maxAutoRetries: 2,
  backoffDelays: [1000, 3000], // Exponential backoff
}

interface RetryState {
  retryCount: number
  isRetrying: boolean
}

interface ErrorDetailsState {
  isOpen: boolean
  error: AppError | null
}

/**
 * PROJ-12: useError Hook
 * Centralized error management with retry functionality
 */
export function useError() {
  const [errorDetails, setErrorDetails] = useState<ErrorDetailsState>({
    isOpen: false,
    error: null,
  })
  const retryStatesRef = useRef<Map<string, RetryState>>(new Map())

  // Truncate long messages for toast display
  const truncateMessage = useCallback((message: string, maxLength = 100): string => {
    if (message.length <= maxLength) return message
    return message.substring(0, maxLength) + '...'
  }, [])

  // Show error details modal
  const showDetails = useCallback((error: AppError) => {
    setErrorDetails({ isOpen: true, error })
  }, [])

  // Close error details modal
  const closeDetails = useCallback(() => {
    setErrorDetails({ isOpen: false, error: null })
  }, [])

  // Handle retry with exponential backoff
  const handleRetry = useCallback(async (error: AppError) => {
    if (!error.action || !error.retryable) return

    const errorKey = `${error.code}-${error.component}`
    let retryState = retryStatesRef.current.get(errorKey) || { retryCount: 0, isRetrying: false }

    if (retryState.isRetrying) return // Prevent double-click

    retryState.isRetrying = true
    retryStatesRef.current.set(errorKey, retryState)

    try {
      // Show loading toast
      const loadingId = toast.loading('Wird wiederholt...', { duration: Infinity })

      // Wait for backoff delay if this is an auto-retry
      if (retryState.retryCount > 0 && retryState.retryCount <= RETRY_CONFIG.maxAutoRetries) {
        const delay = RETRY_CONFIG.backoffDelays[retryState.retryCount - 1] || RETRY_CONFIG.backoffDelays[RETRY_CONFIG.backoffDelays.length - 1]
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      await error.action()

      // Success - reset retry count
      retryStatesRef.current.delete(errorKey)
      toast.dismiss(loadingId)
      toast.success('Erfolgreich wiederholt')
    } catch (retryError) {
      toast.dismiss()
      retryState.retryCount++
      retryState.isRetrying = false
      retryStatesRef.current.set(errorKey, retryState)

      // Re-show error
      showError({
        ...error,
        details: error.details || (retryError instanceof Error ? retryError.message : String(retryError)),
      })
    }
  }, [])

  // Main error display function
  const showError = useCallback((error: AppError) => {
    const isPersistent = error.category === 'permission' || error.category === 'fatal' || error.category === 'user_action'
    const duration = isPersistent ? TOAST_DURATIONS.persistent : TOAST_DURATIONS.error
    const truncatedMessage = truncateMessage(error.message)

    toast.error(truncatedMessage, {
      duration,
      description: error.details ? truncateMessage(error.details, 80) : undefined,
      action: error.retryable && error.action ? {
        label: 'Wiederholen',
        onClick: () => handleRetry(error),
      } : undefined,
      cancel: error.details ? {
        label: 'Details',
        onClick: () => showDetails(error),
      } : undefined,
    })

    // Log error
    console.error(`[${error.timestamp.toISOString()}] [ERROR] [${error.component}] ${error.code}: ${error.message}`, error.details)
  }, [truncateMessage, handleRetry, showDetails])

  // Create error from known error code
  const createError = useCallback((
    code: ErrorCode,
    component: string,
    options?: {
      details?: string
      action?: () => Promise<void> | void
    }
  ): AppError => {
    const errorDef = ERROR_CODES[code]
    return {
      code,
      message: errorDef.message,
      details: options?.details,
      category: errorDef.category,
      timestamp: new Date(),
      component,
      retryable: errorDef.retryable,
      action: options?.action,
    }
  }, [])

  // Convenience methods for different toast types
  const showSuccess = useCallback((message: string, description?: string) => {
    toast.success(message, {
      duration: TOAST_DURATIONS.success,
      description,
    })
  }, [])

  const showWarning = useCallback((message: string, description?: string, persistent = false) => {
    toast.warning(message, {
      duration: persistent ? TOAST_DURATIONS.persistent : TOAST_DURATIONS.warning,
      description,
    })
  }, [])

  const showInfo = useCallback((message: string, description?: string) => {
    toast.info(message, {
      duration: TOAST_DURATIONS.info,
      description,
    })
  }, [])

  // Show loading toast with promise
  const showLoading = useCallback((message: string) => {
    return toast.loading(message)
  }, [])

  // Dismiss specific or all toasts
  const dismiss = useCallback((toastId?: string | number) => {
    toast.dismiss(toastId)
  }, [])

  const dismissAll = useCallback(() => {
    toast.dismiss()
  }, [])

  return {
    // Error management
    showError,
    createError,
    errorDetails,
    showDetails,
    closeDetails,
    handleRetry,

    // Convenience toast methods
    showSuccess,
    showWarning,
    showInfo,
    showLoading,
    dismiss,
    dismissAll,

    // Constants
    ERROR_CODES,
    TOAST_DURATIONS,
  }
}

