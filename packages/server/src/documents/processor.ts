import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { createWorker } = require('tesseract.js');
import * as crypto from 'crypto';

export interface ProcessedDocument {
  id: string;
  filename: string;
  type: 'pdf' | 'docx' | 'txt' | 'image' | 'code';
  content: string;
  chunks: DocumentChunk[];
  metadata: {
    pageCount?: number;
    wordCount: number;
    charCount: number;
    language: string;
  };
}

export interface DocumentChunk {
  id: string;
  content: string;
  startIndex: number;
  endIndex: number;
  embedding?: number[];
}

export class DocumentProcessor {
  async process(file: Buffer, filename: string): Promise<ProcessedDocument> {
    const type = this.detectType(filename);
    let content: string;

    switch (type) {
      case 'pdf':
        content = await this.processPDF(file);
        break;
      case 'docx':
        content = await this.processDOCX(file);
        break;
      case 'image':
        content = await this.processImage(file);
        break;
      default:
        content = file.toString('utf8');
    }

    const chunks = this.chunkDocument(content);

    return {
      id: crypto.randomUUID(),
      filename,
      type,
      content,
      chunks,
      metadata: {
        wordCount: content.split(/\s+/).length,
        charCount: content.length,
        language: this.detectLanguage(content)
      }
    };
  }

  private async processPDF(buffer: Buffer): Promise<string> {
    try {
      const data = await pdf(buffer);
      return data.text || '';
    } catch (e) {
      console.error('Error parsing PDF:', e);
      return '';
    }
  }

  private async processDOCX(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    } catch (e) {
      console.error('Error parsing DOCX:', e);
      return '';
    }
  }

  private async processImage(buffer: Buffer): Promise<string> {
    try {
      const worker = await createWorker('eng');
      const result = await worker.recognize(buffer);
      await worker.terminate();
      return result.data.text || '';
    } catch (e) {
      console.error('Error parsing Image:', e);
      return '';
    }
  }

  private chunkDocument(content: string, chunkSize = 1000, overlap = 200): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let start = 0;

    if (!content) return chunks;

    while (start < content.length) {
      const end = Math.min(start + chunkSize, content.length);
      // Try to break at paragraph or sentence boundary
      let breakPoint = end;
      if (end < content.length) {
        const searchRange = content.slice(end - 100, end + 100);
        const paragraphBreak = searchRange.lastIndexOf('\n\n');
        const sentenceBreak = searchRange.lastIndexOf('. ');
        if (paragraphBreak > 0) {
          breakPoint = end - 100 + paragraphBreak + 2;
        } else if (sentenceBreak > 0) {
          breakPoint = end - 100 + sentenceBreak + 2;
        }
      }

      chunks.push({
        id: crypto.randomUUID(),
        content: content.slice(start, breakPoint).trim(),
        startIndex: start,
        endIndex: breakPoint
      });

      // Ensure we always advance forward, but handle the final chunk correctly
      if (breakPoint >= content.length) {
        break;
      }
      
      const nextStart = breakPoint - overlap;
      start = nextStart <= start ? start + 1 : nextStart;
    }

    return chunks;
  }

  private detectType(filename: string): ProcessedDocument['type'] {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') return 'pdf';
    if (['docx', 'doc'].includes(ext)) return 'docx';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
    if (['js', 'ts', 'py', 'java', 'cpp', 'go', 'rs', 'html', 'css', 'json'].includes(ext)) return 'code';
    return 'txt';
  }

  private detectLanguage(text: string): string {
    if (!text) return 'en';
    // Simple heuristic
    if (/[\u4e00-\u9fa5]/.test(text)) return 'zh';
    if (/[\u3040-\u309f]/.test(text)) return 'ja';
    if (/[\uac00-\ud7af]/.test(text)) return 'ko';
    return 'en';
  }
}
