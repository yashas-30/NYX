import { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';

export const updateApiKey = (
  setApiKeys: Dispatch<SetStateAction<Record<string, string>>>,
  provider: string,
  key: string
) => {
  setApiKeys((prev) => ({ ...prev, [provider]: key }));
};

export const clearApiKeys = (setApiKeys: Dispatch<SetStateAction<Record<string, string>>>) => {
  setApiKeys({});
  localStorage.removeItem('llm_ref_api_keys');
  toast.success('All API keys removed from storage');
};
