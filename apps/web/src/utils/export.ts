import { ChatMessage } from '@src/infrastructure/types';

export async function exportChat(
  messages: ChatMessage[],
  format: 'markdown' | 'json' | 'pdf' | 'html'
): Promise<Blob> {
  switch (format) {
    case 'markdown':
      return exportToMarkdown(messages);
    case 'json':
      return new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
    case 'html':
      return exportToHTML(messages);
    case 'pdf':
      return exportToPDF(messages);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

function exportToMarkdown(messages: ChatMessage[]): Blob {
  let md = '# NYX Chat Export\n\n';
  md += `Generated: ${new Date().toISOString()}\n\n`;
  md += '---\n\n';

  for (const msg of messages) {
    const role = msg.role === 'user' ? '**User**' : '**Assistant**';
    md += `${role}\n\n${msg.content}\n\n---\n\n`;
  }

  return new Blob([md], { type: 'text/markdown' });
}

function exportToHTML(messages: ChatMessage[]): Blob {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>NYX Chat Export</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
    .message { margin: 1rem 0; padding: 1rem; border-radius: 8px; }
    .user { background: #f0f9ff; }
    .assistant { background: #f0fdf4; }
    .role { font-weight: 600; margin-bottom: 0.5rem; }
    pre { background: #f8fafc; padding: 1rem; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>NYX Chat Export</h1>
  <p>Generated: ${new Date().toISOString()}</p>
  ${messages.map(m => `
    <div class="message ${m.role}">
      <div class="role">${m.role === 'user' ? 'User' : 'Assistant'}</div>
      <div>${m.content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
    </div>
  `).join('')}
</body>
</html>
  `;
  return new Blob([html], { type: 'text/html' });
}

async function exportToPDF(messages: ChatMessage[]): Promise<Blob> {
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    const base64: string = await invoke('generate_pdf', { messages });
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: 'application/pdf' });
  } catch (error) {
    throw new Error('Failed to generate PDF via Tauri backend');
  }
}
