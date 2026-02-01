'use client'

import { cn } from '@/lib/utils'
import type { AppStatus } from '@/hooks/use-app-status'
import { Circle, Loader2, AlertCircle, Mic } from 'lucide-react'

interface StatusIndicatorProps {
  status: AppStatus
  errorMessage?: string | null
  className?: string
}

const statusConfig: Record<AppStatus, {
  label: string
  dotColor: string
  textColor: string
  icon: React.ComponentType<{ className?: string }>
}> = {
  idle: {
    label: 'Bereit',
    dotColor: 'bg-green-500',
    textColor: 'text-muted-foreground',
    icon: Circle,
  },
  recording: {
    label: 'Aufnahme',
    dotColor: 'bg-destructive animate-pulse',
    textColor: 'text-destructive',
    icon: Mic,
  },
  processing: {
    label: 'Verarbeitung',
    dotColor: 'bg-primary',
    textColor: 'text-primary',
    icon: Loader2,
  },
  error: {
    label: 'Fehler',
    dotColor: 'bg-destructive',
    textColor: 'text-destructive',
    icon: AlertCircle,
  },
}

export function StatusIndicator({ status, errorMessage, className }: StatusIndicatorProps) {
  const config = statusConfig[status]

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex items-center gap-2 rounded-full bg-muted/30 px-3 py-1.5 backdrop-blur-sm">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            config.dotColor
          )}
        />
        <span className={cn('text-xs font-medium', config.textColor)}>
          {config.label}
        </span>
      </div>
      {errorMessage && (
        <span className="text-xs text-destructive">{errorMessage}</span>
      )}
    </div>
  )
}
