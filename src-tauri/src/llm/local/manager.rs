// ─────────────────────────────────────────────────────────────────────────────
// NYX — Manager & Lifecycle Submodule
// ─────────────────────────────────────────────────────────────────────────────

use std::sync::LazyLock;
use tokio::process::{Child, Command as TokioCommand};
use tokio::sync::Mutex;
use tracing::info;

pub static SERVER_PORT: std::sync::atomic::AtomicU16 = std::sync::atomic::AtomicU16::new(8080);
pub const SERVER_HOST: &str = "127.0.0.1";
pub const SERVER_READY_TIMEOUT_SECS: u64 = 180;

pub static HEALTH_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .expect("Failed to build health-check HTTP client")
});

pub trait CommandExtWindows {
    fn hide_window(&mut self) -> &mut Self;
}

impl CommandExtWindows for TokioCommand {
    fn hide_window(&mut self) -> &mut Self {
        #[cfg(target_os = "windows")]
        {
            self.creation_flags(0x08000000);
        }
        self
    }
}

pub struct LlamaManager {
    pub process: Mutex<Option<Child>>,
}

impl LlamaManager {
    pub fn new() -> Self {
        Self {
            process: Mutex::new(None),
        }
    }

    pub async fn stop(&self) {
        let mut guard = self.process.lock().await;
        if let Some(mut child) = guard.take() {
            info!("[LlamaManager] Stopping server...");
            let _ = child.kill().await;
            let _ = child.wait().await;
        }
        Self::kill_orphans().await;
    }

    pub async fn kill_orphans() {
        let (pids_to_kill, _) = tokio::task::spawn_blocking(|| {
            let mut sys = sysinfo::System::new_all();
            sys.refresh_processes();
            let mut pids = Vec::new();
            for (pid, process) in sys.processes() {
                let name = process.name().to_lowercase();
                if name.contains("llama-server") {
                    pids.push(pid.as_u32());
                }
            }
            (pids, sys)
        })
        .await
        .unwrap_or((Vec::new(), sysinfo::System::new()));

        #[cfg(target_os = "windows")]
        for pid in pids_to_kill {
            let _ = tokio::process::Command::new("taskkill")
                .hide_window()
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .output()
                .await;
        }
        #[cfg(not(target_os = "windows"))]
        for pid in pids_to_kill {
            let _ = tokio::process::Command::new("kill")
                .args(["-9", &pid.to_string()])
                .output()
                .await;
        }
    }
}
