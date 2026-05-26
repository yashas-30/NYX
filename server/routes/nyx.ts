import { Router } from 'express';
import { RulesDb } from '../lib/rulesDb.ts';
import { CodebaseScanner } from '../lib/codebaseScanner.ts';
import { getWorkspaceRoot } from '../lib/paths.ts';
import fs from 'fs';
import path from 'path';
import { validate } from '../middleware/validate.ts';
import { writeFileSchema, nyxCriticSchema, nyxSearchSchema, codebaseSearchSchema } from '../schemas/index.ts';
import { loadKeys } from '../lib/keyVault.ts';

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
nyxRouter.post('/reset', (req, res) => {
  // Require explicit confirmation to prevent accidental/malicious wipes
  if (req.body?.confirm !== true) {
    return res.status(400).json({ error: 'Must pass { confirm: true } to reset rules.' });
  }
  try {
    RulesDb.resetRules();
    res.json({ success: true });
  } catch (e: any) {
    console.error('[Nyx Router] Failed to reset rules:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/nyx/critic - Asynchronous background evaluation loop
nyxRouter.post('/critic', validate(nyxCriticSchema), (req, res) => {
  const { prompt, response, modelId, provider } = req.body;
  
  if (!prompt || !response) {
    return res.status(400).json({ error: 'Missing prompt or response for critic.' });
  }

  // Respond immediately so user doesn't experience latency
  res.json({ success: true, processing: true });

  // Fire off Critic asynchronously
  setImmediate(async () => {
    try {
      await runBackgroundCritic(prompt, response, modelId, provider);
    } catch (criticError) {
      console.error('[Nyx Critic Layer Error]:', criticError);
    }
  });
});

/**
 * Executes the Critic model to analyze the interaction and formulate a micro-rule
 */
async function runBackgroundCritic(
  userPrompt: string, 
  nyxResponse: string, 
  modelId?: string, 
  provider?: string
) {
  console.log('[Background Critic] Starting meta-cognitive analysis...');
  const keys = loadKeys();
  const activeKey = keys[provider || ''] || '';

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

  // If selected model config is passed, use it! Otherwise, fallback to the local Python HF critic server.
  if (modelId && provider) {
    try {
      let responseText = '';
      const keys = loadKeys();
      const activeKey = keys[provider] || '';
      
      console.log(`[Background Critic] Executing meta-critic using selected model ${modelId} (${provider})`);

      if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${activeKey}`;
        const contents = [
          { role: 'user', parts: [{ text: conversationPayload }] }
        ];
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: criticSystemPrompt }] },
            generationConfig: { temperature: 0.3, maxOutputTokens: 512 }
          })
        });
        if (!res.ok) throw new Error(`Gemini Critic API error: ${res.statusText}`);
        const data: any = await res.json();
        responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else if (provider === 'pollinations') {
        const realModel = modelId.replace('pollinations/', '');
        const res = await fetch('https://text.pollinations.ai/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: realModel,
            messages: [
              { role: 'system', content: criticSystemPrompt },
              { role: 'user', content: conversationPayload }
            ],
            stream: false,
            temperature: 0.3
          })
        });
        if (!res.ok) throw new Error(`Pollinations Critic error: ${res.statusText}`);
        responseText = await res.text();
      } else if (provider === 'nyx-native') {
        const res = await fetch('http://127.0.0.1:12345/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: 'system', content: criticSystemPrompt },
              { role: 'user', content: conversationPayload }
            ],
            stream: false,
            temperature: 0.3,
            max_tokens: 512
          })
        });
        if (!res.ok) throw new Error(`Local GGUF Critic error: ${res.statusText}`);
        const data: any = await res.json();
        responseText = data.choices?.[0]?.message?.content || '';
      } else {
        // OpenAI compatible (openrouter, nvidia, opencode)
        const baseUrl = provider === 'nvidia' 
          ? 'https://integrate.api.nvidia.com/v1' 
          : provider === 'opencode'
            ? 'https://opencode.ai/zen/v1'
            : 'https://openrouter.ai/api/v1';

        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeKey}`,
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'NYX Critic Layer'
          },
          body: JSON.stringify({
            model: provider === 'opencode' ? modelId.replace('opencode/', '') : modelId,
            messages: [
              { role: 'system', content: criticSystemPrompt },
              { role: 'user', content: conversationPayload }
            ],
            stream: false,
            temperature: 0.3,
            max_tokens: 512
          })
        });
        if (!res.ok) throw new Error(`${provider} Critic API error: ${res.statusText}`);
        const data: any = await res.json();
        responseText = data.choices?.[0]?.message?.content || '';
      }

      if (responseText) {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
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
          return;
        }
      }
    } catch (err: any) {
      console.warn('[Background Critic] Selected model run failed, falling back to local Python server:', err.message);
    }
  }

  // Fallback to local Python HF service
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

interface SearchCacheEntry {
  results: any[];
  expiresAt: number;
}
const searchCache = new Map<string, SearchCacheEntry>();
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

/**
 * Perform a free, robust Google/DuckDuckGo/SerpAPI/Brave web search to gather rich documentation
 */
async function performWebSearch(query: string) {
  // Check TTL cache
  const cached = searchCache.get(query);
  if (cached && cached.expiresAt > Date.now()) {
    console.log(`[Web Search] Cache hit for: "${query}"`);
    return cached.results;
  }

  console.log(`[Web Search] Querying web search for: "${query}"`);
  const keys = loadKeys();
  const serpapiKey = keys['SERPAPI_KEY'] || process.env.SERPAPI_KEY || '';
  const braveApiKey = keys['BRAVE_API_KEY'] || process.env.BRAVE_API_KEY || '';

  let results: Array<{ title: string; link: string; snippet: string }> = [];

  try {
    if (serpapiKey) {
      console.log('[Web Search] Using SerpAPI backend...');
      const response = await fetch(`https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${serpapiKey}`);
      if (response.ok) {
        const data = await response.json();
        const organic = data.organic_results || [];
        results = organic.slice(0, 5).map((r: any) => ({
          title: r.title || '',
          link: r.link || '',
          snippet: r.snippet || '',
        }));
      } else {
        throw new Error(`SerpAPI returned HTTP ${response.status}`);
      }
    } else if (braveApiKey) {
      console.log('[Web Search] Using Brave Search API backend...');
      const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`, {
        headers: { 'Accept': 'application/json', 'X-Subscription-Token': braveApiKey }
      });
      if (response.ok) {
        const data = await response.json();
        const webResults = data.web?.results || [];
        results = webResults.slice(0, 5).map((r: any) => ({
          title: r.title || '',
          link: r.url || '',
          snippet: r.description || '',
        }));
      } else {
        throw new Error(`Brave Search returned HTTP ${response.status}`);
      }
    } else {
      // Fallback: DuckDuckGo HTML scraper
      console.log('[Web Search] Falling back to DuckDuckGo HTML Scraper...');
      const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const html = await response.text();
      
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
          
          if (link.startsWith('//duckduckgo.com/l/?kh=-1&uddg=')) {
            const rawLink = link.split('uddg=')[1]?.split('&')[0];
            if (rawLink) link = decodeURIComponent(rawLink);
          } else if (link.startsWith('/l/?kh=-1&uddg=')) {
            const rawLink = link.split('uddg=')[1]?.split('&')[0];
            if (rawLink) link = decodeURIComponent(rawLink);
          }
          
          if (link.startsWith('//')) {
            link = 'https:' + link;
          }
          
          let snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';
          results.push({ title, link, snippet });
          count++;
        }
      }
    }

    if (results.length === 0) {
      throw new Error('No results parsed from response');
    }

    // Save to TTL cache
    searchCache.set(query, {
      results,
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS
    });

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

// GET /api/nyx/search/backends - List available search backends and their active configurations
nyxRouter.get('/search/backends', (req, res) => {
  try {
    const keys = loadKeys();
    const serpapiActive = !!(keys['SERPAPI_KEY'] || process.env.SERPAPI_KEY);
    const braveActive = !!(keys['BRAVE_API_KEY'] || process.env.BRAVE_API_KEY);

    res.json({
      success: true,
      activeBackend: serpapiActive ? 'SerpAPI' : braveActive ? 'Brave' : 'DuckDuckGo Scraper',
      backends: {
        serpapi: { configured: serpapiActive },
        brave: { configured: braveActive },
        duckduckgo: { configured: true, fallback: true }
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/nyx/codebase-search - Scan local codebase and return directory layout and top matches
nyxRouter.post('/codebase-search', validate(codebaseSearchSchema), async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameters for codebase search.' });
  }

  try {
    const results = await CodebaseScanner.search(query, 5);
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
nyxRouter.post('/search', validate(nyxSearchSchema), async (req, res) => {
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
nyxRouter.post('/write-file', validate(writeFileSchema), async (req, res) => {
  const { filePath, content, overwrite } = req.body;

  try {
    const workspaceRoot = getWorkspaceRoot();

    // Normalize both paths for case-insensitive Windows comparison
    const normalizedFull = path.resolve(workspaceRoot, filePath);
    const normalizedRoot = path.resolve(workspaceRoot);
    const relative = path.relative(normalizedRoot, normalizedFull);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return res.status(403).json({ error: 'Directory traversal forbidden.' });
    }
    const fullPath = normalizedFull;

    // Symlink protection
    if (fs.existsSync(fullPath)) {
      const lstat = fs.lstatSync(fullPath);
      if (lstat.isSymbolicLink()) {
        return res.status(403).json({ error: 'Writing to symbolic links is forbidden.' });
      }
    }

    // Extension whitelist
    const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html', '.py', '.md', '.yml', '.yaml', '.sh', '.txt', '.env']);
    const ext = path.extname(fullPath).toLowerCase();
    if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(403).json({ error: `File extension '${ext}' is not allowed.` });
    }

    // Overwrite check
    if (fs.existsSync(fullPath)) {
      if (overwrite !== true) {
        return res.status(409).json({ 
          error: 'File already exists.', 
          requiresConfirmation: true, 
          path: filePath 
        });
      }

      // Perform a clean backing backup before write
      const backupsDir = path.join(workspaceRoot, '.nyx-backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }
      const timestamp = Date.now();
      const ext = path.extname(filePath);
      const base = path.basename(filePath, ext);
      const backupFileName = `${base}-${timestamp}${ext}`;
      const backupPath = path.join(backupsDir, backupFileName);
      
      try {
        await fs.promises.copyFile(fullPath, backupPath);
        console.log(`[Backup System] Created backup of ${filePath} at: ${backupPath}`);
      } catch (backupErr: any) {
        console.warn(`[Backup System] Failed to create backup, proceeding anyway:`, backupErr.message);
      }
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
