'use client'

import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { save, open } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs'
import { useRouter } from 'next/navigation'
import { useTauri } from '@/hooks/use-tauri'
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { showSuccess, showErrorByCode } from '@/lib/app-error'
import {
  Settings,
  Keyboard,
  Mic,
  Languages,
  Sparkles,
  AppWindow,
  Shield,
  ArrowLeft,
  Download,
  Upload,
  RotateCcw,
  X,
  FolderDown,
  FolderUp,
} from 'lucide-react'

// Settings Components
import { HotkeySettings } from '@/components/hotkey-settings'
import { MicrophoneSettings } from '@/components/microphone-settings'
import { WhisperSettings } from '@/components/whisper-settings'
import { OllamaSettings } from '@/components/ollama-settings'
import { TextInsertSettings } from '@/components/text-insert-settings'
import { ContextSettings } from '@/components/context-settings'
import { EmailSettings } from '@/components/email-settings'
import { ChatSettings } from '@/components/chat-settings'
import { GeneralSettings } from '@/components/general-settings'
import { PrivacySettings } from '@/components/privacy-settings'

/** Navigation categories for the sidebar */
const CATEGORIES = [
  { id: 'general', label: 'Allgemein', icon: Settings },
  { id: 'hotkey', label: 'Hotkey', icon: Keyboard },
  { id: 'audio', label: 'Audio', icon: Mic },
  { id: 'transcription', label: 'Transkription', icon: Languages },
  { id: 'ai', label: 'AI-Verarbeitung', icon: Sparkles },
  { id: 'context', label: 'Kontext', icon: AppWindow },
  { id: 'privacy', label: 'Datenschutz', icon: Shield },
] as const

type CategoryId = (typeof CATEGORIES)[number]['id']

export default function SettingsPage() {
  const router = useRouter()
  const { isTauri } = useTauri()
  const [activeCategory, setActiveCategory] = useState<CategoryId>('general')
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  // Handle back navigation
  const handleBack = useCallback(() => {
    router.push('/')
  }, [router])

  // Handle escape key to close settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleBack()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleBack])

  // Export settings - save to file via dialog
  const handleExport = async () => {
    if (!isTauri) return

    setIsExporting(true)
    try {
      const config = await invoke<string>('export_all_settings')

      // Show save dialog
      const filePath = await save({
        title: 'Einstellungen exportieren',
        defaultPath: 'evervoice-settings.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })

      if (filePath) {
        await writeTextFile(filePath, config)
        showSuccess('Einstellungen exportiert', `Gespeichert unter: ${filePath}`)
      }
    } catch (err) {
      console.error('Export failed:', err)
      showErrorByCode('ERR_EXPORT', 'settings', {
        details: 'Die Einstellungen konnten nicht exportiert werden.',
      })
    } finally {
      setIsExporting(false)
    }
  }

  // Import settings - read from file via dialog
  const handleImport = async () => {
    if (!isTauri) return

    setIsImporting(true)
    try {
      // Show open dialog
      const filePath = await open({
        title: 'Einstellungen importieren',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        multiple: false,
      })

      if (filePath && typeof filePath === 'string') {
        const content = await readTextFile(filePath)

        // Validate JSON
        const parsed = JSON.parse(content)
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid JSON format')
        }

        await invoke('import_all_settings', { config: content })
        showSuccess('Einstellungen importiert', 'Die Konfiguration wurde geladen. Einige Aenderungen erfordern einen Neustart.')

        // Reload the page to reflect new settings
        window.location.reload()
      }
    } catch (err) {
      console.error('Import failed:', err)
      showErrorByCode('ERR_IMPORT', 'settings', {
        details: 'Bitte waehlen Sie eine gueltige JSON-Konfigurationsdatei.',
      })
    } finally {
      setIsImporting(false)
    }
  }

  // Reset category to defaults
  const handleResetCategory = async (category: CategoryId) => {
    if (!isTauri) return

    try {
      await invoke('reset_category_settings', { category })
      showSuccess('Einstellungen zurueckgesetzt', `${CATEGORIES.find(c => c.id === category)?.label}-Einstellungen wurden auf Standard zurueckgesetzt.`)
      // Reload to reflect changes
      window.location.reload()
    } catch (err) {
      console.error('Reset failed:', err)
      showErrorByCode('ERR_SETTINGS_RESET', 'settings')
    }
  }

  // Render content for active category
  const renderContent = () => {
    switch (activeCategory) {
      case 'general':
        return <GeneralSettings />
      case 'hotkey':
        return <HotkeySettings />
      case 'audio':
        return <MicrophoneSettings />
      case 'transcription':
        return <WhisperSettings />
      case 'ai':
        return (
          <div className="space-y-6">
            <OllamaSettings />
            <TextInsertSettings />
          </div>
        )
      case 'context':
        return (
          <div className="space-y-6">
            <ContextSettings />
            <EmailSettings />
            <ChatSettings />
          </div>
        )
      case 'privacy':
        return <PrivacySettings />
      default:
        return null
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full">
        {/* Sidebar */}
        <Sidebar collapsible="none" className="border-r">
          <SidebarHeader className="border-b px-4 py-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBack}
                className="h-8 w-8"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-lg font-semibold">Einstellungen</h1>
                <p className="text-xs text-muted-foreground">EverVoice</p>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarMenu className="px-2 py-4">
              {CATEGORIES.map((category) => {
                const Icon = category.icon
                return (
                  <SidebarMenuItem key={category.id}>
                    <SidebarMenuButton
                      isActive={activeCategory === category.id}
                      onClick={() => setActiveCategory(category.id)}
                      className="gap-3"
                    >
                      <Icon className="h-4 w-4" />
                      <span>{category.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>

            {/* Export/Import at bottom */}
            <div className="mt-auto p-4 space-y-2">
              <Separator className="mb-4" />
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={handleExport}
                disabled={!isTauri || isExporting}
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'Exportiere...' : 'Exportieren'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={handleImport}
                disabled={!isTauri || isImporting}
              >
                <Upload className="h-4 w-4" />
                {isImporting ? 'Importiere...' : 'Importieren'}
              </Button>
            </div>
          </SidebarContent>
        </Sidebar>

        {/* Main Content */}
        <SidebarInset>
          <ScrollArea className="h-screen">
            <div className="p-6 md:p-8 max-w-2xl">
              {/* Category Header */}
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {(() => {
                    const category = CATEGORIES.find((c) => c.id === activeCategory)
                    const Icon = category?.icon || Settings
                    return (
                      <>
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h2 className="text-xl font-semibold">
                            {category?.label}
                          </h2>
                        </div>
                      </>
                    )
                  })()}
                </div>

                {/* Reset and Close Buttons */}
                <div className="flex items-center gap-2">
                  {isTauri && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-muted-foreground hover:text-foreground"
                      onClick={() => handleResetCategory(activeCategory)}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Zuruecksetzen
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={handleBack}
                    title="Schliessen (Esc)"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Settings Content */}
              {renderContent()}

              {/* Bottom padding for scroll */}
              <div className="h-20" />
            </div>
          </ScrollArea>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
