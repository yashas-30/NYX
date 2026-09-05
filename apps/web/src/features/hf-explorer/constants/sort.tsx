// src/features/hf-explorer/constants/sort.ts
import React from 'react';
import { TrendUp, Download, Star, Clock } from '@phosphor-icons/react';
import type { SortMode } from '../types';

export const SORT_OPTIONS: { value: SortMode; label: string; icon: React.ReactNode }[] = [
  { value: 'createdAt', label: 'Newly Added', icon: <Clock size={12} weight="bold" /> },
  { value: 'downloads', label: 'Most Downloaded', icon: <Download size={12} weight="bold" /> },
  { value: 'likes', label: 'Most Liked', icon: <Star size={12} weight="bold" /> },
  { value: 'lastModified', label: 'Recently Updated', icon: <TrendUp size={12} weight="bold" /> },
];
