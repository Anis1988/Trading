import { useCallback, useEffect, useState } from 'react';
import type { Settings } from '../types';
import { fetchTrendSeries } from './api';
import { analyze, mockSeries, type Analysis } from './trend';

/** Loads ~6 months of prices for `symbols` and turns them into plain trend readings. */
export function useTrends(symbols: string[], settings: Settings) {
  const [rows, setRows] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [updated, setUpdated] = useState('');
  const [dates, setDates] = useState<Record<string, string[]>>({});
  const key = symbols.join(',');

  const load = useCallback(async () => {
    if (!symbols.length) {
      setRows([]);
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const series: Record<string, { closes: number[]; dates?: string[] }> = {};
      let errors: string[] = [];
      if (settings.mockMode) symbols.forEach((s) => (series[s] = mockSeries(s)));
      else {
        const r = await fetchTrendSeries(symbols);
        Object.assign(series, r.series);
        errors = r.errors;
      }
      const out = symbols
        .map((s) => analyze(s, series[s]?.closes ?? [], settings.holdings.find((h) => h.symbol === s)))
        .filter((a): a is Analysis => !!a)
        .sort((a, b) => b.score - a.score || b.ret3m - a.ret3m);
      setRows(out);
      setDates(Object.fromEntries(Object.entries(series).map(([k, v]) => [k, v.dates ?? []])));
      setUpdated(new Date().toLocaleTimeString());
      if (errors.length) setErr(`No data for: ${errors.map((e) => e.split(':')[0]).join(', ')}.`);
      else if (!out.length) setErr('No price history came back.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, settings.mockMode, settings.holdings]);

  useEffect(() => void load(), [load]);
  return { rows, dates, loading, err, updated, reload: load };
}
