'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Copy, Check, RefreshCw } from 'lucide-react'
import type { AppError, ErrorCategory } from '@/lib/app-error'

interface ErrorDetailsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  error: AppError | null
  onRetry?: (error: AppError) => void
}

const CATEGORY_LABELS: Record<ErrorCategory, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  transient: { label: 'Temporaer', variant: 'secondary' },
  user_action: { label: 'Aktion erforderlich', variant: 'outline' },
  fatal: { label: 'Schwerwiegend', variant: 'destructive' },
  permission: { label: 'Berechtigung', variant: 'destructive' },
}

export function ErrorDetailsModal({ open, onOpenChange, error, onRetry }: ErrorDetailsModalProps) {
  const [copied, setCopied] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!error) return

    const errorText = [
      `Error Code: ${error.code}`,
      `Message: ${error.message}`,
      error.details ? `Details: ${error.details}` : null,
      `Category: ${error.category}`,
      `Component: ${error.component}`,
      `Timestamp: ${error.timestamp.toISOString()}`,
      `Retryable: ${error.retryable ? 'Yes' : 'No'}`,
    ].filter(Boolean).join('\n')

    try {
      await navigator.clipboard.writeText(errorText)
      setCopied(true)
      toast.success('In Zwischenablage kopiert')
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
      toast.error('Kopieren fehlgeschlagen')
    }
  }, [error])

  const handleRetry = useCallback(async () => {
    if (!error || !error.action || !onRetry) return

    setIsRetrying(true)
    try {
      onRetry(error)
      onOpenChange(false)
    } finally {
      setIsRetrying(false)
    }
  }, [error, onRetry, onOpenChange])

  if (!error) return null

  const categoryConfig = CATEGORY_LABELS[error.category]

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Fehler-Details
          </AlertDialogTitle>
          <AlertDialogDescription>
            Technische Informationen zum aufgetretenen Fehler
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          {/* Error Code */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Error-Code:</span>
            <code className="rounded bg-muted px-2 py-1 text-sm font-mono">
              {error.code}
            </code>
          </div>

          {/* Category Badge */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Kategorie:</span>
            <Badge variant={categoryConfig.variant}>
              {categoryConfig.label}
            </Badge>
          </div>

          {/* Component */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Komponente:</span>
            <span className="text-sm">{error.component}</span>
          </div>

          {/* Timestamp */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Zeitpunkt:</span>
            <span className="text-sm">
              {error.timestamp.toLocaleString('de-DE', {
                dateStyle: 'short',
                timeStyle: 'medium',
              })}
            </span>
          </div>

          {/* Message */}
          <div className="space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Fehlermeldung:</span>
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm">{error.message}</p>
            </div>
          </div>

          {/* Details (if available) */}
          {error.details && (
            <div className="space-y-1">
              <span className="text-sm font-medium text-muted-foreground">Technische Details:</span>
              <pre className="max-h-[150px] overflow-auto rounded-md bg-muted p-3 text-xs font-mono whitespace-pre-wrap">
                {error.details}
              </pre>
            </div>
          )}

          {/* Retryable Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Wiederholbar:</span>
            <span className={`text-sm ${error.retryable ? 'text-green-600' : 'text-muted-foreground'}`}>
              {error.retryable ? 'Ja' : 'Nein'}
            </span>
          </div>
        </div>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="gap-2"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-green-500" />
                Kopiert
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                In Zwischenablage
              </>
            )}
          </Button>

          {error.retryable && error.action && onRetry && (
            <Button
              variant="default"
              size="sm"
              onClick={handleRetry}
              disabled={isRetrying}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Wird wiederholt...' : 'Wiederholen'}
            </Button>
          )}

          <AlertDialogCancel asChild>
            <Button variant="ghost" size="sm">
              Schliessen
            </Button>
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
