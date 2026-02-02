'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { ErrorDetailsModal } from '@/components/error-details-modal'
import { onShowErrorDetails, showError, showErrorByCode, AppError, ErrorCode } from '@/lib/app-error'

interface ErrorContextValue {
  showErrorDetails: (error: AppError) => void
  showError: typeof showError
  showErrorByCode: typeof showErrorByCode
}

const ErrorContext = createContext<ErrorContextValue | null>(null)

export function ErrorProvider({ children }: { children: ReactNode }) {
  const [errorModal, setErrorModal] = useState<{
    isOpen: boolean
    error: AppError | null
  }>({
    isOpen: false,
    error: null,
  })

  // Listen for global error detail events
  useEffect(() => {
    const unsubscribe = onShowErrorDetails((error) => {
      setErrorModal({ isOpen: true, error })
    })
    return unsubscribe
  }, [])

  const showErrorDetails = (error: AppError) => {
    setErrorModal({ isOpen: true, error })
  }

  const handleRetry = async (error: AppError) => {
    if (!error.action) return
    setErrorModal({ isOpen: false, error: null })

    try {
      await error.action()
    } catch (retryError) {
      // Error will be shown by the action itself
      console.error('Retry failed:', retryError)
    }
  }

  return (
    <ErrorContext.Provider value={{ showErrorDetails, showError, showErrorByCode }}>
      {children}
      <ErrorDetailsModal
        open={errorModal.isOpen}
        onOpenChange={(open) => setErrorModal({ isOpen: open, error: open ? errorModal.error : null })}
        error={errorModal.error}
        onRetry={handleRetry}
      />
    </ErrorContext.Provider>
  )
}

export function useErrorContext() {
  const context = useContext(ErrorContext)
  if (!context) {
    throw new Error('useErrorContext must be used within an ErrorProvider')
  }
  return context
}

// Re-export types and functions for convenience
export type { AppError, ErrorCode }
export { showError, showErrorByCode }

