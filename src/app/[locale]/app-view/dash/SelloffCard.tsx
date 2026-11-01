'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { reportPushPath, REPORT_OPEN_EVENT } from '@/lib/app/reportLink';
import { SELLOFF_COPY, scorecardWeek, signedPct, type SelloffBrief, type SelloffLocale } from '@/lib/selloffBriefing';
import type { ScorecardRow } from '@/lib/earnings/earningsScorecard';
import n9 from './dash9.module.css';
import s from './selloff.module.css';

export function SelloffCard({ brief, locale }: { brief: SelloffBrief; locale: string }) {
  const router = useRouter();
  const loc: SelloffLocale = locale === 'ko' || locale === 'ja' ? locale : 'en';
  const t = SELLOFF_COPY[loc];
  const [rows, setRows] = useState<ScorecardRow[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    setRows([]);
    // 실적 반응은 마감 뒤에 확정되므로 카드가 떠 있는 동안(최장 다음 정규장 마감까지) 10분마다 다시 읽는다. 실패하면 이전 줄 유지.
    const load = () => fetch(`/api/earnings/scorecard?week=${scorecardWeek(brief.date)}`, { signal: controller.signal }).then(r => r.ok ? r.json() : null).then(j => {
      if (j?.week === scorecardWeek(brief.date) && Array.isArray(j.rows)) setRows(j.rows.filter((r: ScorecardRow) => r.beyond === true && r.basis?.reactDate <= brief.date && Number.isFinite(r.expectedPct) && Number.isFinite(r.actualPct)).slice(-3).reverse());
    }).catch(() => {});
    load();
    const id = setInterval(load, 10 * 60_000);
    return () => { clearInterval(id); controller.abort(); };
  }, [brief.date]);
  const open = () => { const path = reportPushPath('closing', loc, brief.date); if (path) { router.push(path); window.dispatchEvent(new Event(REPORT_OPEN_EVENT)); } };
  return <section className={`${n9.e9Sect} ${s.wrap}`}><button type="button" className={s.card} onClick={open}>
    <span className={s.title}>{t.title} · {brief.date} <span aria-hidden="true">›</span></span>
    <span className={s.chips}>{brief.chips.map(c => <span className={n9.e9Badge} key={c.name}>{c.name} {signedPct(c.pct)}</span>)}</span>
    {rows.length > 0 && <span className={s.line}><strong>{t.earnings}</strong>{rows.map(r => <span className={s.row} key={`${r.ticker}|${r.date}`}>{r.ticker} {t.expected} ±{r.expectedPct.toFixed(1)}% → {signedPct(r.actualPct)}</span>)}</span>}
  </button></section>;
}
