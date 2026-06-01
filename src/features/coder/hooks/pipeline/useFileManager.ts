import { useCallback } from 'react';
import { writeFile } from '@src/infrastructure/api/coderApi';

export const useFileManager = () => {
  const handleFileWrite = useCallback(async (filePath: string, content: any) => {
    try {
      if (typeof content === 'string') {
        await writeFile(filePath, content);
        console.log(`[File Writer] Successfully wrote file: ${filePath}`);
      }
    } catch (writeErr: any) {
      console.error('Failed to write file:', writeErr);
    }
  }, []);

  return { handleFileWrite };
};
