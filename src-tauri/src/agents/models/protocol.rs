use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CognitiveRole {
    Thinker,
    Worker,
    Verifier,
    Synthesizer,
    SpecWriter,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DagNodeState {
    pub node_id: String,
    pub role: CognitiveRole,
    pub status: String,
    pub task_description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DagEvent {
    NodeStatusUpdate(DagNodeState),
    FinalResult(String),
    Error(String),
}

/// Messages sent to the Conductor Actor
#[derive(Debug)]
pub enum ConductorMessage {
    RunTask {
        prompt: String,
        api_key: String,
        cloud_model: Option<String>,
        local_model: Option<String>,
        model_strategy: Option<String>,
        reply_to: tokio::sync::oneshot::Sender<Result<String, String>>,
        event_name: Option<String>,
        is_fast_intent: bool,
    },
    WorkerUpdate {
        node_id: String,
        status: String,
    },
    WorkerComplete {
        node_id: String,
        result: String,
    },
    GatekeeperFailure {
        node_id: String,
        prompt: String,
        failure_type: String,
        assertion_error: String,
    },
    WorkerChunk {
        node_id: String,
        content: String,
    },
    ToolCall {
        node_id: String,
        tool_name: String,
        tool_args: String,
    },
    ToolResult {
        node_id: String,
        tool_name: String,
        result: String,
    },
    WorkerFailed {
        node_id: String,
        error: String,
    },
}

/// Messages sent to the Worker Actor
#[derive(Debug)]
pub enum WorkerMessage {
    ExecuteTask {
        task_description: String,
        context_refs: Vec<String>,
    },
}
