'use client'

import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { toast } from 'sonner'
import { useTauri } from './use-tauri'

/** Ollama settings from backend */
export interface OllamaSettings {
  enabled: boolean
  ollama_url: string
  model: string
  remove_fill_words: boolean
  fix_grammar: boolean
  fix_spelling: boolean
  add_punctuation: boolean
  fix_capitalization: boolean
  timeout_seconds: number
  /** BUG-2 fix: Use new German spelling reform (dass vs daß) */
  use_new_spelling: boolean
}

/** Ollama connection status */
export interface OllamaStatus {
  connected: boolean
  available_models: string[]
  model_available: boolean
  error: string | null
}

/** Result of auto-edit operation */
export interface AutoEditResult {
  edited_text: string
  original_text: string
  was_edited: boolean
  processing_time_ms: number
  error: string | null
}

interface UseOllamaReturn {
  /** Current ollama settings */
  settings: OllamaSettings
  /** Ollama connection status */
  status: OllamaStatus | null
  /** Whether processing is in progress */
  isProcessing: boolean
  /** Last auto-edit result */
  lastResult: AutoEditResult | null
  /** Error message if any */
  error: string | null
  /** Update ollama settings */
  updateSettings: (settings: Partial<OllamaSettings>) => Promise<void>
  /** Check Ollama connection status */
  checkStatus: () => Promise<OllamaStatus | null>
  /** Improve text using Ollama (PROJ-9: supports email context) */
  improveText: (text: string, language: string, isEmailContext?: boolean) => Promise<AutoEditResult | null>
  /** Pull (download) a model */
  pullModel: (model: string) => Promise<void>
  /** Common models for quick selection */
  COMMON_MODELS: string[]
}

const DEFAULT_SETTINGS: OllamaSettings = {
  enabled: true,
  ollama_url: 'http://localhost:11434',
  model: 'llama3.2:3b',
  remove_fill_words: true,
  fix_grammar: true,
  fix_spelling: true,
  add_punctuation: true,
  fix_capitalization: true,
  timeout_seconds: 10,
  use_new_spelling: true,
}

/** Common Ollama models for voice transcription improvement */
const COMMON_MODELS = [
  'llama3.2:3b',
  'llama3.2:1b',
  'mistral:7b',
  'gemma2:2b',
  'phi3:mini',
]

/**
 * Hook to manage Ollama text improvement via Tauri backend (PROJ-7)
 *
 * Provides auto-edit functionality for transcribed text:
 * - Remove filler words (aehm, also, halt, etc.)
 * - Fix grammar and spelling
 * - Add punctuation
 * - Fix capitalization
 */
export function useOllama(): UseOllamaReturn {
  const { isTauri } = useTauri()
  const [settings, setSettings] = useState<OllamaSettings>(DEFAULT_SETTINGS)
  const [status, setStatus] = useState<OllamaStatus | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastResult, setLastResult] = useState<AutoEditResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load initial settings
  useEffect(() => {
    if (!isTauri) return

    const loadSettings = async () => {
      try {
        const ollamaSettings = await invoke<OllamaSettings>('get_ollama_settings')
        setSettings(ollamaSettings)
      } catch (err) {
        console.error('Failed to load ollama settings:', err)
      }
    }

    loadSettings()
  }, [isTauri])

  // Listen for Tauri events
  useEffect(() => {
    if (!isTauri) return

    const unlisteners: UnlistenFn[] = []

    const setupListeners = async () => {
      // Processing started
      const unlistenStarted = await listen<string>(
        'ollama-processing-started',
        () => {
          setIsProcessing(true)
          setError(null)
        }
      )
      unlisteners.push(unlistenStarted)

      // Processing complete
      const unlistenComplete = await listen<AutoEditResult>(
        'ollama-processing-complete',
        (event) => {
          setIsProcessing(false)
          setLastResult(event.payload)
        }
      )
      unlisteners.push(unlistenComplete)

      // Processing error - BUG-3 & BUG-7 fix: Specific toast messages
      const unlistenError = await listen<string>(
        'ollama-processing-error',
        (event) => {
          setIsProcessing(false)
          setError(event.payload)

          // BUG-3 & BUG-7 fix: Show specific error messages based on error type
          const errorMsg = event.payload.toLowerCase()
          if (errorMsg.includes('timeout')) {
            // BUG-7 fix: Specific timeout message
            toast.warning('AI-Bearbeitung zu langsam', {
              description: 'Rohtext wird verwendet. Versuche ein kleineres Modell.',
            })
          } else if (errorMsg.includes('not reachable') || errorMsg.includes('connection')) {
            // BUG-3 fix: Specific "not available" message
            toast.warning('AI-Bearbeitung nicht verfuegbar', {
              description: 'Ollama laeuft nicht. Rohtext wird verwendet.',
            })
          } else if (errorMsg.includes('invalid url')) {
            // SEC-1 fix: URL validation error
            toast.error('Ungueltige Ollama URL', {
              description: 'Nur localhost URLs sind erlaubt.',
            })
          } else {
            toast.error('AI-Bearbeitung fehlgeschlagen', {
              description: event.payload,
            })
          }
        }
      )
      unlisteners.push(unlistenError)

      // Model pull started
      const unlistenPullStarted = await listen<string>(
        'ollama-model-pull-started',
        (event) => {
          toast.info('Modell wird heruntergeladen...', {
            description: `${event.payload} wird geladen`,
          })
        }
      )
      unlisteners.push(unlistenPullStarted)

      // Model pull error
      const unlistenPullError = await listen<string>(
        'ollama-model-pull-error',
        (event) => {
          toast.error('Modell-Download fehlgeschlagen', {
            description: event.payload,
          })
        }
      )
      unlisteners.push(unlistenPullError)
    }

    setupListeners()

    return () => {
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [isTauri])

  // Update settings
  const updateSettings = useCallback(
    async (newSettings: Partial<OllamaSettings>) => {
      if (!isTauri) return

      const updated = { ...settings, ...newSettings }

      try {
        await invoke('set_ollama_settings', { settings: updated })
        setSettings(updated)
        setError(null)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Einstellungen konnten nicht gespeichert werden'
        setError(message)
        throw err
      }
    },
    [isTauri, settings]
  )

  // Check Ollama status
  const checkStatus = useCallback(async (): Promise<OllamaStatus | null> => {
    if (!isTauri) return null

    try {
      const ollamaStatus = await invoke<OllamaStatus>('check_ollama_status')
      setStatus(ollamaStatus)
      return ollamaStatus
    } catch (err) {
      console.error('Failed to check ollama status:', err)
      const errorStatus: OllamaStatus = {
        connected: false,
        available_models: [],
        model_available: false,
        error: err instanceof Error ? err.message : 'Status check failed',
      }
      setStatus(errorStatus)
      return errorStatus
    }
  }, [isTauri])

  // Improve text using Ollama
  // PROJ-9: Added isEmailContext parameter for email-specific formatting
  const improveText = useCallback(
    async (text: string, language: string, isEmailContext?: boolean): Promise<AutoEditResult | null> => {
      if (!isTauri) {
        // Web fallback: return original text
        return {
          edited_text: text,
          original_text: text,
          was_edited: false,
          processing_time_ms: 0,
          error: 'Ollama only available in desktop app',
        }
      }

      if (!settings.enabled) {
        return {
          edited_text: text,
          original_text: text,
          was_edited: false,
          processing_time_ms: 0,
          error: null,
        }
      }

      try {
        setError(null)
        setIsProcessing(true)

        // PROJ-9: Pass isEmailContext to backend for email-specific prompt rules
        const result = await invoke<AutoEditResult>('improve_text', {
          text,
          language,
          isEmailContext: isEmailContext ?? false
        })
        setLastResult(result)
        setIsProcessing(false)
        return result
      } catch (err) {
        setIsProcessing(false)
        const message =
          err instanceof Error ? err.message : 'Text-Verbesserung fehlgeschlagen'
        setError(message)

        // BUG-3 & BUG-7 fix: Show specific error toasts
        const errorMsg = message.toLowerCase()
        if (errorMsg.includes('timeout')) {
          toast.warning('AI-Bearbeitung zu langsam', {
            description: 'Rohtext wird verwendet.',
          })
        } else if (errorMsg.includes('not reachable') || errorMsg.includes('connection')) {
          toast.warning('AI-Bearbeitung nicht verfuegbar', {
            description: 'Ollama laeuft nicht. Rohtext wird verwendet.',
          })
        } else if (errorMsg.includes('invalid url')) {
          toast.error('Ungueltige Ollama URL', {
            description: 'Nur localhost URLs sind erlaubt.',
          })
        }
        // Note: Don't show generic error toast here to avoid duplicate toasts

        // Return fallback result
        return {
          edited_text: text,
          original_text: text,
          was_edited: false,
          processing_time_ms: 0,
          error: message,
        }
      }
    },
    [isTauri, settings.enabled]
  )

  // Pull (download) a model
  const pullModel = useCallback(
    async (model: string) => {
      if (!isTauri) return

      try {
        await invoke('pull_ollama_model', { model })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Modell konnte nicht heruntergeladen werden'
        toast.error('Download fehlgeschlagen', { description: message })
        throw err
      }
    },
    [isTauri]
  )

  return {
    settings,
    status,
    isProcessing,
    lastResult,
    error,
    updateSettings,
    checkStatus,
    improveText,
    pullModel,
    COMMON_MODELS,
  }
}
