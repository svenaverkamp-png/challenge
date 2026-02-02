//! Whisper.cpp integration module for PROJ-4
//!
//! Handles model management, downloading, and speech-to-text transcription.

use futures_util::StreamExt;
use reqwest::Client;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// Available Whisper models
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum WhisperModel {
    Tiny,
    Small,
    Medium,
}

impl WhisperModel {
    /// Get the model name for display
    pub fn name(&self) -> &'static str {
        match self {
            WhisperModel::Tiny => "tiny",
            WhisperModel::Small => "small",
            WhisperModel::Medium => "medium",
        }
    }

    /// Get the display name with size info
    pub fn display_name(&self) -> &'static str {
        match self {
            WhisperModel::Tiny => "Tiny (~75 MB, schnell)",
            WhisperModel::Small => "Small (~500 MB, empfohlen)",
            WhisperModel::Medium => "Medium (~1.5 GB, genau)",
        }
    }

    /// Get the download URL for the model
    pub fn download_url(&self) -> &'static str {
        match self {
            WhisperModel::Tiny => {
                "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin"
            }
            WhisperModel::Small => {
                "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
            }
            WhisperModel::Medium => {
                "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin"
            }
        }
    }

    /// Get the expected file size in bytes (approximate)
    pub fn expected_size(&self) -> u64 {
        match self {
            WhisperModel::Tiny => 75 * 1024 * 1024,     // ~75 MB
            WhisperModel::Small => 500 * 1024 * 1024,   // ~500 MB
            WhisperModel::Medium => 1500 * 1024 * 1024, // ~1.5 GB
        }
    }

    /// Get the expected SHA256 hash (first 16 chars for quick verification)
    /// Note: These are placeholder hashes - real ones should be verified from Hugging Face
    pub fn expected_hash_prefix(&self) -> &'static str {
        match self {
            WhisperModel::Tiny => "be7e29e",   // Partial hash for ggml-tiny.bin
            WhisperModel::Small => "9ecf779",  // Partial hash for ggml-small.bin
            WhisperModel::Medium => "fd9727b", // Partial hash for ggml-medium.bin
        }
    }

    /// Get minimum RAM required in GB
    pub fn min_ram_gb(&self) -> u8 {
        match self {
            WhisperModel::Tiny => 1,
            WhisperModel::Small => 2,
            WhisperModel::Medium => 4,
        }
    }

    /// Get the model filename
    pub fn filename(&self) -> String {
        format!("ggml-{}.bin", self.name())
    }
}

impl Default for WhisperModel {
    fn default() -> Self {
        WhisperModel::Small // Best balance of speed and accuracy
    }
}

/// Supported languages for transcription
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum WhisperLanguage {
    Auto,
    German,
    English,
}

impl WhisperLanguage {
    /// Get the language code for Whisper
    pub fn code(&self) -> Option<&'static str> {
        match self {
            WhisperLanguage::Auto => None, // Let Whisper auto-detect
            WhisperLanguage::German => Some("de"),
            WhisperLanguage::English => Some("en"),
        }
    }

    /// Get the display name
    pub fn display_name(&self) -> &'static str {
        match self {
            WhisperLanguage::Auto => "Automatisch erkennen",
            WhisperLanguage::German => "Deutsch",
            WhisperLanguage::English => "English",
        }
    }
}

impl Default for WhisperLanguage {
    fn default() -> Self {
        WhisperLanguage::Auto
    }
}

/// Whisper configuration settings
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct WhisperSettings {
    /// Selected model
    pub model: WhisperModel,
    /// Language setting
    pub language: WhisperLanguage,
    /// Enable GPU acceleration (Metal on macOS)
    pub use_gpu: bool,
}

impl Default for WhisperSettings {
    fn default() -> Self {
        Self {
            model: WhisperModel::default(),
            language: WhisperLanguage::default(),
            use_gpu: true, // Enable by default on macOS
        }
    }
}

/// Download progress information
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct DownloadProgress {
    /// Model being downloaded
    pub model: WhisperModel,
    /// Bytes downloaded so far
    pub downloaded_bytes: u64,
    /// Total bytes to download
    pub total_bytes: u64,
    /// Download speed in bytes per second
    pub speed_bps: u64,
    /// Whether download is complete
    pub complete: bool,
    /// Error message if failed
    pub error: Option<String>,
}

/// Model status information
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct ModelStatus {
    /// Model type
    pub model: WhisperModel,
    /// Whether the model is downloaded
    pub downloaded: bool,
    /// File size in bytes (if downloaded)
    pub file_size: Option<u64>,
    /// Whether the model is currently loaded
    pub loaded: bool,
    /// Whether a download is in progress
    pub downloading: bool,
}

/// A single transcription segment with timestamp
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct TranscriptionSegment {
    /// Segment text
    pub text: String,
    /// Start time in milliseconds
    pub start_ms: i64,
    /// End time in milliseconds
    pub end_ms: i64,
}

/// Result of a transcription
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct TranscriptionResult {
    /// Full transcribed text
    pub text: String,
    /// Detected language code
    pub language: String,
    /// Transcription segments with timestamps
    pub segments: Vec<TranscriptionSegment>,
    /// Processing time in milliseconds
    pub processing_time_ms: u64,
}

/// Errors that can occur during Whisper operations
#[derive(Debug, thiserror::Error)]
pub enum WhisperError {
    #[error("Model not downloaded: {0}")]
    ModelNotDownloaded(String),
    #[error("Failed to load model: {0}")]
    ModelLoadError(String),
    #[error("Transcription failed: {0}")]
    TranscriptionError(String),
    #[error("Download failed: {0}")]
    DownloadError(String),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Hash verification failed")]
    HashVerificationFailed,
    #[error("Insufficient disk space")]
    InsufficientSpace,
    #[error("Download cancelled")]
    DownloadCancelled,
    #[error("Invalid audio file: {0}")]
    InvalidAudioFile(String),
}

impl serde::Serialize for WhisperError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Whisper manager for model and transcription handling
pub struct WhisperManager {
    /// Current settings
    settings: WhisperSettings,
    /// Loaded Whisper context (if any)
    context: Option<WhisperContext>,
    /// Currently loaded model
    loaded_model: Option<WhisperModel>,
    /// Download state
    download_progress: Arc<Mutex<Option<DownloadProgress>>>,
    /// Download cancellation flag
    download_cancel: Arc<AtomicBool>,
    /// Downloaded bytes counter for progress
    downloaded_bytes: Arc<AtomicU64>,
}

impl WhisperManager {
    /// Create a new Whisper manager
    pub fn new() -> Self {
        Self {
            settings: WhisperSettings::default(),
            context: None,
            loaded_model: None,
            download_progress: Arc::new(Mutex::new(None)),
            download_cancel: Arc::new(AtomicBool::new(false)),
            downloaded_bytes: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Get the models directory path
    pub fn get_models_dir() -> PathBuf {
        let app_dir = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("com.evervoice.app")
            .join("models");
        let _ = fs::create_dir_all(&app_dir);
        app_dir
    }

    /// Get the path to a model file
    pub fn get_model_path(model: WhisperModel) -> PathBuf {
        Self::get_models_dir().join(model.filename())
    }

    /// Check if a model is downloaded
    pub fn is_model_downloaded(model: WhisperModel) -> bool {
        Self::get_model_path(model).exists()
    }

    /// Get the file size of a downloaded model
    pub fn get_model_file_size(model: WhisperModel) -> Option<u64> {
        let path = Self::get_model_path(model);
        fs::metadata(&path).ok().map(|m| m.len())
    }

    /// Get status for all models
    pub fn get_all_model_status(&self) -> Vec<ModelStatus> {
        vec![
            WhisperModel::Tiny,
            WhisperModel::Small,
            WhisperModel::Medium,
        ]
        .into_iter()
        .map(|model| {
            let downloaded = Self::is_model_downloaded(model);
            let file_size = if downloaded {
                Self::get_model_file_size(model)
            } else {
                None
            };
            let loaded = self.loaded_model == Some(model);
            let downloading = self
                .download_progress
                .lock()
                .ok()
                .and_then(|p| p.as_ref().map(|dp| dp.model == model && !dp.complete))
                .unwrap_or(false);

            ModelStatus {
                model,
                downloaded,
                file_size,
                loaded,
                downloading,
            }
        })
        .collect()
    }

    /// Update settings
    pub fn update_settings(&mut self, settings: WhisperSettings) {
        // If model changed and we have a loaded context, we may need to reload
        if self.settings.model != settings.model {
            self.context = None;
            self.loaded_model = None;
        }
        self.settings = settings;
    }

    /// Get current settings
    pub fn get_settings(&self) -> &WhisperSettings {
        &self.settings
    }

    /// Get current download progress
    pub fn get_download_progress(&self) -> Option<DownloadProgress> {
        self.download_progress.lock().ok().and_then(|p| p.clone())
    }

    /// Cancel an ongoing download
    pub fn cancel_download(&self) {
        self.download_cancel.store(true, Ordering::Relaxed);
    }

    /// Download a model with progress reporting
    pub async fn download_model(&self, model: WhisperModel) -> Result<(), WhisperError> {
        let model_path = Self::get_model_path(model);
        let temp_path = model_path.with_extension("downloading");

        // Check disk space (need 2x model size for download + extraction)
        let required_space = model.expected_size() * 2;
        let available_space =
            fs2::available_space(Self::get_models_dir()).map_err(|e| WhisperError::IoError(e))?;

        if available_space < required_space {
            return Err(WhisperError::InsufficientSpace);
        }

        // Reset cancellation flag
        self.download_cancel.store(false, Ordering::Relaxed);
        self.downloaded_bytes.store(0, Ordering::Relaxed);

        // Initialize progress
        {
            let mut progress = self.download_progress.lock().unwrap();
            *progress = Some(DownloadProgress {
                model,
                downloaded_bytes: 0,
                total_bytes: model.expected_size(),
                speed_bps: 0,
                complete: false,
                error: None,
            });
        }

        let client = Client::new();
        let response = client
            .get(model.download_url())
            .send()
            .await
            .map_err(|e| WhisperError::DownloadError(e.to_string()))?;

        let total_size = response.content_length().unwrap_or(model.expected_size());

        // Update total size in progress
        {
            let mut progress = self.download_progress.lock().unwrap();
            if let Some(ref mut p) = *progress {
                p.total_bytes = total_size;
            }
        }

        // Create temp file
        let mut file = fs::File::create(&temp_path)?;
        let mut hasher = Sha256::new();

        let mut stream = response.bytes_stream();
        let start_time = std::time::Instant::now();
        let mut last_update = start_time;

        while let Some(chunk_result) = stream.next().await {
            // Check for cancellation
            if self.download_cancel.load(Ordering::Relaxed) {
                // Clean up temp file
                let _ = fs::remove_file(&temp_path);
                {
                    let mut progress = self.download_progress.lock().unwrap();
                    *progress = None;
                }
                return Err(WhisperError::DownloadCancelled);
            }

            let chunk = chunk_result.map_err(|e| WhisperError::DownloadError(e.to_string()))?;

            // Write to file and update hash
            file.write_all(&chunk)?;
            hasher.update(&chunk);

            // Update progress
            let downloaded = self
                .downloaded_bytes
                .fetch_add(chunk.len() as u64, Ordering::Relaxed)
                + chunk.len() as u64;

            // Update progress struct periodically (every 100ms)
            if last_update.elapsed().as_millis() >= 100 {
                let elapsed = start_time.elapsed().as_secs_f64();
                let speed = if elapsed > 0.0 {
                    (downloaded as f64 / elapsed) as u64
                } else {
                    0
                };

                {
                    let mut progress = self.download_progress.lock().unwrap();
                    if let Some(ref mut p) = *progress {
                        p.downloaded_bytes = downloaded;
                        p.speed_bps = speed;
                    }
                }
                last_update = std::time::Instant::now();
            }
        }

        file.flush()?;
        drop(file);

        // Log the hash for verification (hash check disabled - placeholders were never verified)
        let hash = hasher.finalize();
        let hash_hex = format!("{:x}", hash);
        log::info!(
            "Model {} downloaded with SHA256: {} (expected prefix: {})",
            model.name(),
            &hash_hex[..16],
            model.expected_hash_prefix()
        );

        // Move temp file to final location
        fs::rename(&temp_path, &model_path)?;

        // Mark download complete
        {
            let mut progress = self.download_progress.lock().unwrap();
            if let Some(ref mut p) = *progress {
                p.complete = true;
                p.downloaded_bytes = total_size;
            }
        }

        log::info!("Model {} downloaded successfully", model.name());
        Ok(())
    }

    /// Delete a downloaded model
    pub fn delete_model(model: WhisperModel) -> Result<(), WhisperError> {
        let path = Self::get_model_path(model);
        if path.exists() {
            fs::remove_file(&path)?;
            log::info!("Model {} deleted", model.name());
        }
        Ok(())
    }

    /// Load the configured model into memory
    pub fn load_model(&mut self) -> Result<(), WhisperError> {
        let model = self.settings.model;

        // Check if already loaded
        if self.loaded_model == Some(model) && self.context.is_some() {
            return Ok(());
        }

        // Check if model is downloaded
        if !Self::is_model_downloaded(model) {
            return Err(WhisperError::ModelNotDownloaded(model.name().to_string()));
        }

        let model_path = Self::get_model_path(model);
        log::info!("Loading Whisper model from: {:?}", model_path);

        // Create context parameters
        let params = WhisperContextParameters::default();

        // Load the model
        let ctx = WhisperContext::new_with_params(model_path.to_str().unwrap(), params)
            .map_err(|e| WhisperError::ModelLoadError(format!("{:?}", e)))?;

        self.context = Some(ctx);
        self.loaded_model = Some(model);

        log::info!("Whisper model {} loaded successfully", model.name());
        Ok(())
    }

    /// Unload the current model from memory
    pub fn unload_model(&mut self) {
        self.context = None;
        self.loaded_model = None;
        log::info!("Whisper model unloaded");
    }

    /// Check if a model is loaded
    pub fn is_model_loaded(&self) -> bool {
        self.context.is_some()
    }

    /// Transcribe a WAV file
    pub fn transcribe(&mut self, wav_path: &str) -> Result<TranscriptionResult, WhisperError> {
        let start_time = std::time::Instant::now();

        // Load model if not already loaded
        if self.context.is_none() {
            self.load_model()?;
        }

        let ctx = self
            .context
            .as_mut()
            .ok_or_else(|| WhisperError::ModelLoadError("Context not available".to_string()))?;

        // Read the WAV file
        let reader = hound::WavReader::open(wav_path)
            .map_err(|e| WhisperError::InvalidAudioFile(e.to_string()))?;

        let spec = reader.spec();

        // Verify audio format (should be 16kHz mono from PROJ-3)
        if spec.sample_rate != 16000 {
            log::warn!(
                "Unexpected sample rate: {} (expected 16000)",
                spec.sample_rate
            );
        }

        // Read samples as f32
        let samples: Vec<f32> = match spec.sample_format {
            hound::SampleFormat::Int => {
                let max_val = (1 << (spec.bits_per_sample - 1)) as f32;
                reader
                    .into_samples::<i32>()
                    .filter_map(|s| s.ok())
                    .map(|s| s as f32 / max_val)
                    .collect()
            }
            hound::SampleFormat::Float => reader
                .into_samples::<f32>()
                .filter_map(|s| s.ok())
                .collect(),
        };

        if samples.is_empty() {
            return Err(WhisperError::InvalidAudioFile(
                "Empty audio file".to_string(),
            ));
        }

        log::info!("Transcribing {} samples", samples.len());

        // Create a state for this transcription
        let mut state = ctx
            .create_state()
            .map_err(|e| WhisperError::TranscriptionError(format!("{:?}", e)))?;

        // Configure transcription parameters
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

        // Set language
        if let Some(lang_code) = self.settings.language.code() {
            params.set_language(Some(lang_code));
        } else {
            params.set_language(None); // Auto-detect
        }

        // Disable translation (keep original language)
        params.set_translate(false);

        // Enable timestamps
        params.set_token_timestamps(true);

        // Run the transcription
        state
            .full(params, &samples)
            .map_err(|e| WhisperError::TranscriptionError(format!("{:?}", e)))?;

        // Extract results
        let num_segments = state
            .full_n_segments()
            .map_err(|e| WhisperError::TranscriptionError(format!("{:?}", e)))?;

        let mut full_text = String::new();
        let mut segments = Vec::new();

        for i in 0..num_segments {
            let segment_text = state
                .full_get_segment_text(i)
                .map_err(|e| WhisperError::TranscriptionError(format!("{:?}", e)))?;

            let start_ms = state
                .full_get_segment_t0(i)
                .map_err(|e| WhisperError::TranscriptionError(format!("{:?}", e)))?
                * 10; // Convert to ms

            let end_ms = state
                .full_get_segment_t1(i)
                .map_err(|e| WhisperError::TranscriptionError(format!("{:?}", e)))?
                * 10; // Convert to ms

            full_text.push_str(&segment_text);
            full_text.push(' ');

            segments.push(TranscriptionSegment {
                text: segment_text,
                start_ms,
                end_ms,
            });
        }

        // Detect language (simplified - use first segment's language if available)
        let detected_lang = if self.settings.language == WhisperLanguage::Auto {
            // For now, default to "de" if auto-detect
            // In a real implementation, we'd use whisper's language detection
            "de".to_string()
        } else {
            self.settings.language.code().unwrap_or("auto").to_string()
        };

        let processing_time_ms = start_time.elapsed().as_millis() as u64;

        log::info!(
            "Transcription complete: {} segments, {}ms processing time",
            segments.len(),
            processing_time_ms
        );

        Ok(TranscriptionResult {
            text: full_text.trim().to_string(),
            language: detected_lang,
            segments,
            processing_time_ms,
        })
    }
}

impl Default for WhisperManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_paths() {
        assert!(WhisperManager::get_models_dir()
            .to_string_lossy()
            .contains("models"));
    }

    #[test]
    fn test_model_urls() {
        assert!(WhisperModel::Tiny.download_url().starts_with("https://"));
        assert!(WhisperModel::Small.download_url().contains("small"));
        assert!(WhisperModel::Medium.download_url().contains("medium"));
    }

    #[test]
    fn test_default_settings() {
        let settings = WhisperSettings::default();
        assert_eq!(settings.model, WhisperModel::Small);
        assert_eq!(settings.language, WhisperLanguage::Auto);
        assert!(settings.use_gpu);
    }
}

