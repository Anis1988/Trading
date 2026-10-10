import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Settings } from '../types';
import { fetchTrendSeries } from './api';
import { analyze, type Analysis } from './trend';
import { PRESETS, type Rules } from './strictness';

/**
 * Loads ~6 months of prices for `symbols` and turns them into plain trend readings with the rules of the level in use
 * (🎚️ How careful); changing the level re-reads them at once, without loading the prices again.
 */
export function useTrends(symbols: string[], settings: Settings, rules: Rules = PRESETS.balanced) {
  const [series, setSeries] = useState<Record<string, { closes: number[]; dates?: string[] }>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [updated, setUpdated] = useState('');
  const [dates, setDates] = useState<Record<string, string[]>>({});
  const key = symbols.join(',');

  const load = useCallback(async () => {
    if (!symbols.length) {
      setSeries({});
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const series: Record<string, { closes: number[]; dates?: string[] }> = {};
      let errors: string[] = [];
      const r = await fetchTrendSeries(symbols);
      Object.assign(series, r.series);
      errors = r.errors;
      setSeries(series);
      const out = symbols.filter((s) => (series[s]?.closes.length ?? 0) >= 55);
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
  }, [key, settings.holdings]);

  useEffect(() => void load(), [load]);
  const rkey = JSON.stringify(rules);
  const rows = useMemo(() => symbols
    .map((s) => analyze(s, series[s]?.closes ?? [], settings.holdings.find((h) => h.symbol === s), rules))
    .filter((a): a is Analysis => !!a)
    .sort((a, b) => b.score - a.score || b.ret3m - a.ret3m), [series, settings.holdings, rkey]); // eslint-disable-line react-hooks/exhaustive-deps
  return { rows, dates, loading, err, updated, reload: load, series };
}
