/**
 * @file server/lib/codebaseScanner.ts
 * @description Local repository indexer and RAG search engine for internal files.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot } from './paths.ts';

// Directory and file exclusions to maintain high performance and avoid context bloat
const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  '.nyx-cache',
  '.stitch',
  '.agents',
  '.antigravitycli',
  '.claude',
  '.vscode',
  'dist',
  'public',
  'graphify-out',
  'scratch'
]);

const EXCLUDE_FILES = new Set([
  'package-lock.json',
  'server.err',
  'server.log',
  'skills-lock.json',
  'metadata.json'
]);

// Allow only readable code/text file extensions
const ALLOWED_EXTENSIONS = new Set([
  '.ts', '.tsx',
  '.js', '.jsx',
  '.json',
  '.css',
  '.md',
  '.html',
  '.py',
  '.rs',
  '.go',
  '.yaml',
  '.yml'
]);

// Stop words to filter out of the query tokenization
const STOP_WORDS = new Set([
  'how', 'to', 'the', 'a', 'is', 'for', 'in', 'of', 'and', 'we', 'can', 'i', 'you', 'it', 'on',
  'this', 'that', 'with', 'by', 'an', 'are', 'what', 'be', 'at', 'or', 'do', 'as', 'file', 'code',
  'folder', 'directory', 'project', 'repository', 'local', 'nyx', 'agent', 'model'
]);

interface ScannedFile {
  relativePath: string;
  absolutePath: string;
  fileName: string;
}

interface SearchResult {
  path: string;
  content: string;
  relevanceScore: number;
}

export class CodebaseScanner {
  /**
   * Recursively scans the directory starting at process.cwd()
   */
  private static scanDirectory(dir: string, baseDir: string = dir): ScannedFile[] {
    const results: ScannedFile[] = [];
    
    try {
      if (!fs.existsSync(dir)) return results;
      const list = fs.readdirSync(dir);
      
      for (const file of list) {
        const absolutePath = path.join(dir, file);
        const relativePath = path.relative(baseDir, absolutePath).replace(/\\/g, '/');
        const stat = fs.statSync(absolutePath);
        
        if (stat.isDirectory()) {
          if (!EXCLUDE_DIRS.has(file)) {
            results.push(...this.scanDirectory(absolutePath, baseDir));
          }
        } else {
          const ext = path.extname(file).toLowerCase();
          if (ALLOWED_EXTENSIONS.has(ext) && !EXCLUDE_FILES.has(file)) {
            results.push({
              relativePath,
              absolutePath,
              fileName: file
            });
          }
        }
      }
    } catch (e) {
      console.error(`[Codebase Scanner] Error scanning dir ${dir}:`, e);
    }
    
    return results;
  }

  /**
   * Builds a tree or flat-list representation of the directory structure
   */
  public static getDirectoryStructure(): string {
    const root = getWorkspaceRoot();
    const files = this.scanDirectory(root);
    
    // Group files by relative parent directory
    const folders: Record<string, string[]> = {};
    for (const file of files) {
      const parentDir = path.dirname(file.relativePath);
      const folderKey = parentDir === '.' ? '/' : parentDir.replace(/\\/g, '/');
      if (!folders[folderKey]) folders[folderKey] = [];
      folders[folderKey].push(file.fileName);
    }

    let structureStr = 'PROJECT DIRECTORY MAP:\n';
    const folderKeys = Object.keys(folders).sort();
    
    let lineCount = 0;
    const maxLines = 30;

    for (const folder of folderKeys) {
      if (lineCount >= maxLines) {
        structureStr += `... [Directory map truncated, ${folderKeys.length - folderKeys.indexOf(folder)} folders hidden] ...\n`;
        break;
      }
      structureStr += `📁 ${folder}\n`;
      lineCount++;

      const sortedFiles = folders[folder].sort();
      for (const f of sortedFiles) {
        if (lineCount >= maxLines) {
          structureStr += `  ... [and ${sortedFiles.length - sortedFiles.indexOf(f)} more files hidden] ...\n`;
          break;
        }
        structureStr += `  📄 ${f}\n`;
        lineCount++;
      }
    }
    
    return structureStr;
  }

  /**
   * Tokenizes and cleans a text query into search keywords
   */
  private static tokenizeQuery(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^a-z0-9_\-\.]/g, ' ') // keep alphanumeric, underscore, dash, and dot
      .split(/\s+/)
      .map(t => t.trim())
      .filter(t => t.length > 1 && !STOP_WORDS.has(t));
  }

  /**
   * Searches the codebase for relevant files matching the query
   */
  public static search(query: string, maxResults = 5): SearchResult[] {
    const root = getWorkspaceRoot();
    console.log(`[Codebase Scanner] Searching index in "${root}" for: "${query}"`);
    
    const files = this.scanDirectory(root);
    const tokens = this.tokenizeQuery(query);
    
    if (tokens.length === 0) {
      // If no valid tokens, return the first few readable source files as fallback
      console.log('[Codebase Scanner] No search tokens found. Returning top layout files.');
      return files
        .filter(f => f.relativePath.startsWith('server/') || f.relativePath.startsWith('src/features/coder/'))
        .slice(0, maxResults)
        .map(f => ({
          path: f.relativePath,
          content: this.readFileSafely(f.absolutePath),
          relevanceScore: 1
        }));
    }

    console.log(`[Codebase Scanner] Extracted search tokens:`, tokens);
    const scoredResults: SearchResult[] = [];

    for (const file of files) {
      let score = 0;
      const lowerPath = file.relativePath.toLowerCase();
      const lowerName = file.fileName.toLowerCase();
      
      // 1. Path Matching (filenames or folders in the path matching tokens get huge scores)
      for (const token of tokens) {
        if (lowerName.includes(token)) {
          score += 150; // High matches for direct file name matches
        } else if (lowerPath.includes(token)) {
          score += 50; // Medium matches for directory name matches
        }
      }

      // 2. Content Term Frequency Matching
      let content = '';
      try {
        content = this.readFileSafely(file.absolutePath);
        if (content) {
          const lowerContent = content.toLowerCase();
          for (const token of tokens) {
            // Count occurrences of token in content
            let pos = lowerContent.indexOf(token);
            let occurrences = 0;
            while (pos !== -1 && occurrences < 30) { // cap term-frequency influence at 30
              occurrences++;
              pos = lowerContent.indexOf(token, pos + token.length);
            }
            score += occurrences * 2; // Each code occurrence adds to relevance
          }
        }
      } catch (err) {
        // Skip content read failure, keep path score
      }

      if (score > 0) {
        scoredResults.push({
          path: file.relativePath,
          content,
          relevanceScore: score
        });
      }
    }

    // Sort by relevance score descending
    scoredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    const finalResults = scoredResults.slice(0, maxResults);
    console.log(`[Codebase Scanner] Top matches:`, finalResults.map(r => `${r.path} (score: ${r.relevanceScore})`));
    
    return finalResults;
  }

  /**
   * Safely reads a file with size limits to prevent out-of-memory errors
   */
  private static readFileSafely(absolutePath: string): string {
    try {
      const stats = fs.statSync(absolutePath);
      // Cap individual file reads at 3KB to keep LLM context light and avoid local context window overflows
      const maxSizeBytes = 3 * 1024;
      
      if (stats.size > maxSizeBytes) {
        const stream = fs.readFileSync(absolutePath, 'utf8');
        return stream.substring(0, maxSizeBytes) + '\n\n... [File truncated due to local context size limit] ...';
      }
      
      return fs.readFileSync(absolutePath, 'utf8');
    } catch (e) {
      return '';
    }
  }
}
