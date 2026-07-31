// src/features/hf-explorer/components/ProviderName.tsx
import { PROVIDER_META } from '../constants/providers';

interface ProviderNameProps {
  creator: string;
  className?: string;
}

export function ProviderName({ creator, className = '' }: ProviderNameProps) {
  const meta = PROVIDER_META[creator] ?? PROVIDER_META[creator.toLowerCase()];
  return (
    <span
      className={`font-bold ${className}`}
      style={{ color: meta?.from ?? undefined }}
    >
      {meta?.fullName ?? creator}
    </span>
  );
}
