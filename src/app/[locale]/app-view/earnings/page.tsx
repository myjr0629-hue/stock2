'use client';

// ============================================================================
// 실적 캘린더 — 빠른 진입의 목적지. 앱에도 웹에도 없던 화면이다.
//
// ★ 시안(9차 실적 캘린더)을 그대로 옮기고 데이터만 꽂았다. CSS 는 earnings.module.css.
// ★ 원천은 /api/market/earnings-calendar (FMP 시장 전체 1콜, 유니버스 합집합).
// ★ 값이 없으면 «빈 채로» 둔다 — 인텔의 지어낸 실적일을 이번에 걷어냈다.
//   발표 시각(amc/bmo)이 비면 «시간 미정» 으로 두고 추정하지 않는다.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import s from './earnings.module.css';

interface Row {
  ticker: string; date: string; hour: string;
  epsEstimate: number | null; revenueEstimate: number | null;
  quarter: number | null; year: number | null;
}

const T = {
  ko: { title: '실적 캘린더', back: '빠른 진입', amc: '장 마감 후', bmo: '장 시작 전', tbd: '시간 미정',
        eps: 'EPS 추정', rev: '매출 추정', names: '종목', days: '일', heavy: '가장 몰린 날',
        note: '발표일·추정치는 발표 전까지 바뀔 수 있습니다. 확정 전 값은 채우지 않습니다.',
        src: '출처 FMP 실적 캘린더 (시장 전체 1콜)', empty: '예정된 발표가 없습니다.',
        loading: '불러오는 중', wk: ['일','월','화','수','목','금','토'], mon: (m: number) => `${m}월` },
  en: { title: 'Earnings Calendar', back: 'Quick Access', amc: 'After close', bmo: 'Before open', tbd: 'Time TBD',
        eps: 'EPS est.', rev: 'Revenue est.', names: 'names', days: 'days', heavy: 'Busiest day',
        note: 'Dates and estimates can change before the report. Nothing is filled in before it is confirmed.',
        src: 'Source: FMP earnings calendar (whole market, one call)', empty: 'No scheduled reports.',
        loading: 'Loading', wk: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
        mon: (m: number) => ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m] },
  ja: { title: '決算カレンダー', back: 'クイックアクセス', amc: '引け後', bmo: '寄り前', tbd: '時間未定',
        eps: 'EPS予想', rev: '売上予想', names: '銘柄', days: '日', heavy: '最も集中する日',
        note: '発表日・予想は発表まで変わることがあります。確定前の値は埋めません。',
        src: '出典 FMP 決算カレンダー(市場全体を1コール)', empty: '予定されている発表はありません。',
        loading: '読み込み中', wk: ['日','月','火','水','木','金','土'], mon: (m: number) => `${m}月` },
} as const;

export default function EarningsPage() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || 'ko';
  const t = T[(locale as 'ko' | 'en' | 'ja')] ?? T.en;

  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await fetch('/api/market/earnings-calendar');
        const j = await r.json();
        if (!dead) setRows(Array.isArray(j?.rows) ? j.rows : []);
      } catch { if (!dead) setRows([]); }
    })();
    return () => { dead = true; };
  }, []);

  const byDate = useMemo(() => {
    if (!rows) return [];
    const m = new Map<string, Row[]>();
    for (const r of rows) { const a = m.get(r.date) || []; a.push(r); m.set(r.date, a); }
    return [...m.entries()].map(([date, list]) => ({ date, rows: list }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  const months = useMemo(() => [...new Set(byDate.map((g) => g.date.slice(0, 7)))], [byDate]);
  const monthCount = (m: string) =>
    byDate.filter((g) => g.date.startsWith(m)).reduce((n, g) => n + g.rows.length, 0);
  const heaviest = byDate.reduce<{ date: string; rows: Row[] } | null>(
    (a, b) => (!a || b.rows.length > a.rows.length ? b : a), null);
  const mLabel = (m: string) => t.mon(Number(m.slice(5, 7)));
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const fmtRev = (v: number | null) =>
    v == null ? '—' : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`;
  const fmtEps = (v: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`);

  return (
    <div className={s.ecWrap}>
      <div className={s.ecNav}>
        <button type="button" className={s.ecBack} aria-label="Back" onClick={() => router.back()}>
          <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span className={s.ecEy}>{t.back.toUpperCase()}</span>
      </div>
      <div className={s.ecHead}>
        <div className={s.ecTitle}>{t.title}</div>
        <div className={s.ecSub}>
          {rows == null ? t.loading
            : rows.length === 0 ? t.empty
            : `${rows.length}${t.names} · ${byDate.length}${t.days}`}
        </div>
      </div>

      {rows == null && [0, 1, 2].map((i) => <div key={i} className={`${s.ecSkel} ${s.ecSkelCard}`} />)}

      {/* 월별 밀도 — 21일치를 늘어놓으면 «언제가 바쁜지» 가 안 읽힌다 */}
      {rows != null && rows.length > 0 && (
        <div className={s.ecBars}>
          {months.map((m) => (
            <span key={m} className={s.ecBar2}>
              <span className={s.ecBar2L}>{mLabel(m)}</span>
              <span className={s.ecBar2T}>
                <i style={{ width: `${(monthCount(m) / rows.length * 100).toFixed(1)}%` }} />
              </span>
              <span className={`${s.ecBar2N} num`}>{monthCount(m)}</span>
            </span>
          ))}
          {heaviest && (
            <span className={s.ecHeavy}>
              {t.heavy}{' '}
              <b className="num">{Number(heaviest.date.slice(5, 7))}/{Number(heaviest.date.slice(8, 10))}</b>
              <em className="num">{heaviest.rows.length}</em>
            </span>
          )}
        </div>
      )}

      {rows != null && months.map((m) => (
        <div key={m}>
          <div className={s.ecMon}><s /><b>{mLabel(m)}</b><span className="num">{monthCount(m)}</span><s /></div>
          {byDate.filter((g) => g.date.startsWith(m)).map((g) => {
            const d = new Date(`${g.date}T00:00:00Z`);
            const days = Math.round((d.getTime() - today.getTime()) / 86400000);
            return (
              <div key={g.date} className={s.ecD}>
                <div className={s.ecDHead}>
                  <span className={s.ecDNum}>
                    <b className="num">{d.getUTCDate()}</b><s>{t.mon(d.getUTCMonth() + 1)}</s>
                  </span>
                  <span className={s.ecDWk}>{t.wk[d.getUTCDay()]}</span>
                  <span className={`${s.ecDLeft} num`}>D−{days}</span>
                  {g.rows.length > 1 && <span className={`${s.ecDN} num`}>{g.rows.length}</span>}
                </div>
                <div className={s.ecRows}>
                  {g.rows.map((e) => (
                    <a key={e.ticker} className={s.ecR} role="button" tabIndex={0}
                       onClick={() => router.push(`/app-view/cmd?t=${e.ticker}`)}
                       onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); router.push(`/app-view/cmd?t=${e.ticker}`); } }}>
                      <span className={s.ecRTop}>
                        <AppTickerLogo symbol={e.ticker} size={20} />
                        <b className={s.ecRT}>{e.ticker}</b>
                        <span className={`${s.ecRH} ${e.hour === 'amc' ? s.amc : e.hour === 'bmo' ? s.bmo : s.tbd}`}>
                          {e.hour === 'amc' ? t.amc : e.hour === 'bmo' ? t.bmo : t.tbd}
                        </span>
                        {e.quarter != null && e.year != null && (
                          <span className={`${s.ecRQ} num`}>Q{e.quarter} FY{e.year}</span>
                        )}
                      </span>
                      <span className={s.ecRMet}>
                        <span className={s.ecRM}><s>{t.eps}</s><b className="num">{fmtEps(e.epsEstimate)}</b></span>
                        <span className={s.ecRM}><s>{t.rev}</s><b className="num">{fmtRev(e.revenueEstimate)}</b></span>
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {rows != null && rows.length > 0 && (
        <>
          <div className={s.ecNote}><b>{t.note}</b></div>
          <div className={s.ecSrc}>{t.src}</div>
        </>
      )}
    </div>
  );
}
