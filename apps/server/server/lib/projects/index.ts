export interface ProjectFile {
  path: string;
  content: string;
  status: 'indexed' | 'modified' | 'untracked';
}

export interface ProjectSettings {
  defaultModel: string;
  autoCommit: boolean;
  webSearchEnabled: boolean;
  codebaseIndexing: boolean;
  maxContextTokens: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  instructions: string;
  files: ProjectFile[];
  settings: ProjectSettings;
  createdAt: number;
  updatedAt: number;
}

export class ProjectManager {
  public async syncWithGithub(projectId: string, repoUrl: string): Promise<void> {
    // Stub for github bidirectional sync
  }
}
