import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { BaseMessage, AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { executeCodeInDocker } from "./dockerSandbox.js";
import z from "zod";

export interface AgentState {
    messages: BaseMessage[];
    plan: string | null;
    retries: number;
}

// Critique schema for structured output
const CritiqueSchema = z.object({
    isPassing: z.boolean(),
    score: z.number().min(0).max(10),
    flaws: z.array(z.string()),
    feedback: z.string()
});

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

const CRITIC_PROMPT = `You are the NYX Critic.
Your job is to critically evaluate the reviewed code and provide structured feedback.
Check for correctness, completeness, adherence to the plan, code quality, and potential issues.
Be honest and constructive in your feedback.
Return your critique as a JSON object with the following fields:
- isPassing: boolean indicating if the code meets the required standard
- score: number from 0-10 representing the quality score
- flaws: array of strings detailing specific issues found
- feedback: string with overall feedback and suggestions for improvement`;

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
    private generatorLlm: any;
    private criticLlm: any;

    constructor(generatorLlm: any, criticLlm: any) {
        this.generatorLlm = generatorLlm;
        this.criticLlm = criticLlm;
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
        });

        workflow.addNode("planner", async (state: AgentState, config: any) => {
            const llm = this.generatorLlm;
            if (!llm) throw new Error("LLM not provided to agent node");

            const messages = [new SystemMessage(PLANNER_PROMPT), ...state.messages];
            const response = await llm.invoke(messages);
            return { plan: response.content, messages: [response] };
        });

        workflow.addNode("coder", async (state: AgentState, config: any) => {
            const llm = this.generatorLlm;
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

        workflow.addNode("tools", async (state: AgentState) => {
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

        workflow.addNode("reviewer", async (state: AgentState, config: any) => {
            const llm = this.generatorLlm;
            if (!llm) throw new Error("LLM not provided to agent node");

            const context = [
                new SystemMessage(REVIEWER_PROMPT),
                ...state.messages
            ];
            const response = await llm.invoke(context);
            return { messages: [response] };
        });

        workflow.addNode("critique", async (state: AgentState, config: any) => {
            const llm = this.criticLlm;
            if (!llm) throw new Error("Critic LLM not provided to agent node");

            const context = [
                new SystemMessage(CRITIC_PROMPT),
                ...state.messages
            ];

            // Use structured output with CritiqueSchema
            const structuredLlm = llm.withStructuredOutput(CritiqueSchema);
            const critiqueResult = await structuredLlm.invoke(context);

            // We'll store the critique in the messages as an AIMessage for transparency
            const critiqueMessage = new AIMessage({
                content: JSON.stringify(critiqueResult, null, 2)
            });

            return { messages: [critiqueMessage] };
        });

        // Edges
        workflow.addEdge(START, "planner");
        workflow.addEdge("planner", "coder");

        workflow.addConditionalEdges("coder", (state: AgentState) => {
            const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
            if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
                return "tools";
            }
            return "reviewer";
        });

        workflow.addConditionalEdges("tools", (state: AgentState) => {
            // ECC Self-Correction Loop
            if (state.retries > 0 && state.retries < 3) {
                return "coder"; // Route back to coder to fix the error
            }
            return "reviewer";
        });

        workflow.addEdge("reviewer", "critique");

        workflow.addConditionalEdges("critique", (state: AgentState) => {
            const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
            let critiqueResult;
            try {
                critiqueResult = JSON.parse(lastMessage.content);
            } catch (e) {
                // If parsing fails, assume we need to revise
                return "coder";
            }

            // If the critique passes, end; otherwise, go back to coder for revision
            if (critiqueResult.isPassing) {
                return END;
            }
            return "coder";
        });

        const checkpointer = new MemorySaver();
        return workflow.compile({ checkpointer });
    }

    async *runAgent(messages: BaseMessage[], threadId: string): AsyncGenerator<AgentState> {
        const config = {
            configurable: {
                thread_id: threadId
            }
        };

        // Stream the state updates
        for await (const chunk of this.graph.stream({ messages, retries: 0, plan: null }, config)) {
            yield chunk;
        }
    }
}