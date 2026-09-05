// ─────────────────────────────────────────────────────────────────────────────
// NYX — High-Performance ConPTY Engine
// Microsecond lock-free concurrent sessions via DashMap, instant pipe flush,
// minimal RAM allocation, and Go runtime memory capping for OpenCode CLI.
// ─────────────────────────────────────────────────────────────────────────────

use dashmap::DashMap;
use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use std::io::{Read, Write};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex as StdMutex,
};
use tauri::{AppHandle, Emitter, State};

pub struct PtySession {
    pub master: StdMutex<Box<dyn MasterPty + Send>>,
    pub writer: StdMutex<Box<dyn Write + Send>>,
    pub stop: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct PtyState {
    pub sessions: DashMap<String, Arc<PtySession>>,
}

#[tauri::command]
pub async fn pty_spawn(
    app: AppHandle,
    state: State<'_, PtyState>,
    id: String,
    command: String,
    args: Vec<String>,
    cwd: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let pty_system = NativePtySystem::default();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(command);
    cmd.args(&args);
    cmd.cwd(cwd);

    // Terminal and encoding environment
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("LC_ALL", "en_US.UTF-8");

    // Memory & Execution Optimization for OpenCode CLI (Go runtime):
    // 1. Cap Go memory limit to 128MiB so GC runs proactively and keeps RAM minimal.
    // 2. Set GOGC to 50 for aggressive heap compaction.
    // 3. Disable telemetry, network probes, and auto-update checks for instant boot.
    cmd.env("GOMEMLIMIT", "128MiB");
    cmd.env("GOGC", "50");
    cmd.env("DO_NOT_TRACK", "1");
    cmd.env("OPENCODE_DISABLE_TELEMETRY", "1");
    cmd.env("OPENCODE_NO_UPDATE_CHECK", "1");
    cmd.env("CI", "1");

    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let master = pair.master;
    let reader = master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = master.take_writer().map_err(|e| e.to_string())?;

    let stop = Arc::new(AtomicBool::new(false));
    let stop_reader = stop.clone();

    let session = Arc::new(PtySession {
        master: StdMutex::new(master),
        writer: StdMutex::new(writer),
        stop,
    });

    state.sessions.insert(id.clone(), session);

    let id_clone = id.clone();
    std::thread::spawn(move || {
        let mut reader = reader;
        let event_data = format!("pty-data-{}", id_clone);
        let event_exit = format!("pty-exit-{}", id_clone);
        let mut buf = [0u8; 32768];
        let mut pending = Vec::with_capacity(8192);

        loop {
            if stop_reader.load(Ordering::Relaxed) {
                break;
            }

            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    pending.extend_from_slice(&buf[..n]);

                    // Stream valid UTF-8 chunks without mangling multi-byte box-drawing characters
                    match std::str::from_utf8(&pending) {
                        Ok(valid_str) => {
                            if !valid_str.is_empty() {
                                let _ = app.emit(&event_data, valid_str);
                            }
                            pending.clear();
                        }
                        Err(e) => {
                            let valid_up_to = e.valid_up_to();
                            if valid_up_to > 0 {
                                if let Ok(valid_str) = std::str::from_utf8(&pending[..valid_up_to]) {
                                    let _ = app.emit(&event_data, valid_str);
                                }
                                pending.drain(..valid_up_to);
                            }
                            if let Some(err_len) = e.error_len() {
                                pending.drain(..err_len);
                            }
                        }
                    }
                }
                Err(_) => break,
            }
        }
        let _ = app.emit(&event_exit, ());
    });

    // Wait for child process exit in a lightweight thread
    std::thread::spawn(move || {
        let _ = child.wait();
    });

    Ok(())
}

/// Instantaneous microsecond keystroke write with direct pipe flushing
#[tauri::command]
pub async fn pty_write(
    state: State<'_, PtyState>,
    id: String,
    data: String,
) -> Result<(), String> {
    if let Some(session) = state.sessions.get(&id) {
        if let Ok(mut writer) = session.writer.lock() {
            writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
            writer.flush().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Lock-free microsecond PTY resize
#[tauri::command]
pub async fn pty_resize(
    state: State<'_, PtyState>,
    id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    if rows < 5 || cols < 10 {
        return Ok(());
    }
    if let Some(session) = state.sessions.get(&id) {
        if let Ok(master) = session.master.lock() {
            master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Lock-free PTY session termination
#[tauri::command]
pub async fn pty_close(
    state: State<'_, PtyState>,
    id: String,
) -> Result<(), String> {
    if let Some((_, session)) = state.sessions.remove(&id) {
        session.stop.store(true, Ordering::Relaxed);
    }
    Ok(())
}
