import { StateGraph, START, END, Annotation, messagesStateReducer } from '@langchain/langgraph';
import { BaseMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { AIService } from '@src/core/services/ai.service';
import { ToolRegistry } from './ToolRegistry';
import { executeTool } from './executeTool';

export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
  }),
  next: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
});

async function supervisorNode(state: typeof AgentState.State, config: any) {
  const { messages } = state;
  const sysMsg = new SystemMessage(
    "You are a routing supervisor. Based on the user's request, decide which agent to use. " +
    "Output ONLY valid JSON with a single key 'next'. " +
    "If the user asks for web search or browsing: { \"next\": \"BrowserAgent\" }. " +
    "If the user asks to execute or write code: { \"next\": \"CodeAgent\" }. " +
    "For ALL other requests (questions, greetings, explanations, general chat): { \"next\": \"ChatAgent\" }."
  );

  const llmMessages = [sysMsg, ...messages].map(m => ({ role: m._getType() === 'human' ? 'user' : 'assistant', content: m.content as string }));

  try {
    const res = await AIService.execute(
      config.configurable?.modelId || 'gpt-4o',
      config.configurable?.provider || 'openai',
      llmMessages[llmMessages.length - 1].content,
      config.configurable?.apiKey,
      sysMsg.content as string,
      config.configurable?.settings,
      undefined,
      config.configurable?.signal,
      { responseFormat: { type: 'json_object' } as any }
    );
    
    let resultJson: { next: string } = { next: 'ChatAgent' };
    try {
       const text = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
       const parsed = JSON.parse(text);
       // Normalize legacy FINISH -> ChatAgent
       resultJson = { next: parsed.next === 'FINISH' ? 'ChatAgent' : (parsed.next || 'ChatAgent') };
    } catch {
       // fallback to ChatAgent so the user always gets a response
    }

    return { next: resultJson.next };
  } catch (err) {
    console.error("Supervisor routing error", err);
    return { next: 'ChatAgent' };
  }
}

async function defaultToolNode(state: typeof AgentState.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage._getType() !== 'ai' || !(lastMessage as AIMessage).tool_calls?.length) {
    return { messages: [] };
  }

  const aiMsg = lastMessage as AIMessage;
  const results = [];

  for (const tc of aiMsg.tool_calls!) {
    const result = await executeTool({
      id: tc.id || `call_${Date.now()}`,
      name: tc.name,
      arguments: tc.args
    });

    results.push(new ToolMessage({
      content: `Tool ${tc.name} result: ${result.result}`,
      name: tc.name,
      tool_call_id: tc.id || ''
    }));
  }

  return { messages: results };
}

// Browser Agent Node
async function browserAgentNode(state: typeof AgentState.State, config: any) {
  const { messages } = state;
  const prompt = messages[messages.length - 1].content as string;
  const history = messages.slice(0, -1).map(m => {
    let role: "user" | "assistant" | "system" | "model" = "user";
    const type = m._getType();
    if (type === 'human') role = 'user';
    else if (type === 'ai') role = 'assistant';
    else if (type === 'system' || type === 'tool') role = 'system';

    return {
      role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      ...((m as any).tool_calls?.length ? { tool_calls: (m as any).tool_calls } : {}),
      ...((m as any).tool_call_id ? { tool_call_id: (m as any).tool_call_id } : {})
    };
  });

  const sysMsg = "You are a Browser Agent. You can navigate websites, perform web searches, and extract data. Only use your tools for web-related tasks.";
  const browserTools = ToolRegistry.getBuiltinTools().filter(t => t.name.includes('web') || t.name.includes('browser') || t.name.includes('fetch'));

  try {
    const res = await AIService.execute(
      config.configurable?.modelId || 'gpt-4o',
      config.configurable?.provider || 'openai',
      prompt,
      config.configurable?.apiKey,
      sysMsg,
      config.configurable?.settings,
      undefined,
      config.configurable?.signal,
      { tools: browserTools as any, history }
    );

    const msg = new AIMessage({
      content: res.text,
      tool_calls: (res.toolCalls || []).map((t: any) => ({
        id: t.id,
        name: t.name || t.function?.name,
        args: t.arguments || t.function?.arguments
      }))
    });

    return { messages: [msg] };
  } catch (err) {
    return { messages: [new AIMessage("Error executing Browser Agent.")] };
  }
}

// Code Agent Node
async function codeAgentNode(state: typeof AgentState.State, config: any) {
  const { messages } = state;
  const prompt = messages[messages.length - 1].content as string;
  const history = messages.slice(0, -1).map(m => {
    let role: "user" | "assistant" | "system" | "model" = "user";
    const type = m._getType();
    if (type === 'human') role = 'user';
    else if (type === 'ai') role = 'assistant';
    else if (type === 'system' || type === 'tool') role = 'system';

    return {
      role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      ...((m as any).tool_calls?.length ? { tool_calls: (m as any).tool_calls } : {}),
      ...((m as any).tool_call_id ? { tool_call_id: (m as any).tool_call_id } : {})
    };
  });

  const sysMsg = "You are a Code Agent. You can read, write, and execute code using your local file system and command line tools.";
  const codeTools = ToolRegistry.getBuiltinTools().filter(t => !t.name.includes('web') && !t.name.includes('browser'));

  try {
    const res = await AIService.execute(
      config.configurable?.modelId || 'gpt-4o',
      config.configurable?.provider || 'openai',
      prompt,
      config.configurable?.apiKey,
      sysMsg,
      config.configurable?.settings,
      undefined,
      config.configurable?.signal,
      { tools: codeTools as any, history }
    );

    const msg = new AIMessage({
      content: res.text,
      tool_calls: (res.toolCalls || []).map((t: any) => ({
        id: t.id,
        name: t.name || t.function?.name,
        args: t.arguments || t.function?.arguments
      }))
    });

    return { messages: [msg] };
  } catch (err) {
    return { messages: [new AIMessage("Error executing Code Agent.")] };
  }
}

// Chat Agent Node — handles all general conversation (the default route)
async function chatAgentNode(state: typeof AgentState.State, config: any) {
  const { messages } = state;
  const prompt = messages[messages.length - 1].content as string;
  const history = messages.slice(0, -1).map(m => {
    const type = m._getType();
    const role: "user" | "assistant" | "system" = type === 'human' ? 'user' : type === 'ai' ? 'assistant' : 'system';
    return {
      role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    };
  });

  try {
    const res = await AIService.execute(
      config.configurable?.modelId || 'gpt-4o',
      config.configurable?.provider || 'openai',
      prompt,
      config.configurable?.apiKey,
      undefined,
      config.configurable?.settings,
      undefined,
      config.configurable?.signal,
      { history }
    );
    return { messages: [new AIMessage(res.text || '')] };
  } catch (err) {
    console.error("Chat agent node error", err);
    return { messages: [new AIMessage('Sorry, I encountered an error processing your request.')] };
  }
}

export function buildSupervisorGraph() {
  const workflow = new StateGraph(AgentState)
    .addNode('supervisor', supervisorNode)
    .addNode('ChatAgent', chatAgentNode)
    .addNode('BrowserAgent', browserAgentNode)
    .addNode('CodeAgent', codeAgentNode)
    .addNode('Tools', defaultToolNode);

  workflow.addEdge(START, 'supervisor');

  workflow.addConditionalEdges('supervisor', (x) => x.next, {
    ChatAgent: 'ChatAgent',
    BrowserAgent: 'BrowserAgent',
    CodeAgent: 'CodeAgent',
    // Legacy FINISH fallback — maps to ChatAgent so user always gets a response
    FINISH: 'ChatAgent',
  });

  // ChatAgent always ends after one response
  workflow.addEdge('ChatAgent', END);

  workflow.addConditionalEdges('BrowserAgent', (x) => {
    const lastMessage = x.messages[x.messages.length - 1] as AIMessage;
    return lastMessage.tool_calls?.length ? 'Tools' : END;
  });

  workflow.addConditionalEdges('CodeAgent', (x) => {
    const lastMessage = x.messages[x.messages.length - 1] as AIMessage;
    return lastMessage.tool_calls?.length ? 'Tools' : END;
  });

  workflow.addEdge('Tools', 'supervisor'); // Go back to supervisor after tool execution

  return workflow.compile();
}
