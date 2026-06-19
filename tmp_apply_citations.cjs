const fs = require('fs');

function apply(fpath, fn) {
  try {
    const orig = fs.readFileSync(fpath, 'utf8');
    const result = fn(orig);
    if (result !== orig) {
      fs.writeFileSync(fpath, result, 'utf8');
      process.stdout.write('  OK  ' + fpath + '\n');
    } else {
      process.stdout.write('  SKIP ' + fpath + ' (no change)\n');
    }
  } catch(e) {
    process.stdout.write('  FAIL ' + fpath + ': ' + e.message + '\n');
  }
}

// ── 1. ai/types.ts ── Add Citation type, type citations as Citation[]
apply('apps/web/src/core/services/ai/types.ts', (f) => {
  // Add Citation interface after AISettings
  f = f.replace(
    'export interface ChatMessage {',
    'export interface Citation {\n  id: string;\n  index: number;\n  title: string;\n  url: string;\n  snippet: string;\n  domain?: string;\n}\n\nexport interface ChatMessage {'
  );
  // Type citations as Citation[]
  f = f.replace('citations?: any[];', 'citations?: Citation[];');
  return f;
});

// ── 2. packages/shared/src/types.ts ── Add citations to ChatMessageSchema
apply('packages/shared/src/types.ts', (f) => {
  if (f.includes('citations:')) return f; // already added
  f = f.replace(
    '  artifacts: z.array(z.any()).optional(),',
    '  artifacts: z.array(z.any()).optional(),\n  citations: z.array(z.object({\n    id: z.string(),\n    index: z.number(),\n    title: z.string(),\n    url: z.string(),\n    snippet: z.string(),\n    domain: z.string().optional(),\n  })).optional(),'
  );
  return f;
});

// ── 3. ai.service.ts buildMessages ── Preserve citations in round-trip
apply('apps/web/src/core/services/ai.service.ts', (f) => {
  // Replace the buildMessages history map to include citations
  f = f.replace(
    'messages.push(...history.map((m) => ({ role: m.role, content: m.content })));',
    `messages.push(
        ...history.map((m) => {
          let c = m.content;
          if (m.citations && m.citations.length > 0) {
            c += '\\n\\n<nyx_citations>\\n' + m.citations.map((cit) => '[' + cit.index + '] ' + cit.title + ': ' + cit.url).join('\\n') + '\\n</nyx_citations>';
          }
          return { role: m.role, content: c };
        })
      );`
  );
  return f;
});

// ── 4. agentLoop.ts ── Fix citation metadata (domain, dedup, index)
apply('apps/web/src/core/agents/agentLoop.ts', (f) => {
  const oldBlock = f.match(/\/\/ Yield citations if it's a web search[\s\S]*?if \(tr\.name === 'web_search' && tr\.searchResults\) \{[\s\S]*?\n    \}/);
  if (!oldBlock) {
    process.stdout.write('  WARN agentLoop.ts: citation block not found via regex\n');
    return f;
  }
  const newBlock = `  // Yield citations if it's a web search with domain extraction and dedup
  const seenUrls = new Set<string>();
  if (tr.name === 'web_search' && tr.searchResults) {
    let index = 1;
    for (const r of tr.searchResults) {
      if (seenUrls.has(r.url)) continue;
      seenUrls.add(r.url);
      yield {
        type: 'citation' as any,
        content: '',
        metadata: {
          id: tr.toolCallId + '-' + index,
          index,
          url: r.url,
          title: r.title,
          snippet: r.snippet,
          domain: r.domain || (() => { try { return new URL(r.url).hostname.replace('www.', ''); } catch { return r.url; } })(),
        }
      } as any;
      index++;
    }
  }`;
  f = f.replace(oldBlock[0], newBlock);
  return f;
});

// ── 5. useChatPipeline.ts ── Update local Citation interface
apply('apps/web/src/features/chat/hooks/useChatPipeline.ts', (f) => {
  f = f.replace(
    'interface Citation {\n  url?: string;\n  title?: string;\n  snippet?: string;\n  id?: string;\n  source?: string;\n  quote?: string;\n}',
    'interface Citation {\n  url?: string;\n  title?: string;\n  snippet?: string;\n  id?: string;\n  domain?: string;\n  index?: number;\n  source?: string;\n  quote?: string;\n}'
  );
  return f;
});

process.stdout.write('\n=== ALL DONE ===\n');
