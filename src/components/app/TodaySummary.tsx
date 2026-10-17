'use client';

import { useEffect, useState } from 'react';
import { NEXT_COPY, SUMMARY_COPY, releaseTimeLabel, untilLabel, type NextMajorEvent } from '@/lib/todayPicks/summary';
import { formatEventName, fmtVal } from '@/lib/econCalendarNames';
import type { PickView } from '@/lib/todayPicks/view';
import type { Loc } from '@/lib/todayPicks/types';
import s from './TodaySummary.module.css';

/** 오늘 요약 — 대표 10/18: «경제 캘린더의 가장 가까운 주요 지표 발표 일정 + 아래 AI 해석», 오늘 볼 것을 한눈에. */
export function TodaySummary({ locale, items }: { locale: Loc; items: PickView[] | null }) {
  const [next, setNext] = useState<NextMajorEvent | null>(null);
  const [ai, setAi] = useState<Record<string, string> | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    let retry: number | undefined;
    const load = async () => {
      try {
        const response = await fetch('/api/today-summary', { signal: controller.signal, cache: 'no-store' });
        const data = response.ok ? await response.json() : null;
        if (!alive) return;
        setNext(data?.nextEvent ?? null); setAi(data?.ai ?? null); setNow(Date.now());
        // AI 줄은 서버가 응답 뒤에 만든다 — 없으면 한 번 더 읽는다.
        if (data?.nextEvent && !data?.ai && retry === undefined) retry = window.setTimeout(() => { void load(); }, 25_000);
      } catch { if (alive) { setNext(null); setAi(null); } }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15 * 60_000);
    const tick = window.setInterval(() => setNow(Date.now()), 60_000);
    const resume = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', resume);
    document.addEventListener('app:resume', resume);
    return () => {
      alive = false; controller.abort(); window.clearInterval(timer); window.clearInterval(tick); if (retry) window.clearTimeout(retry);
      document.removeEventListener('visibilitychange', resume);
      document.removeEventListener('app:resume', resume);
    };
  }, []);
  const c = NEXT_COPY[locale];
  const earn = items?.find((p) => p.kind === 'earnings') ?? null;
  if (!next && !earn) return null;
  return (
    <section className={s.summary} aria-label={SUMMARY_COPY[locale].title}>
      <h2 className={s.title}>{SUMMARY_COPY[locale].title}</h2>
      {next && <div className={s.next} data-testid="today-next-event">
        <p className={s.kicker}>{c.next} · <span className={s.until}>{untilLabel(next.utcMs, now, locale)}</span></p>
        <p className={s.event}>
          <b>{formatEventName(next.event, locale, locale !== 'en')}</b>
          {next.alsoCount > 0 && <span className={s.also}> {c.also(next.alsoCount)}</span>}
        </p>
        <p className={s.meta}>
          {releaseTimeLabel(next.utcMs, locale)}
          {next.estimate != null && <> · {c.estimate} {fmtVal(next.estimate, next.unit)}</>}
          {next.previous != null && <> · {c.previous} {fmtVal(next.previous, next.unit)}</>}
        </p>
        {ai?.[locale] && <p className={s.ai} data-testid="today-next-event-ai"><span className={s.badge}>✦ AI</span>{ai[locale]}</p>}
      </div>}
      {earn && <p className={s.earn} data-testid="today-earnings-line"><span className={s.kicker}>{c.earnings}</span> <b>{earn.ticker}</b> · {earn.what}</p>}
    </section>
  );
}
