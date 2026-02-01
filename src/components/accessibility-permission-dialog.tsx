'use client'

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
import { ShieldCheck, ExternalLink } from 'lucide-react'

interface AccessibilityPermissionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRequestPermission: () => void
}

/**
 * Dialog that guides macOS users through enabling Accessibility permissions
 * Required for global hotkeys to work system-wide
 */
export function AccessibilityPermissionDialog({
  open,
  onOpenChange,
  onRequestPermission,
}: AccessibilityPermissionDialogProps) {
  const handleOpenSettings = () => {
    onRequestPermission()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Bedienungshilfen-Berechtigung erforderlich
          </DialogTitle>
          <DialogDescription>
            Um globale Tastenkombinationen zu verwenden, benötigt EverVoice
            Zugriff auf die Bedienungshilfen.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <Alert className="border-primary/30 bg-primary/5">
            <AlertDescription className="text-sm">
              <strong className="block mb-2">So aktivierst du die Berechtigung:</strong>
              <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
                <li>Klicke auf &quot;Systemeinstellungen öffnen&quot;</li>
                <li>Gehe zu <strong>Datenschutz & Sicherheit</strong></li>
                <li>Wähle <strong>Bedienungshilfen</strong></li>
                <li>Aktiviere den Schalter neben <strong>EverVoice</strong></li>
              </ol>
            </AlertDescription>
          </Alert>

          <p className="text-xs text-muted-foreground">
            Diese Berechtigung ermöglicht es der App, Tastatureingaben zu erkennen,
            auch wenn andere Programme im Vordergrund sind. EverVoice verwendet
            diese Funktion ausschließlich für den Aufnahme-Hotkey.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Später
          </Button>
          <Button onClick={handleOpenSettings} className="gap-2">
            <ExternalLink className="h-4 w-4" />
            Systemeinstellungen öffnen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
