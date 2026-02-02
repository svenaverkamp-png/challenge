'use client'

import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { useTauri } from './use-tauri'
import { showErrorByCode, showInfo, showSuccess } from '@/lib/app-error'

/** Text insert method */
export type InsertMethod = 'Auto' | 'Clipboard' | 'Keyboard'

/** Text insert settings from backend */
export interface TextInsertSettings {
  insert_method: InsertMethod
  clipboard_restore: boolean
  type_speed: number
  bulk_threshold: number
  enabled: boolean
}

/** Result of text insert operation */
export interface TextInsertResult {
  success: boolean
  method_used: string
  chars_inserted: number
  error: string | null
  in_clipboard: boolean
}

interface UseTextInsertReturn {
  /** Current text insert settings */
  settings: TextInsertSettings
  /** Whether an insert operation is in progress */
  isInserting: boolean
  /** Last insert result */
  lastResult: TextInsertResult | null
  /** Update text insert settings */
  updateSettings: (settings: Partial<TextInsertSettings>) => Promise<void>
  /**
   * Insert text into active text field
   * @param text - The text to insert
   * @param targetBundleId - Optional bundle ID of the app to focus before inserting (PROJ-6 FIX)
   *                         This ensures text goes to the original app, not where the user is now
   */
  insertText: (text: string, targetBundleId?: string) => Promise<TextInsertResult | null>
  /** Copy text to clipboard only (without paste) */
  copyToClipboard: (text: string) => Promise<boolean>
  /** Get display name for insert method */
  getMethodDisplayName: (method: InsertMethod) => string
}

const DEFAULT_SETTINGS: TextInsertSettings = {
  insert_method: 'Auto',
  clipboard_restore: true,
  type_speed: 10,
  bulk_threshold: 1000,
  enabled: true,
}

/** Get human-readable insert method name */
export function getMethodDisplayName(method: InsertMethod): string {
  switch (method) {
    case 'Auto':
      return 'Automatisch (empfohlen)'
    case 'Clipboard':
      return 'Zwischenablage + Einfuegen'
    case 'Keyboard':
      return 'Tastatur-Simulation'
    default:
      return method
  }
}

/**
 * Hook to manage text insertion via Tauri backend (PROJ-6)
 *
 * Automatically inserts transcribed text into the active text field.
 * Uses clipboard + paste as the primary method, with keyboard simulation as fallback.
 */
export function useTextInsert(): UseTextInsertReturn {
  const { isTauri } = useTauri()
  const [settings, setSettings] = useState<TextInsertSettings>(DEFAULT_SETTINGS)
  const [isInserting, setIsInserting] = useState(false)
  const [lastResult, setLastResult] = useState<TextInsertResult | null>(null)

  // Load initial settings
  useEffect(() => {
    if (!isTauri) return

    const loadSettings = async () => {
      try {
        const textInsertSettings = await invoke<TextInsertSettings>('get_text_insert_settings')
        setSettings(textInsertSettings)
      } catch (err) {
        console.error('Failed to load text insert settings:', err)
      }
    }

    loadSettings()
  }, [isTauri])

  // Listen for Tauri events
  useEffect(() => {
    if (!isTauri) return

    const unlisteners: UnlistenFn[] = []

    const setupListeners = async () => {
      // Insert success
      const unlistenSuccess = await listen<TextInsertResult>(
        'text-insert-success',
        (event) => {
          setIsInserting(false)
          setLastResult(event.payload)
          // Don't show toast for success - it's the expected behavior
        }
      )
      unlisteners.push(unlistenSuccess)

      // Clipboard fallback (paste failed, but text is in clipboard)
      const unlistenClipboardFallback = await listen<TextInsertResult>(
        'text-insert-clipboard-fallback',
        (event) => {
          setIsInserting(false)
          setLastResult(event.payload)
          showInfo('Text in Zwischenablage kopiert', 'Direkte Eingabe nicht moeglich. Nutze Cmd+V zum Einfuegen.')
        }
      )
      unlisteners.push(unlistenClipboardFallback)

      // Clipboard only (insert disabled in settings)
      const unlistenClipboardOnly = await listen<string>(
        'text-insert-clipboard-only',
        () => {
          setIsInserting(false)
          showSuccess('Text in Zwischenablage kopiert', 'Nutze Cmd+V zum Einfuegen.')
        }
      )
      unlisteners.push(unlistenClipboardOnly)

      // Insert error
      const unlistenError = await listen<TextInsertResult>(
        'text-insert-error',
        (event) => {
          setIsInserting(false)
          setLastResult(event.payload)
          showErrorByCode('ERR_INSERT_FAILED', 'text-insert', {
            details: event.payload.error || 'Unbekannter Fehler',
          })
        }
      )
      unlisteners.push(unlistenError)
    }

    setupListeners()

    return () => {
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [isTauri])

  // Update settings
  const updateSettings = useCallback(
    async (newSettings: Partial<TextInsertSettings>) => {
      if (!isTauri) return

      const updated = { ...settings, ...newSettings }

      try {
        await invoke('set_text_insert_settings', { settings: updated })
        setSettings(updated)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Einstellungen konnten nicht gespeichert werden'
        showErrorByCode('ERR_UNKNOWN', 'text-insert', { details: message })
        throw err
      }
    },
    [isTauri, settings]
  )

  // Insert text into active text field
  // PROJ-6 FIX: Added targetBundleId parameter to focus the original app before inserting
  const insertText = useCallback(
    async (text: string, targetBundleId?: string): Promise<TextInsertResult | null> => {
      if (!isTauri) {
        // Web fallback: use browser clipboard API
        try {
          await navigator.clipboard.writeText(text)
          showSuccess('Text in Zwischenablage kopiert', 'Nutze Cmd/Ctrl+V zum Einfuegen.')
          return {
            success: true,
            method_used: 'browser_clipboard',
            chars_inserted: text.length,
            error: null,
            in_clipboard: true,
          }
        } catch (err) {
          console.error('Browser clipboard failed:', err)
          return {
            success: false,
            method_used: 'none',
            chars_inserted: 0,
            error: 'Browser clipboard not available',
            in_clipboard: false,
          }
        }
      }

      try {
        setIsInserting(true)
        // PROJ-6 FIX: Pass targetBundleId to focus the original app before inserting
        // This ensures text goes to the app where the user was when they pressed the hotkey
        const result = await invoke<TextInsertResult>('insert_text', {
          text,
          targetBundleId: targetBundleId || null,
        })
        setLastResult(result)
        setIsInserting(false)
        return result
      } catch (err) {
        setIsInserting(false)
        const message = err instanceof Error ? err.message : 'Text konnte nicht eingefuegt werden'
        showErrorByCode('ERR_INSERT_FAILED', 'text-insert', { details: message })
        return null
      }
    },
    [isTauri]
  )

  // Copy to clipboard only (without paste)
  const copyToClipboard = useCallback(
    async (text: string): Promise<boolean> => {
      if (!isTauri) {
        try {
          await navigator.clipboard.writeText(text)
          return true
        } catch {
          return false
        }
      }

      try {
        await invoke('copy_text_to_clipboard', { text })
        return true
      } catch (err) {
        console.error('Copy to clipboard failed:', err)
        return false
      }
    },
    [isTauri]
  )

  return {
    settings,
    isInserting,
    lastResult,
    updateSettings,
    insertText,
    copyToClipboard,
    getMethodDisplayName,
  }
}
