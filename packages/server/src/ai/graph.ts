import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { BaseMessage, AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { executeCodeInDocker } from "./dockerSandbox.js";

export interface AgentState {
    messages: BaseMessage[];
}

const executeCodeTool = {
    name: "execute_code",
    description: "Executes Python, Javascript/Node, or Bash code in a sandboxed Docker environment. Returns the standard output.",
    schema: {
        type: "object",
        properties: {
            code: {
                type: "string",
                description: "The code to execute"
            },
            language: {
                type: "string",
                enum: ["python", "javascript", "bash", "sh"],
                description: "The language of the code"
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
                }
            }
        }) as any;

        workflow.addNode("agent", async (state, config) => {
            const llm = config?.configurable?.llm;
            if (!llm) throw new Error("LLM not provided to agent node");
            
            // Bind tool to LLM (requires an LLM wrapper that supports bindTools)
            const llmWithTools = llm.bindTools([executeCodeTool]);
            const response = await llmWithTools.invoke(state.messages);
            return { messages: [response] };
        });

        workflow.addNode("tools", async (state) => {
            const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
            const toolCalls = lastMessage.tool_calls || [];
            
            const toolMessages = await Promise.all(toolCalls.map(async (toolCall: any) => {
                if (toolCall?.name === "execute_code") {
                    const { code, language } = toolCall.args || {};
                    const output = await executeCodeInDocker(code, language);
                    return new ToolMessage({
                        content: output,
                        tool_call_id: toolCall?.id || "unknown",
                        name: toolCall?.name || "execute_code"
                    });
                }
                return new ToolMessage({
                    content: `Error: Unknown tool ${toolCall?.name}`,
                    tool_call_id: toolCall?.id || "unknown",
                    name: toolCall?.name || "unknown"
                });
            }));

            return { messages: toolMessages };
        });

        workflow.addConditionalEdges("agent", (state) => {
            const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
            if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
                return "tools";
            }
            return END;
        });

        workflow.addEdge(START, "agent");
        workflow.addEdge("tools", "agent");

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
        
        const finalState = await this.graph.invoke({ messages }, config);
        return finalState.messages;
    }
}
