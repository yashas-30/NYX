import logger from '../../../lib/logger.ts';
import { describe, it } from 'vitest';
import { LocalModelManager } from '../localModelManager.ts';

describe('scratch test', () => {
  it('prints compat and models', async () => {
    const compatibility = await LocalModelManager.getDeviceCompatibility();
    logger.info('COMPATIBILITY SPEC:', JSON.stringify(compatibility.specs, null, 2));
    logger.info('RECOMMENDED MODEL ID:', compatibility.recommendedModelId);
    logger.info('ALL COMPATIBLE MODEL IDS:', compatibility.allCompatibleModelIds);
    logger.info('PRESETS COMPATIBILITY COUNT:', compatibility.presetsCompatibility?.length);

    const list = LocalModelManager.listModels();
    logger.info('LIST MODELS COUNT:', list.length);
    if (list.length > 0) {
      logger.info('FIRST MODEL:', JSON.stringify(list[0], null, 2));
    }
  }, 60000);
});
