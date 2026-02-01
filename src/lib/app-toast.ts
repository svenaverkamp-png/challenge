import { toast } from 'sonner'
import type { ExternalToast } from 'sonner'

/**
 * PROJ-12: App Toast Helper
 * Centralized toast functions with consistent durations and styling
 */

// Default durations (in ms)
const DURATIONS = {
  success: 3000,
  warning: 5000,
  info: 5000,
  error: 10000,
}

type ToastOptions = Omit<ExternalToast, 'duration'> & {
  persistent?: boolean
}

interface ErrorToastOptions extends ToastOptions {
  retry?: () => void | Promise<void>
  details?: () => void
}

/**
 * Truncate message for toast display
 */
function truncate(message: string, maxLength = 100): string {
  if (message.length <= maxLength) return message
  return message.substring(0, maxLength) + '...'
}

/**
 * Success toast - green, 3 seconds
 */
export function toastSuccess(message: string, options?: ToastOptions) {
  return toast.success(truncate(message), {
    ...options,
    duration: options?.persistent ? Infinity : DURATIONS.success,
  })
}

/**
 * Warning toast - yellow, 5 seconds
 */
export function toastWarning(message: string, options?: ToastOptions) {
  return toast.warning(truncate(message), {
    ...options,
    duration: options?.persistent ? Infinity : DURATIONS.warning,
  })
}

/**
 * Info toast - blue, 5 seconds
 */
export function toastInfo(message: string, options?: ToastOptions) {
  return toast.info(truncate(message), {
    ...options,
    duration: options?.persistent ? Infinity : DURATIONS.info,
  })
}

/**
 * Error toast - red, 10 seconds (or persistent for critical errors)
 * Supports retry button and details link
 */
export function toastError(message: string, options?: ErrorToastOptions) {
  const { retry, details, persistent, ...rest } = options || {}

  return toast.error(truncate(message), {
    ...rest,
    duration: persistent ? Infinity : DURATIONS.error,
    action: retry ? {
      label: 'Wiederholen',
      onClick: retry,
    } : undefined,
    cancel: details ? {
      label: 'Details',
      onClick: details,
    } : undefined,
  })
}

/**
 * Loading toast - shows spinner, no auto-dismiss
 * Returns toast ID for later dismissal
 */
export function toastLoading(message: string, options?: Omit<ToastOptions, 'persistent'>) {
  return toast.loading(truncate(message), options)
}

/**
 * Promise toast - shows loading, then success/error
 */
export function toastPromise<T>(
  promise: Promise<T>,
  messages: {
    loading: string
    success: string | ((data: T) => string)
    error: string | ((error: unknown) => string)
  },
  options?: ToastOptions
) {
  return toast.promise(promise, {
    loading: messages.loading,
    success: messages.success,
    error: messages.error,
  })
}

/**
 * Dismiss a specific toast or all toasts
 */
export function toastDismiss(toastId?: string | number) {
  toast.dismiss(toastId)
}

/**
 * Dismiss all toasts
 */
export function toastDismissAll() {
  toast.dismiss()
}

// Export all functions as appToast object for convenient usage
export const appToast = {
  success: toastSuccess,
  warning: toastWarning,
  info: toastInfo,
  error: toastError,
  loading: toastLoading,
  promise: toastPromise,
  dismiss: toastDismiss,
  dismissAll: toastDismissAll,
}

export default appToast
