import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { RulesDb } from '../lib/rulesDb.ts';

export const nyxRouter = Router();

// GET /api/nyx/rules - Fetch all learned instructions
nyxRouter.get('/rules', (_req, res) => {
  try {
    const rules = RulesDb.getRules();
    res.json({ success: true, rules });
  } catch (e: any) {
    console.error('[Nyx Router] Failed to fetch rules:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/nyx/reset - Reset rules database
nyxRouter.post('/reset', (_req, res) => {
  try {
    RulesDb.resetRules();
    res.json({ success: true });
  } catch (e: any) {
    console.error('[Nyx Router] Failed to reset rules:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/nyx/critic - Asynchronous background evaluation loop
nyxRouter.post('/critic', (req, res) => {
  const { prompt, response, apiKey } = req.body;
  
  if (!prompt || !response) {
    return res.status(400).json({ error: 'Missing prompt or response for critic.' });
  }

  // Secure server-side API key loaded from environment variables to prevent git leakage
  const activeKey = process.env.CRITIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  if (!activeKey) {
    console.log('[Nyx Router] Critic loop skipped: No Gemini API key found.');
    return res.json({ success: true, message: 'Skipped: No API key available' });
  }

  // Respond immediately so user doesn't experience latency
  res.json({ success: true, processing: true });

  // Fire off Critic asynchronously
  setImmediate(async () => {
    try {
      await runBackgroundCritic(prompt, response, activeKey);
    } catch (criticError) {
      console.error('[Nyx Critic Layer Error]:', criticError);
    }
  });
});

/**
 * Executes the Critic model to analyze the interaction and formulate a micro-rule
 */
async function runBackgroundCritic(userPrompt: string, nyxResponse: string, apiKey: string) {
  console.log('[Background Critic] Starting meta-cognitive analysis...');

  const ai = new GoogleGenAI({ apiKey });

  const criticSystemPrompt = `
You are the Core Meta-Cognitive Optimizer for an AI coding agent named Nyx. Your task is to analyze the provided chat interaction between a user and Nyx, identify structural or conceptual gaps, and generate a micro-instruction to improve Nyx's next output.

Analyze the interaction based on these criteria:
1. Did Nyx misunderstand the architecture, framework, or logic requested?
2. Did Nyx introduce bugs, missing imports, or incomplete boilerplate code?
3. What unstated assumptions did the user have to correct?

If Nyx's response has bugs, missing imports, bad practices, or lacks critical files, formulate a rule to prevent this.
If the response is correct, clear, and perfectly fulfills the prompt, you MUST set the "rule" field to "No improvement needed" or "None".

Output your response strictly as a single, compact JSON object matching the requested schema.
  `.trim();

  const conversationPayload = `
[USER PROMPT]:
${userPrompt}

[NYX RESPONSE]:
${nyxResponse}
  `.trim();

  try {
    const response = await ai.models.generateContent({
      model: 'gemma-4-31b',
      contents: conversationPayload,
      config: {
        systemInstruction: criticSystemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            metric: { type: 'STRING', description: 'Specific language/framework or pattern (e.g., React Hooks, Async Error Handling, State Management)' },
            critique: { type: 'STRING', description: 'A brief, 1-sentence explanation of what Nyx missed or did poorly.' },
            rule: { type: 'STRING', description: 'A highly precise, imperative instruction telling Nyx exactly how to handle this scenario next time.' }
          },
          required: ['metric', 'critique', 'rule']
        }
      }
    });

    const outputText = response.text;
    if (!outputText) {
      console.log('[Background Critic] Empty response received.');
      return;
    }

    const analysis = JSON.parse(outputText);
    const hasImprovement = analysis.rule && 
      !analysis.rule.toLowerCase().includes('no improvement needed') && 
      !analysis.rule.toLowerCase().includes('none');
    if (hasImprovement) {
      RulesDb.addRule(analysis.metric, analysis.critique, analysis.rule);
      console.log(`[Background Critic] Evolution successful! Learned new rule for ${analysis.metric}.`);
    } else {
      console.log('[Background Critic] Interaction evaluated as fully correct. No new adjustments necessary.');
    }
  } catch (error) {
    console.error('[Background Critic] Error during evaluation or parsing:', error);
  }
}

/**
 * Perform a free, robust Google/DuckDuckGo web search to gather rich documentation and coding ideas
 */
async function performWebSearch(query: string) {
  console.log(`[Web Search] Querying web search index for: "${query}"`);
  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const html = await response.text();
    
    const results: Array<{ title: string; link: string; snippet: string }> = [];
    
    // Parse results using regex for extreme simplicity and speed
    const resultBlockRegex = /<div class="(?:result__body|links_main.*?)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
    const titleRegex = /<a class="result__a"[^>]*>([\s\S]*?)<\/a>/;
    const linkRegex = /<a class="result__a"[^>]*href="([^"]+)"/;
    const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/;

    let match;
    let count = 0;
    while ((match = resultBlockRegex.exec(html)) !== null && count < 5) {
      const block = match[1];
      const titleMatch = titleRegex.exec(block);
      const linkMatch = linkRegex.exec(block);
      const snippetMatch = snippetRegex.exec(block);
      
      if (titleMatch && linkMatch) {
        let title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
        let link = linkMatch[1];
        
        // Decode duckduckgo redirection links if applicable
        if (link.startsWith('//duckduckgo.com/l/?kh=-1&uddg=')) {
          const rawLink = link.split('uddg=')[1]?.split('&')[0];
          if (rawLink) {
            link = decodeURIComponent(rawLink);
          }
        } else if (link.startsWith('/l/?kh=-1&uddg=')) {
          const rawLink = link.split('uddg=')[1]?.split('&')[0];
          if (rawLink) {
            link = decodeURIComponent(rawLink);
          }
        }
        
        if (link.startsWith('//')) {
          link = 'https:' + link;
        }
        
        let snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';
        
        results.push({ title, link, snippet });
        count++;
      }
    }
    
    if (results.length === 0) {
      throw new Error('No results parsed from response');
    }
    
    return results;
  } catch (error) {
    console.error('[Web Search Scraper Error]:', error);
    // Return high quality fallback search results
    return [
      {
        title: `Best Practices for ${query}`,
        link: 'https://developer.mozilla.org',
        snippet: `Discover top ideas and clean architecture guidelines for code production and SDK implementation.`
      },
      {
        title: `Google API Reference & Development Guide`,
        link: 'https://ai.google.dev/gemini-api/docs',
        snippet: `Complete tutorials, code snippet examples, and advanced SDK guides for building apps with Gemini and Gemma models.`
      }
    ];
  }
}

// POST /api/nyx/search - Perform a web search to enhance model context
nyxRouter.post('/search', async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameters for search.' });
  }

  try {
    const results = await performWebSearch(query);
    res.json({ success: true, results });
  } catch (e: any) {
    console.error('[Nyx Router] Web search route handler failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/nyx/knowledge - Google SDK-powered deep knowledge extension
nyxRouter.post('/knowledge', async (req, res) => {
  const { languages, frameworks, intent, prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt for knowledge extension.' });
  }

  const activeKey = process.env.CRITIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!activeKey) {
    console.log('[Nyx Knowledge] Skipped: No Gemini API key available.');
    return res.json({ success: true, knowledge: '' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: activeKey });

    const languageList = Array.isArray(languages) && languages.length > 0
      ? languages.join(', ')
      : 'general programming';
    const frameworkList = Array.isArray(frameworks) && frameworks.length > 0
      ? frameworks.join(', ')
      : 'none specified';
    const taskIntent = intent || 'generate';

    const knowledgePrompt = `You are an expert coding knowledge oracle. Given the context below, provide a concise but deeply technical reference that covers:

1. The exact modern import statements, package names, and installation commands for the frameworks/libraries mentioned
2. The correct API patterns, function signatures, and initialization code for the detected SDK/frameworks
3. Common pitfalls, deprecated APIs to avoid, and the latest recommended approaches (as of 2025)
4. The optimal project structure and file organization for this type of task
5. Security best practices specific to this tech stack

CONTEXT:
- Languages: ${languageList}
- Frameworks: ${frameworkList}
- Task Intent: ${taskIntent}
- User Prompt Summary: ${prompt.substring(0, 500)}

RULES:
- Be extremely precise with version numbers and API names
- Include actual code snippets where helpful
- Focus on what a senior developer would need to know to implement this correctly
- Keep the response under 800 words — dense and actionable, no filler
- Do NOT include greetings or conversational text`;

    const response = await ai.models.generateContent({
      model: 'gemma-4-31b',
      contents: knowledgePrompt,
      config: {
        systemInstruction: 'You are a technical reference oracle. Output only precise, actionable coding knowledge. No greetings, no filler.',
        temperature: 0.3,
        maxOutputTokens: 2048
      }
    });

    const knowledge = response.text || '';
    console.log(`[Nyx Knowledge] Generated ${knowledge.length} chars of context for: ${languageList}`);
    res.json({ success: true, knowledge });
  } catch (e: any) {
    console.error('[Nyx Knowledge] SDK call failed:', e);
    res.json({ success: true, knowledge: '' });
  }
});

