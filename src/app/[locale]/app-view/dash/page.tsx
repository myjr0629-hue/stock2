'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { MobileAppFooter } from '@/components/mobile/MobileAppFooter';
import { Sparkline } from '@/components/app/Sparkline';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import { AdBanner } from '@/components/app/AdBanner';
import { ValueWall } from '@/components/app/ValueWall';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { maybePromptReview } from '@/lib/native/capacitorBridge';
import s from './dash.module.css';

/* ═══════════════════════════════════════════════════════════
   DEMO FALLBACK DATA — Always show content even if APIs fail
   ═══════════════════════════════════════════════════════════ */

interface PulseItem {
  sym: string;
  px: number;
  chg: number;
  up: boolean;
  spark: number[];
  /**
   * 피드가 이 심볼 값을 못 주면 true. 이때 px/chg 는 자리를 채우고 있을 뿐이므로
   * 화면에 «숫자»로 그리지 않는다. (DEMO_ETFS 시드가 라이브 카드로 새던 경로)
   */
  noData?: boolean;
  live?: boolean;
  updatedAt?: string;
  marketTime?: string;
  marketAgeSec?: number;
  feedSource?: string;
  isStale?: boolean;
  feedAgeSec?: number;
}

interface MacroItem {
  label: string;
  value: string;
  chg: number;
  unit: string;
  badge?: string;
  live?: boolean;
  updatedAt?: string;
  marketTime?: string;
  marketAgeSec?: number;
  feedSource?: string;
  isStale?: boolean;
  feedAgeSec?: number;
}

interface SectorItem {
  name: string;
  pct: number;
}

interface MoverItem {
  sym: string;
  px: string;
  chg: string;
  up: boolean;
  spark: number[];
}

const DEMO_INDICES: PulseItem[] = [
  { sym: 'DOW', px: 39127.14, chg: 0.18, up: true, spark: [5, 6, 5, 7, 6, 8, 7, 8, 9] },
  { sym: 'NASDAQ', px: 17862.64, chg: 0.35, up: true, spark: [4, 5, 6, 5, 7, 8, 7, 9, 10] },
  { sym: 'S&P 500', px: 5473.17, chg: 0.25, up: true, spark: [5, 5, 6, 5, 7, 7, 8, 8, 9] },
];

const DEMO_FUTURES: PulseItem[] = [
  { sym: 'NASDAQ100 F', px: 19850.50, chg: 0.45, up: true, spark: [5, 6, 5, 7, 6, 8, 7, 8, 9] },
  { sym: 'S&P500 F', px: 5490.25, chg: 0.30, up: true, spark: [5, 5, 6, 5, 7, 7, 8, 8, 9] },
  { sym: 'Russell2k F', px: 2120.40, chg: 0.15, up: true, spark: [4, 5, 6, 5, 7, 8, 7, 9, 10] },
];

const DEMO_ETFS: PulseItem[] = [
  { sym: 'SPY', px: 542.30, chg: 0.82, up: true, spark: [5, 5, 6, 5, 7, 8, 7, 9, 10] },
  { sym: 'QQQ', px: 470.15, chg: 1.24, up: true, spark: [4, 5, 5, 6, 6, 8, 9, 9, 11] },
  { sym: 'VIX', px: 21.5, chg: -3.1, up: false, spark: [11, 10, 11, 9, 8, 8, 7, 6, 6] },
];

// Display order so the three Market-Pulse rows line up column-wise:
// col1 = Nasdaq family, col2 = S&P family, col3 = other. The data builders
// keep their own (spark-tied) order; we only reorder for presentation.
const PULSE_INDEX_ORDER = ['NASDAQ', 'S&P 500', 'DOW'];
const PULSE_ETF_ORDER = ['QQQ', 'SPY', 'VIX'];
const sortPulse = (arr: PulseItem[], order: string[]): PulseItem[] =>
  [...arr].sort((a, b) => {
    const ia = order.indexOf(a.sym); const ib = order.indexOf(b.sym);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

// Last real fetched values, kept at MODULE scope so they survive the component
// unmounting on navigation. Without this, navigating away and back re-initialised
// the Market Pulse rows to the DEMO_* placeholders (cash row showed e.g. NASDAQ
// 17,863 / +0.35% instead of the live Redis value). On remount we seed state from
// these instead of the demo data; the demo arrays are only ever shown on the very
// first load before the first successful fetch.
let lastGoodIndices: PulseItem[] | null = null;

function buildIndexItems(idx: any): PulseItem[] {
  const items: PulseItem[] = [];
  if (idx?.dow) items.push({ sym: 'DOW', px: idx.dow.price, chg: idx.dow.changePct, up: idx.dow.changePct >= 0, spark: DEMO_INDICES[0].spark });
  if (idx?.nasdaq) items.push({ sym: 'NASDAQ', px: idx.nasdaq.price, chg: idx.nasdaq.changePct, up: idx.nasdaq.changePct >= 0, spark: DEMO_INDICES[1].spark });
  if (idx?.spx) items.push({ sym: 'S&P 500', px: idx.spx.price, chg: idx.spx.changePct, up: idx.spx.changePct >= 0, spark: DEMO_INDICES[2].spark });
  return items;
}
let lastGoodFutures: PulseItem[] | null = null;
let lastGoodEtfs: PulseItem[] | null = null;

const DEMO_MACRO: MacroItem[] = [
  { label: 'BTC', value: '$68.5K', chg: 2.1, unit: '%' },
  { label: 'GOLD', value: '$2,340', chg: -0.4, unit: '%' },
  { label: 'OIL', value: '$72.3', chg: 1.2, unit: '%' },
  { label: 'SOX', value: '5,200', chg: 1.1, unit: '%' },
  { label: 'US 10Y', value: '4.25%', chg: -0.03, unit: '' },
  { label: 'DXY', value: '104.2', chg: 0.1, unit: '' },
  { label: '2s10s', value: '+0.25', chg: 0, unit: '', badge: 'STEEP' },
  { label: 'F&G', value: '68', chg: 0, unit: '', badge: 'GREED' },
];

const DEMO_SECTORS: SectorItem[] = [
  { name: 'Tech', pct: 2.1 }, { name: 'Energy', pct: 1.2 },
  { name: 'Cons. Disc', pct: 0.9 }, { name: 'Materials', pct: 0.6 },
  { name: 'Industrials', pct: 0.4 }, { name: 'Finance', pct: 0.3 },
  { name: 'Healthcare', pct: -0.5 }, { name: 'Utilities', pct: -0.8 },
];

const DEMO_BRIEFING = 'Futures point <strong>higher</strong> as cooling CPI revives rate-cut bets. <strong>Semis</strong> lead pre-market on AI capex headlines, while <strong>energy</strong> firms on crude\'s third up-day. Watch <strong>NVDA</strong> into its options expiry — dealer gamma is pinning price near $135.';

/* ═══════════════════════════════════════════════════════════
   Helper: format numbers with locale-aware separators
   ═══════════════════════════════════════════════════════════ */

function fmtPrice(n: number): string {
  if (n >= 10000) return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (n >= 100) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtChg(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function avgChange(items: PulseItem[]): number {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + (Number.isFinite(item.chg) ? item.chg : 0), 0) / items.length;
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function hasUsableQuote(quote: any): boolean {
  return Boolean(quote && Number(quote.price) > 0 && quote.changePercent != null);
}

function stableChangePct(quote: any, fallback: number, allowZero: boolean): number {
  if (!hasUsableQuote(quote)) return fallback;
  const pct = Number(quote.changePercent);
  if (Math.abs(pct) < 0.0001) {
    const price = Number(quote.price);
    const prevClose = Number(quote.previousClose ?? quote.prevClose);
    if (price > 0 && prevClose > 0 && Math.abs(price - prevClose) > 0.001) {
      return ((price - prevClose) / prevClose) * 100;
    }
  }
  if (!allowZero && Math.abs(pct) < 0.0001) return fallback;
  return pct;
}

function parsePctText(value: string): number | null {
  const parsed = Number(String(value).replace('%', '').replace('+', '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

const REDIS_FEED_FRESH_SEC = 390;

function getEtClockParts() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
  const parts = formatter.formatToParts(now);
  const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const year = Number(partMap.year);
  const month = Number(partMap.month) - 1;
  const dayOfMonth = Number(partMap.day);
  const hour = Number(partMap.hour);
  const minute = Number(partMap.minute);
  const etDate = new Date(year, month, dayOfMonth, hour, minute);
  return {
    day: etDate.getDay(),
    hour,
    minute,
    timeDecimal: hour + minute / 60,
    totalMins: hour * 60 + minute,
  };
}

function isCmeGlobexActive(kind: 'equity' | 'gold' | 'oil', isHoliday: boolean): boolean {
  const { day, timeDecimal } = getEtClockParts();
  if (day === 6) return false;
  if (day === 0) return timeDecimal >= 18;
  if (isHoliday) {
    const haltTime = kind === 'gold' ? 13.75 : 13;
    return timeDecimal < haltTime || timeDecimal >= 18;
  }
  if (day === 5) return timeDecimal < 17;
  return timeDecimal < 17 || timeDecimal >= 18;
}

function isVixSessionActive(isHoliday: boolean): boolean {
  const { day, timeDecimal } = getEtClockParts();
  if (day === 0 || day === 6 || isHoliday) return false;
  // VIX: pre-market(4:00 AM) ~ post-market(8:00 PM) ET
  return timeDecimal >= 4 && timeDecimal < 20;
}

function isUs10YSessionActive(isHoliday: boolean): boolean {
  const { day, timeDecimal } = getEtClockParts();
  if (isHoliday || day === 0 || day === 6) return false;
  return timeDecimal >= 8 && timeDecimal < 17.25;
}

function isDxySessionActive(): boolean {
  const { day, totalMins } = getEtClockParts();
  if (day === 6) return false;
  if (day === 0) return totalMins >= 18 * 60;
  if (day === 5) return totalMins < 17 * 60;
  return totalMins < 17 * 60 || totalMins >= 20 * 60;
}

function isFreshFeedFactor(factor: any, maxAgeSec = REDIS_FEED_FRESH_SEC): boolean {
  if (!factor || factor.status !== 'OK' || factor.feedSource === 'DEFAULT' || factor.isStale) {
    return false;
  }
  if (typeof factor.marketAgeSec === 'number') {
    return factor.marketAgeSec <= maxAgeSec;
  }
  if (factor.marketTime) {
    const marketMs = new Date(factor.marketTime).getTime();
    return Number.isFinite(marketMs) && Date.now() - marketMs <= maxAgeSec * 1000;
  }
  if (typeof factor.feedAgeSec === 'number') {
    return factor.feedAgeSec <= maxAgeSec;
  }
  if (factor.updatedAt) {
    const updatedMs = new Date(factor.updatedAt).getTime();
    return Number.isFinite(updatedMs) && Date.now() - updatedMs <= maxAgeSec * 1000;
  }
  return false;
}

function feedMetaForItem(
  factor: any,
  sessionActive = true,
  options: { requireFresh?: boolean } = {}
) {
  const requireFresh = options.requireFresh ?? true;
  const hasLiveFeed = factor && factor.feedSource !== 'DEFAULT' && factor.feedSource !== 'FALLBACK';
  return {
    live: sessionActive && (requireFresh ? isFreshFeedFactor(factor) : hasLiveFeed),
    updatedAt: factor?.updatedAt,
    marketTime: factor?.marketTime,
    marketAgeSec: factor?.marketAgeSec,
    feedSource: factor?.feedSource,
    isStale: factor?.isStale,
    feedAgeSec: factor?.feedAgeSec,
  };
}

function fmtMacroValue(level: number | null, label: string): string {
  if (level == null) return '—';
  if (label === 'Bitcoin') return `$${(level / 1000).toFixed(1)}K`;
  if (label === 'Gold') return `$${level.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (label === 'Oil') return `$${level.toFixed(1)}`;
  if (label === 'Russell 2K' || label === 'SOX') return level.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (label === 'US 10Y') return `${level.toFixed(2)}%`;
  if (label.includes('DXY') || label.includes('DOLLAR')) return level.toFixed(1);
  return level.toFixed(2);
}

/* ═══════════════════════════════════════════════════════════
   Heatmap color helpers
   ═══════════════════════════════════════════════════════════ */

function heatBg(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 0.2) return 'linear-gradient(145deg, rgba(30, 41, 59, 0.52), rgba(15, 23, 42, 0.66))'; // Neutral dark-gray for flat sectors
  
  // Premium dark heat scale: preserve direction without flooding the tile.
  const intensity = Math.min(abs / 4.0, 1.0);
  const coreAlpha = 0.18 + intensity * 0.34;
  const washAlpha = 0.08 + intensity * 0.18;
  
  return pct >= 0
    ? `linear-gradient(145deg, rgba(6, 95, 70, ${coreAlpha.toFixed(2)}), rgba(20, 184, 166, ${washAlpha.toFixed(2)}) 52%, rgba(15, 23, 42, 0.42))`
    : `linear-gradient(145deg, rgba(127, 29, 29, ${coreAlpha.toFixed(2)}), rgba(190, 18, 60, ${washAlpha.toFixed(2)}) 54%, rgba(15, 23, 42, 0.46))`;
}

function heatBorder(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 0.2) return 'rgba(148, 163, 184, 0.10)';
  
  const intensity = Math.min(abs / 4.0, 1.0);
  const alpha = 0.18 + intensity * 0.28;
  
  return pct >= 0
    ? `rgba(45, 212, 191, ${alpha.toFixed(2)})`
    : `rgba(251, 113, 133, ${alpha.toFixed(2)})`;
}

/* ═══════════════════════════════════════════════════════════
   F&G badge classifier
   ═══════════════════════════════════════════════════════════ */

function fgBadgeClass(value: number): string {
  if (value >= 75) return s.badgeGreed;
  if (value >= 55) return s.badgeGreed;
  if (value >= 45) return s.badgeNeutral;
  if (value >= 25) return s.badgeCaution;
  return s.badgeFear;
}

function fgBadgeLabel(value: number): string {
  if (value >= 75) return 'EXTREME GREED';
  if (value >= 55) return 'GREED';
  if (value >= 45) return 'NEUTRAL';
  if (value >= 25) return 'FEAR';
  return 'EXTREME FEAR';
}

function getTickerLogo(sym: string) {
  return <AppTickerLogo symbol={sym} size={16} style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 4 }} />;
}

function getSymBadge(sym: string) {
  switch (sym) {
    case 'DOW':
      return <span className={`${s.symbolBadge} ${s.dow}`}>DJI</span>;
    case 'NASDAQ':
      return <span className={`${s.symbolBadge} ${s.nasdaq}`}>NDX</span>;
    case 'S&P 500':
      return <span className={`${s.symbolBadge} ${s.sp500}`}>500</span>;
    case 'SPY':
      return <span className={`${s.symbolBadge} ${s.spy}`}>500</span>;
    case 'QQQ':
      return <span className={`${s.symbolBadge} ${s.qqq}`}>100</span>;
    case 'VIX':
      return <span className={`${s.symbolBadge} ${s.vix}`}>C</span>;
    case 'NASDAQ100 F':
      return <span className={`${s.symbolBadge} ${s.nasdaq}`}>FUT</span>;
    case 'Russell2k F':
      return <span className={`${s.symbolBadge} ${s.dow}`}>FUT</span>;
    case 'S&P500 F':
      return <span className={`${s.symbolBadge} ${s.sp500}`}>FUT</span>;
    default:
      return null;
  }
}

function getMacroBadge(label: string) {
  switch (label) {
    case 'US 10Y':
      return (
        <span className={`${s.macroBadgeIcon} ${s.us10yBadge}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeDasharray="3 3"/>
            <path d="M12 2v20M17 7l-5-5-5 5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      );
    case 'DXY':
      return (
        <span className={`${s.macroBadgeIcon} ${s.dxyBadge}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"></line>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
        </span>
      );
    case 'BTC':
      return (
        <span className={`${s.macroBadgeIcon} ${s.btcBadge}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4h10a4 4 0 0 1 0 8H6z" />
            <path d="M6 12h11a4 4 0 0 1 0 8H6z" />
            <line x1="9" y1="1" x2="9" y2="4" />
            <line x1="13" y1="1" x2="13" y2="4" />
            <line x1="9" y1="20" x2="9" y2="23" />
            <line x1="13" y1="20" x2="13" y2="23" />
          </svg>
        </span>
      );
    case 'GOLD':
      return (
        <span className={`${s.macroBadgeIcon} ${s.goldBadge}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 22h20M5 22h14L17 12H7L5 22Z" />
            <path d="M12 12V22" />
          </svg>
        </span>
      );
    case 'OIL':
      return (
        <span className={`${s.macroBadgeIcon} ${s.oilBadge}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2s-8 6-8 11a8 8 0 0 0 16 0c0-5-8-11-8-11Z" />
          </svg>
        </span>
      );
    case 'SOX':
      return (
        <span className={`${s.macroBadgeIcon} ${s.soxBadge}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <path d="M9 9h6v6H9z" />
            <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3" />
          </svg>
        </span>
      );
    case '2s10s':
      return (
        <span className={`${s.macroBadgeIcon} ${s.yieldBadge}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12c4-8 14-8 18 0M3 18c4-4 14-4 18 0" />
            <line x1="3" y1="6" x2="21" y2="6" strokeDasharray="2 2" />
          </svg>
        </span>
      );
    case 'F&G':
      return (
        <span className={`${s.macroBadgeIcon} ${s.fgBadge}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.24 12.24a8 8 0 0 0-16.48 0" />
            <line x1="12" y1="18" x2="12" y2="10" />
            <line x1="12" y1="18" x2="16" y2="14" />
          </svg>
        </span>
      );
    default:
      return null;
  }
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD PAGE
   ═══════════════════════════════════════════════════════════ */

interface TickerNewsItem {
  id: string;
  headline: string;
  summaryKR?: string;
  summaryEN?: string;
  summaryJP?: string;
  category: string;
  impact: string;
  urgency: number;
  source: string;
  ageMinutes: number;
}

export default function AppDashPage() {
  const locale = useLocale();
  const router = useRouter();
  const { status: marketStatusInfo, loading: marketStatusLoading } = useMarketStatus();
  const marketSession = marketStatusInfo?.session;
  const isMarketHoliday = Boolean(marketStatusInfo?.isHoliday);
  const marketStatusReady = !marketStatusLoading;
  const isLive = marketStatusReady && marketSession === 'regular' && !isMarketHoliday;
  const equityExtendedLive = marketStatusReady && !isMarketHoliday && (marketSession === 'pre' || marketSession === 'regular' || marketSession === 'post');
  const [loading, setLoading] = useState(true);
  const [indices, setIndices] = useState<PulseItem[]>(lastGoodIndices ?? DEMO_INDICES);
  const [futures, setFutures] = useState<PulseItem[]>(lastGoodFutures ?? DEMO_FUTURES);
  const [etfs, setEtfs] = useState<PulseItem[]>(lastGoodEtfs ?? DEMO_ETFS);
  // "Ready" = the FIRST real fetch has landed for that row. Until then we render a
  // skeleton, NEVER the DEMO placeholder numbers. Root fix for the cold-load bug where
  // the cash row showed fake 17,863/5,473 on first launch and only corrected after a
  // navigation round-trip (the module-cached lastGood* seeded the numbers on remount,
  // not on first mount). Seed ready=true only when we already hold real cached values.
  const [indicesReady, setIndicesReady] = useState<boolean>(!!lastGoodIndices);
  const [futuresReady, setFuturesReady] = useState<boolean>(!!lastGoodFutures);
  const [etfsReady, setEtfsReady] = useState<boolean>(!!lastGoodEtfs);
  const [macro, setMacro] = useState<MacroItem[]>(DEMO_MACRO);
  const [sectors, setSectors] = useState<SectorItem[]>(DEMO_SECTORS);
  const [movers, setMovers] = useState<MoverItem[]>([]);
  const [moverSort, setMoverSort] = useState<'value' | 'gainers' | 'losers'>('value');
  const [moversLoading, setMoversLoading] = useState(false);
  const [briefing, setBriefing] = useState<string>(DEMO_BRIEFING);
  // 다크풀은 이관으로 영구 상실했다 — 기관 «신규 옵션 포지션»으로 대체한다.
  const [instFlow, setInstFlow] = useState<{
    notional: number; callPct: number; side: 'call' | 'put';
    tickers: number; topTicker: string | null; topNotional: number; date: string | null;
    /** 「가장 큰 한 방」 — 집계 금액만으론 «무엇에 걸었나»를 모른다 */
    topContract?: { ticker: string; type: 'call' | 'put'; strike: number; expiry: string; contracts: number; notional: number } | null;
    /** 자기 이력 대비 백분위. 이력이 쌓이기 전엔 null — 「평소 대비」를 말하지 않는다 */
    percentile?: number | null;
    samples?: number;
  } | null>(null);
  const [gammaSqueeze, setGammaSqueeze] = useState<{ score: number; risk: string } | null>(null);
  /** 딜러 감마 — 「변동성 레짐」+「스퀴즈」를 합친 카드. 백분위로 보정된다. */
  const [dealerGamma, setDealerGamma] = useState<{
    gex: number; polarity: 'long' | 'short'; percentile: number | null;
    samples: number; flipDistancePct: number | null; unstable: boolean; date: string | null;
  } | null>(null);
  /** 시장 폭 — 지수 구성종목 중 20일선 위 비율 */
  const [breadth, setBreadth] = useState<{ ndx: number | null; dow: number | null; covered: number; universe: number } | null>(null);
  const [sectorRotation, setSectorRotation] = useState<{
    score: number; direction: string; conviction: string;
    /** 'percentile' 이면 score 는 최근 5거래일 창들 대비 백분위다 */
    basis?: string | null; windows?: number | null;
    into?: string | null; outOf?: string | null;
  } | null>(null);
  const [newsItems, setNewsItems] = useState<TickerNewsItem[]>([]);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [briefingMode, setBriefingMode] = useState<'briefing' | 'news'>('news');



  // ── WebSocket Real-Time Integration ──
  const wsSymbols = useMemo(() => {
    const defaultSymbols = [
      'XLK', 'XLE', 'XLY', 'XLB', 'XLI', 'XLF', 'XLV', 'XLU',
      'SPY', 'QQQ', 'DIA'
    ];
    const moverSymbols = movers.map(m => m.sym);
    return Array.from(new Set([...defaultSymbols, ...moverSymbols]));
  }, [movers]);

  const { prices: wsPrices, getPrice: wsGetPrice } = useRealtimeData(wsSymbols);
  const [flashStates, setFlashStates] = useState<Record<string, 'up' | 'down'>>({});
  const prevPricesRef = useRef<Record<string, number>>({});

  // Ask retained users for a rating (3rd/8th distinct day of use). No-op unless the
  // native review plugin is in the binary → completely inert in the current v1.0 shell.
  useEffect(() => { maybePromptReview(); }, []);

  useEffect(() => {
    wsSymbols.forEach(sym => {
      const update = wsPrices.get(sym);
      if (update) {
        const currentPrice = update.price;
        const prevPrice = prevPricesRef.current[sym];
        
        if (prevPrice !== undefined && prevPrice > 0 && currentPrice !== prevPrice) {
          const direction = currentPrice > prevPrice ? 'up' : 'down';
          setFlashStates(prev => ({ ...prev, [sym]: direction }));
          
          // Clear the flash class after 1.2s to match keyframes
          setTimeout(() => {
            setFlashStates(prev => {
              if (prev[sym] === direction) {
                const next = { ...prev };
                delete next[sym];
                return next;
              }
              return prev;
            });
          }, 1200);
        }
        prevPricesRef.current[sym] = currentPrice;
      }
    });
  }, [wsPrices, wsSymbols]);

  // Determine if a specific index/macro cell is currently "active" (trading hours)
  const checkIsItemActive = (symOrLabel: string): boolean => {
    const symbol = symOrLabel.toUpperCase();

    // 1. Crypto (BTC): always active (24/7/365)
    if (symbol === 'BTC') {
      return true;
    }

    // 2. Futures (NASDAQ100 F, Russell2k F, S&P500 F, GOLD, OIL)
    const CME_FUTURES_SYMBOLS = ['NASDAQ100 F', 'RUSSELL2K F', 'S&P500 F', 'GOLD', 'OIL'];
    if (CME_FUTURES_SYMBOLS.includes(symbol)) {
      const kind = symbol === 'GOLD' ? 'gold' : symbol === 'OIL' ? 'oil' : 'equity';
      return isCmeGlobexActive(kind, isMarketHoliday);
    }

    // 3. DXY: FX-style 24/5 session on ET with the daily 17:00-18:00 maintenance break.
    if (symbol === 'DXY') {
      return isDxySessionActive();
    }

    // 4. US 10Y (Bond Yields): Standard stock market hours (weekdays 9:30 AM - 4:00 PM ET)
    if (symbol === 'US 10Y' || symbol === 'TNX') {
      return isUs10YSessionActive(isMarketHoliday);
    }

    // 5. Fear & Greed (F&G) and Yield Curve spread (2s10s)
    if (symbol === 'F&G' || symbol === '2S10S') {
      return false;
    }

    // 6. Regular Equities/ETFs/Sectors (DOW, NASDAQ, S&P 500, SPY, QQQ, VIX, R2K)
    if (symbol === 'SPY' || symbol === 'QQQ') {
      return equityExtendedLive;
    }
    if (symbol === 'VIX') {
      return isVixSessionActive(isMarketHoliday);
    }

    const isRegularActive = marketSession === 'regular' && !isMarketHoliday;
    return isRegularActive;
  };

  const copy = {
    ko: {
      regime: '시장 상태',
      futures: '선물',
      cash: '현물',
      risk: '리스크',
      futuresLive: 'FUTURES LIVE',
      regularLive: 'LIVE',
      closed: 'CLOSED',
      holiday: 'HOLIDAY',
      futuresRow: '지수 선물',
      cashRow: '현물 지수',
      etfRow: 'ETF / 변동성',
      futuresOpen: '정규장 밖에도 선물 흐름은 ET 기준으로 추적됩니다.',
      regularOpen: '정규장 실시간 흐름을 반영합니다.',
      marketClosed: '장 마감 데이터와 선물 흐름을 함께 봅니다.',
      riskOn: 'Risk-On 우위',
      mixed: '혼조',
      riskOff: 'Risk-Off 경계',
      bullish: '상방',
      bearish: '하방',
      neutral: '중립',
    },
    en: {
      regime: 'Market State',
      futures: 'Futures',
      cash: 'Cash',
      risk: 'Risk',
      futuresLive: 'FUTURES LIVE',
      regularLive: 'LIVE',
      closed: 'CLOSED',
      holiday: 'HOLIDAY',
      futuresRow: 'Index Futures',
      cashRow: 'Cash Indices',
      etfRow: 'ETF / Volatility',
      futuresOpen: 'Futures tracked live on ET.',
      regularOpen: 'Regular-session flow is updating live.',
      marketClosed: 'Last close + live futures.',
      riskOn: 'Risk-On Tilt',
      mixed: 'Mixed Tape',
      riskOff: 'Risk-Off Watch',
      bullish: 'Bullish',
      bearish: 'Bearish',
      neutral: 'Neutral',
    },
    ja: {
      regime: '市場状態',
      futures: '先物',
      cash: '現物',
      risk: 'リスク',
      futuresLive: 'FUTURES LIVE',
      regularLive: 'LIVE',
      closed: 'CLOSED',
      holiday: 'HOLIDAY',
      futuresRow: '指数先物',
      cashRow: '現物指数',
      etfRow: 'ETF / 変動性',
      futuresOpen: '先物はET基準で追跡中。',
      regularOpen: '通常取引のリアルタイムフローを反映します。',
      marketClosed: '引け後データと先物フロー。',
      riskOn: 'Risk-On 優勢',
      mixed: 'まちまち',
      riskOff: 'Risk-Off 警戒',
      bullish: '上向き',
      bearish: '下向き',
      neutral: '中立',
    },
  }[locale as 'ko' | 'en' | 'ja'] || {
    regime: 'Market State',
    futures: 'Futures',
    cash: 'Cash',
    risk: 'Risk',
    futuresLive: 'FUTURES LIVE',
    regularLive: 'LIVE',
    closed: 'CLOSED',
    holiday: 'HOLIDAY',
    futuresRow: 'Index Futures',
    cashRow: 'Cash Indices',
    etfRow: 'ETF / Volatility',
    futuresOpen: 'Futures tracked live on ET.',
    regularOpen: 'Regular-session flow is updating live.',
    marketClosed: 'Last close + live futures.',
    riskOn: 'Risk-On Tilt',
    mixed: 'Mixed Tape',
    riskOff: 'Risk-Off Watch',
    bullish: 'Bullish',
    bearish: 'Bearish',
    neutral: 'Neutral',
  };

  const safeDashCopy: Record<string, Partial<typeof copy>> = {
    ko: {
      regime: '시장 상태',
      futures: '선물',
      cash: '현물',
      risk: '리스크',
      futuresRow: '지수 선물',
      cashRow: '현물 지수',
      etfRow: 'ETF / 변동성',
      futuresOpen: '정규장 밖에도 선물 흐름은 ET 기준으로 추적됩니다.',
      regularOpen: '정규장 실시간 흐름을 반영합니다.',
      marketClosed: '장마감 데이터와 활성 선물 흐름을 함께 봅니다.',
      riskOn: 'Risk-On 우위',
      mixed: '혼조',
      riskOff: 'Risk-Off 경계',
      bullish: '상방',
      bearish: '하방',
      neutral: '중립',
    },
    en: {
      regime: 'Market State',
      futures: 'Futures',
      cash: 'Cash',
      risk: 'Risk',
      futuresRow: 'Index Futures',
      cashRow: 'Cash Indices',
      etfRow: 'ETF / Volatility',
      futuresOpen: 'Futures tracked live on ET.',
      regularOpen: 'Regular-session flow is updating live.',
      marketClosed: 'Last close + live futures.',
      riskOn: 'Risk-On Tilt',
      mixed: 'Mixed Tape',
      riskOff: 'Risk-Off Watch',
      bullish: 'Bullish',
      bearish: 'Bearish',
      neutral: 'Neutral',
    },
    ja: {
      regime: '市場状態',
      futures: '先物',
      cash: '現物',
      risk: 'リスク',
      futuresRow: '指数先物',
      cashRow: '現物指数',
      etfRow: 'ETF / ボラティリティ',
      futuresOpen: '先物はET基準で追跡中。',
      regularOpen: '通常取引時間のフローをリアルタイムで反映します。',
      marketClosed: '引け後データと先物フロー。',
      riskOn: 'Risk-On 優勢',
      mixed: 'まちまち',
      riskOff: 'Risk-Off 警戒',
      bullish: '強気',
      bearish: '弱気',
      neutral: '中立',
    },
  };
  Object.assign(copy, safeDashCopy[locale] ?? safeDashCopy.en);

  const gateCopy = {
    ko: {
      title: '기관급 마켓 펄스',
      subtitle: '기관 신규 포지션 · 딜러 감마 · 섹터 순환 · 시장 폭 — 4개 신호를 1시간 동안 확인합니다.',
      teaserLabel: '무료 미리보기 · 기관급 펄스',
      previewChip: '무료 미리보기',
      cta: '광고 보고 1시간 해제',
      adFree: '또는 $9.99/월 광고 제거',
      social: '오늘 14.2K 잠금해제',
      teaserUnit: '4개 중 1개',
      signals: {
        instFlow: { label: '기관 신규 포지션', kicker: '어제 새로 깔린 옵션', insight: '장중엔 보이지 않는 미결제약정 증가분입니다.' },
        gamma: { label: '딜러 감마 구조', kicker: '변동성을 누르나 키우나', insight: '딜러가 헤지하는 방향이 시장의 진폭을 결정합니다.' },
        rotation: { label: '섹터 순환 강도', kicker: '자금 이동 방향', insight: '공격/방어 섹터로 자금이 이동하는 강도를 확인합니다.' },
        breadth: { label: '시장 폭', kicker: '넓게 오르나, 소수가 끄나', insight: '지수 구성종목 중 20일선 위 비율입니다.' },
      },
    },
    en: {
      title: 'Institutional Market Pulse',
      subtitle: 'Unlock 4 signals for 1 hour — institutional positioning, dealer gamma, sector rotation, market breadth.',
      teaserLabel: 'Free preview · Institutional pulse',
      previewChip: 'Free preview',
      cta: 'Watch ad to unlock 1HR',
      adFree: 'or $9.99/mo ad-free',
      social: '14.2K unlocked today',
      teaserUnit: '1 of 4',
      signals: {
        instFlow: { label: 'New Institutional Positioning', kicker: 'Options opened yesterday', insight: 'Open-interest additions — invisible during the session.' },
        gamma: { label: 'Dealer Gamma', kicker: 'Damping or amplifying', insight: 'How dealers must hedge sets the market amplitude.' },
        rotation: { label: 'Rotation Intensity', kicker: 'Capital rotation', insight: 'Shows whether money is rotating toward risk or defense.' },
        breadth: { label: 'Market Breadth', kicker: 'Broad rally or a few names', insight: 'Share of index members above their 20-day average.' },
      },
    },
    ja: {
      title: '機関級マーケットパルス',
      subtitle: '機関の新規ポジション・ディーラーガンマ・セクター循環・市場の広がり — 4つのシグナルを1時間確認できます。',
      teaserLabel: '無料プレビュー · 機関投資家パルス',
      previewChip: '無料プレビュー',
      cta: '広告視聴で1時間解除',
      adFree: 'または月$9.99で広告なし',
      social: '本日14.2K件解除',
      teaserUnit: '4つ中1つ',
      signals: {
        instFlow: { label: '機関の新規ポジション', kicker: '昨日建てられたオプション', insight: '場中には見えない建玉の増加分です。' },
        gamma: { label: 'ディーラー・ガンマ', kicker: '変動を抑えるか広げるか', insight: 'ディーラーのヘッジ方向が相場の振幅を決めます。' },
        rotation: { label: 'セクター循環強度', kicker: '資金移動', insight: '資金がリスク側か防御側へ回る強さを確認します。' },
        breadth: { label: '市場の広がり', kicker: '全体か、一部の銘柄か', insight: '指数構成銘柄のうち20日線より上の比率です。' },
      },
    },
  }[locale as 'ko' | 'en' | 'ja'] || {
    title: 'Institutional Market Pulse',
    subtitle: 'Unlock volatility regime, dark-pool flow, and sector rotation for 1 hour.',
    teaserLabel: 'Free preview · Institutional pulse',
    previewChip: 'Free preview',
    cta: 'Watch ad to unlock 1HR',
    adFree: 'or $9.99/mo ad-free',
    social: '14.2K unlocked today',
    teaserUnit: '1 of 4',
    signals: {
      instFlow: { label: 'New Institutional Positioning', kicker: 'Options opened yesterday', insight: 'Open-interest additions — invisible during the session.' },
      gamma: { label: 'Dealer Gamma', kicker: 'Damping or amplifying', insight: 'How dealers must hedge sets the market amplitude.' },
      rotation: { label: 'Rotation Intensity', kicker: 'Capital rotation', insight: 'Shows whether money is rotating toward risk or defense.' },
      breadth: { label: 'Market Breadth', kicker: 'Broad rally or a few names', insight: 'Share of index members above their 20-day average.' },
    },
  };

  const itemSessionLive = (symOrLabel: string) => checkIsItemActive(symOrLabel);
  const futuresLive = isCmeGlobexActive('equity', isMarketHoliday);
  const volatilityLive = itemSessionLive('VIX');
  const futuresAvg = avgChange(futures);
  const cashAvg = avgChange(indices);
  const vixEtf = etfs.find((p) => p.sym === 'VIX');
  // 값이 없으면 0 → riskScore 에 «기여하지 않는다»(가짜 상승/하락을 만들지 않음)
  const vixChange = vixEtf && !vixEtf.noData ? vixEtf.chg : 0;
  const fgValue = parseFloat(macro.find((m) => m.label === 'F&G')?.value || '50');
  const breadthPct = sectors.length
    ? Math.round((sectors.filter((sec) => sec.pct >= 0).length / sectors.length) * 100)
    : 50;
  const riskScore = clampPct(50 + futuresAvg * 7 + cashAvg * 4 + (breadthPct - 50) * 0.35 + (Number.isFinite(fgValue) ? (fgValue - 50) * 0.25 : 0) - Math.max(0, vixChange) * 2.5);
  const riskTone = riskScore >= 58 ? copy.riskOn : riskScore <= 42 ? copy.riskOff : copy.mixed;
  const futuresTone = futuresAvg > 0.15 ? copy.bullish : futuresAvg < -0.15 ? copy.bearish : copy.neutral;
  const cashTone = cashAvg > 0.15 ? copy.bullish : cashAvg < -0.15 ? copy.bearish : copy.neutral;
  // The market-state hero (선물/현물/리스크) is derived entirely from the index+futures
  // feeds, so it must not show numbers computed from DEMO seeds before those land.
  // Gate each cell on the feed it actually needs: a futures miss used to blank 현물 too,
  // even though the index feed had landed — one slow request took the whole strip down.
  // The headline and the risk score are composites of BOTH feeds, so they still wait for
  // both rather than publish a score computed off a demo half.
  const regimeReady = indicesReady && futuresReady;
  const pulseStatusLabel = isLive ? copy.regularLive : futuresLive ? copy.futuresLive : volatilityLive ? 'VIX LIVE' : copy.closed;
  const pulseStatusNote = isLive ? copy.regularOpen : futuresLive ? copy.futuresOpen : volatilityLive ? copy.futuresOpen : copy.marketClosed;
  const pulseStatusClass = isLive ? '' : (futuresLive || volatilityLive) ? s.futuresOpen : s.closed;
  const etfRowStatus = equityExtendedLive ? 'LIVE' : volatilityLive ? 'VIX LIVE' : isMarketHoliday ? copy.holiday : copy.closed;
  const etfRowLive = equityExtendedLive || volatilityLive;
  const sectorSessionLabel = isMarketHoliday
    ? copy.holiday
    : marketSession === 'pre'
      ? 'PRE'
      : marketSession === 'regular'
        ? 'REGULAR'
        : marketSession === 'post'
          ? 'POST'
          : copy.closed;
  const sectorSessionClass = isMarketHoliday
    ? s.sessionHoliday
    : equityExtendedLive
      ? s.sessionLive
      : s.sessionClosed;
  const canUseEquitySocket = (symbol: string) => {
    const s = symbol.toUpperCase();
    if (s === 'SPY' || s === 'QQQ') return equityExtendedLive;
    if (s === 'VIX') return itemSessionLive('VIX');
    return equityExtendedLive;
  };
  const shouldUseWsQuote = (
    symbol: string,
    wsData: { price?: number; changePct?: number | null } | null | undefined
  ): wsData is { price: number; changePct: number } => {
    return Boolean(
      canUseEquitySocket(symbol) &&
      wsData &&
      typeof wsData.price === 'number' &&
      wsData.price > 0 &&
      typeof wsData.changePct === 'number'
    );
  };
  const normalizeSignalToken = (value?: string | null) => String(value || '').replace(/_/g, ' ').trim().toUpperCase();
  const localizeRotation = (value?: string | null) => {
    const token = normalizeSignalToken(value);
    const map = {
      ko: { 'RISK ON': '상방 순환', RISK_ON: '상방 순환', 'RISK OFF': '방어 순환', RISK_OFF: '방어 순환', NEUTRAL: '중립 순환', DEFENSIVE: '방어 순환' },
      en: { 'RISK ON': 'Risk-On Tilt', RISK_ON: 'Risk-On Tilt', 'RISK OFF': 'Defensive Tilt', RISK_OFF: 'Defensive Tilt', NEUTRAL: 'Neutral Tilt', DEFENSIVE: 'Defensive Tilt' },
      ja: { 'RISK ON': 'リスクオン傾向', RISK_ON: 'リスクオン傾向', 'RISK OFF': '防御寄り', RISK_OFF: '防御寄り', NEUTRAL: '中立循環', DEFENSIVE: '防御寄り' },
    }[locale as 'ko' | 'en' | 'ja'];
    return map?.[token as keyof typeof map] || (value ? value.replace(/_/g, ' ') : 'Neutral Tilt');
  };
  const money = (v?: number | null) => {
    if (!v || !Number.isFinite(v)) return '—';
    if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    return `$${(v / 1e3).toFixed(0)}K`;
  };

  // ★ 폴백 상수(38 · 42.5 · 34 · 50)를 전부 걷어냈다.
  //   못 잰 값은 null 로 두고 카드가 «—» 로 말한다. 진행바도 0 이 아니라
  //   아예 안 그린다 — 0% 막대는 «측정된 0» 처럼 보인다.
  const rotationScore = sectorRotation?.score == null ? null : clampPct(sectorRotation.score);
  // 신규 포지션은 «콜 비중»을 게이지로 쓴다(0~100). 금액은 값으로 따로 보여 준다.
  const instScore = instFlow ? clampPct(instFlow.callPct) : null;

  // ── 오늘 값에 대한 «판독» ────────────────────────────────────────
  //   기존 insight 는 «이 지표가 무엇인가»를 설명하는 정적 문장이었다.
  //   프리미엄 카드는 «오늘 이 숫자가 무슨 뜻인가»를 말해야 한다.
  //   지표 설명은 그대로 두되(ⓘ 성격), 판독을 한 줄 얹는다.
  const L3 = (ko: string, en: string, ja: string) => (locale === 'ko' ? ko : locale === 'ja' ? ja : en);
  // ⚠️ 판독의 경계는 **라벨이 쓰는 경계와 같아야 한다.**
  //   예전엔 판독이 60/35 를, 라벨이 70/45/20 을 써서 같은 카드가
  //   「보통(MEDIUM)」이라고 쓰고 바로 아래에서 「쏠림이 적습니다」라고
  //   말했다(실화면 22점에서 확인). 라벨과 문장이 싸우면 둘 다 못 믿는다.
  //   레짐: ERUPTING≥75 · LOADED≥50 · COILING≥25 · CALM  (volatility-regime)
  //   위험: EXTREME≥70 · HIGH≥45 · MEDIUM≥20 · LOW      (structureService)
  const readRotation = (
    sc: number | null,
    dir?: string | null,
    into?: string | null,
    outOf?: string | null,
    basis?: string | null,
  ) => {
    if (sc == null) return null;
    const off = dir === 'RISK_ON' || dir === 'BULLISH';
    const where = into && outOf
      ? L3(` · ${outOf} → ${into}`, ` · ${outOf} → ${into}`, ` · ${outOf} → ${into}`)
      : into ? L3(` · ${into}로`, ` · into ${into}`, ` · ${into}へ`) : '';
    if (basis !== 'percentile') {
      // 보정 이력이 모자란 상태 — 강도를 «최근 대비»로 말할 수 없다.
      return (off
        ? L3('공격 섹터 우위', 'Offense-led tilt', '攻撃セクター優位')
        : L3('방어 섹터 우위', 'Defense-led tilt', '防御セクター優位')) + where;
    }
    if (sc >= 70) return (off
      ? L3('최근 중 강한 순환 — 공격 섹터로 이동', 'Strongest rotation in weeks — into offense', '直近で強い循環 — 攻撃セクターへ')
      : L3('최근 중 강한 순환 — 방어 섹터로 이동', 'Strongest rotation in weeks — into defense', '直近で強い循環 — 防御セクターへ')) + where;
    if (sc >= 30) return (off
      ? L3('평소 수준의 순환 · 공격 우위', 'Typical rotation · offense-led', '通常水準の循環 · 攻撃優位')
      : L3('평소 수준의 순환 · 방어 우위', 'Typical rotation · defense-led', '通常水準の循環 · 防御優位')) + where;
    return L3('최근 중 조용한 편 — 섹터 이동이 약합니다.', 'Quieter than usual — little sector movement.', '直近では静かな部類 — セクター移動は弱いです。');
  };
  /**
   * 기관 신규 포지션 판독.
   *   집계 금액만 보여 주면 «규모»만 알 수 있다. 프리미엄이라면 「무엇에
   *   걸었나」가 있어야 한다 — 가장 크게 늘어난 단일 계약을 붙인다.
   *   실측(8/28): NVDA 콜 $200 · 2027-01 만기 · +188,333계약 = $3.77B
   */
  const readInst = (f: typeof instFlow) => {
    if (!f) return null;
    const heavy = f.callPct >= 50 ? f.callPct : Math.round((100 - f.callPct) * 10) / 10;
    const tc = f.topContract;
    const expShort = tc?.expiry ? tc.expiry.slice(0, 7) : '';
    const best = tc
      ? L3(
          ` · 최대 ${tc.ticker} ${tc.type === 'call' ? '콜' : '풋'} $${tc.strike} (${expShort}) ${money(tc.notional)}`,
          ` · biggest: ${tc.ticker} ${tc.type} $${tc.strike} (${expShort}) ${money(tc.notional)}`,
          ` · 最大 ${tc.ticker} ${tc.type === 'call' ? 'コール' : 'プット'} $${tc.strike}（${expShort}）${money(tc.notional)}`,
        )
      : (f.topTicker ? L3(` · 최대 ${f.topTicker}`, ` · led by ${f.topTicker}`, ` · 最大 ${f.topTicker}`) : '');
    // 이력이 쌓인 뒤에만 «평소 대비»를 말한다
    const vs = typeof f.percentile === 'number'
      ? (f.percentile >= 80 ? L3(' · 평소보다 많음', ' · heavier than usual', ' · 平常より多い')
        : f.percentile <= 20 ? L3(' · 평소보다 적음', ' · lighter than usual', ' · 平常より少ない') : '')
      : '';
    return L3(
      `${f.tickers}종목에 ${money(f.notional)} 신규 진입 · ${f.callPct >= 50 ? '콜' : '풋'} ${heavy}% 우위${vs}${best}`,
      `${money(f.notional)} opened across ${f.tickers} names · ${f.callPct >= 50 ? 'call' : 'put'}-heavy ${heavy}%${vs}${best}`,
      `${f.tickers}銘柄に${money(f.notional)}の新規 · ${f.callPct >= 50 ? 'コール' : 'プット'}優勢${heavy}%${vs}${best}`,
    );
  };

  /**
   * 딜러 감마 판독. 「변동성 레짐」+「스퀴즈」를 대체한다.
   *   롱감마면 딜러가 변동성을 «누르고», 숏감마면 «증폭»한다.
   *   플립 근처의 숏감마가 예전 「스퀴즈 위험」이 말하려던 상태다.
   */
  const readGamma = (g: typeof dealerGamma) => {
    if (!g) return null;
    const flip = g.flipDistancePct == null ? ''
      : L3(` · 감마플립까지 ${Math.abs(g.flipDistancePct).toFixed(1)}%`,
           ` · ${Math.abs(g.flipDistancePct).toFixed(1)}% from gamma flip`,
           ` · ガンマフリップまで${Math.abs(g.flipDistancePct).toFixed(1)}%`);
    if (g.unstable) {
      return L3('숏감마 + 플립 근처 — 작은 충격이 크게 증폭됩니다.',
                'Short gamma near the flip — small shocks get amplified.',
                'ショートガンマかつフリップ付近 — 小さな衝撃が増幅されます。') + flip;
    }
    if (g.polarity === 'short') {
      return L3('딜러가 숏감마 — 움직임을 «따라가며» 증폭합니다.',
                'Dealers are short gamma — they chase and amplify moves.',
                'ディーラーはショートガンマ — 動きを追って増幅します。') + flip;
    }
    const strong = typeof g.percentile === 'number' && g.percentile >= 80;
    return (strong
      ? L3('최근 중 가장 강한 롱감마 — 변동성이 강하게 눌립니다.',
           'Strongest long gamma in weeks — volatility is firmly damped.',
           '直近で最も強いロングガンマ — 変動が強く抑えられます。')
      : L3('딜러가 롱감마 — 헤지가 변동성을 누릅니다.',
           'Dealers are long gamma — hedging damps volatility.',
           'ディーラーはロングガンマ — ヘッジが変動を抑えます。')) + flip;
  };

  /**
   * 시장 폭 판독. 지수가 «넓게» 오르는가, 소수가 끌고 가는가.
   *   지수만 보면 알 수 없는 것이고, 우리는 12,222종목 20일 종가를 갖고 있다.
   */
  const readBreadth = (b: typeof breadth) => {
    if (!b || (b.ndx == null && b.dow == null)) return null;
    const vals = [b.ndx, b.dow].filter((v): v is number => typeof v === 'number');
    const avg = vals.reduce((a, c) => a + c, 0) / vals.length;
    const parts = [
      b.ndx != null ? `NDX ${b.ndx.toFixed(0)}%` : null,
      b.dow != null ? `DOW ${b.dow.toFixed(0)}%` : null,
    ].filter(Boolean).join(' · ');
    if (avg >= 65) return L3(`상승이 넓습니다 — 대부분 종목이 20일선 위 (${parts})`,
                             `Broad advance — most members above their 20-day (${parts})`,
                             `上昇の裾野が広い — 大半が20日線の上（${parts}）`);
    if (avg <= 35) return L3(`소수가 끌고 갑니다 — 대부분 종목이 20일선 아래 (${parts})`,
                             `Narrow tape — most members below their 20-day (${parts})`,
                             `一部の銘柄が牽引 — 大半が20日線の下（${parts}）`);
    return L3(`절반 정도가 20일선 위입니다 (${parts})`,
              `About half are above their 20-day (${parts})`,
              `およそ半数が20日線の上です（${parts}）`);
  };
  const NO_DATA = L3('데이터 없음', 'No data', 'データなし');
  // ══════════════════════════════════════════════════════════════════
  //  4개 카드 = 서로 다른 «4개의 렌즈»
  //
  //  ⚠️ 예전 구성은 「변동성 레짐」과 「감마 스퀴즈」가 **같은 것을 두 번**
  //     보여 주고 있었다 — regimeScore 계산식이 `squeezeScore / 4` 를 직접
  //     더한다. 4칸 중 2칸이 중복이었고, 그래서 실제로 보는 정보는 3개였다.
  //
  //  ① 포지션  기관이 «무엇을» 새로 깔았나        (옵션 미결제약정 증가분)
  //  ② 구조    딜러가 변동성을 누르나 키우나       (GEX 백분위 + 플립 거리)
  //  ③ 순환    자금이 «어디로» 갔나               (섹터 백분위 + into/outOf)
  //  ④ 폭      넓게 오르나, 소수가 끄나           (지수 구성종목 20일선 위)
  //
  //  네 카드 모두 «오늘 값»이 아니라 «평소 대비»를 말하려고 한다.
  //  숫자에 기준이 붙어야 인사이트가 된다.
  // ══════════════════════════════════════════════════════════════════
  const gammaScore = dealerGamma?.percentile ?? null;
  const breadthScore = (() => {
    if (!breadth) return null;
    const vals = [breadth.ndx, breadth.dow].filter((v): v is number => typeof v === 'number');
    return vals.length ? clampPct(vals.reduce((a, c) => a + c, 0) / vals.length) : null;
  })();

  const institutionalSignals = [
    {
      key: 'inst',
      tone: 'green',
      label: gateCopy.signals.instFlow.label,
      kicker: gateCopy.signals.instFlow.kicker,
      value: instFlow ? money(instFlow.notional) : '—',
      sub: instFlow ? `${instFlow.callPct >= 50 ? 'CALL' : 'PUT'} ${instFlow.callPct >= 50 ? instFlow.callPct : Math.round((100 - instFlow.callPct) * 10) / 10}%` : '—',
      insight: readInst(instFlow) ?? gateCopy.signals.instFlow.insight,
      score: instScore,
    },
    {
      key: 'gamma',
      tone: 'cyan',
      label: gateCopy.signals.gamma.label,
      kicker: gateCopy.signals.gamma.kicker,
      value: dealerGamma
        ? (dealerGamma.polarity === 'long'
            ? L3('롱감마', 'Long gamma', 'ロングガンマ')
            : L3('숏감마', 'Short gamma', 'ショートガンマ'))
        : '—',
      sub: gammaScore == null ? '—'
        : L3(`백분위 ${gammaScore}`, `${gammaScore}th pct`, `パーセンタイル${gammaScore}`),
      insight: readGamma(dealerGamma) ?? NO_DATA,
      score: gammaScore,
    },
    {
      key: 'rotation',
      tone: 'amber',
      label: gateCopy.signals.rotation.label,
      kicker: gateCopy.signals.rotation.kicker,
      value: sectorRotation?.direction ? localizeRotation(sectorRotation.direction) : '—',
      sub: rotationScore == null ? '—'
        : sectorRotation?.basis === 'percentile'
          ? L3(`백분위 ${rotationScore.toFixed(0)}`, `${rotationScore.toFixed(0)}th pct`, `パーセンタイル${rotationScore.toFixed(0)}`)
          : `Rotation ${rotationScore.toFixed(0)}`,
      insight: readRotation(rotationScore, sectorRotation?.direction, sectorRotation?.into, sectorRotation?.outOf, sectorRotation?.basis) ?? NO_DATA,
      score: rotationScore,
    },
    {
      key: 'breadth',
      tone: 'pink',
      label: gateCopy.signals.breadth.label,
      kicker: gateCopy.signals.breadth.kicker,
      value: breadthScore == null ? '—' : `${breadthScore.toFixed(0)}%`,
      sub: breadth ? `NDX ${breadth.ndx == null ? '—' : breadth.ndx.toFixed(0)} · DOW ${breadth.dow == null ? '—' : breadth.dow.toFixed(0)}` : '—',
      insight: readBreadth(breadth) ?? NO_DATA,
      score: breadthScore,
    },
  ];
  const signalToneClass = {
    cyan: s.instToneCyan,
    green: s.instToneGreen,
    pink: s.instTonePink,
    amber: s.instToneAmber,
  };

  /* ── Load dynamic movers ── */
  useEffect(() => {
    let active = true;
    async function loadMovers(isSilent = false) {
      if (!isSilent) {
        setMoversLoading(true);
      }
      try {
        const res = await fetch(`/api/market/movers?type=${moverSort}&limit=4`);
        if (!res.ok) throw new Error('Failed to fetch movers');
        const data = await res.json();
        if (active && data.movers) {
          const mapped: MoverItem[] = data.movers.map((t: any) => {
            // ⚠️ 등락률을 못 받으면 «+0.00%» 가 아니라 «—» 다.
            //    0.00% 는 「보합」이라는 주장이고, 그게 전 종목에 퍼지면
            //    「전 종목 보합」이라는 그 유명한 지문이 된다.
            const raw = t.changePercent;
            const has = typeof raw === 'number' && Number.isFinite(raw);
            const pctVal = has ? raw : 0;
            const sign = pctVal >= 0 ? '+' : '';
            return {
              sym: t.ticker,
              px: typeof t.price === 'number' && t.price > 0 ? t.price.toFixed(2) : '—',
              chg: has ? `${sign}${pctVal.toFixed(2)}%` : '—',
              up: pctVal >= 0,
              spark: t.spark || [5, 6, 7, 8, 9]
            };
          });
          if (mapped.length > 0) {
            setMovers(prev => mapped.map(item => {
              const currentPct = parsePctText(item.chg) ?? 0;
              if (equityExtendedLive || Math.abs(currentPct) >= 0.0001) {
                return item;
              }
              const previous = prev.find(p => p.sym === item.sym);
              const previousPct = previous ? parsePctText(previous.chg) : null;
              if (previous && previousPct != null && Math.abs(previousPct) >= 0.0001) {
                const sign = previousPct >= 0 ? '+' : '';
                return {
                  ...item,
                  px: item.px !== '0.00' ? item.px : previous.px,
                  up: previousPct >= 0,
                  chg: `${sign}${previousPct.toFixed(2)}%`,
                  spark: previous.spark,
                };
              }
              return item;
            }));
          }
        }
      } catch (err) {
        console.error('Error loading movers:', err);
      } finally {
        if (active && !isSilent) setMoversLoading(false);
      }
    }
    loadMovers(false);

    // Poll every 10 seconds for real-time movers updates from cache silently
    const interval = setInterval(() => loadMovers(true), 10000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [moverSort, equityExtendedLive]);

  /* ── Fetch live data from APIs ── */
  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      try {
        const [, macroRes, briefingRes, quotesRes, premiumRes, indexRes, newsRes] = await Promise.allSettled([
          fetch('/api/live/market'),
          fetch('/api/market/macro'),
          fetch(`/api/guardian/briefing?locale=${locale}`),
          fetch('/api/live/quotes?symbols=XLK,XLE,XLY,XLB,XLI,XLF,XLV,XLU,SPY,QQQ', { cache: 'no-store' }),
          fetch(`/api/live/premium-metrics?locale=${locale}`),
          fetch('/api/market/index-close', { cache: 'no-store' }),
          fetch(`/api/guardian/news-digest?locale=${locale}`),
        ]);

        if (cancelled) return;

        let macroSnap: any = null;
        let f: any = null;

        // ── Read Macro Snapshot SSOT ──
        if (macroRes && macroRes.status === 'fulfilled' && macroRes.value.ok) {
          try {
            macroSnap = await macroRes.value.json();
            f = macroSnap?.factors || null;
          } catch {
            // silent fail
          }
        }

        // ── DOW, NASDAQ, S&P 500 Indices ──
        let indicesApplied = false;
        if (indexRes && indexRes.status === 'fulfilled' && indexRes.value.ok) {
          try {
            const idx = await indexRes.value.json();
            const items = buildIndexItems(idx);
            // Always show the freshest Redis values (the latest close after hours),
            // as long as every price is valid (> 0). The previous logic fell back to
            // the prior state's value when not live + ~0 change — which on a remount
            // (prev = DEMO) bled the demo placeholder back in. We instead keep the
            // last good values cached at module scope, so a stale/partial fetch never
            // shows demo data; it just keeps the last real values.
            if (items.length >= 2 && items.every(it => it.px > 0)) {
              lastGoodIndices = items;
              setIndices(items);
              setIndicesReady(true);
              indicesApplied = true;
            }
          } catch {
            // fallback
          }
        }
        // [DEMO-BLEED FIX] If the first index-close fetch missed on a cold load
        // (seen live: cash row rendered the DEMO placeholder 5,473/39,127), retry
        // once — otherwise fake demo numbers stay on screen until the next cycle.
        if (!indicesApplied && !lastGoodIndices) {
          setTimeout(async () => {
            try {
              const r = await fetch('/api/market/index-close', { cache: 'no-store' });
              if (!r.ok) return;
              const items = buildIndexItems(await r.json());
              if (items.length >= 2 && items.every(it => it.px > 0)) {
                lastGoodIndices = items;
                setIndices(items);
                setIndicesReady(true);
              }
            } catch { /* keep current screen state */ }
          }, 2500);
        }

        // Futures readiness rides on ONE request (/api/market/macro) and, unlike the
        // indices row above, never had a cold-load retry — so a single miss left
        // futuresReady false with no second chance. Extracted here so the retry added
        // after this block can rebuild from a fresh response without duplicating the
        // mapping.
        const buildFuturesItems = (fac: any): PulseItem[] => {
          const globexLive = isCmeGlobexActive('equity', isMarketHoliday);
          const out: PulseItem[] = [];
          if (fac?.nasdaq100) {
            out.push({
              sym: 'NASDAQ100 F',
              px: fac.nasdaq100.level ?? 19850.50,
              chg: fac.nasdaq100.chgPct ?? 0.45,
              up: (fac.nasdaq100.chgPct ?? 0) >= 0,
              spark: DEMO_FUTURES[0].spark,
              ...feedMetaForItem(fac.nasdaq100, globexLive, { requireFresh: false }),
            });
          }
          if (fac?.spx) {
            out.push({
              sym: 'S&P500 F',
              px: fac.spx.level ?? 5490.25,
              chg: fac.spx.chgPct ?? 0.30,
              up: (fac.spx.chgPct ?? 0) >= 0,
              spark: DEMO_FUTURES[1].spark,
              ...feedMetaForItem(fac.spx, globexLive, { requireFresh: false }),
            });
          }
          if (fac?.rut) {
            out.push({
              sym: 'Russell2k F',
              px: fac.rut.level ?? 2120.40,
              chg: fac.rut.chgPct ?? 0.15,
              up: (fac.rut.chgPct ?? 0) >= 0,
              spark: DEMO_FUTURES[2].spark,
              ...feedMetaForItem(fac.rut, globexLive, { requireFresh: false }),
            });
          }
          return out;
        };

        // ── Build Macro Board from real data ──
        let futuresApplied = false;
        if (f) {
          try {
            // Populate Futures Row
            const futItems = buildFuturesItems(f);
            if (futItems.length >= 2) {
              lastGoodFutures = futItems;
              setFutures(futItems);
              setFuturesReady(true);
              futuresApplied = true;
            }

            const macroItems: MacroItem[] = [];

            // BTC
            macroItems.push({
              label: 'BTC',
              value: fmtMacroValue(f.btc?.level, 'Bitcoin'),
              chg: f.btc?.chgPct ?? 0,
              unit: '%',
              ...feedMetaForItem(f.btc, true, { requireFresh: false }),
              live: true, // BTC 24/7
            });

            // GOLD
            macroItems.push({
              label: 'GOLD',
              value: fmtMacroValue(f.gold?.level, 'Gold'),
              chg: f.gold?.chgPct ?? 0,
              unit: '%',
              ...feedMetaForItem(f.gold, isCmeGlobexActive('gold', isMarketHoliday), { requireFresh: false }),
              live: isCmeGlobexActive('gold', isMarketHoliday),
            });

            // OIL
            macroItems.push({
              label: 'OIL',
              value: fmtMacroValue(f.oil?.level, 'Oil'),
              chg: f.oil?.chgPct ?? 0,
              unit: '%',
              ...feedMetaForItem(f.oil, isCmeGlobexActive('oil', isMarketHoliday), { requireFresh: false }),
              live: isCmeGlobexActive('oil', isMarketHoliday),
            });

            // SOX
            macroItems.push({
              label: 'SOX',
              value: fmtMacroValue(f.sox?.level, 'SOX'),
              chg: f.sox?.chgPct ?? 0,
              unit: '%',
              ...feedMetaForItem(f.sox, isLive),
              live: isLive,
            });

            // US 10Y
            macroItems.push({
              label: 'US 10Y',
              value: fmtMacroValue(f.us10y?.level, 'US 10Y'),
              chg: f.us10y?.chgPct ?? 0,
              unit: '',
              ...feedMetaForItem(f.us10y, isUs10YSessionActive(isMarketHoliday), { requireFresh: false }),
              live: isUs10YSessionActive(isMarketHoliday),
            });

            // DXY
            macroItems.push({
              label: 'DXY',
              value: fmtMacroValue(f.dxy?.level, 'DOLLAR (DXY)'),
              chg: f.dxy?.chgPct ?? 0,
              unit: '',
              ...feedMetaForItem(f.dxy, isDxySessionActive(), { requireFresh: false }),
              live: isDxySessionActive(),
            });

            // Yield Curve 2s10s
            if (macroSnap.yieldCurve) {
              const spread = macroSnap.yieldCurve.spread2s10s;
              macroItems.push({
                label: '2s10s',
                value: (spread >= 0 ? '+' : '') + spread.toFixed(2),
                chg: 0,
                unit: '',
                badge: macroSnap.yieldCurve.trend === 'INVERTED' ? 'INVERT' : macroSnap.yieldCurve.trend === 'STEEPENING' ? 'STEEP' : macroSnap.yieldCurve.trend === 'FLATTENING' ? 'FLAT' : 'NORMAL',
                live: isUs10YSessionActive(isMarketHoliday),
              });
            } else {
              macroItems.push(DEMO_MACRO[6]);
            }

            // Fear & Greed — Real CNN data from server
            if (macroSnap?.fearGreed) {
              const fgScore = macroSnap.fearGreed.score;
              macroItems.push({
                label: 'F&G',
                value: fgScore.toFixed(1),
                chg: 0,
                unit: '',
                badge: fgBadgeLabel(fgScore),
                live: false,
              });
            } else if (typeof f.vix?.level === 'number' && Number.isFinite(f.vix.level)) {
              // CNN 값이 없을 때 VIX 로 F&G 를 «근사»한다.
              // ⚠️ 예전엔 VIX 마저 없으면 `?? 20` 으로 채웠다 — 그러면 없는 입력에서
              //    F&G 67 이라는 «그럴듯한 숫자»가 만들어져 화면에 나간다.
              //    VIX 가 없으면 근사 자체를 하지 않는다(이 항목을 안 그린다).
              const vixVal = f.vix.level;
              const fg = Math.max(0, Math.min(100, Math.round(100 - (vixVal - 10) * 3.3)));
              macroItems.push({
                label: 'F&G',
                value: fg.toFixed(1),
                chg: 0,
                unit: '',
                badge: fgBadgeLabel(fg),
                live: false,
              });
            }

            setMacro(macroItems);
          } catch {
            // fallback stays
          }
        }

        // [COLD-START FIX] App launch fires seven requests at once while the WebView and
        // the connection are still warming, and /api/market/macro is the one that slips
        // most often. It had no retry, so a single miss left futuresReady false for the
        // whole session — and because the market-state strip gated on indicesReady AND
        // futuresReady, that blanked 선물/현물/리스크 to '—' even though the index feed
        // had landed fine. Leaving the tab and returning "fixed" it only because
        // lastGoodFutures lives at module scope and a later mount refetched successfully.
        // Retry on a short backoff instead of leaving it to chance.
        if (!futuresApplied && !lastGoodFutures) {
          [1200, 3500, 8000].forEach((delay) => {
            setTimeout(async () => {
              if (lastGoodFutures) return; // an earlier attempt (or the poll) already won
              try {
                const r = await fetch('/api/market/macro');
                if (!r.ok) return;
                const snap = await r.json();
                const items = buildFuturesItems(snap?.factors);
                if (items.length >= 2 && !lastGoodFutures) {
                  lastGoodFutures = items;
                  setFutures(items);
                  setFuturesReady(true);
                }
              } catch { /* keep current screen state */ }
            }, delay);
          });
        }

        // ── Sector Heatmap & Top Movers from quotesRes ──
        if (quotesRes.status === 'fulfilled' && quotesRes.value.ok) {
          const quotesData = await quotesRes.value.json();
          const q = quotesData.data || {};

          // 1. Sector Heatmap (mapped from XL* ETFs)
          setSectors(prev => {
            const fallback = (name: string, demo: number) => {
              const previous = prev.find(sec => sec.name === name)?.pct;
              return Number.isFinite(previous) && Math.abs(previous ?? 0) > 0.0001 ? previous! : demo;
            };
            return [
              { name: 'Tech', pct: stableChangePct(q.XLK, fallback('Tech', 2.1), false) },
              { name: 'Energy', pct: stableChangePct(q.XLE, fallback('Energy', 1.2), false) },
              { name: 'Cons. Disc', pct: stableChangePct(q.XLY, fallback('Cons. Disc', 0.9), false) },
              { name: 'Materials', pct: stableChangePct(q.XLB, fallback('Materials', 0.6), false) },
              { name: 'Industrials', pct: stableChangePct(q.XLI, fallback('Industrials', 0.4), false) },
              { name: 'Finance', pct: stableChangePct(q.XLF, fallback('Finance', 0.3), false) },
              { name: 'Healthcare', pct: stableChangePct(q.XLV, fallback('Healthcare', -0.5), false) },
              { name: 'Utilities', pct: stableChangePct(q.XLU, fallback('Utilities', -0.8), false) },
            ];
          });

          // 2. Top Movers (Handled dynamically by separate effect hook based on active toggle tab)

          // 3. ETFs (SPY, QQQ, VIX)
          const spyQuote = q.SPY || {};
          const qqqQuote = q.QQQ || {};

          // ⚠️ 예전엔 `?? 21.5` / `?? -3.1` 이었다 — DEMO_ETFS 시드값 그대로다.
          //    VIX 피드가 비면 그 데모 숫자가 라이브 카드에 «실제 지수»처럼 찍혔다.
          //    이제는 직전 «실측» 값을 유지하고, 그것도 없으면 표시하지 않는다.
          const vixLive = typeof f?.vix?.level === 'number' && Number.isFinite(f.vix.level)
            ? { px: f.vix.level, chg: typeof f?.vix?.chgPct === 'number' && Number.isFinite(f.vix.chgPct) ? f.vix.chgPct : 0 }
            : null;

          setEtfs(prev => {
            const prevSpy = prev.find(item => item.sym === 'SPY');
            const prevQqq = prev.find(item => item.sym === 'QQQ');
            const spyChg = stableChangePct(spyQuote, prevSpy?.chg ?? DEMO_ETFS[0].chg, equityExtendedLive);
            const qqqChg = stableChangePct(qqqQuote, prevQqq?.chg ?? DEMO_ETFS[1].chg, equityExtendedLive);
            const next: PulseItem[] = [
              {
                sym: 'SPY',
                px: spyQuote.price || prevSpy?.px || DEMO_ETFS[0].px,
                chg: spyChg,
                up: spyChg >= 0,
                spark: DEMO_ETFS[0].spark,
                live: equityExtendedLive,
              },
              {
                sym: 'QQQ',
                px: qqqQuote.price || prevQqq?.px || DEMO_ETFS[1].px,
                chg: qqqChg,
                up: qqqChg >= 0,
                spark: DEMO_ETFS[1].spark,
                live: equityExtendedLive,
              },
              (() => {
                const prevVix = prev.find(item => item.sym === 'VIX');
                const kept = vixLive ?? (prevVix && !prevVix.noData ? { px: prevVix.px, chg: prevVix.chg } : null);
                return {
                  sym: 'VIX',
                  px: kept?.px ?? 0,
                  chg: kept?.chg ?? 0,
                  up: (kept?.chg ?? 0) >= 0,
                  noData: kept == null,
                  spark: DEMO_ETFS[2].spark,
                  ...feedMetaForItem(f?.vix, isVixSessionActive(isMarketHoliday), { requireFresh: false }),
                };
              })()
            ];
            lastGoodEtfs = next;
            return next;
          });
          // Only mark ready when SPY/QQQ carry real quote prices (VIX always has a
          // factor value); otherwise keep the skeleton rather than flashing a fallback.
          if ((spyQuote.price ?? 0) > 0 && (qqqQuote.price ?? 0) > 0) setEtfsReady(true);
        }

        // ── Briefing ──
        if (briefingRes.status === 'fulfilled' && briefingRes.value.ok) {
          const bData = await briefingRes.value.json();
          if (bData.success && bData.briefing) {
            // Convert markdown bold (**text**) to HTML <strong>
            const html = bData.briefing
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .split('\n')[0]; // first paragraph only for card
            if (html.length > 20) {
              // Extract only first 2 sentences for cleaner mobile display
              const sentences = html.split('. ');
              const summaryText = sentences.slice(0, 2).join('. ') + (sentences.length > 2 ? '.' : '');
              setBriefing(summaryText);
            }
          }
        }

        // ── Premium Metrics (Volatility Regime, Dark Pool, Squeeze Risk, Sector Rotation) ──
        if (premiumRes.status === 'fulfilled' && premiumRes.value.ok) {
          try {
            const pData = await premiumRes.value.json();
            if (pData.success) {
              // ⚠️ 못 잰 값을 상수로 채우지 않는다. null 은 null 로 흘려보내고
              //    카드가 «—» 로 말하게 한다. 이 카드들은 보상형 광고 뒤에 있다 —
              //    광고를 보고 나서 보는 값이 폴백 상수면 사용자를 속이는 것이다.
              setInstFlow(pData.institutionalFlow ?? null);
              setGammaSqueeze(pData.gammaSqueeze?.score == null ? null
                : { score: pData.gammaSqueeze.score, risk: pData.gammaSqueeze.risk });
              setDealerGamma(pData.dealerGamma ?? null);
              setBreadth(pData.breadth ?? null);
              setSectorRotation(pData.sectorRotation?.score == null ? null
                : {
                  score: pData.sectorRotation.score,
                  direction: pData.sectorRotation.direction,
                  conviction: pData.sectorRotation.conviction,
                  basis: pData.sectorRotation.basis ?? null,
                  windows: pData.sectorRotation.windows ?? null,
                  into: pData.sectorRotation.into ?? null,
                  outOf: pData.sectorRotation.outOf ?? null,
                });
            }
          } catch (e) {
            console.error('[Premium Metrics Parsing Error]', e);
          }
        }

        // ── News Digest (Terminal Ticker) ──
        if (newsRes && newsRes.status === 'fulfilled' && newsRes.value.ok) {
          try {
            const newsData = await newsRes.value.json();
            if (newsData && Array.isArray(newsData.items)) {
              setNewsItems(newsData.items);
            }
          } catch {
            // silent fail
          }
        }
      } catch {
        // silently fall back to demo data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();

    // Poll every 30 seconds for live data updates
    const intervalId = setInterval(fetchAll, 30000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [locale, equityExtendedLive, isLive, isMarketHoliday]);

  // Ticker auto-rotation: every 5 seconds
  useEffect(() => {
    if (newsItems.length <= 1) return;
    const timer = setInterval(() => {
      setTickerIndex(prev => (prev + 1) % newsItems.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [newsItems.length]);

  /* ── Render ── */
  return (
    <div className={s.page}>
      {/* ══════════════ HEADER ══════════════ */}
      <header className="app-header">
        <div className={s.headerBrand}>
          <img 
            src="/signum-sg-vectorized.svg"
            alt="SIGNUM HQ"
            width="30"
            height="30"
            style={{ 
              filter: 'drop-shadow(0 0 6px rgba(34, 211, 238, 0.35))',
              flexShrink: 0
            }} 
          />
          <div className={s.brandText}>
            <span className={s.brandName}>
              SIGNUM<span style={{ color: 'var(--cyan)' }}>HQ</span>
            </span>
            {/* 2026-08-31 다크풀이 FINRA 규제 원본으로 복원돼 다시 사실이 됐다 */}
            <span className={s.brandSub}>DARK POOL INTEL</span>
          </div>
        </div>
        <div className={s.headerActions}>
          <button className={s.headerBtn} aria-label="Settings" onClick={() => router.push(`/${locale}/app-view/settings`)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </div>
      </header>

      {/* ══════════════ LIVE TERMINAL TICKER ══════════════ */}
      {newsItems.length > 0 && (
        <div className={s.tickerBar} onClick={() => router.push('/app-view/guardian?tab=reality')}>
          <div className={s.tickerContainer}>
            {newsItems.map((item, idx) => {
              if (idx !== tickerIndex) return null;

              const isBreaking = item.urgency >= 8;
              let badgeColor = s.badgeSignal;
              let badgeText = locale === 'ko' ? '시그널' : 'SIGNAL';

              if (item.category === 'MACRO' || item.category === 'US_MARKET' || item.category === 'GLOBAL') {
                badgeColor = s.badgeEcon;
                badgeText = locale === 'ko' ? '지표' : 'ECON';
              }
              if (isBreaking) {
                badgeColor = s.badgeBreaking;
                badgeText = locale === 'ko' ? '속보' : 'BREAKING';
              }

              let displayHeadline = item.headline;
              if (locale === 'ko' && item.summaryKR) {
                displayHeadline = item.summaryKR;
              } else if (locale === 'ja' && item.summaryJP) {
                displayHeadline = item.summaryJP;
              } else if (item.summaryEN) {
                displayHeadline = item.summaryEN;
              }

              return (
                <div key={item.id} className={s.tickerContent}>
                  <span className={`${s.tickerBadge} ${badgeColor}`}>{badgeText}</span>
                  <span className={s.tickerText}>{displayHeadline}</span>
                  <span className={s.tickerTime}>
                    {item.ageMinutes < 60
                      ? `${item.ageMinutes}m`
                      : `${Math.round(item.ageMinutes / 60)}h`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={s.regimeStrip}>
        <div className={s.regimePrimary}>
          <span className={s.regimeKicker}>{copy.regime}</span>
          <strong className={!regimeReady ? s.regimeNeutral : riskScore >= 58 ? s.regimePositive : riskScore <= 42 ? s.regimeNegative : s.regimeNeutral}>
            {regimeReady ? riskTone : '—'}
          </strong>
          <span className={s.regimeNote}>{pulseStatusNote}</span>
        </div>
        <div className={s.regimeMetrics}>
          <div className={`${s.regimeMetric} ${futuresAvg > 0.15 ? s.metricUp : futuresAvg < -0.15 ? s.metricDown : s.metricFlat}`}>
            <span>{copy.futures}</span>
            <b className={futuresAvg >= 0 ? s.pos : s.neg}>{futuresReady ? `${futuresTone} ${fmtChg(futuresAvg)}` : '—'}</b>
          </div>
          <div className={`${s.regimeMetric} ${cashAvg > 0.15 ? s.metricUp : cashAvg < -0.15 ? s.metricDown : s.metricFlat}`}>
            <span>{copy.cash}</span>
            <b className={cashAvg >= 0 ? s.pos : s.neg}>{indicesReady ? `${cashTone} ${fmtChg(cashAvg)}` : '—'}</b>
          </div>
          <div className={`${s.regimeMetric} ${s.regimeMetricCenter} ${riskScore >= 58 ? s.metricUp : riskScore <= 42 ? s.metricDown : s.metricFlat}`}>
            <span>{copy.risk}</span>
            <b>{regimeReady ? Math.round(riskScore) : '—'}</b>
          </div>
        </div>
      </div>

      {/* ══════════════ MARKET PULSE ══════════════ */}
      <div className={s.card}>
        <div className={s.pulseGlow} />
        <div className={s.cardHead}>
          <div className={s.pulseHeaderContainer}>
            <div className={s.pulseHeader}>
              <span className={s.pulseHeaderDecorator}>|</span>
              <span className={s.cardTitle}>Market Pulse</span>
            </div>
            <div className={`${s.pulseLiveBadge} ${pulseStatusClass}`}>
              <div className={`${s.pulseDot} ${pulseStatusClass}`} />
              <span style={{ fontSize: '10px', fontWeight: '900', color: isLive || futuresLive || volatilityLive ? 'var(--cyan)' : '#64748b', letterSpacing: '0.08em', lineHeight: 1 }}>
                {pulseStatusLabel}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* ── Futures Row (NASDAQ100 F, Russell2k F, S&P500 F) ── */}
            <div className={s.pulseRowMeta}>
              <span>{copy.futuresRow}</span>
              <em className={futuresLive ? s.metaLive : ''}>{futuresLive ? copy.futuresLive : copy.closed}</em>
            </div>
            <div className={s.pulseRow}>
              {!futuresReady ? [0, 1, 2].map((i) => <div key={`skf-${i}`} className={s.skelPulse} />) : futures.map((p) => (
                <div key={p.sym} suppressHydrationWarning className={`${s.pulseCard} ${itemSessionLive(p.sym) ? s.live : ''} ${p.up ? s.up : s.down}`}>
                  <div className={s.pulseCardSymRow}>
                    {getSymBadge(p.sym)}
                    <span className={s.pulseSym}>{p.sym}</span>
                  </div>
                  <span className={s.pulsePrice}>{fmtPrice(p.px)}</span>
                  <span className={`${s.pulseChg} ${p.up ? s.pos : s.neg}`} style={{ width: 'fit-content' }}>
                    {p.up ? '▲' : '▼'} {p.up ? '+' : ''}{p.chg.toFixed(2)}%
                  </span>
                  <div className={s.pulseSparkline}>
                    <Sparkline data={p.spark} up={p.up} />
                  </div>
                </div>
              ))}
            </div>

            {/* ── Indices Row (DOW, NASDAQ, S&P 500) ── */}
            <div className={s.pulseRowMeta}>
              <span>{copy.cashRow}</span>
              <em className={isLive ? s.metaLive : isMarketHoliday ? s.metaHoliday : ''}>{isLive ? copy.regularLive : isMarketHoliday ? copy.holiday : copy.closed}</em>
            </div>
            <div className={s.pulseRow}>
              {!indicesReady ? [0, 1, 2].map((i) => <div key={`ski-${i}`} className={s.skelPulse} />) : sortPulse(indices, PULSE_INDEX_ORDER).map((p) => {
                // Cash index row is Redis/index-close based. ETF proxies must not overwrite index change.
                const displayChg = p.chg;
                const isUp = displayChg >= 0;
                
                // Flash animation class
                const flashClass = '';

                return (
                  <div key={p.sym} suppressHydrationWarning className={`${s.pulseCard} ${checkIsItemActive(p.sym) ? s.live : ''} ${isUp ? s.up : s.down} ${flashClass}`}>
                    <div className={s.pulseCardSymRow}>
                      {getSymBadge(p.sym)}
                      <span className={s.pulseSym}>{p.sym}</span>
                    </div>
                    <span className={s.pulsePrice}>{fmtPrice(p.px)}</span>
                    <span className={`${s.pulseChg} ${isUp ? s.pos : s.neg}`} style={{ width: 'fit-content' }}>
                      {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{displayChg.toFixed(2)}%
                    </span>
                    <div className={s.pulseSparkline}>
                      <Sparkline data={p.spark} up={isUp} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── ETFs Row (SPY, QQQ, VIX) ── */}
            <div className={s.pulseRowMeta}>
              <span>{copy.etfRow}</span>
              <em className={etfRowLive ? s.metaLive : ''}>{etfRowStatus}</em>
            </div>
            <div className={s.pulseRow}>
              {!etfsReady ? [0, 1, 2].map((i) => <div key={`ske-${i}`} className={s.skelPulse} />) : sortPulse(etfs, PULSE_ETF_ORDER).map((p) => {
                const wsData = wsGetPrice(p.sym);
                const useWs = shouldUseWsQuote(p.sym, wsData);
                
                // Overlay price & change if available
                const displayPx = useWs ? wsData.price : p.px;
                const displayChg = useWs ? wsData.changePct : p.chg;
                const isUp = displayChg >= 0;
                
                // Flash animation class
                const flashClass = useWs ? (flashStates[p.sym] === 'up' ? s.flashUp : flashStates[p.sym] === 'down' ? s.flashDown : '') : '';

                return (
                  <div key={p.sym} suppressHydrationWarning className={`${s.pulseCard} ${itemSessionLive(p.sym) ? s.live : ''} ${isUp ? s.up : s.down} ${flashClass}`}>
                    <div className={s.pulseCardSymRow}>
                      {getSymBadge(p.sym)}
                      <span className={s.pulseSym}>{p.sym}</span>
                    </div>
                    <span className={s.pulsePrice}>
                      {p.noData && !useWs ? '—' : p.sym === 'VIX' ? displayPx.toFixed(2) : `$${fmtPrice(displayPx)}`}
                    </span>
                    <span className={`${s.pulseChg} ${isUp ? s.pos : s.neg}`} style={{ width: 'fit-content' }}>
                      {p.noData && !useWs ? '—' : <>{isUp ? '▲' : '▼'} {isUp ? '+' : ''}{displayChg.toFixed(2)}%</>}
                    </span>
                    <div className={s.pulseSparkline}>
                      <Sparkline data={p.spark} up={isUp} />
                    </div>
                  </div>
                );
              })}
            </div>
        </div>
      </div>

      {/* ══════════════ MACRO BOARD ══════════════ */}
      <div className={s.card}>
        <div className={s.cardHead}>
          <div className={s.pulseHeader}>
            <span className={s.pulseHeaderDecorator}>|</span>
            <span className={s.cardTitle}>Macro Board</span>
          </div>
        </div>
        <div className={s.macroGrid}>
            {macro.map((m) => (
              <div key={m.label} suppressHydrationWarning className={`${s.macroCell} ${m.live ? s.live : ''}`}>
                <div className={s.macroLabelRow}>
                  {getMacroBadge(m.label)}
                  <span className={s.macroLabel}>{m.label}</span>
                </div>
                <span className={s.macroValue}>{m.value}</span>
                {m.badge ? (
                  m.label === 'F&G' ? (
                    <span className={fgBadgeClass(parseFloat(m.value) || 50)}>
                      {m.badge}
                    </span>
                  ) : (
                    <span className={s.badgeNeutral}>{m.badge}</span>
                  )
                ) : (
                  <span className={`${s.macroChg} ${m.chg > 0 ? s.pos : m.chg < 0 ? s.neg : s.flat}`}>
                    {m.chg > 0 ? '+' : ''}{m.chg !== 0 ? m.chg.toFixed(2) : '—'}{m.unit}
                  </span>
                )}
              </div>
            ))}
        </div>
      </div>

      {/* ══════════════ TOP MOVERS (Moved for better flow) ══════════════ */}
      <div className={s.sectionHead} style={{ marginTop: '20px', padding: '0 var(--s4)' }}>
        <div className={s.sectionLabel} style={{ display: 'flex', alignItems: 'center' }}>
          <div className={s.sectionBar} />
          <span className={s.sectionTitle}>TOP MOVERS</span>
          
          {/* Pill Toggle Switch */}
          <div className={s.moversToggle}>
            <button 
              className={`${s.moverToggleBtn} ${moverSort === 'value' ? s.moverToggleBtnActive : ''}`}
              onClick={() => setMoverSort('value')}
            >
              {locale === 'ko' ? '거래대금' : locale === 'ja' ? '代金' : 'Value'}
            </button>
            <button 
              className={`${s.moverToggleBtn} ${moverSort === 'gainers' ? s.moverToggleBtnActive : ''}`}
              onClick={() => setMoverSort('gainers')}
            >
              {locale === 'ko' ? '상승률' : locale === 'ja' ? '上昇' : 'Gainers'}
            </button>
            <button 
              className={`${s.moverToggleBtn} ${moverSort === 'losers' ? s.moverToggleBtnActive : ''}`}
              onClick={() => setMoverSort('losers')}
            >
              {locale === 'ko' ? '하락률' : locale === 'ja' ? '下落' : 'Losers'}
            </button>
          </div>
        </div>
        <span
          className={s.sectionAction}
          role="button"
          tabIndex={0}
          onClick={() => router.push('/app-view/movers')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push('/app-view/movers'); } }}
          style={{ cursor: 'pointer' }}
        >
          VIEW ALL &gt;
        </span>
      </div>
      {loading || moversLoading ? (
        <div className={s.skelMovers} style={{ padding: '0 var(--s4)' }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={s.skelMoverCard} />
          ))}
        </div>
      ) : (
        <div className={s.moversScroll} style={{ padding: '0 var(--s4)' }}>
          {movers.map((mv) => {
            const wsData = wsGetPrice(mv.sym);
            const useWs = shouldUseWsQuote(mv.sym, wsData);

            // Overlay price & change if available
            const displayPx = useWs ? wsData.price.toFixed(2) : mv.px;
            const displayChg = useWs
              ? `${wsData.changePct >= 0 ? '+' : ''}${wsData.changePct.toFixed(2)}%`
              : mv.chg;
            const isUp = displayChg.startsWith('+');

            // Flash animation class
            const flashClass = useWs ? (flashStates[mv.sym] === 'up' ? s.flashUp : flashStates[mv.sym] === 'down' ? s.flashDown : '') : '';

            return (
              <div
                key={mv.sym}
                className={`${s.moverCard} ${flashClass}`}
                onClick={() => router.push(`/app-view/cmd?t=${mv.sym}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    router.push(`/app-view/cmd?t=${mv.sym}`);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`${mv.sym} command`}
              >
                <div className={s.moverTop}>
                  <span className={s.moverSym}>{getSymBadge(mv.sym) || getTickerLogo(mv.sym)} {mv.sym}</span>
                  <span className={isUp ? s.moverChgUp : s.moverChgDown}>
                    {displayChg}
                  </span>
                </div>
                <span className={s.moverPrice}>${displayPx}</span>
                <div className={s.moverSpark}>
                  <Sparkline data={mv.spark} up={isUp} height={28} fill />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════ SECTOR HEATMAP ══════════════ */}
      <div className={s.card}>
        <div className={s.cardHead}>
          <span className={s.cardTitle}>SECTOR HEATMAP</span>
          <span suppressHydrationWarning className={`${s.sessionPill} ${sectorSessionClass}`}>{sectorSessionLabel}</span>
        </div>
        {loading ? (
          <div className={s.skelSector} />
        ) : (
          <div className={s.sectorGrid}>
            {sectors.map((sec) => {
              const symbol = sec.name === 'Tech' ? 'XLK'
                           : sec.name === 'Energy' ? 'XLE'
                           : sec.name === 'Cons. Disc' ? 'XLY'
                           : sec.name === 'Materials' ? 'XLB'
                           : sec.name === 'Industrials' ? 'XLI'
                           : sec.name === 'Finance' ? 'XLF'
                           : sec.name === 'Healthcare' ? 'XLV'
                           : sec.name === 'Utilities' ? 'XLU'
                           : '';
              const wsData = wsGetPrice(symbol);
              const useWs = shouldUseWsQuote(symbol, wsData);
              const wsChangeLooksStale = useWs
                && Math.abs(wsData.changePct) < 0.0001
                && Math.abs(sec.pct) >= 0.0001;
              const displayPct = useWs && !wsChangeLooksStale ? wsData.changePct : sec.pct;
              const flashClass = useWs && !wsChangeLooksStale ? (flashStates[symbol] === 'up' ? s.flashUp : flashStates[symbol] === 'down' ? s.flashDown : '') : '';

              return (
                <div
                  key={sec.name}
                  className={`${s.sectorCell} ${flashClass}`}
                  style={{
                    background: heatBg(displayPct),
                    borderColor: heatBorder(displayPct),
                  }}
                >
                  <span className={s.sectorName}>{sec.name}</span>
                  <span className={`${s.sectorPct} ${displayPct >= 0 ? s.sectorPctUp : s.sectorPctDown}`}>
                    {displayPct >= 0 ? '+' : ''}{displayPct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══════════════ AI MORNING BRIEFING ══════════════ */}
      {loading ? (
        <div className={s.card}>
          <div className={s.skelBriefing} />
        </div>
      ) : (
        <div className={s.briefingCard}>
          <div className={s.briefingHeaderContainer}>
            <div className={s.briefingHeader} style={{ marginBottom: 0 }}>
              <span className={s.briefingIcon}>✨</span>
              <span className={s.briefingTitle}>
                {briefingMode === 'briefing' 
                  ? (locale === 'ko' ? 'AI 모닝브리핑' : locale === 'ja' ? 'AI モーニングブリーフィング' : 'AI MORNING BRIEFING')
                  : (locale === 'ko' ? '실시간 뉴스펄스' : locale === 'ja' ? 'リアルタイム・ニュース' : 'LIVE NEWS PULSE')}
              </span>
            </div>
            
            {/* Pill Toggle Switch */}
            <div className={s.briefingToggle}>
              <button 
                className={`${s.toggleBtn} ${briefingMode === 'briefing' ? s.toggleBtnActive : ''}`}
                onClick={() => setBriefingMode('briefing')}
              >
                {locale === 'ko' ? '브리핑' : locale === 'ja' ? '要約' : 'Brief'}
              </button>
              <button 
                className={`${s.toggleBtn} ${briefingMode === 'news' ? s.toggleBtnActive : ''}`}
                onClick={() => setBriefingMode('news')}
              >
                {locale === 'ko' ? '실시간' : locale === 'ja' ? 'ニュース' : 'Live'}
              </button>
            </div>
          </div>

          {briefingMode === 'briefing' ? (
            <>
              {/* Live News Spotlight (Top 2 items) - MOVED ABOVE briefingBody */}
              {newsItems.length > 0 && (
                <div className={s.briefingNewsSection} style={{ marginTop: '8px' }}>
                  <div className={s.briefingNewsHeader}>
                    <div className={s.briefingNewsDot} />
                    <span className={s.briefingNewsTitle}>
                      {locale === 'ko' ? '실시간 주요 속보' : locale === 'ja' ? 'リアルタイム速報' : 'LIVE MARKET SPOTLIGHT'}
                    </span>
                  </div>
                  <div className={s.briefingNewsList}>
                    {newsItems.slice(0, 2).map((item) => {
                      let displayHeadline = item.headline;
                      if (locale === 'ko' && item.summaryKR) {
                        displayHeadline = item.summaryKR;
                      } else if (locale === 'ja' && item.summaryJP) {
                        displayHeadline = item.summaryJP;
                      } else if (item.summaryEN) {
                        displayHeadline = item.summaryEN;
                      }

                      return (
                        <div 
                          key={item.id} 
                          className={s.briefingNewsItem}
                          onClick={() => router.push('/app-view/guardian?tab=reality')}
                        >
                          <span className={s.briefingNewsHeadline}>{displayHeadline}</span>
                          <span className={s.briefingNewsArrow}>→</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div
                className={s.briefingBody}
                style={{ fontSize: '13.5px', lineHeight: '1.55' }}
                dangerouslySetInnerHTML={{ __html: briefing }}
              />

              <div className={s.briefingCta} onClick={() => router.push('/app-view/guardian?tab=briefing')}>
                {locale === 'ko' ? '전체 리포트 읽기 →' : locale === 'ja' ? 'レポート全文を読む →' : 'Read Full Report →'}
              </div>
            </>
          ) : (
            <>
              {/* Full news items list in card - SHOWN 5 ITEMS */}
              <div className={s.briefingNewsList} style={{ marginTop: '8px' }}>
                {newsItems.slice(0, 5).map((item) => {
                  let displayHeadline = item.headline;
                  if (locale === 'ko' && item.summaryKR) {
                    displayHeadline = item.summaryKR;
                  } else if (locale === 'ja' && item.summaryJP) {
                    displayHeadline = item.summaryJP;
                  } else if (item.summaryEN) {
                    displayHeadline = item.summaryEN;
                  }

                  return (
                    <div 
                      key={item.id} 
                      className={s.briefingNewsItem}
                      onClick={() => router.push('/app-view/guardian?tab=reality')}
                      style={{ padding: '10px 14px' }}
                    >
                      <span className={s.briefingNewsHeadline} style={{ fontSize: '12px' }}>{displayHeadline}</span>
                      <span className={s.briefingNewsArrow}>→</span>
                    </div>
                  );
                })}
                {newsItems.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '16px 0', textAlign: 'center' }}>
                    {locale === 'ko' ? '수신된 뉴스가 없습니다.' : locale === 'ja' ? '受信したニュースはありません。' : 'No recent news bulletins.'}
                  </div>
                )}
              </div>
              
              <div className={s.briefingCta} onClick={() => router.push('/app-view/guardian?tab=reality')}>
                {locale === 'ko' ? '시장 모니터 현황 보기 →' : locale === 'ja' ? '市場現況を見る →' : 'View Live Market Monitor →'}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════ INSTITUTIONAL PULSE (PREMIUM) ══════════════ */}
        <ValueWall
          locale={locale}
          title={gateCopy.title}
          subtitle={gateCopy.subtitle}
          teaser={{
            label: gateCopy.teaserLabel,
            value: `${institutionalSignals[0].value} · ${gateCopy.teaserUnit}`
          }}
          ctaLabel={gateCopy.cta}
          adFreeLabel={gateCopy.adFree}
          previewChipLabel={gateCopy.previewChip}
          socialProof={gateCopy.social}
          lockedPreview={
            <div className={`${s.instPulseGrid} ${s.instPulsePreview}`} aria-hidden="true">
              {institutionalSignals.map((signal) => (
                <div key={signal.key} className={`${s.instCell} ${s.instCellPremium} ${signalToneClass[signal.tone as keyof typeof signalToneClass]}`}>
                  <div className={s.instHeader}>
                    <span className={s.instLabel}>{signal.label}</span>
                    <span className={s.instKicker}>{signal.kicker}</span>
                  </div>
                  <div className={s.instValRow}>
                    <span className={s.instVal}>{signal.value}</span>
                    <span className={s.instSub}>{signal.sub}</span>
                  </div>
                  {/* 못 잰 값은 막대를 «안 그린다». 0% 막대는 «측정된 0» 처럼 보인다. */}
                  <div className={s.instTrack}>
                    {signal.score != null && (
                      <div className={s.instFill} style={{ width: `${signal.score}%` }} />
                    )}
                  </div>
                  <p className={s.instInsight}>{signal.insight}</p>
                </div>
              ))}
            </div>
          }
        >
          {loading ? (
            <div style={{ height: '180px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', margin: '16px' }} />
          ) : (
            <div className={s.instPulseGrid}>
              {institutionalSignals.map((signal) => (
                <div key={signal.key} className={`${s.instCell} ${s.instCellPremium} ${signalToneClass[signal.tone as keyof typeof signalToneClass]}`}>
                  <div className={s.instHeader}>
                    <span className={s.instLabel}>{signal.label}</span>
                    <span className={s.instKicker}>{signal.kicker}</span>
                  </div>
                  <div className={s.instValRow}>
                    <span className={s.instVal}>{signal.value}</span>
                    <span className={s.instSub}>{signal.sub}</span>
                  </div>
                  {/* 못 잰 값은 막대를 «안 그린다». 0% 막대는 «측정된 0» 처럼 보인다. */}
                  <div className={s.instTrack}>
                    {signal.score != null && (
                      <div className={s.instFill} style={{ width: `${signal.score}%` }} />
                    )}
                  </div>
                  <p className={s.instInsight}>{signal.insight}</p>
                </div>
              ))}
            </div>
          )}
        </ValueWall>



      {/* ══════════════ AD BANNER ══════════════ */}
      <AdBanner />
      <MobileAppFooter />

    </div>
  );
}
