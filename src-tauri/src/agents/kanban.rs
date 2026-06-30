use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use super::conductor::FuguTask;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    Failed(String),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct KanbanState {
    pub tasks: HashMap<String, KanbanTask>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct KanbanTask {
    pub task: FuguTask,
    pub status: TaskStatus,
}

pub struct KanbanBoard {
    pub state: KanbanState,
    pub file_path: PathBuf,
}

impl KanbanBoard {
    pub fn new(tasks: Vec<FuguTask>) -> Self {
        let mut app_data = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        app_data.push("com.nyx.desktop");
        app_data.push("kanban");
        
        if !app_data.exists() {
            let _ = fs::create_dir_all(&app_data);
        }
        app_data.push("state.json");
        
        let mut task_map = HashMap::new();
        for task in tasks {
            task_map.insert(task.node_id.clone(), KanbanTask {
                task,
                status: TaskStatus::Pending,
            });
        }
        
        let board = Self {
            state: KanbanState { tasks: task_map },
            file_path: app_data,
        };
        board.save();
        board
    }
    
    pub fn save(&self) {
        if let Ok(json) = serde_json::to_string_pretty(&self.state) {
            let _ = fs::write(&self.file_path, json);
        }
    }
    
    pub fn mark_in_progress(&mut self, node_id: &str) {
        if let Some(t) = self.state.tasks.get_mut(node_id) {
            t.status = TaskStatus::InProgress;
            self.save();
        }
    }
    
    pub fn mark_completed(&mut self, node_id: &str) {
        if let Some(t) = self.state.tasks.get_mut(node_id) {
            t.status = TaskStatus::Completed;
            self.save();
        }
    }
    
    pub fn mark_failed(&mut self, node_id: &str, error: String) {
        if let Some(t) = self.state.tasks.get_mut(node_id) {
            t.status = TaskStatus::Failed(error);
            self.save();
        }
    }
}
