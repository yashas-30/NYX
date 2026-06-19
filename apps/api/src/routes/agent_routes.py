from fastapi import APIRouter, Request, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import asyncio
import uuid
import json

from temporalio.client import Client
from src.agents.temporal_worker import AgenticOrchestrationWorkflow

router = APIRouter()

class PromptRequest(BaseModel):
    prompt: str

@router.post("/trigger_workflow")
async def trigger_workflow(req: PromptRequest):
    """
    Triggers the Durable Temporal Workflow. 
    Returns immediately with a thread_id / run_id to avoid HTTP timeouts.
    """
    try:
        client = await Client.connect("localhost:7233")
    except Exception as e:
        return {"error": f"Failed to connect to Temporal: {e}"}

    thread_id = str(uuid.uuid4())
    workflow_id = f"agent-run-{thread_id}"

    # Start the workflow asynchronously (Fire and forget from FastAPI's perspective)
    try:
        handle = await client.start_workflow(
            AgenticOrchestrationWorkflow.run,
            args=[req.prompt, thread_id],
            id=workflow_id,
            task_queue="agent-task-queue",
        )
    except Exception as e:
        return {"error": str(e)}

    return {"message": "Workflow started successfully", "thread_id": thread_id, "workflow_id": workflow_id}

@router.get("/stream/{workflow_id}")
async def stream_workflow_updates(workflow_id: str, request: Request):
    """
    AG-UI Protocol implementation via Server-Sent Events (SSE).
    This streams the status of the Temporal workflow to the Generative UI frontend.
    """
    async def event_generator():
        try:
            client = await Client.connect("localhost:7233")
            handle = client.get_workflow_handle(workflow_id)
        except Exception:
            yield f"data: {json.dumps({'type': 'ERROR', 'content': 'Could not connect to workflow'})}\n\n"
            return
        
        # AG-UI Event: Initial state snapshot
        yield f"data: {json.dumps({'type': 'STATE_SNAPSHOT_', 'status': 'Starting Handoff Logic...'})}\n\n"

        # Simulating streaming updates while waiting for the Temporal workflow to finish.
        # In a full production system, we would query the workflow handle or use Temporal Signals/Queries
        # to get live progress updates (e.g., "Tool Call: Web Search").
        
        try:
            # Await the final result of the workflow execution
            # In a real streaming setup, we'd loop over an event stream or queue here.
            result = await handle.result()
            
            # Final output mapping
            yield f"data: {json.dumps({'type': 'TEXT_MESSAGE_', 'content': result})}\n\n"
            yield f"data: {json.dumps({'type': 'STATE_SNAPSHOT_', 'status': 'Complete'})}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'type': 'ERROR', 'content': f'Workflow failed: {str(e)}'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
