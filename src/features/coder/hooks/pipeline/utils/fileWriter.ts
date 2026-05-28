import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

interface FileOperation {
  type: 'write';
  path: string;
  previousContent: string | null;
  newContent: string;
  timestamp: number;
}

const history: FileOperation[] = [];
let historyIndex = -1;

export async function writeFileWithHistory(
  filePath: string,
  content: string,
  previousContent: string | null = null
): Promise<void> {
  // Push operation to history
  history.splice(historyIndex + 1);
  history.push({
    type: 'write',
    path: filePath,
    previousContent,
    newContent: content,
    timestamp: Date.now()
  });
  historyIndex++;
  if (history.length > 50) {
    history.shift();
    historyIndex--;
  }

  // Write file via backend API
  const response = await fetchWithAuth('/api/nyx/write-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, content, overwrite: true })
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to write file');
  }
}

export async function undo(): Promise<boolean> {
  if (historyIndex < 0) return false;
  const op = history[historyIndex];
  
  try {
    if (op.previousContent !== null) {
      await fetchWithAuth('/api/nyx/write-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: op.path, content: op.previousContent, overwrite: true })
      });
    } else {
      // If it didn't exist previously, write empty to simulate deletion safely
      await fetchWithAuth('/api/nyx/write-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: op.path, content: '', overwrite: true })
      });
    }
    historyIndex--;
    return true;
  } catch (err: any) {
    console.error('[FileWriter] Undo failed:', err.message);
    return false;
  }
}

export async function redo(): Promise<boolean> {
  if (historyIndex >= history.length - 1) return false;
  historyIndex++;
  const op = history[historyIndex];
  
  try {
    await fetchWithAuth('/api/nyx/write-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: op.path, content: op.newContent, overwrite: true })
    });
    return true;
  } catch (err: any) {
    console.error('[FileWriter] Redo failed:', err.message);
    return false;
  }
}
