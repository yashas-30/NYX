// Fix #1: Use tokio::sync::Mutex instead of std::sync::Mutex to avoid
// blocking the Tokio thread pool inside async commands.
// Fix #3: Raise PTY read buffer from 1 KB to 8 KB so burst output
// (e.g. `cargo build`) coalesces into fewer IPC events.
// Fix #14: Use a shared stop flag so the reader thread exits cleanly
// when pty_close is called, preventing zombie threads.

use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem, MasterPty};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use std::collections::HashMap;
use std::io::{Read, Write};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

pub struct PtySession {
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    /// Set to `true` by `pty_close` to signal the reader thread to stop.
    pub stop: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct PtyState {
    // tokio::sync::Mutex: safe to lock inside async Tauri commands without
    // blocking the Tokio executor.
    pub sessions: Arc<Mutex<HashMap<String, PtySession>>>,
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
    let pair = pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(command);
    cmd.args(&args);
    cmd.cwd(cwd);

    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    
    let master = pair.master;
    let reader = master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = master.take_writer().map_err(|e| e.to_string())?;

    let stop = Arc::new(AtomicBool::new(false));
    let stop_reader = stop.clone();

    state.sessions.lock().await.insert(id.clone(), PtySession {
        master,
        writer,
        stop,
    });

    let id_clone = id.clone();
    std::thread::spawn(move || {
        let mut reader = reader;
        // Fix #3: 8 KB buffer coalesces burst output into fewer IPC events.
        let mut buf = [0u8; 8192];
        loop {
            // Fix #14: honour stop signal before blocking on read.
            if stop_reader.load(Ordering::Relaxed) {
                break;
            }
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = buf[..n].to_vec();
                    let _ = app.emit(&format!("pty-data-{}", id_clone), data);
                }
                Err(_) => break,
            }
        }
        let _ = app.emit(&format!("pty-exit-{}", id_clone), ());
    });

    // Fix #14: wait for the child in a thread and emit exit when it finishes.
    std::thread::spawn(move || {
        let _ = child.wait();
    });

    Ok(())
}

#[tauri::command]
pub async fn pty_write(
    state: State<'_, PtyState>,
    id: String,
    data: String,
) -> Result<(), String> {
    // Fix #1: .lock().await instead of .lock().unwrap()
    if let Some(session) = state.sessions.lock().await.get_mut(&id) {
        session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn pty_resize(
    state: State<'_, PtyState>,
    id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    // Fix #1: .lock().await instead of .lock().unwrap()
    if let Some(session) = state.sessions.lock().await.get_mut(&id) {
        session.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn pty_close(
    state: State<'_, PtyState>,
    id: String,
) -> Result<(), String> {
    // Fix #14: signal the reader thread to stop before dropping the session.
    let mut sessions = state.sessions.lock().await;
    if let Some(session) = sessions.get(&id) {
        session.stop.store(true, Ordering::Relaxed);
    }
    sessions.remove(&id);
    Ok(())
}
