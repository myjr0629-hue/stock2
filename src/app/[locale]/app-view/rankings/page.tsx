'use client';

// ============================================================================
// 랭킹 — 「오늘의 발견 › 랭킹 11종」 과 빠른 진입(다크풀·이상 옵션)의 목적지
//
// ★ 시안(9차 랭킹)을 그대로 옮기고 데이터만 꽂았다. CSS 는 rankings.module.css(시안 원본).
//
// ★ 입구 3개가 여기 하나로 모인다. 랭킹 11종의 구성이 그렇다 —
//   장중 5종(평소 대비 이탈·다축·맥스페인·감마플립·돈과 포지션) = 「이상 옵션 플로우」
//   장 마감 후 3종(장외 물량·장외 공매도·은밀 축적)          = 「다크풀 흐름」
//   그래서 별도 페이지 2장을 만들지 않는다.
//
// ★ /api/ranking?run=all 한 콜. 콜드 7.1s / 웜 0.56s 이므로 last-good 을 먼저 그리고
//   갱신되면 갈아끼운다(빈 화면으로 기다리게 하지 않는다).
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import s from './rankings.module.css';

type Phase = 'intraday' | 'postclose' | 'anytime';
type Tab = 'all' | Phase;

interface RankItem { ticker?: string; company?: string; [k: string]: unknown }
interface RankBlock {
  available?: boolean;
  phase?: Phase;
  name?: { ko?: string; en?: string; ja?: string };
  candidates?: number;
  skipped?: Record<string, number> | number;
  items?: RankItem[];
}

const T = {
  ko: { title: '랭킹', back: '오늘의 발견', all: '전체', intraday: '장중', postclose: '장 마감 후',
        anytime: '상시', cand: '후보', skip: '제외', more: '전체 보기',
        why: '절대 크기로 줄 세우면 매일 같은 대형주만 나옵니다. 각 종목을 «자기 평소»와 견줍니다.',
        soon: '자료가 더 쌓이면 켜집니다', noTicker: '비상장 · 티커 없음',
        sub: (u: number) => `11종 · 유니버스 ${u.toLocaleString()}`, loading: '불러오는 중' },
  en: { title: 'Rankings', back: "Today's Find", all: 'All', intraday: 'Intraday', postclose: 'After close',
        anytime: 'Anytime', cand: 'candidates', skip: 'skipped', more: 'View all',
        why: 'Ranking by absolute size returns the same megacaps every day. Each name is measured against its own normal.',
        soon: 'Turns on once enough data accumulates', noTicker: 'Unlisted · no ticker',
        sub: (u: number) => `11 lists · universe ${u.toLocaleString()}`, loading: 'Loading' },
  ja: { title: 'ランキング', back: '今日の発見', all: 'すべて', intraday: 'ザラ場', postclose: '引け後',
        anytime: '常時', cand: '候補', skip: '除外', more: 'すべて見る',
        why: '絶対規模で並べると毎日同じ大型株になります。各銘柄を«自身の平常»と比べます。',
        soon: 'データが溜まると有効になります', noTicker: '非上場 · ティッカーなし',
        sub: (u: number) => `11種 · ユニバース ${u.toLocaleString()}`, loading: '読み込み中' },
} as const;

const PHASE_C: Record<Phase, string> = { intraday: '#22d3ee', postclose: '#a78bfa', anytime: '#fbbf24' };

/* 랭킹마다 보여줄 값·보조설명이 다르다. 없는 필드는 «빼고» 지어내지 않는다. */
function readRow(id: string, it: Record<string, any>, locale: string) {
  const L = (o: any) => (o && (o[locale] ?? o.ko ?? o.en)) || '';
  const n = (v: any, d = 2) => (Number.isFinite(v) ? Number(v).toFixed(d) : null);
  switch (id) {
    case 'deviation':
      return { v: n(it.ratio) ? `${n(it.ratio)}×` : '—',
               sub: [L(it.label), it.today != null && it.baseline != null
                 ? `${Number(it.today).toLocaleString()} vs ${Math.round(it.baseline).toLocaleString()}` : null]
                 .filter(Boolean).join(' · ') };
    case 'multi-axis': {
      const ax = Array.isArray(it.axes) ? it.axes.slice(0, 2) : [];
      return { v: `${it.axisCount ?? ax.length}${locale === 'ko' ? '축' : locale === 'ja' ? '軸' : ' axes'}`,
               sub: ax.map((a: any) => `${L(a.label)} ${n(a.ratio)}×`).join(' · ') };
    }
    case 'maxpain-gap':
    case 'gamma-flip':
      return { v: Number.isFinite(it.gapPct) ? `${it.gapPct > 0 ? '+' : ''}${Number(it.gapPct).toFixed(1)}%` : '—',
               sub: it.price != null && it.level != null
                 ? `$${Number(it.price).toLocaleString(undefined, { maximumFractionDigits: 2 })} → $${Number(it.level).toLocaleString()}` : L(it.label) };
    case 'money-vs-oi':
      return { v: n(it.dollarRatio) ? `${n(it.dollarRatio)}×` : '—',
               sub: [n(it.oiRatio) ? `OI ${n(it.oiRatio)}×` : null, it.date].filter(Boolean).join(' · ') };
    case 'darkpool-volume':
      return { v: n(it.ratio) ? `${n(it.ratio)}×` : '—',
               sub: it.today != null && it.baseline != null
                 ? `${Number(it.today).toLocaleString()} vs ${Math.round(it.baseline).toLocaleString()}` : L(it.label) };
    case 'darkpool-short':
      return { v: Number.isFinite(it.today) ? `${Number(it.today).toFixed(1)}%` : '—',
               sub: [Number.isFinite(it.baseline)
                 ? `${locale === 'ko' ? '평소' : locale === 'ja' ? '平常' : 'usual'} ${Number(it.baseline).toFixed(1)}%` : null,
                 it.date].filter(Boolean).join(' · ') };
    case 'stealth':
      return { v: it.stealth != null ? String(it.stealth) : '—',
               sub: [it.marketStealth != null
                 ? `${locale === 'ko' ? '시장' : locale === 'ja' ? '市場' : 'market'} ${it.marketStealth}` : null,
                 it.regime].filter(Boolean).join(' · ') };
    case 'insider-conviction': {
      const b = Array.isArray(it.buyers) && it.buyers[0] ? it.buyers[0] : null;
      return { v: Number.isFinite(it.usd) ? `$${(Number(it.usd) / 1e6).toFixed(1)}M` : '—',
               sub: [it.company, b?.role].filter(Boolean).join(' · ') };
    }
    case 'deep-value-fcf':
      return { v: Number.isFinite(it.fcfYield) ? `${Number(it.fcfYield).toFixed(1)}%` : '—',
               sub: Number.isFinite(it.evToEbitda) ? `EV/EBITDA ${Number(it.evToEbitda).toFixed(1)}` : L(it.label) };
    default:
      return { v: '—', sub: L(it.label) };
  }
}

export default function RankingsPage() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();
  const locale = (params?.locale as string) || 'ko';
  const t = T[(locale as 'ko' | 'en' | 'ja')] ?? T.en;

  const initial = (search.get('tab') as Tab) || 'all';
  const [tab, setTab] = useState<Tab>(
    ['all', 'intraday', 'postclose', 'anytime'].includes(initial) ? initial : 'all',
  );
  const [res, setRes] = useState<Record<string, RankBlock> | null>(null);
  const [meta, setMeta] = useState<{ universe: number | null; date: string | null; phase: string | null }>(
    { universe: null, date: null, phase: null },
  );
  const [err, setErr] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await fetch('/api/ranking?run=all&limit=5', { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (dead) return;
        if (j?.results && typeof j.results === 'object') {
          setRes(j.results);
          setMeta({
            universe: Number.isFinite(j.universe) ? j.universe : null,
            date: j?.darkPool?.date ?? null,
            phase: j?.session?.phase ?? null,
          });
        } else { setErr(true); }
      } catch { if (!dead) setErr(true); }
    })();
    return () => { dead = true; };
  }, []);

  const blocks = useMemo(() => {
    if (!res) return [];
    return Object.entries(res).map(([id, b]) => ({ id, ...b }));
  }, [res]);
  const list = blocks.filter((b) => tab === 'all' || b.phase === tab);
  const countOf = (p: Phase) => blocks.filter((b) => b.phase === p).length;
  const skipTotal = (sk: RankBlock['skipped']) =>
    typeof sk === 'number' ? sk : sk ? Object.values(sk).reduce((a, c) => a + c, 0) : 0;
  const noTicker = (tk?: string) => !tk || tk === 'N/A';

  return (
    <div className={s.rkWrap}>
      <div className={s.rkNav}>
        <button type="button" className={s.rkBack} aria-label="Back" onClick={() => router.back()}>
          <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span className={s.rkEy}>{t.back.toUpperCase()}</span>
      </div>
      <div className={s.rkHead}>
        <div className={s.rkTitle}>{t.title}</div>
        <div className={s.rkSub}>
          {res ? [meta.universe != null ? t.sub(meta.universe) : null, meta.phase, meta.date]
            .filter(Boolean).join(' · ') : t.loading}
        </div>
      </div>
      <div className={s.rkWhy}>{t.why}</div>

      <div className={s.rkTabs}>
        {(['all', 'intraday', 'postclose', 'anytime'] as const).map((k) => (
          <button key={k} type="button"
                  className={`${s.rkT} ${tab === k ? s.on : ''}`}
                  aria-pressed={tab === k}
                  onClick={() => setTab(k)}>
            {t[k]}{k !== 'all' && blocks.length > 0 ? ` ${countOf(k)}` : ''}
          </button>
        ))}
      </div>

      {/* 못 받았으면 빈 껍데기 대신 «왜 비었는지» 를 적는다 */}
      {err && <div className={s.rkC}><div className={s.rkSoon}><span><b>—</b></span></div></div>}
      {!res && !err && [0, 1, 2].map((i) => <div key={i} className={`${s.rkSkel} ${s.rkSkelCard}`} />)}

      {list.map((b) => {
        const c = PHASE_C[(b.phase as Phase)] || '#7f97ba';
        const items = b.items || [];
        return (
          <div key={b.id} className={s.rkC} style={{ ['--c' as string]: c }}>
            <div className={s.rkCTop}>
              <span className={s.rkDot} />
              <span className={s.rkCN}>{b.name?.[locale as 'ko'] || b.name?.ko || b.id}</span>
              {b.phase && <span className={s.rkCP}>{t[b.phase]}</span>}
            </div>

            {b.available && items.length > 0 ? (
              <>
                <div className={s.rkRows}>
                  {items.map((raw, i) => {
                    const it = raw as Record<string, any>;
                    const row = readRow(b.id, it, locale);
                    const nt = noTicker(it.ticker);
                    const name = nt ? (it.company || '—') : it.ticker;
                    return (
                      <a key={`${b.id}-${it.ticker ?? i}`}
                         className={`${s.rkR} ${nt ? s.nt : ''}`}
                         role="button" tabIndex={0}
                         onClick={() => { if (!nt) router.push(`/app-view/cmd?t=${it.ticker}`); }}
                         onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !nt) { e.preventDefault(); router.push(`/app-view/cmd?t=${it.ticker}`); } }}>
                        <span className={`${s.rkRk} num`}>{i + 1}</span>
                        {/* SEC Form 4 에는 비상장 발행사가 섞여 온다(ticker:"N/A").
                            «N/» 두 글자 칩을 그리면 고장으로 보이므로 회사명 + 건물 아이콘으로 둔다. */}
                        {nt ? (
                          <span className={s.rkNT}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                                 strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 20.5V7.5l7-3.5v16.5M11 20.5h9V11l-9-3.5" />
                              <path d="M14.5 14h2M14.5 17h2M6.6 11h1.8M6.6 14h1.8M6.6 17h1.8" />
                            </svg>
                          </span>
                        ) : (
                          <AppTickerLogo symbol={String(it.ticker)} size={18} />
                        )}
                        <span className={s.rkL}>
                          <b className={nt ? s.ntN : ''}>{name}</b>
                          <small>{nt ? (row.sub || t.noTicker) : row.sub}</small>
                        </span>
                        <span className={`${s.rkV} num`}>{row.v}</span>
                      </a>
                    );
                  })}
                </div>
                <div className={s.rkFoot}>
                  {b.candidates != null && <span className="num">{t.cand} {b.candidates}</span>}
                  {skipTotal(b.skipped) > 0 && <span className="num">{t.skip} {skipTotal(b.skipped).toLocaleString()}</span>}
                </div>
              </>
            ) : (
              /* 준비 중인 랭킹은 «비어 있음» 이 아니라 «왜 비었는지» 를 적는다 */
              <div className={s.rkSoon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                     strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                </svg>
                <span>
                  <b>{t.soon}</b>
                  {b.skipped && typeof b.skipped === 'object' && (
                    <small>{Object.entries(b.skipped).map(([k, v]) => `${k} ${v}`).join(' · ')}</small>
                  )}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
