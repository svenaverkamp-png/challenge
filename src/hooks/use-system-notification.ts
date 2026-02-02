'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTauri } from './use-tauri'

/**
 * PROJ-12: System Notification Hook
 * Sends native OS notifications when the app is in background
 */

interface NotificationOptions {
  title: string
  body?: string
  icon?: string
}

export function useSystemNotification() {
  const { isTauri } = useTauri()
  const [isAppFocused, setIsAppFocused] = useState(true)
  const [permissionGranted, setPermissionGranted] = useState(false)

  // Track app focus state
  useEffect(() => {
    const handleFocus = () => setIsAppFocused(true)
    const handleBlur = () => setIsAppFocused(false)

    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)

    // Initial state
    setIsAppFocused(document.hasFocus())

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  // Check and request permission
  useEffect(() => {
    if (!isTauri) return

    const checkPermission = async () => {
      try {
        const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification')

        let granted = await isPermissionGranted()
        if (!granted) {
          const permission = await requestPermission()
          granted = permission === 'granted'
        }
        setPermissionGranted(granted)
      } catch (err) {
        console.warn('Notification permission check failed:', err)
        setPermissionGranted(false)
      }
    }

    checkPermission()
  }, [isTauri])

  // Send notification (only when app is not focused)
  const sendNotification = useCallback(async (options: NotificationOptions) => {
    // Only send if app is not focused and we have permission
    if (isAppFocused || !permissionGranted) {
      return false
    }

    if (!isTauri) {
      // Web fallback using browser Notification API
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(options.title, { body: options.body })
        return true
      }
      return false
    }

    try {
      const { sendNotification: tauriSendNotification } = await import('@tauri-apps/plugin-notification')
      await tauriSendNotification({
        title: options.title,
        body: options.body,
      })
      return true
    } catch (err) {
      console.error('Failed to send notification:', err)
      return false
    }
  }, [isTauri, isAppFocused, permissionGranted])

  // Send error notification
  const notifyError = useCallback((title: string, body?: string) => {
    return sendNotification({ title, body })
  }, [sendNotification])

  // Send success notification
  const notifySuccess = useCallback((title: string, body?: string) => {
    return sendNotification({ title, body })
  }, [sendNotification])

  return {
    isAppFocused,
    permissionGranted,
    sendNotification,
    notifyError,
    notifySuccess,
  }
}

