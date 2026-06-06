import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import Python from 'tree-sitter-python';
import Rust from 'tree-sitter-rust';
import Go from 'tree-sitter-go';
import path from 'path';

export interface SymbolInfo {
  id: string;
  type: 'function' | 'class' | 'interface' | 'variable' | 'method';
  name: string;
  range: {
    start: { row: number; column: number };
    end: { row: number; column: number };
  };
  signature: string;
  filePath: string;
  callers?: string[];
  callees?: string[];
}

const parser = new Parser();

export function getLanguageParser(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.tsx':
      return TypeScript.typescript;
    case '.js':
    case '.jsx':
      return TypeScript.typescript; // Using TS parser for JS as well for better compatibility usually
    case '.py':
      return Python;
    case '.rs':
      return Rust;
    case '.go':
      return Go;
    default:
      return null;
  }
}

function extractSignature(node: Parser.SyntaxNode): string {
  // A simplistic signature extraction
  return node.text.split('\n')[0].substring(0, 100);
}

export function parseFile(filePath: string, content: string): SymbolInfo[] {
  const lang = getLanguageParser(filePath);
  if (!lang) return [];

  parser.setLanguage(lang);
  const tree = parser.parse(content);
  const symbols: SymbolInfo[] = [];

  const cursor = tree.walk();

  function traverse(node: Parser.SyntaxNode) {
    if (
      node.type === 'function_declaration' ||
      node.type === 'method_definition' ||
      node.type === 'class_declaration' ||
      node.type === 'interface_declaration'
    ) {
      let type: SymbolInfo['type'] = 'function';
      if (node.type === 'method_definition') type = 'method';
      if (node.type === 'class_declaration') type = 'class';
      if (node.type === 'interface_declaration') type = 'interface';

      // For TS/JS, name is usually child node 'name'
      const nameNode = node.childForFieldName('name') || node.children.find(c => c.type === 'identifier');
      
      symbols.push({
        id: `${filePath}:${node.startPosition.row}-${node.startPosition.column}`,
        type,
        name: nameNode?.text || 'anonymous',
        range: { start: node.startPosition, end: node.endPosition },
        signature: extractSignature(node),
        filePath
      });
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        traverse(child);
      }
    }
  }

  traverse(tree.rootNode);
  return symbols;
}
