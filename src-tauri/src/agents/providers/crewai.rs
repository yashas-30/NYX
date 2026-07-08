use std::sync::Arc;
use tauri::AppHandle;
use sqlx::SqlitePool;
use sruim_crewai::crew::Crew as NativeCrew;

// We redefine these loosely to maintain API boundaries with Conductor
pub enum Process {
    Sequential,
    Hierarchical,
}

pub struct Crew {
    pub process: Process,
    pub mcp_manager: Arc<crate::commands::mcp::McpManager>,
    pub app_handle: AppHandle,
    pub db_pool: Option<SqlitePool>,
    pub native_crew: NativeCrew,
}

impl Crew {
    pub fn new(
        process: Process, 
        mcp_manager: Arc<crate::commands::mcp::McpManager>,
        app_handle: AppHandle,
        db_pool: Option<SqlitePool>,
    ) -> Self {
        Self {
            process,
            mcp_manager,
            app_handle,
            db_pool,
            native_crew: NativeCrew::new(),
        }
    }

    pub async fn kickoff(&mut self, _initial_context: &str, _current_event_name: &Option<String>) -> Result<String, String> {
        // Native sruim_crewai execution
        // We trigger kickoff_simple or kickoff_dag on the native crew.
        match self.native_crew.kickoff().await {
            Ok(res) => Ok(res),
            Err(e) => Err(format!("Native CrewAI Execution Failed: {}", e)),
        }
    }
}
