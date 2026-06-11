import { AIEngine } from './server/lib/aiEngine.js';
import { getKeysSync, loadKeys } from './server/features/vault/vault.service.js';

async function test() {
  await loadKeys();
  const keys = getKeysSync();
  const apiKey = keys['gemini'] || '';
  if (!apiKey) {
    console.error('No Gemini API key found in vault!');
    return;
  }
  
  console.log('Testing gemini-2.5-flash...');
  let content = '';
  await AIEngine.stream({
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    messages: [{ role: 'user', content: 'hello', id: '1', timestamp: Date.now() }],
    apiKey: apiKey,
  }, (chunk) => {
    if (chunk.chunk) content += chunk.chunk;
  }, () => {
    console.log('Done gemini-2.5-flash. Content:', content);
  }).catch(console.error);

  console.log('Testing gemma-4-31b-it...');
  content = '';
  await AIEngine.stream({
    provider: 'gemini',
    model: 'gemma-4-31b-it',
    messages: [{ role: 'user', content: 'hello', id: '2', timestamp: Date.now() }],
    apiKey: apiKey,
  }, (chunk) => {
    if (chunk.chunk) content += chunk.chunk;
  }, () => {
    console.log('Done gemma-4-31b-it. Content:', content);
  }).catch(console.error);
}

test();
