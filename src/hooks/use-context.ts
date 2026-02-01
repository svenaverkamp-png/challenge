'use client'

import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { toast } from 'sonner'
import { useTauri } from './use-tauri'

/**
 * App category for context-aware processing
 * Matches the Rust AppCategory enum
 */
export type AppCategory =
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

/**
 * Sub-context extracted from window title
 */
export interface SubContext {
  channel?: string      // Chat channel (e.g., "#engineering")
  recipient?: string    // Email recipient (e.g., "thomas@example.com")
  domain?: string       // Web domain (e.g., "gmail.com")
}

/**
 * Detected application context
 * Matches the Rust AppContext struct
 */
export interface AppContext {
  app_name: string           // Display name (e.g., "Slack")
  bundle_id?: string         // macOS bundle ID
  process_name?: string      // Windows process name
  window_title: string       // Window title
  category: AppCategory      // Detected category
  sub_context?: SubContext   // Optional sub-context
}

/**
 * App mapping for custom categorization
 */
export interface AppMapping {
  name: string
  category: AppCategory
  is_builtin: boolean
}

/**
 * Context configuration
 */
export interface ContextConfig {
  mappings: Record<string, AppMapping>
  title_patterns: Array<{
    pattern: string
    category: AppCategory
    extract_domain: boolean
    extract_channel: boolean
  }>
  user_mappings: Record<string, AppMapping>
}

/**
 * Category display info
 */
export interface CategoryInfo {
  id: AppCategory
  name: string
}

/**
 * All available categories with German labels
 */
export const APP_CATEGORIES: CategoryInfo[] = [
  { id: 'email', name: 'E-Mail' },
  { id: 'chat', name: 'Chat' },
  { id: 'social', name: 'Social Media' },
  { id: 'code', name: 'Code Editor' },
  { id: 'docs', name: 'Dokument' },
  { id: 'browser', name: 'Browser' },
  { id: 'notes', name: 'Notizen' },
  { id: 'terminal', name: 'Terminal' },
  { id: 'remote_desktop', name: 'Remote Desktop' },
  { id: 'other', name: 'Andere' },
]

/**
 * Get display name for a category
 */
export function getCategoryDisplayName(category: AppCategory): string {
  const info = APP_CATEGORIES.find(c => c.id === category)
  return info?.name ?? category
}

/**
 * Hook to detect and manage application context (PROJ-8)
 *
 * This hook provides:
 * - Current detected context from hotkey events
 * - Manual context detection
 * - User-defined app mappings management
 */
export function useContext() {
  const { isTauri } = useTauri()

  // Current detected context (set when hotkey is pressed)
  const [currentContext, setCurrentContext] = useState<AppContext | null>(null)

  // Loading state for async operations
  const [isLoading, setIsLoading] = useState(false)

  // Permission error (if accessibility permission is needed)
  const [permissionError, setPermissionError] = useState<string | null>(null)

  // User-defined mappings
  const [userMappings, setUserMappings] = useState<Record<string, AppMapping>>({})

  /**
   * Manually detect the current context
   * Use this when you need to detect context outside of hotkey press
   */
  const detectContext = useCallback(async (): Promise<AppContext | null> => {
    if (!isTauri) return null

    setIsLoading(true)
    setPermissionError(null)

    try {
      const context = await invoke<AppContext>('detect_context')
      setCurrentContext(context)
      return context
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)

      // Check for accessibility permission error
      if (errorMsg.includes('Accessibility permission')) {
        setPermissionError(errorMsg)
      }

      console.error('Failed to detect context:', error)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [isTauri])

  /**
   * Load context configuration (including user mappings)
   */
  const loadConfig = useCallback(async (): Promise<ContextConfig | null> => {
    if (!isTauri) return null

    try {
      const config = await invoke<ContextConfig>('get_context_config')
      setUserMappings(config.user_mappings || {})
      return config
    } catch (error) {
      console.error('Failed to load context config:', error)
      return null
    }
  }, [isTauri])

  /**
   * Add or update a user-defined app mapping
   */
  const setAppMapping = useCallback(async (
    identifier: string,
    name: string,
    category: AppCategory
  ): Promise<boolean> => {
    if (!isTauri) return false

    try {
      await invoke('set_app_mapping', { identifier, name, category })

      // Update local state
      setUserMappings(prev => ({
        ...prev,
        [identifier]: { name, category, is_builtin: false }
      }))

      return true
    } catch (error) {
      console.error('Failed to set app mapping:', error)
      return false
    }
  }, [isTauri])

  /**
   * Remove a user-defined app mapping
   */
  const removeAppMapping = useCallback(async (identifier: string): Promise<boolean> => {
    if (!isTauri) return false

    try {
      await invoke('remove_app_mapping', { identifier })

      // Update local state
      setUserMappings(prev => {
        const next = { ...prev }
        delete next[identifier]
        return next
      })

      return true
    } catch (error) {
      console.error('Failed to remove app mapping:', error)
      return false
    }
  }, [isTauri])

  /**
   * Request accessibility permission (opens System Preferences)
   */
  const requestAccessibilityPermission = useCallback(async (): Promise<void> => {
    if (!isTauri) return

    try {
      await invoke('request_accessibility_permission')
    } catch (error) {
      console.error('Failed to request accessibility permission:', error)
    }
  }, [isTauri])

  /**
   * Clear the current context
   */
  const clearContext = useCallback(() => {
    setCurrentContext(null)
  }, [])

  // Listen to context events from backend
  useEffect(() => {
    if (!isTauri) return

    const unlistenPromises: Promise<UnlistenFn>[] = []

    // Listen for context-detected events (emitted with hotkey press)
    unlistenPromises.push(
      listen<AppContext>('context-detected', (event) => {
        setCurrentContext(event.payload)
        setPermissionError(null)
      })
    )

    // Listen for permission required events
    unlistenPromises.push(
      listen<string>('context-permission-required', (event) => {
        setPermissionError(event.payload)
      })
    )

    // Listen for unknown app events (PROJ-8 BUG-1 fix)
    unlistenPromises.push(
      listen<string>('context-unknown-app', (event) => {
        toast.info('Unbekannte App erkannt', {
          description: `"${event.payload}" - Standard-Modus wird verwendet. App kann in Einstellungen zugeordnet werden.`,
          duration: 4000,
        })
      })
    )

    // Load initial config
    loadConfig()

    // Cleanup
    return () => {
      unlistenPromises.forEach(promise => {
        promise.then(unlisten => unlisten())
      })
    }
  }, [isTauri, loadConfig])

  return {
    // State
    currentContext,
    isLoading,
    permissionError,
    userMappings,

    // Actions
    detectContext,
    loadConfig,
    setAppMapping,
    removeAppMapping,
    requestAccessibilityPermission,
    clearContext,

    // Helpers
    getCategoryDisplayName,
  }
}

/**
 * Hook to get context info for display
 * Simplified version for UI components that just need to show current context
 */
export function useContextDisplay() {
  const { currentContext } = useContext()

  const displayText = currentContext
    ? `${currentContext.app_name} (${getCategoryDisplayName(currentContext.category)})`
    : null

  const categoryIcon = currentContext
    ? getCategoryIcon(currentContext.category)
    : null

  return {
    context: currentContext,
    displayText,
    categoryIcon,
    appName: currentContext?.app_name,
    category: currentContext?.category,
    windowTitle: currentContext?.window_title,
    subContext: currentContext?.sub_context,
  }
}

/**
 * Get an emoji icon for a category
 */
export function getCategoryIcon(category: AppCategory): string {
  switch (category) {
    case 'email': return '📧'
    case 'chat': return '💬'
    case 'social': return '🌐'
    case 'code': return '💻'
    case 'docs': return '📄'
    case 'browser': return '🌍'
    case 'notes': return '📝'
    case 'terminal': return '⌨️'
    case 'remote_desktop': return '🖥️'
    case 'other': return '📱'
    default: return '📱'
  }
}
