import React from 'react';

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

export function ArtifactRenderer({ artifact }: { artifact: Artifact }) {
  return (
    <div className="artifact-renderer">
      <h3>{artifact.title}</h3>
      <pre>{artifact.content}</pre>
    </div>
  );
}
