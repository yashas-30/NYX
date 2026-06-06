import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
// import { MonacoBinding } from 'y-monaco';
// import { editor } from 'monaco-editor';

export function initCollaboration(roomName: string) {
  const ydoc = new Y.Doc();
  
  // Connect to peers with WebRTC for serverless real-time collab
  const provider = new WebrtcProvider(roomName, ydoc, {
    signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-eu.herokuapp.com']
  });
  
  // Get a shared text type for the code editor
  const ytext = ydoc.getText('monaco');
  
  /*
  // Bind the Monaco editor to the shared text (Project uses CodeMirror instead of Monaco)
  const model = editorInstance.getModel();
  if (!model) throw new Error("Editor model not found");
  
  const binding = new MonacoBinding(ytext, model, new Set([editorInstance]), provider.awareness);
  */
  
  return { ydoc, provider };
}
