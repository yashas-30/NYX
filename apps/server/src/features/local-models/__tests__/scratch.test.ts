import logger from '../../../lib/logger.js';
import { describe, it } from 'vitest';
import { LocalModelManager } from '../localModelManager.js';

describe('scratch test', () => {
  it('prints compat and models', async () => {
    const compatibility = await LocalModelManager.getDeviceCompatibility();
    logger.info({ specs: compatibility.specs }, 'COMPATIBILITY SPEC');
    logger.info({ recommendedModelId: compatibility.recommendedModelId }, 'RECOMMENDED MODEL ID');
    logger.info({ allCompatibleModelIds: compatibility.allCompatibleModelIds }, 'ALL COMPATIBLE MODEL IDS');
    logger.info({ count: compatibility.presetsCompatibility?.length }, 'PRESETS COMPATIBILITY COUNT');

    const list = LocalModelManager.listModels();
    logger.info({ count: list.length }, 'LIST MODELS COUNT');
    if (list.length > 0) {
      logger.info({ model: list[0] }, 'FIRST MODEL');
    }
  }, 60000);
});
