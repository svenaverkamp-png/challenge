'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { useTauri } from './use-tauri'
import { showErrorByCode } from '@/lib/app-error'

/** Audio device info from backend */
export interface AudioDevice {
  id: string
  name: string
  is_default: boolean
}

/** Audio settings from backend */
export interface AudioSettings {
  device_id: string | null
  max_duration_minutes: number
  privacy_mode: boolean
}

/** Recording result from backend */
export interface RecordingResult {
  file_path: string
  duration_ms: number
  privacy_mode: boolean
}

interface UseAudioRecordingReturn {
  /** Current audio level (0-100) */
  audioLevel: number
  /** Whether audio is currently being recorded */
  isRecording: boolean
  /** List of available audio devices */
  devices: AudioDevice[]
  /** Current audio settings */
  settings: AudioSettings
  /** Error message if any */
  error: string | null
  /** Start audio recording */
  startRecording: () => Promise<void>
  /** Stop audio recording and get result */
  stopRecording: () => Promise<RecordingResult | null>
  /** Update audio settings */
  updateSettings: (settings: Partial<AudioSettings>) => Promise<void>
  /** Refresh device list */
  refreshDevices: () => Promise<void>
  /** Delete a recording file */
  deleteRecording: (filePath: string) => Promise<void>
  /** Request microphone permission (macOS) */
  requestMicrophonePermission: () => Promise<void>
}

const DEFAULT_SETTINGS: AudioSettings = {
  device_id: null,
  max_duration_minutes: 6,
  privacy_mode: true,
}

/**
 * Hook to manage audio recording via Tauri backend
 */
export function useAudioRecording(): UseAudioRecordingReturn {
  const { isTauri } = useTauri()
  const [audioLevel, setAudioLevel] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [settings, setSettings] = useState<AudioSettings>(DEFAULT_SETTINGS)
  const [error, setError] = useState<string | null>(null)

  // Polling interval for audio level
  const levelPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load initial data
  useEffect(() => {
    if (!isTauri) return

    const loadData = async () => {
      try {
        const [deviceList, audioSettings] = await Promise.all([
          invoke<AudioDevice[]>('list_audio_devices').catch(() => []),
          invoke<AudioSettings>('get_audio_settings').catch(() => DEFAULT_SETTINGS),
        ])
        setDevices(deviceList)
        setSettings(audioSettings)
      } catch (err) {
        console.error('Failed to load audio data:', err)
      }
    }

    loadData()
  }, [isTauri])

  // Listen for Tauri events
  useEffect(() => {
    if (!isTauri) return

    const unlisteners: UnlistenFn[] = []

    const setupListeners = async () => {
      // Recording started
      const unlistenStarted = await listen('recording-started', () => {
        setIsRecording(true)
        setError(null)
      })
      unlisteners.push(unlistenStarted)

      // Recording complete
      const unlistenComplete = await listen<RecordingResult>('recording-complete', () => {
        setIsRecording(false)
        setAudioLevel(0)
      })
      unlisteners.push(unlistenComplete)

      // Audio errors
      const unlistenError = await listen<string>('audio-error', (event) => {
        setError(event.payload)
        setIsRecording(false)
        showErrorByCode('ERR_AUDIO', 'audio-recording', { details: event.payload })
      })
      unlisteners.push(unlistenError)

      // No device found
      const unlistenNoDevice = await listen<string>('audio-error-no-device', (event) => {
        setError(event.payload)
        showErrorByCode('ERR_MIC_NOT_FOUND', 'audio-recording', {
          details: 'Bitte Mikrofon anschliessen und erneut versuchen.',
        })
      })
      unlisteners.push(unlistenNoDevice)

      // Permission denied
      const unlistenPermission = await listen<string>('audio-error-permission', (event) => {
        setError(event.payload)
        showErrorByCode('ERR_MIC_PERMISSION', 'audio-recording', {
          details: 'Bitte Mikrofon-Berechtigung in den Systemeinstellungen erteilen.',
        })
      })
      unlisteners.push(unlistenPermission)

      // Device busy
      const unlistenBusy = await listen<string>('audio-error-busy', (event) => {
        setError(event.payload)
        showErrorByCode('ERR_MIC_BUSY', 'audio-recording', {
          details: 'Das Mikrofon wird von einer anderen App verwendet.',
        })
      })
      unlisteners.push(unlistenBusy)
    }

    setupListeners()

    return () => {
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [isTauri])

  // Poll audio level while recording
  useEffect(() => {
    if (!isTauri || !isRecording) {
      if (levelPollRef.current) {
        clearInterval(levelPollRef.current)
        levelPollRef.current = null
      }
      return
    }

    levelPollRef.current = setInterval(async () => {
      try {
        const level = await invoke<number>('get_audio_level')
        setAudioLevel(level)
      } catch {
        // Ignore errors during polling
      }
    }, 100)

    return () => {
      if (levelPollRef.current) {
        clearInterval(levelPollRef.current)
        levelPollRef.current = null
      }
    }
  }, [isTauri, isRecording])

  // Start recording
  const startRecording = useCallback(async () => {
    if (!isTauri) return

    try {
      setError(null)
      await invoke('start_audio_recording')
      setIsRecording(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Aufnahme konnte nicht gestartet werden'
      setError(message)
      throw err
    }
  }, [isTauri])

  // Stop recording
  const stopRecording = useCallback(async (): Promise<RecordingResult | null> => {
    if (!isTauri || !isRecording) return null

    try {
      const result = await invoke<RecordingResult>('stop_audio_recording')
      setIsRecording(false)
      setAudioLevel(0)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Aufnahme konnte nicht gestoppt werden'
      setError(message)
      setIsRecording(false)
      setAudioLevel(0)
      return null
    }
  }, [isTauri, isRecording])

  // Update settings
  const updateSettings = useCallback(
    async (newSettings: Partial<AudioSettings>) => {
      if (!isTauri) return

      const updated = { ...settings, ...newSettings }

      try {
        await invoke('set_audio_settings', { settings: updated })
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

  // Refresh device list
  const refreshDevices = useCallback(async () => {
    if (!isTauri) return

    try {
      const deviceList = await invoke<AudioDevice[]>('list_audio_devices')
      setDevices(deviceList)
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Geräteliste konnte nicht geladen werden'
      setError(message)
    }
  }, [isTauri])

  // Delete recording
  const deleteRecording = useCallback(
    async (filePath: string) => {
      if (!isTauri) return

      try {
        await invoke('delete_recording', { filePath })
      } catch (err) {
        console.error('Failed to delete recording:', err)
      }
    },
    [isTauri]
  )

  // Request microphone permission
  const requestMicrophonePermission = useCallback(async () => {
    if (!isTauri) return

    try {
      await invoke('request_microphone_permission')
    } catch (err) {
      console.error('Failed to request microphone permission:', err)
    }
  }, [isTauri])

  return {
    audioLevel,
    isRecording,
    devices,
    settings,
    error,
    startRecording,
    stopRecording,
    updateSettings,
    refreshDevices,
    deleteRecording,
    requestMicrophonePermission,
  }
}
