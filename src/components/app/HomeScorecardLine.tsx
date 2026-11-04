'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toWlLocale } from '@/lib/app/watchlistInsights';
import { etDateOf } from '@/lib/marketCalendar';
import { calendarScorecardWeek } from '@/lib/earnings/calendarScorecardDisplay';
import { homeScorecard } from '@/lib/earnings/homeScorecard';
import { nextScorecardWeekStart } from '@/lib/earnings/calendarScorecardRefresh';
import s from '@/app/[locale]/app-view/dash/dash9.module.css';

export function HomeScorecardLine({ locale }: { locale: string }) {
  const loc = toWlLocale(locale);
  const router = useRouter();
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    let stopped = false;
    let controller: AbortController;
    let boundary: ReturnType<typeof setTimeout>;
    const load = () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const now = Date.now();
      const week = calendarScorecardWeek(etDateOf(now));
      setLine(null);
      clearTimeout(boundary);
      boundary = setTimeout(load, nextScorecardWeekStart(now) - now);
      void homeScorecard(async (w) => {
        const response = await fetch(`/api/earnings/scorecard?week=${w}`, { signal });
        if (!response.ok) throw new Error('scorecard unavailable');
        return response.json();
      }, week, loc).then((text) => { if (!stopped && !signal.aborted) setLine(text); });
    };
    const visible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', visible);
    const interval = setInterval(load, 10 * 60_000);
    load();
    return () => { stopped = true; controller?.abort(); clearTimeout(boundary); clearInterval(interval); document.removeEventListener('visibilitychange', visible); };
  }, [loc]);
  if (!line) return null;
  return <button type="button" className={s.e9Scorecard} onClick={() => router.push(`/${loc}/app-view/earnings`)}>{line}</button>;
}
