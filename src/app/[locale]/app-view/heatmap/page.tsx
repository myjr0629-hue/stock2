'use client';

// ============================================================================
// 히트맵 — 섹터 「히트맵 ›」 의 목적지
//
// ★ 시안(9차 히트맵)을 그대로 옮기고 데이터만 꽂았다. 마크업·CSS 는 heatmap.module.css
//   (시안 <style> 원본). 손으로 다시 설계하지 않는다.
//
// ★ ECharts 를 쓰지 않는다. 실측: 그 청크 하나가 1,092KB — /ko/intel 전체 JS 2,090KB 의
//   52% 이고 모바일 폭에서도 내려온다. 그런데 웹 모바일 히트맵은 canvas 0 · DOM 260노드로
//   같은 걸 그린다. app-view 에는 ECharts 가 0건이고 이 상태를 유지한다.
//
// ★ 데이터는 앱 인텔이 이미 쓰는 useIntelSharedDataForApp — 신규 왕복 0.
// ★ 안전영역/탭 신뢰성은 app-view/layout.tsx 가 처리한다. 여기서 env() 를 다시 쓰지 않는다.
// ============================================================================

import { useState, useMemo, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useIntelSharedDataForApp, type IntelQuote } from '@/hooks/useIntelSharedData';
import s from './heatmap.module.css';

/* 인텔 10섹터 — 키·색은 app-view/intel/page.tsx 정본과 같다.
   아이콘 경로는 components/intel/mobile/SectorIcon.tsx 정본을 그대로 옮겼다
   (같은 섹터가 인텔과 히트맵에서 다른 모양이면 안 된다). */
const SECTORS = [
  { key: 'siliconCore',   color: '#10b981', ko: '반도체',       en: 'Semis',           ja: '半導体' },
  { key: 'powerMatrix',   color: '#f59e0b', ko: '전력·에너지',  en: 'Power & Energy',  ja: '電力・エネルギー' },
  { key: 'physicalAI',    color: '#ef4444', ko: '로봇·AI',      en: 'Robotics & AI',   ja: 'ロボット・AI' },
  { key: 'bioPulse',      color: '#ec4899', ko: '바이오',       en: 'Biotech',         ja: 'バイオ' },
  { key: 'orbitDefense',  color: '#3b82f6', ko: '방산·우주',    en: 'Space & Defense', ja: '防衛・宇宙' },
  { key: 'cyberShield',   color: '#8b5cf6', ko: '사이버보안',   en: 'Cybersecurity',   ja: 'サイバー' },
  { key: 'm7',            color: '#22d3ee', ko: 'M7 테크',      en: 'M7 Tech',         ja: 'M7テック' },
  { key: 'fintechPulse',  color: '#f43f5e', ko: '핀테크',       en: 'Fintech',         ja: 'フィンテック' },
  { key: 'cloudFortress', color: '#6366f1', ko: '클라우드',     en: 'Cloud',           ja: 'クラウド' },
  { key: 'quantumEdge',   color: '#14b8a6', ko: '퀀텀·AI',      en: 'Quantum & AI',    ja: '量子・AI' },
] as const;

const SEC_ICON: Record<string, string> = {
  m7:            '<path d="M13 2L4.5 14H12L11 22L19.5 10H12L13 2Z" fill="CC" fill-opacity=".2" stroke="CC" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  physicalAI:    '<rect x="6" y="6" width="12" height="12" rx="2" fill="CC" fill-opacity=".15" stroke="CC" stroke-width="1.5"/><rect x="9" y="9" width="6" height="6" rx="1" fill="CC" fill-opacity=".3"/><g stroke="CC" stroke-width="1.5" stroke-linecap="round"><path d="M9 4v2M12 4v2M15 4v2M9 18v2M12 18v2M15 18v2M4 9h2M4 12h2M4 15h2M18 9h2M18 12h2M18 15h2"/></g>',
  siliconCore:   '<path d="M6 3H18L21 9L12 21L3 9L6 3Z" fill="CC" fill-opacity=".15" stroke="CC" stroke-width="1.5" stroke-linejoin="round"/><path d="M3 9H21" stroke="CC" stroke-width="1.2" stroke-linecap="round"/><path d="M12 21L9 9L12 3L15 9L12 21Z" fill="CC" fill-opacity=".2"/>',
  powerMatrix:   '<rect x="6" y="4" width="12" height="16" rx="2" fill="CC" fill-opacity=".12" stroke="CC" stroke-width="1.5"/><rect x="10" y="2" width="4" height="2" rx=".5" fill="CC"/><rect x="8.5" y="8" width="7" height="3" rx=".5" fill="CC" fill-opacity=".4"/><rect x="8.5" y="12.5" width="7" height="3" rx=".5" fill="CC" fill-opacity=".25"/>',
  bioPulse:      '<path d="M7 4C7 4 7 8 12 12C17 16 17 20 17 20" stroke="CC" stroke-width="1.5" stroke-linecap="round"/><path d="M17 4C17 4 17 8 12 12C7 16 7 20 7 20" stroke="CC" stroke-width="1.5" stroke-linecap="round"/><g stroke="CC" stroke-width="1.2" stroke-linecap="round" stroke-opacity=".5"><path d="M8 7h8M9 10h6M9 14h6M8 17h8"/></g>',
  cyberShield:   '<path d="M12 3L4 7V12C4 16.4 7.4 20.5 12 21.5C16.6 20.5 20 16.4 20 12V7L12 3Z" fill="CC" fill-opacity=".12" stroke="CC" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 12L11 14L15 10" stroke="CC" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  orbitDefense:  '<circle cx="12" cy="12" r="3" fill="CC" fill-opacity=".3" stroke="CC" stroke-width="1.5"/><ellipse cx="12" cy="12" rx="9" ry="4" stroke="CC" stroke-width="1.2" stroke-opacity=".4" transform="rotate(-30 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4" stroke="CC" stroke-width="1.2" stroke-opacity=".4" transform="rotate(30 12 12)"/>',
  quantumEdge:   '<circle cx="12" cy="12" r="2.5" fill="CC" fill-opacity=".5"/><ellipse cx="12" cy="12" rx="10" ry="4" stroke="CC" stroke-width="1.3" stroke-opacity=".6"/><ellipse cx="12" cy="12" rx="10" ry="4" stroke="CC" stroke-width="1.3" stroke-opacity=".6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" stroke="CC" stroke-width="1.3" stroke-opacity=".6" transform="rotate(120 12 12)"/>',
  fintechPulse:  '<rect x="3" y="5" width="18" height="14" rx="2" fill="CC" fill-opacity=".1" stroke="CC" stroke-width="1.5"/><path d="M7 15L10 11L13 13L17 9" stroke="CC" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="17" cy="9" r="1.5" fill="CC" fill-opacity=".4"/>',
  cloudFortress: '<path d="M6 19C3.8 19 2 17.2 2 15C2 13.1 3.3 11.5 5.1 11.1C5 10.7 5 10.4 5 10C5 7.2 7.2 5 10 5C12.1 5 13.9 6.3 14.6 8.1C15 8 15.5 8 16 8C18.8 8 21 10.2 21 13C21 15.8 18.8 18 16 18" fill="CC" fill-opacity=".12" stroke="CC" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 19V15M12 19V13M15 19V16" stroke="CC" stroke-width="1.5" stroke-linecap="round"/>',
};

/* 프로덕션 SectorHeatmap.tsx 의 getHeatColor 15단계 — 웹과 같은 색을 쓴다 */
function heatColor(p: number): string {
  if (p >= 4) return '#2d8b57';   if (p >= 3) return '#2a7d4f';
  if (p >= 2) return '#276e46';   if (p >= 1.5) return '#245f3d';
  if (p >= 1) return '#1e5233';   if (p >= 0.5) return '#1a4129';
  if (p > 0) return '#183520';    if (p === 0) return '#1e2430';
  if (p > -0.5) return '#351a1a'; if (p > -1) return '#4d1919';
  if (p > -1.5) return '#621919'; if (p > -2) return '#7d1a1a';
  if (p > -3) return '#961c1c';   if (p > -4) return '#ab2020';
  return '#c02424';
}
/* 글자색은 9차의 초록/빨강 톤. 열 색을 글자에 쓰면 보합(#1e2430)이 배경에 묻힌다. */
const heatInk = (p: number) =>
  p >= 2 ? '#34d399' : p > 0.4 ? '#6ee7b7' : p > -0.4 ? '#94a3b8' : p > -2 ? '#fca5a5' : '#f87171';

const T = {
  ko: { title: '히트맵', back: 'SECTOR MAP', scale: '약세', scaleUp: '강세',
        pick: '섹터를 누르면 종목이 바뀝니다', lead: '주도', lag: '부진',
        sub: (s: number, n: number) => `${s} 섹터 · ${n} 종목`,
        xTitle: '오늘의 양 끝', xOf: (n: number) => `${n}종목 전체`,
        xMid: (n: number) => `중간 ${n}종목 생략`, loading: '불러오는 중' },
  en: { title: 'Heatmap', back: 'SECTOR MAP', scale: 'Weak', scaleUp: 'Strong',
        pick: 'Tap a sector to swap the names below', lead: 'Leader', lag: 'Laggard',
        sub: (s: number, n: number) => `${s} sectors · ${n} names`,
        xTitle: 'Both ends of today', xOf: (n: number) => `ALL ${n} NAMES`,
        xMid: (n: number) => `${n} IN THE MIDDLE OMITTED`, loading: 'Loading' },
  ja: { title: 'ヒートマップ', back: 'SECTOR MAP', scale: '弱', scaleUp: '強',
        pick: 'セクターを押すと下の銘柄が変わります', lead: '主導', lag: '不振',
        sub: (s: number, n: number) => `${s}セクター · ${n}銘柄`,
        xTitle: '今日の両端', xOf: (n: number) => `全${n}銘柄`,
        xMid: (n: number) => `中間の${n}銘柄は省略`, loading: '読み込み中' },
} as const;

export default function HeatmapPage() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || 'ko';
  const t = T[(locale as 'ko' | 'en' | 'ja')] ?? T.en;
  const data = useIntelSharedDataForApp();
  const [sel, setSel] = useState<string | null>(null);

  const fp1 = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + '%';
  const fp2 = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + '%';
  const label = (d: (typeof SECTORS)[number]) =>
    locale === 'ko' ? d.ko : locale === 'ja' ? d.ja : d.en;

  /* 섹터별 평균과 구성종목. ★ 값이 없는 종목은 빼고, 종목이 하나도 없으면 섹터를 뺀다.
     0 으로 채우면 «측정된 0» 처럼 보인다. */
  const bands = useMemo(() => {
    return SECTORS.map((def) => {
      const raw = ((data as unknown as Record<string, IntelQuote[]>)[def.key] || []);
      const rows = raw
        .filter((q) => Number.isFinite(q?.changePct) && (q?.price ?? 0) > 0)
        .map((q) => ({ t: q.ticker, p: q.changePct }))
        .sort((a, b) => b.p - a.p);
      if (!rows.length) return null;
      const avg = rows.reduce((s2, r) => s2 + r.p, 0) / rows.length;
      return { ...def, rows, avg, up: rows.filter((r) => r.p > 0).length, dn: rows.filter((r) => r.p < 0).length };
    }).filter(Boolean) as Array<(typeof SECTORS)[number] & {
      rows: { t: string; p: number }[]; avg: number; up: number; dn: number;
    }>;
  }, [data]);

  const sorted = useMemo(() => [...bands].sort((a, b) => b.avg - a.avg), [bands]);
  const cur = bands.find((b) => b.key === sel) ?? sorted[0] ?? null;
  const flat = useMemo(
    () => bands.flatMap((b) => b.rows.map((r) => ({ ...r, sec: b.key }))).sort((a, b) => b.p - a.p),
    [bands],
  );
  const total = flat.length;
  const xTop = flat.slice(0, 4);
  const xBot = flat.slice(-4);
  const xMax = flat.length ? Math.max(...flat.map((r) => Math.abs(r.p))) : 1;
  const secOf = (k: string) => SECTORS.find((x) => x.key === k)!;

  const icon = (k: string, size: number) => (
    <svg viewBox="0 0 24 24" width={size} height={size}
         dangerouslySetInnerHTML={{ __html: (SEC_ICON[k] || '').replace(/CC/g, secOf(k).color) }} />
  );

  /* ★ 섹터는 «스태거드»로 하나씩 들어온다(useIntelSharedDataForApp: fullData:'staggered').
     bands.length>0 만 보고 열면 «3 섹터 · 21 종목» 같은 «도중의 숫자»가 화면에 찍힌다.
     그래서 10개가 다 올 때까지는 숫자를 «안 쓰고» 빈 칸은 스켈레톤으로 채운다.
     한 섹터가 끝내 안 오는 경우까지 기다리진 않는다 — 12초면 있는 것만 보여준다. */
  const full = bands.length >= SECTORS.length;
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (full) { setSettled(true); return; }
    const id = setTimeout(() => setSettled(true), 12000);
    return () => clearTimeout(id);
  }, [full]);
  const ready = full || settled;
  const loading = bands.length === 0;

  return (
    <div className={s.hmWrap}>
      <div className={s.hmNav}>
        <button type="button" className={s.hmBack} aria-label="Back" onClick={() => router.back()}>
          <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span className={s.hmEy}>{t.back}</span>
      </div>
      <div className={s.hmHead}>
        <div className={s.hmTitle}>{t.title}</div>
        <div className={s.hmSub}>{ready ? t.sub(bands.length, total) : t.loading}</div>
      </div>

      <div className={s.hmScale}>
        <span className={s.hmScaleL}>{t.scale}</span>
        <span className={s.hmScaleBar}>
          {[-4, -3, -2, -1.5, -1, -0.5, -0.2, 0, 0.2, 0.5, 1, 1.5, 2, 3, 4].map((v, i) => (
            <i key={i} style={{ background: heatColor(v) }} />
          ))}
        </span>
        <span className={s.hmScaleL}>{t.scaleUp}</span>
      </div>

      <div className={s.hmGrid}>
        {loading
          ? [0, 1, 2, 3, 4, 5].map((i) => <div key={i} className={`${s.hmSkel} ${s.hmSkelBand}`} />)
          : sorted.map((b) => (
              <button
                key={b.key}
                type="button"
                className={`${s.hmB} ${cur?.key === b.key ? s.on : ''}`}
                style={{ ['--bg' as string]: heatColor(b.avg), ['--ink' as string]: heatInk(b.avg) }}
                onClick={() => setSel(b.key)}
              >
                <span className={s.hmBTop}>
                  <span className={s.hmBI}>{icon(b.key, 17)}</span>
                  <span className={s.hmBN}>{label(b)}</span>
                  <span className={`${s.hmBV} num`}>{fp2(b.avg)}</span>
                </span>
                <span className={s.hmBBot}>
                  <span className={s.hmSeg}>
                    {b.rows.map((r) => <i key={r.t} style={{ background: heatColor(r.p) }} />)}
                  </span>
                  <span className={`${s.hmBC} num`}>{b.up}<s>▲</s> {b.dn}<s>▼</s></span>
                </span>
              </button>
            ))}
        {!loading && !ready &&
          Array.from({ length: SECTORS.length - bands.length }).map((_, i) => (
            <div key={`hmskel-${i}`} className={`${s.hmSkel} ${s.hmSkelBand}`} />
          ))}
      </div>
      {!loading && <div className={s.hmPick}>{t.pick}</div>}

      {cur && (
        <div className={s.hmSel}>
          <div className={s.hmSelTop}>
            <span className={`${s.hmBI} ${s.hmSelI}`}>{icon(cur.key, 19)}</span>
            <span className={s.hmSelN}>{label(cur)}</span>
            <span className={`${s.hmSelV} num ${cur.avg >= 0 ? s.gr : s.rd}`}>{fp2(cur.avg)}</span>
          </div>
          <div className={s.hmStrip}>
            {cur.rows.map((r) => {
              const mx = Math.max(...cur.rows.map((x) => Math.abs(x.p)), 1);
              const grow = 0.62 + 0.38 * (Math.abs(r.p) / mx);
              const c = heatColor(r.p);
              return (
                <span
                  key={r.t}
                  className={s.hmC}
                  style={{
                    flexGrow: Number(grow.toFixed(3)),
                    background: `linear-gradient(168deg, color-mix(in srgb, ${c} 30%, #131d30), color-mix(in srgb, ${c} 16%, #0d1524))`,
                    ['--rail' as string]: c,
                    ['--ink' as string]: heatInk(r.p),
                  }}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/app-view/cmd?t=${r.t}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/app-view/cmd?t=${r.t}`); } }}
                >
                  <b>{r.t}</b><em className="num">{fp1(r.p)}</em>
                </span>
              );
            })}
          </div>
          <div className={s.hmSelFoot}>
            <span>{t.lead} <b>{cur.rows[0].t}</b> <b className={cur.rows[0].p >= 0 ? s.gr : s.rd}>{fp1(cur.rows[0].p)}</b></span>
            <span>{t.lag} <b>{cur.rows[cur.rows.length - 1].t}</b> <b className={cur.rows[cur.rows.length - 1].p >= 0 ? s.gr : s.rd}>{fp1(cur.rows[cur.rows.length - 1].p)}</b></span>
          </div>
        </div>
      )}

      {ready && total > 8 && (
        <>
          <div className={s.hmXHead}>
            <span className={s.hmXT}>{t.xTitle}</span>
            <span className={s.hmXN}>{t.xOf(total)}</span>
          </div>
          <div className={s.hmX}>
            <div className={s.hmXCol}>{xTop.map((r, i) => xrow(r, i + 1))}</div>
            <div className={s.hmXSplit}><s /><b>{t.xMid(total - 8)}</b><s /></div>
            <div className={s.hmXCol}>{xBot.map((r, i) => xrow(r, total - xBot.length + i + 1))}</div>
          </div>
        </>
      )}
    </div>
  );

  function xrow(r: { t: string; p: number; sec: string }, rank: number) {
    return (
      <a
        key={`${r.sec}-${r.t}`}
        className={s.hmXR}
        role="button"
        tabIndex={0}
        onClick={() => router.push(`/app-view/cmd?t=${r.t}`)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/app-view/cmd?t=${r.t}`); } }}
      >
        <span className={`${s.hmXRk} num`}>{rank}</span>
        <b className={s.hmXT2}>{r.t}</b>
        <span className={s.hmXS}><i className={s.hmXI}>{icon(r.sec, 12)}</i>{label(secOf(r.sec))}</span>
        <span className={s.hmXBar}>
          <i style={{
            width: `${(Math.abs(r.p) / xMax * 100).toFixed(1)}%`,
            [(r.p >= 0 ? 'left' : 'right') as string]: 0,
            background: heatColor(r.p),
          }} />
        </span>
        <span className={`${s.hmXP} num ${r.p >= 0 ? s.gr : s.rd}`}>{fp1(r.p)}</span>
      </a>
    );
  }
}
