import { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import { isLocalModel } from '../../core/utils/provider';
import { ComparisonColumn } from '../../types';
import { onModelSwitch, forceUnload } from '../api/ollamaClient';
import { forceUnloadLMStudio, onModelSwitchLMStudio } from '../api/lmStudioClient';
import { AVAILABLE_MODELS } from '../../config/models';

export const unloadLocalIfNeeded = (modelId?: string, _nodeId?: string) => {
  if (!isLocalModel(modelId) || !modelId) return;
  forceUnload(modelId);
  forceUnloadLMStudio(modelId);
};

export const addColumn = (
  setColumns: Dispatch<SetStateAction<ComparisonColumn[]>>,
  setShakingColumnId: Dispatch<SetStateAction<string | null>>,
  modelId?: string
): boolean => {
  // Default to the first available model if none is specified
  const resolvedModelId = modelId ?? AVAILABLE_MODELS[0]?.id;
  let success = true;

  setColumns((prev) => {
    if (resolvedModelId && prev.some((c) => c.modelId === resolvedModelId)) {
      const existingCol = prev.find((c) => c.modelId === resolvedModelId);
      if (existingCol) setShakingColumnId(existingCol.id);
      success = false;
      return prev;
    }

    if (prev.length >= 4) {
      toast.error('Maximum 4 models allowed for comparison grid.');
      success = false;
      return prev;
    }

    const newId = (Math.max(0, ...prev.map((c) => parseInt(c.id) || 0)) + 1).toString();
    
    return [...prev, { id: newId, modelId: resolvedModelId, status: 'idle', output: '' }];
  });

  return success;
};

export const removeColumn = (
  setColumns: Dispatch<SetStateAction<ComparisonColumn[]>>,
  abortGeneration: (columnId: string) => void,
  _unloadOllamaIfNeeded: (modelId?: string, nodeId?: string) => void,
  id: string
) => {
  abortGeneration(id);

  setColumns((prev) => {
    const col = prev.find((c) => c.id === id);
    if (col?.modelId && isLocalModel(col.modelId)) {
      setTimeout(() => {
        forceUnload(col.modelId!);
        forceUnloadLMStudio(col.modelId!);
      }, 0);
    }
    return prev.filter((c) => c.id !== id);
  });
};

export const toggleSelection = (
  setColumns: Dispatch<SetStateAction<ComparisonColumn[]>>,
  id: string
) => {
  setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, isSelected: !c.isSelected } : c)));
};

export const updateModel = (
  setColumns: Dispatch<SetStateAction<ComparisonColumn[]>>,
  abortGeneration: (columnId: string) => void,
  setShakingColumnId: Dispatch<SetStateAction<string | null>>,
  id: string,
  modelId: string,
  _unloadOllamaIfNeeded: (modelId?: string, nodeId?: string) => void
) => {
  setColumns((prev) => {
    if (prev.some((c) => c.modelId === modelId && c.id !== id)) {
      setShakingColumnId(id);
      return prev;
    }
    const col = prev.find((c) => c.id === id);
    const prevModelId = col?.modelId;

    abortGeneration(id);
    
    if (isLocalModel(prevModelId) || isLocalModel(modelId)) {
      onModelSwitch(id, prevModelId, modelId);
      onModelSwitchLMStudio(prevModelId, modelId);
    }
    
    return prev.map((c) =>
      c.id === id ? { ...c, modelId, status: 'idle', output: '', error: undefined } : c
    );
  });
};

export const updateOutput = (
  setColumns: Dispatch<SetStateAction<ComparisonColumn[]>>,
  id: string,
  updates: Partial<ComparisonColumn>
) => {
  setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
};
