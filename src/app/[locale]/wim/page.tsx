'use client';

// ============================================================================
// WIM — "Why'd It Move?"  (spin-off #3 web prototype)
// ----------------------------------------------------------------------------
// A 30-second daily habit: today's REAL movers become a cause-and-effect quiz.
// Beginner → institutional depth ladder, streak/XP lock-in, 3-language.
//
// IDENTITY (deliberately unlike SIGNUM's dark terminal and UC's cream
// editorial): bright violet playground — soft lavender paper, bouncy rounded
// cards, and a quiet correct-answer burst (no mascot, no confetti — W5-A).
//
// ADS (structure now, inert until WIM_ADS_LIVE): ① bottom banner slot,
// ② interstitial after finishing the daily set, ③ rewarded gate on the
// institutional deep layer. Flag off → zero ad code paths execute.
//
// COMPLIANCE (hard): observer tone, cause-only questions, NO direction
// arrows/colors on the mover card, streak counts learning DAYS. Educational
// disclaimer everywhere. No prediction mechanics.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-8.4 6h16.8M3.6 15h16.8M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9Z',
  // ── premium tab/system glyphs (2026-07-20 icon pass — label-true semantics) ──
  home: 'M4.5 11 12 4.6 19.5 11M6.3 9.6v9a1.4 1.4 0 0 0 1.4 1.4h8.6a1.4 1.4 0 0 0 1.4-1.4v-9M10.2 20v-4.7a1.8 1.8 0 0 1 3.6 0V20',
  book2: 'M12 6.6C10.6 5.1 8.6 4.3 5.6 4.3c-.9 0-1.6.6-1.6 1.4v11.4c0 .8.7 1.4 1.6 1.4 3 0 5 .8 6.4 2.3 1.4-1.5 3.4-2.3 6.4-2.3.9 0 1.6-.6 1.6-1.4V5.7c0-.8-.7-1.4-1.6-1.4-3 0-5 .8-6.4 2.3Zm0 0v14.2',
  journal: 'M6.5 3.5h11A1.5 1.5 0 0 1 19 5v14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5ZM8.6 3.5v17M11.4 14.6l2-2.6 1.7 1.4 2.3-3',
  tune: 'M4 7h6.5M13.5 7H20M4 12h4.5M11.5 12H20M4 17h8.5M15.5 17H20M12 5.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6ZM10 10.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6ZM14 15.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z',
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
  chevUp: 'M5.5 14.5 12 8l6.5 6.5',
  chevDown: 'M5.5 9.5 12 16l6.5-6.5',
  replay: 'M6.5 5.5v13M18 5.5 9.5 12l8.5 6.5v-13Z',
  pause: 'M8.5 5.5v13M15.5 5.5v13',
  chain: 'M9.5 14.5 14.5 9.5M8.5 11.5l-2.3 2.3a3.8 3.8 0 0 0 5.4 5.4l2.3-2.3M15.5 12.5l2.3-2.3a3.8 3.8 0 0 0-5.4-5.4l-2.3 2.3',
  flag: 'M6.5 21V3.5M6.5 4.5H17l-2.4 3.2L17 10.9H6.5',
  snow: 'M12 3v18M9.6 4.6 12 6.2l2.4-1.6M9.6 19.4 12 17.8l2.4 1.6M4.2 7.5l15.6 9M19.8 7.5l-15.6 9',
  share: 'M12 14V3M8.5 6.5 12 3l3.5 3.5M7 10.5H5.5A1.5 1.5 0 0 0 4 12v7.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V12a1.5 1.5 0 0 0-1.5-1.5H17',
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
    teaserHunt: '레벨 헌트', teaserHuntSub: '실제 차트 위에서 기관 레벨 찾기',
    teaserSense: '숫자 감각', teaserSenseSub: '오늘 지표, 위였을까 아래였을까',
    sessionPre: '프리', sessionReg: '본장', sessionPost: '애프터',
    newPlay: '신규', nextRound: '다음 라운드', seeResults: '결과 보기',
    noData: '오늘은 이 데이터가 없어요', noDataSub: '다음 장이 끝나면 다시 열어봐요',
    unlockToast: '차트에 새 층이 열렸어요 — 맥스페인',
    huntPromptMaxPain: '이 종목의 맥스페인(옵션 자석 가격)은 어디일까?',
    huntPromptCallWall: '콜월(콜이 가장 쌓인 천장)은 어디였을까?',
    huntPromptPutFloor: '풋플로어(풋이 가장 쌓인 바닥)는 어디였을까?',
    huntMeanMaxPain: '맥스페인은 옵션 보유자 전체의 손실이 가장 커지는 가격 — 만기 근처에서 가격이 이 부근을 맴도는 모습이 자주 관찰돼요.',
    huntMeanCallWall: '콜월은 콜 옵션이 가장 많이 쌓인 행사가 — 그 근처에서 위쪽 움직임이 무거워지는 모습이 관찰되곤 해요.',
    huntMeanPutFloor: '풋플로어는 풋 옵션이 가장 많이 쌓인 행사가 — 아래에서 받침대처럼 작동하는 모습이 관찰되곤 해요.',
    huntDragHint: '차트를 위아래로 드래그해 선을 놓아보세요',
    huntConfirm: '이 위치로 확정',
    huntGreat: '대박! 거의 정확해요', huntNear: '좋아요, 꽤 가까웠어요', huntMiss: '괜찮아요 — 이제 이 레벨이 보여요',
    huntDiff: '차이', huntSummary: '레벨 헌트 결과', yourLine: '내 선',
    senseQDark: '{t} 다크풀 비중은 50%보다 높았을까?',
    senseQPcr: '{t} 풋/콜 비율은 1.0보다 높았을까?',
    senseQShort: '{t} 숏볼륨 비중은 40%보다 높았을까?',
    senseQVol: '{t} 변동성 레짐 점수는 50보다 높았을까?',
    senseQSma: '{t} 마지막 종가는 50일 평균선보다 위였을까?',
    senseMeanDark: '다크풀은 거래소 밖에서 조용히 체결된 물량 — 보통 30~50% 사이를 오가요.',
    senseMeanPcr: '풋/콜 비율이 1.0을 넘으면 콜보다 풋 쪽에 더 많은 포지션이 쌓였다는 뜻이에요.',
    senseMeanShort: '숏볼륨은 당일 거래 중 쇼트(빌려서 파는 거래)로 체결된 비중 — 40%대가 흔한 수준이에요.',
    senseMeanVol: '변동성 레짐 점수는 지금 변동성이 역사적으로 어느 위치인지 0~100으로 보여줘요.',
    senseMeanSma: '50일 평균선은 최근 두 달여의 평균 가격 — 종가가 그 위였는지가 추세의 온도계처럼 읽혀요.',
    senseHigher: '높다', senseLower: '낮다', senseActual: '실제 값', senseVs: '기준',
    senseSummary: '숫자 감각 결과', senseBonus: '전부 정답! 보너스',
    loadingData: '실데이터 불러오는 중',
    teaserReplay: '리플레이 미스터리', teaserReplaySub: '오늘 세션을 되감아 단서 찾기',
    replayHint: '차트가 스스로 그려져요 — 멈추면 질문에 답하세요',
    replayCheckpoint: '체크포인트',
    replayQMove: '방금 무슨 일이 일어났나요?',
    replayOptDown: '급락이 나왔다', replayOptUp: '급등이 나왔다', replayOptFlat: '거의 안 움직였다',
    replayFactMove: '이 5분봉의 변화: {v}%',
    replayQVwap: '이 시점 가격은 VWAP(평균 체결가) 대비 어디였나요?',
    replayOptAbove: 'VWAP 위', replayOptBelow: 'VWAP 아래',
    replayFactVwap: '가격 ${p} · VWAP ${v}',
    replayQDay: '오늘 이 종목의 하루를 한 줄로 하면?',
    replayOptDayUp: '크게 오른 날', replayOptDayDown: '크게 내린 날', replayOptDayQuiet: '조용한 날',
    replayFactDay: '첫 봉 대비 마지막 봉: {v}%',
    replayContinue: '이어서 재생',
    replayFinale: '사건의 전말', replayOpenQuiz: '전체 수사 열기',
    replayPause: '일시정지', replayResume: '재생',
    almanacTitle: '개념 도감', almanacSub: '개념을 맞힌 날의 실제 차트가 카드로 남아요',
    almanacToast: '도감에 새 카드 — {n}',
    teaserDomino: '거시 도미노', teaserDominoSub: '오늘의 금리에서 섹터까지, 파급의 사슬',
    dominoHeader: '오늘의 거시 이벤트',
    dominoChainTitle: '파급 도미노', dominoChainSub: '도미노를 하나씩 탭해 사슬을 열어보세요',
    dominoTapOpen: '탭해서 열기', dominoNext: '다음 도미노',
    dominoN1: '기준금리 → 국채금리', dominoN2: '국채금리 → 달러·할인율',
    dominoN3: '할인율 → 성장주 밸류에이션', dominoN4: '섹터 로테이션',
    dominoQ1: '중앙은행이 기준금리를 올리면, 새로 발행되는 국채의 금리는 통상?',
    dominoQ1a: '높아진다', dominoQ1b: '낮아진다',
    dominoM1: '기준금리는 모든 금리의 출발점 — 정책 금리가 움직이면 국채 금리도 같은 방향을 따라가는 경향이 있어요.',
    dominoQ2: '국채 금리가 오르면, 미래 이익의 현재가치는?',
    dominoQ2a: '커진다', dominoQ2b: '작아진다',
    dominoM2: '금리는 미래의 돈을 오늘 가치로 바꾸는 할인율이에요 — 금리가 높을수록 같은 미래 이익의 오늘 가치는 작게 계산되고, 높은 금리가 달러 자산의 매력을 키우는 모습도 과거에 자주 관찰됐어요.',
    dominoQ3: '이익 대부분이 먼 미래에 있는 성장주와 당장 이익을 내는 가치주, 할인율 상승에 통상 더 민감했던 쪽은?',
    dominoQ3a: '성장주', dominoQ3b: '가치주',
    dominoM3: '금리가 오르면 먼 미래 이익의 현재가치가 더 크게 줄어들어, 성장주 밸류에이션 부담이 커지는 경향이 있어요.',
    dominoQ4: '금리가 오르던 시기, 예대마진 확대의 덕을 보는 경향이 관찰된 섹터는?',
    dominoQ4a: '은행', dominoQ4b: '유틸리티',
    dominoM4: '같은 금리 움직임도 섹터마다 다르게 스며들어요 — 과거에는 은행 등 금융이 상대적으로 견디고, 배당 중심의 유틸리티는 채권과 경쟁하며 무거워지는 경향이 관찰됐어요. 이런 돈의 이동을 섹터 로테이션이라 불러요.',
    dominoHoldProb: '동결 확률', dominoHikeProb: '인상 확률', dominoNextFomc: '다음 FOMC',
    dominoEstimate: '예상', dominoPrevious: '이전',
    dominoFinale: '사슬 완성', dominoRecap: '오늘의 숫자',
    reviewChip: '복습',
    drillFocus: '집중 드릴',
    drillFocusSub: '같은 지표 · 다른 종목',
    senseChart: '오늘 실제 세션',
    senseHint: '이 지표란?',
    trackLiveTitle: '오늘의 실측',
    calTitle: '직감 정확도',
    calSub: '최근 30일 · {a}번의 판단 중 {b}번 적중',
    calEmpty: '다섯 번 이상 풀면 나의 정확도 곡선이 열려요',
    statLine: '학습자 {p}%가 맞혔어요',
    statEarly: '이른 풀이 — 오늘 {n}번째예요',
    liveNow: '지금',
    weekendTitle: '주말 리뷰', weekendSub: '이번 주 마지막 세션을 다시 보고, 배운 개념을 복습하세요',
    unlockDramaLabel: '새 층 해제',
    beltTitle: '벨트 지도', beltSub: '계급이 오를수록 차트에 보이는 층이 늘어요',
    beltNow: '현재',
    beltUnlockBase: '오늘의 사건 + 플레이 4종',
    beltUnlockLevels: '맥스페인 오버레이 — 헌트 완주로 해제',
    beltSoon: '새 층 · 곧',
    freezeToast: '스트릭 프리즈가 하루를 지켜줬어요 (남은 프리즈 {n})',
    freezeLabel: '스트릭 프리즈',
    share: '공유',
    shareFooter: '오늘 시장으로 배우는 30초',
    ob1: '매일 밤, 오늘 시장이 문제를 냅니다',
    ob2: '차트를 만지며 단서를 찾으세요',
    ob3: '배울수록 차트에 층이 열립니다',
    obNext: '다음', obStart: '시작하기', obSkip: '건너뛰기',
    pulse10Y: '미 10년물', pulseHold: 'FOMC 동결확률', pulseFomc: '다음 FOMC', pulseMover: '오늘의 무버',
    heroEyebrow: '오늘의 무브',
    heroHeadline: '{c}, 오늘 ±{v}% 움직임',
    resumeTitle: '이어서 학습',
    resumeLine: '오늘의 문제 {a}/{b} — 이어서 풀기',
    tracksTitle: '커리큘럼 트랙', tracksSub: '네 갈래 길로 배우는 오늘의 시장',
    track1: '차트 읽기', track2: '기관의 흔적', track3: '거시의 흐름', track4: '뉴스 읽는 법',
    trackDiff1: '입문~중급', trackDiff2: '중급~고급', trackDiff3: '입문~고급', trackDiff4: '입문',
    trackNew: '새 트랙',
    trackNext1: '다음: 리플레이로 오늘 세션 되감기',
    trackNext2: '다음: 레벨 헌트로 맥스페인 찾기',
    trackNext3: '다음: 오늘의 금리 도미노 완성하기',
    trackNext4: '다음: 오늘 헤드라인의 진짜 원인 찾기',
    dailyRail: '오늘의 데이터로 배우기', dailyRailSub: '방금 끝난 세션이 오늘의 교재예요',
    conceptOfDay: '오늘의 개념',
    collectionLabel: '컬렉션',
    colTitle1: '옵션 구조 3종 세트', colSub1: '맥스페인 · 콜월 · 풋플로어',
    colTitle2: '군중 심리 읽기', colSub2: '풋/콜 · 다크풀 · 숏볼륨',
    colTitle3: '금리의 파급 사슬', colSub3: '10년물에서 섹터까지',
    colOpen: '열어보기',
    dictRowSub: '{n}개 용어, 전부 실데이터로 배워요',
    newsDaily: '오늘의 뉴스 수업',
    newsStep1: '헤드라인이 말하는 것',
    newsStep2: '돈이 말한 것',
    newsStep3: '오늘의 질문',
    newsQuiet: '이날 옵션·다크풀 데이터가 조용했어요 — 뉴스가 늘 돈을 움직이는 건 아니에요',
    newsQuietSub: '그 자체가 오늘의 수업이에요',
    newsQTone: '헤드라인의 톤과 돈의 방향이 같았나요?',
    newsQToneA: '같았다', newsQToneB: '달랐다',
    newsToneReveal: '헤드라인 톤과 돈의 방향이 같은 날도, 갈라지는 날도 있어요 — 갈라진 날이야말로 뉴스만 읽어서는 안 보이던 부분이에요.',
    newsQFact: "헤드라인은 '사실'과 '해석' 중 무엇이 더 많았나요?",
    newsQFactA: '사실이 많았다', newsQFactB: '해석이 많았다',
    newsFactReveal: '정답이 없는 질문이에요 — 헤드라인을 사실(일어난 일)과 해석(누군가의 판단)으로 갈라 읽는 습관 자체가 뉴스 읽기의 핵심이에요.',
    tonePos: '긍정 쪽', toneNeg: '부정 쪽', toneFlat: '중립',
    moodBull: '낙관 쪽', moodCaut: '신중 쪽', moodFlat: '중립',
    toneLabel: '헤드라인 톤', moodLabel: '돈의 방향',
    trackNextLabel: '다음 한 걸음',
    trackTermsTitle: '트랙 용어',
    trackTermsSoon: '용어는 곧 추가돼요',
    trackCta1: '리플레이로 오늘 세션 되감기',
    trackCta2: '레벨 헌트로 맥스페인 찾기',
    trackCta3: '오늘의 금리 도미노 완성하기',
    trackCta4: '오늘 헤드라인의 진짜 원인 찾기',
    trackDesc1: '캔들·거래량·VWAP — 차트의 기본 신호를 읽는 길',
    trackDesc2: '다크풀·옵션 구조 — 기관이 남긴 발자국을 따라가는 길',
    trackDesc3: '금리에서 섹터까지 — 시장 전체를 움직이는 큰 물줄기',
    trackDesc4: '헤드라인과 돈의 실제 반응을 나란히 놓고 읽는 길',
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
    teaserHunt: 'Level Hunt', teaserHuntSub: 'Spot the institutional levels on a real chart',
    teaserSense: 'Number Sense', teaserSenseSub: "Was today's reading higher or lower?",
    sessionPre: 'PRE', sessionReg: 'REG', sessionPost: 'POST',
    newPlay: 'NEW', nextRound: 'Next round', seeResults: 'See results',
    noData: 'No data for this today', noDataSub: 'Check back after the next session',
    unlockToast: 'A new layer opened on your chart — max pain',
    huntPromptMaxPain: 'Where did max pain (the options magnet price) sit?',
    huntPromptCallWall: 'Where was the call wall (the heaviest call strike)?',
    huntPromptPutFloor: 'Where was the put floor (the heaviest put strike)?',
    huntMeanMaxPain: 'Max pain is the price where option holders as a group lose the most — price has often been observed hovering near it into expiry.',
    huntMeanCallWall: 'The call wall is the strike with the heaviest call stack — upward moves have often looked heavy around it.',
    huntMeanPutFloor: 'The put floor is the strike with the heaviest put stack — it has often looked like a shelf underneath price.',
    huntDragHint: 'Drag up or down to place your line',
    huntConfirm: 'Lock it in',
    huntGreat: 'Bullseye — nearly exact!', huntNear: 'Nice — pretty close', huntMiss: 'No worries — now you can see this level',
    huntDiff: 'off by', huntSummary: 'Level Hunt results', yourLine: 'Your line',
    senseQDark: "Was {t}'s dark-pool share above 50%?",
    senseQPcr: "Was {t}'s put/call ratio above 1.0?",
    senseQShort: "Was {t}'s short-volume share above 40%?",
    senseQVol: "Was {t}'s volatility-regime score above 50?",
    senseQSma: "Did {t}'s last close finish above its 50-day average?",
    senseMeanDark: 'Dark pool is volume matched away from the exchange — it usually swings between 30 and 50%.',
    senseMeanPcr: 'A put/call ratio above 1.0 means more positioning stacked into puts than calls.',
    senseMeanShort: "Short volume is the share of the day's trades done as short sales — the 40s are a common zone.",
    senseMeanVol: 'The volatility-regime score places current volatility on a 0-100 historical scale.',
    senseMeanSma: 'The 50-day average is roughly two months of prices — whether the close sat above it reads like a trend thermometer.',
    senseHigher: 'Higher', senseLower: 'Lower', senseActual: 'Actual', senseVs: 'vs',
    senseSummary: 'Number Sense results', senseBonus: 'Perfect run! Bonus',
    loadingData: 'Loading real data',
    teaserReplay: 'Replay Mystery', teaserReplaySub: 'Rewind the session, read the clues',
    replayHint: 'The chart draws itself — answer when it pauses',
    replayCheckpoint: 'Checkpoint',
    replayQMove: 'What just happened?',
    replayOptDown: 'A sharp drop printed', replayOptUp: 'A sharp pop printed', replayOptFlat: 'Barely moved',
    replayFactMove: 'That 5-min bar: {v}%',
    replayQVwap: 'Where was price versus VWAP (average traded price) here?',
    replayOptAbove: 'Above VWAP', replayOptBelow: 'Below VWAP',
    replayFactVwap: 'Price ${p} · VWAP ${v}',
    replayQDay: "This ticker's day in one line?",
    replayOptDayUp: 'A big up day', replayOptDayDown: 'A big down day', replayOptDayQuiet: 'A quiet day',
    replayFactDay: 'First bar to last: {v}%',
    replayContinue: 'Resume replay',
    replayFinale: 'The full story', replayOpenQuiz: 'Open the full case',
    replayPause: 'Pause', replayResume: 'Play',
    almanacTitle: 'Concept Almanac', almanacSub: "Each concept you nail is saved with that day's real chart",
    almanacToast: 'New almanac card — {n}',
    teaserDomino: 'Macro Domino', teaserDominoSub: 'From rates to sectors — the ripple chain',
    dominoHeader: "Today's macro event",
    dominoChainTitle: 'The domino chain', dominoChainSub: 'Tap each domino to open the chain',
    dominoTapOpen: 'Tap to open', dominoNext: 'Next domino',
    dominoN1: 'Policy rate → Treasury yields', dominoN2: 'Yields → Dollar & discount rate',
    dominoN3: 'Discount rate → Growth valuations', dominoN4: 'Sector rotation',
    dominoQ1: 'When the central bank raises its policy rate, yields on newly issued Treasuries usually…',
    dominoQ1a: 'Move higher', dominoQ1b: 'Move lower',
    dominoM1: 'The policy rate is the anchor for every other rate — Treasury yields have tended to follow its direction.',
    dominoQ2: 'When Treasury yields rise, the present value of future profits…',
    dominoQ2a: 'Gets larger', dominoQ2b: 'Gets smaller',
    dominoM2: "A yield works as the discount rate that turns future money into today's value — the higher it is, the smaller the same future profit is worth today. Higher yields have also often coincided with a firmer dollar.",
    dominoQ3: 'Growth stocks (profits far in the future) vs value stocks (profits now) — which has usually been more sensitive to a rising discount rate?',
    dominoQ3a: 'Growth', dominoQ3b: 'Value',
    dominoM3: 'When rates rise, far-future profits lose more of their present value — growth valuations have tended to feel it first.',
    dominoQ4: 'In past rising-rate stretches, which sector has tended to benefit from wider lending margins?',
    dominoQ4a: 'Banks', dominoQ4b: 'Utilities',
    dominoM4: 'The same rate move lands differently across sectors — banks have often held up while dividend-heavy utilities competed with bonds. Money shifting between sectors like this is called sector rotation.',
    dominoHoldProb: 'Hold odds', dominoHikeProb: 'Hike odds', dominoNextFomc: 'Next FOMC',
    dominoEstimate: 'Est.', dominoPrevious: 'Prev.',
    dominoFinale: 'Chain complete', dominoRecap: "Today's numbers",
    reviewChip: 'Review',
    drillFocus: 'Focus drill',
    drillFocusSub: 'Same metric · new tickers',
    senseChart: "Today's real session",
    senseHint: 'What is this metric?',
    trackLiveTitle: 'Today, measured',
    calTitle: 'Gut accuracy',
    calSub: 'Last 30 days · {b} of {a} calls landed',
    calEmpty: 'Answer five or more to unlock your accuracy curve',
    statLine: '{p}% of learners got this one',
    statEarly: 'Early solve — #{n} today',
    liveNow: 'Now',
    weekendTitle: 'Weekend review', weekendSub: "Rewind the week's last session and revisit what you learned",
    unlockDramaLabel: 'New layer unlocked',
    beltTitle: 'Belt map', beltSub: 'Higher ranks open more layers on your chart',
    beltNow: 'NOW',
    beltUnlockBase: 'Daily case + 4 plays',
    beltUnlockLevels: 'Max-pain overlay — unlocked via Level Hunt',
    beltSoon: 'New layer · soon',
    freezeToast: 'A Streak Freeze protected your day ({n} left)',
    freezeLabel: 'Streak Freeze',
    share: 'Share',
    shareFooter: "30 seconds of learning from today's market",
    ob1: "Every night, today's market writes the questions",
    ob2: 'Touch the chart, find the clues',
    ob3: 'The more you learn, the more layers open on your chart',
    obNext: 'Next', obStart: 'Start', obSkip: 'Skip',
    pulse10Y: 'US 10Y', pulseHold: 'FOMC hold odds', pulseFomc: 'Next FOMC', pulseMover: "Today's mover",
    heroEyebrow: "Today's move",
    heroHeadline: '{c}: a ±{v}% day',
    resumeTitle: 'Continue learning',
    resumeLine: "Today's set {a}/{b} — pick it back up",
    tracksTitle: 'Learning tracks', tracksSub: "Four paths into today's market",
    track1: 'Chart Reading', track2: 'Institutional Footprints', track3: 'Macro Currents', track4: 'Reading the News',
    trackDiff1: 'Intro–Mid', trackDiff2: 'Mid–Advanced', trackDiff3: 'Intro–Advanced', trackDiff4: 'Intro',
    trackNew: 'New track',
    trackNext1: "Next: rewind today's session in Replay",
    trackNext2: 'Next: hunt down max pain in Level Hunt',
    trackNext3: "Next: complete today's rate domino",
    trackNext4: "Next: find what really moved today's headline",
    dailyRail: "Learn from today's data", dailyRailSub: 'The session that just ended is the textbook',
    conceptOfDay: 'Concept of the day',
    collectionLabel: 'Collection',
    colTitle1: 'The options structure trio', colSub1: 'Max pain · call wall · put floor',
    colTitle2: 'Reading the crowd', colSub2: 'Put/call · dark pool · short volume',
    colTitle3: 'The rate ripple chain', colSub3: 'From the 10-year to sectors',
    colOpen: 'Open it',
    dictRowSub: '{n} terms, each shown on real data',
    newsDaily: "Today's news lesson",
    newsStep1: 'What the headline said',
    newsStep2: 'What the money said',
    newsStep3: "Today's question",
    newsQuiet: 'Options and dark-pool data stayed quiet that day — news does not always move the money',
    newsQuietSub: "That itself is today's lesson",
    newsQTone: "Did the headline's tone and the money's direction line up?",
    newsQToneA: 'They lined up', newsQToneB: 'They split',
    newsToneReveal: 'Some days tone and money point the same way, some days they split — the split days are exactly what headlines alone never showed.',
    newsQFact: 'Was the headline mostly facts, or mostly interpretation?',
    newsQFactA: 'Mostly facts', newsQFactB: 'Mostly interpretation',
    newsFactReveal: "No wrong answer here — the habit of splitting a headline into facts (what happened) and interpretation (someone's judgment) is the core of reading news.",
    tonePos: 'Leaned positive', toneNeg: 'Leaned negative', toneFlat: 'Neutral',
    moodBull: 'Leaned upbeat', moodCaut: 'Leaned cautious', moodFlat: 'Neutral',
    toneLabel: 'Headline tone', moodLabel: "Money's direction",
    trackNextLabel: 'Next step',
    trackTermsTitle: 'Track terms',
    trackTermsSoon: 'Terms are coming soon',
    trackCta1: "Rewind today's session in Replay",
    trackCta2: 'Hunt down max pain in Level Hunt',
    trackCta3: "Complete today's rate domino",
    trackCta4: "Find what really moved today's headline",
    trackDesc1: 'Candles, volume, VWAP — reading the basic signals on a chart',
    trackDesc2: 'Dark pools and options structure — following the footprints institutions leave',
    trackDesc3: 'From rates to sectors — the big currents that move the whole market',
    trackDesc4: "Headlines read side by side with the money's actual reaction",
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
    teaserHunt: 'レベルハント', teaserHuntSub: '実チャートの上で機関レベルを探す',
    teaserSense: '数字感覚', teaserSenseSub: '今日の指標、上だった？下だった？',
    sessionPre: 'プレ', sessionReg: 'ザラ場', sessionPost: 'アフター',
    newPlay: '新着', nextRound: '次のラウンド', seeResults: '結果を見る',
    noData: '今日はこのデータがありません', noDataSub: '次のセッション後にまた開いてみて',
    unlockToast: 'チャートに新しいレイヤーが開いた — マックスペイン',
    huntPromptMaxPain: 'マックスペイン（オプションの磁石価格）はどこだった？',
    huntPromptCallWall: 'コールウォール（コールが最も積まれた壁）はどこだった？',
    huntPromptPutFloor: 'プットフロア（プットが最も積まれた床）はどこだった？',
    huntMeanMaxPain: 'マックスペインはオプション保有者全体の損失が最大になる価格 — 満期前に価格がこの付近に寄る様子がよく観察されます。',
    huntMeanCallWall: 'コールウォールはコールが最も積み上がった行使価格 — その付近で上値が重くなる様子が観察されがちです。',
    huntMeanPutFloor: 'プットフロアはプットが最も積み上がった行使価格 — 下から棚のように支える様子が観察されがちです。',
    huntDragHint: '上下にドラッグして線を置こう',
    huntConfirm: 'ここで確定',
    huntGreat: 'お見事！ほぼ的中', huntNear: 'いいね、かなり近い', huntMiss: '大丈夫 — これでこのレベルが見えました',
    huntDiff: 'ズレ', huntSummary: 'レベルハント結果', yourLine: '自分の線',
    senseQDark: '{t}のダークプール比率は50%より上だった？',
    senseQPcr: '{t}のプット/コール比は1.0より上だった？',
    senseQShort: '{t}のショート出来高比率は40%より上だった？',
    senseQVol: '{t}のボラ・レジームスコアは50より上だった？',
    senseQSma: '{t}の直近終値は50日平均線より上だった？',
    senseMeanDark: 'ダークプールは取引所の外で静かに約定した出来高 — 普段は30〜50%の間を行き来します。',
    senseMeanPcr: 'プット/コール比が1.0を超えると、コールよりプットに多くのポジションが積まれたという意味です。',
    senseMeanShort: 'ショート出来高はその日の取引のうち空売りの割合 — 40%台がよくある水準です。',
    senseMeanVol: 'ボラ・レジームスコアは現在の変動率が歴史的にどの位置かを0〜100で示します。',
    senseMeanSma: '50日平均線は約2か月の平均価格 — 終値がその上だったかがトレンドの温度計のように読まれます。',
    senseHigher: '上', senseLower: '下', senseActual: '実際の値', senseVs: '基準',
    senseSummary: '数字感覚結果', senseBonus: '全問正解！ボーナス',
    loadingData: '実データを読み込み中',
    teaserReplay: 'リプレイミステリー', teaserReplaySub: 'セッションを巻き戻して手掛かり探し',
    replayHint: 'チャートがひとりでに描かれる — 止まったら質問に答えて',
    replayCheckpoint: 'チェックポイント',
    replayQMove: '今、何が起きた？',
    replayOptDown: '急落が出た', replayOptUp: '急騰が出た', replayOptFlat: 'ほぼ動かなかった',
    replayFactMove: 'この5分足の変化: {v}%',
    replayQVwap: 'この時点の価格はVWAP（平均約定価格）に対してどこだった？',
    replayOptAbove: 'VWAPの上', replayOptBelow: 'VWAPの下',
    replayFactVwap: '価格 ${p} · VWAP ${v}',
    replayQDay: 'この銘柄の一日を一言でいうと？',
    replayOptDayUp: '大きく上げた日', replayOptDayDown: '大きく下げた日', replayOptDayQuiet: '静かな日',
    replayFactDay: '最初の足から最後の足まで: {v}%',
    replayContinue: '再生を続ける',
    replayFinale: '事件の全貌', replayOpenQuiz: '本格捜査を開く',
    replayPause: '一時停止', replayResume: '再生',
    almanacTitle: '概念図鑑', almanacSub: '概念を当てた日の実チャートがカードとして残る',
    almanacToast: '図鑑に新しいカード — {n}',
    teaserDomino: 'マクロドミノ', teaserDominoSub: '金利からセクターへ、波及の連鎖',
    dominoHeader: '今日のマクロイベント',
    dominoChainTitle: '波及ドミノ', dominoChainSub: 'ドミノをひとつずつタップして連鎖を開こう',
    dominoTapOpen: 'タップで開く', dominoNext: '次のドミノ',
    dominoN1: '政策金利 → 国債利回り', dominoN2: '利回り → ドル・割引率',
    dominoN3: '割引率 → グロース株バリュエーション', dominoN4: 'セクターローテーション',
    dominoQ1: '中央銀行が政策金利を上げると、新しく発行される国債の利回りは通常？',
    dominoQ1a: '高くなる', dominoQ1b: '低くなる',
    dominoM1: '政策金利はあらゆる金利の出発点 — 国債利回りも同じ方向へ動く傾向が観察されてきました。',
    dominoQ2: '国債利回りが上がると、将来利益の現在価値は？',
    dominoQ2a: '大きくなる', dominoQ2b: '小さくなる',
    dominoM2: '金利は将来のお金を今日の価値に換算する割引率 — 金利が高いほど、同じ将来利益の今日の価値は小さく計算されます。高い金利がドル資産の魅力を高める様子も過去によく観察されました。',
    dominoQ3: '利益の大半が遠い将来にあるグロース株と、いま利益を出すバリュー株 — 割引率の上昇に通常より敏感だったのは？',
    dominoQ3a: 'グロース株', dominoQ3b: 'バリュー株',
    dominoM3: '金利が上がると遠い将来の利益ほど現在価値が大きく目減りし、グロース株のバリュエーション負担が重くなる傾向があります。',
    dominoQ4: '金利が上がっていた時期、貸出利ざやの拡大が追い風になる傾向が観察されたセクターは？',
    dominoQ4a: '銀行', dominoQ4b: '公益事業',
    dominoM4: '同じ金利の動きもセクターごとに染み込み方が違います — 過去には銀行など金融が相対的に持ちこたえ、配当中心の公益事業は債券と競合して重くなる傾向が観察されました。こうした資金の移動をセクターローテーションと呼びます。',
    dominoHoldProb: '据え置き確率', dominoHikeProb: '利上げ確率', dominoNextFomc: '次のFOMC',
    dominoEstimate: '予想', dominoPrevious: '前回',
    dominoFinale: '連鎖完成', dominoRecap: '今日の数字',
    reviewChip: '復習',
    drillFocus: '集中ドリル',
    drillFocusSub: '同じ指標 · 別の銘柄',
    senseChart: '本日の実セッション',
    senseHint: 'この指標とは？',
    trackLiveTitle: '本日の実測',
    calTitle: '直感の精度',
    calSub: '直近30日 · {a}回中{b}回的中',
    calEmpty: '5回以上解くと精度カーブが開きます',
    statLine: '学習者の{p}%が正解しました',
    statEarly: '早解き — 本日{n}人目です',
    liveNow: '現在',
    weekendTitle: '週末レビュー', weekendSub: '今週最後のセッションを見直して、学んだ概念を復習しよう',
    unlockDramaLabel: '新しい層を解放',
    beltTitle: 'ベルトマップ', beltSub: '階級が上がるほどチャートに見える層が増える',
    beltNow: '現在',
    beltUnlockBase: '今日の事件＋プレイ4種',
    beltUnlockLevels: 'マックスペイン層 — ハント完走で解除',
    beltSoon: '新しい層・近日',
    freezeToast: 'ストリークフリーズが1日を守りました（残り{n}）',
    freezeLabel: 'ストリークフリーズ',
    share: '共有',
    shareFooter: '今日の市場で学ぶ30秒',
    ob1: '毎晩、今日の市場が問題を出します',
    ob2: 'チャートに触れて手掛かりを探そう',
    ob3: '学ぶほどチャートに層が開く',
    obNext: '次へ', obStart: 'はじめる', obSkip: 'スキップ',
    pulse10Y: '米10年債', pulseHold: 'FOMC据え置き確率', pulseFomc: '次のFOMC', pulseMover: '今日のムーバー',
    heroEyebrow: '今日のムーブ',
    heroHeadline: '{c}、今日±{v}%の動き',
    resumeTitle: 'つづきから学ぶ',
    resumeLine: '今日の問題 {a}/{b} — つづきを解く',
    tracksTitle: '学習トラック', tracksSub: '4つの道で学ぶ今日の市場',
    track1: 'チャートを読む', track2: '機関の痕跡', track3: 'マクロの流れ', track4: 'ニュースの読み方',
    trackDiff1: '入門〜中級', trackDiff2: '中級〜上級', trackDiff3: '入門〜上級', trackDiff4: '入門',
    trackNew: '新トラック',
    trackNext1: '次: リプレイで今日のセッションを巻き戻す',
    trackNext2: '次: レベルハントでマックスペインを探す',
    trackNext3: '次: 今日の金利ドミノを完成させる',
    trackNext4: '次: 今日のヘッドラインの本当の原因を探る',
    dailyRail: '今日のデータで学ぶ', dailyRailSub: '終わったばかりのセッションが今日の教材',
    conceptOfDay: '今日の概念',
    collectionLabel: 'コレクション',
    colTitle1: 'オプション構造3点セット', colSub1: 'マックスペイン · コールウォール · プットフロア',
    colTitle2: '群衆心理を読む', colSub2: 'プット/コール · ダークプール · ショート出来高',
    colTitle3: '金利の波及チェーン', colSub3: '10年債からセクターまで',
    colOpen: '開いてみる',
    dictRowSub: '全{n}用語、実データで学ぶ',
    newsDaily: '今日のニュースレッスン',
    newsStep1: 'ヘッドラインが語ったこと',
    newsStep2: 'お金が語ったこと',
    newsStep3: '今日の質問',
    newsQuiet: 'この日はオプション・ダークプールのデータが静かでした — ニュースがいつもお金を動かすとは限りません',
    newsQuietSub: 'それ自体が今日のレッスンです',
    newsQTone: 'ヘッドラインのトーンとお金の方向は一致していた？',
    newsQToneA: '一致していた', newsQToneB: '割れていた',
    newsToneReveal: 'トーンとお金が同じ方向の日もあれば、割れる日もあります — 割れた日こそ、ヘッドラインだけでは見えなかった部分です。',
    newsQFact: 'ヘッドラインは「事実」と「解釈」、どちらが多かった？',
    newsQFactA: '事実が多かった', newsQFactB: '解釈が多かった',
    newsFactReveal: '正解のない質問です — ヘッドラインを事実（起きたこと）と解釈（誰かの判断）に分けて読む習慣こそ、ニュースの読み方の核心です。',
    tonePos: 'ポジティブ寄り', toneNeg: 'ネガティブ寄り', toneFlat: '中立',
    moodBull: '楽観寄り', moodCaut: '慎重寄り', moodFlat: '中立',
    toneLabel: 'ヘッドラインのトーン', moodLabel: 'お金の方向',
    trackNextLabel: '次の一歩',
    trackTermsTitle: 'トラック用語',
    trackTermsSoon: '用語はまもなく追加',
    trackCta1: 'リプレイで今日のセッションを巻き戻す',
    trackCta2: 'レベルハントでマックスペインを探す',
    trackCta3: '今日の金利ドミノを完成させる',
    trackCta4: '今日のヘッドラインの本当の原因を探る',
    trackDesc1: 'ローソク足・出来高・VWAP — チャートの基本シグナルを読む道',
    trackDesc2: 'ダークプール・オプション構造 — 機関が残した足跡をたどる道',
    trackDesc3: '金利からセクターまで — 市場全体を動かす大きな流れ',
    trackDesc4: 'ヘッドラインとお金の実際の反応を並べて読む道',
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

// ── W3 concept almanac: 10 collectible concepts the plays/glossary already touch.
// A card is earned by proving the concept (top-tier play answer) or reading its
// glossary sheet; each card keeps the day's real chart it was earned on.
const ALMANAC_TERMS: MetricTerm[] = [
  'maxPain', 'callWall', 'putFloor', 'vwap', 'darkPool', 'pcr', 'shortInterest', 'gammaFlip', 'rsi', 'trendPhase',
  // macro + news-reading curriculum (glossary read = collect, same as the rest)
  'rate10y', 'fomc', 'cpi', 'jobsReport', 'yieldCurve', 'dollarIndex', 'vix',
  'guidance', 'consensus', 'sectorRotation', 'riskOnOff',
];
interface AlmanacEntry { dateET: string; ticker: string; closes: number[] }

// ── W6-A curriculum tracks: the app's education breadth as four SATURATED-LIGHT
// collection tiles (spec table — names/colors fixed: violet/gold/teal/coral,
// bright colored cards with dark ink of the same family, AA-safe). Progress
// ring = that track's almanac terms collected; macro/news carry no glossary
// terms yet → an honest "new track" chip instead of a fake 0-ring. Each track
// maps its ONE highlighted next step to a play that already exists (full
// track-detail views are W6-B).
// W6-A S6: deterministic weekly rotation index — evaluated once at module load
// (not during render: react purity rule), stable for the whole visit
const WEEK_EPOCH_IDX = Math.floor(Date.now() / 604_800_000);
interface TrackDef { id: 'chart' | 'insti' | 'macro' | 'news'; icon: string; terms: MetricTerm[]; bg: string; deep: string; chip: string }
const TRACKS: TrackDef[] = [
  { id: 'chart', icon: 'chart', terms: ['rsi', 'vwap', 'trendPhase'], bg: '#E4DCFF', deep: '#4A38C2', chip: 'rgba(74,56,194,0.13)' },
  { id: 'insti', icon: 'bank', terms: ['maxPain', 'callWall', 'putFloor', 'darkPool', 'pcr', 'shortInterest', 'gammaFlip'], bg: '#FFE3AD', deep: '#8A5B00', chip: 'rgba(138,91,0,0.13)' },
  { id: 'macro', icon: 'flow', terms: ['rate10y', 'fomc', 'cpi', 'vix', 'yieldCurve', 'dollarIndex', 'jobsReport'], bg: '#C4EDE3', deep: '#0E6B57', chip: 'rgba(14,107,87,0.13)' },
  { id: 'news', icon: 'megaphone', terms: ['guidance', 'consensus', 'sectorRotation', 'riskOnOff'], bg: '#FFD8CB', deep: '#A83A1D', chip: 'rgba(168,58,29,0.13)' },
];

// local weekday index (NOT UTC — a KST learning day must count as that day)
function weekdayIdx(): number { return (new Date().getDay() + 6) % 7; } // Mon=0..Sun=6

// ── W4 ET clock helpers (client mirror of the server's lastTradingDayET mapping) ──
function etTodayStr(ms = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ms));
}
function isWeekendET(): boolean {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(new Date());
  return wd === 'Sat' || wd === 'Sun';
}

// ── W4 SRS-lite: per-term wrong/right tally + last-touched ET day. A term is
// "due for review" when it has been missed more than hit AND wasn't already
// touched today — NumberSense quietly front-loads up to 2 such terms per session.
interface SrsEntry { wrong: number; right: number; last: string }

// ── RealChart: the "this is real data" proof. Actual 5-min closes, drawn in
// NEUTRAL violet (no up/down colors — compliance), optional real VWAP overlay
// and real options levels (max pain / call wall / put floor) as annotated lines.
function RealChart({
  closes, vwap, levels, height = 96, minmax = true, tone = 'light',
}: {
  closes: number[]; vwap?: number[] | null;
  levels?: { label: string; value: number; color: string }[];
  height?: number; minmax?: boolean; tone?: 'light' | 'dark' | 'lumi';
}) {
  // dark = W5-C navy scene: a LUMINOUS line built from layered strokes (wide
  // violet halo → soft lilac mid → near-white core). lumi = the same 3-layer
  // technique re-tuned for the W6 LIGHT hero (soft violet halo → deep violet
  // core). Pure SVG strokes, no filter/blur — iOS webview safe.
  const stroke = tone === 'dark' ? '#F4F1FF' : tone === 'lumi' ? '#4C3FAF' : P.hero;
  const fillId = tone === 'dark' ? 'wimFillD' : tone === 'lumi' ? 'wimFillL' : 'wimFill';
  const axis = tone === 'dark' ? 'rgba(255,255,255,0.72)' : P.faint;
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
          <stop offset="0%" stopColor={tone === 'dark' ? '#8B7CF7' : P.hero} stopOpacity={tone === 'dark' ? '0.26' : '0.28'} />
          <stop offset="100%" stopColor={tone === 'dark' ? '#8B7CF7' : P.hero} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${fillId})`} />
      {tone === 'dark' && (
        <>
          <path d={path} fill="none" stroke="#8B7CF7" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" opacity="0.22" />
          <path d={path} fill="none" stroke="#B7A8FF" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" opacity="0.32" />
        </>
      )}
      {tone === 'lumi' && (
        <>
          <path d={path} fill="none" stroke="#8B7CF7" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" opacity="0.16" />
          <path d={path} fill="none" stroke="#9C8DF5" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" opacity="0.30" />
        </>
      )}
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

// tiny inline spark for list/deck cards (w/h shape the viewBox so strokes never distort);
// tone="dark" = W5-C mini dark scene: layered violet halo under a near-white core
function MiniSpark({ closes, w = 72, h = 30, tone = 'light' }: { closes: number[]; w?: number; h?: number; tone?: 'light' | 'dark' }) {
  const W = w; const H = h;
  const lo = Math.min(...closes); const hi = Math.max(...closes); const span = hi - lo || 1;
  const pts = closes.map((c, i) => `${((i / Math.max(1, closes.length - 1)) * W).toFixed(1)},${(H - 3 - ((c - lo) / span) * (H - 6)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: H, display: 'block', flexShrink: 0 }} aria-hidden>
      {tone === 'dark' && <polyline points={pts} fill="none" stroke="#8B7CF7" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" opacity="0.30" />}
      <polyline points={pts} fill="none" stroke={tone === 'dark' ? '#F4F1FF' : P.hero} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity={tone === 'dark' ? '0.95' : '0.85'} />
    </svg>
  );
}

// count-up number for the hero ±% badge — rolls 0 → value on mount (~600ms, ease-out),
// no library (rAF); settles on the exact raw value so the final frame matches the data
function CountUp({ value, decimals = 1, duration = 600, delay = 0 }: { value: number; decimals?: number; duration?: number; delay?: number }) {
  const [prog, setProg] = useState(0);
  useEffect(() => {
    let raf = 0;
    setProg(0); // re-animate when the value changes (multi-round plays reuse one instance)
    const start = setTimeout(() => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        setProg(p);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    // rAF is throttled/paused in background tabs and iOS low-power mode - without this
    // fallback the number can sit at 0 forever (observed live). Settle regardless.
    const settle = setTimeout(() => setProg(1), delay + duration + 100);
    return () => { clearTimeout(start); cancelAnimationFrame(raf); clearTimeout(settle); };
  }, [value, duration, delay]);
  if (prog >= 1) return <>{value}</>;
  const eased = 1 - Math.pow(1 - prog, 3);
  return <>{(value * eased).toFixed(decimals)}</>;
}

// PRE·REG·POST heat strip — a thin 3-segment session bar; the lit segment is where
// today's (already finished) move happened. tone="light" = W6 editorial hero
// (gold bar + deep-gold label for AA on cream); "dark" keeps the W5-C palette.
function SessionStrip({ active, labels, tone = 'dark' }: { active: 'pre' | 'reg' | 'post'; labels: [string, string, string]; tone?: 'dark' | 'light' }) {
  const segs: ('pre' | 'reg' | 'post')[] = ['pre', 'reg', 'post'];
  const onBar = tone === 'dark' ? '#FFD66B' : '#F2B93B';
  const onLabel = tone === 'dark' ? '#FFD66B' : '#8A5B00';
  const offBar = tone === 'dark' ? 'rgba(255,255,255,0.20)' : 'rgba(38,34,64,0.10)';
  const offLabel = tone === 'dark' ? 'rgba(255,255,255,0.72)' : P.faint;
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {segs.map((s, i) => {
        const on = s === active;
        return (
          <div key={s} style={{ flex: s === 'reg' ? 2.2 : 1, textAlign: 'center', minWidth: 0 }}>
            <div style={{ height: 4, borderRadius: 99, background: on ? onBar : offBar }} />
            <div style={{ marginTop: 4, fontSize: 8, fontWeight: 900, letterSpacing: '0.08em', color: on ? onLabel : offLabel, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{labels[i]}</div>
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

// macro/news-track terms describe the MARKET, not one ticker — a random ticker's
// chart under them demonstrates nothing, so the demo block hides itself for these.
const MARKET_LEVEL_TERMS = new Set<MetricTerm>([
  'rate10y', 'fomc', 'cpi', 'jobsReport', 'yieldCurve', 'dollarIndex', 'vix',
  'guidance', 'consensus', 'sectorRotation', 'riskOnOff',
]);

// ── GlossarySheet v2: every concept demonstrated on REAL material — the real
// last-session chart with the term's real level/overlay drawn on it, plus the
// term's real numbers as stat tiles and a gauge. Prose is the caption, not the lesson.
function GlossarySheet({
  term, lab, loc, t, onClose, live,
}: {
  term: MetricTerm; lab: LabData | null; loc: Lang; t: Record<string, string>; onClose: () => void;
  live?: { yield10Y: number | null; holdPct: number | null; fomcDays: number | null };
}) {
  const entry = METRIC_GLOSSARY[term];
  const demo = termDemo(term, lab);
  const spark = lab?.spark || null;
  // 살아있는 용어집(A급 ③): 시장 레벨 용어는 정의 옆에 오늘의 실측값을 붙인다.
  // 실데이터 소스가 있는 용어만(없으면 표시 안 함 — 가짜 숫자 금지).
  const liveLine =
    term === 'rate10y' && live?.yield10Y != null ? `${live.yield10Y.toFixed(2)}%`
      : term === 'fomc' && live?.holdPct != null
        ? `${t.pulseHold} ${live.holdPct.toFixed(1)}%${live.fomcDays != null ? ` · D-${live.fomcDays}` : ''}`
        : null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(38,34,64,0.45)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, margin: '0 auto', background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderRadius: '24px 24px 0 0', padding: '20px 20px calc(24px + env(safe-area-inset-bottom))', animation: 'wimUp 0.25s ease', maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 16.5, fontWeight: 900, color: P.ink, letterSpacing: '-0.01em' }}>{entry.title[loc]}</div>
        {liveLine && (
          <div style={{ marginTop: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 900, color: P.mint, background: P.mintSoft, borderRadius: 99, padding: '4px 11px', fontVariantNumeric: 'tabular-nums' }}>
              ● {t.liveNow} · {liveLine}
            </span>
          </div>
        )}

        {lab && (demo || spark) && !MARKET_LEVEL_TERMS.has(term) && (
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

// W5-C real-brand layer: the ticker's logo rendered LARGE and translucent behind
// the dark hero/deck scenes (UC-proven "오라클의 하루" technique). Same proxy as
// TickerLogo; when the logo fails to load it renders nothing — the scene stays
// clean. Always sits under a navy scrim so chart/text contrast never degrades.
function LogoWatermark({ ticker, size = 180, right = -26, top = 6, opacity = 0.12 }: {
  ticker: string; size?: number; right?: number; top?: number; opacity?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={`/api/undercurrent/logo?t=${ticker}`} alt="" aria-hidden
      onError={() => setFailed(true)}
      style={{ position: 'absolute', right, top, width: size, height: size, objectFit: 'contain', opacity, pointerEvents: 'none', userSelect: 'none' }}
    />
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

// ── W2 plays: shared overlay chrome ──
const WIM_FONT = "-apple-system,'SF Pro Rounded','Hiragino Sans','Apple SD Gothic Neo',sans-serif";
// ── W5-A: ONE keyframe/style block for the whole app (home, quiz, every play —
// each rendered tree injects it exactly once). All motion is CSS one-shots or
// ambient loops: NO per-frame React state (iOS webview re-render floods have
// broken taps before — CountUp is the only sanctioned rAF animator).
const WIM_KEYFRAMES = [
  '@keyframes wimPop{0%{transform:scale(0.86);opacity:0}70%{transform:scale(1.04)}100%{transform:scale(1);opacity:1}}',
  '@keyframes wimUp{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}',
  '@keyframes wimSh{0%{background-position:200% 0}100%{background-position:-200% 0}}',
  '.wim-skel{background:linear-gradient(90deg,rgba(255,255,255,0.55) 25%,rgba(255,255,255,0.85) 50%,rgba(255,255,255,0.55) 75%);background-size:200% 100%;animation:wimSh 1.4s infinite}',
  // W6-A: the hero skeleton matches the LIGHT editorial scene (W5-C navy variant retired)
  '.wim-skel-cream{background:linear-gradient(90deg,#F1ECFA 25%,#FFFFFF 50%,#F1ECFA 75%);background-size:200% 100%;animation:wimSh 1.4s infinite}',
  '@keyframes wimSpin{to{transform:rotate(360deg)}}',
  '@keyframes wimFloat1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(24px,-30px) scale(1.12)}}',
  '@keyframes wimFloat2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-30px,22px) scale(0.92)}}',
  '@keyframes wimFloat3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(18px,26px) scale(1.08)}}',
  '.no-sb::-webkit-scrollbar{display:none}',
  // open/close: overlay slides up 24px over a fading backdrop; close = quick fade
  '@keyframes wimFadeIn{from{opacity:0}to{opacity:1}}',
  '@keyframes wimFadeOut{from{opacity:1}to{opacity:0}}',
  '@keyframes wimSlideUp{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}',
  // correct/wrong moments: violet stroke burst · spring judgment chip · floating XP ·
  // gentle shake + amber (never red) outline flash on the chosen wrong button
  '@keyframes wimBurst{0%{transform:scale(0.35);opacity:0.95}100%{transform:scale(1.25);opacity:0}}',
  '@keyframes wimJudge{0%{transform:scale(0.6);opacity:0}60%{transform:scale(1.08);opacity:1}100%{transform:scale(1);opacity:1}}',
  '@keyframes wimXpFloat{0%{transform:translateY(0);opacity:0}18%{opacity:1}100%{transform:translateY(-24px);opacity:0}}',
  '@keyframes wimShake{0%,100%{transform:translateX(0)}15%{transform:translateX(-5px)}35%{transform:translateX(4px)}55%{transform:translateX(-3px)}75%{transform:translateX(2px)}}',
  '@keyframes wimFlashAmber{0%{box-shadow:0 0 0 0 rgba(255,173,31,0)}35%{box-shadow:0 0 0 3.5px rgba(255,173,31,0.65)}100%{box-shadow:0 0 0 0 rgba(255,173,31,0)}}',
  // level-hunt reveal: the real level draws itself left→right (pathLength-normalized
  // dashoffset), then dissolves into the resting dashed line; the guess line pulses once
  '@keyframes wimDrawLine{0%{stroke-dashoffset:100;opacity:1}83%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}',
  '@keyframes wimPulseOnce{0%{opacity:1}50%{opacity:0.4}100%{opacity:0.55}}',
  // replay: soft pulsing halo on the leading dot of the self-drawing chart
  '@keyframes wimHalo{0%,100%{transform:scale(1);opacity:0.4}50%{transform:scale(2);opacity:0.05}}',
  // domino physics: the next card tilts in and settles when the chain reaches it
  '@keyframes wimTilt{0%{transform:rotate(-1.2deg) translateY(-6px)}100%{transform:rotate(0deg) translateY(0)}}',
  // unlock drama: the mini chart draws and stays, the MAX PAIN line sweeps in,
  // and the whole moment collapses toward the home hero at the end
  '@keyframes wimDrawKeep{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}',
  '@keyframes wimSweepIn{from{transform:translateX(-40px);opacity:0}to{transform:translateX(0);opacity:1}}',
  '@keyframes wimDramaOut{to{transform:translateY(-30vh) scale(0.12);opacity:0}}',
  // deck micro-interactions: press-down scale + a rare shimmer sweep on the NEW chip
  '.wim-press{transition:transform 0.12s ease}.wim-press:active{transform:scale(0.97)}',
  '.wim-new{position:relative;overflow:hidden}.wim-new::after{content:"";position:absolute;top:0;bottom:0;left:-60%;width:50%;background:linear-gradient(105deg,rgba(255,255,255,0) 0%,rgba(255,255,255,0.75) 50%,rgba(255,255,255,0) 100%);animation:wimShimmer 6s linear infinite}',
  '@keyframes wimShimmer{0%{transform:translateX(0)}40%{transform:translateX(340%)}100%{transform:translateX(340%)}}',
  // accessibility: every animation collapses to its end state instantly
  '@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:0.01ms!important;animation-delay:0ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important}}',
].join(' ');
const EASE_OUT = 'cubic-bezier(0.22,1,0.36,1)';
// wrong-moment: 3 horizontal oscillations + amber outline flash (never red)
const WRONG_ANIM = 'wimShake 0.3s ease, wimFlashAmber 0.5s ease';
const fmtPx = (v: number) => (v >= 1000 ? v.toFixed(0) : v >= 100 ? v.toFixed(1) : v.toFixed(2));

// ── W5-B share card: a 1080×1350 dark-navy PNG built entirely client-side
// (SVG string → <img> → canvas → blob → navigator.share / download). Facts
// only — wordmark, date, ticker, ±%, score dots, the day's real spark. No
// advice or prediction copy ever enters this card (compliance invariant).
async function buildShareCard(opts: {
  dateET: string; ticker: string; movePct: number | null;
  scoreFilled: number; scoreTotal: number; closes: number[] | null; footer: string;
}): Promise<void> {
  const W = 1080; const H = 1350;
  const gold = '#FFD66B'; const violet = '#8B7CF7';
  const dim = 'rgba(255,255,255,0.55)'; const faint = 'rgba(255,255,255,0.20)';
  // the day's spark, downsampled to ≤48 points for a clean polyline
  let sparkEl = `<line x1="120" y1="810" x2="${W - 120}" y2="810" stroke="${faint}" stroke-width="4" stroke-dasharray="4 14"/>`;
  if (opts.closes && opts.closes.length >= 8) {
    const src = opts.closes;
    const step = Math.max(1, Math.ceil(src.length / 48));
    const pts = src.filter((_, i) => i % step === 0 || i === src.length - 1);
    const lo = Math.min(...pts); const hi = Math.max(...pts); const span = hi - lo || 1;
    const poly = pts.map((v, i) => `${(120 + (i / Math.max(1, pts.length - 1)) * (W - 240)).toFixed(1)},${(920 - ((v - lo) / span) * 280).toFixed(1)}`).join(' ');
    sparkEl = `<polyline points="${poly}" fill="none" stroke="${violet}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const total = Math.max(1, Math.min(10, opts.scoreTotal));
  const filled = Math.max(0, Math.min(total, opts.scoreFilled));
  const dotGap = 66; const dotsW = (total - 1) * dotGap;
  const dots = Array.from({ length: total }).map((_, i) => {
    const cx = W / 2 - dotsW / 2 + i * dotGap;
    return `<circle cx="${cx.toFixed(1)}" cy="1060" r="17" fill="${i < filled ? gold : 'none'}" stroke="${i < filled ? gold : faint}" stroke-width="5"/>`;
  }).join('');
  const font = 'font-family="-apple-system,Helvetica,Arial,sans-serif"';
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#0B0F1A"/>`,
    `<rect x="56" y="56" width="${W - 112}" height="${H - 112}" rx="48" fill="none" stroke="rgba(139,124,247,0.35)" stroke-width="3"/>`,
    `<text x="120" y="196" ${font} font-size="50" font-weight="900" fill="#FFFFFF" letter-spacing="3">WHY'D IT MOVE?</text>`,
    `<text x="${W - 120}" y="196" text-anchor="end" ${font} font-size="38" font-weight="800" fill="${dim}">${opts.dateET}</text>`,
    `<text x="120" y="430" ${font} font-size="140" font-weight="900" fill="#FFFFFF" letter-spacing="2">${opts.ticker}</text>`,
    opts.movePct != null ? `<text x="120" y="540" ${font} font-size="70" font-weight="900" fill="${gold}">±${opts.movePct}%</text>` : '',
    sparkEl,
    dots,
    `<text x="${W / 2}" y="1226" text-anchor="middle" ${font} font-size="33" font-weight="700" fill="${dim}">Why'd It Move? · ${opts.footer}</text>`,
    '</svg>',
  ].join('');
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('svg-load')); img.src = svgUrl; });
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, W, H);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) return;
    const file = new File([png], `wim-${opts.dateET || 'today'}.png`, { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (typeof nav.share === 'function' && nav.canShare && nav.canShare({ files: [file] })) {
      // user cancelling the sheet is fine — never force a download afterwards
      try { await nav.share({ files: [file] }); } catch { /* cancelled */ }
      return;
    }
    const dl = URL.createObjectURL(png);
    const a = document.createElement('a');
    a.href = dl; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(dl), 5000);
  } catch { /* rasterization unavailable — quietly skip */ }
  finally { URL.revokeObjectURL(svgUrl); }
}

// ── W5-A correct-moment: 8 thin violet strokes burst outward from the tapped
// answer while the earned XP floats up 24px and fades. Pure CSS one-shots
// (fill:forwards parks them invisible) — mounted once at reveal, zero cleanup.
function CorrectBurst({ gain, xpLabel = 'XP' }: { gain: number; xpLabel?: string }) {
  return (
    <span aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <svg width="96" height="96" viewBox="-48 -48 96 96" style={{ position: 'absolute', overflow: 'visible', animation: 'wimBurst 450ms ease-out forwards' }}>
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          const c = Math.cos(a); const s = Math.sin(a);
          return <line key={i} x1={(c * 14).toFixed(1)} y1={(s * 14).toFixed(1)} x2={(c * 34).toFixed(1)} y2={(s * 34).toFixed(1)} stroke={P.hero} strokeWidth="2" strokeLinecap="round" />;
        })}
      </svg>
      {gain > 0 && (
        <span style={{ position: 'absolute', top: -12, animation: 'wimXpFloat 700ms ease-out forwards', fontSize: 12.5, fontWeight: 900, color: P.heroDeep, fontVariantNumeric: 'tabular-nums', textShadow: '0 1px 0 rgba(255,255,255,0.9)', opacity: 0 }}>+{gain} {xpLabel}</span>
      )}
    </span>
  );
}

// ── W5-A open/close chrome shared by every full-screen play + the quiz:
// backdrop fades in while the sheet slides up 24px (260ms); closing is a quick
// 150ms fade (the parent unmounts after it). Never blocks interaction.
function PlayShell({ closing, children }: { closing: boolean; children: ReactNode }) {
  return (
    <div style={closing ? { animation: 'wimFadeOut 0.15s ease both', pointerEvents: 'none' } : undefined}>
      <style>{WIM_KEYFRAMES}</style>
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'rgba(38,34,64,0.30)', animation: 'wimFadeIn 0.26s ease both' }} />
      {/* no fill-mode on purpose: a lingering transform would become the containing
          block for fixed children (glossary sheet, toasts) and break their anchoring */}
      <div style={{ position: 'relative', zIndex: 1, animation: `wimSlideUp 0.26s ${EASE_OUT}` }}>
        {children}
      </div>
    </div>
  );
}

// top bar shared by both plays — same skeleton as the quiz overlay's (back + progress + chip)
function PlayTopBar({ onClose, backLabel, prog, chip }: { onClose: () => void; backLabel: string; prog: number; chip?: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 'calc(16px + max(env(safe-area-inset-top), var(--wim-top-floor, 0px)))' }}>
      <button type="button" onClick={onClose} aria-label={backLabel} style={{ font: 'inherit', width: 38, height: 38, borderRadius: '50%', border: `1.5px solid ${P.line}`, background: '#fff', fontSize: 16, fontWeight: 900, color: P.ink, cursor: 'pointer', flexShrink: 0 }}>←</button>
      <div style={{ flex: 1, height: 8, background: P.heroSoft, borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, Math.max(0, prog * 100))}%`, height: '100%', background: P.hero, borderRadius: 99, transition: 'width 0.4s ease' }} />
      </div>
      {chip ? (
        <div style={{ minWidth: 38, height: 38, borderRadius: 19, background: P.heroSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 900, color: P.heroDeep, padding: '0 10px', fontVariantNumeric: 'tabular-nums' }}>{chip}</div>
      ) : <div style={{ width: 38 }} />}
    </div>
  );
}

// friendly no-data state — the lab has no usable fields today, award nothing
function PlayEmpty({ t, onClose }: { t: Record<string, string>; onClose: () => void }) {
  return (
    <div style={{ marginTop: 24, background: '#fff', borderRadius: 24, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '28px 18px', textAlign: 'center', animation: 'wimUp 0.35s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'center', color: P.faint }}><Ic name="search" size={26} /></div>
      <div style={{ marginTop: 10, fontSize: 15.5, fontWeight: 900, color: P.ink }}>{t.noData}</div>
      <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: P.sub }}>{t.noDataSub}</div>
      <button type="button" onClick={onClose} style={{ font: 'inherit', width: '100%', marginTop: 16, background: P.ink, color: '#fff', border: 'none', borderRadius: 16, padding: '13px 0', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>{t.backHome}</button>
    </div>
  );
}

// visible loading card — a cold lab fetch can take seconds, and the old shimmer
// skeleton was nearly invisible on the lavender canvas (W2 verification finding)
function PlayLoading({ label }: { label: string }) {
  return (
    <div style={{ marginTop: 24, background: '#fff', borderRadius: 24, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '34px 18px', textAlign: 'center', animation: 'wimUp 0.3s ease' }}>
      <div style={{ width: 34, height: 34, margin: '0 auto', borderRadius: '50%', border: `3.5px solid ${P.heroSoft}`, borderTopColor: P.hero, animation: 'wimSpin 0.9s linear infinite' }} />
      <div style={{ marginTop: 12, fontSize: 13, fontWeight: 800, color: P.sub }}>{label}</div>
    </div>
  );
}

// ── P3 LEVEL HUNT: drag a horizontal line onto the real last-session chart to
// guess where today's ALREADY-COMPUTED options levels (max pain / call wall /
// put floor) actually sat. Proximity scored; each reveal teaches the concept
// in one line. Resolved data only — nothing here is a forecast.
interface HuntRound { key: string; value: number; label: string; color: string; prompt: string; meaning: string }
interface HuntResult { label: string; color: string; actual: number; guess: number; distPct: number; gain: number }

function LevelHuntPlay({ ticker, fallbackCloses, requestLab, t, onAward, onCollect, onSrs, onComplete, onShare, onClose, disclaimer }: {
  ticker: string;
  fallbackCloses: number[] | null;
  requestLab: (tk: string) => Promise<LabData | null>;
  t: Record<string, string>;
  onAward: (gain: number) => void;
  onCollect: (term: MetricTerm) => void;
  onSrs: (term: string, ok: boolean) => void;
  onComplete: () => boolean; // returns true when this completion newly unlocked the overlay
  onShare: (filled: number, total: number) => void; // W5-B share card (bullseye runs only)
  onClose: () => void;
  disclaimer: string;
}) {
  const [lab, setLab] = useState<LabData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [ri, setRi] = useState(0);
  const [guess, setGuess] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<HuntResult[]>([]);
  const [phase, setPhase] = useState<'play' | 'summary'>('play');
  const [newUnlock, setNewUnlock] = useState(false);
  const [cw, setCw] = useState(320);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const completedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    requestLab(ticker).then((l) => { if (alive) { setLab(l); setLoaded(true); } });
    return () => { alive = false; };
  }, [ticker, requestLab]);

  const rounds = useMemo<HuntRound[]>(() => {
    if (!lab) return [];
    const L = lab.levels;
    const out: HuntRound[] = [];
    if (L.maxPain != null) out.push({ key: 'maxPain', value: Math.round(L.maxPain * 100) / 100, label: 'MAX PAIN', color: P.amber, prompt: t.huntPromptMaxPain, meaning: t.huntMeanMaxPain });
    if (L.callWall != null) out.push({ key: 'callWall', value: Math.round(L.callWall * 100) / 100, label: 'CALL WALL', color: P.coral, prompt: t.huntPromptCallWall, meaning: t.huntMeanCallWall });
    if (L.putFloor != null) out.push({ key: 'putFloor', value: Math.round(L.putFloor * 100) / 100, label: 'PUT FLOOR', color: P.mint, prompt: t.huntPromptPutFloor, meaning: t.huntMeanPutFloor });
    return out;
  }, [lab, t]);

  const closes = useMemo(() => {
    if (lab?.spark && lab.spark.closes.length >= 8) return lab.spark.closes;
    if (fallbackCloses && fallbackCloses.length >= 8) return fallbackCloses;
    return null;
  }, [lab, fallbackCloses]);

  // one fixed price domain for all rounds (closes ∪ every level, padded) so the
  // answer is always reachable and round-to-round rescaling never leaks a hint
  const domain = useMemo(() => {
    if (!closes || rounds.length === 0) return null;
    const vals = [...closes, ...rounds.map((r) => r.value)];
    const lo0 = Math.min(...vals); const hi0 = Math.max(...vals);
    const pad = (hi0 - lo0 || Math.abs(hi0) * 0.02 || 1) * 0.08;
    return { lo: lo0 - pad, hi: hi0 + pad };
  }, [closes, rounds]);

  useEffect(() => {
    if (closes && guess == null) setGuess(closes[closes.length - 1]);
  }, [closes, guess]);

  useEffect(() => {
    const measure = () => { if (wrapRef.current) setCw(wrapRef.current.clientWidth || 320); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [loaded, phase]);

  // pixel↔price mapping (1:1 viewBox — the SVG's viewBox tracks the measured width)
  const CH = 264;
  const lo = domain ? domain.lo : 0;
  const span = domain ? (domain.hi - domain.lo || 1) : 1;
  const yOf = (v: number) => CH - 16 - ((v - lo) / span) * (CH - 32);
  const priceOf = (py: number) => lo + ((CH - 16 - py) / (CH - 32)) * span;
  const setFromY = (clientY: number) => {
    const el = wrapRef.current;
    if (!el || !domain) return;
    const v = priceOf(clientY - el.getBoundingClientRect().top);
    setGuess(Math.min(domain.hi, Math.max(domain.lo, v)));
  };

  const cur = rounds[ri];
  const curResult = results[ri];
  const totalGain = results.reduce((s, r) => s + r.gain, 0);
  const playable = loaded && !!closes && rounds.length > 0 && !!domain;

  const confirm = () => {
    if (guess == null || revealed || !cur) return;
    const distPct = (Math.abs(guess - cur.value) / cur.value) * 100;
    const gain = distPct <= 1 ? XP_CORRECT : distPct <= 3 ? XP_TRIED : 0;
    setResults([...results, { label: cur.label, color: cur.color, actual: cur.value, guess, distPct, gain }]);
    setRevealed(true);
    onAward(gain);
    onSrs(cur.key, gain > 0);
    if (gain >= XP_CORRECT) onCollect(cur.key as MetricTerm);
  };
  const nextRound = () => {
    if (ri + 1 < rounds.length) {
      setRi(ri + 1);
      setRevealed(false);
      if (closes) setGuess(closes[closes.length - 1]);
    } else {
      if (!completedRef.current) { completedRef.current = true; setNewUnlock(onComplete()); }
      setPhase('summary');
    }
    window.scrollTo(0, 0);
  };

  const x = (i: number) => (i / Math.max(1, (closes?.length || 1) - 1)) * cw;
  const linePath = closes ? closes.map((c, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${yOf(c).toFixed(1)}`).join(' ') : '';

  return (
    <div style={{ minHeight: '100vh', background: P.bg, color: P.ink, fontFamily: WIM_FONT }}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 18px calc(40px + env(safe-area-inset-bottom))' }}>
        <PlayTopBar
          onClose={onClose}
          backLabel={t.backHome}
          prog={!playable ? 0.1 : phase === 'summary' ? 1 : (ri + (revealed ? 1 : 0.4)) / rounds.length}
          chip={playable && phase === 'play' ? `${ri + 1}/${rounds.length}` : null}
        />

        {!loaded && <PlayLoading label={t.loadingData} />}
        {loaded && !playable && <PlayEmpty t={t} onClose={onClose} />}

        {playable && phase === 'play' && cur && (
          <>
            <div style={{ marginTop: 14, background: '#fff', borderRadius: 22, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '14px 15px', animation: `wimUp 0.26s ${EASE_OUT} 90ms both` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TickerLogo ticker={ticker} size={28} />
                <span style={{ fontSize: 14.5, fontWeight: 900 }}>{ticker}</span>
                <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 900, color: P.mint, background: P.mintSoft, borderRadius: 99, padding: '3px 9px' }}>● {t.realData.toUpperCase()}</span>
              </div>
              <h1 style={{ margin: '10px 0 0', fontSize: 17.5, fontWeight: 900, letterSpacing: '-0.01em', lineHeight: 1.35 }}>{cur.prompt}</h1>
              {!revealed && (
                <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 750 as any, color: P.hero, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Ic name="crosshair" size={13} color={P.hero} /> {t.huntDragHint}
                </div>
              )}
            </div>

            {/* the LARGE draggable chart — touch-action none so dragging never scrolls */}
            <div style={{ marginTop: 12, background: '#fff', borderRadius: 22, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '10px 8px 8px', animation: `wimUp 0.26s ${EASE_OUT} both` }}>
              <div
                ref={wrapRef}
                onPointerDown={(e) => {
                  if (revealed || !domain) return;
                  dragging.current = true;
                  try { (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId); } catch { /* older webview */ }
                  setFromY(e.clientY);
                }}
                onPointerMove={(e) => { if (dragging.current && !revealed) setFromY(e.clientY); }}
                onPointerUp={() => { dragging.current = false; }}
                onPointerCancel={() => { dragging.current = false; }}
                style={{ position: 'relative', height: CH, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', cursor: revealed ? 'default' : 'ns-resize' }}
              >
                <svg viewBox={`0 0 ${cw} ${CH}`} style={{ width: '100%', height: CH, display: 'block' }} aria-hidden>
                  <defs>
                    <linearGradient id="wimHuntFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={P.hero} stopOpacity="0.22" />
                      <stop offset="100%" stopColor={P.hero} stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  <path d={`${linePath} L${cw},${CH} L0,${CH} Z`} fill="url(#wimHuntFill)" />
                  <path d={linePath} fill="none" stroke={P.hero} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
                  {results.slice(0, ri).map((r) => (
                    <g key={r.label} opacity="0.45">
                      <line x1="0" x2={cw} y1={yOf(r.actual)} y2={yOf(r.actual)} stroke={r.color} strokeWidth="1.3" strokeDasharray="4 4" />
                      <text x="4" y={yOf(r.actual) - 4} fontSize="9" fontWeight="800" fill={r.color}>{r.label}</text>
                    </g>
                  ))}
                  {revealed && curResult && (
                    <g>
                      {/* resting dashed line fades in as the draw stroke lands */}
                      <line x1="0" x2={cw} y1={yOf(curResult.actual)} y2={yOf(curResult.actual)} stroke={curResult.color} strokeWidth="1.8" strokeDasharray="5 4" style={{ animation: 'wimFadeIn 0.2s ease 0.42s both' }} />
                      {/* the reveal: the actual level DRAWS itself left→right (500ms), then dissolves */}
                      <line x1="0" x2={cw} y1={yOf(curResult.actual)} y2={yOf(curResult.actual)} stroke={curResult.color} strokeWidth="1.8" pathLength={100} strokeDasharray="100 100" style={{ animation: 'wimDrawLine 0.6s ease-out both' }} />
                      <text x="4" y={yOf(curResult.actual) - 5} fontSize="10.5" fontWeight="800" fill={curResult.color} style={{ animation: 'wimFadeIn 0.25s ease 0.45s both' }}>{curResult.label} ${fmtPx(curResult.actual)}</text>
                    </g>
                  )}
                  {guess != null && (
                    <line x1="0" x2={cw} y1={yOf(guess)} y2={yOf(guess)} stroke={P.heroDeep} strokeWidth="2" opacity={revealed ? 0.55 : 1} style={revealed ? { animation: 'wimPulseOnce 0.6s ease both' } : undefined} />
                  )}
                  <text x={cw - 4} y="12" textAnchor="end" fontSize="9" fontWeight="800" fill={P.faint}>${fmtPx(lo + span)}</text>
                  <text x={cw - 4} y={CH - 4} textAnchor="end" fontSize="9" fontWeight="800" fill={P.faint}>${fmtPx(lo)}</text>
                </svg>
                {guess != null && (
                  <div style={{ position: 'absolute', left: 0, right: 0, top: Math.max(0, Math.min(CH - 26, yOf(guess) - 13)), display: 'flex', justifyContent: 'flex-end', paddingRight: 6, pointerEvents: 'none' }}>
                    <span style={{ background: P.heroDeep, color: '#fff', borderRadius: 8, padding: '4px 9px', fontSize: 11.5, fontWeight: 900, fontVariantNumeric: 'tabular-nums', boxShadow: '0 3px 10px rgba(38,34,64,0.35)' }}>${fmtPx(guess)}</span>
                  </div>
                )}
              </div>
            </div>

            {!revealed && (
              <button type="button" onClick={confirm} style={{ font: 'inherit', width: '100%', marginTop: 14, background: P.ink, color: '#fff', border: 'none', borderRadius: 18, padding: '15px 0', fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 0 rgba(38,34,64,0.35)' }}>{t.huntConfirm}</button>
            )}
            {revealed && curResult && (
              <div style={{ animation: 'wimPop 0.4s cubic-bezier(0.22,1,0.36,1)' }}>
                {/* judgment chip: spring pop-in + stroke burst when the guess scored */}
                <div style={{ marginTop: 14, textAlign: 'center' }}>
                  <span style={{ position: 'relative', display: 'inline-block', padding: '0 6px', fontSize: 19, fontWeight: 900, color: curResult.gain >= XP_CORRECT ? P.mint : curResult.gain > 0 ? P.amber : P.sub, animation: 'wimJudge 0.35s ease both' }}>
                    {curResult.gain > 0 && <CorrectBurst gain={0} />}
                    {curResult.gain >= XP_CORRECT ? t.huntGreat : curResult.gain > 0 ? t.huntNear : t.huntMiss}{curResult.gain > 0 ? ` +${curResult.gain}XP` : ''}
                  </span>
                </div>
                <div style={{ marginTop: 10, background: '#fff', borderRadius: 20, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.09em', color: curResult.color }}>{curResult.label}</div>
                      <div style={{ fontSize: 24, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: curResult.color }}>
                        $<CountUp value={curResult.actual} decimals={curResult.actual >= 1000 ? 0 : curResult.actual >= 100 ? 1 : 2} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.09em', color: P.faint }}>{t.yourLine.toUpperCase()}</div>
                      <div style={{ fontSize: 24, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>${fmtPx(curResult.guess)}</div>
                    </div>
                    <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 900, color: P.heroDeep, background: P.heroSoft, borderRadius: 99, padding: '5px 11px', fontVariantNumeric: 'tabular-nums' }}>{t.huntDiff} <CountUp value={Number(curResult.distPct.toFixed(1))} decimals={1} duration={500} delay={450} />%</span>
                  </div>
                  <p style={{ margin: '11px 0 0', fontSize: 13, lineHeight: 1.65, fontWeight: 650 as any, color: P.sub }}>{cur.meaning}</p>
                </div>
                <button type="button" onClick={nextRound} style={{ font: 'inherit', width: '100%', marginTop: 14, background: P.ink, color: '#fff', border: 'none', borderRadius: 18, padding: '15px 0', fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 0 rgba(38,34,64,0.35)' }}>
                  {ri + 1 < rounds.length ? `${t.nextRound} →` : `${t.seeResults} →`}
                </button>
              </div>
            )}
          </>
        )}

        {playable && phase === 'summary' && (
          <div style={{ animation: 'wimUp 0.35s ease' }}>
            <div style={{ marginTop: 18, background: '#fff', borderRadius: 24, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '20px 18px', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', color: P.heroDeep }}><Ic name="crosshair" size={26} sw={2} /></div>
              <div style={{ marginTop: 8, fontSize: 17, fontWeight: 900 }}>{t.huntSummary}</div>
              <div style={{ marginTop: 3, fontSize: 13, fontWeight: 900, color: P.hero, fontVariantNumeric: 'tabular-nums' }}>+{totalGain} {t.xp}</div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {results.map((r) => (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8, background: P.bg, borderRadius: 13, padding: '9px 12px' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, fontWeight: 900 }}>{r.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: P.sub, fontVariantNumeric: 'tabular-nums' }}>{t.huntDiff} {r.distPct.toFixed(1)}%</span>
                    <span style={{ fontSize: 11, fontWeight: 900, color: r.gain > 0 ? P.mint : P.faint, fontVariantNumeric: 'tabular-nums' }}>+{r.gain}XP</span>
                  </div>
                ))}
              </div>
            </div>
            {newUnlock && (
              <div style={{ marginTop: 12, background: `linear-gradient(135deg, ${P.heroDeep}, ${P.hero})`, borderRadius: 18, padding: '13px 15px', color: '#fff', display: 'flex', alignItems: 'center', gap: 10, boxShadow: P.shadow, animation: 'wimPop 0.45s ease' }}>
                <Ic name="layers" size={18} color="#FFD66B" />
                <span style={{ fontSize: 12.5, fontWeight: 900, lineHeight: 1.4 }}>{t.unlockToast}</span>
              </div>
            )}
            {/* W5-B: a bullseye run earns the brag card — share the day, not a forecast */}
            {results.some((r) => r.gain >= XP_CORRECT) && (
              <button type="button" onClick={() => onShare(results.filter((r) => r.gain > 0).length, results.length)} style={{ font: 'inherit', width: '100%', marginTop: 14, background: '#fff', color: P.heroDeep, border: `1.5px solid ${P.line}`, borderRadius: 18, padding: '14px 0', fontSize: 14.5, fontWeight: 900, cursor: 'pointer', boxShadow: P.shadow, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Ic name="share" size={16} color={P.heroDeep} sw={2} /> {t.share}
              </button>
            )}
            <button type="button" onClick={onClose} style={{ font: 'inherit', width: '100%', marginTop: 14, background: P.ink, color: '#fff', border: 'none', borderRadius: 18, padding: '15px 0', fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 0 rgba(38,34,64,0.35)' }}>{t.backHome}</button>
          </div>
        )}

        <div style={{ marginTop: 18, textAlign: 'center', fontSize: 10, color: P.faint, fontWeight: 600, lineHeight: 1.5 }}>{disclaimer}</div>
      </div>
    </div>
  );
}

// ── P4 NUMBER SENSE: quick-fire higher/lower on today's real readings — builds
// a feel for each metric's normal range. Questions come from non-null lab
// fields across today's unit tickers; all values are last-session, resolved.
interface SenseQ { ticker: string; term: MetricTerm; label: string; actual: number; thresholdLabel: string; prefix: string; suffix: string; decimals: number; meaning: string; answerHigher: boolean; review?: boolean }

function buildSenseQs(lb: LabData, t: Record<string, string>): SenseQ[] {
  const out: SenseQ[] = [];
  const tk = lb.ticker;
  if (lb.darkPoolPct != null) {
    const v = Math.round(lb.darkPoolPct * 10) / 10;
    if (v !== 50) out.push({ ticker: tk, term: 'darkPool', label: t.senseQDark.replace('{t}', tk), actual: v, thresholdLabel: '50%', prefix: '', suffix: '%', decimals: 1, meaning: t.senseMeanDark, answerHigher: v > 50 });
  }
  if (lb.pcr != null) {
    const v = Math.round(lb.pcr * 100) / 100;
    if (v !== 1) out.push({ ticker: tk, term: 'pcr', label: t.senseQPcr.replace('{t}', tk), actual: v, thresholdLabel: '1.0', prefix: '', suffix: '', decimals: 2, meaning: t.senseMeanPcr, answerHigher: v > 1 });
  }
  if (lb.shortVolPct != null) {
    const v = Math.round(lb.shortVolPct * 10) / 10;
    if (v !== 40) out.push({ ticker: tk, term: 'shortInterest', label: t.senseQShort.replace('{t}', tk), actual: v, thresholdLabel: '40%', prefix: '', suffix: '%', decimals: 1, meaning: t.senseMeanShort, answerHigher: v > 40 });
  }
  if (lb.vol.regimeScore != null) {
    const v = Math.round(lb.vol.regimeScore);
    if (v !== 50) out.push({ ticker: tk, term: 'volRegime', label: t.senseQVol.replace('{t}', tk), actual: v, thresholdLabel: '50', prefix: '', suffix: '', decimals: 0, meaning: t.senseMeanVol, answerHigher: v > 50 });
  }
  if (lb.price != null && lb.sma.sma50 != null) {
    const d = lb.price >= 1000 ? 0 : lb.price >= 100 ? 1 : 2;
    const v = Number(lb.price.toFixed(d));
    const s = lb.sma.sma50;
    if (v !== Number(s.toFixed(d))) out.push({ ticker: tk, term: 'trendPhase', label: t.senseQSma.replace('{t}', tk), actual: v, thresholdLabel: `SMA50 $${fmtPx(s)}`, prefix: '$', suffix: '', decimals: d, meaning: t.senseMeanSma, answerHigher: v > s });
  }
  return out;
}

function NumberSensePlay({ tickers, requestLab, t, loc, onAward, onCollect, onSrs, isReviewDue, onClose, disclaimer }: {
  tickers: string[];
  requestLab: (tk: string) => Promise<LabData | null>;
  t: Record<string, string>;
  loc: 'ko' | 'en' | 'ja';
  onAward: (gain: number) => void;
  onCollect: (term: MetricTerm) => void;
  onSrs: (term: string, ok: boolean) => void;
  isReviewDue: (term: string) => boolean;
  onClose: () => void;
  disclaimer: string;
}) {
  const [qs, setQs] = useState<SenseQ[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<boolean | null>(null); // true = higher
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<'play' | 'summary'>('play');
  const [focusTerm, setFocusTerm] = useState<MetricTerm | null>(null);
  const [labMap, setLabMap] = useState<Record<string, LabData>>({});
  const bonusRef = useRef(false);

  // fetch every unit ticker's lab in parallel (cache-first), pool the non-null
  // questions, shuffle, keep 5 — fewer than 3 usable → friendly empty state
  useEffect(() => {
    let alive = true;
    Promise.all(tickers.map((tk) => requestLab(tk))).then((arr) => {
      if (!alive) return;
      const m: Record<string, LabData> = {};
      arr.forEach((lb, i) => { if (lb) m[tickers[i]] = lb; });
      setLabMap(m);
      const pool: SenseQ[] = [];
      arr.forEach((lb) => { if (lb) pool.push(...buildSenseQs(lb, t)); });
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      // ── 집중 드릴 (제품 정의 §2): ONE indicator across DIFFERENT tickers in a
      // row — repetition on live values is how the concept sticks. Focus term =
      // the weakest SRS-due term when it can sustain a run, else a date-rotating
      // pick among terms with ≥3 distinct tickers; mixed set stays the fallback.
      const byTerm = new Map<MetricTerm, SenseQ[]>();
      pool.forEach((pq) => { const a = byTerm.get(pq.term) || []; a.push(pq); byTerm.set(pq.term, a); });
      const sustains = (k: MetricTerm) => new Set((byTerm.get(k) || []).map((x) => x.ticker)).size >= 3;
      const candidates = [...byTerm.keys()].filter(sustains);
      const dueCand = candidates.find((k) => isReviewDue(k));
      const dk = etTodayStr(); let h = 0;
      for (let i = 0; i < dk.length; i++) h = (h * 31 + dk.charCodeAt(i)) >>> 0;
      const focus = dueCand || (candidates.length ? candidates[h % candidates.length] : null);
      if (focus) {
        const seen = new Set<string>();
        const run = (byTerm.get(focus) || []).filter((x) => {
          if (seen.has(x.ticker)) return false;
          seen.add(x.ticker);
          return true;
        }).slice(0, 5);
        if (run.length >= 3) {
          setFocusTerm(focus);
          setQs(run.map((x) => (dueCand && x.term === dueCand ? { ...x, review: true } : x)));
          return;
        }
      }
      // W4 SRS-lite fallback (mixed): terms missed more than hit (and not touched
      // today) jump to the front — capped at 2 so it never feels like punishment
      const due: SenseQ[] = []; const rest: SenseQ[] = [];
      pool.forEach((pq) => {
        if (due.length < 2 && isReviewDue(pq.term) && !due.some((d) => d.term === pq.term)) due.push({ ...pq, review: true });
        else rest.push(pq);
      });
      setQs([...due, ...rest].slice(0, 5));
    });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loaded = qs != null;
  const playable = loaded && qs.length >= 3;
  const q = playable && phase === 'play' ? qs[idx] : null;
  const perfect = playable && qs.length === 5 && score === 5;
  const totalGain = score * XP_TRIED + (perfect ? XP_CORRECT : 0);

  const pick = (higher: boolean) => {
    if (!q || picked != null) return;
    setPicked(higher);
    const ok = higher === q.answerHigher;
    if (ok) setScore(score + 1);
    onAward(ok ? XP_TRIED : 0);
    onSrs(q.term, ok);
    if (ok) onCollect(q.term);
  };
  const next = () => {
    if (!qs) return;
    if (idx + 1 < qs.length) {
      setIdx(idx + 1);
      setPicked(null);
    } else {
      if (!bonusRef.current) {
        bonusRef.current = true;
        if (qs.length === 5 && score === 5) onAward(XP_CORRECT);
      }
      setPhase('summary');
    }
    window.scrollTo(0, 0);
  };

  return (
    <div style={{ minHeight: '100vh', background: P.bg, color: P.ink, fontFamily: WIM_FONT }}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 18px calc(40px + env(safe-area-inset-bottom))' }}>
        <PlayTopBar
          onClose={onClose}
          backLabel={t.backHome}
          prog={!playable ? 0.1 : phase === 'summary' ? 1 : (idx + (picked != null ? 1 : 0.4)) / qs.length}
          chip={playable && phase === 'play' ? `${score}/${qs.length}` : null}
        />

        {!loaded && <PlayLoading label={t.loadingData} />}
        {loaded && !playable && <PlayEmpty t={t} onClose={onClose} />}

        {playable && phase === 'play' && q && (
          <>
            {/* 집중 드릴 배너 — 오늘은 이 지표 하나를 여러 종목으로 (제품 정의 §2) */}
            {focusTerm && (
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, background: P.heroSoft, border: '1px solid rgba(108,92,231,0.18)', borderRadius: 14, padding: '9px 13px', animation: `wimUp 0.24s ${EASE_OUT} both` }}>
                <Ic name="chart" size={14} color={P.heroDeep} sw={2} />
                <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 900, color: P.heroDeep }}>{t.drillFocus}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 900, color: P.ink }}>{METRIC_GLOSSARY[focusTerm].title[loc]}</span>
                <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 9.5, fontWeight: 800, color: P.faint }}>{t.drillFocusSub}</span>
              </div>
            )}
            <div style={{ marginTop: focusTerm ? 10 : 16, background: '#fff', borderRadius: 24, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '18px 16px', textAlign: 'center', animation: `wimUp 0.26s ${EASE_OUT} both` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <TickerLogo ticker={q.ticker} size={30} />
                <span style={{ fontSize: 15.5, fontWeight: 900 }}>{q.ticker}</span>
                <span style={{ fontSize: 9, fontWeight: 900, color: P.mint, background: P.mintSoft, borderRadius: 99, padding: '3px 9px' }}>● {t.realData.toUpperCase()}</span>
                {q.review && <span style={{ fontSize: 9, fontWeight: 900, color: P.amber, background: P.amberSoft, borderRadius: 99, padding: '3px 9px' }}>{t.reviewChip}</span>}
              </div>
              <h1 style={{ margin: '13px 0 0', fontSize: 19, fontWeight: 900, letterSpacing: '-0.01em', lineHeight: 1.4 }}>{q.label}</h1>
            </div>

            {/* two big buttons — violet both ways (no direction hype colors) */}
            <div style={{ display: 'flex', gap: 10, marginTop: 14, animation: `wimUp 0.26s ${EASE_OUT} 90ms both` }}>
              {[true, false].map((h) => {
                const isPick = picked === h;
                const isAnswer = q.answerHigher === h;
                const revealedNow = picked != null;
                const bg = !revealedNow ? '#fff' : isAnswer ? P.mintSoft : isPick ? P.amberSoft : '#fff';
                const border = !revealedNow ? P.line : isAnswer ? P.mint : isPick ? P.amber : P.line;
                return (
                  <button
                    key={String(h)} type="button" disabled={revealedNow} onClick={() => pick(h)}
                    style={{
                      font: 'inherit', flex: 1, cursor: revealedNow ? 'default' : 'pointer', position: 'relative',
                      background: bg, border: `2px solid ${border}`, borderRadius: 20, padding: '18px 0',
                      fontSize: 16, fontWeight: 900, color: P.ink,
                      boxShadow: revealedNow ? 'none' : '0 3px 0 rgba(76,63,175,0.12)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      animation: revealedNow && isPick && !isAnswer ? WRONG_ANIM : undefined,
                    }}
                  >
                    <Ic name={h ? 'chevUp' : 'chevDown'} size={22} color={P.heroDeep} sw={2.4} />
                    {h ? t.senseHigher : t.senseLower}
                    {revealedNow && isPick && isAnswer && <CorrectBurst gain={XP_TRIED} />}
                  </button>
                );
              })}
            </div>

            {/* 빈 하단 활용(2026-07-20): 문제 종목의 실제 세션 차트 + 지표 힌트 —
                맨숫자 추측이 아니라 맥락 속에서 감을 기른다 (실데이터 원칙).
                추측 단계에만 표시 — 정답 후엔 리빌 카드가 그 자리를 이어받는다. */}
            {picked == null && labMap[q.ticker]?.spark && (labMap[q.ticker].spark as NonNullable<LabData['spark']>).closes.length >= 8 && (
              <div style={{ marginTop: 14, background: '#fff', borderRadius: 20, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '11px 10px 5px', animation: `wimUp 0.3s ${EASE_OUT} both` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 5px 6px' }}>
                  <TickerLogo ticker={q.ticker} size={16} />
                  <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '0.05em', color: P.faint }}>{t.senseChart.toUpperCase()}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 8.5, fontWeight: 900, color: P.mint, background: P.mintSoft, borderRadius: 99, padding: '2px 8px' }}>● {t.realData.toUpperCase()}</span>
                </div>
                <RealChart closes={(labMap[q.ticker].spark as NonNullable<LabData['spark']>).closes} height={92} />
              </div>
            )}
            {picked == null && METRIC_GLOSSARY[q.term] && (
              <div style={{ marginTop: 10, display: 'flex', gap: 9, background: P.heroSoft, borderRadius: 16, padding: '11px 13px', alignItems: 'flex-start', animation: `wimUp 0.3s ${EASE_OUT} 60ms both` }}>
                <span style={{ color: P.heroDeep, marginTop: 1 }}><Ic name="book2" size={15} sw={1.9} /></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: P.heroDeep }}>{t.senseHint} · {METRIC_GLOSSARY[q.term].title[loc]}</div>
                  <div style={{ marginTop: 3, fontSize: 11.5, lineHeight: 1.6, fontWeight: 650 as any, color: P.sub, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{METRIC_GLOSSARY[q.term].body[loc]}</div>
                </div>
              </div>
            )}

            {picked != null && (
              <div style={{ animation: 'wimPop 0.4s cubic-bezier(0.22,1,0.36,1)' }}>
                <div style={{ marginTop: 14, textAlign: 'center', fontSize: 18, fontWeight: 900, color: picked === q.answerHigher ? P.mint : P.amber, animation: 'wimJudge 0.35s ease both' }}>
                  {picked === q.answerHigher ? `${t.correct} +${XP_TRIED}XP` : t.notQuite}
                </div>
                <div style={{ marginTop: 10, background: '#fff', borderRadius: 20, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', color: P.faint }}>{t.senseActual.toUpperCase()}</div>
                  <div style={{ marginTop: 2, fontSize: 34, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: P.heroDeep }}>
                    {q.prefix}<CountUp value={q.actual} decimals={q.decimals} />{q.suffix}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 800, color: P.faint }}>{t.senseVs} {q.thresholdLabel}</div>
                  <p style={{ margin: '11px 0 0', fontSize: 13, lineHeight: 1.65, fontWeight: 650 as any, color: P.sub, textAlign: 'left' }}>{q.meaning}</p>
                </div>
                <button type="button" onClick={next} style={{ font: 'inherit', width: '100%', marginTop: 14, background: P.ink, color: '#fff', border: 'none', borderRadius: 18, padding: '15px 0', fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 0 rgba(38,34,64,0.35)' }}>
                  {idx + 1 < qs.length ? `${t.nextRound} →` : `${t.seeResults} →`}
                </button>
              </div>
            )}
          </>
        )}

        {playable && phase === 'summary' && (
          <div style={{ animation: 'wimUp 0.35s ease' }}>
            <div style={{ marginTop: 18, background: '#fff', borderRadius: 24, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '22px 18px', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', color: P.heroDeep }}><Ic name="updown" size={26} sw={2} /></div>
              <div style={{ marginTop: 8, fontSize: 17, fontWeight: 900 }}>{t.senseSummary}</div>
              <div style={{ marginTop: 8, fontSize: 38, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: P.heroDeep }}>{score}/{qs.length}</div>
              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 900, color: P.hero, fontVariantNumeric: 'tabular-nums' }}>+{totalGain} {t.xp}</div>
              {perfect && (
                <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: P.amberSoft, color: P.amber, borderRadius: 99, padding: '6px 13px', fontSize: 12, fontWeight: 900 }}>
                  <Ic name="spark" size={14} color={P.amber} /> {t.senseBonus} +{XP_CORRECT}XP
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} style={{ font: 'inherit', width: '100%', marginTop: 14, background: P.ink, color: '#fff', border: 'none', borderRadius: 18, padding: '15px 0', fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 0 rgba(38,34,64,0.35)' }}>{t.backHome}</button>
          </div>
        )}

        <div style={{ marginTop: 18, textAlign: 'center', fontSize: 10, color: P.faint, fontWeight: 600, lineHeight: 1.5 }}>{disclaimer}</div>
      </div>
    </div>
  );
}

// ── P2 REPLAY MYSTERY: the FINISHED session redraws itself bar by bar (auto-play
// + scrubber). Play pauses at data-computed checkpoints and asks what can be read
// off the already-drawn portion — resolved bars only, never "what comes next"
// (compliance §7). The finale reveals the unit's real cause story and hands off
// to the full quiz for that unit.
interface ReplayCp { idx: number; kind: 'move' | 'vwap' | 'day'; q: string; opts: string[]; correct: number; fact: string }

function ReplayPlay({ unit, loc, t, onAward, onCollect, onSrs, onOpenQuiz, onClose, disclaimer }: {
  unit: Unit | null;
  loc: Lang;
  t: Record<string, string>;
  onAward: (gain: number) => void;
  onCollect: (term: MetricTerm) => void;
  onSrs: (term: string, ok: boolean) => void;
  onOpenQuiz: () => void;
  onClose: () => void;
  disclaimer: string;
}) {
  const closes = useMemo(() => (unit?.spark && unit.spark.closes.length >= 60 ? unit.spark.closes : null), [unit]);
  const vwap = useMemo(() => (closes && unit?.spark?.vwap && unit.spark.vwap.length === closes.length ? unit.spark.vwap : null), [closes, unit]);
  const n = closes?.length || 0;

  const [vi, setVi] = useState(2); // visible bar count — the chart "draws itself" as this grows
  const [playing, setPlaying] = useState(true);
  const [cpOpen, setCpOpen] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<number, { pick: number; ok: boolean }>>({});
  const [phase, setPhase] = useState<'play' | 'finale'>('play');
  const [cw, setCw] = useState(320);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrubbing = useRef(false);

  // 2-3 checkpoints computed from the data itself — every answer is decidable
  // from the drawn bars: (a) the session's single biggest 5-min move, (b) the
  // first sustained VWAP cross after it (fallback: a clear-gap bar late in the
  // session), (c) the finished day in one line
  const cps = useMemo<ReplayCp[]>(() => {
    if (!closes) return [];
    const len = closes.length;
    const out: ReplayCp[] = [];
    let bi = 1; let bd = 0;
    for (let i = 1; i <= len - 3; i++) { const d = Math.abs(closes[i] - closes[i - 1]); if (d > bd) { bd = d; bi = i; } }
    const delta = closes[bi] - closes[bi - 1];
    const movePct = (delta / closes[bi - 1]) * 100;
    const moveCorrect = Math.abs(movePct) < 0.2 ? 2 : delta > 0 ? 1 : 0;
    out.push({ idx: bi, kind: 'move', q: t.replayQMove, opts: [t.replayOptDown, t.replayOptUp, t.replayOptFlat], correct: moveCorrect, fact: t.replayFactMove.replace('{v}', `${movePct >= 0 ? '+' : ''}${movePct.toFixed(2)}`) });
    if (vwap) {
      const side = (i: number) => closes[i] - vwap[i];
      let cross = -1;
      for (let j = bi + 1; j <= len - 4; j++) {
        if (side(j) !== 0 && side(j - 1) !== 0 && Math.sign(side(j)) !== Math.sign(side(j - 1))
          && Math.sign(side(j + 1)) === Math.sign(side(j)) && Math.sign(side(j + 2)) === Math.sign(side(j))) { cross = j + 2; break; }
      }
      const seed = cross !== -1 ? cross : Math.round(len * 0.72);
      // the paused bar needs a visible price-vs-VWAP gap or the question is a coin flip
      const clear = (k: number) => Math.abs(closes[k] - vwap[k]) / closes[k] >= 0.0005;
      let found = -1;
      for (let k = Math.max(bi + 1, seed); k <= len - 2; k++) if (clear(k)) { found = k; break; }
      if (found === -1) for (let k = Math.min(len - 2, seed); k > bi; k--) if (clear(k)) { found = k; break; }
      if (found !== -1) {
        out.push({ idx: found, kind: 'vwap', q: t.replayQVwap, opts: [t.replayOptAbove, t.replayOptBelow], correct: closes[found] > vwap[found] ? 0 : 1, fact: t.replayFactVwap.replace('{p}', fmtPx(closes[found])).replace('{v}', fmtPx(vwap[found])) });
      }
    }
    const dayPct = ((closes[len - 1] - closes[0]) / closes[0]) * 100;
    const dayCorrect = Math.abs(dayPct) < 1 ? 2 : dayPct > 0 ? 0 : 1;
    out.push({ idx: len - 1, kind: 'day', q: t.replayQDay, opts: [t.replayOptDayUp, t.replayOptDayDown, t.replayOptDayQuiet], correct: dayCorrect, fact: t.replayFactDay.replace('{v}', `${dayPct >= 0 ? '+' : ''}${dayPct.toFixed(1)}`) });
    return out;
  }, [closes, vwap, t]);

  // one fixed price domain for the whole replay (all bars are resolved) — no
  // rescaling jumps while the line grows
  const domain = useMemo(() => {
    if (!closes) return null;
    const vals = vwap ? [...closes, ...vwap] : closes;
    const lo0 = Math.min(...vals); const hi0 = Math.max(...vals);
    const pad = (hi0 - lo0 || Math.abs(hi0) * 0.02 || 1) * 0.05;
    return { lo: lo0 - pad, hi: hi0 + pad };
  }, [closes, vwap]);

  useEffect(() => {
    const measure = () => { if (wrapRef.current) setCw(wrapRef.current.clientWidth || 320); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [phase]);

  // auto-play: one bar every ~35ms while not paused and no question is open
  useEffect(() => {
    if (!playing || cpOpen != null || phase !== 'play' || !n) return;
    const id = setInterval(() => setVi((v) => Math.min(n, v + 1)), 35);
    return () => clearInterval(id);
  }, [playing, cpOpen, phase, n]);

  // checkpoint gate: reaching an unanswered checkpoint (by auto-play OR scrub)
  // clamps the drawing there, pauses, and opens the question
  useEffect(() => {
    if (!closes || phase !== 'play' || cpOpen != null) return;
    const nxt = cps.findIndex((_, i) => !answers[i]);
    if (nxt === -1) return;
    if (vi - 1 >= cps[nxt].idx) {
      setVi(cps[nxt].idx + 1);
      setCpOpen(nxt);
      setPlaying(false);
    }
  }, [vi, closes, phase, cpOpen, cps, answers]);

  const nextCp = cps.findIndex((_, i) => !answers[i]);
  const maxVi = nextCp === -1 ? n : cps[nextCp].idx + 1;
  const viFromX = (clientX: number) => {
    const el = trackRef.current;
    if (!el || !n) return;
    const r = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / (r.width || 1)));
    setVi(Math.max(2, Math.min(maxVi, Math.round(frac * n))));
  };

  const pickCp = (oi: number) => {
    if (cpOpen == null || answers[cpOpen]) return;
    const cp = cps[cpOpen];
    const ok = oi === cp.correct;
    setAnswers({ ...answers, [cpOpen]: { pick: oi, ok } });
    onAward(ok ? XP_TRIED : 0);
    if (cp.kind === 'vwap') onSrs('vwap', ok);
    if (ok && cp.kind === 'vwap') onCollect('vwap');
  };
  const continueCp = () => {
    if (cpOpen == null) return;
    const last = cpOpen === cps.length - 1;
    setCpOpen(null);
    if (last) { setPhase('finale'); window.scrollTo(0, 0); }
    else setPlaying(true);
  };

  const CH = 240;
  const lo = domain ? domain.lo : 0;
  const span = domain ? (domain.hi - domain.lo || 1) : 1;
  const yOf = (v: number) => CH - 16 - ((v - lo) / span) * (CH - 32);
  const x = (i: number) => (i / Math.max(1, n - 1)) * cw;
  const drawn = closes ? closes.slice(0, vi) : [];
  const linePath = drawn.map((c, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${yOf(c).toFixed(1)}`).join(' ');
  const vwPath = vwap ? vwap.slice(0, vi).map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ') : null;

  const playable = !!unit && !!closes && !!domain && cps.length > 0;
  const score = Object.values(answers).filter((a) => a.ok).length;
  const cp = cpOpen != null ? cps[cpOpen] : null;
  const cpAns = cpOpen != null ? answers[cpOpen] : undefined;

  return (
    <div style={{ minHeight: '100vh', background: P.bg, color: P.ink, fontFamily: WIM_FONT }}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 18px calc(40px + env(safe-area-inset-bottom))' }}>
        <PlayTopBar
          onClose={onClose}
          backLabel={t.backHome}
          prog={!playable ? 0.1 : phase === 'finale' ? 1 : vi / n}
          chip={playable && phase === 'play' ? `${Object.keys(answers).length}/${cps.length}` : null}
        />

        {!playable && <PlayEmpty t={t} onClose={onClose} />}

        {playable && unit && closes && domain && (
          <>
            {/* the session chart, drawing itself — fixed domain, resolved bars only */}
            <div style={{ marginTop: 14, background: '#fff', borderRadius: 22, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '14px 15px 10px', animation: `wimUp 0.26s ${EASE_OUT} both` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TickerLogo ticker={unit.ticker} size={28} />
                <span style={{ fontSize: 14.5, fontWeight: 900 }}>{unit.ticker}</span>
                <span style={{ fontSize: 9.5, fontWeight: 800, color: P.faint }}>{unit.dateET}</span>
                <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 900, color: P.mint, background: P.mintSoft, borderRadius: 99, padding: '3px 9px' }}>● {t.realData.toUpperCase()}</span>
              </div>
              {phase === 'play' && cpOpen == null && (
                <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 750 as any, color: P.hero, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Ic name="replay" size={13} color={P.hero} /> {t.replayHint}
                </div>
              )}
              <div ref={wrapRef} style={{ marginTop: 8, position: 'relative' }}>
                <svg viewBox={`0 0 ${cw} ${CH}`} style={{ width: '100%', height: CH, display: 'block' }} aria-hidden>
                  <defs>
                    <linearGradient id="wimReplayFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={P.hero} stopOpacity="0.22" />
                      <stop offset="100%" stopColor={P.hero} stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  <path d={`${linePath} L${x(vi - 1).toFixed(1)},${CH} L0,${CH} Z`} fill="url(#wimReplayFill)" />
                  <path d={linePath} fill="none" stroke={P.hero} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
                  {vwPath && <path d={vwPath} fill="none" stroke={P.amber} strokeWidth="1.6" strokeDasharray="5 4" opacity="0.9" />}
                  {cps.map((c, i) => (answers[i]
                    ? <circle key={c.kind} cx={x(c.idx).toFixed(1)} cy={yOf(closes[c.idx]).toFixed(1)} r="3.5" fill={P.amber} stroke="#fff" strokeWidth="1.2" />
                    : null))}
                  {/* soft pulsing halo around the leading dot (ambient CSS loop) */}
                  <circle cx={x(vi - 1).toFixed(1)} cy={yOf(closes[vi - 1]).toFixed(1)} r="9" fill={P.heroDeep} style={{ animation: 'wimHalo 1.6s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: 'center' }} />
                  <circle cx={x(vi - 1).toFixed(1)} cy={yOf(closes[vi - 1]).toFixed(1)} r="4.5" fill={P.heroDeep} stroke="#fff" strokeWidth="1.6" />
                  <text x={cw - 4} y="12" textAnchor="end" fontSize="9" fontWeight="800" fill={P.faint}>${fmtPx(domain.hi)}</text>
                  <text x={cw - 4} y={CH - 4} textAnchor="end" fontSize="9" fontWeight="800" fill={P.faint}>${fmtPx(domain.lo)}</text>
                </svg>
                {/* "time freezes": the drawn chart dims slightly while a question is open */}
                <div aria-hidden style={{ position: 'absolute', inset: 0, background: P.ink, opacity: cpOpen != null ? 0.12 : 0, transition: 'opacity 0.24s ease', pointerEvents: 'none', borderRadius: 10 }} />
              </div>
              {vwPath && (
                <div style={{ padding: '2px 2px 0', fontSize: 9.5, fontWeight: 800, color: P.amber }}>― ― {t.vwapLine}</div>
              )}
              {phase === 'play' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, padding: '0 2px 2px' }}>
                  <button
                    type="button" disabled={cpOpen != null} onClick={() => setPlaying((p) => !p)}
                    aria-label={playing ? t.replayPause : t.replayResume}
                    style={{ font: 'inherit', width: 38, height: 38, borderRadius: '50%', border: 'none', background: P.ink, opacity: cpOpen != null ? 0.45 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: cpOpen != null ? 'default' : 'pointer', flexShrink: 0 }}
                  >
                    <Ic name={playing ? 'pause' : 'play'} size={16} color="#fff" sw={2.2} />
                  </button>
                  {/* scrubber — touch-action none + pointer capture so dragging never scrolls (iOS) */}
                  <div
                    ref={trackRef}
                    onPointerDown={(e) => {
                      if (cpOpen != null || phase !== 'play') return;
                      scrubbing.current = true;
                      setPlaying(false);
                      try { (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId); } catch { /* older webview */ }
                      viFromX(e.clientX);
                    }}
                    onPointerMove={(e) => { if (scrubbing.current && cpOpen == null) viFromX(e.clientX); }}
                    onPointerUp={() => { scrubbing.current = false; }}
                    onPointerCancel={() => { scrubbing.current = false; }}
                    style={{ position: 'relative', flex: 1, height: 32, display: 'flex', alignItems: 'center', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: cpOpen != null ? 'default' : 'ew-resize' }}
                  >
                    <div style={{ width: '100%', height: 5, borderRadius: 99, background: P.heroSoft, overflow: 'hidden' }}>
                      <div style={{ width: `${(vi / n) * 100}%`, height: '100%', background: P.hero, borderRadius: 99 }} />
                    </div>
                    <div style={{ position: 'absolute', left: `calc(${((vi / n) * 100).toFixed(2)}% - 8px)`, width: 16, height: 16, borderRadius: '50%', background: P.heroDeep, border: '2.5px solid #fff', boxShadow: '0 2px 6px rgba(38,34,64,0.35)', pointerEvents: 'none' }} />
                  </div>
                </div>
              )}
            </div>

            {/* checkpoint question — slides in from the bottom while the chart freezes */}
            {cp && (
              <div style={{ animation: `wimUp 0.24s ${EASE_OUT} both` }}>
                <div style={{ marginTop: 12, background: '#fff', borderRadius: 20, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '14px 15px' }}>
                  <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', color: P.hero }}>{t.replayCheckpoint.toUpperCase()} {(cpOpen as number) + 1}/{cps.length}</div>
                  <h2 style={{ margin: '7px 0 0', fontSize: 16.5, fontWeight: 900, letterSpacing: '-0.01em', lineHeight: 1.35 }}>{cp.q}</h2>
                  <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {cp.opts.map((o, oi) => {
                      const revealedNow = !!cpAns;
                      const isPick = cpAns?.pick === oi;
                      const isAnswer = cp.correct === oi;
                      const bg = !revealedNow ? '#fff' : isAnswer ? P.mintSoft : isPick ? P.amberSoft : '#fff';
                      const border = !revealedNow ? P.line : isAnswer ? P.mint : isPick ? P.amber : P.line;
                      return (
                        <button key={o} type="button" disabled={revealedNow} onClick={() => pickCp(oi)} style={{ font: 'inherit', textAlign: 'left', cursor: revealedNow ? 'default' : 'pointer', position: 'relative', background: bg, border: `2px solid ${border}`, borderRadius: 15, padding: '12px 13px', fontSize: 13.5, fontWeight: 800, color: P.ink, lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: 8, boxShadow: revealedNow ? 'none' : '0 3px 0 rgba(76,63,175,0.12)', animation: revealedNow && isPick && !isAnswer ? WRONG_ANIM : undefined }}>
                          <span style={{ flex: 1 }}>{o}</span>
                          {revealedNow && isAnswer && <Ic name="check" size={16} color={P.mint} sw={2.6} />}
                          {revealedNow && isPick && !isAnswer && <Ic name="close" size={14} color={P.amber} sw={2.4} />}
                          {revealedNow && isPick && isAnswer && <CorrectBurst gain={XP_TRIED} />}
                        </button>
                      );
                    })}
                  </div>
                  {cpAns && (
                    <div style={{ animation: 'wimUp 0.3s ease' }}>
                      <div style={{ marginTop: 12, textAlign: 'center', fontSize: 16, fontWeight: 900, color: cpAns.ok ? P.mint : P.amber, animation: 'wimJudge 0.35s ease both' }}>
                        {cpAns.ok ? `${t.correct} +${XP_TRIED}XP` : t.notQuite}
                      </div>
                      <div style={{ marginTop: 5, textAlign: 'center', fontSize: 12, fontWeight: 800, color: P.sub, fontVariantNumeric: 'tabular-nums' }}>{cp.fact}</div>
                      <button type="button" onClick={continueCp} style={{ font: 'inherit', width: '100%', marginTop: 12, background: P.ink, color: '#fff', border: 'none', borderRadius: 16, padding: '13px 0', fontSize: 14, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 0 rgba(38,34,64,0.35)' }}>
                        {cpOpen === cps.length - 1 ? `${t.seeResults} →` : `${t.replayContinue} →`}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* finale — the real cause story behind the day just replayed */}
            {phase === 'finale' && (
              <div style={{ animation: 'wimUp 0.35s ease' }}>
                <div style={{ marginTop: 12, background: '#fff', borderRadius: 20, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '15px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '0.1em', color: P.hero }}>{t.replayFinale.toUpperCase()}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 900, color: P.heroDeep, background: P.heroSoft, borderRadius: 99, padding: '4px 10px', fontVariantNumeric: 'tabular-nums' }}>{score}/{cps.length} · +{score * XP_TRIED} {t.xp}</span>
                  </div>
                  <p style={{ margin: '9px 0 0', fontSize: 14.5, lineHeight: 1.7, fontWeight: 600 as any }}><Bold text={unit.explanation[loc]} /></p>
                  <button type="button" onClick={onOpenQuiz} style={{ font: 'inherit', width: '100%', marginTop: 13, background: P.heroSoft, color: P.heroDeep, border: 'none', borderRadius: 14, padding: '12px 0', fontSize: 13.5, fontWeight: 900, cursor: 'pointer' }}>{t.replayOpenQuiz} →</button>
                </div>
                <button type="button" onClick={onClose} style={{ font: 'inherit', width: '100%', marginTop: 14, background: P.ink, color: '#fff', border: 'none', borderRadius: 18, padding: '15px 0', fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 0 rgba(38,34,64,0.35)' }}>{t.backHome}</button>
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 18, textAlign: 'center', fontSize: 10, color: P.faint, fontWeight: 600, lineHeight: 1.5 }}>{disclaimer}</div>
      </div>
    </div>
  );
}

// ── P5 MACRO DOMINO: today's REAL macro picture (FedWatch odds · Treasury curve ·
// econ calendar) rendered as a tap-through domino chain — policy rate → yields/
// discount rate → growth valuations → sector rotation. Every number is an
// already-published reading; every micro-question is conceptual and timeless;
// mechanisms are worded as historical tendencies, never forecasts (compliance §7).
interface FedWatchData { ease: number; noChange: number; hike: number; daysUntilFomc: number | null }
interface EconEvent { date: string; time: string; event: string; impact: string; category: string; actual: number | null; estimate: number | null; previous: number | null; unit?: string | null }
interface TreasuryData { yield10Y: number | null; yield2Y: number | null; yield30Y: number | null }

// ── W6-A shared macro feeds: the domino play's three same-origin GETs hoisted
// behind ONE module-level in-flight promise — the home S1 pulse strip and the
// play read the same fetch (no duplicate requests per page load, no new APIs)
interface MacroFeeds { fw: FedWatchData | null; ty: TreasuryData | null; events: EconEvent[] }
let macroFlight: Promise<MacroFeeds> | null = null;
function fetchMacroFeeds(): Promise<MacroFeeds> {
  if (!macroFlight) {
    const j = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    macroFlight = Promise.all([j('/api/guardian/fedwatch'), j('/api/guardian/economic-calendar'), j('/api/live/treasury')]).then(([f, c, y]) => ({
      fw: f && typeof f.noChange === 'number' ? (f as FedWatchData) : null,
      ty: y && typeof y.yield10Y === 'number' ? (y as TreasuryData) : null,
      events: c && Array.isArray(c.events) ? (c.events as EconEvent[]) : [],
    }));
  }
  return macroFlight;
}
interface DominoStat { k: string; v: number; decimals: number; prefix?: string; suffix?: string }
interface DominoNode { title: string; q: string; opts: [string, string]; correct: 0 | 1; mech: string; stats: DominoStat[] }

// one stat tile (CountUp only while the reveal is fresh — settled text afterwards)
function DominoStatTile({ s, animate, onDark }: { s: DominoStat; animate: boolean; onDark?: boolean }) {
  return (
    <div style={{ background: onDark ? 'rgba(255,255,255,0.16)' : P.bg, borderRadius: 12, padding: '8px 11px', minWidth: 76 }}>
      <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.08em', color: onDark ? 'rgba(255,255,255,0.75)' : P.faint }}>{s.k.toUpperCase()}</div>
      <div style={{ marginTop: 2, fontSize: 17, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: onDark ? '#fff' : P.heroDeep }}>
        {s.prefix || ''}{animate ? <CountUp value={s.v} decimals={s.decimals} /> : s.v.toFixed(s.decimals)}{s.suffix || ''}
      </div>
    </div>
  );
}

function MacroDominoPlay({ t, onAward, onClose, disclaimer }: {
  t: Record<string, string>;
  onAward: (gain: number) => void;
  onClose: () => void;
  disclaimer: string;
}) {
  const [fw, setFw] = useState<FedWatchData | null>(null);
  const [headEvent, setHeadEvent] = useState<EconEvent | null>(null);
  const [ty, setTy] = useState<TreasuryData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [ni, setNi] = useState(0); // the one open (unanswered) node
  const [qOpen, setQOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<number, { pick: number; ok: boolean }>>({});
  const [phase, setPhase] = useState<'play' | 'finale'>('play');

  // W6-A: the three macro feeds now arrive via the shared page-wide fetch (S1
  // pulse strip already warmed it); headline pick = nearest HIGH-impact event
  // today/tomorrow ET → nearest fed-category event → FOMC countdown card
  // (all resolved schedule facts and already-published readings, no forecasting)
  useEffect(() => {
    let alive = true;
    fetchMacroFeeds().then(({ fw: f, ty: y, events }) => {
      if (!alive) return;
      if (f) setFw(f);
      const days = [etTodayStr(), etTodayStr(Date.now() + 86_400_000)];
      const soon = events.filter((e) => days.includes(e.date));
      setHeadEvent(soon.find((e) => e.impact === 'HIGH') || soon.find((e) => e.category === 'fed') || null);
      if (y) setTy(y);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  const nodes = useMemo<DominoNode[]>(() => [
    {
      title: t.dominoN1, q: t.dominoQ1, opts: [t.dominoQ1a, t.dominoQ1b], correct: 0, mech: t.dominoM1,
      stats: fw ? [
        { k: t.dominoHoldProb, v: fw.noChange, decimals: 1, suffix: '%' },
        ...(fw.daysUntilFomc != null ? [{ k: t.dominoNextFomc, v: fw.daysUntilFomc, decimals: 0, prefix: 'D-' }] : []),
      ] : [],
    },
    {
      title: t.dominoN2, q: t.dominoQ2, opts: [t.dominoQ2a, t.dominoQ2b], correct: 1, mech: t.dominoM2,
      stats: [
        ...(ty?.yield10Y != null ? [{ k: '10Y', v: ty.yield10Y, decimals: 2, suffix: '%' }] : []),
        ...(ty?.yield2Y != null ? [{ k: '2Y', v: ty.yield2Y, decimals: 2, suffix: '%' }] : []),
      ],
    },
    {
      title: t.dominoN3, q: t.dominoQ3, opts: [t.dominoQ3a, t.dominoQ3b], correct: 0, mech: t.dominoM3,
      stats: ty?.yield10Y != null && ty?.yield2Y != null
        ? [{ k: '10Y−2Y', v: Math.round((ty.yield10Y - ty.yield2Y) * 100) / 100, decimals: 2, suffix: '%p' }]
        : [],
    },
    {
      title: t.dominoN4, q: t.dominoQ4, opts: [t.dominoQ4a, t.dominoQ4b], correct: 0, mech: t.dominoM4,
      stats: fw ? [{ k: t.dominoHikeProb, v: fw.hike, decimals: 1, suffix: '%' }] : [],
    },
  ], [t, fw, ty]);

  const playable = loaded && (!!fw || !!ty);
  const answered = Object.keys(answers).length;
  const score = Object.values(answers).filter((a) => a.ok).length;

  const pick = (oi: number) => {
    if (answers[ni] || phase !== 'play') return;
    const ok = oi === nodes[ni].correct;
    setAnswers({ ...answers, [ni]: { pick: oi, ok } });
    onAward(ok ? XP_TRIED : 0);
  };
  const nextNode = () => {
    if (ni + 1 < nodes.length) { setNi(ni + 1); setQOpen(false); }
    else setPhase('finale');
  };

  // finale recap: the day's macro numbers in one strip (only what actually loaded)
  const recap: DominoStat[] = [
    ...(ty?.yield10Y != null ? [{ k: '10Y', v: ty.yield10Y, decimals: 2, suffix: '%' }] : []),
    ...(ty?.yield2Y != null ? [{ k: '2Y', v: ty.yield2Y, decimals: 2, suffix: '%' }] : []),
    ...(fw ? [{ k: t.dominoHoldProb, v: fw.noChange, decimals: 1, suffix: '%' }] : []),
    ...(fw?.daysUntilFomc != null ? [{ k: t.dominoNextFomc, v: fw.daysUntilFomc, decimals: 0, prefix: 'D-' }] : []),
  ];

  const numDec = (v: number) => (Number.isInteger(v) ? 0 : 1);

  return (
    <div style={{ minHeight: '100vh', background: P.bg, color: P.ink, fontFamily: WIM_FONT }}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 18px calc(40px + env(safe-area-inset-bottom))' }}>
        <PlayTopBar
          onClose={onClose}
          backLabel={t.backHome}
          prog={!playable ? 0.1 : phase === 'finale' ? 1 : (answered + (qOpen ? 0.4 : 0)) / nodes.length}
          chip={playable && phase === 'play' ? `${answered}/${nodes.length}` : null}
        />

        {!loaded && <PlayLoading label={t.loadingData} />}
        {loaded && !playable && <PlayEmpty t={t} onClose={onClose} />}

        {playable && (
          <>
            {/* headline card — today's real macro item, big numbers roll up */}
            <div style={{ marginTop: 14, background: `linear-gradient(135deg, ${P.heroDeep}, ${P.hero})`, borderRadius: 22, padding: '15px 16px', color: '#fff', boxShadow: P.shadow, animation: `wimUp 0.26s ${EASE_OUT} both` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Ic name="bank" size={14} color="#FFD66B" />
                <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '0.1em', color: '#FFD66B' }}>{t.dominoHeader.toUpperCase()}</span>
                <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 900, color: '#7EE0AE', background: 'rgba(25,184,147,0.25)', borderRadius: 99, padding: '3px 9px' }}>● {t.realData.toUpperCase()}</span>
              </div>
              {headEvent ? (
                <>
                  <div style={{ marginTop: 10, fontSize: 17.5, fontWeight: 900, letterSpacing: '-0.01em', lineHeight: 1.3 }}>{headEvent.event}</div>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 900, fontVariantNumeric: 'tabular-nums', background: 'rgba(255,255,255,0.16)', borderRadius: 99, padding: '4px 10px' }}>{headEvent.date} · {headEvent.time} ET</span>
                    <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '0.05em', background: headEvent.impact === 'HIGH' ? P.amber : 'rgba(255,255,255,0.16)', color: headEvent.impact === 'HIGH' ? P.ink : '#fff', borderRadius: 99, padding: '4px 10px' }}>{headEvent.impact}</span>
                  </div>
                  {(headEvent.estimate != null || headEvent.previous != null) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      {headEvent.estimate != null && <DominoStatTile s={{ k: t.dominoEstimate, v: headEvent.estimate, decimals: numDec(headEvent.estimate), suffix: headEvent.unit || '' }} animate onDark />}
                      {headEvent.previous != null && <DominoStatTile s={{ k: t.dominoPrevious, v: headEvent.previous, decimals: numDec(headEvent.previous), suffix: headEvent.unit || '' }} animate onDark />}
                    </div>
                  )}
                </>
              ) : fw ? (
                <>
                  <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, opacity: 0.85 }}>{t.dominoNextFomc}</div>
                  <div style={{ marginTop: 2, fontSize: 34, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                    {fw.daysUntilFomc != null ? <>D-<CountUp value={fw.daysUntilFomc} decimals={0} /></> : '—'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <DominoStatTile s={{ k: t.dominoHoldProb, v: fw.noChange, decimals: 1, suffix: '%' }} animate onDark />
                    <DominoStatTile s={{ k: t.dominoHikeProb, v: fw.hike, decimals: 1, suffix: '%' }} animate onDark />
                  </div>
                </>
              ) : (
                <div style={{ marginTop: 10, fontSize: 34, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                  10Y <CountUp value={ty?.yield10Y || 0} decimals={2} />%
                </div>
              )}
            </div>

            {/* chain header */}
            {phase === 'play' && (
              <div style={{ marginTop: 16, padding: '0 2px', animation: `wimUp 0.26s ${EASE_OUT} 90ms both` }}>
                <div style={{ fontSize: 14.5, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 7 }}><Ic name="chain" size={15} color={P.heroDeep} sw={2} /> {t.dominoChainTitle}</div>
                <div style={{ marginTop: 2, fontSize: 11, fontWeight: 700, color: P.sub }}>{t.dominoChainSub}</div>
              </div>
            )}

            {/* the domino chain — nodes reveal one by one, question before mechanism */}
            {nodes.map((nd, i) => {
              const ans = answers[i];
              const isOpen = phase === 'play' && i === ni;
              const isLocked = !ans && !isOpen;
              const connector = (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: 2.5, height: 18, borderRadius: 99, background: P.line, overflow: 'hidden' }}>
                    {/* domino physics: the segment FILLS downward when the node above completes */}
                    <div style={{ width: '100%', height: '100%', borderRadius: 99, background: P.hero, transform: answers[i - 1] ? 'scaleY(1)' : 'scaleY(0)', transformOrigin: 'top', transition: 'transform 0.4s ease' }} />
                  </div>
                </div>
              );
              if (isLocked) {
                return (
                  <div key={nd.title}>
                    {i > 0 && connector}
                    <div style={{ borderRadius: 20, border: `1.5px dashed ${P.line}`, background: 'rgba(255,255,255,0.45)', padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 26, height: 26, borderRadius: 9, background: P.heroSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: P.faint }}>{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 850 as any, color: P.faint }}>{nd.title}</span>
                      <span style={{ marginLeft: 'auto', color: P.faint }}><Ic name="lock" size={14} /></span>
                    </div>
                  </div>
                );
              }
              if (ans && !isOpen) {
                return (
                  <div key={nd.title}>
                    {i > 0 && connector}
                    <div style={{ background: '#fff', borderRadius: 20, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '13px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 26, height: 26, borderRadius: 9, background: P.hero, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: '#fff' }}>{i + 1}</span>
                        <span style={{ fontSize: 13.5, fontWeight: 900 }}>{nd.title}</span>
                        <span style={{ marginLeft: 'auto', color: ans.ok ? P.mint : P.amber }}><Ic name={ans.ok ? 'check' : 'close'} size={14} sw={2.4} /></span>
                      </div>
                      {nd.stats.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          {nd.stats.map((s) => <DominoStatTile key={s.k} s={s} animate={false} />)}
                        </div>
                      )}
                      <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.6, fontWeight: 650 as any, color: P.sub }}>{nd.mech}</p>
                    </div>
                  </div>
                );
              }
              return (
                <div key={nd.title}>
                  {i > 0 && connector}
                  {/* the next domino "falls" into place: tiny tilt + settle as it opens */}
                  <div style={{ background: '#fff', borderRadius: 20, border: `1.5px solid ${P.hero}55`, boxShadow: P.shadow, padding: '14px 15px', animation: `wimTilt 0.3s ${EASE_OUT} both` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 26, height: 26, borderRadius: 9, background: P.hero, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: '#fff' }}>{i + 1}</span>
                      <span style={{ fontSize: 14, fontWeight: 900 }}>{nd.title}</span>
                    </div>
                    {!qOpen && (
                      <button type="button" onClick={() => setQOpen(true)} style={{ font: 'inherit', width: '100%', marginTop: 12, background: P.heroSoft, color: P.heroDeep, border: 'none', borderRadius: 14, padding: '12px 0', fontSize: 13.5, fontWeight: 900, cursor: 'pointer' }}>{t.dominoTapOpen} →</button>
                    )}
                    {qOpen && (
                      <div style={{ animation: 'wimUp 0.25s ease' }}>
                        <h2 style={{ margin: '11px 0 0', fontSize: 15.5, fontWeight: 900, letterSpacing: '-0.01em', lineHeight: 1.4 }}>{nd.q}</h2>
                        <div style={{ display: 'flex', gap: 9, marginTop: 11 }}>
                          {nd.opts.map((o, oi) => {
                            const revealedNow = !!ans;
                            const isPick = ans?.pick === oi;
                            const isAnswer = nd.correct === oi;
                            const bg = !revealedNow ? '#fff' : isAnswer ? P.mintSoft : isPick ? P.amberSoft : '#fff';
                            const border = !revealedNow ? P.line : isAnswer ? P.mint : isPick ? P.amber : P.line;
                            return (
                              <button key={o} type="button" disabled={revealedNow} onClick={() => pick(oi)} style={{ font: 'inherit', flex: 1, cursor: revealedNow ? 'default' : 'pointer', position: 'relative', background: bg, border: `2px solid ${border}`, borderRadius: 15, padding: '13px 8px', fontSize: 13.5, fontWeight: 900, color: P.ink, lineHeight: 1.35, boxShadow: revealedNow ? 'none' : '0 3px 0 rgba(76,63,175,0.12)', animation: revealedNow && isPick && !isAnswer ? WRONG_ANIM : undefined }}>
                                {o}
                                {revealedNow && isPick && isAnswer && <CorrectBurst gain={XP_TRIED} />}
                              </button>
                            );
                          })}
                        </div>
                        {ans && (
                          <div style={{ animation: 'wimPop 0.4s cubic-bezier(0.22,1,0.36,1)' }}>
                            <div style={{ marginTop: 12, textAlign: 'center', fontSize: 16, fontWeight: 900, color: ans.ok ? P.mint : P.amber, animation: 'wimJudge 0.35s ease both' }}>
                              {ans.ok ? `${t.correct} +${XP_TRIED}XP` : t.notQuite}
                            </div>
                            {nd.stats.length > 0 && (
                              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                                {nd.stats.map((s) => <DominoStatTile key={s.k} s={s} animate />)}
                              </div>
                            )}
                            <p style={{ margin: '11px 0 0', fontSize: 13, lineHeight: 1.65, fontWeight: 650 as any, color: P.sub }}>{nd.mech}</p>
                            <button type="button" onClick={nextNode} style={{ font: 'inherit', width: '100%', marginTop: 12, background: P.ink, color: '#fff', border: 'none', borderRadius: 16, padding: '13px 0', fontSize: 14, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 0 rgba(38,34,64,0.35)' }}>
                              {i + 1 < nodes.length ? `${t.dominoNext} →` : `${t.seeResults} →`}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* finale — chain summary + the day's numbers in one strip */}
            {phase === 'finale' && (
              <div style={{ animation: 'wimUp 0.35s ease' }}>
                <div style={{ marginTop: 16, background: '#fff', borderRadius: 24, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '20px 18px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', color: P.heroDeep }}><Ic name="chain" size={26} sw={2} /></div>
                  <div style={{ marginTop: 8, fontSize: 17, fontWeight: 900 }}>{t.dominoFinale}</div>
                  <div style={{ marginTop: 3, fontSize: 13, fontWeight: 900, color: P.hero, fontVariantNumeric: 'tabular-nums' }}>{score}/{nodes.length} · +{score * XP_TRIED} {t.xp}</div>
                  {recap.length > 0 && (
                    <>
                      <div style={{ marginTop: 14, fontSize: 9.5, fontWeight: 900, letterSpacing: '0.1em', color: P.faint }}>{t.dominoRecap.toUpperCase()}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {recap.map((s) => <DominoStatTile key={s.k} s={s} animate={false} />)}
                      </div>
                    </>
                  )}
                </div>
                <button type="button" onClick={onClose} style={{ font: 'inherit', width: '100%', marginTop: 14, background: P.ink, color: '#fff', border: 'none', borderRadius: 18, padding: '15px 0', fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 0 rgba(38,34,64,0.35)' }}>{t.backHome}</button>
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 18, textAlign: 'center', fontSize: 10, color: P.faint, fontWeight: 600, lineHeight: 1.5 }}>{disclaimer}</div>
      </div>
    </div>
  );
}

// ── W6-B NEWS→MONEY LESSON: one Undercurrent feed story a day becomes a
// three-step reading lesson — ① what the headline said, ② what the money
// actually printed (or honestly: it stayed quiet — that too is the lesson),
// ③ one two-choice question always decidable from what is already on screen.
// Everything rendered is a past-tense observation of finished data; this
// teaches READING the news, never trading on it (compliance §7).
interface UcMoney { darkPoolPct: number | null; volumePcr: number | null; squeezeScore: number | null; maxPain: number | null; price: number | null }
interface UcCard {
  ticker: string; plainTitle: string; whyItMatters: string | null;
  moneyRead: string | null; moneyMood: string; hasMoneyData: boolean;
  money: UcMoney | null; newsSentiment: string | null; image: string | null;
  source: string | null;
}

// Company names arrive at legal length ("Taiwan Semiconductor Manufacturing
// Company Limited") — the hero reads like a headline, so strip suffixes and keep
// the first two words when the legal name would eat the whole clamp.
function shortCompanyName(name: string | null | undefined, ticker: string): string {
  if (!name) return ticker;
  // legal tails come in layers ("Meta Platforms, Inc. Class A") — strip class
  // suffixes first, then the corporate form, then any punctuation left behind
  // (the headline template adds its own comma; ",," shipped live on 2026-07-20).
  const cleaned = name
    .replace(/\s+Class\s+[A-C]$/i, '')
    .replace(/[,.]?\s+(Inc|Corp|Corporation|Company|Co|Ltd|Limited|plc|Holdings|Holding|Group|SA|NV|AG|ADR)\.?$/i, '')
    .trim();
  const base = cleaned.length <= 24 ? cleaned : cleaned.split(/\s+/).slice(0, 2).join(' ');
  return base.replace(/[,.\s]+$/, '') || ticker;
}

// real news photo with a graceful exit — a broken/blocked image hides the whole
// block instead of leaving a broken-glass frame on the editorial card
function NewsImage({ src, height }: { src: string; height: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img src={src} alt="" onError={() => setFailed(true)} style={{ width: '100%', height, objectFit: 'cover', display: 'block' }} />
  );
}

function NewsLessonPlay({ card, unitPct, t, onAward, onClose, disclaimer }: {
  card: UcCard;
  unitPct: number | null; // today's unit ±% when the story's ticker is in the set
  t: Record<string, string>;
  onAward: (gain: number) => void;
  onClose: () => void;
  disclaimer: string;
}) {
  const [step, setStep] = useState(0); // furthest revealed step (0..2) — earlier cards stay on screen
  const [pick, setPick] = useState<number | null>(null);

  // tone-vs-money is only a fair question when BOTH sides actually leaned one
  // way; otherwise the timeless facts-vs-interpretation question steps in
  // (self-reflective — both answers are accepted, the reveal explains why)
  const toneDir = card.newsSentiment === 'positive' ? 1 : card.newsSentiment === 'negative' ? -1 : 0;
  const moodDir = !card.hasMoneyData ? 0 : card.moneyMood === 'bullish' ? 1 : card.moneyMood === 'cautious' ? -1 : 0;
  const decidable = toneDir !== 0 && moodDir !== 0;
  const correct = decidable ? (toneDir === moodDir ? 0 : 1) : null;

  const answer = (oi: number) => {
    if (pick != null) return;
    setPick(oi);
    // completing the lesson = a learning attempt (same tried-XP rule as the quiz)
    onAward(XP_TRIED);
  };

  const toneChip = card.newsSentiment === 'positive' ? t.tonePos : card.newsSentiment === 'negative' ? t.toneNeg : t.toneFlat;
  const moodChip = !card.hasMoneyData ? t.moodFlat : card.moneyMood === 'bullish' ? t.moodBull : card.moneyMood === 'cautious' ? t.moodCaut : t.moodFlat;
  const m = card.money;
  const tiles: DominoStat[] = m && card.hasMoneyData ? [
    ...(m.darkPoolPct != null ? [{ k: t.dp, v: Math.round(m.darkPoolPct * 10) / 10, decimals: 1, suffix: '%' }] : []),
    ...(m.volumePcr != null ? [{ k: t.pcr, v: Math.round(m.volumePcr * 100) / 100, decimals: 2 }] : []),
    ...(m.squeezeScore != null ? [{ k: t.squeeze, v: Math.round(m.squeezeScore), decimals: 0 }] : []),
    ...(m.maxPain != null ? [{ k: t.maxPain, v: m.maxPain, decimals: m.maxPain >= 1000 ? 0 : m.maxPain >= 100 ? 1 : 2, prefix: '$' }] : []),
  ] : [];

  const stepKicker = (n: number, label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: 22, height: 22, borderRadius: 8, background: '#FFD8CB', color: '#A83A1D', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900 }}>{n}</span>
      <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', color: '#A83A1D' }}>{label.toUpperCase()}</span>
    </div>
  );
  const nextBtn = (to: number) => (
    <button type="button" onClick={() => setStep(to)} style={{ font: 'inherit', width: '100%', marginTop: 12, background: P.ink, color: '#fff', border: 'none', borderRadius: 18, padding: '14px 0', fontSize: 14.5, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 0 rgba(38,34,64,0.35)' }}>{t.obNext} →</button>
  );
  const opts = decidable ? [t.newsQToneA, t.newsQToneB] : [t.newsQFactA, t.newsQFactB];

  return (
    <div style={{ minHeight: '100vh', background: P.bg, color: P.ink, fontFamily: WIM_FONT }}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 18px calc(40px + env(safe-area-inset-bottom))' }}>
        <PlayTopBar
          onClose={onClose}
          backLabel={t.backHome}
          prog={(step + (pick != null ? 1 : 0.4)) / 3}
          chip={`${Math.min(step + 1, 3)}/3`}
        />

        {/* step 1 — the headline exactly as the reader met it: real photo, tone chip */}
        <div style={{ marginTop: 14, background: '#fff', borderRadius: 22, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, overflow: 'hidden', animation: `wimUp 0.26s ${EASE_OUT} both` }}>
          {card.image && <NewsImage src={card.image} height={150} />}
          <div style={{ padding: '13px 15px 14px' }}>
            {stepKicker(1, t.newsStep1)}
            <h1 style={{ margin: '9px 0 0', fontSize: 17.5, fontWeight: 900, letterSpacing: '-0.01em', lineHeight: 1.4 }}>{card.plainTitle}</h1>
            {card.whyItMatters && <p style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.6, fontWeight: 650 as any, color: P.sub }}>{card.whyItMatters}</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
              <TickerLogo ticker={card.ticker} size={22} />
              <span style={{ fontSize: 12, fontWeight: 900 }}>{card.ticker}</span>
              {unitPct != null && <span style={{ fontSize: 10.5, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: '#8A5B00', background: 'rgba(255,173,31,0.16)', borderRadius: 99, padding: '3px 9px' }}>±{unitPct}%</span>}
              <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 900, color: '#A83A1D', background: '#FFD8CB', borderRadius: 99, padding: '3px 9px' }}>{t.toneLabel} · {toneChip}</span>
            </div>
            {card.source && <div style={{ marginTop: 7, fontSize: 9.5, fontWeight: 800, color: P.faint }}>{card.source}</div>}
          </div>
        </div>
        {step === 0 && nextBtn(1)}

        {/* step 2 — what the money actually printed (or honestly: it was quiet) */}
        {step >= 1 && (
          <div style={{ marginTop: 12, background: '#fff', borderRadius: 22, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '13px 15px 14px', animation: `wimUp 0.26s ${EASE_OUT} both` }}>
            {stepKicker(2, t.newsStep2)}
            {card.hasMoneyData ? (
              <>
                {card.moneyRead && <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.65, fontWeight: 700, color: P.ink }}>{card.moneyRead}</p>}
                {tiles.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {tiles.map((s) => <DominoStatTile key={s.k} s={s} animate />)}
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 900, color: P.heroDeep, background: P.heroSoft, borderRadius: 99, padding: '3px 9px' }}>{t.moodLabel} · {moodChip}</span>
                </div>
              </>
            ) : (
              <>
                <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.65, fontWeight: 700, color: P.ink }}>{t.newsQuiet}</p>
                <p style={{ margin: '6px 0 0', fontSize: 11.5, lineHeight: 1.55, fontWeight: 750 as any, color: P.hero }}>{t.newsQuietSub}</p>
              </>
            )}
          </div>
        )}
        {step === 1 && nextBtn(2)}

        {/* step 3 — one two-choice question, answerable from the cards above */}
        {step >= 2 && (
          <div style={{ marginTop: 12, background: '#fff', borderRadius: 22, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '13px 15px 15px', animation: `wimUp 0.26s ${EASE_OUT} both` }}>
            {stepKicker(3, t.newsStep3)}
            <h2 style={{ margin: '9px 0 0', fontSize: 16.5, fontWeight: 900, letterSpacing: '-0.01em', lineHeight: 1.4 }}>{decidable ? t.newsQTone : t.newsQFact}</h2>
            <div style={{ display: 'flex', gap: 9, marginTop: 11 }}>
              {opts.map((o, oi) => {
                const revealedNow = pick != null;
                const isPick = pick === oi;
                // reflective question: the picked answer IS the accepted one
                const isAnswer = correct == null ? isPick : correct === oi;
                const bg = !revealedNow ? '#fff' : isAnswer ? P.mintSoft : isPick ? P.amberSoft : '#fff';
                const border = !revealedNow ? P.line : isAnswer ? P.mint : isPick ? P.amber : P.line;
                return (
                  <button key={o} type="button" disabled={revealedNow} onClick={() => answer(oi)} style={{ font: 'inherit', flex: 1, cursor: revealedNow ? 'default' : 'pointer', position: 'relative', background: bg, border: `2px solid ${border}`, borderRadius: 15, padding: '13px 8px', fontSize: 13.5, fontWeight: 900, color: P.ink, lineHeight: 1.35, boxShadow: revealedNow ? 'none' : '0 3px 0 rgba(76,63,175,0.12)', animation: revealedNow && isPick && !isAnswer ? WRONG_ANIM : undefined }}>
                    {o}
                    {revealedNow && isPick && isAnswer && <CorrectBurst gain={XP_TRIED} />}
                  </button>
                );
              })}
            </div>
            {pick != null && (
              <div style={{ animation: 'wimPop 0.4s cubic-bezier(0.22,1,0.36,1)' }}>
                <div style={{ marginTop: 12, textAlign: 'center', fontSize: 16, fontWeight: 900, color: correct == null || pick === correct ? P.mint : P.amber, animation: 'wimJudge 0.35s ease both' }}>
                  {correct == null || pick === correct ? `${t.correct} +${XP_TRIED}XP` : `${t.notQuite} +${XP_TRIED}XP`}
                </div>
                <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.65, fontWeight: 650 as any, color: P.sub }}>{decidable ? t.newsToneReveal : t.newsFactReveal}</p>
                <button type="button" onClick={onClose} style={{ font: 'inherit', width: '100%', marginTop: 12, background: P.ink, color: '#fff', border: 'none', borderRadius: 16, padding: '13px 0', fontSize: 14, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 0 rgba(38,34,64,0.35)' }}>{t.backHome}</button>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 18, textAlign: 'center', fontSize: 10, color: P.faint, fontWeight: 600, lineHeight: 1.5 }}>{disclaimer}</div>
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
  // [SHELL] route once to the saved or device language — the native shell enters
  // at /en/wim for every user (mirrors the UC pattern; router nav only, because
  // window.location is a top-level nav that opens in-app Safari under Capacitor).
  useEffect(() => {
    try {
      const saved = localStorage.getItem('wim.locale');
      const dev = (navigator.language || 'en').slice(0, 2).toLowerCase();
      const want = saved && ['ko', 'en', 'ja'].includes(saved) ? saved
        : ['ko', 'en', 'ja'].includes(dev) ? dev : 'en';
      if (want !== loc) router.replace(`/${want}/wim${window.location.search}`);
      else localStorage.setItem('wim.locale', loc);
    } catch { /* storage unavailable */ }
    try {
      // [SHELL] Capacitor Android: the WebView reports env(safe-area-inset-top)=0
      // (known bug) while edge-to-edge draws under the status bar. Every top inset
      // in this page reads max(env(top), var(--wim-top-floor, 0px)) — set the floor.
      const cap = (window as any).Capacitor;
      if (cap?.isNativePlatform?.() && cap?.getPlatform?.() === 'android') {
        document.documentElement.style.setProperty('--wim-top-floor', '24px');
      }
    } catch { /* web */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // real lab snapshots, cached per ticker (hero powers the concept demos; the
  // W2 plays request their own tickers through the same cache)
  const labsRef = useRef<Record<string, LabData>>({});
  const labFlight = useRef<Record<string, Promise<LabData | null>>>({});
  const [labs, setLabs] = useState<Record<string, LabData>>({});
  // W2: play overlays + overlay-unlock stage 1 (levels layer on the hero chart)
  const [playOpen, setPlayOpen] = useState<'hunt' | 'sense' | 'replay' | 'domino' | 'news' | null>(null);
  // W6-B: today's news→money lesson card (UC feed) + the S4 track detail sheet
  const [ucCard, setUcCard] = useState<UcCard | null>(null);
  const [trackOpen, setTrackOpen] = useState<TrackDef['id'] | null>(null);
  const [trackClosing, setTrackClosing] = useState(false);
  // W5-A: closing a play/quiz fades the sheet out (150ms one-shot timer) before unmount
  const [playClosing, setPlayClosing] = useState(false);
  const [quizClosing, setQuizClosing] = useState(false);
  const quizCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // W4: SRS-lite store (per-term wrong/right/last) + ET weekend flag (P6 review mode)
  const srsRef = useRef<Record<string, SrsEntry>>({});
  const weekendET = useMemo(() => isWeekendET(), []);
  // W6-A S1: live pulse strip data — the shared page-wide macro fetch
  const [pulse, setPulse] = useState<{ fw: FedWatchData | null; ty: TreasuryData | null } | null>(null);
  // 예감 기록(A급 ①): {dateET: [tried, correct]} 30일 롤링 — 모든 플레이의 정오답 스트림
  const [cal, setCal] = useState<Record<string, [number, number]>>({});
  // 전세계 정답률(A급 ②): 현재 문제의 글로벌 통계 (reveal 후 표시)
  const [gStat, setGStat] = useState<{ n: number; pct: number | null } | null>(null);
  const [unlockLevels, setUnlockLevels] = useState(false);
  const [unlockToast, setUnlockToast] = useState(false);
  // W5-A: first-unlock full-screen drama (plays on home, then hands off to the toast)
  const [unlockDrama, setUnlockDrama] = useState(false);
  // W3: concept almanac — collected concept cards, each stamped with the day's chart
  const almanacRef = useRef<Record<string, AlmanacEntry>>({});
  const [almanac, setAlmanac] = useState<Record<string, AlmanacEntry>>({});
  const [almToast, setAlmToast] = useState<MetricTerm | null>(null);
  // W5-B: streak freeze (2 forgiveness tokens — verified retention device) +
  // which current-week day a freeze preserved (visual only, never counted) +
  // the consumed-freeze toast + first-ever-boot onboarding sheet
  const [freezeLeft, setFreezeLeft] = useState(2);
  const [preservedWeek, setPreservedWeek] = useState<boolean[]>([false, false, false, false, false, false, false]);
  const [freezeToast, setFreezeToast] = useState<number | null>(null);
  const [onboard, setOnboard] = useState(false);
  const [obPanel, setObPanel] = useState(0);
  const [obClosing, setObClosing] = useState(false);

  // ── boot: restore local state + fetch today's set (instant-paint + SWR refresh) ──
  useEffect(() => {
    try {
      setXp(parseInt(localStorage.getItem('wim.xp') || '0', 10) || 0);
      setDone(JSON.parse(localStorage.getItem('wim.done') || '{}'));
      setSeenTerms(JSON.parse(localStorage.getItem('wim.terms') || '{}'));
      setEverPlayed(localStorage.getItem('wim.played') === '1');
      setUnlockLevels(localStorage.getItem('wim.unlock.levels') === '1');
      const alm = JSON.parse(localStorage.getItem('wim.almanac') || '{}');
      if (alm && typeof alm === 'object' && !Array.isArray(alm)) { almanacRef.current = alm; setAlmanac(alm); }
      const calRaw = JSON.parse(localStorage.getItem('wim.cal') || '{}');
      if (calRaw && typeof calRaw === 'object' && !Array.isArray(calRaw)) setCal(calRaw);
      const srs = JSON.parse(localStorage.getItem('wim.srs') || '{}');
      if (srs && typeof srs === 'object' && !Array.isArray(srs)) srsRef.current = srs;
      const wk = JSON.parse(localStorage.getItem('wim.week') || 'null');
      const wkKey = localStorage.getItem('wim.weekKey') || '';
      // reset the week dots every Monday
      const now = new Date();
      const monday = new Date(now); monday.setDate(now.getDate() - weekdayIdx());
      const mondayKey = `${monday.getFullYear()}-${monday.getMonth() + 1}-${monday.getDate()}`;
      const sameWeek = Array.isArray(wk) && wkKey === mondayKey;
      if (sameWeek) setWeek(wk);
      else { localStorage.setItem('wim.weekKey', mondayKey); localStorage.setItem('wim.week', JSON.stringify([false, false, false, false, false, false, false])); }
      // ── W5-B onboarding: first boot ever shows the 3-panel intro sheet once
      if (localStorage.getItem('wim.onboard') !== '1') setOnboard(true);
      // ── W5-B streak freeze: every user holds 2 forgiveness tokens. If exactly
      // ONE day was missed (yesterday blank, the day before learned — read from
      // the same wim.week array the streak already uses, plus last week's array
      // on the Tuesday boundary before the Monday reset wipes it), consume one
      // token and mark yesterday as PRESERVED. Preserved days never increment
      // the learned-day count — they only keep the chain visually unbroken.
      const fzRaw = localStorage.getItem('wim.freeze');
      let freezes = fzRaw == null ? 2 : parseInt(fzRaw, 10);
      if (!Number.isFinite(freezes) || freezes < 0) freezes = 2;
      if (fzRaw == null) localStorage.setItem('wim.freeze', '2');
      const pvRaw = JSON.parse(localStorage.getItem('wim.weekFreeze') || 'null');
      let preserved: boolean[] = sameWeek && Array.isArray(pvRaw)
        ? [...Array(7)].map((_, i) => pvRaw[i] === true)
        : [false, false, false, false, false, false, false];
      const ti = weekdayIdx();
      let gapIdx = -1;
      if (sameWeek && ti >= 2 && wk[ti - 2] === true && wk[ti - 1] !== true) gapIdx = ti - 1;
      // Tuesday boundary: the stored array is LAST week's (no visit on Monday) —
      // Sunday was learned, Monday is the single missed day of the fresh week
      if (!sameWeek && ti === 1 && Array.isArray(wk)) {
        const prevMonday = new Date(monday); prevMonday.setDate(monday.getDate() - 7);
        const prevMondayKey = `${prevMonday.getFullYear()}-${prevMonday.getMonth() + 1}-${prevMonday.getDate()}`;
        if (wkKey === prevMondayKey && wk[6] === true) gapIdx = 0;
      }
      if (gapIdx >= 0 && freezes > 0 && !preserved[gapIdx]) {
        preserved = [...preserved];
        preserved[gapIdx] = true; // the preserved flag also blocks re-consumption on later boots
        freezes -= 1;
        localStorage.setItem('wim.freeze', String(freezes));
        localStorage.setItem('wim.weekFreeze', JSON.stringify(preserved));
        setFreezeToast(freezes);
      } else if (!sameWeek) {
        localStorage.setItem('wim.weekFreeze', JSON.stringify(preserved));
      }
      setFreezeLeft(freezes);
      setPreservedWeek(preserved);
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
  // cache-first lab fetch, deduped in-flight — every consumer (concept demos,
  // hero overlay, both plays) shares one snapshot per ticker
  const requestLab = useCallback((tk: string): Promise<LabData | null> => {
    const hit = labsRef.current[tk];
    if (hit) return Promise.resolve(hit);
    const inflight = labFlight.current[tk];
    if (inflight) return inflight;
    const p = fetch(`/api/wim/lab?t=${tk}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        delete labFlight.current[tk];
        if (j?.success) {
          labsRef.current = { ...labsRef.current, [tk]: j as LabData };
          setLabs(labsRef.current);
          return j as LabData;
        }
        return null;
      })
      .catch(() => { delete labFlight.current[tk]; return null; });
    labFlight.current[tk] = p;
    return p;
  }, []);
  // fetch the lab snapshot once the day's hero ticker is known (fallback NVDA)
  const labTicker = units[0]?.ticker || 'NVDA';
  const lab = labs[labTicker] || null;
  useEffect(() => { void requestLab(labTicker); }, [labTicker, requestLab]);
  // W6-A S1: warm the shared macro feeds once — pills render whatever loaded
  useEffect(() => {
    let alive = true;
    fetchMacroFeeds().then(({ fw, ty }) => { if (alive) setPulse({ fw, ty }); });
    return () => { alive = false; };
  }, []);
  // W6-B S5.5: one news→money story a day — the same-origin UC feed serves
  // instantly from cache; prefer a photo card whose money data is real (richer
  // lesson), fall back to any photo card, vanish quietly when neither exists
  useEffect(() => {
    let alive = true;
    fetch(`/api/undercurrent/feed?locale=${loc}&limit=12`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !Array.isArray(j?.cards)) return;
        const withPhoto = (j.cards as UcCard[]).filter((c) => c && c.image && c.ticker && c.plainTitle);
        // fail-closed pairing: a crypto-led headline wearing an equity ticker badge
        // reads as a data bug (seen live: Ethereum title + HOOD logo). Skip those;
        // if nothing coherent remains the card vanishes quietly (by design).
        const CRYPTO_RE = /비트코인|이더리움|암호화폐|가상자산|코인|bitcoin|ethereum|crypto|ビットコイン|イーサリアム|仮想通貨|暗号資産|\bBTC\b|\bETH\b|\bXRP\b|솔라나|solana|ソラナ/i;
        // observer-tone gate: this is an EDUCATION app, so a forward-looking headline
        // ("PLTR 급등 예상 / expected to surge") must not lead the news lesson. Targeted
        // predictive phrases only (not bare 예상/予想 — factual "beat expectations" stays).
        const PREDICT_RE = /급등\s*예상|급락\s*예상|상승\s*예상|하락\s*예상|오를\s*전망|내릴\s*전망|급등할|전망이다|것으로\s*예상|expected to (rise|surge|rally|jump|climb|fall|drop|gain|soar)|poised to|set to (rise|surge|rally|jump)|could (surge|rally|soar|jump|climb)|likely to (rise|surge|rally|climb)|forecast(ed)? to|projected to|急騰.{0,3}予想|上昇.{0,3}予想|急落.{0,3}予想|上がる見通し|下がる見通し|だろう/i;
        const coherent = withPhoto.filter((c) => !CRYPTO_RE.test(c.plainTitle) && !PREDICT_RE.test(c.plainTitle));
        setUcCard(coherent.find((c) => c.hasMoneyData) || coherent[0] || null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [loc]);
  const doneCount = units.filter((u) => done[u.id]).length;
  const streakDays = week.filter(Boolean).length;
  const levelIdx = Math.min(4, Math.floor(xp / XP_PER_LEVEL));
  const levelNames = [t.lv1, t.lv2, t.lv3, t.lv4, t.lv5];
  const levelPct = Math.min(1, (xp % XP_PER_LEVEL) / XP_PER_LEVEL);

  const persist = useCallback((k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} }, []);

  // ── quiz timer (8s, first-ever play = off, timeout just reveals — no penalty) ──
  const stopTimer = useCallback(() => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }, []);
  const startQuiz = useCallback((idx: number) => {
    if (quizCloseTimer.current) { clearTimeout(quizCloseTimer.current); quizCloseTimer.current = null; }
    setQuizClosing(false);
    setActiveIdx(idx); setPicked(null); setDeepOpen(false); setRemain(8); setGStat(null);
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

  // 예감 기록(A급 ①) — 모든 플레이의 정오답을 일별 적산해 "직감 정확도" 곡선을
  // 만든다. 자기 채점 데이터이지 예측이 아니다. 30일 롤링, localStorage 영속.
  const recordCal = useCallback((ok: boolean) => {
    setCal((prev) => {
      const day = etTodayStr();
      const next: Record<string, [number, number]> = { ...prev };
      const cur = next[day] || [0, 0];
      next[day] = [cur[0] + 1, cur[1] + (ok ? 1 : 0)];
      const cutoff = Date.now() - 30 * 86_400_000;
      for (const k of Object.keys(next)) {
        const ms = Date.parse(`${k}T12:00:00Z`);
        if (Number.isFinite(ms) && ms < cutoff) delete next[k];
      }
      persist('wim.cal', JSON.stringify(next));
      return next;
    });
  }, [persist]);

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
    recordCal(correct);
    // 전세계 정답률(A급 ②) — fire-and-forget 집계 후 이 문제의 글로벌 통계 표시.
    // 실패는 조용히 무시(통계는 장식이지 기능이 아니다).
    const d = u.dateET || today?.dateET || etTodayStr();
    setGStat(null);
    fetch('/api/wim/stats', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ u: u.id, d, ok: correct }),
    }).then(() => fetch(`/api/wim/stats?u=${encodeURIComponent(u.id)}&d=${encodeURIComponent(d)}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && typeof j.n === 'number') setGStat(j); })
      .catch(() => {});
  }, [done, xp, week, everPlayed, persist, recordCal, today]);

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
    stopTimer();
    // W5-A: quick 150ms fade, then unmount (one-shot timer — no per-frame state)
    setQuizClosing(true);
    quizCloseTimer.current = setTimeout(() => {
      quizCloseTimer.current = null;
      setQuizClosing(false); setActiveIdx(null); setPicked(null); setDeepOpen(false);
      window.scrollTo(0, 0);
    }, 150);
    if (finishedAll && !setDoneShown) {
      setSetDoneShown(true);
      // ② interstitial slot — fires here when ads go live (one per set, capped)
      // if (WIM_ADS_LIVE) showWimInterstitial();
    }
  }, [stopTimer, setDoneShown]);

  // ── W3: almanac collect — first proof of a concept (top-tier play answer or a
  // glossary read) mints its card with a downsampled copy of the day's hero spark
  const collectAlmanac = useCallback((term: MetricTerm) => {
    if (!ALMANAC_TERMS.includes(term) || almanacRef.current[term]) return;
    const srcU = units.find((u) => !done[u.id] && (u.spark?.closes.length || 0) >= 8) || units.find((u) => (u.spark?.closes.length || 0) >= 8) || null;
    const src = srcU?.spark?.closes || labsRef.current[labTicker]?.spark?.closes || [];
    const step = Math.max(1, Math.ceil(src.length / 40));
    const closes = src.filter((_, i) => i % step === 0 || i === src.length - 1).map((v) => Math.round(v * 100) / 100);
    const next = { ...almanacRef.current, [term]: { dateET: today?.dateET || '', ticker: srcU?.ticker || labTicker, closes } };
    almanacRef.current = next;
    setAlmanac(next);
    persist('wim.almanac', JSON.stringify(next));
    setAlmToast(term);
  }, [units, done, labTicker, today, persist]);

  // the collect toast is short-lived and rides on whichever screen is open
  useEffect(() => {
    if (!almToast) return;
    const id = setTimeout(() => setAlmToast(null), 2500);
    return () => clearTimeout(id);
  }, [almToast]);

  const markTerm = useCallback((term: MetricTerm) => {
    setGlossOpen(term);
    collectAlmanac(term);
    if (!seenTerms[term]) {
      const ns = { ...seenTerms, [term]: true };
      setSeenTerms(ns); persist('wim.terms', JSON.stringify(ns));
    }
  }, [seenTerms, persist, collectAlmanac]);

  const weekLabels = t.weekDays.split(',');

  // ── W2: hero unit (hoisted — home AND the play overlays need it) ──
  const heroU = units.find((u) => !done[u.id]) || units[0] || null;
  const heroIdx = heroU ? units.indexOf(heroU) : -1;
  // which session carried the hero move (server field; default REG when absent)
  // The units API caches session as a constant ('REG'), so the strip would never
  // light PRE/POST from payload data — compute it from the live ET clock instead
  // (weekend/after-close shows POST: the last finished session of the shown day).
  const heroSession: 'pre' | 'reg' | 'post' = useMemo(() => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
    }).formatToParts(new Date());
    const g = (k: string) => parts.find((x) => x.type === k)?.value || '';
    const wd = g('weekday');
    const m = parseInt(g('hour'), 10) * 60 + parseInt(g('minute'), 10);
    if (wd === 'Sat' || wd === 'Sun') return 'post';
    if (m >= 240 && m < 570) return 'pre';
    if (m >= 570 && m < 960) return 'reg';
    return 'post';
  }, []);
  const heroTicker = heroU?.ticker || null;
  const heroLab = heroTicker ? labs[heroTicker] || null : null;
  // W3: replay wants a dense session — hero unit, else any unit with ≥60 bars
  const replayU = heroU && (heroU.spark?.closes.length || 0) >= 60 ? heroU
    : units.find((u) => (u.spark?.closes.length || 0) >= 60) || null;

  // W6-A S5: concept of the day — deterministic pick (dateET hash) among the
  // glossary terms that can demo themselves with live lab values right now
  const termOfDay = useMemo<MetricTerm | null>(() => {
    if (!lab) return null;
    const pool = (Object.keys(METRIC_GLOSSARY) as MetricTerm[]).filter((tm) => termDemo(tm, lab) != null);
    if (pool.length === 0) return null;
    const key = today?.dateET || etTodayStr();
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return pool[h % pool.length];
  }, [lab, today]);

  // ── W2: play bookkeeping — XP + learning-day dot (same rules as record()) ──
  const awardPlayXp = useCallback((gain: number) => {
    if (gain > 0) {
      setXp((prev) => { const n = prev + gain; persist('wim.xp', String(n)); return n; });
    }
    const w = [...week]; w[weekdayIdx()] = true;
    setWeek(w); persist('wim.week', JSON.stringify(w));
  }, [week, persist]);

  // ── W4 SRS-lite: record every hunt/sense/replay judgement per term; a term is
  // due when missed more than hit and not already touched today (retrieval spacing)
  const srsRecord = useCallback((term: string, ok: boolean) => {
    const prev = srsRef.current[term] || { wrong: 0, right: 0, last: '' };
    const next = { ...srsRef.current, [term]: { wrong: prev.wrong + (ok ? 0 : 1), right: prev.right + (ok ? 1 : 0), last: etTodayStr() } };
    srsRef.current = next;
    persist('wim.srs', JSON.stringify(next));
    recordCal(ok); // 플레이(헌트/센스/리플레이) 판정도 직감 정확도 스트림에 합산
  }, [persist, recordCal]);
  const isReviewDue = useCallback((term: string): boolean => {
    const e = srsRef.current[term];
    return !!e && e.wrong > e.right && e.last !== etTodayStr();
  }, []);

  // overlay unlock stage 1: first-ever Level Hunt completion opens the max-pain
  // layer on the home hero chart, forever (spec §3 "차트가 자라난다")
  const onHuntComplete = useCallback((): boolean => {
    if (unlockLevels) return false;
    setUnlockLevels(true);
    persist('wim.unlock.levels', '1');
    setUnlockDrama(true); // W5-A: full-screen drama first — it hands off to the toast
    return true;
  }, [unlockLevels, persist]);

  const openPlay = useCallback((id: 'hunt' | 'sense' | 'replay' | 'domino' | 'news') => { setPlayClosing(false); setPlayOpen(id); window.scrollTo(0, 0); }, []);
  // W5-A: closing a play = 150ms fade-out, then unmount (single one-shot timer)
  const closePlay = useCallback(() => {
    setPlayClosing(true);
    window.setTimeout(() => { setPlayOpen(null); setPlayClosing(false); window.scrollTo(0, 0); }, 150);
  }, []);
  // W6-B: the track detail sheet opens/closes with the same PlayShell rhythm
  const openTrack = useCallback((id: TrackDef['id']) => { setTrackClosing(false); setTrackOpen(id); window.scrollTo(0, 0); }, []);
  const closeTrack = useCallback(() => {
    setTrackClosing(true);
    window.setTimeout(() => { setTrackOpen(null); setTrackClosing(false); window.scrollTo(0, 0); }, 150);
  }, []);

  // [SHELL] Android hardware back: 최상단 시트부터 순서대로 닫고, 홈 탭이면 앱
  // 최소화 (UC 패턴 그대로 — 리스너는 마운트 1회, 상태는 ref 미러로 판독).
  const backRef = useRef({ gloss: false, settings: false, quiz: false, play: false, track: false, tab: 'home' as string });
  useEffect(() => {
    backRef.current = {
      gloss: glossOpen != null, settings: settingsOpen, quiz: activeIdx != null,
      play: playOpen != null, track: trackOpen != null, tab: homeTab,
    };
  }, [glossOpen, settingsOpen, activeIdx, playOpen, trackOpen, homeTab]);
  useEffect(() => {
    let remove: (() => void) | undefined;
    (async () => {
      try {
        const cap = (window as any).Capacitor;
        if (!cap?.isNativePlatform?.()) return;
        const AppMod: any = await import('@capacitor/app');
        const h = await AppMod.App.addListener('backButton', () => {
          const b = backRef.current;
          if (b.gloss) { setGlossOpen(null); return; }
          if (b.settings) { setSettingsOpen(false); return; }
          if (b.quiz) { closeQuiz(false); return; }
          if (b.play) { closePlay(); return; }
          if (b.track) { closeTrack(); return; }
          if (b.tab !== 'home') { setHomeTab('home'); window.scrollTo(0, 0); return; }
          AppMod.App.minimizeApp();
        });
        remove = () => { try { h.remove(); } catch { /* noop */ } };
      } catch { /* web */ }
    })();
    return () => { remove?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // once unlocked, the home hero chart needs the hero ticker's lab levels
  useEffect(() => {
    if (unlockLevels && heroTicker) void requestLab(heroTicker);
  }, [unlockLevels, heroTicker, requestLab]);

  // the unlock toast shows once on the home screen, then fades
  useEffect(() => {
    if (!unlockToast || playOpen != null || activeIdx != null) return;
    const id = setTimeout(() => setUnlockToast(false), 4000);
    return () => clearTimeout(id);
  }, [unlockToast, playOpen, activeIdx]);

  // W5-B: the consumed-freeze toast rides the home screen for 5s — it can only
  // fire once per gap because the preserved flag persists in wim.weekFreeze
  useEffect(() => {
    if (freezeToast == null || onboard || playOpen != null || activeIdx != null) return;
    const id = setTimeout(() => setFreezeToast(null), 5000);
    return () => clearTimeout(id);
  }, [freezeToast, onboard, playOpen, activeIdx]);

  // W5-B onboarding close: mark seen, quick fade, unmount (PlayShell pattern)
  const closeOnboard = useCallback(() => {
    persist('wim.onboard', '1');
    setObClosing(true);
    window.setTimeout(() => { setOnboard(false); setObClosing(false); }, 150);
  }, [persist]);

  // W5-A unlock drama: a 1.4s full-screen moment on the home screen (tap to skip),
  // a 0.3s collapse toward the hero, then the classic toast takes over
  const endUnlockDrama = useCallback(() => { setUnlockDrama(false); setUnlockToast(true); }, []);
  useEffect(() => {
    if (!unlockDrama || playOpen != null || activeIdx != null) return;
    const id = setTimeout(endUnlockDrama, 1700);
    return () => clearTimeout(id);
  }, [unlockDrama, playOpen, activeIdx, endUnlockDrama]);

  // W5-A: miniature chart for the unlock drama — the hero's real session when available
  const dramaPath = useMemo(() => {
    const src = heroU?.spark?.closes;
    if (!src || src.length < 8) return 'M0,74 C30,70 45,40 70,44 C95,48 105,86 140,80 C175,74 185,30 220,34 C250,37 265,58 280,52';
    const step = Math.max(1, Math.floor(src.length / 48));
    const pts = src.filter((_, i) => i % step === 0 || i === src.length - 1);
    const lo = Math.min(...pts); const hi = Math.max(...pts); const span = hi - lo || 1;
    return pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / Math.max(1, pts.length - 1)) * 280).toFixed(1)},${(112 - ((v - lo) / span) * 96).toFixed(1)}`).join(' ');
  }, [heroU]);

  const disclaimerText = units[0]?.disclaimer?.[loc] || (loc === 'ko' ? '교육용 시장 정보입니다. 투자 조언이 아니며 정확성을 보장하지 않습니다.' : loc === 'ja' ? '教育目的の市場情報です。投資助言ではなく、正確性は保証されません。' : 'Educational market information only. Not investment advice; accuracy not guaranteed.');

  // W3: almanac collect toast — rendered on every screen (plays, quiz, home)
  const almToastNode = almToast ? (
    <div style={{ position: 'fixed', top: 'calc(14px + max(env(safe-area-inset-top), var(--wim-top-floor, 0px)))', left: 16, right: 16, zIndex: 97, display: 'flex', justifyContent: 'center', pointerEvents: 'none', animation: 'wimUp 0.3s ease' }}>
      <div style={{ maxWidth: 520, display: 'flex', alignItems: 'center', gap: 9, background: `linear-gradient(135deg, ${P.heroDeep}, ${P.hero})`, color: '#fff', borderRadius: 16, padding: '11px 15px', boxShadow: '0 14px 34px rgba(76,63,175,0.35)' }}>
        <Ic name="spark" size={16} color="#FFD66B" />
        <span style={{ fontSize: 12, fontWeight: 900 }}>{t.almanacToast.replace('{n}', METRIC_GLOSSARY[almToast].title[loc])}</span>
      </div>
    </div>
  ) : null;

  // ════════════════════════ W5-B FIRST-RUN ONBOARDING (once ever, skippable) ════════════════════════
  if (onboard) {
    const obPanels = [
      { icon: 'chart', title: t.ob1 },
      { icon: 'crosshair', title: t.ob2 },
      { icon: 'layers', title: t.ob3 },
    ];
    const pn = obPanels[Math.min(obPanel, obPanels.length - 1)];
    const obAdvance = () => { if (obClosing) return; if (obPanel < obPanels.length - 1) setObPanel(obPanel + 1); else closeOnboard(); };
    return (
      <PlayShell closing={obClosing}>
        <div onClick={obAdvance} style={{ minHeight: '100vh', fontFamily: WIM_FONT, color: '#fff', background: `linear-gradient(165deg, ${P.heroDeep} 0%, ${P.hero} 55%, #8E7FF0 100%)`, cursor: 'pointer' }}>
          <div style={{ maxWidth: 520, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '0 24px calc(28px + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', alignItems: 'center', paddingTop: 'calc(18px + max(env(safe-area-inset-top), var(--wim-top-floor, 0px)))' }}>
              <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: '-0.01em', opacity: 0.9 }}>Why&apos;d It Move?</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); closeOnboard(); }} style={{ font: 'inherit', marginLeft: 'auto', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 99, padding: '7px 14px', fontSize: 11.5, fontWeight: 900, cursor: 'pointer' }}>{t.obSkip}</button>
            </div>
            {/* the active panel — remounts per step so the one-shot rise replays */}
            <div key={obPanel} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', animation: `wimUp 0.3s ${EASE_OUT} both` }}>
              <span style={{ width: 96, height: 96, borderRadius: 34, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.30)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ic name={pn.icon} size={44} color="#fff" sw={1.5} />
              </span>
              <h1 style={{ margin: '24px 0 0', fontSize: 23, fontWeight: 900, lineHeight: 1.45, letterSpacing: '-0.01em', maxWidth: 320 }}>{pn.title}</h1>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 16 }}>
              {obPanels.map((_, i) => (
                <span key={i} style={{ width: i === obPanel ? 20 : 7, height: 7, borderRadius: 99, background: i === obPanel ? '#fff' : 'rgba(255,255,255,0.35)', transition: 'width 0.25s ease' }} />
              ))}
            </div>
            <button type="button" onClick={(e) => { e.stopPropagation(); obAdvance(); }} style={{ font: 'inherit', width: '100%', background: '#fff', color: P.heroDeep, border: 'none', borderRadius: 18, padding: '15px 0', fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 0 rgba(0,0,0,0.18)' }}>
              {obPanel < obPanels.length - 1 ? `${t.obNext} →` : t.obStart}
            </button>
          </div>
        </div>
      </PlayShell>
    );
  }

  // ════════════════════════ QUIZ OVERLAY ════════════════════════
  if (activeIdx != null && units[activeIdx]) {
    const u = units[activeIdx];
    const revealed = picked != null;
    const wasCorrect = picked != null && u.correctCategoryIds.includes(picked);
    const isLast = activeIdx >= units.length - 1;
    const allDoneAfter = units.every((x) => x.id === u.id ? true : !!done[x.id]);
    return (
      <PlayShell closing={quizClosing}>
      <div style={{ minHeight: '100vh', background: P.bg, color: P.ink, fontFamily: WIM_FONT }}>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 18px calc(40px + env(safe-area-inset-bottom))' }}>
          {/* top bar: close + progress + countdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 'calc(16px + max(env(safe-area-inset-top), var(--wim-top-floor, 0px)))' }}>
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
          <div style={{ marginTop: 16, background: '#fff', borderRadius: 24, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '20px 18px', textAlign: 'center', animation: `wimUp 0.26s ${EASE_OUT} both` }}>
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
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10, animation: `wimUp 0.26s ${EASE_OUT} 90ms both` }}>
            {u.choices.map((c) => {
              const isPick = picked === c.categoryId;
              const isAnswer = u.correctCategoryIds.includes(c.categoryId);
              const bg = !revealed ? '#fff' : isAnswer ? P.mintSoft : isPick ? P.amberSoft : '#fff';
              const border = !revealed ? P.line : isAnswer ? P.mint : isPick ? P.amber : P.line;
              return (
                <button
                  key={c.id} type="button" disabled={revealed}
                  onClick={() => answer(u, c.categoryId)}
                  style={{
                    font: 'inherit', textAlign: 'left', cursor: revealed ? 'default' : 'pointer', position: 'relative',
                    background: bg, border: `2px solid ${border}`, borderRadius: 18,
                    padding: '14px 15px', fontSize: 14, fontWeight: 750 as any, color: P.ink, lineHeight: 1.4,
                    boxShadow: revealed ? 'none' : '0 3px 0 rgba(76,63,175,0.12)',
                    transition: 'transform 0.08s ease, box-shadow 0.08s ease',
                    display: 'flex', alignItems: 'center', gap: 10,
                    animation: revealed && isPick && !isAnswer ? WRONG_ANIM : undefined,
                  }}
                  onTouchStart={(e) => { if (!revealed) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(2px)'; }}
                  onTouchEnd={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
                >
                  <span style={{ width: 34, height: 34, minWidth: 34, borderRadius: 12, background: P.heroSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: P.heroDeep }}><Ic name={CAT_ICON[c.categoryId] || 'target'} size={17} /></span>
                  <span style={{ flex: 1 }}>{c.label[loc]}</span>
                  {revealed && isAnswer && <Ic name="check" size={18} color={P.mint} sw={2.6} />}
                  {revealed && isPick && !isAnswer && <Ic name="close" size={16} color={P.amber} sw={2.4} />}
                  {revealed && isPick && isAnswer && <CorrectBurst gain={XP_CORRECT} />}
                </button>
              );
            })}
          </div>

          {/* reveal */}
          {revealed && (
            <div style={{ animation: 'wimPop 0.4s cubic-bezier(0.22,1,0.36,1)' }}>
              <div style={{ marginTop: 16, textAlign: 'center', fontSize: 20, fontWeight: 900, color: wasCorrect ? P.mint : P.amber, animation: 'wimJudge 0.35s ease both' }}>
                {wasCorrect ? `${t.correct} +${XP_CORRECT}XP` : `${t.notQuite} +${XP_TRIED}XP`}
              </div>
              {/* 전세계 정답률(A급 ②) — 5명 이상 쌓였을 때만 %, 그 전엔 이른-풀이 라인 */}
              {gStat && gStat.n > 0 && (
                <div style={{ marginTop: 7, textAlign: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 900, color: P.heroDeep, background: P.heroSoft, borderRadius: 99, padding: '5px 12px' }}>
                    <Ic name="globe" size={12} color={P.heroDeep} sw={2} />
                    {gStat.pct != null ? t.statLine.replace('{p}', String(gStat.pct)) : t.statEarly.replace('{n}', String(gStat.n))}
                  </span>
                </div>
              )}

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
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {isLast || allDoneAfter ? <><Ic name="flag" size={16} color="#fff" sw={2.2} /> {t.finish}</> : `${t.next} →`}
                </span>
              </button>
            </div>
          )}

          <div style={{ marginTop: 18, textAlign: 'center', fontSize: 10, color: P.faint, fontWeight: 600, lineHeight: 1.5 }}>{u.disclaimer[loc]}</div>
        </div>

        {/* glossary bottom sheet (shared with home) */}
        {glossOpen && <GlossarySheet term={glossOpen} lab={lab} loc={loc} t={t} live={{ yield10Y: pulse?.ty?.yield10Y ?? null, holdPct: pulse?.fw?.noChange ?? null, fomcDays: pulse?.fw?.daysUntilFomc ?? null }} onClose={() => setGlossOpen(null)} />}
        {almToastNode}
      </div>
      </PlayShell>
    );
  }

  // ════════════════════════ PLAY OVERLAYS (P3 level hunt · P4 number sense · P2 replay · P5 macro domino) ════════════════════════
  if (playOpen === 'hunt' && heroU) {
    return (
      <PlayShell closing={playClosing}>
        <LevelHuntPlay
          ticker={heroU.ticker}
          fallbackCloses={heroU.spark?.closes || null}
          requestLab={requestLab}
          t={t}
          onAward={awardPlayXp}
          onCollect={collectAlmanac}
          onSrs={srsRecord}
          onComplete={onHuntComplete}
          onShare={(filled, total) => {
            void buildShareCard({ dateET: today?.dateET || heroU.dateET, ticker: heroU.ticker, movePct: heroU.moveMagnitude, scoreFilled: filled, scoreTotal: total, closes: heroU.spark?.closes || null, footer: t.shareFooter });
          }}
          onClose={closePlay}
          disclaimer={disclaimerText}
        />
        {almToastNode}
      </PlayShell>
    );
  }
  if (playOpen === 'sense' && units.length > 0) {
    return (
      <PlayShell closing={playClosing}>
        <NumberSensePlay
          tickers={Array.from(new Set(units.slice(0, 5).map((u) => u.ticker)))}
          requestLab={requestLab}
          t={t}
          loc={loc}
          onAward={awardPlayXp}
          onCollect={collectAlmanac}
          onSrs={srsRecord}
          isReviewDue={isReviewDue}
          onClose={closePlay}
          disclaimer={disclaimerText}
        />
        {almToastNode}
      </PlayShell>
    );
  }
  if (playOpen === 'replay') {
    return (
      <PlayShell closing={playClosing}>
        <ReplayPlay
          unit={replayU}
          loc={loc}
          t={t}
          onAward={awardPlayXp}
          onCollect={collectAlmanac}
          onSrs={srsRecord}
          onOpenQuiz={() => { setPlayOpen(null); if (replayU) startQuiz(units.indexOf(replayU)); }}
          onClose={closePlay}
          disclaimer={disclaimerText}
        />
        {almToastNode}
      </PlayShell>
    );
  }
  if (playOpen === 'domino') {
    return (
      <PlayShell closing={playClosing}>
        <MacroDominoPlay
          t={t}
          onAward={awardPlayXp}
          onClose={closePlay}
          disclaimer={disclaimerText}
        />
        {almToastNode}
      </PlayShell>
    );
  }
  if (playOpen === 'news' && ucCard) {
    return (
      <PlayShell closing={playClosing}>
        <NewsLessonPlay
          card={ucCard}
          unitPct={units.find((u) => u.ticker === ucCard.ticker)?.moveMagnitude ?? null}
          t={t}
          onAward={awardPlayXp}
          onClose={closePlay}
          disclaimer={disclaimerText}
        />
        {almToastNode}
      </PlayShell>
    );
  }

  // ════════════════════════ W6-B TRACK DETAIL SHEET (S4 tile → one screen, no nesting) ════════════════════════
  if (trackOpen) {
    const ti = TRACKS.findIndex((x) => x.id === trackOpen);
    const tr = TRACKS[ti];
    const total = tr.terms.length;
    const got = tr.terms.filter((tm) => almanac[tm]).length;
    // the ONE next step — identical mapping to what the W6-A tiles fired directly
    const launch = () => {
      setTrackOpen(null); setTrackClosing(false);
      if (tr.id === 'chart') openPlay('replay');
      else if (tr.id === 'insti') openPlay('hunt');
      else if (tr.id === 'macro') openPlay('domino');
      else if (heroIdx >= 0) startQuiz(heroIdx);
    };
    return (
      <PlayShell closing={trackClosing}>
        <div style={{ minHeight: '100vh', background: P.bg, color: P.ink, fontFamily: WIM_FONT }}>
          <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 18px calc(40px + env(safe-area-inset-bottom))' }}>
            <PlayTopBar
              onClose={closeTrack}
              backLabel={t.backHome}
              prog={total > 0 ? got / total : 0}
              chip={total > 0 ? `${got}/${total}` : null}
            />

            {/* track color header — the tile's saturated-light scene, expanded */}
            <div style={{ marginTop: 14, background: tr.bg, color: tr.deep, borderRadius: 24, padding: '16px 16px 15px', boxShadow: '0 12px 26px rgba(38,34,64,0.09)', animation: `wimUp 0.26s ${EASE_OUT} both` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 38, height: 38, borderRadius: 13, background: 'rgba(255,255,255,0.55)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic name={tr.icon} size={19} color={tr.deep} sw={2} /></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.01em' }}>{t[`track${ti + 1}`]}</div>
                  <span style={{ display: 'inline-block', marginTop: 3, fontSize: 8.5, fontWeight: 900, background: tr.chip, borderRadius: 99, padding: '3px 8px' }}>{t[`trackDiff${ti + 1}`]}</span>
                </div>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.6, fontWeight: 800, opacity: 0.9 }}>{t[`trackDesc${ti + 1}`]}</p>
            </div>

            {/* THE one next step — a single big CTA (no wall of equal choices) */}
            <button type="button" onClick={launch} style={{ font: 'inherit', width: '100%', marginTop: 12, background: P.ink, color: '#fff', border: 'none', borderRadius: 18, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', boxShadow: '0 4px 0 rgba(38,34,64,0.35)', display: 'flex', alignItems: 'center', gap: 10, animation: `wimUp 0.26s ${EASE_OUT} 60ms both` }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', opacity: 0.7 }}>{t.trackNextLabel.toUpperCase()}</span>
                <span style={{ display: 'block', marginTop: 3, fontSize: 14, fontWeight: 900, lineHeight: 1.35 }}>{t[`trackCta${ti + 1}`]}</span>
              </span>
              <span style={{ flexShrink: 0, fontWeight: 900 }}>→</span>
            </button>

            {/* term list — collected rows carry their earn date, the rest wait
                dimmed; every row opens the glossary sheet (reading collects it) */}
            {total > 0 ? (
              <div style={{ marginTop: 16, animation: `wimUp 0.26s ${EASE_OUT} 110ms both` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px' }}>
                  <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 900 }}>{t.trackTermsTitle}</h2>
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 900, color: P.faint, fontVariantNumeric: 'tabular-nums' }}>{got}/{total}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 9 }}>
                  {tr.terms.map((term) => {
                    const ent = almanac[term];
                    return (
                      <button key={term} type="button" onClick={() => markTerm(term)} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1.5px solid ${P.line}`, borderRadius: 15, padding: '11px 13px', opacity: ent ? 1 : 0.55, boxShadow: ent ? P.shadow : 'none' }}>
                        <span style={{ color: ent ? P.mint : P.faint }}><Ic name={ent ? 'check' : 'book'} size={15} sw={ent ? 2.6 : 1.8} /></span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 900, color: P.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{METRIC_GLOSSARY[term].title[loc]}</span>
                        {ent && <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 900, color: P.heroDeep, background: P.heroSoft, borderRadius: 99, padding: '3px 8px', fontVariantNumeric: 'tabular-nums' }}>{ent.dateET}</span>}
                        <span style={{ color: P.hero, fontWeight: 900 }}>›</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 16, textAlign: 'center', fontSize: 11.5, fontWeight: 800, color: P.faint, animation: `wimUp 0.26s ${EASE_OUT} 110ms both` }}>{t.trackTermsSoon}</div>
            )}

            {/* 오늘의 실측 — 트랙의 개념을 오늘 데이터로 즉시 증명 (빈 하단 활용, 2026-07-20).
                실값이 없으면 섹션째 숨김(가짜 숫자 금지). */}
            {(() => {
              const tile = (label: string, val: string | null) => (val == null ? null : (
                <div key={label} style={{ flex: 1, minWidth: 0, background: '#fff', border: `1.5px solid ${P.line}`, borderRadius: 14, padding: '9px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.06em', color: P.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                  <div style={{ marginTop: 2, fontSize: 14.5, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: P.heroDeep, whiteSpace: 'nowrap' }}>{val}</div>
                </div>
              ));
              let tiles: (ReactNode | null)[] = [];
              let chart: ReactNode = null;
              if (tr.id === 'macro') {
                tiles = [
                  tile(t.pulse10Y, pulse?.ty?.yield10Y != null ? `${pulse.ty.yield10Y.toFixed(2)}%` : null),
                  tile(t.pulseHold, pulse?.fw?.noChange != null ? `${pulse.fw.noChange.toFixed(1)}%` : null),
                  tile(t.pulseFomc, pulse?.fw?.daysUntilFomc != null ? `D-${pulse.fw.daysUntilFomc}` : null),
                ];
              } else if (tr.id === 'news') {
                if (ucCard) {
                  chart = (
                    <button type="button" className="wim-press" onClick={() => { setTrackOpen(null); setTrackClosing(false); openPlay('news'); }} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1.5px solid ${P.line}`, borderRadius: 16, padding: '12px 13px' }}>
                      <TickerLogo ticker={ucCard.ticker} size={26} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 900, color: P.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ucCard.plainTitle}</span>
                        <span style={{ display: 'block', marginTop: 2, fontSize: 9.5, fontWeight: 800, color: P.faint }}>{ucCard.ticker}</span>
                      </span>
                      <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 900, background: P.ink, color: '#fff', borderRadius: 99, padding: '5px 11px' }}>{t.colOpen}</span>
                    </button>
                  );
                }
              } else if (heroLab) {
                const lvl = tr.id === 'insti' && heroLab.levels.maxPain != null
                  ? [{ label: 'MAX PAIN', value: heroLab.levels.maxPain, color: '#C98A00' }] : undefined;
                if (heroLab.spark && heroLab.spark.closes.length >= 8) {
                  chart = <RealChart closes={heroLab.spark.closes} vwap={tr.id === 'chart' ? heroLab.spark.vwap : null} levels={lvl} height={92} />;
                }
                const vwapLast = heroLab.spark?.vwap?.length ? heroLab.spark.vwap[heroLab.spark.vwap.length - 1] : null;
                tiles = tr.id === 'chart'
                  ? [
                    tile('VWAP', vwapLast != null ? `$${vwapLast.toFixed(2)}` : null),
                    tile('SMA50', heroLab.sma.sma50 != null ? `$${heroLab.sma.sma50.toFixed(0)}` : null),
                    tile('PHASE', heroLab.sma.phase || null),
                  ]
                  : [
                    tile('MAX PAIN', heroLab.levels.maxPain != null ? `$${heroLab.levels.maxPain}` : null),
                    tile('DARK POOL', heroLab.darkPoolPct != null ? `${Math.round(heroLab.darkPoolPct)}%` : null),
                    tile('P/C', heroLab.pcr != null ? heroLab.pcr.toFixed(2) : null),
                  ];
              }
              const liveTiles = tiles.filter(Boolean);
              if (!chart && liveTiles.length === 0) return null;
              return (
                <div style={{ marginTop: 16, animation: `wimUp 0.26s ${EASE_OUT} 150ms both` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px' }}>
                    <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 900 }}>{t.trackLiveTitle}</h2>
                    {heroLab && tr.id !== 'macro' && tr.id !== 'news' && <span style={{ fontSize: 10.5, fontWeight: 900, color: P.faint }}>{heroLab.ticker}</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 8.5, fontWeight: 900, color: P.mint, background: P.mintSoft, borderRadius: 99, padding: '3px 9px' }}>● {t.realData.toUpperCase()}</span>
                  </div>
                  {chart && (tr.id === 'news'
                    ? <div style={{ marginTop: 9 }}>{chart}</div>
                    : <div style={{ marginTop: 9, background: '#fff', border: `1.5px solid ${P.line}`, borderRadius: 18, padding: '10px 8px 5px', overflow: 'hidden' }}>{chart}</div>)}
                  {liveTiles.length > 0 && <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>{liveTiles}</div>}
                </div>
              );
            })()}

            <div style={{ marginTop: 18, textAlign: 'center', fontSize: 10, color: P.faint, fontWeight: 600, lineHeight: 1.5 }}>{disclaimerText}</div>
          </div>

          {/* the glossary sheet + collect toast ride on top of the track sheet */}
          {glossOpen && <GlossarySheet term={glossOpen} lab={lab} loc={loc} t={t} live={{ yield10Y: pulse?.ty?.yield10Y ?? null, holdPct: pulse?.fw?.noChange ?? null, fomcDays: pulse?.fw?.daysUntilFomc ?? null }} onClose={() => setGlossOpen(null)} />}
          {almToastNode}
        </div>
      </PlayShell>
    );
  }

  // ════════════════════════ HOME (v3: glass shell · bottom tabs · case files) ════════════════════════
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
  // W6-A S1: thin pulse pills — hairline light chips, label + tabular value
  const pulsePill = { display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, background: 'rgba(255,255,255,0.75)', border: '1px solid rgba(38,34,64,0.08)', borderRadius: 99, padding: '6px 11px', whiteSpace: 'nowrap' } as const;
  const pulseK = { fontSize: 9, fontWeight: 900, letterSpacing: '0.05em', color: P.faint } as const;
  const pulseV = { fontSize: 11, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: P.ink } as const;
  const solvedCount = Object.keys(done).length;
  const correctToday = units.filter((u) => done[u.id] && u.correctCategoryIds.includes(done[u.id])).length;
  const termsCount = Object.keys(seenTerms).filter((k) => seenTerms[k]).length;
  // W4/P6 deck ordering — weekday: quiz cases lead, plays follow; ET weekend:
  // replay-led review order (replay → number sense → level hunt → domino) up front
  const playDefs: { id: 'hunt' | 'sense' | 'replay' | 'domino'; icon: string; title: string; sub: string }[] = [
    { id: 'hunt', icon: 'crosshair', title: t.teaserHunt, sub: t.teaserHuntSub },
    { id: 'sense', icon: 'updown', title: t.teaserSense, sub: t.teaserSenseSub },
    { id: 'replay', icon: 'replay', title: t.teaserReplay, sub: t.teaserReplaySub },
    { id: 'domino', icon: 'chain', title: t.teaserDomino, sub: t.teaserDominoSub },
  ];
  const weekendRank: Record<string, number> = { replay: 0, sense: 1, hunt: 2, domino: 3 };
  const deckPlays = weekendET ? [...playDefs].sort((a, b) => weekendRank[a.id] - weekendRank[b.id]) : playDefs;
  // W6-A S5: the play deck re-merchandised as LIGHT colored tint cards — one
  // tint per learning-track family (Blinkit tile energy, zero dark scenes)
  const PLAY_TINT: Record<'hunt' | 'sense' | 'replay' | 'domino', { bg: string; deep: string }> = {
    replay: { bg: '#ECE6FF', deep: '#4A38C2' },
    hunt: { bg: '#FFEFC9', deep: '#8A5B00' },
    domino: { bg: '#D7F3EA', deep: '#0E6B57' },
    sense: { bg: '#FFE2D6', deep: '#A83A1D' },
  };
  const playCards = deckPlays.map((tz, i) => {
    const tint = PLAY_TINT[tz.id];
    return (
      <button key={tz.id} type="button" className="wim-press" onClick={() => openPlay(tz.id)} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', flex: '0 0 196px', scrollSnapAlign: 'start', background: tint.bg, color: tint.deep, border: 'none', borderRadius: 22, padding: '13px 13px 12px', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 22px rgba(38,34,64,0.07)', animation: `wimUp 0.3s ${EASE_OUT} ${i * 40}ms both` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <span style={{ width: 28, height: 28, borderRadius: 10, background: 'rgba(255,255,255,0.55)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ic name={tz.icon} size={16} color={tint.deep} sw={2} /></span>
          <span className="wim-new" style={{ marginLeft: 'auto', fontSize: 8.5, fontWeight: 900, background: 'rgba(255,255,255,0.6)', borderRadius: 99, padding: '2px 8px', letterSpacing: '0.04em' }}>{t.newPlay}</span>
        </div>
        <div style={{ marginTop: 11, fontSize: 14.5, fontWeight: 900 }}>{tz.title}</div>
        <div style={{ marginTop: 4, fontSize: 10.5, fontWeight: 750 as any, opacity: 0.8, lineHeight: 1.45 }}>{tz.sub}</div>
        <div style={{ marginTop: 'auto', paddingTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 11, fontWeight: 900, borderRadius: 99, padding: '5px 12px', background: P.ink, color: '#fff' }}>{t.play}</span>
        </div>
      </button>
    );
  });
  // W6-A S5: concept-of-the-day card — the term's live micro-viz, tap → glossary
  const conceptCard = termOfDay ? (
    <button key="cod" type="button" className="wim-press" onClick={() => markTerm(termOfDay)} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', flex: '0 0 196px', scrollSnapAlign: 'start', background: '#FFFFFF', border: '1px solid rgba(38,34,64,0.07)', borderRadius: 18, padding: '13px 13px 12px', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 20px rgba(76,63,175,0.09)', animation: `wimUp 0.3s ${EASE_OUT} 160ms both` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%' }}>
        <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.08em', color: P.heroDeep, background: P.heroSoft, borderRadius: 99, padding: '3px 9px' }}>{t.conceptOfDay.toUpperCase()}</span>
        {lab && <span style={{ marginLeft: 'auto', fontSize: 8.5, fontWeight: 900, color: P.mint }}>● {lab.ticker}</span>}
      </div>
      <div style={{ margin: '10px 0 2px', width: '100%' }}>
        <MiniViz term={termOfDay} lab={lab} />
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 900, lineHeight: 1.3, color: P.ink }}>{METRIC_GLOSSARY[termOfDay].title[loc]}</div>
      <div style={{ marginTop: 'auto', paddingTop: 9, display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
        <span style={{ fontSize: 11, fontWeight: 900, borderRadius: 99, padding: '5px 12px', background: P.heroSoft, color: P.heroDeep }}>{t.colOpen}</span>
      </div>
    </button>
  ) : null;
  // W6-A S6: one editorial collection teaser, rotating weekly (deterministic) —
  // every theme opens content that already exists (no new views this phase)
  const collections = [
    { title: t.colTitle1, sub: t.colSub1, icon: 'layers', bg: '#FFEFC9', deep: '#8A5B00', open: () => openPlay('hunt') },
    { title: t.colTitle2, sub: t.colSub2, icon: 'updown', bg: '#ECE6FF', deep: '#4A38C2', open: () => openPlay('sense') },
    { title: t.colTitle3, sub: t.colSub3, icon: 'chain', bg: '#D7F3EA', deep: '#0E6B57', open: () => openPlay('domino') },
  ];
  const col = collections[WEEK_EPOCH_IDX % collections.length];
  // W6-B S5.5: when today's set actually contains the story's ticker, the card
  // wears that unit's ±% badge (real reaction next to the real headline)
  const ucUnitPct = ucCard ? units.find((u) => u.ticker === ucCard.ticker)?.moveMagnitude ?? null : null;
  const q = searchQ.trim().toLowerCase();
  const searchResults = (Object.keys(METRIC_GLOSSARY) as MetricTerm[]).filter((term) => {
    if (!q) return false;
    const e = METRIC_GLOSSARY[term];
    return `${e.title.ko} ${e.title.en} ${e.title.ja} ${e.body[loc]}`.toLowerCase().includes(q);
  }).slice(0, 12);

  return (
    <div style={{ minHeight: '100vh', color: P.ink, fontFamily: "-apple-system,'SF Pro Rounded','Hiragino Sans','Apple SD Gothic Neo',sans-serif", background: 'linear-gradient(180deg, #FAF7F2 0%, #F8F4F4 26%, #F3EEFB 52%, #F8F6FD 74%, #FFFFFF 100%)', position: 'relative' }}>
      <style>{WIM_KEYFRAMES}</style>

      {/* floating gradient blobs — depth behind the glass (W5-C: pre-blurred
          radial-gradients only — the old filter:blur layers cost iOS webview frames) */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-6%', right: '-14%', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,122,89,0.16), transparent 62%)', animation: 'wimFloat1 13s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '30%', left: '-16%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(25,184,147,0.13), transparent 62%)', animation: 'wimFloat2 16s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '4%', right: '-10%', width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(circle, rgba(108,92,231,0.16), transparent 60%)', animation: 'wimFloat3 18s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '8%', left: '20%', width: 150, height: 150, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,173,31,0.14), transparent 60%)', animation: 'wimFloat2 11s ease-in-out infinite' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: `0 16px calc(${WIM_ADS_LIVE ? 158 : 104}px + env(safe-area-inset-bottom))` }}>

        {/* glass masthead — W5-C: compressed one-liner (smaller mark, tighter row) */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 9, paddingTop: 'calc(12px + max(env(safe-area-inset-top), var(--wim-top-floor, 0px)))' }}>
          {/* 브랜드 마크 — W 모노그램(차트 스윙 W + 골드 캔들 심지), design/wim-logo C안 */}
          <span aria-hidden style={{ ...glass, width: 40, height: 40, borderRadius: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="27" height="27" viewBox="0 0 240 240" style={{ display: 'block' }}>
              <path d="M40 84 L82 180 L120 106 L158 180 L200 86" fill="none" stroke={P.heroDeep} strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="200" y1="80" x2="200" y2="40" stroke="#FFAD1F" strokeWidth="15" strokeLinecap="round" />
              <circle cx="200" cy="86" r="17" fill="#FFAD1F" />
            </svg>
          </span>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <div style={{ fontSize: 16.5, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, whiteSpace: 'nowrap' }}>Why&apos;d It Move?</div>
            <div style={{ marginTop: 2, fontSize: 9.5, fontWeight: 750 as any, color: P.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.tagline}</div>
          </div>
          <button type="button" onClick={() => setSettingsOpen(true)} aria-label={t.settings} style={{ ...glass, font: 'inherit', marginLeft: 'auto', flexShrink: 0, width: 40, height: 40, borderRadius: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Ic name="tune" size={18} color={P.ink} sw={1.8} />
          </button>
        </header>

        {/* ── TAB: HOME ── */}
        {homeTab === 'home' && (
          <>
            {/* ── S1 · live pulse strip — thin pills bleeding off-screen (real
                numbers only: 10Y, FOMC hold odds, next FOMC, today's mover) ── */}
            {(pulse?.ty?.yield10Y != null || pulse?.fw != null || heroU != null) && (
              <div className="no-sb" style={{ display: 'flex', gap: 7, overflowX: 'auto', margin: '12px -16px 0', padding: '2px 16px', WebkitOverflowScrolling: 'touch', animation: 'wimUp 0.3s ease' }}>
                {pulse?.ty?.yield10Y != null && (
                  <span style={pulsePill}><span style={pulseK}>{t.pulse10Y}</span><span style={pulseV}>{pulse.ty.yield10Y.toFixed(2)}%</span></span>
                )}
                {pulse?.fw != null && (
                  <span style={pulsePill}><span style={pulseK}>{t.pulseHold}</span><span style={pulseV}>{pulse.fw.noChange.toFixed(1)}%</span></span>
                )}
                {pulse?.fw?.daysUntilFomc != null && (
                  <span style={pulsePill}><span style={pulseK}>{t.pulseFomc}</span><span style={pulseV}>D-{pulse.fw.daysUntilFomc}</span></span>
                )}
                {heroU != null && (
                  <span style={pulsePill}><span style={pulseK}>{t.pulseMover}</span><span style={pulseV}>{heroU.ticker} ±{heroU.moveMagnitude}%</span></span>
                )}
              </div>
            )}

            {/* ── S2 · hero "today's move" — LIGHT editorial scene (W6-A replaces
                the W5-C navy slab): cream→soft-violet wash, the company + move
                as the unit headline, the luminous chart re-tuned for light, the
                streak ring riding top-right, CTA still floating over the edge ── */}
            {heroU && heroU.spark && heroU.spark.closes.length >= 8 ? (
              <section style={{ position: 'relative', marginTop: 12, paddingBottom: 25, animation: 'wimUp 0.35s ease' }}>
                <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 28, padding: '16px 16px 42px', background: 'linear-gradient(155deg, #FFFFFF 0%, #F7F3FF 48%, #EFE8FF 100%)', border: '1px solid rgba(108,92,231,0.13)', boxShadow: '0 20px 44px rgba(76,63,175,0.13), 0 4px 14px rgba(76,63,175,0.06)' }}>
                  {/* soft depth washes — violet low-left, warm amber up-right (gradients only) */}
                  <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(88% 60% at 12% 86%, rgba(108,92,231,0.10), transparent 62%), radial-gradient(56% 44% at 90% 12%, rgba(255,173,31,0.10), transparent 66%)' }} />
                  {/* the mover's real logo — quiet watermark on light; a white scrim keeps the ink readable */}
                  <LogoWatermark key={heroU.ticker} ticker={heroU.ticker} size={170} right={-22} top={10} opacity={0.08} />
                  <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(78deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.4) 55%, rgba(255,255,255,0) 100%)' }} />
                  <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: P.heroDeep, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ic name="folder" size={13} color={P.heroDeep} /> {t.heroEyebrow.toUpperCase()}</span>
                        <h1 style={{ margin: '9px 0 0', fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.28, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {t.heroHeadline.replace('{c}', shortCompanyName(heroU.companyName, heroU.ticker)).replace('{v}', String(heroU.moveMagnitude))}
                        </h1>
                      </div>
                      {/* streak ring + freeze count — progress woven into the hero (S2 per spec) */}
                      <div style={{ flexShrink: 0, textAlign: 'center' }}>
                        <div style={{ position: 'relative', width: 40, height: 40 }}>
                          <svg width="40" height="40" viewBox="0 0 40 40">
                            <circle cx="20" cy="20" r="15.5" fill="none" stroke="rgba(108,92,231,0.16)" strokeWidth="5" />
                            <circle cx="20" cy="20" r="15.5" fill="none" stroke={P.amber} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 15.5 * Math.max(0.02, Math.min(1, streakDays / 7))} ${2 * Math.PI * 15.5}`} transform="rotate(-90 20 20)" />
                          </svg>
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900 }}>{streakDays}</div>
                        </div>
                        {freezeLeft > 0 && (
                          <span title={t.freezeLabel} aria-label={t.freezeLabel} style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 900, color: P.heroDeep }}><Ic name="snow" size={10} color={P.heroDeep} sw={2.4} /> {freezeLeft}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}>
                      <TickerLogo ticker={heroU.ticker} size={30} />
                      <span style={{ fontSize: 13.5, fontWeight: 900 }}>{heroU.ticker}</span>
                      <span style={{ fontSize: 14, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: '#8A5B00', background: 'rgba(255,173,31,0.16)', border: '1px solid rgba(255,173,31,0.35)', borderRadius: 99, padding: '4px 11px' }}>±<CountUp value={heroU.moveMagnitude} />%</span>
                      <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 900, color: P.mint, background: P.mintSoft, borderRadius: 99, padding: '3px 9px' }}>● {t.realData.toUpperCase()}</span>
                    </div>
                    <div style={{ margin: '10px -16px 0' }}>
                      <RealChart
                        closes={heroU.spark.closes}
                        height={150}
                        tone="lumi"
                        levels={unlockLevels && heroLab && heroLab.levels.maxPain != null
                          ? [{ label: 'MAX PAIN', value: heroLab.levels.maxPain, color: '#C98A00' }]
                          : undefined}
                      />
                    </div>
                    <div style={{ marginTop: 9 }}>
                      <SessionStrip active={heroSession} labels={[t.sessionPre, t.sessionReg, t.sessionPost]} tone="light" />
                    </div>
                    {/* P6: ET weekend — one slim tinted pill ON the scene (no box-in-box) */}
                    {weekendET && (
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, background: 'rgba(108,92,231,0.08)', border: '1px solid rgba(108,92,231,0.16)', borderRadius: 99, padding: '7px 13px' }}>
                        <Ic name="replay" size={13} color={P.heroDeep} />
                        <span style={{ fontSize: 11, fontWeight: 900, color: P.heroDeep, whiteSpace: 'nowrap', flexShrink: 0 }}>{t.weekendTitle}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: P.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{t.weekendSub}</span>
                      </div>
                    )}
                  </div>
                </div>
                {/* the CTA floats over the card's bottom edge — ink pill (dark stays ink-only) */}
                <button type="button" onClick={() => startQuiz(heroIdx)} style={{ font: 'inherit', position: 'absolute', left: 18, right: 18, bottom: 0, background: P.ink, color: '#fff', border: 'none', borderRadius: 26, padding: '13px 18px', fontSize: 14.5, fontWeight: 900, cursor: 'pointer', lineHeight: 1.3, boxShadow: '0 12px 26px rgba(38,34,64,0.28), 0 3px 8px rgba(38,34,64,0.16)' }}>
                  <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'keep-all' }}>
                    {heroU.prompt[loc]} · {t.solve}{' '}→
                  </span>
                </button>
              </section>
            ) : !failed && !today ? (
              <div className="wim-skel-cream" style={{ height: 330, borderRadius: 28, marginTop: 12, border: '1px solid rgba(108,92,231,0.10)' }} />
            ) : null}
            {failed && !today && (
              <div style={{ ...glass, marginTop: 16, borderRadius: 20, padding: '18px 16px', fontSize: 13, fontWeight: 700, color: P.sub, textAlign: 'center' }}>{t.empty}</div>
            )}

            {/* ── S3 · continue learning — one compact resume row, only while
                today's set is mid-progress (hidden when untouched or done) ── */}
            {units.length > 0 && doneCount > 0 && doneCount < units.length && heroU && (
              <button type="button" className="wim-press" onClick={() => startQuiz(heroIdx)} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(38,34,64,0.07)', borderRadius: 17, padding: '11px 13px', boxShadow: '0 6px 16px rgba(76,63,175,0.07)', animation: 'wimUp 0.3s ease' }}>
                <TickerLogo ticker={heroU.ticker} size={26} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 900 }}>{t.resumeLine.replace('{a}', String(doneCount)).replace('{b}', String(units.length))}</span>
                  <span style={{ display: 'block', marginTop: 5, height: 5, background: 'rgba(108,92,231,0.12)', borderRadius: 99, overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${(doneCount / units.length) * 100}%`, height: '100%', background: P.hero, borderRadius: 99 }} />
                  </span>
                </span>
                <span style={{ color: P.hero, fontWeight: 900 }}>›</span>
              </button>
            )}

            {setDoneShown && doneCount === units.length && units.length > 0 && (
              <div style={{ ...glass, marginTop: 10, borderRadius: 20, padding: '14px 16px', textAlign: 'center', animation: 'wimUp 0.35s ease' }}>
                <div style={{ fontSize: 14.5, fontWeight: 900, color: P.mint , display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Ic name="check" size={15} color={P.mint} sw={2.4} /> {t.setDone}</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: P.sub, marginTop: 3 }}>{t.setDoneSub}</div>
                {/* W5-B: brag card for the finished set — today's facts only, rendered on-device */}
                <button
                  type="button"
                  onClick={() => {
                    const u = units[0];
                    void buildShareCard({ dateET: today?.dateET || u.dateET, ticker: u.ticker, movePct: u.moveMagnitude, scoreFilled: correctToday, scoreTotal: units.length, closes: u.spark?.closes || null, footer: t.shareFooter });
                  }}
                  style={{ font: 'inherit', marginTop: 11, background: P.hero, color: '#fff', border: 'none', borderRadius: 99, padding: '9px 20px', fontSize: 12.5, fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}
                >
                  <Ic name="share" size={14} color="#fff" sw={2} /> {t.share}
                </button>
              </div>
            )}

            {/* ── S4 · curriculum tracks 2×2 — saturated LIGHT collection tiles on a
                full-bleed violet wash band (feathered edges — color flows, no border
                cuts); XP chip rides the header (progress lives IN the feed) ── */}
            <section style={{ margin: '22px -16px 0', padding: '16px 16px 26px', background: 'linear-gradient(180deg, rgba(108,92,231,0) 0%, rgba(108,92,231,0.06) 22%, rgba(108,92,231,0.06) 78%, rgba(108,92,231,0) 100%)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px' }}>
                <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 900, letterSpacing: '-0.01em' }}>{t.tracksTitle}</h2>
                <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: P.heroDeep, background: 'rgba(255,255,255,0.8)', borderRadius: 99, padding: '5px 10px' }}><Ic name="shield" size={12} color={P.heroDeep} /> {xp} {t.xp}</span>
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: P.sub, marginTop: 3, padding: '0 2px' }}>{t.tracksSub}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginTop: 12 }}>
                {TRACKS.map((tr, i) => {
                  const total = tr.terms.length;
                  const got = tr.terms.filter((tm) => almanac[tm]).length;
                  // W6-B: tiles open the track detail sheet — the play mapping
                  // now lives behind the sheet's single next-step CTA
                  const onTap = () => openTrack(tr.id);
                  return (
                    <button key={tr.id} type="button" className="wim-press" onClick={onTap} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', background: tr.bg, color: tr.deep, border: 'none', borderRadius: 20, padding: '13px 13px 12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minHeight: 128, boxShadow: '0 10px 22px rgba(38,34,64,0.08)', animation: `wimUp 0.3s ${EASE_OUT} ${i * 40}ms both` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%' }}>
                        <span style={{ width: 30, height: 30, borderRadius: 11, background: 'rgba(255,255,255,0.55)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ic name={tr.icon} size={16} color={tr.deep} sw={2} /></span>
                        {total > 0 ? (
                          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
                              <circle cx="11" cy="11" r="8.5" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="3.5" />
                              <circle cx="11" cy="11" r="8.5" fill="none" stroke={tr.deep} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 8.5 * (got > 0 ? Math.max(0.05, got / total) : 0)} ${2 * Math.PI * 8.5}`} transform="rotate(-90 11 11)" />
                            </svg>
                            <span style={{ fontSize: 9.5, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{got}/{total}</span>
                          </span>
                        ) : (
                          <span style={{ marginLeft: 'auto', fontSize: 8.5, fontWeight: 900, letterSpacing: '0.04em', background: 'rgba(255,255,255,0.6)', borderRadius: 99, padding: '3px 8px' }}>{t.trackNew}</span>
                        )}
                      </div>
                      <div style={{ marginTop: 10, fontSize: 14.5, fontWeight: 900, letterSpacing: '-0.01em' }}>{t[`track${i + 1}`]}</div>
                      <span style={{ marginTop: 5, fontSize: 8.5, fontWeight: 900, background: tr.chip, borderRadius: 99, padding: '3px 8px' }}>{t[`trackDiff${i + 1}`]}</span>
                      <div style={{ marginTop: 'auto', paddingTop: 9, fontSize: 10, fontWeight: 800, lineHeight: 1.4, opacity: 0.85, display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                        <span style={{ marginTop: 1, flexShrink: 0 }}><Ic name="arrowR" size={10} color={tr.deep} sw={2.4} /></span>
                        <span>{t[`trackNext${i + 1}`]}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── S5 · learn from today's data — a rail bleeding off both screen
                edges, pulled UP over the S4 wash boundary (sections flow into each
                other instead of stacking); tint play cards + concept of the day ── */}
            <section style={{ marginTop: -14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px' }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 7 }}><Ic name="play" size={15} color={P.heroDeep} /> {t.dailyRail}</h2>
                {units.length > 0 && <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 900, color: doneCount === units.length ? P.mint : P.faint }}>{doneCount}/{units.length} {t.done}</span>}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: P.sub, marginTop: 2, padding: '0 2px' }}>{t.dailyRailSub}</div>
              <div className="no-sb" style={{ display: 'flex', alignItems: 'stretch', gap: 11, overflowX: 'auto', margin: '10px -16px 0', padding: '2px 16px 8px', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}>
                {playCards}
                {conceptCard}
              </div>
            </section>

            {/* ── S5.5 · news→money daily lesson — ONE editorial photo card (the
                Shangri-La beat of the feed: real news image, real ticker, coral
                news-track chip) opening the three-step reading mini-lesson ── */}
            {ucCard && (
              <section style={{ margin: '18px 0 0' }}>
                <button type="button" className="wim-press" onClick={() => openPlay('news')} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%', background: '#fff', border: '1px solid rgba(38,34,64,0.06)', borderRadius: 24, overflow: 'hidden', boxShadow: '0 14px 30px rgba(38,34,64,0.10)', padding: 0, animation: 'wimUp 0.3s ease' }}>
                  {ucCard.image && <NewsImage src={ucCard.image} height={150} />}
                  <span style={{ display: 'block', padding: '12px 15px 14px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.08em', color: P.faint }}>{t.newsDaily.toUpperCase()}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 8.5, fontWeight: 900, color: '#A83A1D', background: '#FFD8CB', borderRadius: 99, padding: '3px 9px' }}>{t.track4}</span>
                    </span>
                    <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: '9px 0 0', fontSize: 16, fontWeight: 900, letterSpacing: '-0.01em', lineHeight: 1.35, color: P.ink }}>{ucCard.plainTitle}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10 }}>
                      <TickerLogo ticker={ucCard.ticker} size={22} />
                      <span style={{ fontSize: 11.5, fontWeight: 900, color: P.ink }}>{ucCard.ticker}</span>
                      {ucUnitPct != null && <span style={{ fontSize: 10.5, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: '#8A5B00', background: 'rgba(255,173,31,0.16)', borderRadius: 99, padding: '3px 9px' }}>±{ucUnitPct}%</span>}
                      <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 11, fontWeight: 900, background: P.ink, color: '#fff', borderRadius: 99, padding: '6px 13px' }}>{t.colOpen}</span>
                    </span>
                  </span>
                </button>
              </section>
            )}

            {/* ── S6 · rotating collection teaser + slim dictionary entry — the
                exploration slot, slightly inset (its own scale, not another brick) ── */}
            <section style={{ margin: '18px 4px 0' }}>
              <button type="button" className="wim-press" onClick={col.open} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%', background: `linear-gradient(140deg, #FFFFFF 0%, ${col.bg} 90%)`, border: '1px solid rgba(38,34,64,0.06)', borderRadius: 26, padding: '16px 17px', color: col.deep, boxShadow: '0 14px 30px rgba(38,34,64,0.09)', display: 'flex', alignItems: 'center', gap: 13, animation: 'wimUp 0.3s ease' }}>
                <span style={{ width: 46, height: 46, borderRadius: 16, background: 'rgba(255,255,255,0.7)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(38,34,64,0.07)', flexShrink: 0 }}><Ic name={col.icon} size={22} color={col.deep} sw={1.8} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 8.5, fontWeight: 900, letterSpacing: '0.1em' }}>{t.collectionLabel.toUpperCase()}</span>
                  <span style={{ display: 'block', marginTop: 3, fontSize: 15.5, fontWeight: 900, letterSpacing: '-0.01em', color: P.ink }}>{col.title}</span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 10.5, fontWeight: 750 as any, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.sub}</span>
                </span>
                <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 900, background: P.ink, color: '#fff', borderRadius: 99, padding: '6px 13px' }}>{t.colOpen}</span>
              </button>
              {/* the full library lives in the lib tab — this is just the doorway */}
              <button type="button" onClick={() => { setHomeTab('lib'); window.scrollTo(0, 0); }} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(38,34,64,0.06)', borderRadius: 16, padding: '11px 14px' }}>
                <Ic name="book" size={16} color={P.heroDeep} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 900, color: P.ink }}>{t.curriculum}</span>
                  <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: P.sub }}>{t.dictRowSub.replace('{n}', String(Object.keys(METRIC_GLOSSARY).length))}</span>
                </span>
                <span style={{ color: P.hero, fontWeight: 900 }}>›</span>
              </button>
            </section>
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
            {/* 예감 기록(A급 ①) — 직감 정확도: 30일 롤링 자기 채점 곡선. 5회 미만이면
                정직한 잠금 상태(가짜 100% 금지). */}
            {(() => {
              const days = Object.keys(cal).sort();
              const tot = days.reduce((s, k) => s + cal[k][0], 0);
              const cor = days.reduce((s, k) => s + cal[k][1], 0);
              const pct = tot >= 5 ? Math.round((cor / tot) * 100) : null;
              const last14 = days.slice(-14);
              return (
                <div style={{ ...glass, borderRadius: 22, padding: '14px 15px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 7 }}><Ic name="crosshair" size={15} color={P.heroDeep} /> {t.calTitle}</h2>
                    {pct != null && <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 900, color: P.heroDeep, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>}
                  </div>
                  {pct != null ? (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: P.sub, marginTop: 3 }}>{t.calSub.replace('{a}', String(tot)).replace('{b}', String(cor))}</div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 34, marginTop: 10 }}>
                        {last14.map((k) => {
                          const [dt, dc] = cal[k];
                          const p = dt > 0 ? dc / dt : 0;
                          return <div key={k} title={k} style={{ flex: 1, height: `${Math.max(12, p * 100)}%`, borderRadius: 4, background: p >= 0.5 ? P.hero : 'rgba(108,92,231,0.25)' }} />;
                        })}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: P.sub, marginTop: 3 }}>{t.calEmpty}</div>
                  )}
                </div>
              );
            })()}

            {/* W3: concept almanac — collected cards carry the real chart of the day they were earned */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 7 }}><Ic name="spark" size={15} color={P.heroDeep} /> {t.almanacTitle}</h2>
              <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 900, color: P.heroDeep, background: P.heroSoft, borderRadius: 99, padding: '3px 10px', fontVariantNumeric: 'tabular-nums' }}>{ALMANAC_TERMS.filter((tm) => almanac[tm]).length}/{ALMANAC_TERMS.length}</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: P.sub, marginTop: 3 }}>{t.almanacSub}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '10px 0 16px' }}>
              {ALMANAC_TERMS.map((term) => {
                const ent = almanac[term];
                if (!ent) {
                  return (
                    <div key={term} style={{ borderRadius: 18, padding: '11px 12px 10px', border: `1.5px dashed ${P.line}`, background: 'rgba(255,255,255,0.35)' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', color: P.faint }}><Ic name="lock" size={13} /></div>
                      <div style={{ height: 38, margin: '8px 0 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: P.faint, opacity: 0.6 }}><Ic name="spark" size={18} sw={1.5} /></div>
                      <div style={{ fontSize: 11.5, fontWeight: 850 as any, lineHeight: 1.3, color: P.faint, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{METRIC_GLOSSARY[term].title[loc]}</div>
                    </div>
                  );
                }
                return (
                  <button key={term} type="button" onClick={() => markTerm(term)} style={{ ...glass, font: 'inherit', textAlign: 'left', cursor: 'pointer', borderRadius: 18, padding: '11px 12px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.06em', color: P.heroDeep, background: P.heroSoft, borderRadius: 6, padding: '2px 7px', fontVariantNumeric: 'tabular-nums' }}>{ent.dateET}</span>
                      <Ic name="check" size={13} color={P.mint} sw={2.6} />
                    </div>
                    <div style={{ margin: '8px -2px 4px' }}>
                      {ent.closes.length >= 2 ? <MiniSpark closes={ent.closes} w={150} h={38} /> : <div style={{ height: 38 }} />}
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: 850 as any, lineHeight: 1.3, color: P.ink, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{METRIC_GLOSSARY[term].title[loc]}</div>
                    <div style={{ marginTop: 3, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.05em', color: P.faint }}>{ent.ticker}</div>
                  </button>
                );
              })}
            </div>

            {/* W5-B belt map — the existing XP rank ladder as a vertical progression map.
                Unlock labels stay truthful: base plays exist, max-pain layer opens via the
                hunt (not XP), everything higher is honestly marked "soon". */}
            <div style={{ ...glass, borderRadius: 22, padding: '14px 15px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 7 }}><Ic name="flag" size={15} color={P.heroDeep} /> {t.beltTitle}</h2>
                <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 900, color: P.heroDeep, background: P.heroSoft, borderRadius: 99, padding: '3px 10px', fontVariantNumeric: 'tabular-nums' }}>{levelIdx + 1}/{levelNames.length}</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: P.sub, marginTop: 3 }}>{t.beltSub}</div>
              <div style={{ marginTop: 12 }}>
                {levelNames.map((name, i) => {
                  const passed = i < levelIdx;
                  const current = i === levelIdx;
                  const icon = ['search', 'crosshair', 'layers', 'flow', 'bank'][i];
                  const unlockLabel = i === 0 ? t.beltUnlockBase : i === 1 ? t.beltUnlockLevels : t.beltSoon;
                  const unlockDone = (i === 0) || (i === 1 && unlockLevels);
                  return (
                    <div key={name} style={{ display: 'flex', gap: 11, alignItems: 'stretch' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 30, flexShrink: 0 }}>
                        <span style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: current ? `linear-gradient(150deg, ${P.hero}, ${P.heroDeep})` : passed ? P.heroSoft : 'transparent', border: passed || current ? 'none' : `1.5px dashed ${P.line}` }}>
                          {passed
                            ? <Ic name="check" size={14} color={P.heroDeep} sw={2.6} />
                            : <Ic name={icon} size={15} color={current ? '#fff' : P.faint} sw={current ? 2 : 1.7} />}
                        </span>
                        {i < levelNames.length - 1 && <span style={{ flex: 1, width: 2, minHeight: 10, borderRadius: 99, background: passed ? 'rgba(108,92,231,0.45)' : P.line, margin: '3px 0' }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingBottom: i < levelNames.length - 1 ? 12 : 0 }}>
                        <div style={{ background: current ? P.heroSoft : 'transparent', borderRadius: 12, padding: current ? '8px 11px' : '2px 0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 900, color: passed || current ? P.ink : P.faint }}>{name}</span>
                            {current && <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.08em', color: '#fff', background: P.hero, borderRadius: 99, padding: '2px 7px' }}>{t.beltNow}</span>}
                            <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: passed || current ? P.heroDeep : P.faint }}>{i * XP_PER_LEVEL} {t.xp}</span>
                          </div>
                          <div style={{ marginTop: 2, fontSize: 10, fontWeight: 750 as any, color: passed || current ? P.sub : P.faint, display: 'flex', alignItems: 'center', gap: 5 }}>
                            {unlockDone ? <Ic name="check" size={10} color={P.mint} sw={2.6} /> : <Ic name={i === 1 ? 'crosshair' : 'lock'} size={10} color={P.faint} sw={1.8} />}
                            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{unlockLabel}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ ...glassDark, borderRadius: 24, padding: '16px 15px', color: '#fff' }}>
              <StreakRing days={streakDays} t={t} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                {weekLabels.map((d, i) => {
                  const on = week[i]; const isToday = i === weekdayIdx();
                  const frozen = !on && preservedWeek[i];
                  return (
                    <div key={i} style={{ textAlign: 'center' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: on ? '#fff' : frozen ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.14)', border: isToday && !on ? '2px solid rgba(255,255,255,0.7)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: on ? P.hero : 'rgba(255,255,255,0.7)' }}>
                        {/* a frozen day shows the snow glyph — preserved, never counted */}
                        {on ? '✓' : frozen ? <Ic name="snow" size={13} color="rgba(255,255,255,0.95)" sw={2.2} /> : ''}
                      </div>
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

      {/* W3: almanac collect toast */}
      {almToastNode}

      {/* W5-A unlock drama — first hunt completion: 1.4s full-screen moment (dark
          scrim → the real mini chart draws itself → MAX PAIN dashes sweep in), then
          it collapses toward the hero and hands off to the toast. Tap to skip. */}
      {unlockDrama && (
        <div onClick={endUnlockDrama} role="button" aria-label={t.close} style={{ position: 'fixed', inset: 0, zIndex: 98, background: 'rgba(11,15,26,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', animation: 'wimFadeIn 0.2s ease both' }}>
          <div style={{ width: 'min(78vw, 340px)', textAlign: 'center', animation: 'wimDramaOut 0.3s ease 1.4s forwards' }}>
            <svg viewBox="0 0 280 120" style={{ width: '100%', display: 'block', overflow: 'visible' }} aria-hidden>
              <path d={dramaPath} fill="none" stroke="#E9E4FF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" pathLength={100} strokeDasharray="100 100" style={{ animation: 'wimDrawKeep 0.55s ease-out 0.15s both' }} />
              <line x1="0" x2="280" y1="38" y2="38" stroke="#FFD66B" strokeWidth="1.8" strokeDasharray="6 5" style={{ animation: 'wimSweepIn 0.35s ease-out 0.7s both' }} />
              <text x="276" y="30" textAnchor="end" fontSize="11" fontWeight="900" fill="#FFD66B" style={{ animation: 'wimFadeIn 0.3s ease 0.85s both' }}>MAX PAIN</text>
            </svg>
            <div style={{ marginTop: 14, fontSize: 15, fontWeight: 900, color: '#fff', letterSpacing: '0.02em', animation: 'wimFadeIn 0.3s ease 0.95s both' }}>MAX PAIN — {t.unlockDramaLabel}</div>
          </div>
        </div>
      )}

      {/* one-time overlay-unlock toast — the hero chart grew a new layer */}
      {unlockToast && (
        <div style={{ position: 'fixed', top: 'calc(14px + max(env(safe-area-inset-top), var(--wim-top-floor, 0px)))', left: 16, right: 16, zIndex: 96, display: 'flex', justifyContent: 'center', pointerEvents: 'none', animation: 'wimUp 0.3s ease' }}>
          <div style={{ maxWidth: 520, display: 'flex', alignItems: 'center', gap: 9, background: `linear-gradient(135deg, ${P.heroDeep}, ${P.hero})`, color: '#fff', borderRadius: 16, padding: '11px 15px', boxShadow: '0 14px 34px rgba(76,63,175,0.35)' }}>
            <Ic name="layers" size={16} color="#FFD66B" />
            <span style={{ fontSize: 12, fontWeight: 900 }}>{t.unlockToast}</span>
          </div>
        </div>
      )}

      {/* W5-B one-time freeze toast — a token quietly saved yesterday's chain */}
      {freezeToast != null && !unlockToast && (
        <div style={{ position: 'fixed', top: 'calc(14px + max(env(safe-area-inset-top), var(--wim-top-floor, 0px)))', left: 16, right: 16, zIndex: 96, display: 'flex', justifyContent: 'center', pointerEvents: 'none', animation: 'wimUp 0.3s ease' }}>
          <div style={{ maxWidth: 520, display: 'flex', alignItems: 'center', gap: 9, background: `linear-gradient(135deg, ${P.heroDeep}, ${P.hero})`, color: '#fff', borderRadius: 16, padding: '11px 15px', boxShadow: '0 14px 34px rgba(76,63,175,0.35)' }}>
            <Ic name="snow" size={16} color="#FFD66B" sw={2} />
            <span style={{ fontSize: 12, fontWeight: 900 }}>{t.freezeToast.replace('{n}', String(freezeToast))}</span>
          </div>
        </div>
      )}

      {/* ① bottom banner ad slot — inert until WIM_ADS_LIVE (sits above the tab bar) */}
      {WIM_ADS_LIVE && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(84px + env(safe-area-inset-bottom))', height: 56, background: 'rgba(255,255,255,0.9)', borderTop: `1px solid ${P.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: P.faint, zIndex: 49 }}>
          {t.adBanner}
        </div>
      )}

      {/* glass bottom tab bar */}
      <nav style={{ position: 'fixed', left: 14, right: 14, bottom: 'calc(14px + env(safe-area-inset-bottom))', zIndex: 50, maxWidth: 532, margin: '0 auto', background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.9)', borderRadius: 24, boxShadow: '0 14px 36px rgba(76,63,175,0.22)', display: 'flex', padding: 6 }}>
        {([
          { id: 'home', icon: 'home', label: t.tabHome },
          { id: 'lib', icon: 'book2', label: t.tabLib },
          { id: 'search', icon: 'search', label: t.tabSearch },
          { id: 'me', icon: 'journal', label: t.tabMe },
        ] as const).map((tb) => {
          const active = homeTab === tb.id;
          return (
            <button key={tb.id} type="button" aria-label={tb.label} onClick={() => { setHomeTab(tb.id); window.scrollTo(0, 0); }} style={{
              font: 'inherit', flex: 1, border: 'none', cursor: 'pointer', borderRadius: 18, padding: '9px 0 8px',
              background: active ? `linear-gradient(150deg, ${P.hero}, ${P.heroDeep})` : 'transparent',
              color: active ? '#fff' : P.sub, transition: 'background 0.2s ease',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
              <Ic name={tb.icon} size={19} color={active ? '#fff' : P.sub} sw={active ? 2 : 1.7} />
              <span style={{ fontSize: 9.5, fontWeight: 900 }}>{tb.label}</span>
            </button>
          );
        })}
      </nav>

      {/* settings sheet — language lives here now */}
      {settingsOpen && (
        <div onClick={() => setSettingsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(38,34,64,0.45)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, margin: '0 auto', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderRadius: '24px 24px 0 0', padding: '20px 20px calc(26px + env(safe-area-inset-bottom))', animation: 'wimUp 0.25s ease' }}>
            <div style={{ fontSize: 16, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 7 }}><Ic name="tune" size={16} sw={1.8} /> {t.settings}</div>
            <div style={{ marginTop: 14, fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', color: P.faint }}>{t.language.toUpperCase()}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {([['en', 'English'], ['ja', '日本語'], ['ko', '한국어']] as const).map(([code, name]) => (
                <button key={code} type="button" onClick={() => {
                  setSettingsOpen(false);
                  if (code !== loc) {
                    // Persist BEFORE navigating: the mount-time self-routing effect
                    // reads wim.locale and would otherwise bounce right back to the
                    // old locale (the switcher looked broken — every user stuck on
                    // their first language). Write first so the effect agrees.
                    try { localStorage.setItem('wim.locale', code); } catch { /* storage off */ }
                    router.replace(`/${code}/wim`);
                  }
                }} style={{
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
      {glossOpen && <GlossarySheet term={glossOpen} lab={lab} loc={loc} t={t} live={{ yield10Y: pulse?.ty?.yield10Y ?? null, holdPct: pulse?.fw?.noChange ?? null, fomcDays: pulse?.fw?.daysUntilFomc ?? null }} onClose={() => setGlossOpen(null)} />}
    </div>
  );
}
