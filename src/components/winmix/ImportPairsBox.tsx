import { useState } from 'react';
import { ClipboardPaste, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { LEAGUE_LABEL } from '../../data/leagues';
import { cn } from '../../lib/utils';
import type { League, FixtureRound } from '../../types/winmix';
import type { TeamOption } from '../../utils/fixtures';
import {
  parseFixtureLines,
  matchPairsToTeams,
  applyMatchedToRound,
  type ImportResult,
} from '../../utils/roundPasteImport';

interface ImportPairsBoxProps {
  league: League;
  pool: TeamOption[];
  round: FixtureRound;
  setFixtureTeam: (
    fixtureId: string,
    side: 'home' | 'away',
    key: string | null
  ) => void;
}

export function ImportPairsBox({
  league,
  pool,
  round,
  setFixtureTeam,
}: ImportPairsBoxProps) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleImport = () => {
    const pairs = parseFixtureLines(text);
    if (pairs.length === 0) {
      toast.error('Nem található érvényes páros a beillesztett szövegben.');
      return;
    }
    const res = matchPairsToTeams(pairs, pool, league);
    setResult(res);
    if (res.matched.length > 0) {
      applyMatchedToRound(round, league, res.matched, setFixtureTeam);
      toast.success(
        `${res.matched.length} pár beállítva (${LEAGUE_LABEL[league]})`
      );
    }
    if (res.unmatched.length > 0 && res.matched.length === 0) {
      toast.error(
        `${res.unmatched.length} páros nem illeszthető — ellenőrizd a csapatneveket.`
      );
    }
  };

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1/50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <ClipboardPaste
          className="h-3.5 w-3.5 text-muted-foreground"
          aria-hidden={true}
        />
        <span className="text-ui-xs font-medium text-foreground">
          Párosítások beillesztése — {LEAGUE_LABEL[league]}
        </span>
      </div>
      <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
        Soronként egy páros: „Csapat A - Csapat B" (vagy –, vs, vs.). A csapatnevek
        a {LEAGUE_LABEL[league]} liga ismert csapatai közül kerülnek ki.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          'Chelsea - London Ágyúk\nVörös Ördögök - Manchester Kék'
        }
        rows={4}
        className="field w-full resize-y text-ui-xs leading-relaxed"
        aria-label={`Párosítások beillesztése — ${LEAGUE_LABEL[league]}`}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">
          {text.trim().split('\n').filter((l) => l.trim()).length} sor
        </span>
        <button
          type="button"
          className="tap flex h-7 items-center gap-1.5 rounded-md border border-border-subtle bg-surface-2 px-2.5 text-[10px] font-medium text-foreground transition-colors hover:bg-surface-pop"
          disabled={text.trim().length === 0 || pool.length === 0}
          onClick={handleImport}
        >
          <Upload className="h-3 w-3" aria-hidden={true} />
          Párok importálása
        </button>
      </div>
      {result && (
        <div className="mt-2 space-y-1">
          {result.matched.length > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-positive">
              <CheckCircle2 className="h-3 w-3" aria-hidden={true} />
              {result.matched.length} pár beállítva
            </div>
          )}
          {result.unmatched.length > 0 && (
            <div className="space-y-1">
              {result.unmatched.map((u, i) => (
                <div
                  key={i}
                  className="flex items-start gap-1.5 rounded-md bg-negative-soft/50 px-2 py-1 text-[11px] text-negative"
                >
                  <AlertCircle
                    className="mt-0.5 h-3 w-3 shrink-0"
                    aria-hidden={true}
                  />
                  <span>
                    <span className="font-medium">{u.line}</span>
                    <span className="ml-1 opacity-80">— {u.reason}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
