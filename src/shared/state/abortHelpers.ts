import { MutableRefObject } from 'react';

export const abortGeneration = (
  activeControllers: MutableRefObject<Record<string, AbortController>>,
  columnId: string
) => {
  if (activeControllers.current[columnId]) {
    activeControllers.current[columnId].abort();
    delete activeControllers.current[columnId];
  }
};

export const abortAllGenerations = (
  activeControllers: MutableRefObject<Record<string, AbortController>>
) => {
  Object.keys(activeControllers.current).forEach((id) => {
    activeControllers.current[id].abort();
  });
  activeControllers.current = {};
};
