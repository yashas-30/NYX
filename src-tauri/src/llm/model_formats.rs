// src-tauri/src/llm/model_formats.rs
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelFormat {
    Gguf,
    Onnx,
    Safetensors,
    WhisperGgml,
    Ggml,
    PyTorch,
    CoreMl,
    TensorRt,
    Unknown,
}

impl ModelFormat {
    pub fn from_extension(path: &Path) -> Self {
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            match ext.to_lowercase().as_str() {
                "gguf" => {
                    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_lowercase();
                    if file_name.contains("whisper") {
                        ModelFormat::WhisperGgml
                    } else {
                        ModelFormat::Gguf
                    }
                }
                "onnx" => ModelFormat::Onnx,
                "safetensors" => ModelFormat::Safetensors,
                "ckpt" | "pt" | "pth" => ModelFormat::PyTorch,
                "ggml" => ModelFormat::Ggml,
                "mlmodel" | "mlpackage" => ModelFormat::CoreMl,
                "engine" | "plan" => ModelFormat::TensorRt,
                "bin" => {
                    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_lowercase();
                    if file_name.contains("whisper") {
                        ModelFormat::WhisperGgml
                    } else if file_name.contains("ggml") {
                        ModelFormat::Ggml
                    } else {
                        ModelFormat::PyTorch
                    }
                }
                _ => ModelFormat::Unknown,
            }
        } else {
            ModelFormat::Unknown
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            ModelFormat::Gguf => "GGUF",
            ModelFormat::Onnx => "ONNX",
            ModelFormat::Safetensors => "Safetensors",
            ModelFormat::WhisperGgml => "Whisper GGML",
            ModelFormat::Ggml => "GGML",
            ModelFormat::PyTorch => "PyTorch",
            ModelFormat::CoreMl => "CoreML",
            ModelFormat::TensorRt => "TensorRT",
            ModelFormat::Unknown => "Unknown Format",
        }
    }
}
