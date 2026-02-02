'use client'

import { ReactNode } from 'react'
import { ErrorProvider } from '@/contexts/error-context'

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ErrorProvider>
      {children}
    </ErrorProvider>
  )
}

