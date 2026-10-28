'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    let retry: number | undefined;
    let retryCount = 0;
    let eventKey: string | null = null;
    let loading = false;
    const load = async () => {
      if (loading || document.visibilityState !== 'visible') return;
      loading = true;
      try {
        const response = await fetch('/api/today-summary', { signal: controller.signal, cache: 'no-store' });
        const data = response.ok ? await response.json() : null;
        if (!alive) return;
        setNext(data?.nextEvent ?? null); setAi(data?.ai ?? null); setNow(Date.now());
        const nextKey = data?.nextEvent ? JSON.stringify([data.nextEvent.event, data.nextEvent.utcMs]) : null;
        if (nextKey !== eventKey) {
          eventKey = nextKey;
          retryCount = 0;
          if (retry !== undefined) window.clearTimeout(retry);
          retry = undefined;
        }
        if (!data?.aiPending) {
          if (retry !== undefined) window.clearTimeout(retry);
          retry = undefined;
          retryCount = 0;
        } else if (document.visibilityState === 'visible' && retry === undefined && retryCount < 3) {
          retry = window.setTimeout(() => {
            retry = undefined;
            if (document.visibilityState === 'visible') { retryCount++; void load(); }
          }, 25_000);
        }
      } catch { if (alive) { setNext(null); setAi(null); } }
      finally { loading = false; }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15 * 60_000);
    const tick = window.setInterval(() => setNow(Date.now()), 60_000);
    const resume = () => {
      if (document.visibilityState === 'visible') void load();
      else if (retry !== undefined) { window.clearTimeout(retry); retry = undefined; }
    };
    document.addEventListener('visibilitychange', resume);
    document.addEventListener('app:resume', resume);
    return () => {
      alive = false; controller.abort(); window.clearInterval(timer); window.clearInterval(tick); if (retry !== undefined) window.clearTimeout(retry);
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
      {next && <div className={s.block} data-testid="today-next-event">
        <div className={s.blockHead}>
          <span className={s.label}><i className={s.dotEcon} aria-hidden />{c.next}<span className={s.until}>{untilLabel(next.utcMs, now, locale)}</span></span>
          <button type="button" className={s.link} data-testid="today-econ-calendar-link"
            onClick={() => router.push(`/${locale}/app-view/guardian?tab=reality&focus=econ`)}>{c.calendar} ›</button>
        </div>
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
      {earn && <div className={s.block} data-testid="today-earnings-line">
        <div className={s.blockHead}>
          <span className={s.label}><i className={s.dotEarn} aria-hidden />{c.earnings}</span>
        </div>
        <p className={s.event}><b>{earn.ticker}</b></p>
        <p className={s.meta}>{earn.what}</p>
      </div>}
    </section>
  );
}
