//! Context Awareness Engine (PROJ-8)
//!
//! Detects the currently active application and categorizes it for context-aware
//! text processing. This module provides the foundation for features like
//! email-optimized or chat-optimized text formatting.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

// ============================================================================
// Data Types
// ============================================================================

/// Application category for context-aware processing
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppCategory {
    Email,
    Chat,
    Social,
    Code,
    Docs,
    Browser,
    Notes,
    Terminal,
    RemoteDesktop,
    Other,
}

impl Default for AppCategory {
    fn default() -> Self {
        AppCategory::Other
    }
}

impl AppCategory {
    /// Get a human-readable name for the category
    pub fn display_name(&self) -> &'static str {
        match self {
            AppCategory::Email => "E-Mail",
            AppCategory::Chat => "Chat",
            AppCategory::Social => "Social Media",
            AppCategory::Code => "Code Editor",
            AppCategory::Docs => "Dokument",
            AppCategory::Browser => "Browser",
            AppCategory::Notes => "Notizen",
            AppCategory::Terminal => "Terminal",
            AppCategory::RemoteDesktop => "Remote Desktop",
            AppCategory::Other => "Andere",
        }
    }
}

/// Detected application context
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AppContext {
    /// Display name of the application (e.g., "Slack")
    pub app_name: String,

    /// Bundle identifier on macOS (e.g., "com.tinyspeck.slackmacgap")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bundle_id: Option<String>,

    /// Process name on Windows (e.g., "slack.exe")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub process_name: Option<String>,

    /// Window title (e.g., "Slack - #engineering")
    pub window_title: String,

    /// Detected category
    pub category: AppCategory,

    /// Sub-context extracted from window title
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub_context: Option<SubContext>,
}

impl Default for AppContext {
    fn default() -> Self {
        Self {
            app_name: "Unknown".to_string(),
            bundle_id: None,
            process_name: None,
            window_title: String::new(),
            category: AppCategory::Other,
            sub_context: None,
        }
    }
}

/// Sub-context extracted from window title
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SubContext {
    /// Chat channel (e.g., "#engineering")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<String>,

    /// Email recipient (e.g., "thomas@example.com")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recipient: Option<String>,

    /// Web domain (e.g., "gmail.com")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<String>,
}

/// App mapping configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AppMapping {
    /// Display name override
    pub name: String,

    /// Category for this app
    pub category: AppCategory,

    /// Whether this is a built-in mapping (vs user-defined)
    #[serde(default)]
    pub is_builtin: bool,
}

/// Window title pattern for browser/web app detection
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TitlePattern {
    /// Pattern to match in window title
    pub pattern: String,

    /// Category to assign when pattern matches
    pub category: AppCategory,

    /// Whether to extract domain from title
    #[serde(default)]
    pub extract_domain: bool,

    /// Whether to extract channel from title
    #[serde(default)]
    pub extract_channel: bool,
}

/// Complete context detection configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ContextConfig {
    /// App mappings by bundle ID (macOS) or process name (Windows)
    pub mappings: HashMap<String, AppMapping>,

    /// Window title patterns for web app detection
    pub title_patterns: Vec<TitlePattern>,

    /// User-defined mappings (override built-ins)
    #[serde(default)]
    pub user_mappings: HashMap<String, AppMapping>,
}

impl Default for ContextConfig {
    fn default() -> Self {
        Self {
            mappings: get_builtin_mappings(),
            title_patterns: get_builtin_title_patterns(),
            user_mappings: HashMap::new(),
        }
    }
}

// ============================================================================
// Built-in Mappings
// ============================================================================

/// Get built-in app mappings for common applications
fn get_builtin_mappings() -> HashMap<String, AppMapping> {
    let mut mappings = HashMap::new();

    // Email clients
    let email_apps = vec![
        ("com.apple.mail", "Apple Mail"),
        ("com.microsoft.Outlook", "Outlook"),
        ("com.google.Gmail", "Gmail"),
        ("org.mozilla.thunderbird", "Thunderbird"),
        ("com.readdle.smartemail-Mac", "Spark"),
        ("com.freron.MailMate", "MailMate"),
        ("com.postbox-inc.postbox", "Postbox"),
    ];
    for (bundle_id, name) in email_apps {
        mappings.insert(
            bundle_id.to_string(),
            AppMapping {
                name: name.to_string(),
                category: AppCategory::Email,
                is_builtin: true,
            },
        );
    }

    // Chat applications
    let chat_apps = vec![
        ("com.tinyspeck.slackmacgap", "Slack"),
        ("com.microsoft.teams", "Microsoft Teams"),
        ("com.microsoft.teams2", "Microsoft Teams"),
        ("com.hnc.Discord", "Discord"),
        ("net.whatsapp.WhatsApp", "WhatsApp"),
        ("org.telegram.desktop", "Telegram"),
        ("com.facebook.Messenger", "Messenger"),
        ("com.apple.MobileSMS", "Messages"),
        ("org.signal.Signal", "Signal"),
        ("us.zoom.xos", "Zoom"),
        ("com.skype.skype", "Skype"),
    ];
    for (bundle_id, name) in chat_apps {
        mappings.insert(
            bundle_id.to_string(),
            AppMapping {
                name: name.to_string(),
                category: AppCategory::Chat,
                is_builtin: true,
            },
        );
    }

    // Code editors
    let code_apps = vec![
        ("com.microsoft.VSCode", "VS Code"),
        ("com.todesktop.230313mzl4w4u92", "Cursor"),
        ("com.jetbrains.intellij", "IntelliJ IDEA"),
        ("com.jetbrains.WebStorm", "WebStorm"),
        ("com.jetbrains.pycharm", "PyCharm"),
        ("com.apple.dt.Xcode", "Xcode"),
        ("org.vim.MacVim", "MacVim"),
        ("com.sublimetext.4", "Sublime Text"),
        ("com.github.atom", "Atom"),
        ("com.googlecode.iterm2", "iTerm2"),
        ("abnerworks.Typora", "Typora"),
        ("com.jetbrains.CLion", "CLion"),
        ("com.jetbrains.goland", "GoLand"),
        ("com.jetbrains.rider", "Rider"),
    ];
    for (bundle_id, name) in code_apps {
        mappings.insert(
            bundle_id.to_string(),
            AppMapping {
                name: name.to_string(),
                category: AppCategory::Code,
                is_builtin: true,
            },
        );
    }

    // Document apps
    let docs_apps = vec![
        ("com.apple.iWork.Pages", "Pages"),
        ("com.apple.iWork.Numbers", "Numbers"),
        ("com.apple.iWork.Keynote", "Keynote"),
        ("com.microsoft.Word", "Word"),
        ("com.microsoft.Excel", "Excel"),
        ("com.microsoft.Powerpoint", "PowerPoint"),
        ("notion.id", "Notion"),
        ("md.obsidian", "Obsidian"),
        ("com.google.Chrome.app.docs", "Google Docs"),
    ];
    for (bundle_id, name) in docs_apps {
        mappings.insert(
            bundle_id.to_string(),
            AppMapping {
                name: name.to_string(),
                category: AppCategory::Docs,
                is_builtin: true,
            },
        );
    }

    // Browsers
    let browser_apps = vec![
        ("com.apple.Safari", "Safari"),
        ("com.google.Chrome", "Chrome"),
        ("org.mozilla.firefox", "Firefox"),
        ("com.microsoft.edgemac", "Edge"),
        ("company.thebrowser.Browser", "Arc"),
        ("com.brave.Browser", "Brave"),
        ("com.vivaldi.Vivaldi", "Vivaldi"),
        ("com.operasoftware.Opera", "Opera"),
    ];
    for (bundle_id, name) in browser_apps {
        mappings.insert(
            bundle_id.to_string(),
            AppMapping {
                name: name.to_string(),
                category: AppCategory::Browser,
                is_builtin: true,
            },
        );
    }

    // Notes apps
    let notes_apps = vec![
        ("com.apple.Notes", "Apple Notes"),
        ("md.obsidian", "Obsidian"),
        ("com.evernote.Evernote", "Evernote"),
        ("net.shinyfrog.bear", "Bear"),
        ("com.culturedcode.ThingsMac3", "Things"),
        ("com.omnigroup.OmniFocus3", "OmniFocus"),
    ];
    for (bundle_id, name) in notes_apps {
        mappings.insert(
            bundle_id.to_string(),
            AppMapping {
                name: name.to_string(),
                category: AppCategory::Notes,
                is_builtin: true,
            },
        );
    }

    // Terminal apps
    let terminal_apps = vec![
        ("com.apple.Terminal", "Terminal"),
        ("com.googlecode.iterm2", "iTerm2"),
        ("co.zeit.hyper", "Hyper"),
        ("net.kovidgoyal.kitty", "Kitty"),
        ("com.github.wez.wezterm", "WezTerm"),
    ];
    for (bundle_id, name) in terminal_apps {
        mappings.insert(
            bundle_id.to_string(),
            AppMapping {
                name: name.to_string(),
                category: AppCategory::Terminal,
                is_builtin: true,
            },
        );
    }

    // Remote Desktop
    let remote_apps = vec![
        ("com.vmware.fusion", "VMware Fusion"),
        ("com.parallels.desktop.console", "Parallels Desktop"),
        ("com.microsoft.rdc.macos", "Microsoft Remote Desktop"),
        ("com.realvnc.vncviewer", "VNC Viewer"),
        ("org.virtualbox.app.VirtualBox", "VirtualBox"),
    ];
    for (bundle_id, name) in remote_apps {
        mappings.insert(
            bundle_id.to_string(),
            AppMapping {
                name: name.to_string(),
                category: AppCategory::RemoteDesktop,
                is_builtin: true,
            },
        );
    }

    // Social apps
    let social_apps = vec![
        ("com.twitter.twitter-mac", "Twitter"),
        ("com.tweetdeck.tweetdeck", "TweetDeck"),
        ("com.facebook.Facebook", "Facebook"),
        ("com.instagram.instagram", "Instagram"),
        ("com.linkedin.LinkedIn", "LinkedIn"),
    ];
    for (bundle_id, name) in social_apps {
        mappings.insert(
            bundle_id.to_string(),
            AppMapping {
                name: name.to_string(),
                category: AppCategory::Social,
                is_builtin: true,
            },
        );
    }

    mappings
}

/// Get built-in title patterns for web app detection
fn get_builtin_title_patterns() -> Vec<TitlePattern> {
    vec![
        // Email web apps
        TitlePattern {
            pattern: "Gmail".to_string(),
            category: AppCategory::Email,
            extract_domain: true,
            extract_channel: false,
        },
        TitlePattern {
            pattern: "Outlook".to_string(),
            category: AppCategory::Email,
            extract_domain: true,
            extract_channel: false,
        },
        TitlePattern {
            pattern: "Yahoo Mail".to_string(),
            category: AppCategory::Email,
            extract_domain: true,
            extract_channel: false,
        },
        TitlePattern {
            pattern: "ProtonMail".to_string(),
            category: AppCategory::Email,
            extract_domain: true,
            extract_channel: false,
        },
        // Chat web apps
        TitlePattern {
            pattern: "Slack - ".to_string(),
            category: AppCategory::Chat,
            extract_domain: false,
            extract_channel: true,
        },
        TitlePattern {
            pattern: "Discord".to_string(),
            category: AppCategory::Chat,
            extract_domain: false,
            extract_channel: true,
        },
        TitlePattern {
            pattern: "Microsoft Teams".to_string(),
            category: AppCategory::Chat,
            extract_domain: false,
            extract_channel: true,
        },
        TitlePattern {
            pattern: "WhatsApp".to_string(),
            category: AppCategory::Chat,
            extract_domain: false,
            extract_channel: false,
        },
        TitlePattern {
            pattern: "Telegram".to_string(),
            category: AppCategory::Chat,
            extract_domain: false,
            extract_channel: false,
        },
        // Social web apps
        TitlePattern {
            pattern: "LinkedIn".to_string(),
            category: AppCategory::Social,
            extract_domain: false,
            extract_channel: false,
        },
        TitlePattern {
            pattern: "Twitter".to_string(),
            category: AppCategory::Social,
            extract_domain: false,
            extract_channel: false,
        },
        TitlePattern {
            pattern: " / X".to_string(), // New Twitter/X format
            category: AppCategory::Social,
            extract_domain: false,
            extract_channel: false,
        },
        TitlePattern {
            pattern: "Facebook".to_string(),
            category: AppCategory::Social,
            extract_domain: false,
            extract_channel: false,
        },
        TitlePattern {
            pattern: "Instagram".to_string(),
            category: AppCategory::Social,
            extract_domain: false,
            extract_channel: false,
        },
        // Docs web apps
        TitlePattern {
            pattern: "Google Docs".to_string(),
            category: AppCategory::Docs,
            extract_domain: false,
            extract_channel: false,
        },
        TitlePattern {
            pattern: "Google Sheets".to_string(),
            category: AppCategory::Docs,
            extract_domain: false,
            extract_channel: false,
        },
        TitlePattern {
            pattern: "Notion".to_string(),
            category: AppCategory::Docs,
            extract_domain: false,
            extract_channel: false,
        },
        // Code web apps
        TitlePattern {
            pattern: "GitHub".to_string(),
            category: AppCategory::Code,
            extract_domain: false,
            extract_channel: false,
        },
        TitlePattern {
            pattern: "GitLab".to_string(),
            category: AppCategory::Code,
            extract_domain: false,
            extract_channel: false,
        },
    ]
}

// ============================================================================
// Context Detection (macOS)
// ============================================================================

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use std::process::Command;

    /// Get the currently active application info using AppleScript
    /// Returns (app_name, bundle_id, window_title)
    pub fn get_active_app_info() -> Result<(String, String, String), String> {
        // AppleScript to get active application info
        let script = r#"
            tell application "System Events"
                set frontApp to first application process whose frontmost is true
                set appName to name of frontApp
                set bundleID to bundle identifier of frontApp
                set windowTitle to ""
                try
                    set windowTitle to name of first window of frontApp
                end try
                return appName & "|" & bundleID & "|" & windowTitle
            end tell
        "#;

        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|e| format!("Failed to execute AppleScript: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Check for accessibility permission error
            if stderr.contains("not allowed assistive access") || stderr.contains("accessibility") {
                return Err("Accessibility permission required. Please grant permission in System Preferences > Privacy & Security > Accessibility.".to_string());
            }
            return Err(format!("AppleScript error: {}", stderr));
        }

        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let parts: Vec<&str> = result.splitn(3, '|').collect();

        if parts.len() >= 2 {
            Ok((
                parts[0].to_string(),
                parts[1].to_string(),
                parts.get(2).unwrap_or(&"").to_string(),
            ))
        } else {
            Err("Unexpected AppleScript output format".to_string())
        }
    }

    /// Optimized version using a cached shell process
    /// This is faster than spawning a new osascript for each call
    pub fn get_active_app_info_fast() -> Result<(String, String, String), String> {
        // Use a more efficient one-liner
        let script = r#"tell app "System Events" to get {name, bundle identifier, name of first window} of first application process whose frontmost is true"#;

        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|e| format!("Failed to execute AppleScript: {}", e))?;

        if !output.status.success() {
            // Fallback to the slower but more reliable version
            return get_active_app_info();
        }

        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
        // Output format: "AppName, com.bundle.id, Window Title"
        let parts: Vec<&str> = result.splitn(3, ", ").collect();

        if parts.len() >= 2 {
            Ok((
                parts[0].to_string(),
                parts[1].to_string(),
                parts.get(2).unwrap_or(&"").to_string(),
            ))
        } else {
            // Fallback
            get_active_app_info()
        }
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use super::*;

    /// Windows implementation using PowerShell
    /// Returns (app_name, process_name, window_title)
    pub fn get_active_app_info() -> Result<(String, String, String), String> {
        // PowerShell script to get active window info
        let script = r#"
            Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            using System.Text;
            public class Win32 {
                [DllImport("user32.dll")]
                public static extern IntPtr GetForegroundWindow();

                [DllImport("user32.dll")]
                public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

                [DllImport("user32.dll")]
                public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
            }
"@
            $hwnd = [Win32]::GetForegroundWindow()
            $sb = New-Object System.Text.StringBuilder(256)
            [void][Win32]::GetWindowText($hwnd, $sb, 256)
            $windowTitle = $sb.ToString()

            $processId = 0
            [void][Win32]::GetWindowThreadProcessId($hwnd, [ref]$processId)
            $process = Get-Process -Id $processId -ErrorAction SilentlyContinue

            $appName = if ($process) { $process.ProcessName } else { "Unknown" }
            $processPath = if ($process) { $process.Path } else { "" }

            "$appName|$processPath|$windowTitle"
        "#;

        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .output()
            .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("PowerShell error: {}", stderr));
        }

        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let parts: Vec<&str> = result.splitn(3, '|').collect();

        if parts.len() >= 1 {
            Ok((
                parts[0].to_string(),
                parts.get(1).unwrap_or(&"").to_string(),
                parts.get(2).unwrap_or(&"").to_string(),
            ))
        } else {
            Err("Unexpected PowerShell output format".to_string())
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod other {
    use super::*;

    /// Fallback for unsupported platforms
    pub fn get_active_app_info() -> Result<(String, String, String), String> {
        Err("Context detection is not supported on this platform".to_string())
    }
}

// ============================================================================
// Context Manager
// ============================================================================

/// Manager for context detection and categorization
pub struct ContextManager {
    config: ContextConfig,
}

impl ContextManager {
    /// Create a new context manager with default config
    pub fn new() -> Self {
        Self {
            config: ContextConfig::default(),
        }
    }

    /// Create a context manager with loaded user config
    pub fn with_config(config: ContextConfig) -> Self {
        Self { config }
    }

    /// Update the configuration
    pub fn update_config(&mut self, config: ContextConfig) {
        self.config = config;
    }

    /// Get the current configuration
    pub fn get_config(&self) -> &ContextConfig {
        &self.config
    }

    /// Detect the current application context
    /// Performance target: < 50ms latency (as per PROJ-8 spec)
    pub fn detect_context(&self) -> Result<AppContext, String> {
        let start_time = std::time::Instant::now();

        #[cfg(target_os = "macos")]
        let (app_name, identifier, window_title) = macos::get_active_app_info()?;

        #[cfg(target_os = "windows")]
        let (app_name, identifier, window_title) = windows::get_active_app_info()?;

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        let (app_name, identifier, window_title) = other::get_active_app_info()?;

        // Handle empty/desktop case
        if app_name.is_empty() || app_name == "Finder" && window_title.is_empty() {
            let elapsed_ms = start_time.elapsed().as_millis();
            log::debug!("Context detection completed in {}ms (Desktop)", elapsed_ms);
            return Ok(AppContext {
                app_name: "Desktop".to_string(),
                bundle_id: None,
                process_name: None,
                window_title: String::new(),
                category: AppCategory::Other,
                sub_context: None,
            });
        }

        // Look up the app in mappings
        let (category, mapped_name) = self.categorize_app(&identifier, &window_title);

        // Extract sub-context from window title
        let sub_context = self.extract_sub_context(&window_title, category);

        // Log performance metrics (PROJ-8 BUG-2 fix)
        let elapsed_ms = start_time.elapsed().as_millis();
        if elapsed_ms > 50 {
            log::warn!(
                "Context detection took {}ms (exceeds 50ms target): {}",
                elapsed_ms,
                app_name
            );
        } else {
            log::debug!(
                "Context detection completed in {}ms: {} ({:?})",
                elapsed_ms,
                mapped_name.as_ref().unwrap_or(&app_name),
                category
            );
        }

        Ok(AppContext {
            app_name: mapped_name.unwrap_or(app_name),
            #[cfg(target_os = "macos")]
            bundle_id: Some(identifier),
            #[cfg(not(target_os = "macos"))]
            bundle_id: None,
            #[cfg(target_os = "windows")]
            process_name: Some(identifier),
            #[cfg(not(target_os = "windows"))]
            process_name: None,
            window_title,
            category,
            sub_context,
        })
    }

    /// Categorize an app by its identifier and window title
    fn categorize_app(
        &self,
        identifier: &str,
        window_title: &str,
    ) -> (AppCategory, Option<String>) {
        // First check user mappings (they override built-ins)
        if let Some(mapping) = self.config.user_mappings.get(identifier) {
            return (mapping.category, Some(mapping.name.clone()));
        }

        // Then check built-in mappings
        if let Some(mapping) = self.config.mappings.get(identifier) {
            // For browsers, check window title patterns
            if mapping.category == AppCategory::Browser {
                if let Some((pattern_category, _)) = self.match_title_pattern(window_title) {
                    return (pattern_category, Some(mapping.name.clone()));
                }
            }
            return (mapping.category, Some(mapping.name.clone()));
        }

        // Check title patterns for web apps
        if let Some((pattern_category, _)) = self.match_title_pattern(window_title) {
            return (pattern_category, None);
        }

        // Default to Other
        (AppCategory::Other, None)
    }

    /// Match window title against patterns
    fn match_title_pattern(&self, window_title: &str) -> Option<(AppCategory, &TitlePattern)> {
        for pattern in &self.config.title_patterns {
            if window_title.contains(&pattern.pattern) {
                return Some((pattern.category, pattern));
            }
        }
        None
    }

    /// Extract sub-context information from window title
    fn extract_sub_context(&self, window_title: &str, category: AppCategory) -> Option<SubContext> {
        let mut sub_context = SubContext {
            channel: None,
            recipient: None,
            domain: None,
        };

        let mut has_data = false;

        match category {
            AppCategory::Chat => {
                // Extract channel from Slack-style titles: "Slack - #engineering"
                if let Some(idx) = window_title.find(" - #") {
                    let channel = &window_title[idx + 3..];
                    // Take until next space or end
                    let channel = channel.split_whitespace().next().unwrap_or(channel);
                    sub_context.channel = Some(format!("#{}", channel.trim_start_matches('#')));
                    has_data = true;
                } else if let Some(idx) = window_title.find(" - ") {
                    // Generic channel/conversation extraction
                    let rest = &window_title[idx + 3..];
                    if !rest.is_empty() && rest.len() < 50 {
                        sub_context.channel = Some(rest.to_string());
                        has_data = true;
                    }
                }
            }
            AppCategory::Email => {
                // Extract email domain from title
                // Gmail format: "Inbox - user@domain.com - Gmail"
                if let Some(at_pos) = window_title.find('@') {
                    // Find the bounds of the email
                    let before = &window_title[..at_pos];
                    let after = &window_title[at_pos + 1..];

                    // Find username start (last space or start of string)
                    let username_start = before.rfind(' ').map(|i| i + 1).unwrap_or(0);
                    let username = &before[username_start..];

                    // Find domain end (first space or end of string)
                    let domain_end = after.find(' ').unwrap_or(after.len());
                    let domain = &after[..domain_end];

                    if !username.is_empty() && !domain.is_empty() {
                        sub_context.recipient = Some(format!("{}@{}", username, domain));
                        sub_context.domain = Some(domain.to_string());
                        has_data = true;
                    }
                }
            }
            AppCategory::Browser => {
                // Try to extract domain from browser title
                // Common formats: "Page Title - Domain.com" or "Domain.com - Page"
                let title_lower = window_title.to_lowercase();
                if title_lower.contains(".com")
                    || title_lower.contains(".org")
                    || title_lower.contains(".io")
                {
                    // Try to find domain pattern
                    let words: Vec<&str> = window_title.split_whitespace().collect();
                    for word in words {
                        let word_lower = word.to_lowercase();
                        if word_lower.ends_with(".com")
                            || word_lower.ends_with(".org")
                            || word_lower.ends_with(".io")
                            || word_lower.ends_with(".net")
                            || word_lower.ends_with(".de")
                        {
                            sub_context.domain = Some(
                                word.trim_matches(|c: char| !c.is_alphanumeric() && c != '.')
                                    .to_string(),
                            );
                            has_data = true;
                            break;
                        }
                    }
                }
            }
            _ => {}
        }

        if has_data {
            Some(sub_context)
        } else {
            None
        }
    }

    /// Add or update a user mapping
    pub fn set_user_mapping(&mut self, identifier: String, mapping: AppMapping) {
        self.config.user_mappings.insert(
            identifier,
            AppMapping {
                is_builtin: false,
                ..mapping
            },
        );
    }

    /// Remove a user mapping
    pub fn remove_user_mapping(&mut self, identifier: &str) {
        self.config.user_mappings.remove(identifier);
    }

    /// Get all available categories
    pub fn get_categories() -> Vec<(AppCategory, &'static str)> {
        vec![
            (AppCategory::Email, "E-Mail"),
            (AppCategory::Chat, "Chat"),
            (AppCategory::Social, "Social Media"),
            (AppCategory::Code, "Code Editor"),
            (AppCategory::Docs, "Dokument"),
            (AppCategory::Browser, "Browser"),
            (AppCategory::Notes, "Notizen"),
            (AppCategory::Terminal, "Terminal"),
            (AppCategory::Other, "Andere"),
        ]
    }
}

impl Default for ContextManager {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Configuration Persistence
// ============================================================================

/// Get the path to the context config file
pub fn get_config_path() -> PathBuf {
    let app_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.evervoice.app");
    let _ = fs::create_dir_all(&app_dir);
    app_dir.join("context_config.json")
}

/// Load context config from file
pub fn load_config() -> ContextConfig {
    let config_path = get_config_path();
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(mut config) = serde_json::from_str::<ContextConfig>(&content) {
                // Merge with built-in mappings (user mappings override built-ins)
                let builtin_mappings = get_builtin_mappings();
                for (id, mapping) in builtin_mappings {
                    config.mappings.entry(id).or_insert(mapping);
                }
                // Ensure title patterns are present
                if config.title_patterns.is_empty() {
                    config.title_patterns = get_builtin_title_patterns();
                }
                return config;
            }
        }
    }
    ContextConfig::default()
}

/// Save context config to file
pub fn save_config(config: &ContextConfig) -> Result<(), String> {
    let config_path = get_config_path();
    // Only save user mappings, not built-ins
    let save_config = ContextConfig {
        mappings: HashMap::new(),   // Don't persist built-ins
        title_patterns: Vec::new(), // Don't persist built-in patterns
        user_mappings: config.user_mappings.clone(),
    };
    let json = serde_json::to_string_pretty(&save_config).map_err(|e| e.to_string())?;
    fs::write(&config_path, json).map_err(|e| e.to_string())
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_mappings() {
        let mappings = get_builtin_mappings();

        // Check some known apps
        assert!(mappings.contains_key("com.apple.mail"));
        assert_eq!(mappings["com.apple.mail"].category, AppCategory::Email);

        assert!(mappings.contains_key("com.tinyspeck.slackmacgap"));
        assert_eq!(
            mappings["com.tinyspeck.slackmacgap"].category,
            AppCategory::Chat
        );

        assert!(mappings.contains_key("com.microsoft.VSCode"));
        assert_eq!(mappings["com.microsoft.VSCode"].category, AppCategory::Code);
    }

    #[test]
    fn test_title_pattern_matching() {
        let manager = ContextManager::new();

        // Gmail in browser
        let (category, _) = manager.match_title_pattern("Inbox - Gmail").unwrap();
        assert_eq!(category, AppCategory::Email);

        // Slack in browser
        let (category, _) = manager.match_title_pattern("Slack - #engineering").unwrap();
        assert_eq!(category, AppCategory::Chat);

        // LinkedIn
        let (category, _) = manager.match_title_pattern("Feed | LinkedIn").unwrap();
        assert_eq!(category, AppCategory::Social);
    }

    #[test]
    fn test_sub_context_extraction() {
        let manager = ContextManager::new();

        // Slack channel
        let sub = manager.extract_sub_context("Slack - #engineering", AppCategory::Chat);
        assert!(sub.is_some());
        assert_eq!(
            sub.as_ref().unwrap().channel,
            Some("#engineering".to_string())
        );

        // Email recipient
        let sub =
            manager.extract_sub_context("Inbox - test@example.com - Gmail", AppCategory::Email);
        assert!(sub.is_some());
        assert_eq!(
            sub.as_ref().unwrap().recipient,
            Some("test@example.com".to_string())
        );
    }

    #[test]
    fn test_config_serialization() {
        let config = ContextConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        let parsed: ContextConfig = serde_json::from_str(&json).unwrap();
        assert!(!parsed.mappings.is_empty());
    }
}

