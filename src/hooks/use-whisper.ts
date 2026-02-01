'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { toast } from 'sonner'
import { useTauri } from './use-tauri'
import { showErrorByCode } from '@/lib/app-error'

/** Available Whisper models */
export type WhisperModel = 'Tiny' | 'Small' | 'Medium'

/** Supported languages */
export type WhisperLanguage = 'Auto' | 'German' | 'English'

/** Whisper settings from backend */
export interface WhisperSettings {
  model: WhisperModel
  language: WhisperLanguage
  use_gpu: boolean
}

/** Model status info */
export interface ModelStatus {
  model: WhisperModel
  downloaded: boolean
  file_size: number | null
  loaded: boolean
  downloading: boolean
}

/** Download progress info */
export interface DownloadProgress {
  model: WhisperModel
  downloaded_bytes: number
  total_bytes: number
  speed_bps: number
  complete: boolean
  error: string | null
}

/** Transcription segment with timestamp */
export interface TranscriptionSegment {
  text: string
  start_ms: number
  end_ms: number
}

/** Transcription result from backend */
export interface TranscriptionResult {
  text: string
  language: string
  segments: TranscriptionSegment[]
  processing_time_ms: number
}

interface UseWhisperReturn {
  /** Current whisper settings */
  settings: WhisperSettings
  /** Status of all models */
  modelStatus: ModelStatus[]
  /** Current download progress (if any) */
  downloadProgress: DownloadProgress | null
  /** Whether a model is currently loaded */
  isModelLoaded: boolean
  /** Whether transcription is in progress */
  isTranscribing: boolean
  /** Last transcription result */
  lastTranscription: TranscriptionResult | null
  /** Error message if any */
  error: string | null
  /** Update whisper settings */
  updateSettings: (settings: Partial<WhisperSettings>) => Promise<void>
  /** Download a model */
  downloadModel: (model: WhisperModel) => Promise<void>
  /** Cancel ongoing download */
  cancelDownload: () => Promise<void>
  /** Delete a downloaded model */
  deleteModel: (model: WhisperModel) => Promise<void>
  /** Load the configured model into memory */
  loadModel: () => Promise<void>
  /** Unload the current model from memory */
  unloadModel: () => Promise<void>
  /** Transcribe an audio file */
  transcribe: (wavPath: string) => Promise<TranscriptionResult | null>
  /** Refresh model status */
  refreshModelStatus: () => Promise<void>
  /** Get display name for a model */
  getModelDisplayName: (model: WhisperModel) => string
  /** Get display name for a language */
  getLanguageDisplayName: (language: WhisperLanguage) => string
}

const DEFAULT_SETTINGS: WhisperSettings = {
  model: 'Small',
  language: 'Auto',
  use_gpu: true,
}

/** Get human-readable model name */
export function getModelDisplayName(model: WhisperModel): string {
  switch (model) {
    case 'Tiny':
      return 'Tiny (~75 MB, schnell)'
    case 'Small':
      return 'Small (~500 MB, empfohlen)'
    case 'Medium':
      return 'Medium (~1.5 GB, genau)'
    default:
      return model
  }
}

/** Get human-readable language name */
export function getLanguageDisplayName(language: WhisperLanguage): string {
  switch (language) {
    case 'Auto':
      return 'Automatisch erkennen'
    case 'German':
      return 'Deutsch'
    case 'English':
      return 'English'
    default:
      return language
  }
}

/** Format bytes to human-readable size */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

/** Format speed in bytes per second */
export function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`
}

/**
 * Hook to manage Whisper speech-to-text via Tauri backend
 */
export function useWhisper(): UseWhisperReturn {
  const { isTauri } = useTauri()
  const [settings, setSettings] = useState<WhisperSettings>(DEFAULT_SETTINGS)
  const [modelStatus, setModelStatus] = useState<ModelStatus[]>([])
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [isModelLoaded, setIsModelLoaded] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [lastTranscription, setLastTranscription] = useState<TranscriptionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Polling interval for download progress
  const progressPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load initial data
  useEffect(() => {
    if (!isTauri) return

    const loadData = async () => {
      try {
        const [whisperSettings, status, loaded] = await Promise.all([
          invoke<WhisperSettings>('get_whisper_settings').catch(() => DEFAULT_SETTINGS),
          invoke<ModelStatus[]>('get_whisper_model_status').catch(() => []),
          invoke<boolean>('is_whisper_model_loaded').catch(() => false),
        ])
        setSettings(whisperSettings)
        setModelStatus(status)
        setIsModelLoaded(loaded)
      } catch (err) {
        console.error('Failed to load whisper data:', err)
      }
    }

    loadData()
  }, [isTauri])

  // Listen for Tauri events
  useEffect(() => {
    if (!isTauri) return

    const unlisteners: UnlistenFn[] = []

    const setupListeners = async () => {
      // Download complete
      const unlistenDownloadComplete = await listen<WhisperModel>(
        'whisper-download-complete',
        async (event) => {
          toast.success('Modell heruntergeladen', {
            description: `${event.payload} ist jetzt verfügbar.`,
          })
          setDownloadProgress(null)
          // Refresh model status
          try {
            const status = await invoke<ModelStatus[]>('get_whisper_model_status')
            setModelStatus(status)
          } catch {
            // Ignore
          }
        }
      )
      unlisteners.push(unlistenDownloadComplete)

      // Download error
      const unlistenDownloadError = await listen<string>('whisper-download-error', (event) => {
        setError(event.payload)
        setDownloadProgress(null)
        showErrorByCode('ERR_WHISPER_DOWNLOAD', 'whisper', {
          details: event.payload,
          action: () => downloadModel(settings.model),
        })
      })
      unlisteners.push(unlistenDownloadError)

      // Transcription started
      const unlistenTranscriptionStarted = await listen<string>(
        'transcription-started',
        () => {
          setIsTranscribing(true)
          setError(null)
        }
      )
      unlisteners.push(unlistenTranscriptionStarted)

      // Transcription complete
      const unlistenTranscriptionComplete = await listen<TranscriptionResult>(
        'transcription-complete',
        (event) => {
          setIsTranscribing(false)
          setLastTranscription(event.payload)
        }
      )
      unlisteners.push(unlistenTranscriptionComplete)
    }

    setupListeners()

    return () => {
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [isTauri])

  // Poll download progress while downloading
  useEffect(() => {
    if (!isTauri || !downloadProgress || downloadProgress.complete) {
      if (progressPollRef.current) {
        clearInterval(progressPollRef.current)
        progressPollRef.current = null
      }
      return
    }

    progressPollRef.current = setInterval(async () => {
      try {
        const progress = await invoke<DownloadProgress | null>('get_whisper_download_progress')
        if (progress) {
          setDownloadProgress(progress)
          if (progress.complete || progress.error) {
            clearInterval(progressPollRef.current!)
            progressPollRef.current = null
          }
        }
      } catch {
        // Ignore errors during polling
      }
    }, 200)

    return () => {
      if (progressPollRef.current) {
        clearInterval(progressPollRef.current)
        progressPollRef.current = null
      }
    }
  }, [isTauri, downloadProgress?.complete])

  // Update settings
  const updateSettings = useCallback(
    async (newSettings: Partial<WhisperSettings>) => {
      if (!isTauri) return

      const updated = { ...settings, ...newSettings }

      try {
        await invoke('set_whisper_settings', { settings: updated })
        setSettings(updated)
        setError(null)

        // If model changed and different from loaded, unload
        if (newSettings.model && newSettings.model !== settings.model && isModelLoaded) {
          setIsModelLoaded(false)
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Einstellungen konnten nicht gespeichert werden'
        setError(message)
        throw err
      }
    },
    [isTauri, settings, isModelLoaded]
  )

  // Download a model
  const downloadModel = useCallback(
    async (model: WhisperModel) => {
      if (!isTauri) return

      try {
        setError(null)
        // Initialize progress display
        setDownloadProgress({
          model,
          downloaded_bytes: 0,
          total_bytes: 1,
          speed_bps: 0,
          complete: false,
          error: null,
        })

        await invoke('download_whisper_model', { model })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Download konnte nicht gestartet werden'
        setError(message)
        setDownloadProgress(null)
        throw err
      }
    },
    [isTauri]
  )

  // Cancel download
  const cancelDownload = useCallback(async () => {
    if (!isTauri) return

    try {
      await invoke('cancel_whisper_download')
      setDownloadProgress(null)
      toast.info('Download abgebrochen')
    } catch (err) {
      console.error('Failed to cancel download:', err)
    }
  }, [isTauri])

  // Delete a model
  const deleteModel = useCallback(
    async (model: WhisperModel) => {
      if (!isTauri) return

      try {
        await invoke('delete_whisper_model', { model })
        toast.success('Modell gelöscht', {
          description: `${model} wurde entfernt.`,
        })

        // Refresh status
        const status = await invoke<ModelStatus[]>('get_whisper_model_status')
        setModelStatus(status)

        // If deleted model was loaded, update state
        if (settings.model === model && isModelLoaded) {
          setIsModelLoaded(false)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Modell konnte nicht gelöscht werden'
        setError(message)
        throw err
      }
    },
    [isTauri, settings.model, isModelLoaded]
  )

  // Load model
  const loadModel = useCallback(async () => {
    if (!isTauri) return

    try {
      setError(null)
      await invoke('load_whisper_model')
      setIsModelLoaded(true)
      toast.success('Modell geladen', {
        description: `${settings.model} ist bereit für Transkription.`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Modell konnte nicht geladen werden'
      setError(message)
      throw err
    }
  }, [isTauri, settings.model])

  // Unload model
  const unloadModel = useCallback(async () => {
    if (!isTauri) return

    try {
      await invoke('unload_whisper_model')
      setIsModelLoaded(false)
    } catch (err) {
      console.error('Failed to unload model:', err)
    }
  }, [isTauri])

  // Transcribe audio
  const transcribe = useCallback(
    async (wavPath: string): Promise<TranscriptionResult | null> => {
      if (!isTauri) return null

      try {
        setError(null)
        setIsTranscribing(true)

        const result = await invoke<TranscriptionResult>('transcribe_audio', { wavPath })
        setLastTranscription(result)
        setIsTranscribing(false)
        return result
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Transkription fehlgeschlagen'
        setError(message)
        setIsTranscribing(false)
        showErrorByCode('ERR_TRANSCRIPTION_FAILED', 'whisper', {
          details: message,
          action: async () => { await transcribe(wavPath) },
        })
        return null
      }
    },
    [isTauri]
  )

  // Refresh model status
  const refreshModelStatus = useCallback(async () => {
    if (!isTauri) return

    try {
      const status = await invoke<ModelStatus[]>('get_whisper_model_status')
      setModelStatus(status)
    } catch (err) {
      console.error('Failed to refresh model status:', err)
    }
  }, [isTauri])

  return {
    settings,
    modelStatus,
    downloadProgress,
    isModelLoaded,
    isTranscribing,
    lastTranscription,
    error,
    updateSettings,
    downloadModel,
    cancelDownload,
    deleteModel,
    loadModel,
    unloadModel,
    transcribe,
    refreshModelStatus,
    getModelDisplayName,
    getLanguageDisplayName,
  }
}
