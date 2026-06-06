import * as lancedb from 'vectordb';
import path from 'path';
import { fileURLToPath } from 'url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));

export async function initVectorStore() {
  const db = await lancedb.connect(path.join(_dirname, '../../../.nyx-memory'));
  
  const tableNames = await db.tableNames();
  let table;
  
  if (!tableNames.includes('conversations')) {
    // LanceDB infers schema from data
    table = await db.createTable('conversations', [
      { 
        id: 'init',
        content: 'init', 
        embedding: new Array(384).fill(0), 
        timestamp: Date.now(), 
        sessionId: 'init', 
        type: 'system' 
      }
    ]);
  } else {
    table = await db.openTable('conversations');
  }
  
  return table;
}
