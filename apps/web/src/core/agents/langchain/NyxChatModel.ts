import { BaseChatModel, BaseChatModelParams } from "@langchain/core/language_models/chat_models";
import { BaseMessage, AIMessageChunk, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { ChatResult, ChatGenerationChunk } from "@langchain/core/outputs";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { AIService } from "@src/core/services/ai.service";
import { AISettings } from "@src/infrastructure/types";

export interface NyxChatModelParams extends BaseChatModelParams {
  modelId: string;
  provider: string;
  apiKey?: string;
  settings?: AISettings;
}

export class NyxChatModel extends BaseChatModel {
  modelId: string;
  provider: string;
  apiKey?: string;
  settings?: AISettings;

  constructor(fields: NyxChatModelParams) {
    super(fields);
    this.modelId = fields.modelId;
    this.provider = fields.provider;
    this.apiKey = fields.apiKey;
    this.settings = fields.settings;
  }

  _llmType() {
    return "nyx_chat_model";
  }

  override bindTools(tools: any[], kwargs?: any): any {
    return (this as any).bind({ tools, ...kwargs });
  }

  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const chunks: AIMessageChunk[] = [];
    for await (const chunk of this._streamResponseChunks(messages, options, runManager)) {
      chunks.push(chunk.message as AIMessageChunk);
    }
    
    let finalContent = "";
    let finalToolCalls: any[] = [];
    
    for (const chunk of chunks) {
        if (typeof chunk.content === "string") finalContent += chunk.content;
        if (chunk.tool_call_chunks) {
           for (const tcChunk of chunk.tool_call_chunks) {
               const existing = finalToolCalls.find(tc => tc.index === tcChunk.index);
               if (existing) {
                   existing.args += tcChunk.args;
               } else {
                   finalToolCalls.push({ ...tcChunk });
               }
           }
        }
    }

    const parsedToolCalls = finalToolCalls.map(tc => {
       try {
           return {
               name: tc.name,
               args: JSON.parse(tc.args || "{}"),
               id: tc.id
           };
       } catch (e) {
           return { name: tc.name, args: {}, id: tc.id };
       }
    });

    const message = new AIMessage({
        content: finalContent,
        tool_calls: parsedToolCalls.length > 0 ? parsedToolCalls : undefined
    });

    return { generations: [{ text: finalContent, message }] };
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: any,
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    let systemInstruction = "";
    const history: any[] = [];
    let prompt = "";

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m instanceof SystemMessage) {
        systemInstruction += m.content + "\n";
      } else if (m instanceof HumanMessage) {
        if (i === messages.length - 1) {
            prompt = m.content as string;
        } else {
            history.push({ role: 'user', content: m.content });
        }
      } else if (m instanceof AIMessage) {
        // Map LangChain tool calls back to NYX history format if needed
        let content = m.content;
        if (m.tool_calls && m.tool_calls.length > 0) {
            content = JSON.stringify(m.tool_calls);
        }
        history.push({ role: 'assistant', content });
      } else {
        if (i === messages.length - 1) {
           prompt = m.content as string;
        } else {
           history.push({ role: 'user', content: m.content });
        }
      }
    }

    // Convert options.tools to AIService tool format
    let convertedTools = undefined;
    if (options.tools && Array.isArray(options.tools)) {
        convertedTools = options.tools.map((t: any) => {
            if (t.function) return t; // Already OpenAI format
            if (t.schema) return { type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } };
            return { type: 'function', function: t };
        });
    }

    let queue: any[] = [];
    let resolveNext: (() => void) | null = null;
    let isFinished = false;

    const pushEvent = (evt: any) => {
        queue.push(evt);
        if (resolveNext) resolveNext();
    };

    const streamPromise = AIService.execute(
        this.modelId,
        this.provider,
        prompt,
        this.apiKey,
        systemInstruction,
        this.settings,
        (evt) => pushEvent(evt),
        options.signal,
        {
            history,
            streamEvents: true,
            tools: convertedTools as any,
        }
    ).then(() => {
        isFinished = true;
        if (resolveNext) resolveNext();
    }).catch((err) => {
        isFinished = true;
        pushEvent({ type: 'error', content: err });
        if (resolveNext) resolveNext();
    });

    while (!isFinished || queue.length > 0) {
        if (queue.length === 0) {
            await new Promise<void>(resolve => { resolveNext = resolve; });
            resolveNext = null;
        }

        while (queue.length > 0) {
            const evt = queue.shift();
            if (evt.type === 'error') throw evt.content;
            if (evt.type === 'text') {
               const msgChunk = new AIMessageChunk({ content: evt.content });
               yield new ChatGenerationChunk({ message: msgChunk, text: evt.content });
               if (runManager) void runManager.handleLLMNewToken(evt.content);
            }
            if (evt.type === 'tool_calls') {
                for (let i = 0; i < evt.content.length; i++) {
                    const tc = evt.content[i];
                    const msgChunk = new AIMessageChunk({
                        content: "",
                        tool_call_chunks: [{
                            name: tc.function.name,
                            args: tc.function.arguments,
                            id: tc.id || `call_${Math.random().toString(36).substring(7)}`,
                            index: i
                        }]
                    });
                    yield new ChatGenerationChunk({ message: msgChunk, text: "" });
                }
            }
        }
    }
    
    await streamPromise;
  }
}
