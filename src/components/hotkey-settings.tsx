'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useHotkey, HotkeyMode } from '@/hooks/use-hotkey'
import { useTauri } from '@/hooks/use-tauri'
import { Keyboard, AlertCircle, Mic, ToggleLeft } from 'lucide-react'

/** Map of modifier keys to display names */
const MODIFIER_DISPLAY: Record<string, string> = {
  CommandOrControl: '⌘/Ctrl',
  Command: '⌘',
  Control: 'Ctrl',
  Shift: '⇧',
  Alt: '⌥/Alt',
  Option: '⌥',
}

/** Parse shortcut string to readable format */
function formatShortcut(shortcut: string): string {
  const parts = shortcut.split('+')
  return parts
    .map((part) => MODIFIER_DISPLAY[part] || part)
    .join(' + ')
}

/** Known conflicting shortcuts */
const KNOWN_CONFLICTS: Record<string, string> = {
  'CommandOrControl+Space': 'Spotlight (macOS) / Start Menu (Windows)',
  'Control+Space': 'Input Method Switch',
  'Alt+Space': 'Window Menu (Windows)',
  'CommandOrControl+Shift+P': 'VSCode Command Palette',
}

export function HotkeySettings() {
  const { isTauri } = useTauri()
  const {
    settings,
    isLoading,
    error,
    updateSettings,
    checkShortcutAvailable,
  } = useHotkey()

  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false)
  const [pendingShortcut, setPendingShortcut] = useState<string | null>(null)
  const [conflictWarning, setConflictWarning] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Handle shortcut recording
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isRecordingShortcut) return

      e.preventDefault()
      e.stopPropagation()

      // Ignore modifier-only presses
      if (['Control', 'Shift', 'Alt', 'Meta', 'Command'].includes(e.key)) {
        return
      }

      // Build shortcut string
      const parts: string[] = []
      if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl')
      if (e.shiftKey) parts.push('Shift')
      if (e.altKey) parts.push('Alt')

      // Get the key (capitalize first letter)
      let key = e.key
      if (key === ' ') key = 'Space'
      else if (key.length === 1) key = key.toUpperCase()

      parts.push(key)

      const shortcut = parts.join('+')
      setPendingShortcut(shortcut)

      // Check for known conflicts
      const conflict = KNOWN_CONFLICTS[shortcut]
      if (conflict) {
        setConflictWarning(`Dieser Hotkey wird möglicherweise von "${conflict}" verwendet`)
      } else {
        setConflictWarning(null)
      }

      setIsRecordingShortcut(false)
    },
    [isRecordingShortcut]
  )

  // Add keyboard listener when recording
  useEffect(() => {
    if (isRecordingShortcut) {
      window.addEventListener('keydown', handleKeyDown, true)
      return () => window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [isRecordingShortcut, handleKeyDown])

  // Save pending shortcut
  const saveShortcut = async () => {
    if (!pendingShortcut) return

    try {
      await updateSettings({ shortcut: pendingShortcut })
      setPendingShortcut(null)
      setConflictWarning(null)
      setSaveError(null)
    } catch (err) {
      setSaveError('Hotkey konnte nicht gespeichert werden')
    }
  }

  // Cancel shortcut change
  const cancelShortcutChange = () => {
    setPendingShortcut(null)
    setConflictWarning(null)
    setIsRecordingShortcut(false)
  }

  // Toggle hotkey enabled
  const toggleEnabled = async () => {
    try {
      await updateSettings({ enabled: !settings.enabled })
      setSaveError(null)
    } catch (err) {
      setSaveError('Einstellung konnte nicht gespeichert werden')
    }
  }

  // Change mode
  const changeMode = async (mode: HotkeyMode) => {
    try {
      await updateSettings({ mode })
      setSaveError(null)
    } catch (err) {
      setSaveError('Einstellung konnte nicht gespeichert werden')
    }
  }

  if (!isTauri) {
    return null
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-light">
            <Keyboard className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Hotkey</span>
          </CardTitle>
          <CardDescription>
            Globale Tastenkombination für Aufnahme
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              {/* Enable/Disable Hotkey */}
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
                    <Keyboard className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="space-y-0.5">
                    <Label htmlFor="hotkey-enabled" className="text-sm font-medium">
                      Hotkey aktiviert
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Globale Tastenkombination verwenden
                    </p>
                  </div>
                </div>
                <Switch
                  id="hotkey-enabled"
                  checked={settings.enabled}
                  onCheckedChange={toggleEnabled}
                  aria-label="Hotkey aktivieren/deaktivieren"
                  className="data-[state=checked]:bg-primary"
                />
              </div>

              {settings.enabled && (
                <>
                  {/* Current Shortcut */}
                  <div className="flex items-center justify-between py-2">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        Aktuelle Tastenkombination
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Klicke um zu ändern
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="min-w-[160px] font-mono"
                      onClick={() => setIsRecordingShortcut(true)}
                    >
                      {formatShortcut(settings.shortcut)}
                    </Button>
                  </div>

                  {/* Mode Selection */}
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center space-x-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
                        {settings.mode === 'PushToTalk' ? (
                          <Mic className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Aufnahme-Modus</Label>
                        <p className="text-xs text-muted-foreground">
                          {settings.mode === 'PushToTalk'
                            ? 'Gedrückt halten zum Aufnehmen'
                            : 'Einmal drücken zum Starten/Stoppen'}
                        </p>
                      </div>
                    </div>
                    <Select
                      value={settings.mode}
                      onValueChange={(value) => changeMode(value as HotkeyMode)}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PushToTalk">
                          <div className="flex items-center gap-2">
                            <Mic className="h-4 w-4" />
                            Push-to-Talk
                          </div>
                        </SelectItem>
                        <SelectItem value="Toggle">
                          <div className="flex items-center gap-2">
                            <ToggleLeft className="h-4 w-4" />
                            Toggle
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Mode Info */}
                  <div className="rounded-lg bg-muted/20 p-4">
                    <div className="text-xs text-muted-foreground leading-relaxed">
                      {settings.mode === 'PushToTalk' ? (
                        <>
                          <strong>Push-to-Talk:</strong> Halte die Taste gedrückt
                          während du sprichst. Die Aufnahme endet automatisch beim
                          Loslassen. Mindest-Haltezeit: 300ms.
                        </>
                      ) : (
                        <>
                          <strong>Toggle:</strong> Drücke einmal zum Starten der
                          Aufnahme und erneut zum Beenden. Drücke <Badge variant="secondary" className="text-xs">Esc</Badge> zum Abbrechen.
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Error display */}
              {(error || saveError) && (
                <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error || saveError}</AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Shortcut Recording Dialog */}
      <Dialog open={isRecordingShortcut || !!pendingShortcut} onOpenChange={(open) => {
        if (!open) cancelShortcutChange()
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {isRecordingShortcut ? 'Neue Tastenkombination' : 'Tastenkombination bestätigen'}
            </DialogTitle>
            <DialogDescription>
              {isRecordingShortcut
                ? 'Drücke die gewünschte Tastenkombination (z.B. Cmd+Shift+Space)'
                : 'Möchtest du diese Tastenkombination verwenden?'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-6">
            {isRecordingShortcut ? (
              <div className="flex items-center justify-center">
                <div className="animate-pulse rounded-lg bg-muted p-6">
                  <Keyboard className="h-12 w-12 text-muted-foreground" />
                </div>
              </div>
            ) : pendingShortcut ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <Badge variant="secondary" className="px-4 py-2 text-lg font-mono">
                    {formatShortcut(pendingShortcut)}
                  </Badge>
                </div>
                {conflictWarning && (
                  <Alert className="border-yellow-500/30 bg-yellow-500/10">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-700">
                      {conflictWarning}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cancelShortcutChange}>
              Abbrechen
            </Button>
            {pendingShortcut && (
              <Button onClick={saveShortcut}>Speichern</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

