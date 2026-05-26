/**
 * @file src/core/services/workspaceIntelligence.ts
 * @description Client-side workspace intelligence orchestrator. Coordinates project profiling and caches results.
 */

import { AIService } from './ai.service';
import { WorkspaceProfile } from '../types';

let cachedProfile: WorkspaceProfile | null = null;
let cachedTime = 0;
const CACHE_TTL_MS = 30_000;
let openFiles: string[] = [];

export class WorkspaceIntelligence {
  static trackOpenFile(filePath: string) {
    if (!filePath) return;
    openFiles = [filePath, ...openFiles.filter(f => f !== filePath)].slice(0, 10);
    try {
      localStorage.setItem('nyx-open-files', JSON.stringify(openFiles));
    } catch {}
    this.clearCache();
  }

  static getOpenFiles(): string[] {
    if (openFiles.length === 0) {
      try {
        const stored = localStorage.getItem('nyx-open-files');
        if (stored) {
          openFiles = JSON.parse(stored);
        }
      } catch {}
    }
    return openFiles;
  }

  static clearCache() {
    cachedProfile = null;
    cachedTime = 0;
  }

  static async getProfile(force = false): Promise<WorkspaceProfile> {
    const now = Date.now();
    if (!force && cachedProfile && (now - cachedTime < CACHE_TTL_MS)) {
      return cachedProfile;
    }

    try {
      const response = await AIService.fetchWithAuth('/api/nyx/workspace-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          openFiles: this.getOpenFiles()
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch workspace profile: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success && data.profile) {
        cachedProfile = data.profile;
        cachedTime = now;
        try {
          localStorage.setItem('nyx-workspace-profile', JSON.stringify(data.profile));
        } catch {}
        return data.profile;
      }
      throw new Error(data.error || 'Unknown error');
    } catch (err) {
      console.warn('[WorkspaceIntelligence] Server profile fetch failed, loading from local cache:', err);
      try {
        const local = localStorage.getItem('nyx-workspace-profile');
        if (local) {
          cachedProfile = JSON.parse(local);
          return cachedProfile!;
        }
      } catch {}
      
      return {
        rootPath: '',
        projectType: 'generic',
        packageManager: null,
        entryPoints: [],
        keyDependencies: {},
        directoryTree: 'PROJECT DIRECTORY MAP:\n(unavailable)',
        testFramework: null,
        lintConfig: null,
        typescriptConfig: null,
        recentGitCommits: [],
        openFiles: []
      };
    }
  }
}
