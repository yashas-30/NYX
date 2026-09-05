// src/features/hf-explorer/types/index.ts
// Strictly typed domain models for HuggingFace Explorer

export interface ProviderMeta {
  short: string;
  fullName: string;
  from: string;
  to: string;
  text: string;
  ring?: string;
  isQuantizer?: boolean;
  github?: string;
}

export interface HfAuthorData {
  avatarUrl?: string;
  fullname?: string;
}

export interface HfModelResult {
  id: string;
  downloads: number;
  downloads_all_time?: number;
  likes: number;
  tags: string[];
  created_at?: string;
  last_modified?: string;
  gated?: boolean | string;
  trending_score?: number;
  pipeline_tag?: string;
  authorData?: HfAuthorData;
  numParameters?: number;
  siblings?: Array<{ rfilename: string }>;
  author?: string;
  gguf?: {
    architecture?: string;
    context_length?: number;
    chat_template?: string;
    bos_token?: string;
    eos_token?: string;
    totalFileSize?: number;
    total?: number;
  };
  config?: {
    architectures?: string[];
    model_type?: string;
    max_position_embeddings?: number;
    context_length?: number;
    [key: string]: any;
  };
  cardData?: {
    base_model?: string | string[];
    tags?: string[];
    pipeline_tag?: string;
    license?: string;
    license_name?: string;
    [key: string]: any;
  };
  baseModels?: any;
}

export interface HfModelFile {
  filename: string;
  size: number;
}

export interface HardwareSpecs {
  cpu_cores: number;
  total_ram: number;
  free_ram: number;
  gpu_name: string;
  gpu_vram: number;
}

export interface DownloadProgress {
  model_id: string;
  progress: number;
  downloaded: number;
  total: number;
  speed?: number;
  eta?: number;
}

export type DownloadStatus = 'pending' | 'downloading' | 'paused' | 'completed' | 'error';

export interface DownloadState {
  progress: number;
  downloaded: number;
  total: number;
  status: DownloadStatus;
  error?: string;
  eta?: number;
  speed?: number;
}

export type SortMode = 'trending' | 'downloads' | 'likes' | 'lastModified' | 'createdAt';

export interface CategoryFilter {
  id: string;
  label: string;
  query: string;
  color: string;
}

export interface CapabilityTag {
  label: string;
  color: string;
}

export interface ParsedModelId {
  creator: string;
  name: string;
}

export interface QuantInfo {
  quant: string;
  bits: string;
}

export interface TaskInfo {
  label: string;
}
