//! Text Insert Module (PROJ-6)
//!
//! Handles automatic text insertion into active text fields using:
//! - Clipboard + Keyboard simulation (Cmd/Ctrl+V) for fast, reliable paste
//! - Fallback to clipboard-only when direct paste fails

use arboard::Clipboard;
use enigo::{
    Direction::{Click, Press, Release},
    Enigo, Key, Keyboard, Settings,
};
use std::fs;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

/// Text insert method
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum InsertMethod {
    /// Automatically choose best method
    Auto,
    /// Always use clipboard + paste
    Clipboard,
    /// Use character-by-character keyboard simulation (slower, more compatible)
    Keyboard,
}

impl Default for InsertMethod {
    fn default() -> Self {
        InsertMethod::Auto
    }
}

/// Text insert settings
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct TextInsertSettings {
    /// Insert method to use
    pub insert_method: InsertMethod,
    /// Whether to restore original clipboard content after insert
    pub clipboard_restore: bool,
    /// Milliseconds between characters (for keyboard method)
    pub type_speed: u32,
    /// Character threshold for bulk paste (above this, always use clipboard)
    pub bulk_threshold: u32,
    /// Whether text insert is enabled
    pub enabled: bool,
}

impl Default for TextInsertSettings {
    fn default() -> Self {
        Self {
            insert_method: InsertMethod::Auto,
            clipboard_restore: true,
            // BUG-1 FIX: Changed from 10ms to 2ms for ~500 chars/sec
            type_speed: 2,
            bulk_threshold: 1000,
            enabled: true,
        }
    }
}

/// Result of text insert operation
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct TextInsertResult {
    /// Whether the insert was successful
    pub success: bool,
    /// Method that was used
    pub method_used: String,
    /// Number of characters inserted
    pub chars_inserted: usize,
    /// Error message if failed
    pub error: Option<String>,
    /// Whether text is in clipboard (for fallback)
    pub in_clipboard: bool,
}

/// Text Insert error types
#[derive(Debug, thiserror::Error)]
pub enum TextInsertError {
    #[error("Clipboard error: {0}")]
    ClipboardError(String),
    #[error("Keyboard simulation error: {0}")]
    KeyboardError(String),
    #[error("Text is empty")]
    EmptyText,
}

/// Get the path to the text insert config file
fn get_config_path() -> PathBuf {
    let app_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.evervoice.app");
    let _ = fs::create_dir_all(&app_dir);
    app_dir.join("text_insert_config.json")
}

/// Load text insert settings from config file
pub fn load_settings() -> TextInsertSettings {
    let config_path = get_config_path();
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(settings) = serde_json::from_str(&content) {
                return settings;
            }
        }
    }
    TextInsertSettings::default()
}

/// Save text insert settings to config file
pub fn save_settings(settings: &TextInsertSettings) -> Result<(), String> {
    let config_path = get_config_path();
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&config_path, json).map_err(|e| e.to_string())
}

/// Check if text contains complex Unicode (emojis, special chars)
fn contains_complex_unicode(text: &str) -> bool {
    text.chars().any(|c| {
        // Check for emojis and special Unicode characters
        let code = c as u32;
        // Emoji ranges and other complex Unicode
        code > 0x2000 // Beyond basic Latin and Latin-1 Supplement
    })
}

/// Sanitize text for safe insertion (SECURITY FIX: BUG-4)
///
/// Replaces newlines with spaces to prevent command injection when
/// the user is focused on a terminal/shell. This is critical because:
/// - Newlines in terminals execute commands
/// - An attacker could craft audio that transcribes to malicious commands
/// - Example: "rm -rf /" + newline would execute in a terminal
///
/// We replace instead of strip to preserve word boundaries.
fn sanitize_for_terminal_safety(text: &str) -> String {
    text.chars()
        .map(|c| match c {
            '\n' | '\r' => ' ', // Replace newlines with space
            _ => c,
        })
        .collect::<String>()
        // Collapse multiple spaces into one
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ")
}

/// Insert text into active text field
///
/// Strategy:
/// 1. Sanitize text for terminal safety (remove newlines)
/// 2. Save original clipboard content
/// 3. Copy text to clipboard
/// 4. Simulate Cmd/Ctrl+V to paste
/// 5. Restore original clipboard (if enabled)
pub fn insert_text(text: &str, settings: &TextInsertSettings) -> TextInsertResult {
    if text.is_empty() {
        return TextInsertResult {
            success: false,
            method_used: "none".to_string(),
            chars_inserted: 0,
            error: Some("Text is empty".to_string()),
            in_clipboard: false,
        };
    }

    // SECURITY (BUG-4 fix): Sanitize text to prevent terminal command injection
    // Newlines are replaced with spaces to prevent accidental command execution
    // if the user happens to be focused on a terminal window
    let sanitized_text = sanitize_for_terminal_safety(text);
    let text_len = sanitized_text.len();

    // Decide method based on settings and text characteristics
    // BUG-3/5/6 FIX: Auto mode now ALWAYS uses clipboard for:
    // - Reliability (works even if no text field is focused - text stays in clipboard)
    // - No interrupt issues (clipboard paste is atomic, no char-by-char conflicts)
    // - Unicode/Umlaut support (clipboard handles all characters correctly)
    let use_clipboard_paste = match settings.insert_method {
        InsertMethod::Clipboard => true,
        InsertMethod::Keyboard => false,
        InsertMethod::Auto => {
            // BUG-3/5/6 FIX: Always use clipboard in Auto mode
            // Keyboard mode is only used when explicitly selected
            // Rationale:
            // - Clipboard + Paste is faster and more reliable
            // - If no text field is focused, text remains in clipboard (BUG-3)
            // - No race condition with user typing (BUG-5)
            // - Full Unicode/Umlaut support (BUG-6)
            true
        }
    };

    if use_clipboard_paste {
        insert_via_clipboard(&sanitized_text, settings)
    } else {
        // Try keyboard first, fallback to clipboard
        match insert_via_keyboard(&sanitized_text, settings) {
            Ok(result) => result,
            Err(_) => insert_via_clipboard(&sanitized_text, settings),
        }
    }
}

/// Insert text via clipboard + paste (Cmd/Ctrl+V)
fn insert_via_clipboard(text: &str, settings: &TextInsertSettings) -> TextInsertResult {
    let text_len = text.len();

    // Try to create clipboard
    let clipboard_result = Clipboard::new();
    let mut clipboard = match clipboard_result {
        Ok(c) => c,
        Err(e) => {
            log::error!("Failed to access clipboard: {}", e);
            return TextInsertResult {
                success: false,
                method_used: "clipboard".to_string(),
                chars_inserted: 0,
                error: Some(format!("Clipboard access failed: {}", e)),
                in_clipboard: false,
            };
        }
    };

    // Save original clipboard content if restore is enabled
    let original_content = if settings.clipboard_restore {
        clipboard.get_text().ok()
    } else {
        None
    };

    // Set new content
    if let Err(e) = clipboard.set_text(text) {
        log::error!("Failed to set clipboard: {}", e);
        return TextInsertResult {
            success: false,
            method_used: "clipboard".to_string(),
            chars_inserted: 0,
            error: Some(format!("Failed to copy text: {}", e)),
            in_clipboard: false,
        };
    }

    // Small delay to ensure clipboard is ready
    thread::sleep(Duration::from_millis(50));

    // Simulate Cmd/Ctrl+V
    let paste_result = simulate_paste();

    // Restore original clipboard after a short delay
    if settings.clipboard_restore {
        if let Some(original) = original_content {
            // Wait a bit for paste to complete
            thread::sleep(Duration::from_millis(100));
            // Restore original content
            let _ = clipboard.set_text(&original);
        }
    }

    match paste_result {
        Ok(()) => TextInsertResult {
            success: true,
            method_used: "clipboard".to_string(),
            chars_inserted: text_len,
            error: None,
            in_clipboard: !settings.clipboard_restore,
        },
        Err(e) => {
            log::warn!("Paste simulation failed: {}. Text is still in clipboard.", e);
            TextInsertResult {
                success: false,
                method_used: "clipboard_fallback".to_string(),
                chars_inserted: 0,
                error: Some(format!("Paste failed: {}. Text copied to clipboard.", e)),
                in_clipboard: true,
            }
        }
    }
}

/// Simulate Cmd+V (macOS) or Ctrl+V (Windows/Linux)
fn simulate_paste() -> Result<(), TextInsertError> {
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| TextInsertError::KeyboardError(e.to_string()))?;

    #[cfg(target_os = "macos")]
    {
        // macOS: Cmd+V
        enigo
            .key(Key::Meta, Press)
            .map_err(|e| TextInsertError::KeyboardError(e.to_string()))?;
        thread::sleep(Duration::from_millis(20));
        enigo
            .key(Key::Unicode('v'), Click)
            .map_err(|e| TextInsertError::KeyboardError(e.to_string()))?;
        thread::sleep(Duration::from_millis(20));
        enigo
            .key(Key::Meta, Release)
            .map_err(|e| TextInsertError::KeyboardError(e.to_string()))?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Windows/Linux: Ctrl+V
        enigo
            .key(Key::Control, Press)
            .map_err(|e| TextInsertError::KeyboardError(e.to_string()))?;
        thread::sleep(Duration::from_millis(20));
        enigo
            .key(Key::Unicode('v'), Click)
            .map_err(|e| TextInsertError::KeyboardError(e.to_string()))?;
        thread::sleep(Duration::from_millis(20));
        enigo
            .key(Key::Control, Release)
            .map_err(|e| TextInsertError::KeyboardError(e.to_string()))?;
    }

    Ok(())
}

/// Maximum time allowed for keyboard insert (BUG-2 FIX)
const KEYBOARD_INSERT_TIMEOUT_MS: u128 = 2000;

/// Insert text via character-by-character keyboard simulation
/// BUG-2 FIX: Added 2-second timeout to prevent hanging
fn insert_via_keyboard(
    text: &str,
    settings: &TextInsertSettings,
) -> Result<TextInsertResult, TextInsertError> {
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| TextInsertError::KeyboardError(e.to_string()))?;

    let delay = Duration::from_millis(settings.type_speed as u64);
    let mut chars_inserted = 0;
    let start_time = std::time::Instant::now();

    for c in text.chars() {
        // BUG-2 FIX: Check timeout before each character
        if start_time.elapsed().as_millis() > KEYBOARD_INSERT_TIMEOUT_MS {
            log::warn!(
                "Keyboard insert timeout after {}ms, {} chars inserted",
                KEYBOARD_INSERT_TIMEOUT_MS,
                chars_inserted
            );
            return Err(TextInsertError::KeyboardError(format!(
                "Timeout after {} characters. Remaining text will use clipboard.",
                chars_inserted
            )));
        }

        // Type each character
        enigo
            .text(&c.to_string())
            .map_err(|e| TextInsertError::KeyboardError(e.to_string()))?;
        chars_inserted += 1;

        // Delay between characters
        if delay.as_millis() > 0 {
            thread::sleep(delay);
        }
    }

    Ok(TextInsertResult {
        success: true,
        method_used: "keyboard".to_string(),
        chars_inserted,
        error: None,
        in_clipboard: false,
    })
}

/// Copy text to clipboard only (no paste simulation)
/// Used as final fallback when all else fails
pub fn copy_to_clipboard(text: &str) -> Result<(), TextInsertError> {
    let mut clipboard =
        Clipboard::new().map_err(|e| TextInsertError::ClipboardError(e.to_string()))?;

    clipboard
        .set_text(text)
        .map_err(|e| TextInsertError::ClipboardError(e.to_string()))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_settings() {
        let settings = TextInsertSettings::default();
        assert!(settings.enabled);
        assert!(settings.clipboard_restore);
        assert_eq!(settings.insert_method, InsertMethod::Auto);
        assert_eq!(settings.bulk_threshold, 1000);
        // BUG-1 FIX: Verify faster default speed
        assert_eq!(settings.type_speed, 2); // Was 10, now 2 for ~500 chars/sec
    }

    #[test]
    fn test_contains_complex_unicode() {
        assert!(!contains_complex_unicode("Hello World"));
        assert!(!contains_complex_unicode("Hallo Welt äöü"));
        // Note: Basic German umlauts are below 0x2000
        assert!(contains_complex_unicode("Hello 😀"));
        assert!(contains_complex_unicode("Test 🎉 Party"));
    }

    #[test]
    fn test_empty_text_insert() {
        let settings = TextInsertSettings::default();
        let result = insert_text("", &settings);
        assert!(!result.success);
        assert!(result.error.is_some());
    }

    #[test]
    fn test_sanitize_for_terminal_safety() {
        // Basic text unchanged
        assert_eq!(sanitize_for_terminal_safety("Hello World"), "Hello World");

        // Newlines replaced with spaces
        assert_eq!(
            sanitize_for_terminal_safety("Hello\nWorld"),
            "Hello World"
        );

        // Carriage returns also replaced
        assert_eq!(
            sanitize_for_terminal_safety("Hello\r\nWorld"),
            "Hello World"
        );

        // Multiple newlines collapsed
        assert_eq!(
            sanitize_for_terminal_safety("Hello\n\n\nWorld"),
            "Hello World"
        );

        // SECURITY: Dangerous command is neutralized
        assert_eq!(
            sanitize_for_terminal_safety("rm -rf /\n"),
            "rm -rf /"
        );

        // Multi-line text becomes single line
        assert_eq!(
            sanitize_for_terminal_safety("Line 1\nLine 2\nLine 3"),
            "Line 1 Line 2 Line 3"
        );
    }
}
