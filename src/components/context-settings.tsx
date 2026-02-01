'use client'

import { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useTauri } from '@/hooks/use-tauri'
import {
  AppWindow,
  AlertCircle,
  Plus,
  Trash2,
  Mail,
  MessageSquare,
  Users,
  Code,
  FileText,
  Globe,
  StickyNote,
  Terminal,
  Monitor,
  HelpCircle,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/** App category from backend */
type AppCategory =
  | 'email'
  | 'chat'
  | 'social'
  | 'code'
  | 'docs'
  | 'browser'
  | 'notes'
  | 'terminal'
  | 'remote_desktop'
  | 'other'

/** App mapping structure */
interface AppMapping {
  name: string
  category: AppCategory
  is_builtin: boolean
}

/** Context configuration from backend */
interface ContextConfig {
  mappings: Record<string, AppMapping>
  title_patterns: unknown[]
  user_mappings: Record<string, AppMapping>
}

/** Detected app context */
interface AppContext {
  app_name: string
  bundle_id?: string
  process_name?: string
  window_title: string
  category: AppCategory
  sub_context?: {
    channel?: string
    recipient?: string
    domain?: string
  }
}

/** Category info with icon and label */
interface CategoryInfo {
  value: AppCategory
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const CATEGORIES: CategoryInfo[] = [
  { value: 'email', label: 'E-Mail', icon: Mail },
  { value: 'chat', label: 'Chat', icon: MessageSquare },
  { value: 'social', label: 'Social Media', icon: Users },
  { value: 'code', label: 'Code Editor', icon: Code },
  { value: 'docs', label: 'Dokument', icon: FileText },
  { value: 'browser', label: 'Browser', icon: Globe },
  { value: 'notes', label: 'Notizen', icon: StickyNote },
  { value: 'terminal', label: 'Terminal', icon: Terminal },
  { value: 'remote_desktop', label: 'Remote Desktop', icon: Monitor },
  { value: 'other', label: 'Andere', icon: HelpCircle },
]

function getCategoryIcon(category: AppCategory) {
  const info = CATEGORIES.find((c) => c.value === category)
  return info?.icon || HelpCircle
}

function getCategoryLabel(category: AppCategory) {
  const info = CATEGORIES.find((c) => c.value === category)
  return info?.label || 'Andere'
}

export function ContextSettings() {
  const { isTauri } = useTauri()
  const [config, setConfig] = useState<ContextConfig | null>(null)
  const [detectedContext, setDetectedContext] = useState<AppContext | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDetecting, setIsDetecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newMapping, setNewMapping] = useState({
    identifier: '',
    name: '',
    category: 'other' as AppCategory,
  })

  // Load config
  const loadConfig = useCallback(async () => {
    if (!isTauri) {
      setIsLoading(false)
      return
    }

    try {
      setError(null)
      const contextConfig = await invoke<ContextConfig>('get_context_config')
      setConfig(contextConfig)
    } catch (err) {
      console.error('Failed to load context config:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Konfiguration')
    } finally {
      setIsLoading(false)
    }
  }, [isTauri])

  // Detect current context
  const detectCurrentContext = useCallback(async () => {
    if (!isTauri) return

    setIsDetecting(true)
    try {
      const ctx = await invoke<AppContext>('detect_context')
      setDetectedContext(ctx)
    } catch (err) {
      console.error('Failed to detect context:', err)
      const errorMsg = err instanceof Error ? err.message : String(err)
      if (errorMsg.includes('Accessibility')) {
        setError('Accessibility-Berechtigung erforderlich fuer App-Erkennung')
      }
    } finally {
      setIsDetecting(false)
    }
  }, [isTauri])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // Add new mapping
  const addMapping = async () => {
    if (!isTauri || !newMapping.identifier || !newMapping.name) return

    try {
      await invoke('set_app_mapping', {
        identifier: newMapping.identifier,
        name: newMapping.name,
        category: newMapping.category,
      })
      await loadConfig()
      setIsAddDialogOpen(false)
      setNewMapping({ identifier: '', name: '', category: 'other' })
    } catch (err) {
      console.error('Failed to add mapping:', err)
      setError('Mapping konnte nicht hinzugefuegt werden')
    }
  }

  // Remove user mapping
  const removeMapping = async (identifier: string) => {
    if (!isTauri) return

    try {
      await invoke('remove_app_mapping', { identifier })
      await loadConfig()
    } catch (err) {
      console.error('Failed to remove mapping:', err)
      setError('Mapping konnte nicht entfernt werden')
    }
  }

  // Update mapping category
  const updateMappingCategory = async (identifier: string, name: string, category: AppCategory) => {
    if (!isTauri) return

    try {
      await invoke('set_app_mapping', { identifier, name, category })
      await loadConfig()
    } catch (err) {
      console.error('Failed to update mapping:', err)
      setError('Mapping konnte nicht aktualisiert werden')
    }
  }

  // Use detected app as new mapping
  const useDetectedApp = () => {
    if (!detectedContext) return
    setNewMapping({
      identifier: detectedContext.bundle_id || detectedContext.process_name || detectedContext.app_name,
      name: detectedContext.app_name,
      category: detectedContext.category,
    })
    setIsAddDialogOpen(true)
  }

  if (!isTauri) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AppWindow className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">App-Erkennung</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-border/50 bg-muted/30">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <AlertDescription className="text-muted-foreground">
              App-Erkennung ist nur in der Desktop-App verfuegbar.
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
            <AppWindow className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">App-Erkennung</span>
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

  // Get user mappings for display
  const userMappings = config?.user_mappings || {}
  const userMappingsList = Object.entries(userMappings)

  // Get a sample of built-in mappings
  const builtinMappings = config?.mappings || {}
  const sampleBuiltins = Object.entries(builtinMappings).slice(0, 8)

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <AppWindow className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">App-Erkennung</span>
        </CardTitle>
        <CardDescription>
          Kontextabhaengige Text-Anpassungen basierend auf der aktiven App
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Current App Detection Test */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2 text-sm font-medium">
            Aktive App testen
          </Label>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={detectCurrentContext}
              disabled={isDetecting}
              className="gap-2"
            >
              {isDetecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              App erkennen
            </Button>
            {detectedContext && (
              <Button
                variant="ghost"
                size="sm"
                onClick={useDetectedApp}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Als Mapping hinzufuegen
              </Button>
            )}
          </div>

          {detectedContext && (
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2">
              <div className="flex items-center gap-2">
                {(() => {
                  const Icon = getCategoryIcon(detectedContext.category)
                  return <Icon className="h-5 w-5 text-muted-foreground" />
                })()}
                <span className="font-medium">{detectedContext.app_name}</span>
                <Badge variant="secondary" className="text-xs">
                  {getCategoryLabel(detectedContext.category)}
                </Badge>
              </div>
              {detectedContext.window_title && (
                <p className="text-xs text-muted-foreground truncate">
                  Fenster: {detectedContext.window_title}
                </p>
              )}
              {detectedContext.bundle_id && (
                <p className="text-xs text-muted-foreground font-mono">
                  ID: {detectedContext.bundle_id}
                </p>
              )}
              {detectedContext.sub_context?.channel && (
                <p className="text-xs text-muted-foreground">
                  Channel: {detectedContext.sub_context.channel}
                </p>
              )}
            </div>
          )}
        </div>

        {/* User Mappings */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Eigene Zuordnungen</Label>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Hinzufuegen
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>App-Zuordnung hinzufuegen</DialogTitle>
                  <DialogDescription>
                    Ordnen Sie eine unbekannte App einer Kategorie zu
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="app-identifier">App-Identifier (Bundle-ID oder Prozess-Name)</Label>
                    <Input
                      id="app-identifier"
                      value={newMapping.identifier}
                      onChange={(e) => setNewMapping({ ...newMapping, identifier: e.target.value })}
                      placeholder="z.B. com.example.app"
                    />
                    <p className="text-xs text-muted-foreground">
                      Nutzen Sie &quot;App erkennen&quot; um die ID zu finden
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="app-name">Anzeigename</Label>
                    <Input
                      id="app-name"
                      value={newMapping.name}
                      onChange={(e) => setNewMapping({ ...newMapping, name: e.target.value })}
                      placeholder="z.B. Meine App"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Kategorie</Label>
                    <Select
                      value={newMapping.category}
                      onValueChange={(value) => setNewMapping({ ...newMapping, category: value as AppCategory })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((cat) => {
                          const Icon = cat.icon
                          return (
                            <SelectItem key={cat.value} value={cat.value}>
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4" />
                                <span>{cat.label}</span>
                              </div>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => setIsAddDialogOpen(false)}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    onClick={addMapping}
                    disabled={!newMapping.identifier || !newMapping.name}
                  >
                    Hinzufuegen
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {userMappingsList.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/50 bg-muted/10 p-6 text-center">
              <HelpCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Keine eigenen Zuordnungen. Fuegen Sie Apps hinzu, die nicht automatisch erkannt werden.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {userMappingsList.map(([identifier, mapping]) => {
                const Icon = getCategoryIcon(mapping.category)
                return (
                  <div
                    key={identifier}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-background p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{mapping.name}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {identifier}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={mapping.category}
                        onValueChange={(value) =>
                          updateMappingCategory(identifier, mapping.name, value as AppCategory)
                        }
                      >
                        <SelectTrigger className="w-[140px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMapping(identifier)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Built-in Mappings (collapsed) */}
        <div className="space-y-3">
          <Label className="text-sm font-medium text-muted-foreground">
            Vordefinierte Apps ({Object.keys(builtinMappings).length})
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {sampleBuiltins.map(([identifier, mapping]) => {
              const Icon = getCategoryIcon(mapping.category)
              return (
                <div
                  key={identifier}
                  className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2"
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs truncate">{mapping.name}</span>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            + {Math.max(0, Object.keys(builtinMappings).length - 8)} weitere Apps werden automatisch erkannt
          </p>
        </div>

        {/* Info Box */}
        <div className="rounded-lg bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Die App-Erkennung analysiert die aktuell aktive Anwendung beim Hotkey-Druck.
            Je nach Kategorie (E-Mail, Chat, etc.) kann die Transkription optimiert werden.
            Accessibility-Berechtigung erforderlich fuer macOS.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
