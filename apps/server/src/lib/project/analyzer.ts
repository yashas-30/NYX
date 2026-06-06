import fs from 'fs';
import path from 'path';

export interface ProjectProfile {
  framework: string | null;
  language: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  testFramework: string | null;
  styling: string | null;
  architecture: string | null;
  entryPoints: string[];
  configFiles: string[];
}

export function readJson(filePath: string): any {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    // Ignore error
  }
  return {};
}

function detectFramework(pkg: any): string | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps['next']) return 'next';
  if (deps['react']) return 'react';
  if (deps['vue']) return 'vue';
  if (deps['express']) return 'express';
  if (deps['fastify']) return 'fastify';
  if (deps['@nestjs/core']) return 'nestjs';
  return null;
}

function detectTestFramework(pkg: any): string | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps['jest']) return 'jest';
  if (deps['vitest']) return 'vitest';
  if (deps['mocha']) return 'mocha';
  if (deps['playwright'] || deps['@playwright/test']) return 'playwright';
  if (deps['cypress']) return 'cypress';
  return null;
}

function detectStyling(pkg: any): string | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps['tailwindcss']) return 'tailwind';
  if (deps['styled-components']) return 'styled-components';
  if (deps['sass']) return 'sass';
  return null;
}

function detectPrimaryLanguage(rootPath: string): string {
  if (fs.existsSync(path.join(rootPath, 'tsconfig.json'))) return 'typescript';
  if (fs.existsSync(path.join(rootPath, 'requirements.txt')) || fs.existsSync(path.join(rootPath, 'pyproject.toml'))) return 'python';
  if (fs.existsSync(path.join(rootPath, 'Cargo.toml'))) return 'rust';
  if (fs.existsSync(path.join(rootPath, 'go.mod'))) return 'go';
  return 'javascript';
}

function findEntryPoints(rootPath: string): string[] {
  const possibleEntries = [
    'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js',
    'pages/index.tsx', 'app/page.tsx', 'src/App.tsx',
    'server.ts', 'index.js', 'main.py', 'src/main.rs', 'main.go'
  ];
  return possibleEntries.filter(p => fs.existsSync(path.join(rootPath, p)));
}

function findConfigFiles(rootPath: string): string[] {
  const possibleConfigs = [
    'package.json', 'tsconfig.json', 'next.config.js', 'vite.config.ts',
    'webpack.config.js', 'docker-compose.yml', 'Dockerfile', '.env.example'
  ];
  return possibleConfigs.filter(p => fs.existsSync(path.join(rootPath, p)));
}

function analyzeArchitecture(rootPath: string): string | null {
  // Simple heuristic
  const hasControllers = fs.existsSync(path.join(rootPath, 'src', 'controllers'));
  const hasViews = fs.existsSync(path.join(rootPath, 'src', 'views'));
  const hasModels = fs.existsSync(path.join(rootPath, 'src', 'models'));
  
  if (hasControllers && hasViews && hasModels) return 'mvc';
  return null;
}

export function analyzeProject(rootPath: string): ProjectProfile {
  const packageJson = readJson(path.join(rootPath, 'package.json'));

  return {
    framework: detectFramework(packageJson),
    language: detectPrimaryLanguage(rootPath),
    dependencies: packageJson.dependencies || {},
    devDependencies: packageJson.devDependencies || {},
    testFramework: detectTestFramework(packageJson),
    styling: detectStyling(packageJson),
    architecture: analyzeArchitecture(rootPath),
    entryPoints: findEntryPoints(rootPath),
    configFiles: findConfigFiles(rootPath)
  };
}
