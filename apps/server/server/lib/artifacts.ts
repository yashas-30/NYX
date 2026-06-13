/**
 * @file server/lib/artifacts.ts
 * @description Artifact extraction utility — inspired by Claude's Artifacts feature.
 * Detects code blocks and structured outputs in agent responses and tags them
 * as interactive artifacts to be rendered in a dedicated side panel by the frontend.
 */

export interface Artifact {
  id: string;
  type: 'code' | 'html' | 'markdown' | 'svg' | 'mermaid' | 'json' | 'csv';
  language: string;
  title: string;
  content: string;
}

export interface ArtifactExtractionResult {
  /** The original text with artifact code blocks replaced by placeholder references */
  text: string;
  /** Extracted artifacts */
  artifacts: Artifact[];
}

// Maps code fence language tags to artifact types
const LANGUAGE_TYPE_MAP: Record<string, Artifact['type']> = {
  html: 'html',
  htm: 'html',
  svg: 'svg',
  mermaid: 'mermaid',
  json: 'json',
  csv: 'csv',
  markdown: 'markdown',
  md: 'markdown',
};

const CODE_ARTIFACT_LANGUAGES = new Set([
  'javascript', 'js', 'typescript', 'ts', 'python', 'py', 'rust', 'go',
  'java', 'cpp', 'c', 'csharp', 'cs', 'php', 'ruby', 'swift', 'kotlin',
  'bash', 'sh', 'sql', 'yaml', 'toml', 'dockerfile',
]);

// Only extract as artifact if the code block is substantial (> 100 chars)
const MIN_ARTIFACT_LENGTH = 100;

let _artifactCounter = 0;

function generateArtifactId(): string {
  return `artifact_${Date.now()}_${++_artifactCounter}`;
}

function inferTitle(language: string, content: string): string {
  // Try to extract a meaningful title from the content
  if (language === 'html' || language === 'htm') {
    const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) return titleMatch[1].trim();
    return 'HTML Document';
  }
  if (language === 'mermaid') return 'Diagram';
  if (language === 'svg') return 'SVG Graphic';
  if (language === 'json') return 'JSON Data';
  if (language === 'csv') return 'CSV Data';
  if (language === 'markdown' || language === 'md') {
    const h1Match = content.match(/^#\s+(.+)/m);
    if (h1Match) return h1Match[1].trim();
    return 'Document';
  }
  // For code: try to find a function/class name
  const funcMatch = content.match(/(?:function|class|def|fn)\s+(\w+)/m);
  if (funcMatch) return `${language}: ${funcMatch[1]}`;
  return `${language.charAt(0).toUpperCase() + language.slice(1)} Code`;
}

/**
 * Extracts artifacts from agent output text.
 * Large code blocks (>100 chars) are pulled out and returned as Artifact objects.
 * The original text has the code block replaced with an inline reference tag.
 */
export function extractArtifacts(text: string): ArtifactExtractionResult {
  const artifacts: Artifact[] = [];
  const CODE_FENCE_RE = /```(\w*)\n([\s\S]*?)```/g;

  const processedText = text.replace(CODE_FENCE_RE, (fullMatch, lang, content) => {
    const language = (lang || 'text').toLowerCase();
    const trimmedContent = content.trim();

    // Skip short snippets — they stay inline
    if (trimmedContent.length < MIN_ARTIFACT_LENGTH) {
      return fullMatch;
    }

    const artifactType: Artifact['type'] =
      LANGUAGE_TYPE_MAP[language] ||
      (CODE_ARTIFACT_LANGUAGES.has(language) ? 'code' : null) as any;

    // Only extract recognized languages
    if (!artifactType) return fullMatch;

    const artifact: Artifact = {
      id: generateArtifactId(),
      type: artifactType,
      language,
      title: inferTitle(language, trimmedContent),
      content: trimmedContent,
    };

    artifacts.push(artifact);
    // Replace with a reference tag that the frontend can use to render the side panel
    return `[ARTIFACT:${artifact.id}]`;
  });

  return { text: processedText, artifacts };
}

/**
 * Checks if a response contains substantial code that should be artifacted.
 */
export function hasArtifacts(text: string): boolean {
  return /```\w+\n[\s\S]{100,}?```/.test(text);
}
