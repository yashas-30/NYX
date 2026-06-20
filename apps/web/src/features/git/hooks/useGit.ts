import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export interface GitBranchInfo {
  name: string;
  current: boolean;
  ahead: number;
  behind: number;
  lastCommit: string;
  lastCommitDate: string;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  files: string[];
}

export interface GitStatus {
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  renamed: string[];
  branch: string;
  ahead: number;
  behind: number;
}

const apiClient = axios.create({
  baseURL: '/api/v1/git'
});

export function useGitStatus() {
  return useQuery({
    queryKey: ['git', 'status'],
    queryFn: async () => {
      const { data } = await apiClient.get('/status');
      if (!data.success) throw new Error(data.message);
      return data.status as GitStatus;
    },
    refetchInterval: 10000,
  });
}

export function useGitLog(n: number = 10) {
  return useQuery({
    queryKey: ['git', 'log', n],
    queryFn: async () => {
      const { data } = await apiClient.get(`/log?n=${n}`);
      if (!data.success) throw new Error(data.message);
      return data.log as GitCommit[];
    },
  });
}

export function useGitBranches() {
  return useQuery({
    queryKey: ['git', 'branches'],
    queryFn: async () => {
      const { data } = await apiClient.get('/branches');
      if (!data.success) throw new Error(data.message);
      return data.branches as GitBranchInfo[];
    },
  });
}

export function useGitDiff(filePath?: string) {
  return useQuery({
    queryKey: ['git', 'diff', filePath],
    queryFn: async () => {
      const { data } = await apiClient.post('/diff', { filePath });
      if (!data.success) throw new Error(data.message);
      return data.diff as string;
    },
  });
}

export function useGitActions() {
  const queryClient = useQueryClient();

  const stageMutation = useMutation({
    mutationFn: async (files: string[]) => {
      const { data } = await apiClient.post('/stage', { files });
      if (!data.success) throw new Error(data.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git', 'status'] });
    }
  });

  const commitMutation = useMutation({
    mutationFn: async (message: string) => {
      const { data } = await apiClient.post('/commit', { message });
      if (!data.success) throw new Error(data.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git'] });
    }
  });

  return {
    stage: stageMutation.mutateAsync,
    commit: commitMutation.mutateAsync,
    isStaging: stageMutation.isPending,
    isCommitting: commitMutation.isPending
  };
}
