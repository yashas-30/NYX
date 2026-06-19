import sqlite3
import json
from typing import List, Dict, Any

class MemorySystem:
    """
    2026 Standard: Tiered Memory Architecture.
    Handles episodic memory (what the agent tried/failed at previously) and
    provides the durable checkpointer for LangGraph state persistence.
    """
    def __init__(self, db_path: str = "agent_memory.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS episodic_memory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_intent TEXT,
                    action_taken TEXT,
                    outcome TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')

    def log_episode(self, intent: str, action: str, outcome: str):
        """
        Logs a State-Action-Observation triplet to prevent repeating mistakes.
        """
        print(f"[Memory] Logging episodic memory: {intent} -> {outcome}")
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO episodic_memory (task_intent, action_taken, outcome) VALUES (?, ?, ?)",
                (intent, action, outcome)
            )

    def retrieve_relevant_episodes(self, current_intent: str) -> List[Dict[str, Any]]:
        """
        Retrieves past experiences related to the current intent (Mocked retrieval).
        In a real 2026 app, this would use a Graph RAG or Vector DB.
        """
        print(f"[Memory] Retrieving past episodes for intent: {current_intent}")
        # Mock retrieval
        return [
            {"action": "Tried direct API call without auth", "outcome": "Failed with 401. Need to authenticate via MCP first."}
        ]

# Note: For durable execution, you would use `langgraph.checkpoint.sqlite.SqliteSaver`
# passing the sqlite connection to the compiled graph in `graph.py`.
