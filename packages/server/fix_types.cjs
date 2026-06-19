const fs = require('fs');
const files = [
  'server/fastify/adapters/gemini.adapter.ts',
  'server/fastify/adapters/lmstudio.adapter.ts',
  'server/fastify/adapters/ollama.adapter.ts',
  'server/features/chat/chat.service.ts',
  'server/features/local-models/localModelRunner.ts',
  'server/features/model-proxy/modelProxy.service.ts',
  'server/features/vault/vault.router.ts',
];

files.forEach((f) => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    content = content.replace(
      /const (\w+) = await (?:res|response)\.json\(\);/g,
      'const $1 = (await res.json()) as any;'
    );
    content = content.replace(
      /catch \((data|healthData|propsData|errData)\) \{/g,
      'catch ($1: any) {'
    );
    // Also catch (errData) without braces
    content = content.replace(/catch \((data|healthData|propsData|errData)\)/g, 'catch ($1: any)');
    fs.writeFileSync(f, content);
    console.log('Fixed', f);
  } else {
    console.log('Not found', f);
  }
});
