export interface ArtifactVersion {
  id: string;
  content: string;
  timestamp: number;
}

export interface Artifact {
  id: string;
  type: 'code' | 'html' | 'svg' | 'react' | 'mermaid' | 'markdown' | 'json' | 'sql';
  title: string;
  content: string;
  language?: string;
  version: number;
  versions: ArtifactVersion[];
  createdAt: number;
  updatedAt: number;
}

export class ArtifactManager {
  public saveArtifact(artifact: Artifact): Artifact {
    // Database sync logic
    return artifact;
  }
}
