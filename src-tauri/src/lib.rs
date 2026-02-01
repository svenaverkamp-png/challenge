use std::fs;
use std::io::Write;
use std::panic;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    path::BaseDirectory,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, Runtime, State,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

mod audio;
mod context;
mod ollama;
mod text_insert;
mod whisper;

use audio::{AudioDevice, AudioError, AudioRecorder, AudioSettings, RecordingResult};
use context::{AppCategory, AppContext, AppMapping, ContextConfig, ContextManager};
use ollama::{AutoEditResult, OllamaManager, OllamaSettings, OllamaStatus};
use text_insert::{InsertMethod, TextInsertResult, TextInsertSettings};
use whisper::{
    DownloadProgress, ModelStatus, TranscriptionResult, WhisperError, WhisperLanguage,
    WhisperManager, WhisperModel, WhisperSettings,
};

/// Hotkey mode: Push-to-Talk or Toggle
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum HotkeyMode {
    PushToTalk,
    Toggle,
}

impl Default for HotkeyMode {
    fn default() -> Self {
        HotkeyMode::PushToTalk
    }
}

/// Hotkey settings stored in config file
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct HotkeySettings {
    pub shortcut: String,
    pub mode: HotkeyMode,
    pub enabled: bool,
}

impl Default for HotkeySettings {
    fn default() -> Self {
        Self {
            // Default: Cmd+Shift+Space on Mac, Ctrl+Shift+Space on Windows
            #[cfg(target_os = "macos")]
            shortcut: "CommandOrControl+Shift+Space".to_string(),
            #[cfg(not(target_os = "macos"))]
            shortcut: "Control+Shift+Space".to_string(),
            mode: HotkeyMode::PushToTalk,
            enabled: true,
        }
    }
}

/// Managed state for current app status, crash detection, hotkey, audio, whisper, ollama, text insert, and context
pub struct AppState {
    current_status: Mutex<AppStatus>,
    had_previous_crash: Mutex<bool>,
    crash_info: Mutex<Option<CrashInfo>>,
    hotkey_settings: Mutex<HotkeySettings>,
    hotkey_press_time: Mutex<Option<std::time::Instant>>,
    is_recording: Mutex<bool>,
    audio_recorder: Mutex<AudioRecorder>,
    audio_settings: Mutex<AudioSettings>,
    // Whisper state (PROJ-4)
    whisper_manager: Mutex<WhisperManager>,
    whisper_settings: Mutex<WhisperSettings>,
    // Text insert state (PROJ-6)
    text_insert_settings: Mutex<TextInsertSettings>,
    // Ollama state (PROJ-7)
    ollama_manager: Mutex<OllamaManager>,
    ollama_settings: Mutex<OllamaSettings>,
    // Context awareness state (PROJ-8)
    context_manager: Mutex<ContextManager>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            current_status: Mutex::new(AppStatus::Idle),
            had_previous_crash: Mutex::new(false),
            crash_info: Mutex::new(None),
            hotkey_settings: Mutex::new(HotkeySettings::default()),
            hotkey_press_time: Mutex::new(None),
            is_recording: Mutex::new(false),
            audio_recorder: Mutex::new(AudioRecorder::new()),
            audio_settings: Mutex::new(AudioSettings::default()),
            whisper_manager: Mutex::new(WhisperManager::new()),
            whisper_settings: Mutex::new(WhisperSettings::default()),
            text_insert_settings: Mutex::new(TextInsertSettings::default()),
            ollama_manager: Mutex::new(OllamaManager::new()),
            ollama_settings: Mutex::new(OllamaSettings::default()),
            context_manager: Mutex::new(ContextManager::new()),
        }
    }
}

/// Information about a previous crash
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct CrashInfo {
    pub timestamp: String,
    pub message: String,
    pub location: Option<String>,
}

// Embed status icons at compile time
const ICON_IDLE: &[u8] = include_bytes!("../icons/tray-idle.png");
const ICON_RECORDING: &[u8] = include_bytes!("../icons/tray-recording.png");
const ICON_PROCESSING: &[u8] = include_bytes!("../icons/tray-processing.png");
const ICON_ERROR: &[u8] = include_bytes!("../icons/tray-error.png");

/// App status enum for tray icon states
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum AppStatus {
    Idle,
    Recording,
    Processing,
    Error,
}

impl Default for AppStatus {
    fn default() -> Self {
        AppStatus::Idle
    }
}

/// Get tooltip text for current status
fn get_status_tooltip(status: AppStatus) -> &'static str {
    match status {
        AppStatus::Idle => "EverVoice - Bereit",
        AppStatus::Recording => "EverVoice - Aufnahme aktiv",
        AppStatus::Processing => "EverVoice - Verarbeitung...",
        AppStatus::Error => "EverVoice - Fehler aufgetreten",
    }
}

// ============================================================================
// Crash Recovery Functions
// ============================================================================

/// Get the path to the crash marker file
fn get_crash_marker_path() -> PathBuf {
    // Use a consistent location in the user's app data directory
    let app_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.evervoice.app");

    // Ensure directory exists
    let _ = fs::create_dir_all(&app_dir);

    app_dir.join(".crash_marker")
}

/// Get the path to the crash log file
fn get_crash_log_path() -> PathBuf {
    let app_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.evervoice.app")
        .join("logs");

    let _ = fs::create_dir_all(&app_dir);
    app_dir.join("crash.log")
}

/// Write crash marker file (called on panic)
fn write_crash_marker(info: &CrashInfo) {
    let marker_path = get_crash_marker_path();
    if let Ok(json) = serde_json::to_string_pretty(info) {
        let _ = fs::write(&marker_path, json);
    }

    // Also append to crash log
    let log_path = get_crash_log_path();
    if let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        let log_entry = format!(
            "\n[{}] CRASH: {} ({})\n",
            info.timestamp,
            info.message,
            info.location.as_deref().unwrap_or("unknown location")
        );
        let _ = file.write_all(log_entry.as_bytes());
    }
}

/// Check for and read crash marker from previous session
fn check_crash_marker() -> Option<CrashInfo> {
    let marker_path = get_crash_marker_path();
    if marker_path.exists() {
        if let Ok(content) = fs::read_to_string(&marker_path) {
            // Remove the marker file after reading
            let _ = fs::remove_file(&marker_path);
            return serde_json::from_str(&content).ok();
        }
        // Remove invalid marker
        let _ = fs::remove_file(&marker_path);
    }
    None
}

/// Set up the panic handler to capture crashes
fn setup_panic_handler() {
    let default_hook = panic::take_hook();

    panic::set_hook(Box::new(move |panic_info| {
        // Get timestamp
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        // Get panic message
        let message = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic".to_string()
        };

        // Get location
        let location = panic_info
            .location()
            .map(|loc| format!("{}:{}:{}", loc.file(), loc.line(), loc.column()));

        let crash_info = CrashInfo {
            timestamp,
            message,
            location,
        };

        // Write crash marker
        write_crash_marker(&crash_info);

        // Log the crash
        log::error!("Application crashed: {:?}", crash_info);

        // Call the default panic hook (for proper cleanup/display)
        default_hook(panic_info);
    }));
}

/// Check if there was a previous crash (called from frontend)
#[tauri::command]
async fn check_previous_crash(state: State<'_, AppState>) -> Result<Option<CrashInfo>, String> {
    let crash_info = state.crash_info.lock().map_err(|e| e.to_string())?;
    Ok(crash_info.clone())
}

/// Clear the crash notification (user acknowledged)
#[tauri::command]
async fn clear_crash_notification(state: State<'_, AppState>) -> Result<(), String> {
    let mut had_crash = state.had_previous_crash.lock().map_err(|e| e.to_string())?;
    let mut crash_info = state.crash_info.lock().map_err(|e| e.to_string())?;
    *had_crash = false;
    *crash_info = None;
    Ok(())
}

/// Get crash log contents
#[tauri::command]
async fn get_crash_log() -> Result<String, String> {
    let log_path = get_crash_log_path();
    if log_path.exists() {
        fs::read_to_string(&log_path).map_err(|e| e.to_string())
    } else {
        Ok(String::new())
    }
}

/// Clear crash log
#[tauri::command]
async fn clear_crash_log() -> Result<(), String> {
    let log_path = get_crash_log_path();
    if log_path.exists() {
        fs::remove_file(&log_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ============================================================================
// Hotkey Configuration Functions
// ============================================================================

/// Get the path to the hotkey config file
fn get_hotkey_config_path() -> PathBuf {
    let app_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.evervoice.app");
    let _ = fs::create_dir_all(&app_dir);
    app_dir.join("hotkey_config.json")
}

/// Load hotkey settings from config file
fn load_hotkey_settings() -> HotkeySettings {
    let config_path = get_hotkey_config_path();
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(settings) = serde_json::from_str(&content) {
                return settings;
            }
        }
    }
    HotkeySettings::default()
}

/// Save hotkey settings to config file
fn save_hotkey_settings(settings: &HotkeySettings) -> Result<(), String> {
    let config_path = get_hotkey_config_path();
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&config_path, json).map_err(|e| e.to_string())
}

/// Get current hotkey settings
#[tauri::command]
async fn get_hotkey_settings(state: State<'_, AppState>) -> Result<HotkeySettings, String> {
    let settings = state.hotkey_settings.lock().map_err(|e| e.to_string())?;
    Ok(settings.clone())
}

/// Update hotkey settings
#[tauri::command]
async fn set_hotkey_settings<R: Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
    settings: HotkeySettings,
) -> Result<(), String> {
    // Get old shortcut to unregister
    let old_shortcut = {
        let current = state.hotkey_settings.lock().map_err(|e| e.to_string())?;
        current.shortcut.clone()
    };

    // Unregister old shortcut
    if let Ok(old_sc) = old_shortcut.parse::<Shortcut>() {
        let _ = app.global_shortcut().unregister(old_sc);
    }

    // Save new settings
    save_hotkey_settings(&settings)?;

    // Update state
    {
        let mut current = state.hotkey_settings.lock().map_err(|e| e.to_string())?;
        *current = settings.clone();
    }

    // Register new shortcut if enabled
    if settings.enabled {
        register_global_hotkey(&app, &settings.shortcut)?;
    }

    log::info!("Hotkey settings updated: {:?}", settings);
    Ok(())
}

/// Check if a shortcut is already registered by another app (best-effort detection)
#[tauri::command]
async fn check_shortcut_available<R: Runtime>(
    app: tauri::AppHandle<R>,
    shortcut: String,
) -> Result<bool, String> {
    let sc: Shortcut = shortcut
        .parse()
        .map_err(|e: tauri_plugin_global_shortcut::Error| e.to_string())?;
    let is_registered = app.global_shortcut().is_registered(sc);
    Ok(!is_registered)
}

/// Get recording state
#[tauri::command]
async fn get_recording_state(state: State<'_, AppState>) -> Result<bool, String> {
    let is_recording = state.is_recording.lock().map_err(|e| e.to_string())?;
    Ok(*is_recording)
}

/// Set recording state (for frontend/backend sync)
/// This ensures the backend state matches the frontend state
#[tauri::command]
async fn set_recording_state(state: State<'_, AppState>, recording: bool) -> Result<(), String> {
    let mut is_recording = state.is_recording.lock().map_err(|e| e.to_string())?;
    *is_recording = recording;
    log::debug!("Recording state synced from frontend: {}", recording);
    Ok(())
}

/// Request accessibility permission (macOS only)
/// Opens System Preferences to the Accessibility pane
#[tauri::command]
async fn request_accessibility_permission() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // Open System Preferences directly to Privacy & Security > Accessibility
        Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn()
            .map_err(|e| format!("Failed to open System Preferences: {}", e))?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        // On Windows/Linux, no accessibility permission is needed
        log::debug!("Accessibility permission not required on this platform");
    }

    Ok(())
}

// ============================================================================
// Audio Recording Commands (PROJ-3)
// ============================================================================

/// List available audio input devices
#[tauri::command]
async fn list_audio_devices(state: State<'_, AppState>) -> Result<Vec<AudioDevice>, String> {
    let recorder = state.audio_recorder.lock().map_err(|e| e.to_string())?;
    recorder.list_devices().map_err(|e| e.to_string())
}

/// Get current audio settings
#[tauri::command]
async fn get_audio_settings(state: State<'_, AppState>) -> Result<AudioSettings, String> {
    let settings = state.audio_settings.lock().map_err(|e| e.to_string())?;
    Ok(settings.clone())
}

/// Update audio settings
#[tauri::command]
async fn set_audio_settings(
    state: State<'_, AppState>,
    settings: AudioSettings,
) -> Result<(), String> {
    // Save to state
    {
        let mut current = state.audio_settings.lock().map_err(|e| e.to_string())?;
        *current = settings.clone();
    }

    // Update recorder
    {
        let mut recorder = state.audio_recorder.lock().map_err(|e| e.to_string())?;
        recorder.update_settings(settings.clone());
    }

    // Persist to config file
    save_audio_settings(&settings)?;

    log::info!("Audio settings updated: {:?}", settings);
    Ok(())
}

/// Start audio recording
#[tauri::command]
async fn start_audio_recording<R: Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Check if already recording
    {
        let recorder = state.audio_recorder.lock().map_err(|e| e.to_string())?;
        if recorder.is_recording() {
            return Ok(()); // Already recording
        }
    }

    // Start recording
    {
        let mut recorder = state.audio_recorder.lock().map_err(|e| e.to_string())?;
        recorder.start_recording().map_err(|e| {
            let error_msg = e.to_string();
            // Emit specific error events for UI handling
            match e {
                AudioError::NoDevicesFound | AudioError::NoDefaultDevice => {
                    let _ = app.emit("audio-error-no-device", &error_msg);
                }
                AudioError::PermissionDenied => {
                    let _ = app.emit("audio-error-permission", &error_msg);
                }
                AudioError::DeviceBusy => {
                    let _ = app.emit("audio-error-busy", &error_msg);
                }
                _ => {
                    let _ = app.emit("audio-error", &error_msg);
                }
            }
            error_msg
        })?;
    }

    // Note: Audio level is polled by frontend via get_audio_level command
    // This avoids the need for complex thread management

    // Emit recording started event
    let _ = app.emit("recording-started", ());

    log::info!("Audio recording started");
    Ok(())
}

/// Stop audio recording and get the result
#[tauri::command]
async fn stop_audio_recording<R: Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<RecordingResult, String> {
    let result = {
        let mut recorder = state.audio_recorder.lock().map_err(|e| e.to_string())?;
        recorder.stop_recording().map_err(|e| {
            let error_msg = e.to_string();
            let _ = app.emit("audio-error", &error_msg);
            error_msg
        })?
    };

    // Emit recording complete event
    let _ = app.emit("recording-complete", &result);

    log::info!("Audio recording stopped: {:?}", result);
    Ok(result)
}

/// Get current audio level (0-100)
#[tauri::command]
async fn get_audio_level(state: State<'_, AppState>) -> Result<u8, String> {
    let recorder = state.audio_recorder.lock().map_err(|e| e.to_string())?;
    Ok(recorder.get_level())
}

/// Check if currently recording audio
#[tauri::command]
async fn is_audio_recording(state: State<'_, AppState>) -> Result<bool, String> {
    let recorder = state.audio_recorder.lock().map_err(|e| e.to_string())?;
    Ok(recorder.is_recording())
}

/// Check audio stream health (BUG-2 fix: Device disconnect handling)
/// Returns stream error if device was disconnected, None otherwise
#[tauri::command]
async fn check_audio_health(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let recorder = state.audio_recorder.lock().map_err(|e| e.to_string())?;
    Ok(recorder.get_stream_error())
}

/// Delete a recording file (for privacy mode)
#[tauri::command]
async fn delete_recording(file_path: String) -> Result<(), String> {
    AudioRecorder::delete_recording(&file_path).map_err(|e| e.to_string())
}

/// Request microphone permission (macOS only)
#[tauri::command]
async fn request_microphone_permission() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // Open System Preferences directly to Privacy & Security > Microphone
        Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
            .spawn()
            .map_err(|e| format!("Failed to open System Preferences: {}", e))?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        log::debug!("Microphone permission handled automatically on this platform");
    }

    Ok(())
}

/// Get the path to the audio settings config file
fn get_audio_config_path() -> PathBuf {
    let app_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.evervoice.app");
    let _ = fs::create_dir_all(&app_dir);
    app_dir.join("audio_config.json")
}

/// Load audio settings from config file
fn load_audio_settings() -> AudioSettings {
    let config_path = get_audio_config_path();
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(settings) = serde_json::from_str(&content) {
                return settings;
            }
        }
    }
    AudioSettings::default()
}

/// Save audio settings to config file
fn save_audio_settings(settings: &AudioSettings) -> Result<(), String> {
    let config_path = get_audio_config_path();
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&config_path, json).map_err(|e| e.to_string())
}

// ============================================================================
// Whisper Commands (PROJ-4)
// ============================================================================

/// Get the path to the whisper config file
fn get_whisper_config_path() -> PathBuf {
    let app_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.evervoice.app");
    let _ = fs::create_dir_all(&app_dir);
    app_dir.join("whisper_config.json")
}

/// Load whisper settings from config file
fn load_whisper_settings() -> WhisperSettings {
    let config_path = get_whisper_config_path();
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(settings) = serde_json::from_str(&content) {
                return settings;
            }
        }
    }
    WhisperSettings::default()
}

/// Save whisper settings to config file
fn save_whisper_settings(settings: &WhisperSettings) -> Result<(), String> {
    let config_path = get_whisper_config_path();
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&config_path, json).map_err(|e| e.to_string())
}

/// Get current whisper settings
#[tauri::command]
async fn get_whisper_settings(state: State<'_, AppState>) -> Result<WhisperSettings, String> {
    let settings = state.whisper_settings.lock().map_err(|e| e.to_string())?;
    Ok(settings.clone())
}

/// Update whisper settings
#[tauri::command]
async fn set_whisper_settings(
    state: State<'_, AppState>,
    settings: WhisperSettings,
) -> Result<(), String> {
    // Save to state
    {
        let mut current = state.whisper_settings.lock().map_err(|e| e.to_string())?;
        *current = settings.clone();
    }

    // Update manager
    {
        let mut manager = state.whisper_manager.lock().map_err(|e| e.to_string())?;
        manager.update_settings(settings.clone());
    }

    // Persist to config file
    save_whisper_settings(&settings)?;

    log::info!("Whisper settings updated: {:?}", settings);
    Ok(())
}

/// Get status of all Whisper models
#[tauri::command]
async fn get_whisper_model_status(state: State<'_, AppState>) -> Result<Vec<ModelStatus>, String> {
    let manager = state.whisper_manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.get_all_model_status())
}

/// Download a Whisper model
#[tauri::command]
async fn download_whisper_model<R: Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
    model: WhisperModel,
) -> Result<(), String> {
    // Clone what we need for the async operation
    let manager = {
        let m = state.whisper_manager.lock().map_err(|e| e.to_string())?;
        // We need to create a new manager for async download since we can't hold the lock
        // Actually, we'll use a simpler approach - download in the current context
        drop(m);
        WhisperManager::new()
    };

    log::info!("Starting download of Whisper model: {:?}", model);

    // Start download
    match manager.download_model(model).await {
        Ok(()) => {
            log::info!("Whisper model {} downloaded successfully", model.name());
            let _ = app.emit("whisper-download-complete", model);
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to download Whisper model: {}", e);
            let _ = app.emit("whisper-download-error", e.to_string());
            Err(e.to_string())
        }
    }
}

/// Get current download progress
#[tauri::command]
async fn get_whisper_download_progress(
    state: State<'_, AppState>,
) -> Result<Option<DownloadProgress>, String> {
    let manager = state.whisper_manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.get_download_progress())
}

/// Cancel an ongoing model download
#[tauri::command]
async fn cancel_whisper_download(state: State<'_, AppState>) -> Result<(), String> {
    let manager = state.whisper_manager.lock().map_err(|e| e.to_string())?;
    manager.cancel_download();
    log::info!("Whisper model download cancelled");
    Ok(())
}

/// Delete a downloaded model
#[tauri::command]
async fn delete_whisper_model(
    state: State<'_, AppState>,
    model: WhisperModel,
) -> Result<(), String> {
    // Unload if currently loaded
    {
        let mut manager = state.whisper_manager.lock().map_err(|e| e.to_string())?;
        manager.unload_model();
    }

    WhisperManager::delete_model(model).map_err(|e| e.to_string())?;
    log::info!("Whisper model {} deleted", model.name());
    Ok(())
}

/// Load a Whisper model into memory
#[tauri::command]
async fn load_whisper_model(state: State<'_, AppState>) -> Result<(), String> {
    let mut manager = state.whisper_manager.lock().map_err(|e| e.to_string())?;
    manager.load_model().map_err(|e| e.to_string())
}

/// Unload the current Whisper model from memory
#[tauri::command]
async fn unload_whisper_model(state: State<'_, AppState>) -> Result<(), String> {
    let mut manager = state.whisper_manager.lock().map_err(|e| e.to_string())?;
    manager.unload_model();
    Ok(())
}

/// Check if a Whisper model is loaded
#[tauri::command]
async fn is_whisper_model_loaded(state: State<'_, AppState>) -> Result<bool, String> {
    let manager = state.whisper_manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.is_model_loaded())
}

/// Transcribe an audio file using Whisper
/// SECURITY (BUG-4 fix): Only allows transcription of files within the recordings directory
#[tauri::command]
async fn transcribe_audio<R: Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
    wav_path: String,
) -> Result<TranscriptionResult, String> {
    // SECURITY (BUG-4 fix): Validate that the file is within the recordings directory
    // This prevents path traversal attacks where an attacker could try to read arbitrary files
    let recordings_dir = AudioRecorder::get_recordings_dir();
    let path = PathBuf::from(&wav_path);

    // Canonicalize paths to resolve any "../" or symlinks
    let canonical_path = path
        .canonicalize()
        .map_err(|e| format!("Invalid file path: {}", e))?;
    let canonical_recordings_dir = recordings_dir
        .canonicalize()
        .map_err(|e| format!("Failed to get recordings directory: {}", e))?;

    // Validate path is within recordings directory
    if !canonical_path.starts_with(&canonical_recordings_dir) {
        log::warn!(
            "Security: Blocked attempt to transcribe file outside recordings dir: {}",
            wav_path
        );
        return Err("Access denied: File must be in recordings directory".to_string());
    }

    log::info!("Starting transcription of: {}", wav_path);

    // Emit transcription started event
    let _ = app.emit("transcription-started", &wav_path);

    let result = {
        let mut manager = state.whisper_manager.lock().map_err(|e| e.to_string())?;
        manager.transcribe(&wav_path).map_err(|e| e.to_string())?
    };

    // Emit transcription complete event
    let _ = app.emit("transcription-complete", &result);

    log::info!(
        "Transcription complete: {} characters, {}ms",
        result.text.len(),
        result.processing_time_ms
    );

    Ok(result)
}

// ============================================================================
// Text Insert Commands (PROJ-6)
// ============================================================================

/// Get current text insert settings
#[tauri::command]
async fn get_text_insert_settings(
    state: State<'_, AppState>,
) -> Result<TextInsertSettings, String> {
    let settings = state
        .text_insert_settings
        .lock()
        .map_err(|e| e.to_string())?;
    Ok(settings.clone())
}

/// Update text insert settings
#[tauri::command]
async fn set_text_insert_settings(
    state: State<'_, AppState>,
    settings: TextInsertSettings,
) -> Result<(), String> {
    // Save to state
    {
        let mut current = state
            .text_insert_settings
            .lock()
            .map_err(|e| e.to_string())?;
        *current = settings.clone();
    }

    // Persist to config file
    text_insert::save_settings(&settings)?;

    log::info!("Text insert settings updated: {:?}", settings);
    Ok(())
}

/// Insert text into the active text field
/// This is the main entry point for text insertion after transcription
#[tauri::command]
async fn insert_text<R: Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
    text: String,
) -> Result<TextInsertResult, String> {
    let settings = {
        let s = state
            .text_insert_settings
            .lock()
            .map_err(|e| e.to_string())?;
        s.clone()
    };

    if !settings.enabled {
        // Text insert disabled, just copy to clipboard as fallback
        match text_insert::copy_to_clipboard(&text) {
            Ok(()) => {
                let _ = app.emit("text-insert-clipboard-only", &text);
                return Ok(TextInsertResult {
                    success: true,
                    method_used: "clipboard_only".to_string(),
                    chars_inserted: text.len(),
                    error: None,
                    in_clipboard: true,
                });
            }
            Err(e) => {
                return Ok(TextInsertResult {
                    success: false,
                    method_used: "none".to_string(),
                    chars_inserted: 0,
                    error: Some(e.to_string()),
                    in_clipboard: false,
                });
            }
        }
    }

    log::info!("Inserting text: {} characters", text.len());

    // Perform text insertion
    let result = text_insert::insert_text(&text, &settings);

    // Emit appropriate event based on result
    if result.success {
        let _ = app.emit("text-insert-success", &result);
        log::info!("Text inserted successfully via {}", result.method_used);
    } else if result.in_clipboard {
        let _ = app.emit("text-insert-clipboard-fallback", &result);
        log::warn!("Text insert failed, text in clipboard: {:?}", result.error);
    } else {
        let _ = app.emit("text-insert-error", &result);
        log::error!("Text insert failed: {:?}", result.error);
    }

    Ok(result)
}

/// Copy text to clipboard only (without paste simulation)
/// Use this when user explicitly wants clipboard-only behavior
#[tauri::command]
async fn copy_text_to_clipboard(text: String) -> Result<(), String> {
    text_insert::copy_to_clipboard(&text).map_err(|e| e.to_string())
}

// ============================================================================
// Ollama Commands (PROJ-7)
// ============================================================================

/// Get current ollama settings
#[tauri::command]
async fn get_ollama_settings(state: State<'_, AppState>) -> Result<OllamaSettings, String> {
    let settings = state.ollama_settings.lock().map_err(|e| e.to_string())?;
    Ok(settings.clone())
}

/// Update ollama settings
#[tauri::command]
async fn set_ollama_settings(
    state: State<'_, AppState>,
    settings: OllamaSettings,
) -> Result<(), String> {
    // Save to state
    {
        let mut current = state.ollama_settings.lock().map_err(|e| e.to_string())?;
        *current = settings.clone();
    }

    // Update manager
    {
        let mut manager = state.ollama_manager.lock().map_err(|e| e.to_string())?;
        manager.update_settings(settings.clone());
    }

    // Persist to config file
    ollama::save_settings(&settings)?;

    log::info!("Ollama settings updated: {:?}", settings);
    Ok(())
}

/// Check Ollama connection status and model availability
#[tauri::command]
async fn check_ollama_status(state: State<'_, AppState>) -> Result<OllamaStatus, String> {
    let manager = state.ollama_manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.check_status().await)
}

/// Improve text using Ollama (auto-edit)
/// This is the main entry point for PROJ-7 text improvement
#[tauri::command]
async fn improve_text<R: Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
    text: String,
    language: String,
) -> Result<AutoEditResult, String> {
    let settings = {
        let s = state.ollama_settings.lock().map_err(|e| e.to_string())?;
        s.clone()
    };

    if !settings.enabled {
        log::debug!("Ollama auto-edit disabled, returning original text");
        return Ok(AutoEditResult {
            edited_text: text.clone(),
            original_text: text,
            was_edited: false,
            processing_time_ms: 0,
            error: None,
        });
    }

    log::info!("Starting Ollama text improvement: {} chars", text.len());

    // Emit processing started event
    let _ = app.emit("ollama-processing-started", &text);

    let result = {
        let manager = state.ollama_manager.lock().map_err(|e| e.to_string())?;
        manager.improve_text(&text, &language).await
    };

    match result {
        Ok(edit_result) => {
            let _ = app.emit("ollama-processing-complete", &edit_result);
            log::info!(
                "Ollama text improvement complete: {}ms, {} -> {} chars",
                edit_result.processing_time_ms,
                edit_result.original_text.len(),
                edit_result.edited_text.len()
            );
            Ok(edit_result)
        }
        Err(e) => {
            let error_msg = e.to_string();
            log::warn!("Ollama text improvement failed: {}", error_msg);

            // Emit error event
            let _ = app.emit("ollama-processing-error", &error_msg);

            // Return fallback result with original text
            Ok(AutoEditResult {
                edited_text: text.clone(),
                original_text: text,
                was_edited: false,
                processing_time_ms: 0,
                error: Some(error_msg),
            })
        }
    }
}

/// Pull (download) an Ollama model
#[tauri::command]
async fn pull_ollama_model<R: Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
    model: String,
) -> Result<(), String> {
    log::info!("Starting Ollama model pull: {}", model);

    let manager = state.ollama_manager.lock().map_err(|e| e.to_string())?;

    match manager.pull_model(&model).await {
        Ok(()) => {
            let _ = app.emit("ollama-model-pull-started", &model);
            log::info!("Ollama model pull started: {}", model);
            Ok(())
        }
        Err(e) => {
            let error_msg = e.to_string();
            log::error!("Ollama model pull failed: {}", error_msg);
            let _ = app.emit("ollama-model-pull-error", &error_msg);
            Err(error_msg)
        }
    }
}

// ============================================================================
// Context Awareness Commands (PROJ-8)
// ============================================================================

/// Detect the current application context
/// This is called when the user presses the hotkey to capture which app they're in
#[tauri::command]
async fn detect_context(state: State<'_, AppState>) -> Result<AppContext, String> {
    let manager = state.context_manager.lock().map_err(|e| e.to_string())?;
    manager.detect_context()
}

/// Get the current context configuration
#[tauri::command]
async fn get_context_config(state: State<'_, AppState>) -> Result<ContextConfig, String> {
    let manager = state.context_manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.get_config().clone())
}

/// Update context configuration (user mappings)
#[tauri::command]
async fn set_context_config(
    state: State<'_, AppState>,
    config: ContextConfig,
) -> Result<(), String> {
    // Save to state
    {
        let mut manager = state.context_manager.lock().map_err(|e| e.to_string())?;
        manager.update_config(config.clone());
    }

    // Persist to config file
    context::save_config(&config)?;

    log::info!(
        "Context config updated with {} user mappings",
        config.user_mappings.len()
    );
    Ok(())
}

/// Add or update a user app mapping
#[tauri::command]
async fn set_app_mapping(
    state: State<'_, AppState>,
    identifier: String,
    name: String,
    category: AppCategory,
) -> Result<(), String> {
    let config = {
        let mut manager = state.context_manager.lock().map_err(|e| e.to_string())?;
        manager.set_user_mapping(
            identifier,
            AppMapping {
                name,
                category,
                is_builtin: false,
            },
        );
        manager.get_config().clone()
    };

    // Persist changes
    context::save_config(&config)?;

    log::info!("App mapping updated");
    Ok(())
}

/// Remove a user app mapping
#[tauri::command]
async fn remove_app_mapping(state: State<'_, AppState>, identifier: String) -> Result<(), String> {
    let config = {
        let mut manager = state.context_manager.lock().map_err(|e| e.to_string())?;
        manager.remove_user_mapping(&identifier);
        manager.get_config().clone()
    };

    // Persist changes
    context::save_config(&config)?;

    log::info!("App mapping removed: {}", identifier);
    Ok(())
}

/// Get all available app categories
#[tauri::command]
async fn get_app_categories() -> Result<Vec<(String, String)>, String> {
    Ok(ContextManager::get_categories()
        .into_iter()
        .map(|(cat, name)| (format!("{:?}", cat).to_lowercase(), name.to_string()))
        .collect())
}

/// Register a global hotkey
fn register_global_hotkey<R: Runtime>(
    app: &tauri::AppHandle<R>,
    shortcut_str: &str,
) -> Result<(), String> {
    let shortcut: Shortcut = shortcut_str
        .parse()
        .map_err(|e: tauri_plugin_global_shortcut::Error| e.to_string())?;

    let app_handle = app.clone();
    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, sc, event| {
            let state: State<'_, AppState> = _app.state();

            // Get current settings
            let mode = {
                if let Ok(settings) = state.hotkey_settings.lock() {
                    settings.mode
                } else {
                    HotkeyMode::PushToTalk
                }
            };

            match event.state {
                ShortcutState::Pressed => {
                    log::debug!("Hotkey pressed: {:?}", sc);

                    // EC-2.4: Check if app is currently processing
                    let is_processing = {
                        if let Ok(status) = state.current_status.lock() {
                            *status == AppStatus::Processing
                        } else {
                            false
                        }
                    };

                    if is_processing {
                        // Emit busy event - don't start new recording while processing
                        log::debug!("Hotkey ignored: app is processing");
                        let _ = _app.emit("hotkey-busy", ());
                        return;
                    }

                    // PROJ-8: Detect context when hotkey is pressed
                    let context = {
                        if let Ok(manager) = state.context_manager.lock() {
                            match manager.detect_context() {
                                Ok(ctx) => {
                                    log::debug!(
                                        "Context detected: {:?} ({:?})",
                                        ctx.app_name,
                                        ctx.category
                                    );
                                    Some(ctx)
                                }
                                Err(e) => {
                                    log::warn!("Failed to detect context: {}", e);
                                    // Emit warning for accessibility permission
                                    if e.contains("Accessibility permission") {
                                        let _ = _app.emit("context-permission-required", e.clone());
                                    }
                                    None
                                }
                            }
                        } else {
                            None
                        }
                    };

                    // Emit context-detected event if we have context
                    if let Some(ref ctx) = context {
                        let _ = _app.emit("context-detected", ctx);

                        // PROJ-8 BUG-1 fix: Emit event for unknown apps
                        if ctx.category == context::AppCategory::Other
                            && ctx.app_name != "Desktop"
                        {
                            let _ = _app.emit("context-unknown-app", &ctx.app_name);
                        }
                    }

                    match mode {
                        HotkeyMode::PushToTalk => {
                            // Record press time for minimum hold duration check
                            if let Ok(mut press_time) = state.hotkey_press_time.lock() {
                                *press_time = Some(std::time::Instant::now());
                            }
                            // Emit press event to frontend (with context)
                            let _ = _app.emit("hotkey-pressed", context);
                        }
                        HotkeyMode::Toggle => {
                            // Toggle recording state
                            let should_start = {
                                if let Ok(mut is_recording) = state.is_recording.lock() {
                                    *is_recording = !*is_recording;
                                    *is_recording
                                } else {
                                    false
                                }
                            };

                            if should_start {
                                // Include context when starting recording
                                let _ = _app.emit("hotkey-start-recording", context);
                            } else {
                                let _ = _app.emit("hotkey-stop-recording", ());
                            }
                        }
                    }
                }
                ShortcutState::Released => {
                    log::debug!("Hotkey released: {:?}", sc);

                    if mode == HotkeyMode::PushToTalk {
                        // Check if held long enough (300ms minimum)
                        let held_long_enough = {
                            if let Ok(press_time) = state.hotkey_press_time.lock() {
                                if let Some(start) = *press_time {
                                    start.elapsed().as_millis() >= 300
                                } else {
                                    false
                                }
                            } else {
                                false
                            }
                        };

                        if held_long_enough {
                            // Emit release event to frontend
                            let _ = _app.emit("hotkey-released", ());
                        } else {
                            // Too short, cancel
                            let _ = _app
                                .emit("hotkey-cancelled", "Taste zu kurz gedrückt (min. 300ms)");
                        }

                        // Clear press time
                        if let Ok(mut press_time) = state.hotkey_press_time.lock() {
                            *press_time = None;
                        }
                    }
                }
            }
        })
        .map_err(|e| e.to_string())?;

    log::info!("Global hotkey registered: {}", shortcut_str);
    Ok(())
}

// ============================================================================
// Tray Menu Functions
// ============================================================================

/// Create the tray context menu
fn create_tray_menu<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let status_item = MenuItem::with_id(app, "status", "Status: Bereit", false, None::<&str>)?;
    let separator = MenuItem::with_id(app, "sep", "─────────────", false, None::<&str>)?;
    let settings_item =
        MenuItem::with_id(app, "settings", "Einstellungen öffnen", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "App beenden", true, None::<&str>)?;

    Menu::with_items(app, &[&status_item, &separator, &settings_item, &quit_item])
}

/// Get the icon bytes for a given status
fn get_status_icon_bytes(status: AppStatus) -> &'static [u8] {
    match status {
        AppStatus::Idle => ICON_IDLE,
        AppStatus::Recording => ICON_RECORDING,
        AppStatus::Processing => ICON_PROCESSING,
        AppStatus::Error => ICON_ERROR,
    }
}

/// Build or rebuild the tray icon with all event handlers
fn build_tray_icon<R: Runtime>(app: &tauri::AppHandle<R>, status: AppStatus) -> Result<(), String> {
    // Remove existing tray if present
    if let Some(existing_tray) = app.tray_by_id("main") {
        let _ = existing_tray.set_visible(false);
        // Note: In Tauri v2, we can't explicitly remove a tray, but we can hide it
        log::info!("Hiding existing tray icon for recreation");
    }

    // Create tray menu
    let menu = create_tray_menu(app).map_err(|e| e.to_string())?;

    // Load icon for current status
    let icon_bytes = get_status_icon_bytes(status);
    let icon = Image::from_bytes(icon_bytes).map_err(|e| e.to_string())?;
    let tooltip = get_status_tooltip(status);

    // Build new tray icon
    let _tray = TrayIconBuilder::with_id("main")
        .icon(icon)
        .menu(&menu)
        .tooltip(tooltip)
        .menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "settings" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.center();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.center();
                }
            }
        })
        .build(app)
        .map_err(|e| e.to_string())?;

    log::info!("Tray icon (re)created with status: {:?}", status);
    Ok(())
}

/// Update tray icon and tooltip based on status
#[tauri::command]
async fn update_tray_status<R: Runtime>(
    app: tauri::AppHandle<R>,
    status: AppStatus,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Store current status for potential recreation
    {
        let mut current = state.current_status.lock().map_err(|e| e.to_string())?;
        *current = status;
    }

    // Check if tray exists, if not recreate it
    if app.tray_by_id("main").is_none() {
        log::warn!("Tray icon not found, recreating...");
        build_tray_icon(&app, status)?;
        return Ok(());
    }

    // Update existing tray
    if let Some(tray) = app.tray_by_id("main") {
        // Update tooltip
        let tooltip = get_status_tooltip(status);
        tray.set_tooltip(Some(tooltip)).map_err(|e| e.to_string())?;

        // Update icon
        let icon_bytes = get_status_icon_bytes(status);
        let icon = Image::from_bytes(icon_bytes).map_err(|e| e.to_string())?;
        tray.set_icon(Some(icon)).map_err(|e| e.to_string())?;

        log::info!("Tray status updated to: {:?}", status);
    }
    Ok(())
}

/// Manually recreate the tray icon (useful after system events like Explorer restart)
#[tauri::command]
async fn recreate_tray_icon<R: Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let status = {
        let current = state.current_status.lock().map_err(|e| e.to_string())?;
        *current
    };

    build_tray_icon(&app, status)?;
    log::info!("Tray icon manually recreated");
    Ok(())
}

/// Check if tray icon exists and is visible
#[tauri::command]
async fn check_tray_status<R: Runtime>(app: tauri::AppHandle<R>) -> Result<bool, String> {
    Ok(app.tray_by_id("main").is_some())
}

/// Show the main window
#[tauri::command]
async fn show_main_window<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        window.center().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Hide the main window
#[tauri::command]
async fn hide_main_window<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Get autostart status
#[tauri::command]
async fn get_autostart_status<R: Runtime>(app: tauri::AppHandle<R>) -> Result<bool, String> {
    let autostart = app.autolaunch();
    autostart.is_enabled().map_err(|e| e.to_string())
}

/// Set autostart status
#[tauri::command]
async fn set_autostart<R: Runtime>(app: tauri::AppHandle<R>, enabled: bool) -> Result<(), String> {
    let autostart = app.autolaunch();
    if enabled {
        autostart.enable().map_err(|e| e.to_string())
    } else {
        autostart.disable().map_err(|e| e.to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Install panic handler BEFORE anything else
    setup_panic_handler();

    // Check for previous crash before starting the app
    let previous_crash = check_crash_marker();
    let had_crash = previous_crash.is_some();

    // Load hotkey settings
    let hotkey_settings = load_hotkey_settings();

    // Load audio settings
    let audio_settings = load_audio_settings();
    let mut audio_recorder = AudioRecorder::new();
    audio_recorder.update_settings(audio_settings.clone());

    // Clean up old recordings on startup
    let _ = AudioRecorder::cleanup_old_recordings();

    // Load whisper settings (PROJ-4)
    let whisper_settings = load_whisper_settings();
    let mut whisper_manager = WhisperManager::new();
    whisper_manager.update_settings(whisper_settings.clone());

    // Load text insert settings (PROJ-6)
    let text_insert_settings = text_insert::load_settings();

    // Load ollama settings (PROJ-7)
    let ollama_settings = ollama::load_settings();
    let mut ollama_manager = OllamaManager::new();
    ollama_manager.update_settings(ollama_settings.clone());

    // Load context config (PROJ-8)
    let context_config = context::load_config();
    let context_manager = ContextManager::with_config(context_config);

    // Create initial state with crash info, hotkey settings, audio, whisper, ollama, text insert, and context
    let initial_state = AppState {
        current_status: Mutex::new(AppStatus::Idle),
        had_previous_crash: Mutex::new(had_crash),
        crash_info: Mutex::new(previous_crash.clone()),
        hotkey_settings: Mutex::new(hotkey_settings.clone()),
        hotkey_press_time: Mutex::new(None),
        is_recording: Mutex::new(false),
        audio_recorder: Mutex::new(audio_recorder),
        audio_settings: Mutex::new(audio_settings),
        whisper_manager: Mutex::new(whisper_manager),
        whisper_settings: Mutex::new(whisper_settings),
        text_insert_settings: Mutex::new(text_insert_settings),
        ollama_manager: Mutex::new(ollama_manager),
        ollama_settings: Mutex::new(ollama_settings),
        context_manager: Mutex::new(context_manager),
    };

    if had_crash {
        log::warn!("Previous crash detected: {:?}", previous_crash);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // When second instance is launched, show the main window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.center();
            }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // Register managed state for app status tracking and crash detection
        .manage(initial_state)
        .setup(|app| {
            // Setup logging (always enabled for crash tracking)
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(if cfg!(debug_assertions) {
                        log::LevelFilter::Debug
                    } else {
                        log::LevelFilter::Info
                    })
                    .build(),
            )?;

            // Build initial tray icon using the shared function
            build_tray_icon(app.handle(), AppStatus::Idle)
                .map_err(|e| format!("Failed to create tray icon: {}", e))?;

            // Register global hotkey if enabled
            if hotkey_settings.enabled {
                if let Err(e) = register_global_hotkey(app.handle(), &hotkey_settings.shortcut) {
                    log::warn!("Failed to register global hotkey: {}", e);
                    // Don't fail startup, just warn - user can re-configure later
                }
            }

            log::info!("EverVoice Desktop App started successfully");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            update_tray_status,
            show_main_window,
            hide_main_window,
            get_autostart_status,
            set_autostart,
            recreate_tray_icon,
            check_tray_status,
            check_previous_crash,
            clear_crash_notification,
            get_crash_log,
            clear_crash_log,
            get_hotkey_settings,
            set_hotkey_settings,
            check_shortcut_available,
            get_recording_state,
            set_recording_state,
            request_accessibility_permission,
            // Audio commands (PROJ-3)
            list_audio_devices,
            get_audio_settings,
            set_audio_settings,
            start_audio_recording,
            stop_audio_recording,
            get_audio_level,
            is_audio_recording,
            check_audio_health,
            delete_recording,
            request_microphone_permission,
            // Whisper commands (PROJ-4)
            get_whisper_settings,
            set_whisper_settings,
            get_whisper_model_status,
            download_whisper_model,
            get_whisper_download_progress,
            cancel_whisper_download,
            delete_whisper_model,
            load_whisper_model,
            unload_whisper_model,
            is_whisper_model_loaded,
            transcribe_audio,
            // Text insert commands (PROJ-6)
            get_text_insert_settings,
            set_text_insert_settings,
            insert_text,
            copy_text_to_clipboard,
            // Ollama commands (PROJ-7)
            get_ollama_settings,
            set_ollama_settings,
            check_ollama_status,
            improve_text,
            pull_ollama_model,
            // Context awareness commands (PROJ-8)
            detect_context,
            get_context_config,
            set_context_config,
            set_app_mapping,
            remove_app_mapping,
            get_app_categories
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
