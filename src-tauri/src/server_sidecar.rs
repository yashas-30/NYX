use std::process::Stdio;
use tokio::process::{Child, Command};
use tokio::time::{sleep, Duration};
use tokio::net::TcpListener;
use tracing::{info, warn};
use tauri::{AppHandle, Manager};

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::Mutex;

pub struct ServerManager {
    app_handle: AppHandle,
    child: Arc<Mutex<Option<Child>>>,
    pub express_port: u16,
    pub fastify_port: u16,
    pub scrapling_port: u16,
    restart_attempts: u32,
    is_shutting_down: Arc<AtomicBool>,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct ServerPorts {
    pub express_port: u16,
    pub fastify_port: u16,
    pub scrapling_port: u16,
}

impl ServerManager {
    pub async fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            child: Arc::new(Mutex::new(None)),
            express_port: 3010,
            fastify_port: 3011,
            scrapling_port: 3012,
            restart_attempts: 0,
            is_shutting_down: Arc::new(AtomicBool::new(false)),
        }
    }

    pub async fn start(&mut self) -> anyhow::Result<ServerPorts> {
        self.express_port = find_free_port(3010).await?;
        self.fastify_port = find_free_port(self.express_port + 1).await?;
        self.scrapling_port = find_free_port(self.fastify_port + 1).await?;

        info!("Starting NYX servers: Express={}, Fastify={}, Scrapling={}",
            self.express_port, self.fastify_port, self.scrapling_port);

        self.spawn().await?;
        wait_for_port(self.express_port, "127.0.0.1", 90000).await?;

        Ok(ServerPorts {
            express_port: self.express_port,
            fastify_port: self.fastify_port,
            scrapling_port: self.scrapling_port,
        })
    }

    async fn spawn(&mut self) -> anyhow::Result<()> {
        if self.is_shutting_down.load(Ordering::SeqCst) { return Ok(()); }

        let server_path_buf = get_server_path(&self.app_handle)?;
        let mut server_path_str = server_path_buf.to_string_lossy().into_owned();
        if server_path_str.starts_with("\\\\?\\") {
            server_path_str = server_path_str.replace("\\\\?\\", "");
        }
        let server_path = std::path::PathBuf::from(server_path_str);
        
        let node_exe = get_local_node_path();
        info!("Spawning Node.js server using: {} from: {}", node_exe.display(), server_path.display());

        let mut cmd = Command::new(node_exe);
        if let Some(parent) = server_path.parent() {
            cmd.current_dir(parent);
        }
        
        cmd.arg(&server_path)
            .env("PORT", self.express_port.to_string())
            .env("FASTIFY_PORT", self.fastify_port.to_string())
            .env("SCRAPLING_PORT", self.scrapling_port.to_string())
            .env("NODE_ENV", if cfg!(debug_assertions) { "development" } else { "production" })
            .env("IS_PACKAGED", if cfg!(debug_assertions) { "false" } else { "true" })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        if !cfg!(debug_assertions) {
            if let Ok(resource_dir) = self.app_handle.path().resource_dir() {
                let mut node_path = resource_dir.join("node_modules").to_string_lossy().into_owned();
                if node_path.starts_with("\\\\?\\") {
                    node_path = node_path.replace("\\\\?\\", "");
                }
                cmd.env("NODE_PATH", node_path);
            }
        }

        let mut child = cmd.spawn()?;

        if let Some(stdout) = child.stdout.take() {
            tokio::spawn(async move {
                use tokio::io::{AsyncBufReadExt, BufReader};
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    info!(target: "nyx::server::stdout", "{}", line);
                }
            });
        }

        if let Some(stderr) = child.stderr.take() {
            tokio::spawn(async move {
                use tokio::io::{AsyncBufReadExt, BufReader};
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    warn!(target: "nyx::server::stderr", "{}", line);
                }
            });
        }

        let child_arc = self.child.clone();
        *child_arc.lock().await = Some(child);
        self.restart_attempts = 0;

        let is_shutting_down = self.is_shutting_down.clone();
        let server_path_clone = server_path.clone();
        let express_port = self.express_port;
        let fastify_port = self.fastify_port;
        let scrapling_port = self.scrapling_port;

        tokio::spawn(async move {
            let mut restart_count = 0;
            loop {
                tokio::time::sleep(Duration::from_secs(1)).await;
                if is_shutting_down.load(Ordering::SeqCst) {
                    break;
                }

                let mut exited = false;
                if let Ok(mut guard) = child_arc.try_lock() {
                    if let Some(c) = guard.as_mut() {
                        match c.try_wait() {
                            Ok(Some(_)) => exited = true,
                            _ => {}
                        }
                    }
                }

                if exited {
                    if restart_count >= 3 {
                        tracing::error!("Node.js server failed to restart after 3 attempts");
                        break;
                    }
                    tracing::warn!("Node.js server crashed, restarting...");
                    tokio::time::sleep(Duration::from_secs(2u64.pow(restart_count))).await;
                    restart_count += 1;

                    let node_exe = get_local_node_path();
                    let mut cmd = Command::new(&node_exe);
                    if let Some(parent) = server_path_clone.parent() {
                        cmd.current_dir(parent);
                    }
                    cmd.arg(&server_path_clone)
                        .env("PORT", express_port.to_string())
                        .env("FASTIFY_PORT", fastify_port.to_string())
                        .env("SCRAPLING_PORT", scrapling_port.to_string())
                        .env("NODE_ENV", if cfg!(debug_assertions) { "development" } else { "production" })
                        .env("IS_PACKAGED", if cfg!(debug_assertions) { "false" } else { "true" })
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .kill_on_drop(true);

                    if let Ok(new_child) = cmd.spawn() {
                        if let Ok(mut guard) = child_arc.try_lock() {
                            *guard = Some(new_child);
                        }
                    }
                }
            }
        });

        Ok(())
    }

    pub async fn shutdown(&mut self) -> anyhow::Result<()> {
        self.is_shutting_down.store(true, Ordering::SeqCst);
        let mut child_opt = self.child.lock().await.take();
        if let Some(mut child) = child_opt {
            info!("Shutting down Node.js server...");
            child.kill().await.ok();
            let timeout = sleep(Duration::from_secs(10));
            tokio::pin!(timeout);
            tokio::select! {
                _ = child.wait() => { info!("Server exited gracefully"); }
                _ = &mut timeout => { warn!("Server force kill"); child.kill().await.ok(); }
            }
        }
        cleanup_llama_server().await;
        Ok(())
    }
}

async fn find_free_port(start: u16) -> anyhow::Result<u16> {
    for port in start..=65535 {
        match TcpListener::bind(("127.0.0.1", port)).await {
            Ok(listener) => { drop(listener); return Ok(port); }
            Err(_) => continue,
        }
    }
    anyhow::bail!("No free ports available")
}

async fn wait_for_port(port: u16, host: &str, timeout_ms: u64) -> anyhow::Result<()> {
    let start = std::time::Instant::now();
    while start.elapsed() < Duration::from_millis(timeout_ms) {
        match tokio::net::TcpStream::connect((host, port)).await {
            Ok(_) => return Ok(()),
            Err(_) => sleep(Duration::from_millis(100)).await,
        }
    }
    anyhow::bail!("Timeout waiting for port {} after 90 seconds", port)
}

fn get_server_path(app_handle: &AppHandle) -> anyhow::Result<std::path::PathBuf> {
    if cfg!(debug_assertions) {
        let mut dir = std::env::current_dir()?;
        if dir.ends_with("src-tauri") {
            dir.pop();
        }
        return Ok(dir.join("dist-server").join("server.mjs"));
    }
    let resource_dir = app_handle.path().resource_dir()?;
    let direct_path = resource_dir.join("dist-server").join("server.mjs");
    if direct_path.exists() {
        return Ok(direct_path);
    }
    let up_path = resource_dir.join("_up_").join("dist-server").join("server.mjs");
    if up_path.exists() {
        return Ok(up_path);
    }
    // Fallback if neither found (will likely fail on spawn)
    Ok(direct_path)
}

async fn cleanup_llama_server() {
    #[cfg(windows)]
    { let _ = Command::new("taskkill").args(&["/f", "/im", "llama-server.exe"]).output().await; }
    #[cfg(not(windows))]
    { let _ = Command::new("killall").args(&["-9", "llama-server"]).output().await; }
}

fn get_local_node_path() -> std::path::PathBuf {
    if let Ok(mut dir) = std::env::current_dir() {
        if dir.ends_with("src-tauri") {
            dir.pop();
        }
        #[cfg(windows)]
        let node_bin = dir.join("node_modules").join("node").join("bin").join("node.exe");
        #[cfg(not(windows))]
        let node_bin = dir.join("node_modules").join("node").join("bin").join("node");

        if node_bin.exists() {
            return node_bin;
        }
    }
    std::path::PathBuf::from("node")
}
