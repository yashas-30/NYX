import React from 'react';
import Editor from '@monaco-editor/react';

export function CodeEditor({ file, onChange, onSave }: { file: any, onChange: any, onSave: any }) {
  const getLanguageFromPath = (path: string) => {
    if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
    if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
    if (path.endsWith('.json')) return 'json';
    return 'plaintext';
  };

  return (
    <Editor
      height="100%"
      language={getLanguageFromPath(file.path)}
      value={file.content}
      onChange={onChange}
      theme="vs-dark"
      options={{
        minimap: { enabled: true },
        fontSize: 14,
        fontFamily: 'JetBrains Mono, Fira Code, monospace',
        fontLigatures: true,
        tabSize: 2,
        wordWrap: 'on',
        autoIndent: 'full',
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
        parameterHints: { enabled: true },
        hover: { enabled: true },
        definitionLinkOpensInPeek: true
      }}
    />
  );
}
