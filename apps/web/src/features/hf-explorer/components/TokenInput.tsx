// src/features/hf-explorer/components/TokenInput.tsx
import { Key, Eye } from '@phosphor-icons/react';

interface TokenInputProps {
  token: string;
  onChange: (token: string) => void;
  showToken: boolean;
  onToggleShow: () => void;
}

export function TokenInput({ token, onChange, showToken, onToggleShow }: TokenInputProps) {
  return (
    <div className="relative shrink-0 flex items-center">
      <Key
        size={12}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none z-10"
      />
      <input
        type={showToken ? 'text' : 'password'}
        value={token}
        onChange={(e) => onChange(e.target.value)}
        placeholder="HF Token (optional)"
        className="bg-background border border-border rounded-lg text-[10px] py-2 pl-7 pr-7 w-40 outline-none focus:border-primary/60 transition-all placeholder:text-muted-foreground/30"
        aria-label="HuggingFace token"
      />
      <button
        onClick={onToggleShow}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        aria-label={showToken ? 'Hide token' : 'Show token'}
      >
        <Eye size={11} weight={showToken ? 'fill' : 'regular'} />
      </button>
    </div>
  );
}
