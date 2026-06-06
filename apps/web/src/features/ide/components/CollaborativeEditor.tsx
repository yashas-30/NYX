import React, { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { MonacoBinding } from 'y-monaco';
import * as Y from 'yjs';

export function CollaborativeEditor({ doc, provider, file }: { doc: Y.Doc, provider: any, file: any }) {
  const editorRef = useRef<any>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    const ytext = doc.getText(file.id);
    const binding = new MonacoBinding(
      ytext,
      editorRef.current.getModel(),
      new Set([editorRef.current]),
      provider.awareness
    );

    return () => {
      binding.destroy();
    };
  }, [doc, file, provider]);

  return (
    <Editor 
      height="100%"
      language="javascript"
      theme="vs-dark"
      onMount={(editor) => { editorRef.current = editor; }}
    />
  );
}
