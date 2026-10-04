import { useEffect, useState } from 'react';
import { fetchInsights, type InsightsResult } from './api';

const cache = new Map<string, { at: number; data: InsightsResult }>();
const TTL = 15 * 60_000;

/** Market trend + earnings / analysts / basics for the given symbols (free data, cached 15 min). */
export function useInsights(symbols: string[]): InsightsResult | null {
  const key = [...new Set(symbols)].sort().join(',');
  const [data, setData] = useState<InsightsResult | null>(() => cache.get(key)?.data ?? null);
  useEffect(() => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return setData(hit.data);
    let alive = true;
    fetchInsights(key ? key.split(',') : [])
      .then((d) => {
        cache.set(key, { at: Date.now(), data: d });
        if (alive) setData(d);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key]);
  return data;
}
