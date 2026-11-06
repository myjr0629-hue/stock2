'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { crossBriefUrl, reportPushPath, REPORT_OPEN_EVENT } from '@/lib/app/reportLink';
import { SELLOFF_COPY, scorecardWeek, selloffTitleKey, selloffWhyLine, signedPct, type SelloffBrief, type SelloffLocale, type SelloffReport } from '@/lib/selloffBriefing';
import type { ScorecardRow } from '@/lib/earnings/earningsScorecard';
import s from './selloff.module.css';

export function SelloffCard({ brief, locale }: { brief: SelloffBrief; locale: string }) {
  const router = useRouter();
  const loc: SelloffLocale = locale === 'ko' || locale === 'ja' ? locale : 'en';
  const t = SELLOFF_COPY[loc];
  const [rows, setRows] = useState<ScorecardRow[]>([]);
  const [report, setReport] = useState<SelloffReport>(null);
  useEffect(() => {
    const controller = new AbortController();
    setRows([]); setReport(null);
    // 실적 반응은 마감 뒤에 확정되므로 카드가 떠 있는 동안(최장 다음 정규장 마감까지) 10분마다 다시 읽는다. 실패하면 이전 줄 유지.
    const load = () => fetch(`/api/earnings/scorecard?week=${scorecardWeek(brief.date)}`, { signal: controller.signal }).then(r => r.ok ? r.json() : null).then(j => {
      if (j?.week === scorecardWeek(brief.date) && Array.isArray(j.rows)) setRows(j.rows.filter((r: ScorecardRow) => r.beyond === true && r.basis?.reactDate <= brief.date && Number.isFinite(r.expectedPct) && Number.isFinite(r.actualPct)).slice(-3).reverse());
    }).catch(() => {});
    // «왜» 줄(대표 11/6 승인): 같은 세션 장마감 리포트 저장본만 읽는다(날짜 지정 GET 은 없으면 404 — 생성 0).
    // 리포트는 마감 뒤 늦게 생기거나 재생성되므로 실적 줄과 같은 10분 주기로 다시 읽는다. 실패·404 는 이미 받은 리포트를 지우지 않는다.
    const loadReport = () => fetch(crossBriefUrl(brief.date), { signal: controller.signal }).then(async r => {
      if (r.status === 404) return setReport(p => p?.status === 'ok' ? p : { status: 'missing' });
      if (!r.ok) return setReport(p => p ?? { status: 'error' });
      const json = await r.json();
      setReport({ status: 'ok', json });
    }).catch(() => { if (!controller.signal.aborted) setReport(p => p ?? { status: 'error' }); });
    load(); loadReport();
    const id = setInterval(() => { load(); loadReport(); }, 10 * 60_000);
    return () => { clearInterval(id); controller.abort(); };
  }, [brief.date]);
  const why = selloffWhyLine(brief, loc, report);
  const open = () => { const path = reportPushPath('closing', loc, brief.date); if (path) { router.push(path); window.dispatchEvent(new Event(REPORT_OPEN_EVENT)); } };
  return <section className={s.wrap}><button type="button" className={s.card} onClick={open}>
    <span className={s.title}><span className={s.alert}><i className={s.dot} aria-hidden="true" />{t[selloffTitleKey(brief)]}</span><span className={s.date}>{brief.date} ›</span></span>
    <span className={s.chips}>{brief.chips.map(c => <span className={s.chip} key={c.name}>{c.name} <b className={(c.name === 'VIX' ? c.pct > 0 : c.pct < 0) ? s.bad : s.ok}>{signedPct(c.pct)}</b></span>)}</span>
    {why && <span className={s.why} lang={loc} data-why={why.source}><span className={s.lineLabel}>{t.why}</span> {why.text}</span>}
    {rows.length > 0 && <span className={s.line}><span className={s.lineLabel}>{t.earnings}</span>{rows.map(r => <span className={s.row} key={`${r.ticker}|${r.date}`}><b>{r.ticker}</b> ±{r.expectedPct.toFixed(1)}% → <b className={r.actualPct < 0 ? s.bad : s.ok}>{signedPct(r.actualPct)}</b></span>)}</span>}
  </button></section>;
}
