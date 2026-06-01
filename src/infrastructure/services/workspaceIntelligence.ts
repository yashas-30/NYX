/**
 * @file src/infrastructure/services/workspaceIntelligence.ts
 * @description Advanced Workspace Intelligence for NYX.
 *              Multi-layered context assembly with semantic search,
 *              file-based memory, context compaction, and session recovery.
 *              Modeled after Claude Code's context hierarchy and Kimi's Workspace DNA.
 */

import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface WorkspaceProfile {
  rootPath: string;
  projectType: string;
  packageManager: string | null;
  entryPoints: string[];
  keyDependencies: Record<string, string>;
  directoryTree: string;
  testFramework: string | null;
  lintConfig: string | null;
  typescriptConfig: string | null;
  recentGitCommits: string[];
  openFiles: string[];
  // New fields for advanced context
  claudeMdHierarchy: ClaudeMdFile[];
  memoryIndex: MemoryEntry[];
  semanticIndex: SemanticSnippet[];
  sessionState: SessionState | null;
}

export interface ClaudeMdFile {
  path: string;
  level: 'global' | 'project' | 'directory' | 'user';
  content: string;
  lastModified: string;
  relevanceScore: number; // 0-1, computed per task
}

export interface MemoryEntry {
  id: string;
  type: 'user' | 'feedback' | 'project' | 'reference';
  content: string;
  timestamp: string;
  tags: string[];
  sourceFile?: string;
}

export interface SemanticSnippet {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  embedding?: number[];
  metadata: {
    type: 'function' | 'class' | 'interface' | 'type' | 'constant' | 'comment';
    name: string;
    signature?: string;
    dependencies: string[];
  };
}

export interface SessionState {
  sessionId: string;
  turnCount: number;
  lastCompactedTurn: number;
  compactedSummary: string;
  pendingToolCalls: string[];
  activePlan: string | null;
  contextPressure: number; // 0-1, estimated token usage ratio
}

export interface ContextAssembly {
  systemContext: string;    // Injected as system prompt
  userContext: string;      // Injected as user-context message
  toolContext: string;      // Conditionally loaded tool schemas
  memoryContext: string;    // Retrieved relevant memories
  workingContext: string;   // Current file + recent edits
  totalTokens: number;      // Estimated token count
}

export interface ContextConfig {
  taskDescription?: string; // For relevance scoring
  currentFile?: string;     // Working file for targeted context
  includeHistory?: boolean; // Include session history
  maxTokens?: number;       // Context budget (default 200K)
  toolFilter?: string[];    // Only include these tools
  compactIfNeeded?: boolean; // Auto-compact if over budget
}

// ============================================================================
// CONSTANTS & CONFIG
// ============================================================================

const CACHE_TTL_MS = 30_000;
const MAX_OPEN_FILES = 20;
const DEFAULT_CONTEXT_BUDGET = 200_000;
const COMPACT_THRESHOLD = 0.85; // Compact at 85% capacity
const SNIPPET_CHARS_PER_TOKEN = 4;

// ============================================================================
// TOKEN ESTIMATION
// ============================================================================

class TokenEstimator {
  static estimate(text: string): number {
    return Math.ceil(text.length / SNIPPET_CHARS_PER_TOKEN);
  }

  static estimateContext(assembly: ContextAssembly): number {
    return (
      this.estimate(assembly.systemContext) +
      this.estimate(assembly.userContext) +
      this.estimate(assembly.toolContext) +
      this.estimate(assembly.memoryContext) +
      this.estimate(assembly.workingContext)
    );
  }
}

// ============================================================================
// LOCAL STORAGE MANAGER
// ============================================================================

class PersistentStore {
  private static readonly PREFIX = 'nyx-wi-';

  static get<T>(key: string, defaultValue: T): T {
    try {
      const raw = localStorage.getItem(this.PREFIX + key);
      return raw ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  static set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(this.PREFIX + key, JSON.stringify(value));
    } catch {
      // Storage full or disabled
    }
  }

  static remove(key: string): void {
    try {
      localStorage.removeItem(this.PREFIX + key);
    } catch {}
  }
}

// ============================================================================
// OPEN FILE TRACKER
// ============================================================================

class OpenFileTracker {
  private files: string[] = [];
  private readonly maxFiles: number;

  constructor(maxFiles = MAX_OPEN_FILES) {
    this.maxFiles = maxFiles;
    this.loadFromStore();
  }

  track(filePath: string): void {
    if (!filePath) return;
    this.files = [filePath, ...this.files.filter(f => f !== filePath)].slice(0, this.maxFiles);
    this.saveToStore();
  }

  getFiles(): string[] {
    return [...this.files];
  }

  getMostRecent(): string | null {
    return this.files[0] ?? null;
  }

  getRecentExcept(current: string, count = 5): string[] {
    return this.files.filter(f => f !== current).slice(0, count);
  }

  clear(): void {
    this.files = [];
    PersistentStore.remove('open-files');
  }

  private loadFromStore(): void {
    this.files = PersistentStore.get<string[]>('open-files', []);
  }

  private saveToStore(): void {
    PersistentStore.set('open-files', this.files);
  }
}

// ============================================================================
// CLAUDE.MD HIERARCHY MANAGER
// ============================================================================

class ClaudeMdManager {
  private hierarchy: ClaudeMdFile[] = [];
  private lastScan = 0;
  private readonly scanInterval = 60_000;

  async scanHierarchy(rootPath: string, currentFile?: string): Promise<ClaudeMdFile[]> {
    const now = Date.now();
    if (now - this.lastScan < this.scanInterval && this.hierarchy.length > 0) {
      return this.hierarchy;
    }

    try {
      const res = await fetchWithAuth('/api/nyx/claude-md-hierarchy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootPath, currentFile }),
      });
      if (res.ok) {
        const data = await res.json();
        this.hierarchy = data.files.map((f: any) => ({
          ...f,
          relevanceScore: this.computeRelevance(f, currentFile),
        }));
        this.lastScan = now;
        PersistentStore.set('claude-md-hierarchy', this.hierarchy);
      }
    } catch {
      this.hierarchy = PersistentStore.get<ClaudeMdFile[]>('claude-md-hierarchy', []);
    }

    return this.hierarchy;
  }

  private computeRelevance(file: ClaudeMdFile, currentFile?: string): number {
    if (!currentFile) return 0.5;
    const fileDir = file.path.substring(0, file.path.lastIndexOf('/'));
    const currentDir = currentFile.substring(0, currentFile.lastIndexOf('/'));
    
    if (file.level === 'global') return 0.9;
    if (file.level === 'user') return 0.8;
    if (currentDir.startsWith(fileDir)) {
      const depth = currentDir.split('/').length - fileDir.split('/').length;
      return Math.max(0.3, 1 - depth * 0.15);
    }
    return 0.3;
  }

  assembleContext(maxTokens: number = 4000): string {
    const sorted = [...this.hierarchy].sort((a, b) => b.relevanceScore - a.relevanceScore);
    let tokens = 0;
    const parts: string[] = [];

    for (const file of sorted) {
      const fileTokens = TokenEstimator.estimate(file.content);
      if (tokens + fileTokens > maxTokens) {
        const remaining = maxTokens - tokens;
        if (remaining > 200) {
          const truncated = this.truncateToTokens(file.content, remaining);
          parts.push(`# ${file.path}\n\n${truncated}`);
        }
        break;
      }
      parts.push(`# ${file.path}\n\n${file.content}`);
      tokens += fileTokens;
    }

    return parts.join('\n\n---\n\n');
  }

  private truncateToTokens(text: string, maxTokens: number): string {
    const maxChars = maxTokens * SNIPPET_CHARS_PER_TOKEN;
    return text.substring(0, maxChars) + '\n\n[... truncated ...]';
  }
}

// ============================================================================
// MEMORY SYSTEM
// ============================================================================

class MemorySystem {
  private entries: MemoryEntry[] = [];
  private index: Map<string, Set<string>> = new Map();

  constructor() {
    this.loadFromStore();
  }

  async loadFromServer(): Promise<void> {
    try {
      const res = await fetchWithAuth('/api/nyx/memory-index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        this.entries = data.entries;
        this.buildIndex();
        this.saveToStore();
      }
    } catch {
      // Use cached
    }
  }

  search(query: string, tags?: string[], limit = 5): MemoryEntry[] {
    const queryLower = query.toLowerCase();
    let candidates = this.entries;

    if (tags && tags.length > 0) {
      const validIds = new Set<string>();
      for (const tag of tags) {
        const ids = this.index.get(tag) ?? new Set();
        ids.forEach(id => validIds.add(id));
      }
      candidates = candidates.filter(e => validIds.has(e.id));
    }

    return candidates
      .map(e => ({
        entry: e,
        score: this.computeScore(e, queryLower),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.entry);
  }

  add(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): MemoryEntry {
    const newEntry: MemoryEntry = {
      ...entry,
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
    };
    this.entries.unshift(newEntry);
    this.indexEntry(newEntry);
    this.saveToStore();
    return newEntry;
  }

  forget(id: string): boolean {
    const idx = this.entries.findIndex(e => e.id === id);
    if (idx === -1) return false;
    const entry = this.entries[idx];
    this.entries.splice(idx, 1);
    for (const tag of entry.tags) {
      this.index.get(tag)?.delete(id);
    }
    this.saveToStore();
    return true;
  }

  private computeScore(entry: MemoryEntry, query: string): number {
    let score = 0;
    const content = entry.content.toLowerCase();
    const words = query.split(/\s+/);
    
    for (const word of words) {
      if (content.includes(word)) score += 1;
      if (entry.tags.some(t => t.toLowerCase().includes(word))) score += 2;
    }
    
    const age = Date.now() - new Date(entry.timestamp).getTime();
    const daysOld = age / (24 * 60 * 60 * 1000);
    score *= Math.max(0.5, 1 - daysOld * 0.05);
    
    return score;
  }

  private buildIndex(): void {
    this.index.clear();
    for (const entry of this.entries) {
      this.indexEntry(entry);
    }
  }

  private indexEntry(entry: MemoryEntry): void {
    for (const tag of entry.tags) {
      if (!this.index.has(tag)) {
        this.index.set(tag, new Set());
      }
      this.index.get(tag)!.add(entry.id);
    }
  }

  private loadFromStore(): void {
    this.entries = PersistentStore.get<MemoryEntry[]>('memory-entries', []);
    this.buildIndex();
  }

  private saveToStore(): void {
    PersistentStore.set('memory-entries', this.entries);
  }
}

// ============================================================================
// SEMANTIC INDEX
// ============================================================================

class SemanticIndex {
  private snippets: SemanticSnippet[] = [];

  async refresh(rootPath: string): Promise<void> {
    try {
      const res = await fetchWithAuth('/api/nyx/semantic-index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootPath }),
      });
      if (res.ok) {
        const data = await res.json();
        this.snippets = data.snippets;
        PersistentStore.set('semantic-index', this.snippets);
      }
    } catch {
      this.snippets = PersistentStore.get<SemanticSnippet[]>('semantic-index', []);
    }
  }

  search(query: string, currentFile?: string, limit = 10): SemanticSnippet[] {
    const queryLower = query.toLowerCase();
    
    return this.snippets
      .map(s => ({
        snippet: s,
        score: this.computeRelevance(s, queryLower, currentFile),
      }))
      .filter(r => r.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.snippet);
  }

  private computeRelevance(snippet: SemanticSnippet, query: string, currentFile?: string): number {
    let score = 0;
    const content = snippet.content.toLowerCase();
    const words = query.split(/\s+/);
    
    for (const word of words) {
      if (content.includes(word)) score += 1;
      if (snippet.metadata.name.toLowerCase().includes(word)) score += 2;
    }
    
    if (currentFile) {
      const snippetDir = snippet.filePath.substring(0, snippet.filePath.lastIndexOf('/'));
      const currentDir = currentFile.substring(0, currentFile.lastIndexOf('/'));
      if (snippetDir === currentDir) score *= 1.5;
      else if (currentDir.startsWith(snippetDir) || snippetDir.startsWith(currentDir)) score *= 1.2;
    }
    
    if (snippet.metadata.type === 'function' || snippet.metadata.type === 'class') score *= 1.3;
    
    return score;
  }

  getSnippetsForFile(filePath: string): SemanticSnippet[] {
    return this.snippets.filter(s => s.filePath === filePath);
  }
}

// ============================================================================
// CONTEXT COMPACTOR
// ============================================================================

class ContextCompactor {
  compact(assembly: ContextAssembly, targetBudget: number): ContextAssembly {
    let currentTokens = TokenEstimator.estimateContext(assembly);
    
    if (currentTokens <= targetBudget * COMPACT_THRESHOLD) {
      return assembly;
    }

    if (currentTokens > targetBudget * COMPACT_THRESHOLD) {
      assembly = this.truncateWorkingContext(assembly, targetBudget * 0.2);
      currentTokens = TokenEstimator.estimateContext(assembly);
    }

    if (currentTokens > targetBudget * COMPACT_THRESHOLD) {
      assembly = this.reduceMemoryContext(assembly, targetBudget * 0.15);
      currentTokens = TokenEstimator.estimateContext(assembly);
    }

    if (currentTokens > targetBudget * COMPACT_THRESHOLD) {
      assembly = this.minimizeToolContext(assembly);
      currentTokens = TokenEstimator.estimateContext(assembly);
    }

    if (currentTokens > targetBudget * COMPACT_THRESHOLD) {
      assembly = this.summarizeUserContext(assembly, targetBudget * 0.25);
      currentTokens = TokenEstimator.estimateContext(assembly);
    }

    if (currentTokens > targetBudget) {
      assembly.systemContext = this.emergencyTruncate(assembly.systemContext, targetBudget * 0.3);
    }

    assembly.totalTokens = TokenEstimator.estimateContext(assembly);
    return assembly;
  }

  private truncateWorkingContext(assembly: ContextAssembly, maxTokens: number): ContextAssembly {
    const maxChars = maxTokens * SNIPPET_CHARS_PER_TOKEN;
    if (TokenEstimator.estimate(assembly.workingContext) > maxTokens) {
      assembly.workingContext = assembly.workingContext.substring(0, maxChars) + 
        '\n\n[... working context truncated ...]';
    }
    return assembly;
  }

  private reduceMemoryContext(assembly: ContextAssembly, maxTokens: number): ContextAssembly {
    const maxChars = maxTokens * SNIPPET_CHARS_PER_TOKEN;
    if (TokenEstimator.estimate(assembly.memoryContext) > maxTokens) {
      const lines = assembly.memoryContext.split('\n');
      let chars = 0;
      const kept: string[] = [];
      for (const line of lines) {
        if (chars + line.length > maxChars) break;
        kept.push(line);
        chars += line.length;
      }
      assembly.memoryContext = kept.join('\n') + '\n\n[... memories truncated ...]';
    }
    return assembly;
  }

  private minimizeToolContext(assembly: ContextAssembly): ContextAssembly {
    assembly.toolContext = '[Tool schemas minimized due to context pressure]';
    return assembly;
  }

  private summarizeUserContext(assembly: ContextAssembly, maxTokens: number): ContextAssembly {
    const maxChars = maxTokens * SNIPPET_CHARS_PER_TOKEN;
    if (TokenEstimator.estimate(assembly.userContext) > maxTokens) {
      assembly.userContext = assembly.userContext.substring(0, maxChars) + 
        '\n\n[... older context summarized: project is a TypeScript/React codebase with standard patterns ...]';
    }
    return assembly;
  }

  private emergencyTruncate(text: string, maxTokens: number): string {
    const maxChars = maxTokens * SNIPPET_CHARS_PER_TOKEN;
    return text.substring(0, maxChars) + '\n\n[... EMERGENCY TRUNCATION ...]';
  }
}

// ============================================================================
// SESSION STATE MANAGER
// ============================================================================

class SessionStateManager {
  private state: SessionState | null = null;

  init(sessionId: string): SessionState {
    this.state = {
      sessionId,
      turnCount: 0,
      lastCompactedTurn: 0,
      compactedSummary: '',
      pendingToolCalls: [],
      activePlan: null,
      contextPressure: 0,
    };
    this.saveToStore();
    return this.state;
  }

  getState(): SessionState | null {
    if (!this.state) {
      this.state = PersistentStore.get<SessionState | null>('session-state', null);
    }
    return this.state;
  }

  incrementTurn(): void {
    if (this.state) {
      this.state.turnCount++;
      this.saveToStore();
    }
  }

  updateContextPressure(pressure: number): void {
    if (this.state) {
      this.state.contextPressure = pressure;
      this.saveToStore();
    }
  }

  setCompactedSummary(summary: string, turn: number): void {
    if (this.state) {
      this.state.compactedSummary = summary;
      this.state.lastCompactedTurn = turn;
      this.saveToStore();
    }
  }

  setActivePlan(plan: string | null): void {
    if (this.state) {
      this.state.activePlan = plan;
      this.saveToStore();
    }
  }

  addPendingToolCall(callId: string): void {
    if (this.state) {
      this.state.pendingToolCalls.push(callId);
      this.saveToStore();
    }
  }

  removePendingToolCall(callId: string): void {
    if (this.state) {
      this.state.pendingToolCalls = this.state.pendingToolCalls.filter(id => id !== callId);
      this.saveToStore();
    }
  }

  private saveToStore(): void {
    PersistentStore.set('session-state', this.state);
  }
}

// ============================================================================
// WORKSPACE INTELLIGENCE (MAIN CLASS)
// ============================================================================

export class WorkspaceIntelligence {
  private static instance: WorkspaceIntelligence;
  
  private openFileTracker: OpenFileTracker;
  private claudeMdManager: ClaudeMdManager;
  private memorySystem: MemorySystem;
  private semanticIndex: SemanticIndex;
  private contextCompactor: ContextCompactor;
  private sessionState: SessionStateManager;
  
  private profileCache: WorkspaceProfile | null = null;
  private profileCacheTime = 0;
  private readonly profileCacheTtl = CACHE_TTL_MS;
  
  private contextAssemblyCache: ContextAssembly | null = null;
  private contextAssemblyKey = '';

  private constructor() {
    this.openFileTracker = new OpenFileTracker();
    this.claudeMdManager = new ClaudeMdManager();
    this.memorySystem = new MemorySystem();
    this.semanticIndex = new SemanticIndex();
    this.contextCompactor = new ContextCompactor();
    this.sessionState = new SessionStateManager();
  }

  static getInstance(): WorkspaceIntelligence {
    if (!WorkspaceIntelligence.instance) {
      WorkspaceIntelligence.instance = new WorkspaceIntelligence();
    }
    return WorkspaceIntelligence.instance;
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  static trackOpenFile(filePath: string): void {
    WorkspaceIntelligence.getInstance().openFileTracker.track(filePath);
    WorkspaceIntelligence.getInstance().clearProfileCache();
  }

  static getOpenFiles(): string[] {
    return WorkspaceIntelligence.getInstance().openFileTracker.getFiles();
  }

  static async getProfile(force = false): Promise<WorkspaceProfile> {
    return WorkspaceIntelligence.getInstance().getProfileInternal(force);
  }

  static async assembleContext(config: ContextConfig = {}): Promise<ContextAssembly> {
    return WorkspaceIntelligence.getInstance().assembleContextInternal(config);
  }

  static async searchCodebase(query: string, currentFile?: string, limit = 10): Promise<SemanticSnippet[]> {
    return WorkspaceIntelligence.getInstance().semanticIndex.search(query, currentFile, limit);
  }

  static addMemory(
    content: string,
    type: MemoryEntry['type'],
    tags: string[] = [],
    sourceFile?: string
  ): MemoryEntry {
    return WorkspaceIntelligence.getInstance().memorySystem.add({
      type,
      content,
      tags,
      sourceFile,
    });
  }

  static searchMemories(query: string, tags?: string[], limit = 5): MemoryEntry[] {
    return WorkspaceIntelligence.getInstance().memorySystem.search(query, tags, limit);
  }

  static initSession(sessionId: string): SessionState {
    return WorkspaceIntelligence.getInstance().sessionState.init(sessionId);
  }

  static getSessionState(): SessionState | null {
    return WorkspaceIntelligence.getInstance().sessionState.getState();
  }

  static clearCache(): void {
    WorkspaceIntelligence.getInstance().clearAllCaches();
  }

  // ==========================================================================
  // INTERNAL METHODS
  // ==========================================================================

  private async getProfileInternal(force = false): Promise<WorkspaceProfile> {
    const now = Date.now();
    if (!force && this.profileCache && (now - this.profileCacheTime < this.profileCacheTtl)) {
      return this.profileCache;
    }

    try {
      const response = await fetchWithAuth('/api/nyx/workspace-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openFiles: this.openFileTracker.getFiles(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch workspace profile: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success && data.profile) {
        const profile: WorkspaceProfile = {
          ...data.profile,
          openFiles: this.openFileTracker.getFiles(),
          claudeMdHierarchy: [],
          memoryIndex: [],
          semanticIndex: [],
          sessionState: this.sessionState.getState(),
        };

        await Promise.all([
          this.claudeMdManager.scanHierarchy(profile.rootPath, this.openFileTracker.getMostRecent() ?? undefined)
            .then(hierarchy => { profile.claudeMdHierarchy = hierarchy; }),
          this.memorySystem.loadFromServer()
            .then(() => { profile.memoryIndex = this.memorySystem.search('', undefined, 20); }),
          this.semanticIndex.refresh(profile.rootPath)
            .then(() => { profile.semanticIndex = this.semanticIndex.search('', undefined, 50); }),
        ]);

        this.profileCache = profile;
        this.profileCacheTime = now;
        PersistentStore.set('workspace-profile', profile);
        return profile;
      }
      throw new Error(data.error || 'Unknown error');
    } catch (err: any) {
      console.warn('[WorkspaceIntelligence] Server fetch failed, loading from local cache:', err);
      
      const cached = PersistentStore.get<WorkspaceProfile | null>('workspace-profile', null);
      if (cached) {
        cached.openFiles = this.openFileTracker.getFiles();
        cached.sessionState = this.sessionState.getState();
        this.profileCache = cached;
        this.profileCacheTime = now;
        return cached;
      }

      return this.getFallbackProfile();
    }
  }

  private async assembleContextInternal(config: ContextConfig = {}): Promise<ContextAssembly> {
    const cacheKey = JSON.stringify({
      task: config.taskDescription,
      file: config.currentFile,
      tools: config.toolFilter,
    });

    if (this.contextAssemblyCache && this.contextAssemblyKey === cacheKey) {
      return this.contextAssemblyCache;
    }

    const profile = await this.getProfileInternal();
    const budget = config.maxTokens ?? DEFAULT_CONTEXT_BUDGET;
    const currentFile = config.currentFile ?? this.openFileTracker.getMostRecent() ?? undefined;

    const systemContext = [
      this.buildProjectContext(profile),
      this.claudeMdManager.assembleContext(budget * 0.15),
    ].join('\n\n');

    const userContext = [
      profile.directoryTree,
      this.buildDependenciesContext(profile),
      this.buildConventionsContext(profile),
    ].join('\n\n');

    const toolContext = config.toolFilter 
      ? `[Filtered tools: ${config.toolFilter.join(', ')}]`
      : '[All tools available]';

    const memories = this.memorySystem.search(
      config.taskDescription ?? '',
      undefined,
      10
    );
    const memoryContext = memories.length > 0
      ? '## Relevant Memories\n\n' + memories.map(m => `- [${m.type}] ${m.content}`).join('\n')
      : '';

    const workingContext = await this.buildWorkingContext(currentFile, config.taskDescription);

    let assembly: ContextAssembly = {
      systemContext,
      userContext,
      toolContext,
      memoryContext,
      workingContext,
      totalTokens: 0,
    };

    assembly.totalTokens = TokenEstimator.estimateContext(assembly);

    if (config.compactIfNeeded !== false && assembly.totalTokens > budget * COMPACT_THRESHOLD) {
      assembly = this.contextCompactor.compact(assembly, budget);
    }

    this.sessionState.updateContextPressure(assembly.totalTokens / budget);
    this.sessionState.incrementTurn();

    this.contextAssemblyCache = assembly;
    this.contextAssemblyKey = cacheKey;

    return assembly;
  }

  private buildProjectContext(profile: WorkspaceProfile): string {
    return [
      `# Workspace: ${profile.rootPath || 'Unknown'}`,
      `## Project Type: ${profile.projectType}`,
      `## Package Manager: ${profile.packageManager ?? 'None'}`,
      `## Entry Points: ${profile.entryPoints.join(', ') || 'None detected'}`,
      `## Test Framework: ${profile.testFramework ?? 'None detected'}`,
      `## TypeScript: ${profile.typescriptConfig ?? 'None detected'}`,
      `## Lint: ${profile.lintConfig ?? 'None detected'}`,
      profile.recentGitCommits.length > 0 
        ? `## Recent Commits:\n${profile.recentGitCommits.slice(0, 5).map(c => `- ${c}`).join('\n')}`
        : '',
    ].filter(Boolean).join('\n');
  }

  private buildDependenciesContext(profile: WorkspaceProfile): string {
    const deps = Object.entries(profile.keyDependencies);
    if (deps.length === 0) return '';
    return '## Key Dependencies\n\n' + deps
      .slice(0, 20)
      .map(([name, version]) => `- ${name}: ${version}`)
      .join('\n');
  }

  private buildConventionsContext(profile: WorkspaceProfile): string {
    const parts: string[] = [];
    if (profile.typescriptConfig) {
      parts.push(`- TypeScript config: ${profile.typescriptConfig}`);
    }
    if (profile.lintConfig) {
      parts.push(`- Lint rules: ${profile.lintConfig}`);
    }
    if (profile.testFramework) {
      parts.push(`- Testing: ${profile.testFramework}`);
    }
    return parts.length > 0 ? '## Conventions\n\n' + parts.join('\n') : '';
  }

  private async buildWorkingContext(currentFile?: string, taskDescription?: string): Promise<string> {
    const parts: string[] = [];
    
    if (currentFile) {
      parts.push(`## Currently Working On\n\n- ${currentFile}`);
      
      const snippets = this.semanticIndex.getSnippetsForFile(currentFile);
      if (snippets.length > 0) {
        parts.push('### Relevant Definitions\n' + snippets
          .slice(0, 5)
          .map(s => `- ${s.metadata.type} ${s.metadata.name} (${s.startLine}-${s.endLine})`)
          .join('\n'));
      }
    }

    const recent = this.openFileTracker.getRecentExcept(currentFile ?? '');
    if (recent.length > 0) {
      parts.push('## Recently Opened\n\n' + recent.map(f => `- ${f}`).join('\n'));
    }

    if (taskDescription) {
      const related = this.semanticIndex.search(taskDescription, currentFile, 5);
      if (related.length > 0) {
        parts.push('### Related Code\n' + related
          .map(s => `- ${s.filePath}#L${s.startLine}-${s.endLine}: ${s.metadata.name}`)
          .join('\n'));
      }
    }

    return parts.join('\n\n');
  }

  private getFallbackProfile(): WorkspaceProfile {
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
      openFiles: this.openFileTracker.getFiles(),
      claudeMdHierarchy: [],
      memoryIndex: [],
      semanticIndex: [],
      sessionState: this.sessionState.getState(),
    };
  }

  private clearProfileCache(): void {
    this.profileCache = null;
    this.profileCacheTime = 0;
    this.contextAssemblyCache = null;
    this.contextAssemblyKey = '';
  }

  private clearAllCaches(): void {
    this.clearProfileCache();
    this.openFileTracker.clear();
    PersistentStore.remove('workspace-profile');
    PersistentStore.remove('claude-md-hierarchy');
    PersistentStore.remove('semantic-index');
    PersistentStore.remove('memory-entries');
    PersistentStore.remove('session-state');
  }
}

/** Legacy singleton instance */
export const workspaceIntelligence = WorkspaceIntelligence.getInstance();
