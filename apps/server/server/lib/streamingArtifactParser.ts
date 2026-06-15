/**
 * @file server/lib/streamingArtifactParser.ts
 * @description Stateful streaming artifact parser that processes LLM output token-by-token.
 * It extracts markdown code blocks or <nyx_artifact> blocks in real-time,
 * replacing them with [ARTIFACT:id] placeholder references in the text stream,
 * and emitting structured artifact events as the content is generated.
 */

export interface Artifact {
  id: string;
  type: 'code' | 'html' | 'markdown' | 'svg' | 'mermaid' | 'json' | 'csv';
  language: string;
  title: string;
  content: string;
}

export interface ParserOutput {
  /** The text chunk to send to the chat bubble (placeholders replaced/swallowed) */
  textChunk: string;
  /** Any active artifact that is currently updating */
  activeArtifact: Artifact | null;
}

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
  'react', 'jsx', 'tsx'
]);

export class StreamingArtifactParser {
  private buffer = '';
  private state: 'searching' | 'parsing_fence_lang' | 'inside_fence' | 'parsing_xml_tag' | 'inside_xml' = 'searching';
  
  private currentArtifact: Artifact | null = null;
  private currentLang = '';
  private artifactCounter = 0;
  
  constructor() {
    this.artifactCounter = Math.floor(Math.random() * 1000);
  }

  private generateId(): string {
    return `artifact_${Date.now()}_${++this.artifactCounter}`;
  }

  private inferTitle(language: string, content: string): string {
    const trimmed = content.trim();
    if (language === 'html' || language === 'htm') {
      const titleMatch = trimmed.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) return titleMatch[1].trim();
      return 'HTML Document';
    }
    if (language === 'mermaid') return 'Diagram';
    if (language === 'svg') return 'SVG Graphic';
    if (language === 'json') return 'JSON Data';
    if (language === 'csv') return 'CSV Data';
    if (language === 'markdown' || language === 'md') {
      const h1Match = trimmed.match(/^#\s+(.+)/m);
      if (h1Match) return h1Match[1].trim();
      return 'Document';
    }
    // For code: try to find a function/class name
    const funcMatch = trimmed.match(/(?:function|class|def|fn)\s+(\w+)/m);
    if (funcMatch) return `${language}: ${funcMatch[1]}`;
    return `${language.charAt(0).toUpperCase() + language.slice(1)} Code`;
  }

  /**
   * Processes a newly received text token/chunk.
   * Returns the plain text to output to the user and the updated active artifact, if any.
   */
  public ingest(chunk: string): ParserOutput {
    this.buffer += chunk;
    let textChunk = '';
    let activeArtifact: Artifact | null = null;

    // Keep processing the buffer as long as we make transitions
    let loopProtect = 0;
    while (this.buffer.length > 0 && loopProtect++ < 1000) {
      if (this.state === 'searching') {
        const fenceIdx = this.buffer.indexOf('```');
        const xmlIdx = this.buffer.indexOf('<nyx_artifact');

        // Neither found
        if (fenceIdx === -1 && xmlIdx === -1) {
          // Look for partial markers at the end of the buffer to avoid leaking partials
          // e.g. "``" or "<nyx_art"
          let safeLength = this.buffer.length;
          
          // Avoid cutting off in the middle of a potential fence "``"
          if (this.buffer.endsWith('`')) {
            safeLength = Math.max(0, this.buffer.lastIndexOf('`'));
          } else if (this.buffer.endsWith('``')) {
            safeLength = Math.max(0, this.buffer.lastIndexOf('``'));
          }
          // Avoid cutting off in the middle of "<nyx_artifact"
          const lastLt = this.buffer.lastIndexOf('<');
          if (lastLt !== -1 && '<nyx_artifact'.startsWith(this.buffer.substring(lastLt))) {
            safeLength = Math.min(safeLength, lastLt);
          }

          if (safeLength > 0) {
            textChunk += this.buffer.substring(0, safeLength);
            this.buffer = this.buffer.substring(safeLength);
          }
          break; // Need more data
        }

        // Determine which one is closer
        if (fenceIdx !== -1 && (xmlIdx === -1 || fenceIdx < xmlIdx)) {
          // Found code fence
          textChunk += this.buffer.substring(0, fenceIdx);
          this.buffer = this.buffer.substring(fenceIdx + 3);
          this.state = 'parsing_fence_lang';
          this.currentLang = '';
        } else {
          // Found XML tag
          textChunk += this.buffer.substring(0, xmlIdx);
          this.buffer = this.buffer.substring(xmlIdx);
          this.state = 'parsing_xml_tag';
        }
      } else if (this.state === 'parsing_fence_lang') {
        const newlineIdx = this.buffer.indexOf('\n');
        if (newlineIdx === -1) {
          // If we have a very long string without newline, maybe it's not a real fence, but let's wait
          if (this.buffer.length > 50) {
            // Treat as regular text
            textChunk += '```' + this.buffer;
            this.buffer = '';
            this.state = 'searching';
          }
          break; // Need more data
        }

        const langLine = this.buffer.substring(0, newlineIdx).trim();
        this.buffer = this.buffer.substring(newlineIdx + 1);
        
        const language = (langLine || 'text').toLowerCase();
        const artifactType = LANGUAGE_TYPE_MAP[language] || (CODE_ARTIFACT_LANGUAGES.has(language) ? 'code' : null);

        if (artifactType) {
          // Initialize artifact
          const id = this.generateId();
          this.currentArtifact = {
            id,
            type: artifactType as any,
            language,
            title: `${language.charAt(0).toUpperCase() + language.slice(1)} Code`,
            content: '',
          };
          // Emit the placeholder in the chat bubble text stream
          textChunk += `[ARTIFACT:${id}]`;
          this.state = 'inside_fence';
          activeArtifact = { ...this.currentArtifact };
        } else {
          // Revert back to normal text since it's not a recognized artifact language
          textChunk += '```' + langLine + '\n';
          this.state = 'searching';
        }
      } else if (this.state === 'inside_fence') {
        const endFenceIdx = this.buffer.indexOf('```');
        if (endFenceIdx === -1) {
          // Stream growing content
          // Look for partial end fence at the end
          let safeLength = this.buffer.length;
          if (this.buffer.endsWith('`')) {
            safeLength = Math.max(0, this.buffer.lastIndexOf('`'));
          } else if (this.buffer.endsWith('``')) {
            safeLength = Math.max(0, this.buffer.lastIndexOf('``'));
          }

          if (safeLength > 0 && this.currentArtifact) {
            const newContent = this.buffer.substring(0, safeLength);
            this.currentArtifact.content += newContent;
            this.currentArtifact.title = this.inferTitle(this.currentArtifact.language, this.currentArtifact.content);
            activeArtifact = { ...this.currentArtifact };
            this.buffer = this.buffer.substring(safeLength);
          }
          break; // Need more data
        }

        // Found the end of the code fence!
        if (this.currentArtifact) {
          this.currentArtifact.content += this.buffer.substring(0, endFenceIdx);
          this.currentArtifact.title = this.inferTitle(this.currentArtifact.language, this.currentArtifact.content);
          activeArtifact = { ...this.currentArtifact };
        }
        
        this.buffer = this.buffer.substring(endFenceIdx + 3);
        this.state = 'searching';
        this.currentArtifact = null;
      } else if (this.state === 'parsing_xml_tag') {
        const tagCloseIdx = this.buffer.indexOf('>');
        if (tagCloseIdx === -1) {
          break; // Need more data
        }

        const tagText = this.buffer.substring(0, tagCloseIdx + 1);
        this.buffer = this.buffer.substring(tagCloseIdx + 1);

        // Parse attributes from <nyx_artifact id="..." type="..." title="..." language="...">
        const idMatch = tagText.match(/id=["']([^"']+)["']/i);
        const typeMatch = tagText.match(/type=["']([^"']+)["']/i);
        const titleMatch = tagText.match(/title=["']([^"']+)["']/i);
        const langMatch = tagText.match(/language=["']([^"']+)["']/i);

        const id = idMatch ? idMatch[1] : this.generateId();
        const language = langMatch ? langMatch[1] : 'text';
        const type = typeMatch ? typeMatch[1] : (LANGUAGE_TYPE_MAP[language] || 'code');
        const title = titleMatch ? titleMatch[1] : 'Artifact';

        this.currentArtifact = {
          id,
          type: type as any,
          language,
          title,
          content: '',
        };

        textChunk += `[ARTIFACT:${id}]`;
        this.state = 'inside_xml';
        activeArtifact = { ...this.currentArtifact };
      } else if (this.state === 'inside_xml') {
        const endTagIdx = this.buffer.indexOf('</nyx_artifact>');
        if (endTagIdx === -1) {
          // Stream content. Avoid cutting in middle of "</nyx_artifact>"
          let safeLength = this.buffer.length;
          const lastLt = this.buffer.lastIndexOf('<');
          if (lastLt !== -1 && '</nyx_artifact>'.startsWith(this.buffer.substring(lastLt))) {
            safeLength = lastLt;
          }

          if (safeLength > 0 && this.currentArtifact) {
            this.currentArtifact.content += this.buffer.substring(0, safeLength);
            this.currentArtifact.title = this.inferTitle(this.currentArtifact.language, this.currentArtifact.content);
            activeArtifact = { ...this.currentArtifact };
            this.buffer = this.buffer.substring(safeLength);
          }
          break; // Need more data
        }

        // Found XML end tag
        if (this.currentArtifact) {
          this.currentArtifact.content += this.buffer.substring(0, endTagIdx);
          this.currentArtifact.title = this.inferTitle(this.currentArtifact.language, this.currentArtifact.content);
          activeArtifact = { ...this.currentArtifact };
        }

        this.buffer = this.buffer.substring(endTagIdx + '</nyx_artifact>'.length);
        this.state = 'searching';
        this.currentArtifact = null;
      }
    }

    return { textChunk, activeArtifact };
  }

  /**
   * Called at the end of the stream to flush any remaining text in the buffer.
   */
  public flush(): ParserOutput {
    let textChunk = '';
    
    if (this.state === 'searching') {
      textChunk = this.buffer;
    } else if (this.state === 'inside_fence' || this.state === 'inside_xml') {
      if (this.currentArtifact) {
        this.currentArtifact.content += this.buffer;
        this.currentArtifact.title = this.inferTitle(this.currentArtifact.language, this.currentArtifact.content);
        const activeArtifact = { ...this.currentArtifact };
        this.buffer = '';
        return { textChunk: '', activeArtifact };
      }
    } else {
      // Revert parsing state and output buffer
      textChunk = this.buffer;
    }
    
    this.buffer = '';
    return { textChunk, activeArtifact: null };
  }
}
