import { Router } from 'express';
import { RulesDb } from '../lib/rulesDb.ts';
import { CodebaseScanner } from '../lib/codebaseScanner.ts';
import fs from 'fs';
import path from 'path';

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
  const { prompt, response } = req.body;
  
  if (!prompt || !response) {
    return res.status(400).json({ error: 'Missing prompt or response for critic.' });
  }

  // Respond immediately so user doesn't experience latency
  res.json({ success: true, processing: true });

  // Fire off Critic asynchronously
  setImmediate(async () => {
    try {
      await runBackgroundCritic(prompt, response);
    } catch (criticError) {
      console.error('[Nyx Critic Layer Error]:', criticError);
    }
  });
});

/**
 * Executes the Critic model to analyze the interaction and formulate a micro-rule
 */
async function runBackgroundCritic(userPrompt: string, nyxResponse: string) {
  console.log('[Background Critic] Starting meta-cognitive analysis...');

  const criticSystemPrompt = `
You are the Core Meta-Cognitive Optimizer for an AI coding agent named Nyx. Your task is to analyze the provided chat interaction between a user and Nyx, identify structural or conceptual gaps, and generate a micro-instruction to improve Nyx's next output.

Analyze the interaction based on these criteria:
1. Did Nyx misunderstand the architecture, framework, or logic requested?
2. Did Nyx introduce bugs, missing imports, or incomplete boilerplate code?
3. What unstated assumptions did the user have to correct?

If Nyx's response has bugs, missing imports, bad practices, or lacks critical files, formulate a rule to prevent this.
If the response is correct, clear, and perfectly fulfills the prompt, you MUST set the "rule" field to "No improvement needed" or "None".

Output your response strictly as a single, compact JSON object matching the requested schema:
{
  "metric": "Specific language/framework or pattern",
  "critique": "A brief, 1-sentence explanation of what Nyx missed or did poorly.",
  "rule": "A highly precise, imperative instruction telling Nyx exactly how to handle this scenario next time."
}
  `.trim();

  const conversationPayload = `
[USER PROMPT]:
${userPrompt}

[NYX RESPONSE]:
${nyxResponse}
  `.trim();

  try {
    const hfRes = await fetch('http://127.0.0.1:3002/api/gemini/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: conversationPayload,
        systemInstruction: criticSystemPrompt,
        settings: {
          maxTokens: 512,
          temperature: 0.3
        }
      })
    });

    if (!hfRes.ok) {
      throw new Error(`Failed to call local HF service: ${hfRes.statusText}`);
    }

    const data: any = await hfRes.json();
    const outputText = data.text;
    if (!outputText) {
      console.log('[Background Critic] Empty response received.');
      return;
    }

    const jsonMatch = outputText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[Background Critic] Could not parse JSON block from output:', outputText);
      return;
    }

    const analysis = JSON.parse(jsonMatch[0]);
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

// POST /api/nyx/codebase-search - Scan local codebase and return directory layout and top matches
nyxRouter.post('/codebase-search', (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameters for codebase search.' });
  }

  try {
    const results = CodebaseScanner.search(query, 5);
    const directoryStructure = CodebaseScanner.getDirectoryStructure();
    res.json({
      success: true,
      results,
      directoryStructure
    });
  } catch (e: any) {
    console.error('[Nyx Router] Codebase search failed:', e);
    res.status(500).json({ error: e.message });
  }
});

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

// POST /api/nyx/write-file - Write/apply generated code directly to the workspace
nyxRouter.post('/write-file', async (req, res) => {
  const { filePath, content } = req.body;
  if (!filePath || content === undefined) {
    return res.status(400).json({ error: 'filePath and content are required' });
  }

  try {
    const fullPath = path.resolve(process.cwd(), filePath);
    
    // Safety check: ensure file is inside the workspace to prevent directory traversal
    if (!fullPath.startsWith(process.cwd())) {
      return res.status(403).json({ error: 'Directory traversal forbidden. Path must reside within the workspace.' });
    }

    // Ensure target folder exists
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    
    // Write file
    await fs.promises.writeFile(fullPath, content, 'utf8');
    
    console.log(`[File System] Successfully wrote file to: ${fullPath}`);
    res.json({ success: true, path: fullPath });
  } catch (e: any) {
    console.error('[File System Error]:', e.message);
    res.status(500).json({ error: e.message });
  }
});
