'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { watchEarningsCalendar } from '@/components/app/earningsCalendarData';
import { validateRowImplied, type RowImplied } from '@/lib/earnings/earningsImplied';
import { crossBriefUrl, reportPushPath, REPORT_OPEN_EVENT } from '@/lib/app/reportLink';
import { SELLOFF_COPY, scorecardWeek, signedPct, type SelloffBrief, type SelloffLocale } from '@/lib/selloffBriefing';
import type { ScorecardRow } from '@/lib/earnings/earningsScorecard';
import n9 from './dash9.module.css';
import s from './selloff.module.css';

type CalendarRow = { ticker: string; date: string; hour?: string | null; implied?: RowImplied | null };
export function SelloffCard({ brief, locale, tickers }: { brief: SelloffBrief; locale: string; tickers: readonly string[] }) {
  const router = useRouter();
  const loc: SelloffLocale = locale === 'ko' || locale === 'ja' ? locale : 'en';
  const t = SELLOFF_COPY[loc];
  const [why, setWhy] = useState<string | null>(null);
  const [rows, setRows] = useState<ScorecardRow[]>([]);
  const [calendar, setCalendar] = useState<CalendarRow[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    setWhy(null); setRows([]);
    fetch(crossBriefUrl(brief.date), { signal: controller.signal }).then(r => r.ok ? r.json() : null).then(j => {
      const text = j?.structured?.closingNarrative?.why?.[loc];
      if (j?.success && j.date === brief.date && typeof text === 'string' && text.trim()) setWhy(text.trim());
    }).catch(() => {});
    fetch(`/api/earnings/scorecard?week=${scorecardWeek(brief.date)}`, { signal: controller.signal }).then(r => r.ok ? r.json() : null).then(j => {
      if (j?.week === scorecardWeek(brief.date) && Array.isArray(j.rows)) setRows(j.rows.filter((r: ScorecardRow) => r.beyond === true && r.basis?.reactDate <= brief.date && Number.isFinite(r.expectedPct) && Number.isFinite(r.actualPct)).slice(-3).reverse());
    }).catch(() => {});
    return () => controller.abort();
  }, [brief.date, loc]);
  const tickerKey = tickers.join('|');
  useEffect(() => {
    setCalendar([]);
    if (!tickerKey) return;
    return watchEarningsCalendar<CalendarRow>(setCalendar);
  }, [tickerKey]);
  const mine = calendar.filter(r => tickers.includes(r.ticker) && validateRowImplied(r, r.implied)).sort((a, b) => a.date.localeCompare(b.date))[0];
  const open = () => { const path = reportPushPath('closing', loc, brief.date); if (path) { router.push(path); window.dispatchEvent(new Event(REPORT_OPEN_EVENT)); } };
  return <section className={`${n9.e9Sect} ${s.wrap}`}><button type="button" className={s.card} onClick={open}>
    <span className={s.title}>{t.title} · {brief.date} <span aria-hidden="true">›</span></span>
    <span className={s.chips}>{brief.chips.map(c => <span className={n9.e9Badge} key={c.name}>{c.name} {signedPct(c.pct)}</span>)}</span>
    {why && <span className={s.line}><strong>{t.why}</strong> {why}</span>}
    {rows.length > 0 && <span className={s.line}><strong>{t.earnings}</strong>{rows.map(r => <span className={s.row} key={`${r.ticker}|${r.date}`}>{r.ticker} {t.expected} ±{r.expectedPct.toFixed(1)}% → {signedPct(r.actualPct)}</span>)}</span>}
    {mine?.implied && <span className={s.line}><strong>{t.mine}</strong> {mine.ticker} · {mine.date} ±{mine.implied.pct.toFixed(1)}%</span>}
  </button></section>;
}
