'use client'

import { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useTauri } from '@/hooks/use-tauri'
import {
  MessageCircle,
  AlertCircle,
  Smile,
  SplitSquareVertical,
  AtSign,
  Loader2,
} from 'lucide-react'

/** Chat context settings from backend */
interface ChatContextSettings {
  enabled: boolean
  add_emojis: boolean
  max_message_length: number
  split_long_messages: boolean
  format_mentions: boolean
}

const DEFAULT_SETTINGS: ChatContextSettings = {
  enabled: true,
  add_emojis: false,
  max_message_length: 200,
  split_long_messages: true,
  format_mentions: true,
}

export function ChatSettings() {
  const { isTauri } = useTauri()
  const [settings, setSettings] = useState<ChatContextSettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load settings
  const loadSettings = useCallback(async () => {
    if (!isTauri) {
      setIsLoading(false)
      return
    }

    try {
      setError(null)
      const chatSettings = await invoke<ChatContextSettings>('get_chat_settings')
      setSettings(chatSettings)
    } catch (err) {
      console.error('Failed to load chat settings:', err)
      // Use defaults if backend command not yet implemented
      setSettings(DEFAULT_SETTINGS)
    } finally {
      setIsLoading(false)
    }
  }, [isTauri])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Update settings
  const updateSettings = async (newSettings: Partial<ChatContextSettings>) => {
    if (!isTauri) return

    const updated = { ...settings, ...newSettings }
    setSettings(updated)
    setIsSaving(true)

    try {
      await invoke('set_chat_settings', { settings: updated })
      setError(null)
    } catch (err) {
      console.error('Failed to update chat settings:', err)
      setError('Einstellungen konnten nicht gespeichert werden')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isTauri) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Chat Einstellungen</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-border/50 bg-muted/30">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <AlertDescription className="text-muted-foreground">
              Chat Einstellungen sind nur in der Desktop-App verfügbar.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Chat Einstellungen</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Chat Einstellungen</span>
          {isSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          Kontextspezifische Formatierung für Chat-Anwendungen (Slack, Teams, Discord, etc.)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center space-x-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
              <MessageCircle className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="chat-mode-enabled" className="text-sm font-medium">
                Chat-Modus aktiv
              </Label>
              <p className="text-xs text-muted-foreground">
                Lockere Formatierung in Chat-Apps
              </p>
            </div>
          </div>
          <Switch
            id="chat-mode-enabled"
            checked={settings.enabled}
            onCheckedChange={(checked) => updateSettings({ enabled: checked })}
            className="data-[state=checked]:bg-primary"
          />
        </div>

        {settings.enabled && (
          <>
            {/* Add Emojis */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center space-x-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
                  <Smile className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="space-y-0.5">
                  <Label htmlFor="add-emojis" className="text-sm font-medium">
                    Emojis hinzufügen
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Passende Emojis am Nachrichtenende
                  </p>
                </div>
              </div>
              <Switch
                id="add-emojis"
                checked={settings.add_emojis}
                onCheckedChange={(checked) => updateSettings({ add_emojis: checked })}
              />
            </div>

            {/* Format Mentions */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center space-x-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
                  <AtSign className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="space-y-0.5">
                  <Label htmlFor="format-mentions" className="text-sm font-medium">
                    Mentions formatieren
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    &quot;at Thomas&quot; → &quot;@Thomas&quot;
                  </p>
                </div>
              </div>
              <Switch
                id="format-mentions"
                checked={settings.format_mentions}
                onCheckedChange={(checked) => updateSettings({ format_mentions: checked })}
              />
            </div>

            {/* Split Long Messages */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center space-x-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
                  <SplitSquareVertical className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="space-y-0.5">
                  <Label htmlFor="split-messages" className="text-sm font-medium">
                    Lange Nachrichten aufteilen
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Bei Themenwechsel neue Nachricht beginnen
                  </p>
                </div>
              </div>
              <Switch
                id="split-messages"
                checked={settings.split_long_messages}
                onCheckedChange={(checked) => updateSettings({ split_long_messages: checked })}
              />
            </div>

            {/* Max Message Length */}
            {settings.split_long_messages && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    Max. Zeichen pro Nachricht
                  </Label>
                  <span className="text-sm text-muted-foreground">
                    {settings.max_message_length} Zeichen
                  </span>
                </div>
                <Slider
                  value={[settings.max_message_length]}
                  onValueChange={([value]) => updateSettings({ max_message_length: value })}
                  min={50}
                  max={500}
                  step={10}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Nachrichten werden bei dieser Länge in neue Blöcke aufgeteilt
                </p>
              </div>
            )}

            {/* Preview */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Vorschau</Label>
              <div className="rounded-lg border border-border/50 bg-muted/20 p-4 font-mono text-sm space-y-2">
                <div className="text-muted-foreground">
                  <span className="font-medium">Input:</span> &quot;Sehr geehrter Thomas ich wollte mal nachfragen...&quot;
                </div>
                <div className="border-t border-border/30 pt-2">
                  <span className="font-medium text-muted-foreground">Output:</span>
                  <div className="mt-1">
                    Hey Thomas, hast du die Präsentation fertig?
                    {settings.add_emojis && ' 👋'}
                  </div>
                </div>
              </div>
            </div>

            {/* Transformations Info */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Transformationen</Label>
              <div className="rounded-lg bg-muted/20 p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">&quot;Sehr geehrter Thomas&quot;</span>
                  <span>→ &quot;Hey Thomas&quot;</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">&quot;Mit freundlichen Grüßen&quot;</span>
                  <span>→ <em>(entfernt)</em></span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">&quot;Viele Grüße&quot; / &quot;LG&quot;</span>
                  <span>→ <em>(entfernt)</em></span>
                </div>
                {settings.format_mentions && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">&quot;at Thomas&quot;</span>
                    <span>→ &quot;@Thomas&quot;</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">&quot;Danke&quot; am Ende</span>
                  <span>→ <em>(bleibt)</em></span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Info Box */}
        <div className="rounded-lg bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Der Chat-Modus wird automatisch aktiviert wenn Sie in einer Chat-App diktieren
            (Slack, Teams, Discord, WhatsApp, Telegram, etc.). Der Text wird locker und
            informell formatiert, ohne formelle Anreden oder Grußformeln.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
