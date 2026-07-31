// src/features/hf-explorer/hooks/useHardware.ts
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { HardwareSpecs } from '../types';

interface HardwareResponse {
  success: boolean;
  data: HardwareSpecs;
}

export function useHardware() {
  const [hardware, setHardware] = useState<HardwareSpecs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<HardwareResponse>('get_hardware_specs')
      .then((res) => {
        if (res?.success) setHardware(res.data);
      })
      .catch((err) => setError(String(err)));
  }, []);

  return { hardware, error };
}
