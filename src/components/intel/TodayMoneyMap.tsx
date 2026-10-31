'use client';
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { getWatchlistStore, type WatchlistItem } from '@/lib/app/watchlist';
import { buildMoneyMap, clearStoredMoneyMapImplied, mapQuoteValues, mergeMoneyMapSources, nqObservationOf, type MapSources, type MapValue } from '@/lib/app/moneyMap';
import { MoneyMapCards, type MoneyMapCopy } from './MoneyMapCards';
import { etDateOf } from '@/lib/marketCalendar';

const EMPTY: readonly WatchlistItem[] = [];
const STORAGE = 'signum:money-map:v1';
type State = { sources: MapSources; values: Record<string, MapValue>; nq: MapValue | null };
async function json(url: string, signal: AbortSignal) {
  const res = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
  if (!res.ok) throw new Error('unavailable');
  return res.json();
}
export function TodayMoneyMap() {
  const locale = useLocale(), t = useTranslations('moneyMap');
  const [state, setState] = useState<State | null>(null), [now, setNow] = useState(0), [selected, setSelected] = useState('');
  const store = getWatchlistStore();
  const items = useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY);
  useEffect(() => {
    const controller = new AbortController(); let busy = false, saved: State | null = null;
    try { const raw = JSON.parse(localStorage.getItem(STORAGE) || 'null'); if (raw?.sources?.sectors && raw?.values) { saved = { ...raw, sources: clearStoredMoneyMapImplied(raw.sources) }; setState(saved); } } catch { /* private storage or no previous observations */ }
    async function refresh() {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true; setNow(Date.now());
      try {
        const pack = await json('/api/intel/money-map', controller.signal);
        if (!pack.success || !pack.sources?.sectors) return;
        const sources = mergeMoneyMapSources(pack.sources, saved?.sources);
        const symbols = [...new Set(['SPY', ...sources.sectors.flatMap(s => [s.id, ...s.tickers])])].filter(t => !['AI_PWR', 'SAFE_HAVEN'].includes(t));
        const requests: Promise<any>[] = [];
        for (let i = 0; i < symbols.length; i += 60) requests.push(json(`/api/live/quotes?symbols=${symbols.slice(i, i + 60).join(',')}`, controller.signal));
        const responses = await Promise.allSettled([...requests, json('/api/market/now', controller.signal)]);
        let values = saved?.values || {}, nq = saved?.nq || null;
        responses.slice(0, -1).forEach(r => { if (r.status === 'fulfilled') values = mapQuoteValues(r.value, values); });
        const backdrop = responses.at(-1);
        if (backdrop?.status === 'fulfilled') {
          const observed = nqObservationOf(backdrop.value.backdrop, etDateOf);
          if (observed) nq = observed;
        }
        if (controller.signal.aborted) return;
        saved = { sources, values, nq }; setState(saved); setNow(Date.now());
        try { localStorage.setItem(STORAGE, JSON.stringify(saved)); } catch { /* keep the previous actual observations in memory */ }
      } catch { /* preserve dated observations on a failed refresh */ }
      finally { busy = false; }
    }
    void refresh(); const timer = setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const copy = t.raw('copy') as MoneyMapCopy;
  if (!state || !now) return null;
  return <MoneyMapCards data={buildMoneyMap(state.sources, state.values, state.nq, now)} copy={copy} locale={locale} selectedId={selected} onSelect={setSelected} watchlist={items.map(i => i.t)} now={now} />;
}
