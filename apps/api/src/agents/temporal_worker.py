from datetime import timedelta
from temporalio import activity, workflow
from temporalio.client import Client
from temporalio.worker import Worker

import asyncio

# Need to run these inside the worker/activity context, so we import them here
from src.router.triage_agent import get_handoff_target
from src.agents.research_graph import run_research_workflow
from src.agents.opencode_crew import run_coding_crew

@activity.defn
async def triage_activity(prompt: str) -> str:
    """Uses the local Gemma-paradigm Semantic Router to find the handoff target."""
    target = get_handoff_target(prompt)
    return target

@activity.defn
async def execute_research_activity(prompt: str, thread_id: str) -> str:
    """Executes the strict LangGraph workflow."""
    # In production, we'd run sync code in a thread pool or convert it to async
    return run_research_workflow(prompt, thread_id)

@activity.defn
async def execute_coding_activity(prompt: str) -> str:
    """Executes the AutoGen autonomous loop."""
    # AutoGen chat is synchronous
    result = run_coding_crew(prompt)
    # Convert chat history list to string summary
    if isinstance(result, list):
        return "\n".join([msg.get("content", "") for msg in result])
    return str(result)

@workflow.defn
class AgenticOrchestrationWorkflow:
    @workflow.run
    async def run(self, prompt: str, thread_id: str) -> str:
        # 1. Triage the prompt locally
        target = await workflow.execute_activity(
            triage_activity,
            prompt,
            start_to_close_timeout=timedelta(seconds=10),
        )

        # 2. Handoff to the designated agent/workflow
        if target == "research_workflow":
            return await workflow.execute_activity(
                execute_research_activity,
                args=[prompt, thread_id],
                start_to_close_timeout=timedelta(minutes=5),
            )
        elif target == "code_generator":
            return await workflow.execute_activity(
                execute_coding_activity,
                prompt,
                start_to_close_timeout=timedelta(minutes=15),
            )
        else:
            return f"Handled by local fallback (Chitchat/System Ops). Intent was: {target}"

async def main():
    """Starts the Temporal Worker."""
    client = await Client.connect("localhost:7233")
    
    worker = Worker(
        client,
        task_queue="agent-task-queue",
        workflows=[AgenticOrchestrationWorkflow],
        activities=[triage_activity, execute_research_activity, execute_coding_activity],
    )
    
    print("Starting Temporal Worker for NYX Agents...")
    await worker.run()

if __name__ == "__main__":
    asyncio.run(main())
