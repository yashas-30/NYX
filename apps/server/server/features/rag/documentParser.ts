import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import * as pdfParseModule from 'pdf-parse';
const pdfParse = (pdfParseModule as any).default || pdfParseModule;
import { v4 as uuidv4 } from 'uuid';

export interface ParsedDocument {
  text: string;
  source: string;
}

export class DocumentParser {
  /**
   * Parses a raw buffer (e.g., from a file upload) into raw text.
   */
  static async parseBuffer(buffer: Buffer, mimeType: string, filename: string): Promise<ParsedDocument> {
    let text = '';

    if (mimeType === 'application/pdf') {
      const data = await pdfParse(buffer);
      text = data.text;
    } else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      text = buffer.toString('utf-8');
    } else {
      throw new Error(`Unsupported mime type for RAG ingestion: ${mimeType}`);
    }

    return {
      text,
      source: filename,
    };
  }

  /**
   * Splits text into smaller semantic chunks.
   */
  static async chunkText(doc: ParsedDocument): Promise<Array<{ id: string; text: string; source: string }>> {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const chunks = await splitter.splitText(doc.text);

    return chunks.map((chunk: string) => ({
      id: uuidv4(),
      text: chunk,
      source: doc.source,
    }));
  }
}
