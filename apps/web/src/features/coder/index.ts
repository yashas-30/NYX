/**
 * @file src/features/coder/index.ts
 * @description Barrel file exporting the public API of the coder feature.
 */

export { CoderPage } from './components/CoderPage';
export { useAgentPipeline } from './hooks/useAgentPipeline';
export { useCoderLogic } from './hooks/useCoderLogic';
export { useMessageHistory } from '@src/shared/hooks/useMessageHistory';
export { useSubagentOrchestrator } from './hooks/useSubagentOrchestrator';
export { useAgentState } from './hooks/useAgentState';
