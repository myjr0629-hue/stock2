'use client';

import { useEffect, useState } from 'react';
import { economicEventLine, SUMMARY_COPY, summarizeTodayPicks, type TodayEconomicEvent } from '@/lib/todayPicks/summary';
import type { PickView } from '@/lib/todayPicks/view';
import type { Loc } from '@/lib/todayPicks/types';
import s from './TodaySummary.module.css';

export function TodaySummary({ locale, items }: { locale: Loc; items: PickView[] | null }) {
  const [event, setEvent] = useState<TodayEconomicEvent | null>(null);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch('/api/today-summary', { signal: controller.signal });
        const data = response.ok ? await response.json() : null;
        if (alive) setEvent(data?.economicEvent ?? null);
      } catch { if (alive) setEvent(null); }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15 * 60_000);
    const resume = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', resume);
    document.addEventListener('app:resume', resume);
    return () => {
      alive = false; controller.abort(); window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
      document.removeEventListener('app:resume', resume);
    };
  }, []);
  const summary = items ? summarizeTodayPicks(items, locale) : null;
  return (
    <section className={s.summary} aria-label={SUMMARY_COPY[locale].title}>
      <h2 className={s.title}>{SUMMARY_COPY[locale].title}</h2>
      {event && <p className={s.event} data-testid="today-economic-event">{economicEventLine(event, locale)}</p>}
      {summary && <p className={s.counts} data-testid="today-picks-summary">
        <span>{summary.total}</span>
        {summary.kinds && <span>{summary.kinds}</span>}
      </p>}
    </section>
  );
}
