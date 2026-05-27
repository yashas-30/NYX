/**
 * @file server/lib/workspaceIntelligence.ts
 * @description Analyzes the current workspace to build a project profile (entry points, dependencies, ASCII tree, linter, tests, etc.)
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getWorkspaceRoot } from '../../lib/paths.ts';

const execAsync = promisify(exec);

export interface WorkspaceProfile {
  rootPath: string;
  projectType: 'react' | 'node' | 'python' | 'rust' | 'go' | 'arduino' | 'generic';
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'cargo' | 'poetry' | null;
  entryPoints: string[];
  keyDependencies: Record<string, string>;
  directoryTree: string;
  testFramework: 'vitest' | 'jest' | 'pytest' | 'cargo-test' | null;
  lintConfig: 'eslint' | 'biome' | 'ruff' | null;
  typescriptConfig: any | null;
  recentGitCommits: string[];
  openFiles: string[];
}

let cachedProfile: WorkspaceProfile | null = null;
let lastScanTime = 0;
const CACHE_TTL_MS = 30_000;
let sessionOpenFiles: string[] = [];

export class WorkspaceIntelligence {
  static trackOpenFiles(files: string[]) {
    // Maintain a unique list of top 10 files
    sessionOpenFiles = Array.from(new Set([...files, ...sessionOpenFiles])).slice(0, 10);
  }

  static getOpenFiles(): string[] {
    return sessionOpenFiles;
  }

  static clearCache() {
    cachedProfile = null;
    lastScanTime = 0;
  }

  static async getProfile(): Promise<WorkspaceProfile> {
    const now = Date.now();
    if (cachedProfile && (now - lastScanTime < CACHE_TTL_MS)) {
      // Sync openFiles with current tracking
      cachedProfile.openFiles = sessionOpenFiles;
      return cachedProfile;
    }

    const rootPath = getWorkspaceRoot();
    const profile = await this.scanWorkspace(rootPath);
    cachedProfile = profile;
    lastScanTime = now;
    return profile;
  }

  private static async scanWorkspace(root: string): Promise<WorkspaceProfile> {
    let projectType: WorkspaceProfile['projectType'] = 'generic';
    let packageManager: WorkspaceProfile['packageManager'] = null;
    let entryPoints: string[] = [];
    let keyDependencies: Record<string, string> = {};
    let testFramework: WorkspaceProfile['testFramework'] = null;
    let lintConfig: WorkspaceProfile['lintConfig'] = null;
    let typescriptConfig: any | null = null;
    let recentGitCommits: string[] = [];

    // Excluded folders for the ASCII tree to prevent deep scans or performance bottlenecks
    const EXCLUDE_DIRS = new Set([
      'node_modules', '.git', '.nyx-cache', '.nyx-logs', '.nyx-models', '.stitch', '.agents',
      'dist', 'dist-electron', 'dist-server', 'dist-desktop', 'build', 'out', 'target',
      '.antigravitycli', '.vscode', 'graphify-out', 'scratch'
    ]);

    // Check project config files
    const packageJsonPath = path.join(root, 'package.json');
    const cargoTomlPath = path.join(root, 'Cargo.toml');
    const pyprojectTomlPath = path.join(root, 'pyproject.toml');
    const requirementsTxtPath = path.join(root, 'requirements.txt');
    const goModPath = path.join(root, 'go.mod');
    const platformioIniPath = path.join(root, 'platformio.ini');

    // 1. package.json scan (Node / React)
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        
        // Detect project type
        if (deps.react || deps['react-dom']) {
          projectType = 'react';
        } else {
          projectType = 'node';
        }

        // Package Manager
        if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) {
          packageManager = 'pnpm';
        } else if (fs.existsSync(path.join(root, 'yarn.lock'))) {
          packageManager = 'yarn';
        } else {
          packageManager = 'npm';
        }

        // Test Framework
        if (deps.vitest) testFramework = 'vitest';
        else if (deps.jest) testFramework = 'jest';

        // Lint Config
        if (deps.eslint || fs.existsSync(path.join(root, 'eslint.config.js')) || fs.existsSync(path.join(root, '.eslintrc.json')) || fs.existsSync(path.join(root, '.eslintrc.js'))) {
          lintConfig = 'eslint';
        } else if (deps.biome || fs.existsSync(path.join(root, 'biome.json'))) {
          lintConfig = 'biome';
        }

        // Key dependencies (extract main frameworks)
        const keysToExtract = ['react', 'react-dom', 'express', 'fastify', 'vite', 'electron', 'typescript', 'next', 'tailwindcss', 'zod', 'zustand'];
        for (const k of keysToExtract) {
          if (deps[k]) {
            keyDependencies[k] = deps[k];
          }
        }
      } catch (err) {
        console.error('[WorkspaceIntelligence] Error parsing package.json:', err);
      }
    }

    // 2. Rust scan
    if (fs.existsSync(cargoTomlPath)) {
      projectType = 'rust';
      packageManager = 'cargo';
      testFramework = 'cargo-test';
      keyDependencies['cargo'] = 'rust';
    }

    // 3. Python scan
    if (fs.existsSync(pyprojectTomlPath) || fs.existsSync(requirementsTxtPath)) {
      projectType = 'python';
      packageManager = fs.existsSync(path.join(root, 'poetry.lock')) ? 'poetry' : 'pip';
      
      // Test framework & linter
      if (fs.existsSync(requirementsTxtPath)) {
        try {
          const reqs = fs.readFileSync(requirementsTxtPath, 'utf8');
          if (reqs.includes('pytest')) testFramework = 'pytest';
          if (reqs.includes('ruff')) lintConfig = 'ruff';
        } catch {}
      }
      if (fs.existsSync(pyprojectTomlPath)) {
        try {
          const content = fs.readFileSync(pyprojectTomlPath, 'utf8');
          if (content.includes('pytest')) testFramework = 'pytest';
          if (content.includes('ruff') || content.includes('[tool.ruff]')) lintConfig = 'ruff';
        } catch {}
      }
    }

    // 4. Go scan
    if (fs.existsSync(goModPath)) {
      projectType = 'go';
      // Fallback/standard package manager detection isn't strictly mapping, but we set to generic npm or leave null if none matches.
    }

    // 5. Arduino scan
    if (fs.existsSync(platformioIniPath)) {
      projectType = 'arduino';
    }

    // 6. tsconfig.json scan
    const tsconfigPath = path.join(root, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
      try {
        const raw = fs.readFileSync(tsconfigPath, 'utf8');
        // Simple regex parse to avoid comments stripping issues in tsconfig JSON
        const clean = raw.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
        typescriptConfig = JSON.parse(clean);
      } catch {}
    }

    // 7. Find entrypoints
    const possibleEntrypoints = [
      'src/main.tsx', 'src/index.tsx', 'src/main.ts', 'src/index.ts',
      'server.ts', 'app.js', 'main.py', 'src/main.rs', 'main.go', 'src/main.cpp'
    ];
    for (const ep of possibleEntrypoints) {
      if (fs.existsSync(path.join(root, ep))) {
        entryPoints.push(ep);
      }
    }

    // 8. Recent git commits
    const gitDir = path.join(root, '.git');
    if (fs.existsSync(gitDir)) {
      try {
        const { stdout } = await execAsync('git log --oneline -5', { cwd: root, timeout: 2000 });
        recentGitCommits = stdout.trim().split('\n').filter(Boolean);
      } catch {}
    }

    // 9. Generate ASCII tree
    const treeLines: string[] = [];
    this.generateAsciiTree(root, '', EXCLUDE_DIRS, treeLines, 0, 50);
    const directoryTree = treeLines.join('\n');

    return {
      rootPath: root,
      projectType,
      packageManager,
      entryPoints,
      keyDependencies,
      directoryTree,
      testFramework,
      lintConfig,
      typescriptConfig,
      recentGitCommits,
      openFiles: sessionOpenFiles
    };
  }

  private static generateAsciiTree(
    dir: string, 
    prefix: string, 
    excludeDirs: Set<string>, 
    lines: string[], 
    depth: number, 
    maxLines: number
  ) {
    if (lines.length >= maxLines || depth > 3) return;

    let list: string[] = [];
    try {
      list = fs.readdirSync(dir);
    } catch {
      return;
    }

    // Sort: directories first, then files
    const stats = list.map(name => {
      const fullPath = path.join(dir, name);
      try {
        return { name, isDir: fs.statSync(fullPath).isDirectory() };
      } catch {
        return { name, isDir: false };
      }
    });

    stats.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < stats.length; i++) {
      if (lines.length >= maxLines) {
        lines.push(`${prefix}└── ... (truncated)`);
        return;
      }

      const item = stats[i];
      if (excludeDirs.has(item.name)) continue;

      const isLast = i === stats.length - 1;
      const marker = isLast ? '└── ' : '├── ';
      lines.push(`${prefix}${marker}${item.name}`);

      if (item.isDir) {
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        this.generateAsciiTree(path.join(dir, item.name), newPrefix, excludeDirs, lines, depth + 1, maxLines);
      }
    }
  }
}
