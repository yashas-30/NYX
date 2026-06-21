import { DynamicStructuredTool } from "@langchain/core/tools";
import { ToolRegistry } from "../ToolRegistry";
import { executeTool } from "../executeTool";
import { z } from "zod";

export class LangChainToolRegistry {
  /**
   * Returns all available tools wrapped as LangChain DynamicStructuredTools.
   */
  static async getTools(): Promise<DynamicStructuredTool[]> {
    const definitions = await ToolRegistry.getAllTools();
    
    return definitions.map(def => {
      // Create a Zod schema from the JSON Schema properties
      // For a robust implementation, we might want to map JSON schema -> Zod exactly,
      // but since we just need it for LangChain (which accepts Zod), we can create
      // a loose Zod object schema that accepts the properties defined.
      const properties = def.parameters.properties || {};
      const required = def.parameters.required || [];
      
      const zodShape: Record<string, z.ZodTypeAny> = {};
      
      for (const [key, prop] of Object.entries(properties)) {
        const p = prop as any;
        let zType: z.ZodTypeAny = z.any();
        
        if (p.type === 'string') zType = z.string();
        else if (p.type === 'number') zType = z.number();
        else if (p.type === 'boolean') zType = z.boolean();
        else if (p.type === 'array') zType = z.array(z.any());
        else if (p.type === 'object') zType = z.object({});
        
        if (p.description) zType = zType.describe(p.description);
        if (!required.includes(key)) zType = zType.optional();
        
        zodShape[key] = zType;
      }

      return new DynamicStructuredTool({
        name: def.name,
        description: def.description,
        schema: z.object(zodShape),
        func: async (args: any) => {
          // generate a unique ID for the tool call
          const callId = `call_${Math.random().toString(36).substring(7)}`;
          const result = await executeTool({
            id: callId,
            name: def.name,
            arguments: args
          });
          
          if (result.isError) {
             return `Error: ${result.result}`;
          }
          return result.result;
        }
      });
    });
  }
}
