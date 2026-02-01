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

/// Managed state for current app status, crash detection, and hotkey
pub struct AppState {
    current_status: Mutex<AppStatus>,
    had_previous_crash: Mutex<bool>,
    crash_info: Mutex<Option<CrashInfo>>,
    hotkey_settings: Mutex<HotkeySettings>,
    hotkey_press_time: Mutex<Option<std::time::Instant>>,
    is_recording: Mutex<bool>,
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
        let location = panic_info.location().map(|loc| {
            format!("{}:{}:{}", loc.file(), loc.line(), loc.column())
        });

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
    let sc: Shortcut = shortcut.parse().map_err(|e: tauri_plugin_global_shortcut::Error| e.to_string())?;
    let is_registered = app
        .global_shortcut()
        .is_registered(sc);
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

/// Register a global hotkey
fn register_global_hotkey<R: Runtime>(app: &tauri::AppHandle<R>, shortcut_str: &str) -> Result<(), String> {
    let shortcut: Shortcut = shortcut_str.parse().map_err(|e: tauri_plugin_global_shortcut::Error| e.to_string())?;

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

                    match mode {
                        HotkeyMode::PushToTalk => {
                            // Record press time for minimum hold duration check
                            if let Ok(mut press_time) = state.hotkey_press_time.lock() {
                                *press_time = Some(std::time::Instant::now());
                            }
                            // Emit press event to frontend
                            let _ = _app.emit("hotkey-pressed", ());
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
                                let _ = _app.emit("hotkey-start-recording", ());
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
                            let _ = _app.emit("hotkey-cancelled", "Taste zu kurz gedrückt (min. 300ms)");
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
    let settings_item = MenuItem::with_id(app, "settings", "Einstellungen öffnen", true, None::<&str>)?;
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

    // Create initial state with crash info and hotkey settings
    let initial_state = AppState {
        current_status: Mutex::new(AppStatus::Idle),
        had_previous_crash: Mutex::new(had_crash),
        crash_info: Mutex::new(previous_crash.clone()),
        hotkey_settings: Mutex::new(hotkey_settings.clone()),
        hotkey_press_time: Mutex::new(None),
        is_recording: Mutex::new(false),
    };

    if had_crash {
        log::warn!("Previous crash detected: {:?}", previous_crash);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--minimized"])),
        )
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
            request_accessibility_permission
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
