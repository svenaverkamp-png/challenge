'use client'

import { useState } from 'react'
import { useCrashRecovery } from '@/hooks/use-crash-recovery'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

/**
 * Component that shows a notification when a previous crash was detected.
 * Displays on app startup if the app crashed in the previous session.
 */
export function CrashNotification() {
  const { hasCrash, crashInfo, clearCrashNotification, getCrashLog, crashLog } = useCrashRecovery()
  const [showDetails, setShowDetails] = useState(false)

  if (!hasCrash || !crashInfo) {
    return null
  }

  const handleDismiss = async () => {
    await clearCrashNotification()
  }

  const handleShowLog = async () => {
    await getCrashLog()
    setShowDetails(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            App wurde unerwartet beendet
          </CardTitle>
          <CardDescription>
            Die App ist beim letzten Mal abgestuerzt. Deine Daten sollten sicher sein.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium">Zeitpunkt:</p>
            <p className="text-muted-foreground">{crashInfo.timestamp}</p>
          </div>
          {crashInfo.message && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">Fehler:</p>
              <p className="text-muted-foreground break-all">{crashInfo.message}</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <AlertDialog open={showDetails} onOpenChange={setShowDetails}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" onClick={handleShowLog}>
                Details anzeigen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-h-[80vh] overflow-y-auto">
              <AlertDialogHeader>
                <AlertDialogTitle>Crash-Log</AlertDialogTitle>
                <AlertDialogDescription>
                  Technische Details zum Absturz
                </AlertDialogDescription>
              </AlertDialogHeader>
              <pre className="max-h-[300px] overflow-auto rounded-md bg-muted p-4 text-xs">
                {crashLog || 'Kein Crash-Log verfuegbar'}
              </pre>
              <AlertDialogFooter>
                <AlertDialogCancel>Schliessen</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button onClick={handleDismiss}>
            Verstanden
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
