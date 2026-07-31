// src/features/hf-explorer/constants/categories.tsx
import React from 'react';
import {
  Fire, Eye, Brain, Microphone, Table, Robot, CirclesThree,
  SquaresFour, Code, Lightning
} from '@phosphor-icons/react';
import type { CategoryFilter } from '../types';

export interface CategoryItem extends CategoryFilter {
  section: string;
}

export interface CategoryGroup {
  name: string;
  icon: React.ReactNode;
  categories: CategoryItem[];
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    name: 'Multimodal',
    icon: <Eye size={14} className="text-purple-400" />,
    categories: [
      { id: 'audio-text-to-text', label: 'Audio-Text-to-Text', query: 'audio-text-to-text', color: 'purple', section: 'Multimodal' },
      { id: 'image-text-to-text', label: 'Image-Text-to-Text', query: 'image-text-to-text', color: 'purple', section: 'Multimodal' },
      { id: 'image-text-to-image', label: 'Image-Text-to-Image', query: 'image-text-to-image', color: 'purple', section: 'Multimodal' },
      { id: 'image-text-to-video', label: 'Image-Text-to-Video', query: 'image-text-to-video', color: 'purple', section: 'Multimodal' },
      { id: 'visual-question-answering', label: 'Visual Question Answering', query: 'visual-question-answering', color: 'purple', section: 'Multimodal' },
      { id: 'document-question-answering', label: 'Document Question Answering', query: 'document-question-answering', color: 'purple', section: 'Multimodal' },
      { id: 'video-text-to-text', label: 'Video-Text-to-Text', query: 'video-text-to-text', color: 'purple', section: 'Multimodal' },
      { id: 'visual-document-retrieval', label: 'Visual Document Retrieval', query: 'visual-document-retrieval', color: 'purple', section: 'Multimodal' },
      { id: 'any-to-any', label: 'Any-to-Any', query: 'any-to-any', color: 'purple', section: 'Multimodal' },
    ],
  },
  {
    name: 'Computer Vision',
    icon: <SquaresFour size={14} className="text-pink-400" />,
    categories: [
      { id: 'depth-estimation', label: 'Depth Estimation', query: 'depth-estimation', color: 'pink', section: 'Computer Vision' },
      { id: 'image-classification', label: 'Image Classification', query: 'image-classification', color: 'pink', section: 'Computer Vision' },
      { id: 'object-detection', label: 'Object Detection', query: 'object-detection', color: 'pink', section: 'Computer Vision' },
      { id: 'image-segmentation', label: 'Image Segmentation', query: 'image-segmentation', color: 'pink', section: 'Computer Vision' },
      { id: 'text-to-image', label: 'Text-to-Image', query: 'text-to-image', color: 'pink', section: 'Computer Vision' },
      { id: 'image-to-text', label: 'Image-to-Text', query: 'image-to-text', color: 'pink', section: 'Computer Vision' },
      { id: 'image-to-image', label: 'Image-to-Image', query: 'image-to-image', color: 'pink', section: 'Computer Vision' },
      { id: 'image-to-video', label: 'Image-to-Video', query: 'image-to-video', color: 'pink', section: 'Computer Vision' },
      { id: 'unconditional-image-generation', label: 'Unconditional Image Generation', query: 'unconditional-image-generation', color: 'pink', section: 'Computer Vision' },
      { id: 'video-classification', label: 'Video Classification', query: 'video-classification', color: 'pink', section: 'Computer Vision' },
      { id: 'text-to-video', label: 'Text-to-Video', query: 'text-to-video', color: 'pink', section: 'Computer Vision' },
      { id: 'zero-shot-image-classification', label: 'Zero-Shot Image Classification', query: 'zero-shot-image-classification', color: 'pink', section: 'Computer Vision' },
      { id: 'mask-generation', label: 'Mask Generation', query: 'mask-generation', color: 'pink', section: 'Computer Vision' },
      { id: 'zero-shot-object-detection', label: 'Zero-Shot Object Detection', query: 'zero-shot-object-detection', color: 'pink', section: 'Computer Vision' },
      { id: 'text-to-3d', label: 'Text-to-3D', query: 'text-to-3d', color: 'pink', section: 'Computer Vision' },
      { id: 'image-to-3d', label: 'Image-to-3D', query: 'image-to-3d', color: 'pink', section: 'Computer Vision' },
      { id: 'image-feature-extraction', label: 'Image Feature Extraction', query: 'image-feature-extraction', color: 'pink', section: 'Computer Vision' },
      { id: 'keypoint-detection', label: 'Keypoint Detection', query: 'keypoint-detection', color: 'pink', section: 'Computer Vision' },
      { id: 'video-to-video', label: 'Video-to-Video', query: 'video-to-video', color: 'pink', section: 'Computer Vision' },
    ],
  },
  {
    name: 'Natural Language Processing',
    icon: <Brain size={14} className="text-sky-400" />,
    categories: [
      { id: 'text-generation', label: 'Text Generation', query: 'text-generation', color: 'sky', section: 'Natural Language Processing' },
      { id: 'text-classification', label: 'Text Classification', query: 'text-classification', color: 'sky', section: 'Natural Language Processing' },
      { id: 'token-classification', label: 'Token Classification', query: 'token-classification', color: 'sky', section: 'Natural Language Processing' },
      { id: 'table-question-answering', label: 'Table Question Answering', query: 'table-question-answering', color: 'sky', section: 'Natural Language Processing' },
      { id: 'question-answering', label: 'Question Answering', query: 'question-answering', color: 'sky', section: 'Natural Language Processing' },
      { id: 'zero-shot-classification', label: 'Zero-Shot Classification', query: 'zero-shot-classification', color: 'sky', section: 'Natural Language Processing' },
      { id: 'translation', label: 'Translation', query: 'translation', color: 'sky', section: 'Natural Language Processing' },
      { id: 'summarization', label: 'Summarization', query: 'summarization', color: 'sky', section: 'Natural Language Processing' },
      { id: 'feature-extraction', label: 'Feature Extraction', query: 'feature-extraction', color: 'sky', section: 'Natural Language Processing' },
      { id: 'fill-mask', label: 'Fill-Mask', query: 'fill-mask', color: 'sky', section: 'Natural Language Processing' },
      { id: 'sentence-similarity', label: 'Sentence Similarity', query: 'sentence-similarity', color: 'sky', section: 'Natural Language Processing' },
      { id: 'text-ranking', label: 'Text Ranking', query: 'text-ranking', color: 'sky', section: 'Natural Language Processing' },
    ],
  },
  {
    name: 'Audio',
    icon: <Microphone size={14} className="text-emerald-400" />,
    categories: [
      { id: 'text-to-speech', label: 'Text-to-Speech', query: 'text-to-speech', color: 'emerald', section: 'Audio' },
      { id: 'text-to-audio', label: 'Text-to-Audio', query: 'text-to-audio', color: 'emerald', section: 'Audio' },
      { id: 'automatic-speech-recognition', label: 'Automatic Speech Recognition', query: 'automatic-speech-recognition', color: 'emerald', section: 'Audio' },
      { id: 'audio-to-audio', label: 'Audio-to-Audio', query: 'audio-to-audio', color: 'emerald', section: 'Audio' },
      { id: 'audio-classification', label: 'Audio Classification', query: 'audio-classification', color: 'emerald', section: 'Audio' },
      { id: 'voice-activity-detection', label: 'Voice Activity Detection', query: 'voice-activity-detection', color: 'emerald', section: 'Audio' },
    ],
  },
  {
    name: 'Tabular',
    icon: <Table size={14} className="text-amber-400" />,
    categories: [
      { id: 'tabular-classification', label: 'Tabular Classification', query: 'tabular-classification', color: 'amber', section: 'Tabular' },
      { id: 'tabular-regression', label: 'Tabular Regression', query: 'tabular-regression', color: 'amber', section: 'Tabular' },
      { id: 'time-series-forecasting', label: 'Time Series Forecasting', query: 'time-series-forecasting', color: 'amber', section: 'Tabular' },
    ],
  },
  {
    name: 'Reinforcement Learning',
    icon: <Robot size={14} className="text-rose-400" />,
    categories: [
      { id: 'reinforcement-learning', label: 'Reinforcement Learning', query: 'reinforcement-learning', color: 'rose', section: 'Reinforcement Learning' },
      { id: 'robotics', label: 'Robotics', query: 'robotics', color: 'rose', section: 'Reinforcement Learning' },
    ],
  },
  {
    name: 'Other',
    icon: <CirclesThree size={14} className="text-indigo-400" />,
    categories: [
      { id: 'graph-machine-learning', label: 'Graph Machine Learning', query: 'graph-machine-learning', color: 'indigo', section: 'Other' },
      { id: 'other', label: 'Other', query: 'other', color: 'indigo', section: 'Other' },
    ],
  },
];

export const ALL_CATEGORIES: CategoryItem[] = [
  { id: 'all', label: 'All Models / Tasks', query: '', color: 'orange', section: 'Featured' },
  { id: 'instruct', label: 'Instruct Models', query: 'instruct', color: 'sky', section: 'Featured' },
  { id: 'chat', label: 'Chat Models', query: 'chat', color: 'violet', section: 'Featured' },
  { id: 'code', label: 'Coding Models', query: 'code', color: 'emerald', section: 'Featured' },
  ...CATEGORY_GROUPS.flatMap((g) => g.categories),
];

// Fallback legacy array for backwards compatibility
export const CATEGORIES: CategoryFilter[] = ALL_CATEGORIES;

export const CAT_COLOR: Record<string, string> = {
  orange:  'bg-orange-500/10 text-orange-400 border-orange-500/25 hover:bg-orange-500/15',
  sky:     'bg-sky-500/10 text-sky-400 border-sky-500/25 hover:bg-sky-500/15',
  violet:  'bg-violet-500/10 text-violet-400 border-violet-500/25 hover:bg-violet-500/15',
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/15',
  purple:  'bg-purple-500/10 text-purple-400 border-purple-500/25 hover:bg-purple-500/15',
  pink:    'bg-pink-500/10 text-pink-400 border-pink-500/25 hover:bg-pink-500/15',
  blue:    'bg-blue-500/10 text-blue-400 border-blue-500/25 hover:bg-blue-500/15',
  rose:    'bg-rose-500/10 text-rose-400 border-rose-500/25 hover:bg-rose-500/15',
  indigo:  'bg-indigo-500/10 text-indigo-400 border-indigo-500/25 hover:bg-indigo-500/15',
  amber:   'bg-amber-500/10 text-amber-400 border-amber-500/25 hover:bg-amber-500/15',
};

export const CAT_ACTIVE: Record<string, string> = {
  orange:  'bg-orange-500/20 text-orange-300 border-orange-400/40',
  sky:     'bg-sky-500/20 text-sky-300 border-sky-400/40',
  violet:  'bg-violet-500/20 text-violet-300 border-violet-400/40',
  emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
  purple:  'bg-purple-500/20 text-purple-300 border-purple-400/40',
  pink:    'bg-pink-500/20 text-pink-300 border-pink-400/40',
  blue:    'bg-blue-500/20 text-blue-300 border-blue-400/40',
  rose:    'bg-rose-500/20 text-rose-300 border-rose-400/40',
  indigo:  'bg-indigo-500/20 text-indigo-300 border-indigo-400/40',
  amber:   'bg-amber-500/20 text-amber-300 border-amber-400/40',
};

export const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  all: <Fire size={13} weight="duotone" />,
  instruct: <Lightning size={13} weight="duotone" />,
  chat: <Brain size={13} weight="duotone" />,
  code: <Code size={13} weight="duotone" />,
  vision: <Eye size={13} weight="duotone" />,
};
