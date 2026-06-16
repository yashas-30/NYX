import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { BaseMessage, AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { executeCodeInDocker } from "./dockerSandbox.js";

export interface AgentState {
    messages: BaseMessage[];
    plan: string | null;
    retries: number;
}

const PLANNER_PROMPT = `You are the NYX Architecture Planner.
Your job is to analyze the user's request and create a step-by-step implementation plan.
Focus on architectural soundness, modularity, and error handling.
Do not write code. Output only the plan.`;

const CODER_PROMPT = `You are the NYX Lead Coder.
Your job is to implement the provided plan. 
You must use strict TypeScript and ensure your code is robust.
If you encounter errors from your tools, analyze them carefully and self-correct.`;

const REVIEWER_PROMPT = `You are the NYX Code Reviewer.
Analyze the output and tool execution results. 
If there are errors, point them out so the coder can fix them.
If everything works, finalize the response.`;

const executeCodeTool = {
    name: "execute_code",
    description: "Executes code in a sandboxed Docker environment. Use this to run tsc or tests.",
    schema: {
        type: "object",
        properties: {
            code: {
                type: "string",
                description: "The complete code script to execute"
            },
            language: {
                type: "string",
                enum: ["python", "javascript", "bash", "sh", "typescript"],
                description: "The programming language of the script"
            }
        },
        required: ["code", "language"]
    }
};

export class AgentOrchestrator {
    private graph: ReturnType<typeof this.buildGraph>;

    constructor() {
        this.graph = this.buildGraph();
    }

    private buildGraph() {
        const workflow = new StateGraph<AgentState>({
            channels: {
                messages: {
                    value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
                    default: () => []
                },
                plan: {
                    value: (x: string | null, y: string | null) => y ?? x,
                    default: () => null
                },
                retries: {
                    value: (x: number, y: number) => x + y,
                    default: () => 0
                }
            }
        }) as any;

        workflow.addNode("planner", async (state: any, config: any) => {
            const llm = config?.configurable?.llm;
            if (!llm) throw new Error("LLM not provided to agent node");
            
            const messages = [new SystemMessage(PLANNER_PROMPT), ...state.messages];
            const response = await llm.invoke(messages);
            return { plan: response.content, messages: [response] };
        });

        workflow.addNode("coder", async (state: any, config: any) => {
            const llm = config?.configurable?.llm;
            if (!llm) throw new Error("LLM not provided to agent node");
            
            const context = [
                new SystemMessage(CODER_PROMPT),
                new SystemMessage(`Current Plan:\n${state.plan}`),
                ...state.messages
            ];
            
            const llmWithTools = llm.bindTools([executeCodeTool]);
            const response = await llmWithTools.invoke(context);
            return { messages: [response] };
        });

        workflow.addNode("tools", async (state: any) => {
            const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
            const toolCalls = lastMessage.tool_calls || [];
            
            let hasError = false;
            const toolMessages = await Promise.all(toolCalls.map(async (toolCall: any) => {
                if (toolCall?.name === "execute_code") {
                    try {
                        const { code, language } = toolCall.args || {};
                        const output = await executeCodeInDocker(code, language);
                        
                        // ECC: Detect compilation/execution errors
                        if (output.toLowerCase().includes("error") || output.toLowerCase().includes("exception")) {
                            hasError = true;
                        }
                        
                        return new ToolMessage({
                            content: output,
                            tool_call_id: toolCall?.id || "unknown",
                            name: toolCall?.name || "execute_code"
                        });
                    } catch (e: any) {
                        hasError = true;
                        return new ToolMessage({
                            content: `Execution Failed: ${e.message}`,
                            tool_call_id: toolCall?.id || "unknown",
                            name: toolCall?.name || "execute_code"
                        });
                    }
                }
                return new ToolMessage({
                    content: `Error: Unknown tool ${toolCall?.name}`,
                    tool_call_id: toolCall?.id || "unknown",
                    name: toolCall?.name || "unknown"
                });
            }));

            // If there's an error, increment retry counter
            if (hasError) {
                return { messages: toolMessages, retries: 1 }; // retries channel sums the values
            }

            return { messages: toolMessages, retries: 0 };
        });

        workflow.addNode("reviewer", async (state: any, config: any) => {
            const llm = config?.configurable?.llm;
            if (!llm) throw new Error("LLM not provided to agent node");
            
            const context = [
                new SystemMessage(REVIEWER_PROMPT),
                ...state.messages
            ];
            const response = await llm.invoke(context);
            return { messages: [response] };
        });

        // Edges
        workflow.addEdge(START, "planner");
        workflow.addEdge("planner", "coder");
        
        workflow.addConditionalEdges("coder", (state: any) => {
            const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
            if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
                return "tools";
            }
            return "reviewer";
        });

        workflow.addConditionalEdges("tools", (state: any) => {
            // ECC Self-Correction Loop
            if (state.retries > 0 && state.retries < 3) {
                return "coder"; // Route back to coder to fix the error
            }
            return "reviewer";
        });

        workflow.addEdge("reviewer", END);

        const checkpointer = new MemorySaver();
        return workflow.compile({ checkpointer });
    }

    async runAgent(messages: BaseMessage[], llm: any, threadId: string) {
        const config = { 
            configurable: { 
                thread_id: threadId,
                llm: llm
            } 
        };
        
        const finalState = await this.graph.invoke({ messages, retries: 0, plan: null }, config);
        return finalState.messages;
    }
}
