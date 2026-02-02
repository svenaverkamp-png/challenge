//! PROJ-18: Markdown Transcription Archive
//!
//! Automatisches Speichern jeder Transkription als Markdown-Datei.
//! Obsidian-kompatibel mit YAML-Frontmatter.
//!
//! Security: Path Traversal Protection, Secure File Permissions, YAML Sanitization

use chrono::{DateTime, Local};
use std::fs;
use std::path::PathBuf;

#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;

/// Archive settings stored in config file
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct ArchiveSettings {
    /// Whether archiving is enabled
    pub enabled: bool,
    /// Path to archive directory (default: ~/VoiceApp/transcriptions/)
    pub path: String,
    /// Include original (unedited) text in archive
    pub include_original: bool,
    /// Folder structure: "flat" or "nested" (year/month)
    pub folder_structure: FolderStructure,
}

impl Default for ArchiveSettings {
    fn default() -> Self {
        let default_path = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("VoiceApp")
            .join("transcriptions");

        Self {
            enabled: true,
            path: default_path.to_string_lossy().to_string(),
            include_original: true,
            folder_structure: FolderStructure::Flat,
        }
    }
}

/// Folder structure options
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum FolderStructure {
    /// All files in root folder
    Flat,
    /// Files organized by year/month
    Nested,
}

impl Default for FolderStructure {
    fn default() -> Self {
        FolderStructure::Flat
    }
}

/// Data for a transcription to be archived
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct TranscriptionData {
    /// ISO 8601 timestamp
    pub date: String,
    /// App name where dictation occurred
    pub app_name: String,
    /// App category (email, chat, etc.)
    pub category: String,
    /// Recording duration in seconds
    pub duration_seconds: u32,
    /// Word count
    pub word_count: u32,
    /// Detected language (de, en)
    pub language: String,
    /// Whether AI editing was applied
    pub was_edited: bool,
    /// The edited (or original if not edited) text
    pub edited_text: String,
    /// The original transcription text (before AI editing)
    pub original_text: String,
}

/// Result of archiving a transcription
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct ArchiveResult {
    /// Whether archiving succeeded
    pub success: bool,
    /// Path to the created file (if successful)
    pub file_path: Option<String>,
    /// Error message (if failed)
    pub error: Option<String>,
}

/// Archive manager for handling transcription archiving
pub struct ArchiveManager {
    settings: ArchiveSettings,
}

impl ArchiveManager {
    pub fn new() -> Self {
        Self {
            settings: ArchiveSettings::default(),
        }
    }

    pub fn with_settings(settings: ArchiveSettings) -> Self {
        Self { settings }
    }

    pub fn update_settings(&mut self, settings: ArchiveSettings) {
        self.settings = settings;
    }

    pub fn get_settings(&self) -> &ArchiveSettings {
        &self.settings
    }

    /// Archive a transcription to a Markdown file
    /// SEC-1 Fix: Validates path before writing
    pub fn archive_transcription(&self, data: &TranscriptionData) -> ArchiveResult {
        if !self.settings.enabled {
            return ArchiveResult {
                success: true,
                file_path: None,
                error: None,
            };
        }

        // Parse the date
        let date = match DateTime::parse_from_rfc3339(&data.date) {
            Ok(d) => d.with_timezone(&Local),
            Err(_) => Local::now(),
        };

        // SEC-1 Fix: Validate the archive path before using it
        let validated_base_path = match validate_archive_path(&self.settings.path) {
            Ok(path) => path,
            Err(e) => {
                log::warn!("Archive path validation failed: {}. Using fallback.", e);
                // Use safe fallback directory
                let fallback = dirs::home_dir()
                    .unwrap_or_else(|| PathBuf::from("."))
                    .join("VoiceApp")
                    .join("transcriptions");

                // Validate fallback too (should always pass)
                match validate_archive_path(&fallback.to_string_lossy()) {
                    Ok(path) => path,
                    Err(e2) => {
                        return ArchiveResult {
                            success: false,
                            file_path: None,
                            error: Some(format!("Pfad-Validierung fehlgeschlagen: {} (Fallback auch: {})", e, e2)),
                        };
                    }
                }
            }
        };

        // Determine output directory (with nested structure if configured)
        let output_dir = match self.settings.folder_structure {
            FolderStructure::Flat => validated_base_path,
            FolderStructure::Nested => {
                let year = date.format("%Y").to_string();
                let month = date.format("%m").to_string();
                validated_base_path.join(year).join(month)
            }
        };

        // Ensure directory exists
        if let Err(e) = fs::create_dir_all(&output_dir) {
            log::error!("Failed to create archive directory: {}", e);
            return ArchiveResult {
                success: false,
                file_path: None,
                error: Some(format!("Konnte Archiv-Verzeichnis nicht erstellen: {}", e)),
            };
        }

        // Generate filename
        let filename = self.generate_filename(data, &date);

        // Generate markdown content
        let content = self.generate_markdown_content(data, &date);

        // SEC-2 Fix: Write file with atomic creation (O_EXCL) to prevent TOCTOU
        match self.write_file_secure(&output_dir, &filename, &content) {
            Ok(final_path) => {
                log::info!("Transcription archived to: {:?}", final_path);
                ArchiveResult {
                    success: true,
                    file_path: Some(final_path.to_string_lossy().to_string()),
                    error: None,
                }
            }
            Err(e) => {
                log::error!("Failed to archive transcription: {}", e);
                ArchiveResult {
                    success: false,
                    file_path: None,
                    error: Some(e),
                }
            }
        }
    }

    /// Generate a sanitized filename for the transcription
    fn generate_filename(&self, data: &TranscriptionData, date: &DateTime<Local>) -> String {
        let date_part = date.format("%Y-%m-%d_%H-%M").to_string();
        let app_part = sanitize_filename(&data.app_name);
        let snippet_part = sanitize_filename(&self.get_text_snippet(&data.edited_text));

        format!("{}_{}_{}",  date_part, app_part, snippet_part)
    }

    /// Get first 30 characters of text as snippet
    fn get_text_snippet(&self, text: &str) -> String {
        let clean_text: String = text
            .chars()
            .filter(|c| !c.is_control())
            .take(30)
            .collect();
        clean_text
    }

    /// Generate the full Markdown content with frontmatter
    /// SEC-4 Fix: Uses YAML sanitization for user-provided values
    fn generate_markdown_content(&self, data: &TranscriptionData, date: &DateTime<Local>) -> String {
        let mut content = String::new();

        // YAML Frontmatter (SEC-4 Fix: sanitize user-provided values)
        content.push_str("---\n");
        content.push_str(&format!("date: {}\n", sanitize_yaml_value(&data.date)));
        content.push_str(&format!("app: {}\n", sanitize_yaml_value(&data.app_name)));
        content.push_str(&format!("category: {}\n", sanitize_yaml_value(&data.category)));
        content.push_str(&format!("duration: {}\n", data.duration_seconds));
        content.push_str(&format!("words: {}\n", data.word_count));
        content.push_str(&format!("language: {}\n", sanitize_yaml_value(&data.language)));
        content.push_str(&format!("edited: {}\n", data.was_edited));
        content.push_str("tags:\n");
        content.push_str("  - transkription\n");
        content.push_str("  - voice\n");
        content.push_str("---\n\n");

        // Title
        let formatted_date = date.format("%d. %B %Y").to_string();
        // Translate month names to German
        let formatted_date = formatted_date
            .replace("January", "Januar")
            .replace("February", "Februar")
            .replace("March", "März")
            .replace("April", "April")
            .replace("May", "Mai")
            .replace("June", "Juni")
            .replace("July", "Juli")
            .replace("August", "August")
            .replace("September", "September")
            .replace("October", "Oktober")
            .replace("November", "November")
            .replace("December", "Dezember");

        content.push_str(&format!("# Transkription vom {}\n\n", formatted_date));

        // Metadata
        content.push_str(&format!("**App:** {}\n", data.app_name));
        content.push_str(&format!("**Zeit:** {} Uhr\n", date.format("%H:%M")));
        content.push_str(&format!("**Dauer:** {} Sekunden\n\n", data.duration_seconds));

        // Edited text section
        if data.was_edited {
            content.push_str("## Bearbeiteter Text\n\n");
            content.push_str(&data.edited_text);
            content.push_str("\n\n");

            // Original text (collapsible)
            if self.settings.include_original {
                content.push_str("## Originaltext\n\n");
                content.push_str("<details>\n");
                content.push_str("<summary>Original anzeigen</summary>\n\n");
                content.push_str(&data.original_text);
                content.push_str("\n\n</details>\n");
            }
        } else {
            // No editing, just show the text
            content.push_str("## Text\n\n");
            content.push_str(&data.edited_text);
            content.push_str("\n");
        }

        content
    }

    /// Write content to file securely with atomic creation
    /// SEC-2 Fix: Uses O_CREAT | O_EXCL to prevent TOCTOU race conditions
    /// SEC-3 Fix: Sets restrictive permissions (0600 on Unix)
    fn write_file_secure(&self, dir: &PathBuf, base_name: &str, content: &str) -> Result<PathBuf, String> {
        use std::io::Write;

        // Ensure Unix-style line endings
        let content = content.replace("\r\n", "\n");

        // Try to create file with unique name (SEC-2: atomic check-and-create)
        let mut counter = 0;
        let max_attempts = 100;

        loop {
            let filename = if counter == 0 {
                format!("{}.md", base_name)
            } else {
                format!("{}_{}.md", base_name, counter)
            };

            let path = dir.join(&filename);

            // SEC-2 & SEC-3 Fix: Use create_new (O_EXCL) with restrictive permissions
            #[cfg(unix)]
            let file_result = fs::OpenOptions::new()
                .write(true)
                .create_new(true) // Fails atomically if file exists
                .mode(0o600) // SEC-3: Only owner can read/write
                .open(&path);

            #[cfg(not(unix))]
            let file_result = fs::OpenOptions::new()
                .write(true)
                .create_new(true) // Fails atomically if file exists
                .open(&path);

            match file_result {
                Ok(mut file) => {
                    // Write content
                    file.write_all(content.as_bytes()).map_err(|e| {
                        // Clean up partial file on write error
                        let _ = fs::remove_file(&path);
                        if e.kind() == std::io::ErrorKind::Other {
                            "Speicherplatz möglicherweise voll".to_string()
                        } else {
                            format!("Fehler beim Schreiben: {}", e)
                        }
                    })?;

                    return Ok(path);
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                    // File exists, try next suffix
                    counter += 1;
                    if counter >= max_attempts {
                        return Err(format!(
                            "Konnte keine eindeutige Datei erstellen nach {} Versuchen",
                            max_attempts
                        ));
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
                    return Err(format!("Keine Schreibberechtigung für: {:?}", path));
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    return Err(format!("Verzeichnis nicht gefunden: {:?}", dir));
                }
                Err(e) => {
                    return Err(format!("Fehler beim Erstellen der Datei: {}", e));
                }
            }
        }
    }

    /// Check if the archive path is writable
    /// SEC-1 Fix: Validates path before checking writability
    pub fn check_path_writable(&self, path: &str) -> Result<bool, String> {
        // SEC-1 Fix: Validate path first
        let validated_path = match validate_archive_path(path) {
            Ok(p) => p,
            Err(e) => return Err(e),
        };

        // Try to create directory if it doesn't exist
        if !validated_path.exists() {
            fs::create_dir_all(&validated_path).map_err(|e| e.to_string())?;
        }

        // Try to write a test file
        let test_file = validated_path.join(".write_test");
        match fs::write(&test_file, "test") {
            Ok(()) => {
                let _ = fs::remove_file(&test_file);
                Ok(true)
            }
            Err(e) => {
                if e.kind() == std::io::ErrorKind::PermissionDenied {
                    Ok(false)
                } else {
                    Err(e.to_string())
                }
            }
        }
    }
}

// ============================================================================
// Security: Path Validation (SEC-1 Fix)
// ============================================================================

/// Forbidden paths that should never be used for archiving
const FORBIDDEN_PATH_SEGMENTS: &[&str] = &[
    ".ssh",
    ".gnupg",
    ".aws",
    ".config/gcloud",
    "Library/Keychains",
    "Library/Cookies",
    ".password-store",
];

/// Validate that an archive path is safe to use
/// SEC-1 Fix: Prevents path traversal attacks
pub fn validate_archive_path(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);

    // Get home directory
    let home = dirs::home_dir()
        .ok_or_else(|| "Kann Home-Verzeichnis nicht ermitteln".to_string())?;

    // Resolve the path (handles ../ and symlinks)
    let canonical = if path.exists() {
        path.canonicalize()
            .map_err(|e| format!("Ungültiger Pfad: {}", e))?
    } else {
        // Path doesn't exist yet - try to create parent and then canonicalize
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Kann Verzeichnis nicht erstellen: {}", e))?;
            }
            // Now canonicalize the parent and append the file/folder name
            let canonical_parent = parent.canonicalize()
                .map_err(|e| format!("Ungültiger Pfad: {}", e))?;
            canonical_parent.join(path.file_name().unwrap_or_default())
        } else {
            return Err("Ungültiger Pfad".to_string());
        }
    };

    // SEC-1: Path must be within home directory
    if !canonical.starts_with(&home) {
        log::warn!(
            "Security: Blocked archive path outside home directory: {:?}",
            path
        );
        return Err("Archiv-Pfad muss innerhalb des Home-Verzeichnisses liegen".to_string());
    }

    // SEC-1: Block sensitive directories
    let path_str = canonical.to_string_lossy();
    for forbidden in FORBIDDEN_PATH_SEGMENTS {
        if path_str.contains(forbidden) {
            log::warn!(
                "Security: Blocked archive path in sensitive directory: {:?}",
                path
            );
            return Err(format!(
                "Archiv-Pfad darf nicht in sensiblen Verzeichnissen liegen ({})",
                forbidden
            ));
        }
    }

    Ok(canonical)
}

// ============================================================================
// Security: YAML Sanitization (SEC-4 Fix)
// ============================================================================

/// Sanitize a string for safe inclusion in YAML
/// SEC-4 Fix: Prevents YAML injection
fn sanitize_yaml_value(value: &str) -> String {
    // Check if value needs quoting
    let needs_quoting = value.contains(':')
        || value.contains('#')
        || value.contains('\n')
        || value.contains('\r')
        || value.contains('"')
        || value.contains('\'')
        || value.starts_with(' ')
        || value.ends_with(' ')
        || value.starts_with('-')
        || value.starts_with('[')
        || value.starts_with('{')
        || value.contains('`')
        || value.contains('|')
        || value.contains('>')
        || value.contains('&')
        || value.contains('*')
        || value.contains('!')
        || value.contains('%')
        || value.contains('@');

    if needs_quoting {
        // Escape backslashes and quotes, then wrap in quotes
        let escaped = value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r");
        format!("\"{}\"", escaped)
    } else {
        value.to_string()
    }
}

// ============================================================================
// Filename Sanitization
// ============================================================================

/// Sanitize a string for use in a filename
/// Only allows a-z, 0-9, and -
fn sanitize_filename(input: &str) -> String {
    input
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        // Remove consecutive dashes
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        // Limit length
        .chars()
        .take(30)
        .collect()
}

// ============================================================================
// Config persistence functions
// ============================================================================

/// Get the path to the archive config file
fn get_archive_config_path() -> PathBuf {
    let app_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.evervoice.app");
    let _ = fs::create_dir_all(&app_dir);
    app_dir.join("archive_config.json")
}

/// Load archive settings from config file
pub fn load_settings() -> ArchiveSettings {
    let config_path = get_archive_config_path();
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(settings) = serde_json::from_str(&content) {
                return settings;
            }
        }
    }
    ArchiveSettings::default()
}

/// Save archive settings to config file
pub fn save_settings(settings: &ArchiveSettings) -> Result<(), String> {
    let config_path = get_archive_config_path();
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&config_path, json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("Hello World"), "hello-world");
        assert_eq!(sanitize_filename("Slack (Canary)"), "slack-canary");
        assert_eq!(sanitize_filename("VS Code"), "vs-code");
        assert_eq!(sanitize_filename("test@email.com"), "test-email-com");
        assert_eq!(sanitize_filename("  spaces  "), "spaces");
    }

    #[test]
    fn test_sanitize_filename_length() {
        let long_text = "This is a very long text that should be truncated to 30 characters";
        let result = sanitize_filename(long_text);
        assert!(result.len() <= 30);
    }

    #[test]
    fn test_default_settings() {
        let settings = ArchiveSettings::default();
        assert!(settings.enabled);
        assert!(settings.include_original);
        assert!(settings.path.contains("VoiceApp"));
    }

    // SEC-4: YAML Sanitization Tests
    #[test]
    fn test_sanitize_yaml_value_simple() {
        assert_eq!(sanitize_yaml_value("Slack"), "Slack");
        assert_eq!(sanitize_yaml_value("email"), "email");
    }

    #[test]
    fn test_sanitize_yaml_value_special_chars() {
        // Colon requires quoting
        assert_eq!(sanitize_yaml_value("key: value"), "\"key: value\"");
        // Newline requires quoting and escaping
        assert_eq!(sanitize_yaml_value("line1\nline2"), "\"line1\\nline2\"");
        // Hash requires quoting
        assert_eq!(sanitize_yaml_value("test#comment"), "\"test#comment\"");
        // Quote in value
        assert_eq!(sanitize_yaml_value("say \"hello\""), "\"say \\\"hello\\\"\"");
    }

    #[test]
    fn test_sanitize_yaml_value_yaml_injection() {
        // Attempt YAML injection
        let malicious = "test\nmalicious_key: value";
        let sanitized = sanitize_yaml_value(malicious);
        // Should be quoted and escaped
        assert!(sanitized.starts_with('"'));
        assert!(sanitized.ends_with('"'));
        assert!(sanitized.contains("\\n"));
    }

    // SEC-1: Path Validation Tests
    #[test]
    fn test_validate_path_traversal_blocked() {
        // These should all fail
        let result = validate_archive_path("../../../etc/passwd");
        assert!(result.is_err());

        let result = validate_archive_path("/etc/cron.d");
        assert!(result.is_err());

        let result = validate_archive_path("/tmp/test");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_path_sensitive_dirs_blocked() {
        if let Some(home) = dirs::home_dir() {
            // These should fail - sensitive directories
            let ssh_path = home.join(".ssh").join("test");
            let result = validate_archive_path(&ssh_path.to_string_lossy());
            assert!(result.is_err());

            let gnupg_path = home.join(".gnupg").join("test");
            let result = validate_archive_path(&gnupg_path.to_string_lossy());
            assert!(result.is_err());
        }
    }

    #[test]
    fn test_validate_path_valid_paths() {
        if let Some(home) = dirs::home_dir() {
            // This should succeed - normal path in home
            let valid_path = home.join("VoiceApp").join("transcriptions");
            let result = validate_archive_path(&valid_path.to_string_lossy());
            // May fail if directory doesn't exist, but shouldn't fail validation
            // Just check it doesn't fail with "outside home" error
            if let Err(e) = &result {
                assert!(!e.contains("innerhalb des Home-Verzeichnisses"));
            }
        }
    }
}

