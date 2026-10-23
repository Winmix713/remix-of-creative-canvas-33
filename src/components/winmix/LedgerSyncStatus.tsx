import { useState, useCallback } from 'react';
import { RefreshCw, Cloud, CloudOff, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  SLIP_CLOUD_SYNC_ENABLED,
  syncSlipsToCloud,
} from '../../utils/slipCloudSync';
import type { Slip } from '../../types/winmix';
import { cn } from '../../lib/utils';

export type SyncState = 'idle' | 'syncing' | 'synced' | 'error';

interface LedgerSyncStatusProps {
  slips: Slip[];
}

export function LedgerSyncStatus({ slips }: LedgerSyncStatusProps) {
  const [state, setState] = useState<SyncState>('idle');
  const [errorCount, setErrorCount] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);

  const handleSync = useCallback(async () => {
    setState('syncing');
    try {
      const result = await syncSlipsToCloud(slips);
      if (result.errors.length > 0) {
        setState('error');
        setErrorCount(result.errors.length);
        toast.error(`Szinkronizációs hiba (${result.errors.length} hiba)`);
      } else {
        setState('synced');
        setSyncedCount(result.synced);
        toast.success(`${result.synced} szelvény szinkronizálva a felhőbe`);
      }
    } catch (e) {
      setState('error');
      setErrorCount(1);
      toast.error('Szinkronizációs hiba — nem várt kivétel');
    }
  }, [slips]);

  if (!SLIP_CLOUD_SYNC_ENABLED) return null;

  const chipConfig: Record<
    SyncState,
    { icon: typeof Cloud; label: string; className: string }
  > = {
    idle: {
      icon: CloudOff,
      label: `${slips.length} függő`,
      className: 'bg-surface-1 text-muted-foreground border-border-subtle',
    },
    syncing: {
      icon: RefreshCw,
      label: 'Szinkronizálás…',
      className: 'bg-signal-soft text-signal border-signal/20',
    },
    synced: {
      icon: Cloud,
      label: `${syncedCount} szinkronizálva`,
      className: 'bg-positive-soft text-positive border-positive/20',
    },
    error: {
      icon: AlertCircle,
      label: `${errorCount} hiba`,
      className: 'bg-negative-soft text-negative border-negative/20',
    },
  };

  const chip = chipConfig[state];
  const Icon = chip.icon;

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium',
          chip.className
        )}
      >
        <Icon
          className={cn('h-3 w-3', state === 'syncing' && 'animate-spin')}
          aria-hidden={true}
        />
        {chip.label}
      </span>
      <button
        type="button"
        className="tap flex h-7 items-center gap-1.5 rounded-md border border-border-subtle bg-surface-1 px-2.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-surface-pop hover:text-foreground disabled:opacity-40"
        disabled={state === 'syncing' || slips.length === 0}
        onClick={() => void handleSync()}
      >
        <RefreshCw
          className={cn('h-3 w-3', state === 'syncing' && 'animate-spin')}
          aria-hidden={true}
        />
        Szinkronizálás
      </button>
    </div>
  );
}
