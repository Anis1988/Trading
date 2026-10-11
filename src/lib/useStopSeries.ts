import { useEffect, useState } from 'react';
import { fetchTrendSeries } from './api';
import type { Holding } from './holdings';

type Series = Record<string, { closes: number[]; dates?: string[] }>;

/**
 * 🛑 Price history for trailing stops. The usual 6 months is enough unless you bought earlier: then 2 years are
 * loaded for that stock, so "the highest close since you bought" really goes back to when you bought.
 */
export function useStopSeries(holdings: Holding[], base: Series): Series {
  const [long, setLong] = useState<Series>({});
  const need = holdings.filter((h) => {
    const d = base[h.symbol]?.dates;
    return h.boughtAt && d?.length && h.boughtAt < d[0];
  }).map((h) => h.symbol).sort();
  const key = need.join(',');
  useEffect(() => {
    if (!need.length) return;
    let live = true;
    fetchTrendSeries(need, '2y').then((r) => live && setLong(r.series)).catch(() => undefined);
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...base, ...Object.fromEntries(need.filter((s) => long[s]).map((s) => [s, long[s]])) };
}
