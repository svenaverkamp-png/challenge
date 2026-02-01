'use client'

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useTauri } from '@/hooks/use-tauri'
import { Mic, Settings, AlertCircle, ExternalLink } from 'lucide-react'

interface MicrophonePermissionDialogProps {
  /** Whether the dialog should be controlled externally */
  open?: boolean
  /** Callback when dialog open state changes */
  onOpenChange?: (open: boolean) => void
}

export function MicrophonePermissionDialog({
  open: controlledOpen,
  onOpenChange,
}: MicrophonePermissionDialogProps) {
  const { isTauri } = useTauri()
  const [internalOpen, setInternalOpen] = useState(false)
  const [errorType, setErrorType] = useState<'permission' | 'no-device' | 'busy' | null>(null)

  // Use controlled or internal state
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = onOpenChange || setInternalOpen

  // Listen for audio error events
  useEffect(() => {
    if (!isTauri) return

    const unlisteners: UnlistenFn[] = []

    const setupListeners = async () => {
      // Permission denied
      const unlistenPermission = await listen('audio-error-permission', () => {
        setErrorType('permission')
        setOpen(true)
      })
      unlisteners.push(unlistenPermission)

      // No device found
      const unlistenNoDevice = await listen('audio-error-no-device', () => {
        setErrorType('no-device')
        setOpen(true)
      })
      unlisteners.push(unlistenNoDevice)

      // Device busy
      const unlistenBusy = await listen('audio-error-busy', () => {
        setErrorType('busy')
        setOpen(true)
      })
      unlisteners.push(unlistenBusy)
    }

    setupListeners()

    return () => {
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [isTauri, setOpen])

  // Handle opening system preferences
  const openSystemPreferences = async () => {
    try {
      await invoke('request_microphone_permission')
    } catch (err) {
      console.error('Failed to open system preferences:', err)
    }
  }

  // Get content based on error type
  const getDialogContent = () => {
    switch (errorType) {
      case 'permission':
        return {
          icon: <Mic className="h-6 w-6 text-yellow-500" />,
          title: 'Mikrofon-Zugriff erforderlich',
          description:
            'EverVoice benötigt Zugriff auf Ihr Mikrofon für die Sprachaufnahme. Bitte erteilen Sie die Berechtigung in den Systemeinstellungen.',
          instructions: (
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Öffnen Sie die Systemeinstellungen</li>
              <li>Gehen Sie zu "Datenschutz & Sicherheit" → "Mikrofon"</li>
              <li>Aktivieren Sie EverVoice in der Liste</li>
              <li>Starten Sie die App neu</li>
            </ol>
          ),
          primaryAction: 'Systemeinstellungen öffnen',
          onPrimaryAction: openSystemPreferences,
        }
      case 'no-device':
        return {
          icon: <AlertCircle className="h-6 w-6 text-red-500" />,
          title: 'Kein Mikrofon gefunden',
          description:
            'Es wurde kein Mikrofon erkannt. Bitte schließen Sie ein Mikrofon an und versuchen Sie es erneut.',
          instructions: (
            <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
              <li>Stellen Sie sicher, dass ein Mikrofon angeschlossen ist</li>
              <li>Prüfen Sie die USB-Verbindung bei externen Mikrofonen</li>
              <li>Bei Bluetooth-Mikrofonen: Stellen Sie sicher, dass es gekoppelt ist</li>
              <li>Öffnen Sie die Mikrofon-Einstellungen um Geräte zu aktualisieren</li>
            </ul>
          ),
          primaryAction: 'Schließen',
          onPrimaryAction: () => setOpen(false),
        }
      case 'busy':
        return {
          icon: <Settings className="h-6 w-6 text-orange-500" />,
          title: 'Mikrofon wird verwendet',
          description:
            'Das Mikrofon wird von einer anderen Anwendung verwendet (z.B. Zoom, Teams, Discord).',
          instructions: (
            <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
              <li>Schließen Sie andere Anwendungen, die das Mikrofon verwenden</li>
              <li>Beenden Sie laufende Videoanrufe</li>
              <li>Wählen Sie ein anderes Mikrofon in den Einstellungen</li>
            </ul>
          ),
          primaryAction: 'Schließen',
          onPrimaryAction: () => setOpen(false),
        }
      default:
        return {
          icon: <AlertCircle className="h-6 w-6 text-red-500" />,
          title: 'Audio-Fehler',
          description: 'Ein unerwarteter Fehler ist aufgetreten.',
          instructions: null,
          primaryAction: 'Schließen',
          onPrimaryAction: () => setOpen(false),
        }
    }
  }

  const content = getDialogContent()

  if (!isTauri) return null

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              {content.icon}
            </div>
            <DialogTitle>{content.title}</DialogTitle>
          </div>
          <DialogDescription>{content.description}</DialogDescription>
        </DialogHeader>

        {content.instructions && (
          <div className="my-4 p-4 rounded-lg bg-muted/50">{content.instructions}</div>
        )}

        {errorType === 'permission' && (
          <Alert className="border-yellow-500/30 bg-yellow-500/10">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-700">
              Nach Änderung der Berechtigung muss die App möglicherweise neu gestartet werden.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button onClick={content.onPrimaryAction} className="gap-2">
            {content.primaryAction}
            {errorType === 'permission' && <ExternalLink className="h-4 w-4" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
