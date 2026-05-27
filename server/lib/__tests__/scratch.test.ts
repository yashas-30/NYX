import { describe, it } from 'vitest';
import { LocalModelManager } from '../localModelManager.ts';

describe('scratch test', () => {
  it('prints compat and models', async () => {
    const compatibility = await LocalModelManager.getDeviceCompatibility();
    console.log('COMPATIBILITY SPEC:', JSON.stringify(compatibility.specs, null, 2));
    console.log('RECOMMENDED MODEL ID:', compatibility.recommendedModelId);
    console.log('ALL COMPATIBLE MODEL IDS:', compatibility.allCompatibleModelIds);
    console.log('PRESETS COMPATIBILITY COUNT:', compatibility.presetsCompatibility?.length);
    
    const list = LocalModelManager.listModels();
    console.log('LIST MODELS COUNT:', list.length);
    if (list.length > 0) {
      console.log('FIRST MODEL:', JSON.stringify(list[0], null, 2));
    }
  }, 60000);
});
