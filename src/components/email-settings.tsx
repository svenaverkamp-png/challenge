'use client'

import { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useTauri } from '@/hooks/use-tauri'
import {
  Mail,
  AlertCircle,
  User,
  PenLine,
  Building2,
  Loader2,
} from 'lucide-react'

/** Formality level for email text */
type FormalityLevel = 'casual' | 'neutral' | 'formal'

/** Email context settings from backend */
interface EmailContextSettings {
  enabled: boolean
  formality_level: FormalityLevel
  default_greeting: string
  user_name: string
  auto_add_greeting: boolean
  signature?: string
}

const DEFAULT_SETTINGS: EmailContextSettings = {
  enabled: true,
  formality_level: 'neutral',
  default_greeting: 'Viele Grüße',
  user_name: '',
  auto_add_greeting: true,
  signature: undefined,
}

/** Formality level options */
const FORMALITY_LEVELS = [
  { value: 'casual', label: 'Locker', description: 'Freundlicher, persönlicher Ton' },
  { value: 'neutral', label: 'Neutral', description: 'Standard-Geschäftskorrespondenz' },
  { value: 'formal', label: 'Formell', description: 'Sehr höflich und professionell' },
]

/** Common greeting options */
const GREETING_OPTIONS = [
  'Viele Grüße',
  'Mit freundlichen Grüßen',
  'Beste Grüße',
  'Liebe Grüße',
  'Herzliche Grüße',
  'Freundliche Grüße',
]

export function EmailSettings() {
  const { isTauri } = useTauri()
  const [settings, setSettings] = useState<EmailContextSettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSignature, setShowSignature] = useState(false)

  // Load settings
  const loadSettings = useCallback(async () => {
    if (!isTauri) {
      setIsLoading(false)
      return
    }

    try {
      setError(null)
      const emailSettings = await invoke<EmailContextSettings>('get_email_settings')
      setSettings(emailSettings)
      setShowSignature(!!emailSettings.signature)
    } catch (err) {
      console.error('Failed to load email settings:', err)
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
  const updateSettings = async (newSettings: Partial<EmailContextSettings>) => {
    if (!isTauri) return

    const updated = { ...settings, ...newSettings }
    setSettings(updated)
    setIsSaving(true)

    try {
      await invoke('set_email_settings', { settings: updated })
      setError(null)
    } catch (err) {
      console.error('Failed to update email settings:', err)
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
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">E-Mail Einstellungen</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-border/50 bg-muted/30">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <AlertDescription className="text-muted-foreground">
              E-Mail Einstellungen sind nur in der Desktop-App verfügbar.
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
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">E-Mail Einstellungen</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">E-Mail Einstellungen</span>
          {isSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          Kontextspezifische Formatierung für E-Mail-Anwendungen
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
              <Mail className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="email-mode-enabled" className="text-sm font-medium">
                E-Mail-Modus aktiv
              </Label>
              <p className="text-xs text-muted-foreground">
                Formelle Formatierung in E-Mail-Apps
              </p>
            </div>
          </div>
          <Switch
            id="email-mode-enabled"
            checked={settings.enabled}
            onCheckedChange={(checked) => updateSettings({ enabled: checked })}
            className="data-[state=checked]:bg-primary"
          />
        </div>

        {settings.enabled && (
          <>
            {/* Formality Level */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <PenLine className="h-4 w-4 text-muted-foreground" />
                Formalitäts-Level
              </Label>
              <Select
                value={settings.formality_level}
                onValueChange={(value) => updateSettings({ formality_level: value as FormalityLevel })}
              >
                <SelectTrigger>
                  <SelectValue>
                    {FORMALITY_LEVELS.find((f) => f.value === settings.formality_level)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {FORMALITY_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      <div className="flex flex-col">
                        <span>{level.label}</span>
                        <span className="text-xs text-muted-foreground">{level.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Bestimmt wie formell der Text angepasst wird
              </p>
            </div>

            {/* User Name */}
            <div className="space-y-3">
              <Label htmlFor="user-name" className="flex items-center gap-2 text-sm font-medium">
                <User className="h-4 w-4 text-muted-foreground" />
                Name für Signatur
              </Label>
              <Input
                id="user-name"
                value={settings.user_name}
                onChange={(e) => updateSettings({ user_name: e.target.value })}
                placeholder="z.B. Max Mustermann"
              />
              <p className="text-xs text-muted-foreground">
                Wird nach der Grußformel eingefügt
              </p>
            </div>

            {/* Default Greeting */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Standard-Grußformel</Label>
              <Select
                value={settings.default_greeting}
                onValueChange={(value) => updateSettings({ default_greeting: value })}
              >
                <SelectTrigger>
                  <SelectValue>{settings.default_greeting}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {GREETING_OPTIONS.map((greeting) => (
                    <SelectItem key={greeting} value={greeting}>
                      {greeting}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Auto-Add Greeting */}
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label htmlFor="auto-greeting" className="text-sm font-medium">
                  Auto-Grußformel
                </Label>
                <p className="text-xs text-muted-foreground">
                  Grußformel automatisch anfügen wenn keine diktiert
                </p>
              </div>
              <Switch
                id="auto-greeting"
                checked={settings.auto_add_greeting}
                onCheckedChange={(checked) => updateSettings({ auto_add_greeting: checked })}
              />
            </div>

            {/* Extended Signature (Optional) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Erweiterte Signatur
                </Label>
                <Switch
                  checked={showSignature}
                  onCheckedChange={(checked) => {
                    setShowSignature(checked)
                    if (!checked) {
                      updateSettings({ signature: undefined })
                    }
                  }}
                />
              </div>

              {showSignature && (
                <div className="space-y-2">
                  <Textarea
                    value={settings.signature || ''}
                    onChange={(e) => updateSettings({ signature: e.target.value || undefined })}
                    placeholder="z.B.&#10;Firma GmbH&#10;Tel: +49 123 456789"
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional: Firma, Telefon, etc. (wird nach dem Namen eingefügt)
                  </p>
                </div>
              )}
            </div>

            {/* Preview */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Vorschau</Label>
              <div className="rounded-lg border border-border/50 bg-muted/20 p-4 font-mono text-sm whitespace-pre-wrap">
                <span className="text-muted-foreground">Hallo [Empfänger],</span>
                {'\n\n'}
                <span className="text-muted-foreground italic">[Ihr diktierter Text...]</span>
                {'\n\n'}
                <span>{settings.default_greeting},</span>
                {settings.user_name && (
                  <>
                    {'\n'}
                    <span>{settings.user_name}</span>
                  </>
                )}
                {showSignature && settings.signature && (
                  <>
                    {'\n'}
                    <span className="text-muted-foreground">{settings.signature}</span>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* Info Box */}
        <div className="rounded-lg bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Der E-Mail-Modus wird automatisch aktiviert wenn Sie in einer E-Mail-App diktieren
            (Apple Mail, Outlook, Gmail, etc.). Der Text wird formell angepasst und
            mit Anrede/Grußformel strukturiert.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
