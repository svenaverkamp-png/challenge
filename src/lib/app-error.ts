/**
 * PROJ-12: Global Error Event System
 * Event-based error handling that works outside React components
 */

import { toast } from 'sonner'

// Error grouping configuration (EC-12.1)
const ERROR_GROUPING = {
  windowMs: 2000,      // Time window for grouping (2 seconds)
  threshold: 5,        // Number of errors before grouping
  groupToastId: 'error-group-toast',
}

// Track recent errors for grouping
let recentErrors: { timestamp: number; error: AppError }[] = []
let groupedErrorCount = 0
let groupToastShown = false

// Error Categories
export type ErrorCategory = 'transient' | 'user_action' | 'fatal' | 'permission'

// App Error Interface
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

// Known Error Codes with defaults
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
  ERR_MIC_BUSY: {
    message: 'Mikrofon wird verwendet',
    category: 'user_action' as ErrorCategory,
    retryable: false,
  },
  ERR_MIC_DISCONNECTED: {
    message: 'Mikrofon getrennt',
    category: 'user_action' as ErrorCategory,
    retryable: false,
  },
  ERR_WHISPER_LOAD: {
    message: 'Whisper-Modell konnte nicht geladen werden',
    category: 'transient' as ErrorCategory,
    retryable: true,
  },
  ERR_WHISPER_DOWNLOAD: {
    message: 'Modell-Download fehlgeschlagen',
    category: 'transient' as ErrorCategory,
    retryable: true,
  },
  ERR_OLLAMA_UNREACHABLE: {
    message: 'Ollama nicht erreichbar',
    category: 'transient' as ErrorCategory,
    retryable: true,
  },
  ERR_OLLAMA_TIMEOUT: {
    message: 'AI-Bearbeitung zu langsam',
    category: 'transient' as ErrorCategory,
    retryable: true,
  },
  ERR_OLLAMA_INVALID_URL: {
    message: 'Ungueltige Ollama URL',
    category: 'user_action' as ErrorCategory,
    retryable: false,
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
  ERR_CLIPBOARD: {
    message: 'Zwischenablage-Fehler',
    category: 'transient' as ErrorCategory,
    retryable: true,
  },
  ERR_EXPORT: {
    message: 'Export fehlgeschlagen',
    category: 'transient' as ErrorCategory,
    retryable: true,
  },
  ERR_IMPORT: {
    message: 'Import fehlgeschlagen',
    category: 'transient' as ErrorCategory,
    retryable: true,
  },
  ERR_SETTINGS_RESET: {
    message: 'Zuruecksetzen fehlgeschlagen',
    category: 'transient' as ErrorCategory,
    retryable: true,
  },
  ERR_AUDIO: {
    message: 'Audio-Fehler',
    category: 'transient' as ErrorCategory,
    retryable: true,
  },
  ERR_UNKNOWN: {
    message: 'Ein Fehler ist aufgetreten',
    category: 'fatal' as ErrorCategory,
    retryable: false,
  },
} as const

export type ErrorCode = keyof typeof ERROR_CODES

// Toast durations
const TOAST_DURATIONS = {
  success: 3000,
  warning: 5000,
  info: 5000,
  error: 10000,
  persistent: Infinity,
}

// Retry configuration
const RETRY_CONFIG = {
  maxAutoRetries: 2,
  backoffDelays: [1000, 3000],
}

// Global event emitter for error details modal
type ErrorDetailListener = (error: AppError) => void
const errorDetailListeners: Set<ErrorDetailListener> = new Set()

export function onShowErrorDetails(listener: ErrorDetailListener): () => void {
  errorDetailListeners.add(listener)
  return () => errorDetailListeners.delete(listener)
}

function emitShowErrorDetails(error: AppError) {
  errorDetailListeners.forEach(listener => listener(error))
}

// Truncate long messages
function truncate(message: string, maxLength = 100): string {
  if (message.length <= maxLength) return message
  return message.substring(0, maxLength) + '...'
}

// Retry state management
const retryStates = new Map<string, { count: number; isRetrying: boolean }>()

async function handleRetry(error: AppError): Promise<void> {
  if (!error.action || !error.retryable) return

  const key = `${error.code}-${error.component}`
  let state = retryStates.get(key) || { count: 0, isRetrying: false }

  if (state.isRetrying) return

  state.isRetrying = true
  retryStates.set(key, state)

  const loadingId = toast.loading('Wird wiederholt...')

  try {
    // Apply backoff delay
    if (state.count > 0 && state.count <= RETRY_CONFIG.maxAutoRetries) {
      const delay = RETRY_CONFIG.backoffDelays[Math.min(state.count - 1, RETRY_CONFIG.backoffDelays.length - 1)]
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    await error.action()

    // Success
    retryStates.delete(key)
    toast.dismiss(loadingId)
    toast.success('Erfolgreich wiederholt')
  } catch (retryError) {
    toast.dismiss(loadingId)
    state.count++
    state.isRetrying = false
    retryStates.set(key, state)

    // Show error again
    showError({
      ...error,
      details: error.details || (retryError instanceof Error ? retryError.message : String(retryError)),
    })
  }
}

/**
 * Check if errors should be grouped (EC-12.1)
 */
function shouldGroupErrors(): boolean {
  const now = Date.now()

  // Clean up old errors outside the window
  recentErrors = recentErrors.filter(e => now - e.timestamp < ERROR_GROUPING.windowMs)

  return recentErrors.length >= ERROR_GROUPING.threshold
}

/**
 * Show grouped error toast (EC-12.1)
 */
function showGroupedError(additionalCount: number): void {
  toast.error(`${additionalCount} weitere Fehler aufgetreten`, {
    id: ERROR_GROUPING.groupToastId,
    duration: TOAST_DURATIONS.error,
    description: 'Mehrere Fehler in kurzer Zeit. Klicke fuer Details.',
    action: {
      label: 'Details',
      onClick: () => {
        // Show the most recent errors
        const errors = recentErrors.slice(-5).map(e => e.error)
        if (errors.length > 0) {
          emitShowErrorDetails(errors[0])
        }
      },
    },
  })
}

/**
 * Show an error with optional retry and details
 * Implements error grouping (EC-12.1) when many errors occur quickly
 */
export function showError(error: AppError): string | number {
  const now = Date.now()

  // Track this error for grouping
  recentErrors.push({ timestamp: now, error })

  // Check if we should group errors
  if (shouldGroupErrors()) {
    groupedErrorCount++

    // Only update the grouped toast, don't show individual errors
    if (!groupToastShown) {
      groupToastShown = true
      showGroupedError(groupedErrorCount)
    } else {
      // Update the existing grouped toast
      showGroupedError(groupedErrorCount)
    }

    // Log to console anyway
    console.error(
      `[${error.timestamp.toISOString()}] [ERROR] [${error.component}] ${error.code}: ${error.message}`,
      error.details || ''
    )

    // Reset grouping state after window expires
    setTimeout(() => {
      if (Date.now() - now >= ERROR_GROUPING.windowMs) {
        groupedErrorCount = 0
        groupToastShown = false
      }
    }, ERROR_GROUPING.windowMs + 100)

    return ERROR_GROUPING.groupToastId
  }

  // Normal error display
  const isPersistent = error.category === 'permission' || error.category === 'fatal' || error.category === 'user_action'
  const duration = isPersistent ? TOAST_DURATIONS.persistent : TOAST_DURATIONS.error

  const toastId = toast.error(truncate(error.message), {
    duration,
    description: error.details ? truncate(error.details, 80) : undefined,
    action: error.retryable && error.action ? {
      label: 'Wiederholen',
      onClick: () => handleRetry(error),
    } : undefined,
    cancel: error.details ? {
      label: 'Details',
      onClick: () => emitShowErrorDetails(error),
    } : undefined,
  })

  // Log to console
  console.error(
    `[${error.timestamp.toISOString()}] [ERROR] [${error.component}] ${error.code}: ${error.message}`,
    error.details || ''
  )

  return toastId
}

/**
 * Create and show an error from a known error code
 */
export function showErrorByCode(
  code: ErrorCode,
  component: string,
  options?: {
    details?: string
    action?: () => Promise<void> | void
    overrideMessage?: string
  }
): string | number {
  const errorDef = ERROR_CODES[code]
  const error: AppError = {
    code,
    message: options?.overrideMessage || errorDef.message,
    details: options?.details,
    category: errorDef.category,
    timestamp: new Date(),
    component,
    retryable: errorDef.retryable,
    action: options?.action,
  }
  return showError(error)
}

/**
 * Create an AppError object (without showing it)
 */
export function createError(
  code: ErrorCode,
  component: string,
  options?: {
    details?: string
    action?: () => Promise<void> | void
  }
): AppError {
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
}

// Convenience functions for common toast types
export function showSuccess(message: string, description?: string): string | number {
  return toast.success(message, {
    duration: TOAST_DURATIONS.success,
    description,
  })
}

export function showWarning(message: string, description?: string, persistent = false): string | number {
  return toast.warning(message, {
    duration: persistent ? TOAST_DURATIONS.persistent : TOAST_DURATIONS.warning,
    description,
  })
}

export function showInfo(message: string, description?: string): string | number {
  return toast.info(message, {
    duration: TOAST_DURATIONS.info,
    description,
  })
}

export function showLoading(message: string): string | number {
  return toast.loading(message)
}

export function dismissToast(toastId?: string | number): void {
  toast.dismiss(toastId)
}

export function dismissAllToasts(): void {
  toast.dismiss()
}

// Export unified API
export const appError = {
  show: showError,
  showByCode: showErrorByCode,
  create: createError,
  success: showSuccess,
  warning: showWarning,
  info: showInfo,
  loading: showLoading,
  dismiss: dismissToast,
  dismissAll: dismissAllToasts,
  onShowDetails: onShowErrorDetails,
  ERROR_CODES,
  TOAST_DURATIONS,
}

export default appError
