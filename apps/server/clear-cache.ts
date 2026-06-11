import { CacheServer } from './server/lib/cache.js';

async function clear() {
  console.log('Clearing cache...');
  await CacheServer.clear();
  console.log('Cache cleared.');
}

clear();
