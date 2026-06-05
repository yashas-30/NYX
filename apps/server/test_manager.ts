import { ContextWindowManager, ChatMessage } from '../../packages/server/src/context/manager.js';
import { DocumentProcessor } from '../../packages/server/src/documents/processor.js';

async function main() {
  console.log('Testing ContextWindowManager...');
  const manager = new ContextWindowManager('gpt-4');
  const messages: ChatMessage[] = [
    { role: 'user', content: 'Hello! Let\'s build an app.' },
    { role: 'assistant', content: 'Sure, what kind of app?' },
    { role: 'user', content: 'We decided to use PostgreSQL as the database.' },
    { role: 'user', content: 'Also, let\'s implement user authentication.' },
  ];
  
  // Artificially low maxTokens to force summarization
  const context = manager.buildContext(messages, 1050, 'You are an AI assistant.');
  console.log('Context Output:', JSON.stringify(context, null, 2));

  console.log('\nTesting DocumentProcessor...');
  const processor = new DocumentProcessor();
  const doc = await processor.process(Buffer.from('This is a test document. It has some text.'), 'test.txt');
  console.log('Document Output:', JSON.stringify(doc, null, 2));
}

main().catch(console.error);
