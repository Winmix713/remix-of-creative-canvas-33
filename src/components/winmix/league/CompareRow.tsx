import React from 'react';
import { cn } from '../../../lib/utils';
import { Td, TdLabel } from '../DataTable';
import type { ComparisonResult } from '../../../utils/compareValues';

const tone = (side: 'a' | 'b', result: ComparisonResult): string => {
  if (result === 'a' || result === 'b') {
    return result === side ? 'text-positive' : 'text-negative';
  }
  // 'tie' and null (not comparable) are both neutral.
  return 'text-foreground';
};

/** One row of the side-by-side team table. Ties and missing values stay neutral. */
export function CompareRow({
  label,
  aVal,
  bVal,
  result = null,
}: {
  label: string;
  aVal: string;
  bVal: string;
  result?: ComparisonResult;
}) {
  return (
    <tr>
      <TdLabel className="pl-4">{label}</TdLabel>
      <Td align="center" className={cn('font-semibold', tone('a', result))}>
        {aVal}
      </Td>
      <Td align="center" className={cn('font-semibold', tone('b', result))}>
        {bVal}
      </Td>
    </tr>
  );
}
