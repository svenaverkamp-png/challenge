//! Audio recording module for PROJ-3
//!
//! Handles microphone input, audio recording, and WAV export for Whisper.cpp

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Host, Sample, SampleFormat, SampleRate, Stream, StreamConfig};
use fs2::available_space;
use hound::{WavSpec, WavWriter};
use rubato::{FftFixedIn, Resampler};
use std::fs;
use std::io::BufWriter;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

/// Thread-safe wrapper for cpal::Stream
/// Safety: The stream is only accessed from the main thread in Tauri
struct SendableStream(Option<Stream>);

// SAFETY: cpal::Stream is only created and used on the main thread
// Tauri commands run on the main thread, so this is safe
unsafe impl Send for SendableStream {}

/// Target sample rate for Whisper.cpp (16kHz)
pub const WHISPER_SAMPLE_RATE: u32 = 16000;

/// Maximum recording duration in seconds (6 minutes)
pub const MAX_RECORDING_SECONDS: u64 = 360;

/// Audio level (0-100) for UI display
pub type AudioLevel = u8;

/// Information about an audio input device
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

/// Audio recording settings
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct AudioSettings {
    /// Selected microphone device ID (None = default)
    pub device_id: Option<String>,
    /// Maximum recording time in minutes (1-10)
    pub max_duration_minutes: u8,
    /// Privacy mode: auto-delete recordings after processing
    pub privacy_mode: bool,
}

impl Default for AudioSettings {
    fn default() -> Self {
        Self {
            device_id: None,
            max_duration_minutes: 6,
            privacy_mode: true,
        }
    }
}

/// Result of a completed recording
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct RecordingResult {
    /// Path to the WAV file
    pub file_path: String,
    /// Duration in milliseconds
    pub duration_ms: u64,
    /// Whether privacy mode will auto-delete the file
    pub privacy_mode: bool,
}

/// Errors that can occur during audio operations
#[derive(Debug, thiserror::Error)]
pub enum AudioError {
    #[error("No audio input devices found")]
    NoDevicesFound,
    #[error("Device not found: {0}")]
    DeviceNotFound(String),
    #[error("Failed to get default input device")]
    NoDefaultDevice,
    #[error("Failed to get device config: {0}")]
    ConfigError(String),
    #[error("Failed to build audio stream: {0}")]
    StreamError(String),
    #[error("Failed to write WAV file: {0}")]
    WavWriteError(String),
    #[error("Recording not started")]
    NotRecording,
    #[error("Microphone disconnected during recording")]
    DeviceDisconnected,
    #[error("Insufficient disk space")]
    InsufficientSpace,
    #[error("Microphone permission denied")]
    PermissionDenied,
    #[error("Microphone in use by another application")]
    DeviceBusy,
}

impl serde::Serialize for AudioError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Audio recorder state
pub struct AudioRecorder {
    host: Host,
    stream: SendableStream,
    samples: Arc<Mutex<Vec<f32>>>,
    is_recording: Arc<AtomicBool>,
    current_level: Arc<AtomicU8>,
    source_sample_rate: u32,
    recording_start: Option<std::time::Instant>,
    settings: AudioSettings,
    /// Stream error (set when device disconnects or other stream errors occur)
    stream_error: Arc<Mutex<Option<String>>>,
}

impl AudioRecorder {
    /// Create a new audio recorder
    pub fn new() -> Self {
        let host = cpal::default_host();
        Self {
            host,
            stream: SendableStream(None),
            samples: Arc::new(Mutex::new(Vec::new())),
            is_recording: Arc::new(AtomicBool::new(false)),
            current_level: Arc::new(AtomicU8::new(0)),
            source_sample_rate: 44100, // Will be updated when recording starts
            recording_start: None,
            settings: AudioSettings::default(),
            stream_error: Arc::new(Mutex::new(None)),
        }
    }

    /// Update audio settings
    pub fn update_settings(&mut self, settings: AudioSettings) {
        self.settings = settings;
    }

    /// Get current settings
    pub fn get_settings(&self) -> &AudioSettings {
        &self.settings
    }

    /// List available audio input devices
    pub fn list_devices(&self) -> Result<Vec<AudioDevice>, AudioError> {
        let default_device = self.host.default_input_device();
        let default_name = default_device.as_ref().and_then(|d| d.name().ok());

        let devices: Vec<AudioDevice> = self
            .host
            .input_devices()
            .map_err(|e| AudioError::ConfigError(e.to_string()))?
            .filter_map(|device| {
                let name = device.name().ok()?;
                let is_default = default_name.as_ref().map(|d| d == &name).unwrap_or(false);
                Some(AudioDevice {
                    id: name.clone(),
                    name,
                    is_default,
                })
            })
            .collect();

        if devices.is_empty() {
            return Err(AudioError::NoDevicesFound);
        }

        Ok(devices)
    }

    /// Get the device to use for recording
    fn get_device(&self) -> Result<Device, AudioError> {
        if let Some(device_id) = &self.settings.device_id {
            // Find specific device
            self.host
                .input_devices()
                .map_err(|e| AudioError::ConfigError(e.to_string()))?
                .find(|d| d.name().ok().as_ref() == Some(device_id))
                .ok_or_else(|| AudioError::DeviceNotFound(device_id.clone()))
        } else {
            // Use default device
            self.host
                .default_input_device()
                .ok_or(AudioError::NoDefaultDevice)
        }
    }

    /// Get the recordings directory
    pub fn get_recordings_dir() -> PathBuf {
        let app_dir = dirs::cache_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("com.evervoice.app")
            .join("recordings");
        let _ = fs::create_dir_all(&app_dir);
        app_dir
    }

    /// Minimum required disk space in bytes (100 MB)
    const MIN_DISK_SPACE_BYTES: u64 = 100 * 1024 * 1024;

    /// Check if there's enough disk space (100MB minimum)
    /// BUG-3 fix: Actually check available disk space
    fn check_disk_space() -> Result<(), AudioError> {
        let recordings_dir = Self::get_recordings_dir();

        // Get available space on the partition where recordings are stored
        match available_space(&recordings_dir) {
            Ok(space) => {
                if space < Self::MIN_DISK_SPACE_BYTES {
                    log::warn!(
                        "Insufficient disk space: {} MB available, {} MB required",
                        space / (1024 * 1024),
                        Self::MIN_DISK_SPACE_BYTES / (1024 * 1024)
                    );
                    return Err(AudioError::InsufficientSpace);
                }
                log::debug!(
                    "Disk space check passed: {} MB available",
                    space / (1024 * 1024)
                );
                Ok(())
            }
            Err(e) => {
                // If we can't check disk space, log warning but continue
                // This is a fallback to avoid blocking recording if fs2 fails
                log::warn!("Could not check disk space: {}. Continuing anyway.", e);
                Ok(())
            }
        }
    }

    /// Get current audio level (0-100)
    pub fn get_level(&self) -> AudioLevel {
        self.current_level.load(Ordering::Relaxed)
    }

    /// Check if currently recording
    pub fn is_recording(&self) -> bool {
        self.is_recording.load(Ordering::Relaxed)
    }

    /// Get stream error if any (BUG-2 fix: Device disconnect handling)
    pub fn get_stream_error(&self) -> Option<String> {
        self.stream_error.lock().ok().and_then(|e| e.clone())
    }

    /// Clear stream error
    pub fn clear_stream_error(&self) {
        if let Ok(mut error) = self.stream_error.lock() {
            *error = None;
        }
    }

    /// Check if the stream had an error (device disconnected, etc.)
    pub fn has_stream_error(&self) -> bool {
        self.stream_error
            .lock()
            .ok()
            .map(|e| e.is_some())
            .unwrap_or(false)
    }

    /// Start recording
    pub fn start_recording(&mut self) -> Result<(), AudioError> {
        if self.is_recording() {
            return Ok(()); // Already recording
        }

        // Clear any previous stream error (BUG-2 fix)
        self.clear_stream_error();

        // Check disk space
        Self::check_disk_space()?;

        let device = self.get_device()?;
        let config = device
            .default_input_config()
            .map_err(|e| AudioError::ConfigError(e.to_string()))?;

        self.source_sample_rate = config.sample_rate().0;
        log::info!(
            "Starting recording with sample rate: {} Hz",
            self.source_sample_rate
        );

        // Clear previous samples
        {
            let mut samples = self.samples.lock().unwrap();
            samples.clear();
        }

        let samples = Arc::clone(&self.samples);
        let is_recording = Arc::clone(&self.is_recording);
        let current_level = Arc::clone(&self.current_level);

        // Create stream based on sample format
        let stream = match config.sample_format() {
            SampleFormat::F32 => self.build_stream::<f32>(
                &device,
                &config.into(),
                samples,
                is_recording.clone(),
                current_level,
            )?,
            SampleFormat::I16 => self.build_stream::<i16>(
                &device,
                &config.into(),
                samples,
                is_recording.clone(),
                current_level,
            )?,
            SampleFormat::U16 => self.build_stream::<u16>(
                &device,
                &config.into(),
                samples,
                is_recording.clone(),
                current_level,
            )?,
            _ => return Err(AudioError::ConfigError("Unsupported sample format".into())),
        };

        stream
            .play()
            .map_err(|e| AudioError::StreamError(e.to_string()))?;

        self.stream.0 = Some(stream);
        self.is_recording.store(true, Ordering::Relaxed);
        self.recording_start = Some(std::time::Instant::now());

        log::info!("Recording started");
        Ok(())
    }

    /// Build the audio input stream
    fn build_stream<T: cpal::Sample + cpal::SizedSample + Send + 'static>(
        &self,
        device: &Device,
        config: &StreamConfig,
        samples: Arc<Mutex<Vec<f32>>>,
        is_recording: Arc<AtomicBool>,
        current_level: Arc<AtomicU8>,
    ) -> Result<Stream, AudioError>
    where
        f32: cpal::FromSample<T>,
    {
        let channels = config.channels as usize;

        // Clone Arcs for error callback (BUG-2 fix: Device disconnect handling)
        let is_recording_err = Arc::clone(&is_recording);
        let stream_error = Arc::clone(&self.stream_error);

        let err_fn = move |err: cpal::StreamError| {
            log::error!("Audio stream error: {}", err);

            // Store the error for later retrieval
            if let Ok(mut error_lock) = stream_error.lock() {
                *error_lock = Some(format!("Stream error: {}", err));
            }

            // Stop recording on error (device likely disconnected)
            is_recording_err.store(false, Ordering::Relaxed);
        };

        let stream = device
            .build_input_stream(
                config,
                move |data: &[T], _: &cpal::InputCallbackInfo| {
                    if !is_recording.load(Ordering::Relaxed) {
                        return;
                    }

                    let mut samples_lock = samples.lock().unwrap();

                    // Convert to f32 and mix to mono
                    let mut sum_squared = 0.0f32;
                    let mut count = 0;

                    for frame in data.chunks(channels) {
                        // Average all channels to mono
                        let mono_sample: f32 =
                            frame.iter().map(|s| f32::from_sample(*s)).sum::<f32>()
                                / channels as f32;

                        samples_lock.push(mono_sample);
                        sum_squared += mono_sample * mono_sample;
                        count += 1;
                    }

                    // Calculate RMS level (0-100)
                    if count > 0 {
                        let rms = (sum_squared / count as f32).sqrt();
                        // Convert to 0-100 scale (assuming max amplitude of 1.0)
                        let level = (rms * 100.0 * 3.0).min(100.0) as u8; // x3 for better sensitivity
                        current_level.store(level, Ordering::Relaxed);
                    }
                },
                err_fn,
                None, // No timeout
            )
            .map_err(|e| AudioError::StreamError(e.to_string()))?;

        Ok(stream)
    }

    /// Stop recording and export to WAV
    pub fn stop_recording(&mut self) -> Result<RecordingResult, AudioError> {
        if !self.is_recording() {
            return Err(AudioError::NotRecording);
        }

        // Stop recording
        self.is_recording.store(false, Ordering::Relaxed);
        self.current_level.store(0, Ordering::Relaxed);

        // Drop the stream to release the microphone
        self.stream.0 = None;

        // Calculate duration
        let duration_ms = self
            .recording_start
            .map(|start| start.elapsed().as_millis() as u64)
            .unwrap_or(0);

        // Get samples
        let samples = {
            let lock = self.samples.lock().unwrap();
            lock.clone()
        };

        if samples.is_empty() {
            return Err(AudioError::WavWriteError("No audio data recorded".into()));
        }

        log::info!(
            "Recording stopped. {} samples at {} Hz, duration: {}ms",
            samples.len(),
            self.source_sample_rate,
            duration_ms
        );

        // Resample to 16kHz if necessary
        let resampled = if self.source_sample_rate != WHISPER_SAMPLE_RATE {
            self.resample(&samples, self.source_sample_rate, WHISPER_SAMPLE_RATE)?
        } else {
            samples
        };

        // Export to WAV
        let file_path = self.export_wav(&resampled)?;

        log::info!("Recording exported to: {}", file_path);

        Ok(RecordingResult {
            file_path,
            duration_ms,
            privacy_mode: self.settings.privacy_mode,
        })
    }

    /// Resample audio to target sample rate
    fn resample(
        &self,
        samples: &[f32],
        source_rate: u32,
        target_rate: u32,
    ) -> Result<Vec<f32>, AudioError> {
        log::info!("Resampling from {} Hz to {} Hz", source_rate, target_rate);

        let params = rubato::SincInterpolationParameters {
            sinc_len: 256,
            f_cutoff: 0.95,
            interpolation: rubato::SincInterpolationType::Linear,
            oversampling_factor: 256,
            window: rubato::WindowFunction::BlackmanHarris2,
        };

        let mut resampler = FftFixedIn::<f32>::new(
            source_rate as usize,
            target_rate as usize,
            samples.len().min(1024),
            2,
            1, // mono
        )
        .map_err(|e| AudioError::WavWriteError(format!("Resampler init failed: {}", e)))?;

        // Process in chunks
        let chunk_size = resampler.input_frames_max();
        let mut output = Vec::new();

        for chunk in samples.chunks(chunk_size) {
            let input = vec![chunk.to_vec()];

            // Pad if necessary
            let input = if chunk.len() < resampler.input_frames_next() {
                let mut padded = chunk.to_vec();
                padded.resize(resampler.input_frames_next(), 0.0);
                vec![padded]
            } else {
                input
            };

            match resampler.process(&input, None) {
                Ok(result) => {
                    if !result.is_empty() && !result[0].is_empty() {
                        output.extend_from_slice(&result[0]);
                    }
                }
                Err(e) => {
                    log::warn!("Resampling chunk failed: {}", e);
                }
            }
        }

        log::info!(
            "Resampling complete: {} -> {} samples",
            samples.len(),
            output.len()
        );
        Ok(output)
    }

    /// Export samples to WAV file
    fn export_wav(&self, samples: &[f32]) -> Result<String, AudioError> {
        let recordings_dir = Self::get_recordings_dir();
        let filename = format!("{}.wav", Uuid::new_v4());
        let file_path = recordings_dir.join(&filename);

        let spec = WavSpec {
            channels: 1,
            sample_rate: WHISPER_SAMPLE_RATE,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let file =
            fs::File::create(&file_path).map_err(|e| AudioError::WavWriteError(e.to_string()))?;
        let writer = BufWriter::new(file);
        let mut wav_writer =
            WavWriter::new(writer, spec).map_err(|e| AudioError::WavWriteError(e.to_string()))?;

        // Convert f32 samples to i16
        for sample in samples {
            // Clamp and convert
            let clamped = sample.clamp(-1.0, 1.0);
            let sample_i16 = (clamped * i16::MAX as f32) as i16;
            wav_writer
                .write_sample(sample_i16)
                .map_err(|e| AudioError::WavWriteError(e.to_string()))?;
        }

        wav_writer
            .finalize()
            .map_err(|e| AudioError::WavWriteError(e.to_string()))?;

        Ok(file_path.to_string_lossy().to_string())
    }

    /// Delete a recording file (for privacy mode)
    /// SECURITY: Only allows deletion of files within the recordings directory
    pub fn delete_recording(file_path: &str) -> Result<(), AudioError> {
        let recordings_dir = Self::get_recordings_dir();
        let path = PathBuf::from(file_path);

        // Canonicalize paths to resolve any "../" or symlinks
        let canonical_path = path
            .canonicalize()
            .map_err(|e| AudioError::WavWriteError(format!("Invalid path: {}", e)))?;
        let canonical_recordings_dir = recordings_dir.canonicalize().map_err(|e| {
            AudioError::WavWriteError(format!("Failed to get recordings dir: {}", e))
        })?;

        // SECURITY: Validate that the file is within the recordings directory
        if !canonical_path.starts_with(&canonical_recordings_dir) {
            log::warn!(
                "Security: Blocked attempt to delete file outside recordings dir: {}",
                file_path
            );
            return Err(AudioError::WavWriteError(
                "Security error: Cannot delete files outside recordings directory".to_string(),
            ));
        }

        fs::remove_file(&canonical_path)
            .map_err(|e| AudioError::WavWriteError(format!("Failed to delete file: {}", e)))?;
        log::info!("Recording deleted: {}", file_path);
        Ok(())
    }

    /// Clean up old recordings in the cache directory
    pub fn cleanup_old_recordings() -> Result<(), AudioError> {
        let recordings_dir = Self::get_recordings_dir();
        if let Ok(entries) = fs::read_dir(&recordings_dir) {
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    // Delete files older than 1 hour
                    if let Ok(modified) = metadata.modified() {
                        if let Ok(age) = std::time::SystemTime::now().duration_since(modified) {
                            if age.as_secs() > 3600 {
                                let _ = fs::remove_file(entry.path());
                                log::info!("Cleaned up old recording: {:?}", entry.path());
                            }
                        }
                    }
                }
            }
        }
        Ok(())
    }
}

impl Default for AudioRecorder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_devices() {
        let recorder = AudioRecorder::new();
        // This might fail on CI without audio devices, so we just check it doesn't panic
        let _ = recorder.list_devices();
    }

    #[test]
    fn test_default_settings() {
        let settings = AudioSettings::default();
        assert_eq!(settings.max_duration_minutes, 6);
        assert!(settings.privacy_mode);
        assert!(settings.device_id.is_none());
    }
}
