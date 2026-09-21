import React, { useCallback, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CopyPageButtonProps {
  targetRef: React.RefObject<HTMLElement | null>;
}

export function CopyPageButton({ targetRef }: CopyPageButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const el = targetRef.current;
    if (!el) return;

    const text = el.innerText ?? el.textContent ?? '';
    if (!text.trim()) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [targetRef]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-ui-sm font-medium transition-colors',
        copied
          ? 'border-positive/30 bg-positive/10 text-positive'
          : 'border-border bg-surface-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground',
      )}
      aria-label="Oldal adatainak másolása a vágólapra"
    >
      {copied ? (
        <Check className="h-4 w-4" aria-hidden={true} />
      ) : (
        <Copy className="h-4 w-4" aria-hidden={true} />
      )}
      <span>{copied ? 'Másolva!' : 'Adatok másolása'}</span>
    </button>
  );
}
