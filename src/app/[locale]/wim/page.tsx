'use client';

// ============================================================================
// WIM — "Why'd It Move?"  (spin-off #3 web prototype)
// ----------------------------------------------------------------------------
// A 30-second daily habit: today's REAL movers become a cause-and-effect quiz.
// Beginner → institutional depth ladder, streak/XP lock-in, 3-language.
//
// IDENTITY (deliberately unlike SIGNUM's dark terminal and UC's cream
// editorial): bright violet playground — soft lavender paper, bouncy rounded
// cards, a detective mascot, confetti on correct answers.
//
// ADS (structure now, inert until WIM_ADS_LIVE): ① bottom banner slot,
// ② interstitial after finishing the daily set, ③ rewarded gate on the
// institutional deep layer. Flag off → zero ad code paths execute.
//
// COMPLIANCE (hard): observer tone, cause-only questions, NO direction
// arrows/colors on the mover card, streak counts learning DAYS. Educational
// disclaimer everywhere. No prediction mechanics.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { METRIC_GLOSSARY, type MetricTerm } from '@/components/app/metricGlossary';

// ── ads master switch (mirror of UC ADS_LIVE discipline) ──
const WIM_ADS_LIVE = false;

type Lang = 'ko' | 'en' | 'ja';
type Loc = { ko: string; en: string; ja: string };

interface Choice { id: string; categoryId: string; label: Loc }
interface Unit {
  id: string; dateET: string; ticker: string; companyName: string;
  moveMagnitude: number; prompt: Loc; choices: Choice[]; correctCategoryIds: string[];
  explanation: Loc; evidence?: { newsHeadline?: Loc };
  deepRead: Loc | null;
  money: { darkPoolPct: number | null; volumePcr: number | null; squeezeScore: number | null; maxPain: number | null; callWall?: number | null; putFloor?: number | null } | null;
  price?: number;
  spark?: { closes: number[]; vwap: number[] | null } | null;
  session?: string; // 'PRE' | 'REG' | 'POST' — which session carried the move (server-provided)
  difficultyLevel: 1 | 2 | 3; disclaimer: Loc;
}
interface Today { success: boolean; dateET: string; units: Unit[] }

// ── premium icon system: one consistent 1.8px-stroke glyph set (NO emojis) ──
const ICON_PATHS: Record<string, string> = {
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm5.2 12.2L21 21',
  gear: 'M12 8.5A3.5 3.5 0 1 1 12 15.5 3.5 3.5 0 0 1 12 8.5Zm8-.5-1.9-.6a6.7 6.7 0 0 0-.6-1.4l.9-1.8-1.6-1.6-1.8.9c-.4-.3-.9-.5-1.4-.6L13 1h-2l-.6 1.9c-.5.1-1 .3-1.4.6l-1.8-.9L5.6 4.2l.9 1.8c-.3.4-.5.9-.6 1.4L4 8v2l1.9.6c.1.5.3 1 .6 1.4l-.9 1.8 1.6 1.6 1.8-.9c.4.3.9.5 1.4.6L11 17h2l.6-1.9c.5-.1 1-.3 1.4-.6l1.8.9 1.6-1.6-.9-1.8c.3-.4.5-.9.6-1.4L20 10V8Z',
  folder: 'M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2.5h8.5A1.5 1.5 0 0 1 21 10v7.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-10Z',
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-15ZM9 3v18',
  badge: 'M12 3a4.2 4.2 0 1 1 0 8.4A4.2 4.2 0 0 1 12 3ZM4.5 21c.6-4 3.6-6 7.5-6s6.9 2 7.5 6',
  play: 'M8.5 5.5 18 12l-9.5 6.5v-13Z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chart: 'M4.5 20V11M10.5 20V5M16.5 20v-6M2.5 20h19',
  flame: 'M12 2.8c.9 3.4 4.8 4.7 4.8 9a4.8 4.8 0 1 1-9.6 0c0-1.9.9-3 1.9-4.6.5 1.6 1.7 2 2.7 1.4-.9-1.8-.8-3.9.2-5.8Z',
  shield: 'M12 2.5 19.5 5v6c0 4.8-3.2 8.6-7.5 10.5C7.7 19.6 4.5 15.8 4.5 11V5L12 2.5Z',
  arrowR: 'M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5',
  close: 'M6 6l12 12M18 6 6 18',
  clock: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17Zm0 4V12l3.5 2',
  doc: 'M6.5 2.5H14l4.5 4.5v13a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1.5-1.5ZM13.5 3v5h5M8.5 13h7M8.5 17h7',
  megaphone: 'M3.5 10.5v3.5l4.5.8L18 20V4L8 9.2l-4.5 1.3ZM18 9a3 3 0 0 1 0 6',
  wave: 'M2.5 12.5c2.4-4.4 4.7-4.4 7 0s4.7 4.4 7 0 3.6-3.6 5-1.5',
  target: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 4.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6Z',
  rotate: 'M20.5 12a8.5 8.5 0 1 1-2.6-6.1M21 3.5v5h-5',
  bank: 'M3.5 9.5 12 4l8.5 5.5M5.5 10v8M12 10v8M18.5 10v8M3.5 20.5h17',
  layers: 'M12 3.5 21 8.5 12 13.5 3 8.5 12 3.5ZM4.5 13 12 17l7.5-4',
  flow: 'M4.5 17.5a2 2 0 1 0 .01 0ZM11.5 12a2.6 2.6 0 1 0 .01 0ZM18.2 5.6a3.2 3.2 0 1 0 .01 0Z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9.5h-13V11Z',
  spark: 'M12 2.5 13.8 9l6.7 1.8-6.7 1.7L12 19.2l-1.8-6.7L3.5 10.8 10.2 9 12 2.5Z',
  crosshair: 'M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
  updown: 'M7.5 9.5 12 5l4.5 4.5M7.5 14.5 12 19l4.5-4.5',
};
function Ic({ name, size = 18, color = 'currentColor', sw = 1.8, fill = false }: { name: string; size?: number; color?: string; sw?: number; fill?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : 'none'} stroke={fill ? 'none' : color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, display: 'block' }}>
      <path d={ICON_PATHS[name] || ''} />
    </svg>
  );
}

// cause-category glyphs for the choice buttons (consistent stroke icons, not emojis)
const CAT_ICON: Record<string, string> = {
  own_earnings: 'megaphone', peer_sector_news: 'wave', analyst_action: 'target', filing_8k: 'doc',
  sector_rotation: 'rotate', macro: 'bank', options_structure: 'layers', insti_flow: 'flow',
};

// ── LAB: one real snapshot (from /api/wim/lab) that demonstrates EVERY concept ──
interface LabData {
  ticker: string; price: number | null;
  spark: { closes: number[]; vwap: number[] | null } | null;
  gex: { netGex: number | null; gammaFlip: number | null; regime: string | null };
  levels: { callWall: number | null; putFloor: number | null; maxPain: number | null };
  pcr: number | null; darkPoolPct: number | null; blockCount: number | null;
  shortVolPct: number | null; smartFlow: number | null;
  vol: { regime: string | null; regimeScore: number | null; iv: number | null };
  squeeze: { siPercent: number | null; daysToCover: number | null; riskScore: number | null; status: string | null };
  sma: { sma50: number | null; sma200: number | null; cross: string | null; phase: string | null };
  alpha: { score: number | null; grade: string | null };
  fund: { score: number | null; grade: string | null; sector: string | null };
}
const fmtM = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
};
interface Demo {
  levels?: { label: string; value: number; color: string }[];
  vwapOn?: boolean;
  tiles: { k: string; v: string; color?: string }[];
  gauge?: { pct: number; label: string; color: string };
}
// every glossary term → how to DEMONSTRATE it with the real snapshot
function termDemo(term: MetricTerm, lab: LabData | null): Demo | null {
  if (!lab) return null;
  const L = lab.levels; const G = lab.gex;
  switch (term) {
    case 'gex': case 'gexTimeline':
      if (G.netGex == null) return null;
      return {
        levels: G.gammaFlip != null ? [{ label: 'GAMMA FLIP', value: G.gammaFlip, color: P.amber }] : [],
        tiles: [
          { k: 'NET GEX', v: fmtM(G.netGex), color: G.netGex >= 0 ? P.mint : P.coral },
          ...(G.regime ? [{ k: 'REGIME', v: G.regime }] : []),
        ],
      };
    case 'gammaFlip':
      if (G.gammaFlip == null) return null;
      return { levels: [{ label: 'GAMMA FLIP', value: G.gammaFlip, color: P.amber }], tiles: [{ k: 'FLIP LEVEL', v: `$${G.gammaFlip}` }, ...(G.regime ? [{ k: 'REGIME', v: G.regime }] : [])] };
    case 'callWall':
      if (L.callWall == null) return null;
      return { levels: [{ label: 'CALL WALL', value: L.callWall, color: P.coral }], tiles: [{ k: 'CALL WALL', v: `$${L.callWall}`, color: P.coral }] };
    case 'putFloor':
      if (L.putFloor == null) return null;
      return { levels: [{ label: 'PUT FLOOR', value: L.putFloor, color: P.mint }], tiles: [{ k: 'PUT FLOOR', v: `$${L.putFloor}`, color: P.mint }] };
    case 'maxPain':
      if (L.maxPain == null) return null;
      return { levels: [{ label: 'MAX PAIN', value: L.maxPain, color: P.amber }], tiles: [{ k: 'MAX PAIN', v: `$${L.maxPain}`, color: P.amber }] };
    case 'darkPool':
      if (lab.darkPoolPct == null) return null;
      return { tiles: [{ k: 'DARK POOL', v: `${lab.darkPoolPct.toFixed(1)}%` }, ...(lab.blockCount != null ? [{ k: 'BLOCKS', v: String(lab.blockCount) }] : [])], gauge: { pct: Math.min(1, lab.darkPoolPct / 100), label: 'OFF-EXCHANGE SHARE', color: P.hero } };
    case 'blockTrades':
      if (lab.blockCount == null) return null;
      return { tiles: [{ k: 'BLOCK TRADES', v: String(lab.blockCount) }, ...(lab.darkPoolPct != null ? [{ k: 'DARK POOL', v: `${lab.darkPoolPct.toFixed(1)}%` }] : [])] };
    case 'whale':
      if (lab.smartFlow == null && lab.blockCount == null) return null;
      return { tiles: [...(lab.smartFlow != null ? [{ k: 'SMART FLOW', v: String(lab.smartFlow) }] : []), ...(lab.blockCount != null ? [{ k: 'BLOCKS', v: String(lab.blockCount) }] : [])], gauge: lab.smartFlow != null ? { pct: Math.min(1, lab.smartFlow / 100), label: 'SMART FLOW', color: P.hero } : undefined };
    case 'ivRank': case 'impliedMove': case 'ivSkew':
      if (lab.vol.iv == null) return null;
      return { tiles: [{ k: 'CURRENT IV', v: `${lab.vol.iv}` }, ...(lab.vol.regime ? [{ k: 'VOL REGIME', v: lab.vol.regime }] : [])], gauge: { pct: Math.min(1, (lab.vol.iv || 0) / 100), label: 'IMPLIED VOLATILITY', color: P.amber } };
    case 'netPremium': case 'opi': case 'pcr':
      if (lab.pcr == null) return null;
      return { tiles: [{ k: 'PUT/CALL', v: lab.pcr.toFixed(2), color: lab.pcr >= 1 ? P.coral : P.mint }, ...(lab.smartFlow != null ? [{ k: 'SMART FLOW', v: String(lab.smartFlow) }] : [])], gauge: { pct: Math.min(1, lab.pcr / 2), label: 'PUT/CALL RATIO', color: lab.pcr >= 1 ? P.coral : P.mint } };
    case 'squeeze':
      if (lab.squeeze.riskScore == null) return null;
      return { tiles: [{ k: 'SQUEEZE', v: String(lab.squeeze.riskScore) }, ...(lab.squeeze.siPercent != null ? [{ k: 'SHORT INT', v: `${lab.squeeze.siPercent}%` }] : []), ...(lab.squeeze.daysToCover != null ? [{ k: 'DAYS TO COVER', v: String(lab.squeeze.daysToCover) }] : [])], gauge: { pct: Math.min(1, (lab.squeeze.riskScore || 0) / 100), label: `SQUEEZE RISK · ${lab.squeeze.status || ''}`, color: P.coral } };
    case 'shortInterest':
      if (lab.squeeze.siPercent == null && lab.shortVolPct == null) return null;
      return { tiles: [...(lab.squeeze.siPercent != null ? [{ k: 'SHORT INT', v: `${lab.squeeze.siPercent}%` }] : []), ...(lab.shortVolPct != null ? [{ k: 'SHORT VOL', v: `${lab.shortVolPct.toFixed(1)}%` }] : []), ...(lab.squeeze.daysToCover != null ? [{ k: 'DAYS TO COVER', v: String(lab.squeeze.daysToCover) }] : [])] };
    case 'volRegime':
      if (lab.vol.regime == null) return null;
      return { tiles: [{ k: 'REGIME', v: lab.vol.regime }, ...(lab.vol.regimeScore != null ? [{ k: 'SCORE', v: String(lab.vol.regimeScore) }] : [])], gauge: lab.vol.regimeScore != null ? { pct: Math.min(1, lab.vol.regimeScore / 100), label: 'REGIME SCORE', color: P.amber } : undefined };
    case 'conviction':
      if (lab.alpha.score == null) return null;
      return { tiles: [{ k: 'ALPHA SCORE', v: String(lab.alpha.score) }, ...(lab.alpha.grade ? [{ k: 'GRADE', v: lab.alpha.grade }] : [])], gauge: { pct: Math.min(1, lab.alpha.score / 100), label: 'CONVICTION', color: P.hero } };
    case 'trendPhase':
      if (lab.sma.sma50 == null || lab.sma.sma200 == null) return null;
      return { levels: [{ label: 'SMA50', value: lab.sma.sma50, color: P.amber }, { label: 'SMA200', value: lab.sma.sma200, color: P.mint }], tiles: [...(lab.sma.cross ? [{ k: 'CROSS', v: lab.sma.cross, color: lab.sma.cross === 'GOLDEN' ? P.mint : P.coral }] : []), ...(lab.sma.phase ? [{ k: 'PHASE', v: lab.sma.phase }] : [])] };
    case 'fundamental':
      if (lab.fund.score == null) return null;
      return { tiles: [{ k: 'SCORE', v: String(lab.fund.score) }, ...(lab.fund.grade ? [{ k: 'GRADE', v: lab.fund.grade }] : [])], gauge: { pct: Math.min(1, lab.fund.score / 100), label: 'FUNDAMENTAL', color: P.mint } };
    case 'rsi': {
      const r = lab.spark ? rsi14(lab.spark.closes) : null;
      if (r == null) return null;
      return { tiles: [{ k: 'RSI(14)', v: String(r), color: r >= 70 ? P.coral : r <= 30 ? P.mint : undefined }], gauge: { pct: Math.min(1, r / 100), label: 'RSI(14)', color: r >= 70 ? P.coral : r <= 30 ? P.mint : P.hero } };
    }
    case 'vwap':
      if (!lab.spark?.vwap) return null;
      return { vwapOn: true, tiles: [{ k: 'VWAP', v: `$${lab.spark.vwap[lab.spark.vwap.length - 1].toFixed(2)}` }] };
    default:
      return null; // institutional13f / insiderActivity → chart + prose (no live numbers yet)
  }
}
// per-card micro-infographic: the term's REAL data as a tiny visual (not text)
function MiniViz({ term, lab }: { term: MetricTerm; lab: LabData | null }) {
  const demo = termDemo(term, lab);
  const spark = lab?.spark;
  const H = 46; const W = 132;
  // chart-type terms: real sparkline + the real level line(s), no labels (micro)
  if (demo?.levels && demo.levels.length > 0 && spark && spark.closes.length >= 8) {
    const closes = spark.closes;
    const lvls = demo.levels.slice(0, 2);
    const lo0 = Math.min(...closes); const hi0 = Math.max(...closes);
    const near = lvls.filter((l) => l.value > lo0 * 0.85 && l.value < hi0 * 1.15);
    const lo = Math.min(lo0, ...near.map((l) => l.value));
    const hi = Math.max(hi0, ...near.map((l) => l.value));
    const span = hi - lo || 1;
    const x = (i: number) => (i / Math.max(1, closes.length - 1)) * W;
    const y = (v: number) => H - 4 - ((v - lo) / span) * (H - 8);
    const path = closes.map((c, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(c).toFixed(1)}`).join(' ');
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }} aria-hidden>
        <path d={path} fill="none" stroke={P.hero} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        {near.map((l) => (
          <line key={l.label} x1="0" x2={W} y1={y(l.value)} y2={y(l.value)} stroke={l.color} strokeWidth="1.4" strokeDasharray="3 3" />
        ))}
      </svg>
    );
  }
  // vwap: sparkline + real vwap dashes
  if (demo?.vwapOn && spark && spark.vwap && spark.closes.length >= 8) {
    const closes = spark.closes; const vw = spark.vwap;
    const lo = Math.min(...closes, ...vw); const hi = Math.max(...closes, ...vw); const span = hi - lo || 1;
    const x = (i: number, n: number) => (i / Math.max(1, n - 1)) * W;
    const y = (v: number) => H - 4 - ((v - lo) / span) * (H - 8);
    const p1 = closes.map((c, i) => `${i === 0 ? 'M' : 'L'}${x(i, closes.length).toFixed(1)},${y(c).toFixed(1)}`).join(' ');
    const p2 = vw.map((c, i) => `${i === 0 ? 'M' : 'L'}${x(i, vw.length).toFixed(1)},${y(c).toFixed(1)}`).join(' ');
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }} aria-hidden>
        <path d={p1} fill="none" stroke={P.hero} strokeWidth="2" strokeLinecap="round" />
        <path d={p2} fill="none" stroke={P.amber} strokeWidth="1.5" strokeDasharray="4 3" />
      </svg>
    );
  }
  // gauge terms: radial arc with the real reading
  if (demo?.gauge) {
    const pct = Math.max(0.03, Math.min(1, demo.gauge.pct));
    const R = 17; const C = Math.PI * R; // half-circle arc
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: H }}>
        <svg width="52" height="34" viewBox="0 0 44 26" aria-hidden>
          <path d="M4 24 A18 18 0 0 1 40 24" fill="none" stroke="rgba(108,92,231,0.15)" strokeWidth="5" strokeLinecap="round" />
          <path d="M4 24 A18 18 0 0 1 40 24" fill="none" stroke={demo.gauge.color} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${C * pct} ${C}`} />
        </svg>
        <div style={{ fontSize: 17, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: demo.gauge.color }}>{demo.tiles[0]?.v}</div>
      </div>
    );
  }
  // value-only terms: the real number, big
  if (demo?.tiles && demo.tiles.length > 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: H, flexWrap: 'wrap' }}>
        {demo.tiles.slice(0, 2).map((tile) => (
          <div key={tile.k}>
            <div style={{ fontSize: 7.5, fontWeight: 900, letterSpacing: '0.08em', color: P.faint }}>{tile.k}</div>
            <div style={{ fontSize: 16, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: tile.color || P.ink }}>{tile.v}</div>
          </div>
        ))}
      </div>
    );
  }
  // no live data yet: quiet placeholder mark
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: H, color: P.faint }}>
      <Ic name="book" size={20} sw={1.6} />
    </div>
  );
}

// short live value for search chips / library cards
function termValue(term: MetricTerm, lab: LabData | null): string | null {
  const d = termDemo(term, lab);
  return d?.tiles?.[0] ? d.tiles[0].v : null;
}

// ── palette (bright violet playground) ──
const P = {
  bg: '#F6F4FF', card: '#FFFFFF', ink: '#262240', sub: '#5A5580', faint: '#928DB8',
  hero: '#6C5CE7', heroDeep: '#5344D6', heroSoft: '#E9E5FF',
  coral: '#FF7A59', coralSoft: '#FFE9E2',
  mint: '#19B893', mintSoft: '#DCF6EE',
  amber: '#FFAD1F', amberSoft: '#FFF2D9',
  line: '#E7E3F7', shadow: '0 10px 26px rgba(76,63,175,0.10)',
};

// ── i18n ──
const T: Record<Lang, Record<string, string>> = {
  ko: {
    tagline: '오늘 시장이 낸 문제, 30초 수업',
    todaysSet: '오늘의 문제', done: '완료', ofToday: '오늘 학습',
    weekDays: '월,화,수,목,금,토,일',
    streakLine1: '이번 주', streakLine2: '일 학습했어요',
    keepGoing: '좋아요, 계속 가요!', startToday: '오늘 문제로 두뇌를 깨워봐요',
    level: '레벨', xp: 'XP', toNext: '다음 레벨까지',
    lv1: '견습 탐정', lv2: '주니어 탐정', lv3: '시니어 탐정', lv4: '수석 탐정', lv5: '기관급 탐정',
    moved: '오늘 크게 움직임', whatHappened: '왜 움직였을까?',
    warmup: '첫 문제는 타이머 없이 천천히!',
    correct: '정답!', notQuite: '괜찮아요 — 이렇게 배우는 거예요',
    theWhy: '무슨 일이었나', receipt: '근거 기사',
    deepTitle: '기관급 시선', deepSub: '같은 움직임을 트레이딩 데스크는 이렇게 봐요',
    deepLocked: '광고 보고 기관급 시선 열기', deepFree: '지금은 무료로 열려 있어요',
    dp: '다크풀 비중', pcr: '풋/콜 비율', squeeze: '스퀴즈 점수', maxPain: '맥스 페인',
    next: '다음 문제', finish: '오늘 학습 끝!', backHome: '홈으로',
    setDone: '오늘 세트 완료', setDoneSub: '내일 새 문제가 준비돼요. 스트릭을 지켜보세요!',
    curriculum: '개념 사전', curriculumSub: '낮은 곳부터 기관급까지 — 탭해서 배워요',
    depth1: '기초', depth2: '중급', depth3: '기관급',
    learned: '학습함', close: '확인',
    quizLv1: '기초', quizLv2: '중급', quizLv3: '기관급',
    adBanner: '광고 영역', adInterstitial: '광고 후 계속됩니다',
    realChart: '오늘 실제 5분봉', realData: '실데이터', vwapLine: 'VWAP 라인',
    onRealChart: '오늘 실제 차트 위에서 보기', rsiNow: '현재 RSI(14)',
    tabHome: '홈', tabLib: '사전', tabSearch: '검색', tabMe: '기록',
    heroCase: '오늘의 대표 사건', caseFiles: '사건 파일', solve: '수사하기', solved: '해결',
    settings: '설정', language: '언어', searchPh: '지표·용어 검색 (예: 다크풀, RSI)',
    noResults: '결과가 없어요', myStats: '내 수사 기록', statSolved: '푼 사건', statCorrect: '정답', statTerms: '배운 용어',
    todayRecord: '오늘의 수사', langBtn: '한국어',
    empty: '오늘 문제를 준비하고 있어요 — 잠시 후 다시 열어주세요.',
    play: '풀기', replay: '다시 보기',
    playDeck: '오늘의 플레이',
    comingSoon: '곧 열림',
    teaserHunt: '레벨 헌트', teaserHuntSub: '실제 차트 위에서 기관 레벨 찾기',
    teaserSense: '숫자 감각', teaserSenseSub: '오늘 지표, 위였을까 아래였을까',
    sessionPre: '프리', sessionReg: '본장', sessionPost: '애프터',
  },
  en: {
    tagline: "Today's market, a 30-second lesson",
    todaysSet: "Today's questions", done: 'done', ofToday: 'learned today',
    weekDays: 'M,T,W,T,F,S,S',
    streakLine1: 'This week', streakLine2: ' days of learning',
    keepGoing: 'Nice — keep it going!', startToday: "Wake your brain up with today's set",
    level: 'Level', xp: 'XP', toNext: 'to next level',
    lv1: 'Rookie Detective', lv2: 'Junior Detective', lv3: 'Senior Detective', lv4: 'Lead Detective', lv5: 'Desk-grade Detective',
    moved: 'moved big today', whatHappened: 'Why did it move?',
    warmup: 'First one is timer-free — take your time!',
    correct: 'Correct!', notQuite: "No worries — that's how you learn",
    theWhy: 'What happened', receipt: 'The receipt',
    deepTitle: 'The institutional lens', deepSub: 'How a trading desk reads the same move',
    deepLocked: 'Watch an ad to unlock the desk view', deepFree: 'Open free for now',
    dp: 'Dark-pool share', pcr: 'Put/Call ratio', squeeze: 'Squeeze score', maxPain: 'Max pain',
    next: 'Next question', finish: "Today's learning done!", backHome: 'Home',
    setDone: 'Set complete', setDoneSub: 'Fresh questions tomorrow. Protect that streak!',
    curriculum: 'Concept library', curriculumSub: 'From basics to desk-grade — tap to learn',
    depth1: 'Basics', depth2: 'Intermediate', depth3: 'Institutional',
    learned: 'learned', close: 'Got it',
    quizLv1: 'Basic', quizLv2: 'Mid', quizLv3: 'Pro',
    adBanner: 'Ad space', adInterstitial: 'Continuing after the ad',
    realChart: "Today's real 5-min bars", realData: 'real data', vwapLine: 'VWAP line',
    onRealChart: "See it on today's real chart", rsiNow: 'Current RSI(14)',
    tabHome: 'Home', tabLib: 'Library', tabSearch: 'Search', tabMe: 'Record',
    heroCase: "Today's top case", caseFiles: 'Case files', solve: 'Investigate', solved: 'Solved',
    settings: 'Settings', language: 'Language', searchPh: 'Search indicators (e.g. dark pool, RSI)',
    noResults: 'No results', myStats: 'My case record', statSolved: 'Cases', statCorrect: 'Correct', statTerms: 'Terms learned',
    todayRecord: "Today's investigation", langBtn: 'English',
    empty: "Preparing today's questions — check back shortly.",
    play: 'Play', replay: 'Review',
    playDeck: "Today's plays",
    comingSoon: 'Coming soon',
    teaserHunt: 'Level Hunt', teaserHuntSub: 'Spot the institutional levels on a real chart',
    teaserSense: 'Number Sense', teaserSenseSub: "Was today's reading higher or lower?",
    sessionPre: 'PRE', sessionReg: 'REG', sessionPost: 'POST',
  },
  ja: {
    tagline: '今日の市場が出す問題、30秒レッスン',
    todaysSet: '今日の問題', done: '完了', ofToday: '今日の学習',
    weekDays: '月,火,水,木,金,土,日',
    streakLine1: '今週', streakLine2: '日学びました',
    keepGoing: 'いい調子、続けよう！', startToday: '今日の問題で頭を起こそう',
    level: 'レベル', xp: 'XP', toNext: '次のレベルまで',
    lv1: '見習い探偵', lv2: 'ジュニア探偵', lv3: 'シニア探偵', lv4: 'リード探偵', lv5: '機関級探偵',
    moved: '今日大きく動いた', whatHappened: 'なぜ動いた？',
    warmup: '最初の1問はタイマーなし、ゆっくりどうぞ！',
    correct: '正解！', notQuite: '大丈夫 — こうやって学ぶんです',
    theWhy: '何があったか', receipt: '根拠記事',
    deepTitle: '機関投資家の視点', deepSub: '同じ値動きをデスクはこう読む',
    deepLocked: '広告を見てデスク視点を開く', deepFree: '今は無料で開放中',
    dp: 'ダークプール比率', pcr: 'プット/コール', squeeze: 'スクイーズ', maxPain: 'マックスペイン',
    next: '次の問題', finish: '今日の学習おわり！', backHome: 'ホームへ',
    setDone: '今日のセット完了', setDoneSub: '明日また新しい問題。ストリークを守ろう！',
    curriculum: '概念ライブラリ', curriculumSub: '基礎から機関級まで — タップで学ぶ',
    depth1: '基礎', depth2: '中級', depth3: '機関級',
    learned: '学習済み', close: '閉じる',
    quizLv1: '基礎', quizLv2: '中級', quizLv3: '機関級',
    adBanner: '広告スペース', adInterstitial: '広告のあと続きます',
    realChart: '今日の実5分足', realData: '実データ', vwapLine: 'VWAPライン',
    onRealChart: '今日の実チャートで見る', rsiNow: '現在のRSI(14)',
    tabHome: 'ホーム', tabLib: '辞典', tabSearch: '検索', tabMe: '記録',
    heroCase: '今日のトップ事件', caseFiles: '事件ファイル', solve: '捜査する', solved: '解決',
    settings: '設定', language: '言語', searchPh: '指標を検索（例：ダークプール、RSI）',
    noResults: '該当なし', myStats: '捜査記録', statSolved: '解いた事件', statCorrect: '正解', statTerms: '学んだ用語',
    todayRecord: '今日の捜査', langBtn: '日本語',
    empty: '今日の問題を準備中 — 少し後にまた開いてください。',
    play: '解く', replay: '復習',
    playDeck: '今日のプレイ',
    comingSoon: '近日公開',
    teaserHunt: 'レベルハント', teaserHuntSub: '実チャートの上で機関レベルを探す',
    teaserSense: '数字感覚', teaserSenseSub: '今日の指標、上だった？下だった？',
    sessionPre: 'プレ', sessionReg: 'ザラ場', sessionPost: 'アフター',
  },
};

// curriculum depth shelves (glossary terms mapped to the education ladder)
const DEPTH_TERMS: Record<1 | 2 | 3, MetricTerm[]> = {
  1: ['rsi', 'vwap', 'trendPhase', 'fundamental', 'shortInterest'],
  2: ['pcr', 'squeeze', 'volRegime', 'ivRank', 'impliedMove', 'conviction', 'insiderActivity', 'institutional13f'],
  3: ['darkPool', 'blockTrades', 'whale', 'gex', 'gammaFlip', 'callWall', 'putFloor', 'maxPain', 'netPremium', 'opi', 'ivSkew', 'gexTimeline'],
};

const XP_CORRECT = 20;
const XP_TRIED = 10;
const XP_PER_LEVEL = 100;

// local weekday index (NOT UTC — a KST learning day must count as that day)
function weekdayIdx(): number { return (new Date().getDay() + 6) % 7; } // Mon=0..Sun=6

// ── RealChart: the "this is real data" proof. Actual 5-min closes, drawn in
// NEUTRAL violet (no up/down colors — compliance), optional real VWAP overlay
// and real options levels (max pain / call wall / put floor) as annotated lines.
function RealChart({
  closes, vwap, levels, height = 96, minmax = true, tone = 'light',
}: {
  closes: number[]; vwap?: number[] | null;
  levels?: { label: string; value: number; color: string }[];
  height?: number; minmax?: boolean; tone?: 'light' | 'dark';
}) {
  const stroke = tone === 'dark' ? '#E9E4FF' : P.hero;
  const fillId = tone === 'dark' ? 'wimFillD' : 'wimFill';
  const axis = tone === 'dark' ? 'rgba(255,255,255,0.65)' : P.faint;
  const W = 320; const H = height;
  const usable = levels?.filter((l) => typeof l.value === 'number' && l.value > 0) || [];
  const lo0 = Math.min(...closes); const hi0 = Math.max(...closes);
  // include level lines in scale only if they're near the price range (±12%) — a far
  // max-pain shouldn't flatten the real price action
  const near = usable.filter((l) => l.value > lo0 * 0.88 && l.value < hi0 * 1.12);
  const lo = Math.min(lo0, ...near.map((l) => l.value));
  const hi = Math.max(hi0, ...near.map((l) => l.value));
  const span = hi - lo || 1;
  const x = (i: number, n: number) => (i / Math.max(1, n - 1)) * W;
  const y = (v: number) => H - 14 - ((v - lo) / span) * (H - 26);
  const path = closes.map((c, i) => `${i === 0 ? 'M' : 'L'}${x(i, closes.length).toFixed(1)},${y(c).toFixed(1)}`).join(' ');
  const area = `${path} L${W},${H} L0,${H} Z`;
  const vwPath = vwap && vwap.length === closes.length
    ? vwap.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i, vwap.length).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
    : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }} aria-hidden>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone === 'dark' ? '#FFFFFF' : P.hero} stopOpacity={tone === 'dark' ? '0.30' : '0.28'} />
          <stop offset="100%" stopColor={tone === 'dark' ? '#FFFFFF' : P.hero} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${fillId})`} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {vwPath && <path d={vwPath} fill="none" stroke={P.amber} strokeWidth="1.6" strokeDasharray="5 4" opacity="0.9" />}
      {near.map((l) => (
        <g key={l.label}>
          <line x1="0" x2={W} y1={y(l.value)} y2={y(l.value)} stroke={l.color} strokeWidth="1.4" strokeDasharray="4 4" opacity="0.85" />
          <text x={W - 4} y={y(l.value) - 4} textAnchor="end" fontSize="9.5" fontWeight="800" fill={l.color}>{l.label} ${l.value}</text>
        </g>
      ))}
      {minmax && (
        <g>
          <text x="4" y="11" fontSize="9" fontWeight="800" fill={axis}>${hi0.toFixed(hi0 >= 100 ? 0 : 2)}</text>
          <text x="4" y={H - 3} fontSize="9" fontWeight="800" fill={axis}>${lo0.toFixed(lo0 >= 100 ? 0 : 2)}</text>
        </g>
      )}
    </svg>
  );
}

// tiny inline spark for list/deck cards (w/h shape the viewBox so strokes never distort)
function MiniSpark({ closes, w = 72, h = 30 }: { closes: number[]; w?: number; h?: number }) {
  const W = w; const H = h;
  const lo = Math.min(...closes); const hi = Math.max(...closes); const span = hi - lo || 1;
  const pts = closes.map((c, i) => `${((i / Math.max(1, closes.length - 1)) * W).toFixed(1)},${(H - 3 - ((c - lo) / span) * (H - 6)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: H, display: 'block', flexShrink: 0 }} aria-hidden>
      <polyline points={pts} fill="none" stroke={P.hero} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

// count-up number for the hero ±% badge — rolls 0 → value on mount (~600ms, ease-out),
// no library (rAF); settles on the exact raw value so the final frame matches the data
function CountUp({ value, decimals = 1, duration = 600 }: { value: number; decimals?: number; duration?: number }) {
  const [prog, setProg] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      setProg(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  if (prog >= 1) return <>{value}</>;
  const eased = 1 - Math.pow(1 - prog, 3);
  return <>{(value * eased).toFixed(decimals)}</>;
}

// PRE·REG·POST heat strip — a thin 3-segment session bar; the lit segment is where
// today's (already finished) move happened. Designed for the dark hero canvas.
function SessionStrip({ active, labels }: { active: 'pre' | 'reg' | 'post'; labels: [string, string, string] }) {
  const segs: ('pre' | 'reg' | 'post')[] = ['pre', 'reg', 'post'];
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {segs.map((s, i) => {
        const on = s === active;
        return (
          <div key={s} style={{ flex: s === 'reg' ? 2.2 : 1, textAlign: 'center', minWidth: 0 }}>
            <div style={{ height: 4, borderRadius: 99, background: on ? '#FFD66B' : 'rgba(255,255,255,0.20)' }} />
            <div style={{ marginTop: 4, fontSize: 8, fontWeight: 900, letterSpacing: '0.08em', color: on ? '#FFD66B' : 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{labels[i]}</div>
          </div>
        );
      })}
    </div>
  );
}

// RSI(14) from real closes — client-side, standard Wilder smoothing
function rsi14(closes: number[]): number | null {
  if (closes.length < 16) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= 14; i++) { const d = closes[i] - closes[i - 1]; if (d >= 0) g += d; else l -= d; }
  let ag = g / 14, al = l / 14;
  for (let i = 15; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * 13 + Math.max(0, d)) / 14;
    al = (al * 13 + Math.max(0, -d)) / 14;
  }
  if (al === 0) return 100;
  return Math.round(100 - 100 / (1 + ag / al));
}

// ── GlossarySheet v2: every concept demonstrated on REAL material — the real
// last-session chart with the term's real level/overlay drawn on it, plus the
// term's real numbers as stat tiles and a gauge. Prose is the caption, not the lesson.
function GlossarySheet({
  term, lab, loc, t, onClose,
}: {
  term: MetricTerm; lab: LabData | null; loc: Lang; t: Record<string, string>; onClose: () => void;
}) {
  const entry = METRIC_GLOSSARY[term];
  const demo = termDemo(term, lab);
  const spark = lab?.spark || null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(38,34,64,0.45)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, margin: '0 auto', background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderRadius: '24px 24px 0 0', padding: '20px 20px calc(24px + env(safe-area-inset-bottom))', animation: 'wimUp 0.25s ease', maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 16.5, fontWeight: 900, color: P.ink, letterSpacing: '-0.01em' }}>{entry.title[loc]}</div>

        {lab && (demo || spark) && (
          <div style={{ marginTop: 12, background: P.bg, borderRadius: 18, padding: '11px 10px 8px', border: `1px solid ${P.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px 7px' }}>
              <TickerLogo ticker={lab.ticker} size={17} />
              <span style={{ fontSize: 10.5, fontWeight: 900, color: P.ink }}>{lab.ticker}</span>
              <span style={{ fontSize: 9.5, fontWeight: 750 as any, color: P.faint }}>· {t.onRealChart}</span>
              <span style={{ marginLeft: 'auto', fontSize: 8.5, fontWeight: 900, letterSpacing: '0.06em', color: P.mint, background: P.mintSoft, borderRadius: 99, padding: '2px 8px' }}>● {t.realData.toUpperCase()}</span>
            </div>
            {spark && spark.closes.length >= 8 && (
              <RealChart
                closes={spark.closes}
                vwap={demo?.vwapOn ? spark.vwap : null}
                levels={demo?.levels}
                height={116}
              />
            )}
            {demo?.vwapOn && (
              <div style={{ padding: '4px 6px 0', fontSize: 9.5, fontWeight: 800, color: P.amber }}>― ― {t.vwapLine}</div>
            )}
            {demo?.tiles && demo.tiles.length > 0 && (
              <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
                {demo.tiles.map((tile) => (
                  <div key={tile.k} style={{ flex: '1 1 30%', minWidth: 88, background: '#fff', border: `1px solid ${P.line}`, borderRadius: 13, padding: '9px 10px' }}>
                    <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.09em', color: P.faint }}>{tile.k}</div>
                    <div style={{ fontSize: 16, fontWeight: 900, marginTop: 2, fontVariantNumeric: 'tabular-nums', color: tile.color || P.ink }}>{tile.v}</div>
                  </div>
                ))}
              </div>
            )}
            {demo?.gauge && (
              <div style={{ marginTop: 9, padding: '0 2px 4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, fontWeight: 900, letterSpacing: '0.08em', color: P.faint, marginBottom: 4 }}>
                  <span>{demo.gauge.label}</span>
                  <span style={{ color: demo.gauge.color }}>{Math.round(demo.gauge.pct * 100)}</span>
                </div>
                <div style={{ height: 8, background: 'rgba(108,92,231,0.12)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(3, demo.gauge.pct * 100)}%`, height: '100%', background: demo.gauge.color, borderRadius: 99, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            )}
          </div>
        )}

        <p style={{ margin: '12px 0 0', fontSize: 13.5, lineHeight: 1.7, color: P.sub, fontWeight: 600 as any }}>{entry.body[loc]}</p>
        <button type="button" onClick={onClose} style={{ font: 'inherit', width: '100%', marginTop: 14, background: P.heroSoft, color: P.heroDeep, border: 'none', borderRadius: 14, padding: '12px 0', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>{t.close}</button>
      </div>
    </div>
  );
}

// ticker logo via the existing proxy (monogram fallback)
function TickerLogo({ ticker, size = 22 }: { ticker: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = {
    width: size, height: size, minWidth: size, borderRadius: '50%', flexShrink: 0,
    overflow: 'hidden', background: '#fff', border: `1.5px solid ${P.line}`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  } as const;
  if (failed) {
    return <span aria-hidden style={{ ...box, background: P.heroSoft, color: P.hero, fontSize: Math.round(size * 0.5), fontWeight: 900 }}>{ticker[0]}</span>;
  }
  return (
    <span aria-hidden style={box}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/undercurrent/logo?t=${ticker}`} alt="" onError={() => setFailed(true)} style={{ width: '76%', height: '76%', objectFit: 'contain', display: 'block' }} />
    </span>
  );
}

// **bold** parser for explanations
function Bold({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((s, i) => (i % 2 === 1
        ? <strong key={i} style={{ color: P.hero, fontWeight: 900 }}>{s}</strong>
        : <span key={i}>{s}</span>))}
    </>
  );
}

// Calm-style weekly streak ring + dots (onDark = rendered inside the violet hero)
function StreakRing({ days, t }: { days: number; t: Record<string, string> }) {
  const pct = Math.min(1, days / 7);
  const R = 34; const CIRC = 2 * Math.PI * R;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', width: 92, height: 92, flexShrink: 0 }}>
        <svg width="92" height="92" viewBox="0 0 92 92">
          <circle cx="46" cy="46" r={R} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="9" />
          <circle
            cx="46" cy="46" r={R} fill="none" stroke="#FFD66B" strokeWidth="9" strokeLinecap="round"
            strokeDasharray={`${CIRC * Math.max(0.015, pct)} ${CIRC}`} transform="rotate(-90 46 46)"
            style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.22,1,0.36,1)' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{days}</span>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.05em' }}>DAYS</span>
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 900, color: '#fff' }}>
          {t.streakLine1} <span style={{ color: '#FFD66B' }}>{days}</span>{t.streakLine2}
        </div>
        <div style={{ fontSize: 12, fontWeight: 650, color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>
          {days > 0 ? t.keepGoing : t.startToday}
        </div>
      </div>
    </div>
  );
}

export default function WimPage() {
  const params = useParams();
  const router = useRouter();
  const loc: Lang = params?.locale === 'en' ? 'en' : params?.locale === 'ja' ? 'ja' : 'ko';
  const t = T[loc];

  const [today, setToday] = useState<Today | null>(null);
  const [failed, setFailed] = useState(false);

  // on-device learner state
  const [xp, setXp] = useState(0);
  const [week, setWeek] = useState<boolean[]>([false, false, false, false, false, false, false]);
  const [done, setDone] = useState<Record<string, string>>({}); // unitId -> chosen categoryId
  const [seenTerms, setSeenTerms] = useState<Record<string, boolean>>({});
  const [everPlayed, setEverPlayed] = useState(true); // first-ever quiz = timer off

  // quiz flow
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [deepOpen, setDeepOpen] = useState(false);
  const [remain, setRemain] = useState(8);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [setDoneShown, setSetDoneShown] = useState(false);
  const [glossOpen, setGlossOpen] = useState<MetricTerm | null>(null);
  // v3: glass shell — bottom tabs, settings sheet (language lives here), indicator search
  const [homeTab, setHomeTab] = useState<'home' | 'lib' | 'search' | 'me'>('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  // one real snapshot that powers every concept demo (hero ticker of the day)
  const [lab, setLab] = useState<LabData | null>(null);

  // ── boot: restore local state + fetch today's set (instant-paint + SWR refresh) ──
  useEffect(() => {
    try {
      setXp(parseInt(localStorage.getItem('wim.xp') || '0', 10) || 0);
      setDone(JSON.parse(localStorage.getItem('wim.done') || '{}'));
      setSeenTerms(JSON.parse(localStorage.getItem('wim.terms') || '{}'));
      setEverPlayed(localStorage.getItem('wim.played') === '1');
      const wk = JSON.parse(localStorage.getItem('wim.week') || 'null');
      const wkKey = localStorage.getItem('wim.weekKey') || '';
      // reset the week dots every Monday
      const now = new Date();
      const monday = new Date(now); monday.setDate(now.getDate() - weekdayIdx());
      const mondayKey = `${monday.getFullYear()}-${monday.getMonth() + 1}-${monday.getDate()}`;
      if (Array.isArray(wk) && wkKey === mondayKey) setWeek(wk);
      else { localStorage.setItem('wim.weekKey', mondayKey); localStorage.setItem('wim.week', JSON.stringify([false, false, false, false, false, false, false])); }
    } catch { /* storage unavailable */ }
    let hadCache = false;
    try {
      const cached = localStorage.getItem('wim.today');
      if (cached) {
        const j = JSON.parse(cached);
        if (j?.units?.length) { setToday(j); hadCache = true; }
      }
    } catch { /* storage unavailable */ }

    let alive = true;
    fetch('/api/wim/today')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        if (j?.success && j.units?.length) {
          setToday(j);
          try { localStorage.setItem('wim.today', JSON.stringify(j)); } catch {}
          if (j._stale) fetch('/api/wim/today?refresh=1').then((r) => (r.ok ? r.json() : null)).then((f) => {
            if (alive && f?.success && f.units?.length) { setToday(f); try { localStorage.setItem('wim.today', JSON.stringify(f)); } catch {} }
          }).catch(() => {});
        } else if (!hadCache) setFailed(true);
      })
      .catch(() => { if (alive && !hadCache) setFailed(true); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const units = today?.units || [];
  // fetch the lab snapshot once the day's hero ticker is known (fallback NVDA)
  const labTicker = units[0]?.ticker || 'NVDA';
  useEffect(() => {
    let alive = true;
    fetch(`/api/wim/lab?t=${labTicker}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.success) setLab(j); })
      .catch(() => {});
    return () => { alive = false; };
  }, [labTicker]);
  const doneCount = units.filter((u) => done[u.id]).length;
  const streakDays = week.filter(Boolean).length;
  const levelIdx = Math.min(4, Math.floor(xp / XP_PER_LEVEL));
  const levelNames = [t.lv1, t.lv2, t.lv3, t.lv4, t.lv5];
  const levelPct = Math.min(1, (xp % XP_PER_LEVEL) / XP_PER_LEVEL);

  const persist = useCallback((k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} }, []);

  // ── quiz timer (8s, first-ever play = off, timeout just reveals — no penalty) ──
  const stopTimer = useCallback(() => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }, []);
  const startQuiz = useCallback((idx: number) => {
    setActiveIdx(idx); setPicked(null); setDeepOpen(false); setRemain(8);
    stopTimer();
    if (everPlayed) {
      timerRef.current = setInterval(() => {
        setRemain((r) => {
          if (r <= 1) { stopTimer(); setPicked('__timeout__'); return 0; }
          return r - 1;
        });
      }, 1000);
    }
    window.scrollTo(0, 0);
  }, [everPlayed, stopTimer]);

  // shared bookkeeping: XP + done + week dot + first-play flag (answer AND timeout)
  const record = useCallback((u: Unit, categoryId: string) => {
    if (done[u.id]) return;
    const correct = u.correctCategoryIds.includes(categoryId);
    const gain = correct ? XP_CORRECT : XP_TRIED;
    const nxp = xp + gain;
    setXp(nxp); persist('wim.xp', String(nxp));
    const nd = { ...done, [u.id]: categoryId };
    setDone(nd); persist('wim.done', JSON.stringify(nd));
    const w = [...week]; w[weekdayIdx()] = true;
    setWeek(w); persist('wim.week', JSON.stringify(w));
    if (!everPlayed) { setEverPlayed(true); persist('wim.played', '1'); }
  }, [done, xp, week, everPlayed, persist]);

  const answer = useCallback((u: Unit, categoryId: string) => {
    if (picked) return;
    stopTimer();
    setPicked(categoryId);
    record(u, categoryId);
  }, [picked, record, stopTimer]);

  // the 8s timer expiring still counts as a learning attempt (tried-XP, day dot)
  useEffect(() => {
    if (picked !== '__timeout__' || activeIdx == null) return;
    const u = units[activeIdx];
    if (u) record(u, '__timeout__');
  }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeQuiz = useCallback((finishedAll: boolean) => {
    stopTimer(); setActiveIdx(null); setPicked(null); setDeepOpen(false);
    if (finishedAll && !setDoneShown) {
      setSetDoneShown(true);
      // ② interstitial slot — fires here when ads go live (one per set, capped)
      // if (WIM_ADS_LIVE) showWimInterstitial();
    }
    window.scrollTo(0, 0);
  }, [stopTimer, setDoneShown]);

  const markTerm = useCallback((term: MetricTerm) => {
    setGlossOpen(term);
    if (!seenTerms[term]) {
      const ns = { ...seenTerms, [term]: true };
      setSeenTerms(ns); persist('wim.terms', JSON.stringify(ns));
    }
  }, [seenTerms, persist]);

  const weekLabels = t.weekDays.split(',');

  // ════════════════════════ QUIZ OVERLAY ════════════════════════
  if (activeIdx != null && units[activeIdx]) {
    const u = units[activeIdx];
    const revealed = picked != null;
    const wasCorrect = picked != null && u.correctCategoryIds.includes(picked);
    const isLast = activeIdx >= units.length - 1;
    const allDoneAfter = units.every((x) => x.id === u.id ? true : !!done[x.id]);
    return (
      <div style={{ minHeight: '100vh', background: P.bg, color: P.ink, fontFamily: "-apple-system,'SF Pro Rounded','Hiragino Sans','Apple SD Gothic Neo',sans-serif" }}>
        <style>{`@keyframes wimPop{0%{transform:scale(0.86);opacity:0}70%{transform:scale(1.04)}100%{transform:scale(1);opacity:1}} @keyframes wimUp{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 18px calc(40px + env(safe-area-inset-bottom))' }}>
          {/* top bar: close + progress + countdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
            <button type="button" onClick={() => closeQuiz(false)} aria-label={t.backHome} style={{ font: 'inherit', width: 38, height: 38, borderRadius: '50%', border: `1.5px solid ${P.line}`, background: '#fff', fontSize: 16, fontWeight: 900, color: P.ink, cursor: 'pointer' }}>←</button>
            <div style={{ flex: 1, height: 8, background: P.heroSoft, borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ width: `${((activeIdx + (revealed ? 1 : 0.4)) / units.length) * 100}%`, height: '100%', background: P.hero, borderRadius: 99, transition: 'width 0.4s ease' }} />
            </div>
            {everPlayed && !revealed ? (
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: remain <= 3 ? P.coralSoft : P.heroSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900, color: remain <= 3 ? P.coral : P.hero }}>
                {remain}
              </div>
            ) : <div style={{ width: 38 }} />}
          </div>

          {!everPlayed && !revealed && (
            <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12, fontWeight: 800, color: P.hero, background: P.heroSoft, borderRadius: 99, padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, margin: '10px auto 0' }}><Ic name="clock" size={13} color={P.hero} /> {t.warmup}</div>
          )}

          {/* mover card — NO direction arrows/colors (compliance): magnitude only */}
          <div style={{ marginTop: 16, background: '#fff', borderRadius: 24, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '20px 18px', textAlign: 'center', animation: 'wimUp 0.35s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
              <TickerLogo ticker={u.ticker} size={34} />
              <div style={{ textAlign: 'left', minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-0.01em' }}>{u.ticker}</div>
                {u.companyName && <div style={{ fontSize: 11, fontWeight: 650, color: P.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190 }}>{u.companyName}</div>}
              </div>
            </div>
            <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: P.heroSoft, color: P.heroDeep, borderRadius: 99, padding: '6px 13px', fontSize: 12.5, fontWeight: 900 }}>
              ±{u.moveMagnitude}% · {t.moved}
            </div>
            {/* THE differentiator: the actual chart of what really happened today */}
            {u.spark && u.spark.closes.length >= 8 && (
              <div style={{ marginTop: 12, background: P.bg, borderRadius: 16, padding: '10px 8px 6px', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px 6px' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: P.mint, display: 'inline-block' }} />
                  <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '0.08em', color: P.sub }}>{t.realChart.toUpperCase()}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 900, color: P.mint, background: P.mintSoft, borderRadius: 99, padding: '2px 8px' }}>● {t.realData.toUpperCase()}</span>
                </div>
                <RealChart closes={u.spark.closes} height={104} />
              </div>
            )}
            <h1 style={{ margin: '13px 0 2px', fontSize: 21, fontWeight: 900, letterSpacing: '-0.02em' }}>{u.prompt[loc]}</h1>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: P.sub }}>{t.whatHappened}</div>
          </div>

          {/* choices — full-width vertical stack (CJK-safe), 3D press */}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {u.choices.map((c) => {
              const isPick = picked === c.categoryId;
              const isAnswer = u.correctCategoryIds.includes(c.categoryId);
              const bg = !revealed ? '#fff' : isAnswer ? P.mintSoft : isPick ? P.coralSoft : '#fff';
              const border = !revealed ? P.line : isAnswer ? P.mint : isPick ? P.coral : P.line;
              return (
                <button
                  key={c.id} type="button" disabled={revealed}
                  onClick={() => answer(u, c.categoryId)}
                  style={{
                    font: 'inherit', textAlign: 'left', cursor: revealed ? 'default' : 'pointer',
                    background: bg, border: `2px solid ${border}`, borderRadius: 18,
                    padding: '14px 15px', fontSize: 14, fontWeight: 750 as any, color: P.ink, lineHeight: 1.4,
                    boxShadow: revealed ? 'none' : '0 3px 0 rgba(76,63,175,0.12)',
                    transition: 'transform 0.08s ease, box-shadow 0.08s ease',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                  onTouchStart={(e) => { if (!revealed) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(2px)'; }}
                  onTouchEnd={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
                >
                  <span style={{ width: 34, height: 34, minWidth: 34, borderRadius: 12, background: P.heroSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: P.heroDeep }}><Ic name={CAT_ICON[c.categoryId] || 'target'} size={17} /></span>
                  <span style={{ flex: 1 }}>{c.label[loc]}</span>
                  {revealed && isAnswer && <Ic name="check" size={18} color={P.mint} sw={2.6} />}
                  {revealed && isPick && !isAnswer && <Ic name="close" size={16} color={P.coral} sw={2.4} />}
                </button>
              );
            })}
          </div>

          {/* reveal */}
          {revealed && (
            <div style={{ animation: 'wimPop 0.4s cubic-bezier(0.22,1,0.36,1)' }}>
              <div style={{ marginTop: 16, textAlign: 'center', fontSize: 20, fontWeight: 900, color: wasCorrect ? P.mint : P.coral }}>
                {wasCorrect ? `${t.correct} +${XP_CORRECT}XP` : `${t.notQuite} +${XP_TRIED}XP`}
              </div>

              <div style={{ marginTop: 12, background: '#fff', borderRadius: 20, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '15px 16px' }}>
                <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '0.1em', color: P.hero, marginBottom: 7 }}>{t.theWhy.toUpperCase()}</div>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7, fontWeight: 600 as any }}><Bold text={u.explanation[loc]} /></p>
                {u.evidence?.newsHeadline && (
                  <div style={{ marginTop: 11, display: 'flex', gap: 7, alignItems: 'flex-start', background: P.bg, borderRadius: 12, padding: '9px 11px' }}>
                    <span style={{ color: P.faint, marginTop: 1 }}><Ic name="doc" size={14} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '0.08em', color: P.faint }}>{t.receipt.toUpperCase()}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: P.sub, lineHeight: 1.45 }}>{u.evidence.newsHeadline[loc]}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* ③ institutional deep layer — rewarded-ad gate when live; free (labeled) now */}
              {(u.deepRead || u.money) && (
                <div style={{ marginTop: 12, background: `linear-gradient(135deg, ${P.heroDeep}, ${P.hero})`, borderRadius: 20, padding: '15px 16px', color: '#fff', boxShadow: P.shadow }}>
                  <button type="button" onClick={() => setDeepOpen(!deepOpen)} style={{ font: 'inherit', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ color: '#FFD66B' }}><Ic name="bank" size={18} /></span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 900 }}>{t.deepTitle}</span>
                      <span style={{ display: 'block', fontSize: 10.5, fontWeight: 650, opacity: 0.8, marginTop: 1 }}>{t.deepSub}</span>
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 900, transform: deepOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
                  </button>
                  {!deepOpen && (
                    <div style={{ marginTop: 9, fontSize: 10.5, fontWeight: 800, opacity: 0.85 }}>
                      {WIM_ADS_LIVE ? t.deepLocked : t.deepFree}
                    </div>
                  )}
                  {deepOpen && (
                    <div style={{ marginTop: 11, animation: 'wimUp 0.3s ease' }}>
                      {u.deepRead && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, fontWeight: 600 as any, opacity: 0.96 }}>{u.deepRead[loc]}</p>}
                      {/* real options levels ON the real chart — the desk's actual map */}
                      {u.spark && u.spark.closes.length >= 8 && u.money && (u.money.maxPain != null || u.money.callWall != null || u.money.putFloor != null) && (
                        <div style={{ marginTop: 10, background: 'rgba(255,255,255,0.95)', borderRadius: 14, padding: '8px 6px 4px' }}>
                          <RealChart
                            closes={u.spark.closes}
                            height={110}
                            levels={[
                              ...(u.money.maxPain != null ? [{ label: 'MAX PAIN', value: u.money.maxPain, color: P.amber }] : []),
                              ...(u.money.callWall != null ? [{ label: 'CALL WALL', value: u.money.callWall as number, color: P.coral }] : []),
                              ...(u.money.putFloor != null ? [{ label: 'PUT FLOOR', value: u.money.putFloor as number, color: P.mint }] : []),
                            ]}
                          />
                        </div>
                      )}
                      {u.money && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
                          {u.money.darkPoolPct != null && (
                            <button type="button" onClick={() => markTerm('darkPool')} style={{ font: 'inherit', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.16)', borderRadius: 10, padding: '6px 10px', color: '#fff', fontSize: 11, fontWeight: 800 }}>
                              {t.dp} {Math.round(u.money.darkPoolPct)}% ⓘ
                            </button>
                          )}
                          {u.money.volumePcr != null && (
                            <button type="button" onClick={() => markTerm('pcr')} style={{ font: 'inherit', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.16)', borderRadius: 10, padding: '6px 10px', color: '#fff', fontSize: 11, fontWeight: 800 }}>
                              {t.pcr} {u.money.volumePcr.toFixed(2)} ⓘ
                            </button>
                          )}
                          {u.money.squeezeScore != null && (
                            <button type="button" onClick={() => markTerm('squeeze')} style={{ font: 'inherit', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.16)', borderRadius: 10, padding: '6px 10px', color: '#fff', fontSize: 11, fontWeight: 800 }}>
                              {t.squeeze} {Math.round(u.money.squeezeScore)} ⓘ
                            </button>
                          )}
                          {u.money.maxPain != null && (
                            <button type="button" onClick={() => markTerm('maxPain')} style={{ font: 'inherit', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.16)', borderRadius: 10, padding: '6px 10px', color: '#fff', fontSize: 11, fontWeight: 800 }}>
                              {t.maxPain} ${u.money.maxPain} ⓘ
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => { if (isLast || allDoneAfter) closeQuiz(true); else startQuiz(activeIdx + 1); }}
                style={{ font: 'inherit', width: '100%', marginTop: 15, background: P.ink, color: '#fff', border: 'none', borderRadius: 18, padding: '15px 0', fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 0 rgba(38,34,64,0.35)' }}
              >
                {isLast || allDoneAfter ? `🏁 ${t.finish}` : `${t.next} →`}
              </button>
            </div>
          )}

          <div style={{ marginTop: 18, textAlign: 'center', fontSize: 10, color: P.faint, fontWeight: 600, lineHeight: 1.5 }}>{u.disclaimer[loc]}</div>
        </div>

        {/* glossary bottom sheet (shared with home) */}
        {glossOpen && <GlossarySheet term={glossOpen} lab={lab} loc={loc} t={t} onClose={() => setGlossOpen(null)} />}
      </div>
    );
  }

  // ════════════════════════ HOME (v3: glass shell · bottom tabs · case files) ════════════════════════
  const heroU = units.find((u) => !done[u.id]) || units[0] || null;
  const heroIdx = heroU ? units.indexOf(heroU) : -1;
  // which session carried the hero move (server field; default REG when absent)
  const heroSessionRaw = (heroU?.session || '').toLowerCase();
  const heroSession: 'pre' | 'reg' | 'post' = heroSessionRaw.includes('pre') ? 'pre'
    : heroSessionRaw.includes('post') || heroSessionRaw.includes('after') ? 'post' : 'reg';
  const glass = {
    background: 'rgba(255,255,255,0.60)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.85)',
    boxShadow: '0 12px 34px rgba(76,63,175,0.13)',
  } as const;
  const glassDark = {
    background: 'linear-gradient(150deg, rgba(83,68,214,0.92), rgba(108,92,231,0.86))',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.28)',
    boxShadow: '0 16px 40px rgba(76,63,175,0.30)',
  } as const;
  const solvedCount = Object.keys(done).length;
  const correctToday = units.filter((u) => done[u.id] && u.correctCategoryIds.includes(done[u.id])).length;
  const termsCount = Object.keys(seenTerms).filter((k) => seenTerms[k]).length;
  const q = searchQ.trim().toLowerCase();
  const searchResults = (Object.keys(METRIC_GLOSSARY) as MetricTerm[]).filter((term) => {
    if (!q) return false;
    const e = METRIC_GLOSSARY[term];
    return `${e.title.ko} ${e.title.en} ${e.title.ja} ${e.body[loc]}`.toLowerCase().includes(q);
  }).slice(0, 12);

  return (
    <div style={{ minHeight: '100vh', color: P.ink, fontFamily: "-apple-system,'SF Pro Rounded','Hiragino Sans','Apple SD Gothic Neo',sans-serif", background: 'linear-gradient(178deg, #D9D0FF 0%, #EDE8FF 36%, #F8F6FF 100%)', position: 'relative' }}>
      <style>{`
        @keyframes wimUp{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes wimFloat1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(24px,-30px) scale(1.12)}}
        @keyframes wimFloat2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-30px,22px) scale(0.92)}}
        @keyframes wimFloat3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(18px,26px) scale(1.08)}}
        .wim-skel{background:linear-gradient(90deg,rgba(255,255,255,0.55) 25%,rgba(255,255,255,0.85) 50%,rgba(255,255,255,0.55) 75%);background-size:200% 100%;animation:wimSh 1.4s infinite}
        @keyframes wimSh{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .no-sb::-webkit-scrollbar{display:none}
      `}</style>

      {/* floating gradient blobs — depth behind the glass */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-6%', right: '-14%', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,122,89,0.20), transparent 68%)', filter: 'blur(14px)', animation: 'wimFloat1 13s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '30%', left: '-16%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(25,184,147,0.16), transparent 68%)', filter: 'blur(16px)', animation: 'wimFloat2 16s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '4%', right: '-10%', width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(circle, rgba(108,92,231,0.20), transparent 66%)', filter: 'blur(18px)', animation: 'wimFloat3 18s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '8%', left: '20%', width: 150, height: 150, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,173,31,0.18), transparent 66%)', filter: 'blur(12px)', animation: 'wimFloat2 11s ease-in-out infinite' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: `0 16px calc(${WIM_ADS_LIVE ? 158 : 104}px + env(safe-area-inset-bottom))` }}>

        {/* glass masthead */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
          <span style={{ ...glass, width: 42, height: 42, borderRadius: 15, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 21 }}><Ic name="search" size={20} color={P.heroDeep} sw={2} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.05 }}>Why&apos;d It Move?</div>
            <div style={{ fontSize: 10, fontWeight: 750 as any, color: P.sub, marginTop: 2 }}>{t.tagline}</div>
          </div>
          <button type="button" onClick={() => setSettingsOpen(true)} aria-label={t.settings} style={{ ...glass, font: 'inherit', marginLeft: 'auto', flexShrink: 0, width: 40, height: 40, borderRadius: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16 }}>
            <Ic name="gear" size={18} color={P.ink} sw={1.5} />
          </button>
        </header>

        {/* ── TAB: HOME ── */}
        {homeTab === 'home' && (
          <>
            {/* hero: today's top case — the REAL chart IS the graphic */}
            {heroU && heroU.spark && heroU.spark.closes.length >= 8 ? (
              <section style={{ ...glassDark, marginTop: 16, borderRadius: 26, padding: '16px 16px 12px', color: '#fff', animation: 'wimUp 0.35s ease' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: '#FFD66B' , display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ic name="folder" size={13} color="#FFD66B" /> {t.heroCase.toUpperCase()}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 900, color: '#7EE0AE', background: 'rgba(25,184,147,0.25)', borderRadius: 99, padding: '3px 9px' }}>● {t.realData.toUpperCase()}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11 }}>
                  <TickerLogo ticker={heroU.ticker} size={40} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.01em' }}>{heroU.ticker}</div>
                    {heroU.companyName && <div style={{ fontSize: 10.5, fontWeight: 650 as any, opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{heroU.companyName}</div>}
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: 'tabular-nums', background: 'rgba(255,255,255,0.16)', borderRadius: 99, padding: '6px 13px' }}>±<CountUp value={heroU.moveMagnitude} />%</span>
                </div>
                <div style={{ margin: '12px -16px 0' }}>
                  <RealChart closes={heroU.spark.closes} height={150} tone="dark" />
                </div>
                <div style={{ marginTop: 9 }}>
                  <SessionStrip active={heroSession} labels={[t.sessionPre, t.sessionReg, t.sessionPost]} />
                </div>
                <button type="button" onClick={() => startQuiz(heroIdx)} style={{ font: 'inherit', width: '100%', marginTop: 11, background: '#fff', color: P.heroDeep, border: 'none', borderRadius: 16, padding: '13px 0', fontSize: 14.5, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 0 rgba(0,0,0,0.18)' }}>
                  {heroU.prompt[loc]} · {t.solve} →
                </button>
              </section>
            ) : !failed && !today ? (
              <div className="wim-skel" style={{ height: 290, borderRadius: 26, marginTop: 16 }} />
            ) : null}
            {failed && !today && (
              <div style={{ ...glass, marginTop: 16, borderRadius: 20, padding: '18px 16px', fontSize: 13, fontWeight: 700, color: P.sub, textAlign: 'center' }}>{t.empty}</div>
            )}

            {/* today's play deck — bigger snap cards (real spark each) + W2 teasers */}
            {units.length > 0 && (
              <section style={{ marginTop: 18 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px' }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 , display: 'inline-flex', alignItems: 'center', gap: 7 }}><Ic name="play" size={16} color={P.heroDeep} /> {t.playDeck}</h2>
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 900, color: doneCount === units.length ? P.mint : P.faint }}>{doneCount}/{units.length} {t.done}</span>
                </div>
                <div className="no-sb" style={{ display: 'flex', alignItems: 'stretch', gap: 12, overflowX: 'auto', margin: '10px -16px 0', padding: '2px 16px 8px', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}>
                  {units.map((u, i) => {
                    const isDone = !!done[u.id];
                    const lvLabel = u.difficultyLevel === 1 ? t.quizLv1 : u.difficultyLevel === 2 ? t.quizLv2 : t.quizLv3;
                    const lvColor = u.difficultyLevel === 1 ? P.mint : u.difficultyLevel === 2 ? P.amber : P.hero;
                    return (
                      <button key={u.id} type="button" onClick={() => startQuiz(i)} style={{ ...glass, font: 'inherit', textAlign: 'left', cursor: 'pointer', flex: '0 0 212px', scrollSnapAlign: 'start', borderRadius: 22, padding: '13px 13px 12px', animation: 'wimUp 0.3s ease' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <TickerLogo ticker={u.ticker} size={28} />
                          <span style={{ fontSize: 14.5, fontWeight: 900 }}>{u.ticker}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 8.5, fontWeight: 900, color: lvColor, background: `${lvColor}1F`, borderRadius: 99, padding: '2px 7px' }}>{lvLabel}</span>
                        </div>
                        <div style={{ margin: '10px -3px 0' }}>
                          {u.spark && u.spark.closes.length >= 8
                            ? <MiniSpark closes={u.spark.closes} w={186} h={58} />
                            : <div style={{ height: 58 }} />}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', marginTop: 9 }}>
                          <span style={{ fontSize: 13, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: P.heroDeep }}>±{u.moveMagnitude}%</span>
                          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 900, borderRadius: 99, padding: '5px 12px', background: isDone ? P.mintSoft : P.hero, color: isDone ? P.mint : '#fff' }}>
                            {isDone ? `✓ ${t.solved}` : t.play}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {[
                    { id: 'hunt', icon: 'crosshair', title: t.teaserHunt, sub: t.teaserHuntSub },
                    { id: 'sense', icon: 'updown', title: t.teaserSense, sub: t.teaserSenseSub },
                  ].map((tz) => (
                    <div key={tz.id} aria-disabled style={{ ...glass, border: '1.5px dashed rgba(108,92,231,0.35)', flex: '0 0 212px', scrollSnapAlign: 'start', borderRadius: 22, padding: '13px 13px 12px', opacity: 0.92, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 28, height: 28, borderRadius: 10, background: P.heroSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: P.heroDeep }}><Ic name={tz.icon} size={16} sw={2} /></span>
                        <span style={{ marginLeft: 'auto', fontSize: 8.5, fontWeight: 900, color: P.amber, background: P.amberSoft, borderRadius: 99, padding: '2px 8px', letterSpacing: '0.04em' }}>{t.comingSoon}</span>
                      </div>
                      <div style={{ marginTop: 12, fontSize: 14.5, fontWeight: 900, color: P.ink }}>{tz.title}</div>
                      <div style={{ marginTop: 4, fontSize: 10.5, fontWeight: 700, color: P.sub, lineHeight: 1.45 }}>{tz.sub}</div>
                      <div style={{ marginTop: 'auto', paddingTop: 10, display: 'flex', justifyContent: 'flex-end', color: P.faint }}>
                        <Ic name="lock" size={14} sw={2} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* streak + XP — single compact row (ring · this-week line · XP chip); dots/level bar live in Me */}
            <section style={{ ...glass, marginTop: 10, borderRadius: 22, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 11, animation: 'wimUp 0.35s ease' }}>
              <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
                <svg width="44" height="44" viewBox="0 0 44 44">
                  <circle cx="22" cy="22" r="17" fill="none" stroke={P.heroSoft} strokeWidth="6" />
                  <circle cx="22" cy="22" r="17" fill="none" stroke={P.amber} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 17 * Math.max(0.02, Math.min(1, streakDays / 7))} ${2 * Math.PI * 17}`} transform="rotate(-90 22 22)" />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900 }}>{streakDays}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 900 }}>{t.streakLine1} <span style={{ color: P.hero }}>{streakDays}</span>{t.streakLine2}</div>
              <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: P.heroDeep, background: P.heroSoft, borderRadius: 99, padding: '6px 11px' }}><Ic name="shield" size={13} color={P.heroDeep} /> {xp} {t.xp}</span>
            </section>

            {setDoneShown && doneCount === units.length && units.length > 0 && (
              <div style={{ ...glass, marginTop: 10, borderRadius: 20, padding: '14px 16px', textAlign: 'center', animation: 'wimUp 0.35s ease' }}>
                <div style={{ fontSize: 14.5, fontWeight: 900, color: P.mint , display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Ic name="check" size={15} color={P.mint} sw={2.4} /> {t.setDone}</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: P.sub, marginTop: 3 }}>{t.setDoneSub}</div>
              </div>
            )}
          </>
        )}

        {/* ── TAB: LIBRARY (concept shelves — real-chart sheets) ── */}
        {homeTab === 'lib' && (
          <section style={{ marginTop: 16, animation: 'wimUp 0.3s ease' }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900 , display: 'inline-flex', alignItems: 'center', gap: 7 }}><Ic name="book" size={16} color={P.heroDeep} /> {t.curriculum}</h2>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: P.sub, marginTop: 3 }}>{t.curriculumSub}</div>
            {([1, 2, 3] as const).map((depth) => {
              const terms = DEPTH_TERMS[depth];
              const label = depth === 1 ? t.depth1 : depth === 2 ? t.depth2 : t.depth3;
              const color = depth === 1 ? P.mint : depth === 2 ? P.amber : P.hero;
              const learned = terms.filter((x) => seenTerms[x]).length;
              return (
                <div key={depth} style={{ marginTop: 15 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 900, color }}>{'●'.repeat(depth)} {label}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: P.faint }}>{learned}/{terms.length} {t.learned}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 9 }}>
                    {terms.map((term) => {
                      const seen = !!seenTerms[term];
                      return (
                        <button key={term} type="button" onClick={() => markTerm(term)} style={{ ...glass, font: 'inherit', textAlign: 'left', cursor: 'pointer', borderRadius: 18, padding: '11px 12px 10px', outline: seen ? `1.5px solid ${color}55` : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.1em', color, background: `${color}1A`, borderRadius: 6, padding: '2px 7px' }}>{['I', 'II', 'III'][depth - 1]}</span>
                            {seen && <Ic name="check" size={13} color={color} sw={2.6} />}
                          </div>
                          <div style={{ margin: '8px 0 4px' }}>
                            <MiniViz term={term} lab={lab} />
                          </div>
                          <div style={{ fontSize: 11.5, fontWeight: 850 as any, lineHeight: 1.3, color: P.ink, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {METRIC_GLOSSARY[term].title[loc]}
                          </div>
                          {lab && (
                            <div style={{ marginTop: 4, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.05em', color: P.faint }}>
                              {lab.ticker} · LIVE
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ── TAB: SEARCH (indicator search → real-chart sheet) ── */}
        {homeTab === 'search' && (
          <section style={{ marginTop: 16, animation: 'wimUp 0.3s ease' }}>
            <div style={{ ...glass, display: 'flex', alignItems: 'center', gap: 9, borderRadius: 17, padding: '12px 14px' }}>
              <span style={{ color: P.faint }}><Ic name="search" size={16} /></span>
              <input
                value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder={t.searchPh}
                style={{ font: 'inherit', flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, fontWeight: 700, color: P.ink }}
              />
              {searchQ && (
                <button type="button" onClick={() => setSearchQ('')} style={{ font: 'inherit', border: 'none', background: P.heroSoft, color: P.heroDeep, borderRadius: '50%', width: 22, height: 22, fontSize: 11, fontWeight: 900, cursor: 'pointer' }}>✕</button>
              )}
            </div>
            {q === '' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 13 }}>
                {(Object.keys(METRIC_GLOSSARY) as MetricTerm[]).slice(0, 14).map((term) => (
                  <button key={term} type="button" onClick={() => markTerm(term)} style={{ ...glass, font: 'inherit', cursor: 'pointer', borderRadius: 99, padding: '8px 13px', fontSize: 11.5, fontWeight: 850 as any, color: P.ink, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {METRIC_GLOSSARY[term].title[loc]}
                    {termValue(term, lab) && <span style={{ fontSize: 10.5, fontWeight: 900, color: P.heroDeep, background: P.heroSoft, borderRadius: 99, padding: '2px 8px', fontVariantNumeric: 'tabular-nums' }}>{termValue(term, lab)}</span>}
                  </button>
                ))}
              </div>
            )}
            {q !== '' && searchResults.length === 0 && (
              <div style={{ ...glass, marginTop: 13, borderRadius: 16, padding: '16px', textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: P.sub }}>{t.noResults}</div>
            )}
            {searchResults.map((term) => (
              <button key={term} type="button" onClick={() => markTerm(term)} style={{ ...glass, font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%', marginTop: 10, borderRadius: 16, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: seenTerms[term] ? P.mint : P.faint }}><Ic name={seenTerms[term] ? 'check' : 'book'} size={16} sw={2} /></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 900 }}>{METRIC_GLOSSARY[term].title[loc]}</div>
                  <div style={{ fontSize: 11, fontWeight: 650 as any, color: P.sub, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{METRIC_GLOSSARY[term].body[loc]}</div>
                </div>
                <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {termValue(term, lab) && <span style={{ fontSize: 11, fontWeight: 900, color: P.heroDeep, background: P.heroSoft, borderRadius: 99, padding: '3px 9px', fontVariantNumeric: 'tabular-nums' }}>{termValue(term, lab)}</span>}
                  <span style={{ color: P.hero, fontWeight: 900 }}>›</span>
                </span>
              </button>
            ))}
          </section>
        )}

        {/* ── TAB: ME (case record) ── */}
        {homeTab === 'me' && (
          <section style={{ marginTop: 16, animation: 'wimUp 0.3s ease' }}>
            <div style={{ ...glassDark, borderRadius: 24, padding: '16px 15px', color: '#fff' }}>
              <StreakRing days={streakDays} t={t} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                {weekLabels.map((d, i) => {
                  const on = week[i]; const isToday = i === weekdayIdx();
                  return (
                    <div key={i} style={{ textAlign: 'center' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: on ? '#fff' : 'rgba(255,255,255,0.14)', border: isToday && !on ? '2px solid rgba(255,255,255,0.7)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: on ? P.hero : 'rgba(255,255,255,0.7)' }}>{on ? '✓' : ''}</div>
                      <div style={{ fontSize: 8.5, fontWeight: 800, opacity: 0.75, marginTop: 3 }}>{d}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <h2 style={{ margin: '16px 0 0', fontSize: 15.5, fontWeight: 900 , display: 'inline-flex', alignItems: 'center', gap: 7 }}><Ic name="folder" size={15} color={P.heroDeep} /> {t.myStats}</h2>
            <div style={{ display: 'flex', gap: 9, marginTop: 10 }}>
              {[
                { n: solvedCount, label: t.statSolved, icon: 'folder' },
                { n: correctToday, label: t.statCorrect, icon: 'target' },
                { n: termsCount, label: t.statTerms, icon: 'book' },
              ].map((s) => (
                <div key={s.label} style={{ ...glass, flex: 1, borderRadius: 18, padding: '13px 8px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', color: P.hero }}><Ic name={s.icon} size={16} /></div>
                  <div style={{ fontSize: 21, fontWeight: 900, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{s.n}</div>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: P.sub, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ ...glass, marginTop: 12, borderRadius: 18, padding: '13px 15px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <span style={{ fontSize: 12.5, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Ic name="shield" size={14} color={P.hero} /> {levelNames[levelIdx]}</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: P.faint }}>{t.level} {levelIdx + 1}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 900, color: P.hero }}>{xp} {t.xp}</span>
              </div>
              <div style={{ marginTop: 8, height: 9, background: 'rgba(108,92,231,0.14)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${levelPct * 100}%`, height: '100%', background: `linear-gradient(90deg, ${P.amber}, ${P.coral})`, borderRadius: 99 }} />
              </div>
              <div style={{ marginTop: 5, fontSize: 10, fontWeight: 700, color: P.faint }}>{XP_PER_LEVEL - (xp % XP_PER_LEVEL)} {t.xp} {t.toNext}</div>
            </div>

            {units.some((u) => done[u.id]) && (
              <>
                <h2 style={{ margin: '16px 0 0', fontSize: 15.5, fontWeight: 900 , display: 'inline-flex', alignItems: 'center', gap: 7 }}><Ic name="clock" size={15} color={P.heroDeep} /> {t.todayRecord}</h2>
                {units.filter((u) => done[u.id]).map((u) => {
                  const ok = u.correctCategoryIds.includes(done[u.id]);
                  return (
                    <div key={u.id} style={{ ...glass, marginTop: 9, borderRadius: 16, padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <TickerLogo ticker={u.ticker} size={26} />
                      <span style={{ fontSize: 13, fontWeight: 900 }}>{u.ticker}</span>
                      <span style={{ fontSize: 11, fontWeight: 750 as any, color: P.sub }}>±{u.moveMagnitude}%</span>
                      <span style={{ marginLeft: 'auto', color: ok ? P.mint : P.coral }}><Ic name={ok ? 'check' : 'close'} size={15} sw={2.4} /></span>
                    </div>
                  );
                })}
              </>
            )}
          </section>
        )}

        <footer style={{ marginTop: 24, textAlign: 'center', fontSize: 10, color: P.faint, fontWeight: 600, lineHeight: 1.6 }}>
          {units[0]?.disclaimer?.[loc] || (loc === 'ko' ? '교육용 시장 정보입니다. 투자 조언이 아니며 정확성을 보장하지 않습니다.' : loc === 'ja' ? '教育目的の市場情報です。投資助言ではなく、正確性は保証されません。' : 'Educational market information only. Not investment advice; accuracy not guaranteed.')}
          <div style={{ marginTop: 4, opacity: 0.8 }}>Why&apos;d It Move? · prototype · by SIGNUM HQ</div>
        </footer>
      </div>

      {/* ① bottom banner ad slot — inert until WIM_ADS_LIVE (sits above the tab bar) */}
      {WIM_ADS_LIVE && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(84px + env(safe-area-inset-bottom))', height: 56, background: 'rgba(255,255,255,0.9)', borderTop: `1px solid ${P.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: P.faint, zIndex: 49 }}>
          {t.adBanner}
        </div>
      )}

      {/* glass bottom tab bar */}
      <nav style={{ position: 'fixed', left: 14, right: 14, bottom: 'calc(14px + env(safe-area-inset-bottom))', zIndex: 50, maxWidth: 532, margin: '0 auto', background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.9)', borderRadius: 24, boxShadow: '0 14px 36px rgba(76,63,175,0.22)', display: 'flex', padding: 6 }}>
        {([
          { id: 'home', icon: 'folder', label: t.tabHome },
          { id: 'lib', icon: 'book', label: t.tabLib },
          { id: 'search', icon: 'search', label: t.tabSearch },
          { id: 'me', icon: 'badge', label: t.tabMe },
        ] as const).map((tb) => {
          const active = homeTab === tb.id;
          return (
            <button key={tb.id} type="button" onClick={() => { setHomeTab(tb.id); window.scrollTo(0, 0); }} style={{
              font: 'inherit', flex: 1, border: 'none', cursor: 'pointer', borderRadius: 18, padding: '9px 0 8px',
              background: active ? `linear-gradient(150deg, ${P.hero}, ${P.heroDeep})` : 'transparent',
              color: active ? '#fff' : P.sub, transition: 'background 0.2s ease',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
              <Ic name={tb.icon} size={18} color={active ? '#fff' : P.sub} sw={active ? 2 : 1.7} />
              <span style={{ fontSize: 9.5, fontWeight: 900 }}>{tb.label}</span>
            </button>
          );
        })}
      </nav>

      {/* settings sheet — language lives here now */}
      {settingsOpen && (
        <div onClick={() => setSettingsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(38,34,64,0.45)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, margin: '0 auto', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderRadius: '24px 24px 0 0', padding: '20px 20px calc(26px + env(safe-area-inset-bottom))', animation: 'wimUp 0.25s ease' }}>
            <div style={{ fontSize: 16, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 7 }}><Ic name="gear" size={16} sw={1.5} /> {t.settings}</div>
            <div style={{ marginTop: 14, fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', color: P.faint }}>{t.language.toUpperCase()}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {([['en', 'English'], ['ja', '日本語'], ['ko', '한국어']] as const).map(([code, name]) => (
                <button key={code} type="button" onClick={() => { setSettingsOpen(false); if (code !== loc) router.replace(`/${code}/wim`); }} style={{
                  font: 'inherit', flex: 1, cursor: 'pointer', borderRadius: 14, padding: '11px 0', fontSize: 12.5, fontWeight: 900,
                  border: `1.5px solid ${code === loc ? P.hero : P.line}`,
                  background: code === loc ? P.hero : '#fff', color: code === loc ? '#fff' : P.ink,
                }}>{name}</button>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 10, color: P.faint, fontWeight: 600, lineHeight: 1.6 }}>
              {loc === 'ko' ? '교육용 시장 정보입니다. 투자 조언이 아니며 정확성을 보장하지 않습니다.' : loc === 'ja' ? '教育目的の市場情報です。投資助言ではなく、正確性は保証されません。' : 'Educational market information only. Not investment advice; accuracy not guaranteed.'}
            </div>
            <button type="button" onClick={() => setSettingsOpen(false)} style={{ font: 'inherit', width: '100%', marginTop: 14, background: P.heroSoft, color: P.heroDeep, border: 'none', borderRadius: 14, padding: '12px 0', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>{t.close}</button>
          </div>
        </div>
      )}

      {/* glossary bottom sheet — concept ON today's real chart */}
      {glossOpen && <GlossarySheet term={glossOpen} lab={lab} loc={loc} t={t} onClose={() => setGlossOpen(null)} />}
    </div>
  );
}
