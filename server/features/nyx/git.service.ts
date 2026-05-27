import { GitIntegration } from '../workspace/gitIntegration.ts';

export class GitService {
  async getDiff(filePath?: string) {
    return await GitIntegration.getDiff(filePath);
  }

  async getStatus() {
    return await GitIntegration.getStatus();
  }
}
