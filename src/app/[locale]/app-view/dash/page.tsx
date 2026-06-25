'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { MobileAppFooter } from '@/components/mobile/MobileAppFooter';
import { Sparkline } from '@/components/app/Sparkline';
import { AdBanner } from '@/components/app/AdBanner';
import { ValueWall } from '@/components/app/ValueWall';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { useRealtimeData } from '@/providers/WebSocketProvider';
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
  if (day === 0 || day === 6) return false;
  return isHoliday
    ? timeDecimal >= 3 && timeDecimal < 13
    : timeDecimal >= 3 && timeDecimal < 16.25;
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

function getSymBadge(sym: string) {
  switch (sym) {
    case 'DOW':
      return <span className={`${s.symbolBadge} ${s.dow}`}>30</span>;
    case 'NASDAQ':
      return <span className={`${s.symbolBadge} ${s.nasdaq}`}>100</span>;
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
  const [indices, setIndices] = useState<PulseItem[]>(DEMO_INDICES);
  const [futures, setFutures] = useState<PulseItem[]>(DEMO_FUTURES);
  const [etfs, setEtfs] = useState<PulseItem[]>(DEMO_ETFS);
  const [macro, setMacro] = useState<MacroItem[]>(DEMO_MACRO);
  const [sectors, setSectors] = useState<SectorItem[]>(DEMO_SECTORS);
  const [movers, setMovers] = useState<MoverItem[]>([]);
  const [moverSort, setMoverSort] = useState<'value' | 'gainers' | 'losers'>('value');
  const [moversLoading, setMoversLoading] = useState(false);
  const [briefing, setBriefing] = useState<string>(DEMO_BRIEFING);
  const [volRegime, setVolRegime] = useState<{ regime: string; score: number } | null>({ regime: 'COILING', score: 38 });
  const [darkPoolFlow, setDarkPoolFlow] = useState<{ percent: number; volume: number; totalVolume: number } | null>({ percent: 42.5, volume: 0, totalVolume: 0 });
  const [gammaSqueeze, setGammaSqueeze] = useState<{ score: number; risk: string } | null>({ score: 34, risk: 'LOW' });
  const [sectorRotation, setSectorRotation] = useState<{ score: number; direction: string; conviction: string } | null>({ score: 50, direction: 'NEUTRAL', conviction: 'LOW' });
  const [newsItems, setNewsItems] = useState<TickerNewsItem[]>([]);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [briefingMode, setBriefingMode] = useState<'briefing' | 'news'>('news');
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [showToast, setShowToast] = useState(false);

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
      futuresOpen: 'Futures remain tracked on ET even outside regular hours.',
      regularOpen: 'Regular-session flow is updating live.',
      marketClosed: 'Closed-session data is paired with active futures context.',
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
      futuresOpen: '通常取引外でも先物フローはET基準で追跡されます。',
      regularOpen: '通常取引のリアルタイムフローを反映します。',
      marketClosed: '引け後データと先物フローを合わせて確認します。',
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
    futuresOpen: 'Futures remain tracked on ET even outside regular hours.',
    regularOpen: 'Regular-session flow is updating live.',
    marketClosed: 'Closed-session data is paired with active futures context.',
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
      futuresOpen: 'Futures remain tracked on ET even outside regular hours.',
      regularOpen: 'Regular-session flow is updating live.',
      marketClosed: 'Closed-session data is paired with active futures context.',
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
      futuresOpen: '通常時間外も先物フローをET基準で追跡します。',
      regularOpen: '通常取引時間のフローをリアルタイムで反映します。',
      marketClosed: '引け後データと稼働中の先物フローを合わせて表示します。',
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
      subtitle: '변동성 레짐, 다크풀 흐름, 섹터 순환을 1시간 동안 확인합니다.',
      teaserLabel: '무료 미리보기 · 기관급 펄스',
      previewChip: '무료 미리보기',
      cta: '광고 보고 1시간 해제',
      adFree: '또는 $9.99/월 광고 제거',
      social: '오늘 14.2K 잠금해제',
      teaserUnit: '4개 중 1개',
      signals: {
        volatility: { label: '변동성 레짐', kicker: '시장 압축/확대', insight: '시장 변동성이 압축되는지, 확대되는지 추적합니다.' },
        darkPool: { label: '다크풀 거래량', kicker: '기관성 비공개 체결', insight: '일반 호가창 밖의 대형 체결 흐름을 감지합니다.' },
        squeeze: { label: '스퀴즈 위험', kicker: '단기 변동성 압력', insight: '감마와 포지션 쏠림이 만드는 급변 가능성을 봅니다.' },
        rotation: { label: '섹터 순환 강도', kicker: '자금 이동 방향', insight: '공격/방어 섹터로 자금이 이동하는 강도를 확인합니다.' },
      },
    },
    en: {
      title: 'Institutional Market Pulse',
      subtitle: 'Unlock volatility regime, dark-pool flow, and sector rotation for 1 hour.',
      teaserLabel: 'Free preview · Institutional pulse',
      previewChip: 'Free preview',
      cta: 'Watch ad to unlock 1HR',
      adFree: 'or $9.99/mo ad-free',
      social: '14.2K unlocked today',
      teaserUnit: '1 of 4',
      signals: {
        volatility: { label: 'Volatility Regime', kicker: 'Compression / expansion', insight: 'Tracks whether market volatility is compressing or expanding.' },
        darkPool: { label: 'Dark Pool Volume', kicker: 'Institutional prints', insight: 'Surfaces large off-exchange flow hidden from the open book.' },
        squeeze: { label: 'Squeeze Risk', kicker: 'Short-term pressure', insight: 'Monitors gamma and positioning pressure behind fast moves.' },
        rotation: { label: 'Rotation Intensity', kicker: 'Capital rotation', insight: 'Shows whether money is rotating toward risk or defense.' },
      },
    },
    ja: {
      title: '機関級マーケットパルス',
      subtitle: 'ボラティリティ・レジーム、ダークプールフロー、セクターローテーションを1時間確認できます。',
      teaserLabel: '無料プレビュー · 機関投資家パルス',
      previewChip: '無料プレビュー',
      cta: '広告視聴で1時間解除',
      adFree: 'または月$9.99で広告なし',
      social: '本日14.2K件解除',
      teaserUnit: '4つ中1つ',
      signals: {
        volatility: { label: 'ボラティリティ・レジーム', kicker: '圧縮 / 拡大', insight: '市場の変動性が圧縮か拡大かを追跡します。' },
        darkPool: { label: 'ダークプール出来高', kicker: '機関投資家フロー', insight: '板に見えにくい大口の非公開取引を確認します。' },
        squeeze: { label: 'スクイーズリスク', kicker: '短期圧力', insight: 'ガンマとポジション偏りによる急変リスクを見ます。' },
        rotation: { label: 'セクター循環強度', kicker: '資金移動', insight: '資金がリスク側か防御側へ回る強さを確認します。' },
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
      volatility: { label: 'Volatility Regime', kicker: 'Compression / expansion', insight: 'Tracks whether market volatility is compressing or expanding.' },
      darkPool: { label: 'Dark Pool Volume', kicker: 'Institutional prints', insight: 'Surfaces large off-exchange flow hidden from the open book.' },
      squeeze: { label: 'Squeeze Risk', kicker: 'Short-term pressure', insight: 'Monitors gamma and positioning pressure behind fast moves.' },
      rotation: { label: 'Rotation Intensity', kicker: 'Capital rotation', insight: 'Shows whether money is rotating toward risk or defense.' },
    },
  };

  const itemSessionLive = (symOrLabel: string) => checkIsItemActive(symOrLabel);
  const futuresLive = isCmeGlobexActive('equity', isMarketHoliday);
  const volatilityLive = itemSessionLive('VIX');
  const futuresAvg = avgChange(futures);
  const cashAvg = avgChange(indices);
  const vixChange = etfs.find((p) => p.sym === 'VIX')?.chg ?? 0;
  const fgValue = parseFloat(macro.find((m) => m.label === 'F&G')?.value || '50');
  const breadthPct = sectors.length
    ? Math.round((sectors.filter((sec) => sec.pct >= 0).length / sectors.length) * 100)
    : 50;
  const riskScore = clampPct(50 + futuresAvg * 7 + cashAvg * 4 + (breadthPct - 50) * 0.35 + (Number.isFinite(fgValue) ? (fgValue - 50) * 0.25 : 0) - Math.max(0, vixChange) * 2.5);
  const riskTone = riskScore >= 58 ? copy.riskOn : riskScore <= 42 ? copy.riskOff : copy.mixed;
  const futuresTone = futuresAvg > 0.15 ? copy.bullish : futuresAvg < -0.15 ? copy.bearish : copy.neutral;
  const cashTone = cashAvg > 0.15 ? copy.bullish : cashAvg < -0.15 ? copy.bearish : copy.neutral;
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
  const localizeRegime = (value?: string | null) => {
    const token = normalizeSignalToken(value);
    const map = {
      ko: { COILING: '압축', LOADED: '긴장 고조', EXPANDING: '확대', CALM: '안정', NORMAL: '보통' },
      en: { COILING: 'Coiling', LOADED: 'Loaded', EXPANDING: 'Expanding', CALM: 'Calm', NORMAL: 'Normal' },
      ja: { COILING: '圧縮', LOADED: '緊張上昇', EXPANDING: '拡大', CALM: '安定', NORMAL: '通常' },
    }[locale as 'ko' | 'en' | 'ja'];
    return map?.[token as keyof typeof map] || (value ? value.replace(/_/g, ' ') : 'Coiling');
  };
  const localizeRisk = (value?: string | null) => {
    const token = normalizeSignalToken(value);
    const map = {
      ko: { LOW: '낮음', MEDIUM: '보통', HIGH: '높음', EXTREME: '극단' },
      en: { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', EXTREME: 'Extreme' },
      ja: { LOW: '低い', MEDIUM: '中程度', HIGH: '高い', EXTREME: '極端' },
    }[locale as 'ko' | 'en' | 'ja'];
    return map?.[token as keyof typeof map] || (value ? value.replace(/_/g, ' ') : 'Low');
  };
  const localizeRotation = (value?: string | null) => {
    const token = normalizeSignalToken(value);
    const map = {
      ko: { 'RISK ON': '상방 순환', RISK_ON: '상방 순환', 'RISK OFF': '방어 순환', RISK_OFF: '방어 순환', NEUTRAL: '중립 순환', DEFENSIVE: '방어 순환' },
      en: { 'RISK ON': 'Risk-On Tilt', RISK_ON: 'Risk-On Tilt', 'RISK OFF': 'Defensive Tilt', RISK_OFF: 'Defensive Tilt', NEUTRAL: 'Neutral Tilt', DEFENSIVE: 'Defensive Tilt' },
      ja: { 'RISK ON': 'リスクオン傾向', RISK_ON: 'リスクオン傾向', 'RISK OFF': '防御寄り', RISK_OFF: '防御寄り', NEUTRAL: '中立循環', DEFENSIVE: '防御寄り' },
    }[locale as 'ko' | 'en' | 'ja'];
    return map?.[token as keyof typeof map] || (value ? value.replace(/_/g, ' ') : 'Neutral Tilt');
  };
  const formatDarkPoolVolume = (volume?: number | null) => {
    if (!volume || !Number.isFinite(volume)) return 'DP —';
    if (volume >= 1e9) return `DP ${(volume / 1e9).toFixed(1)}B`;
    if (volume >= 1e6) return `DP ${(volume / 1e6).toFixed(1)}M`;
    return `DP ${(volume / 1e3).toFixed(1)}K`;
  };
  const volScore = clampPct(volRegime?.score || 38);
  const darkPoolScore = clampPct(darkPoolFlow?.percent || 42.5);
  const squeezeScore = clampPct(gammaSqueeze?.score || 34);
  const rotationScore = clampPct(sectorRotation?.score || 50);
  const institutionalSignals = [
    {
      key: 'vol',
      tone: 'cyan',
      label: gateCopy.signals.volatility.label,
      kicker: gateCopy.signals.volatility.kicker,
      value: localizeRegime(volRegime?.regime),
      sub: `${volScore.toFixed(0)}%`,
      insight: gateCopy.signals.volatility.insight,
      score: volScore,
    },
    {
      key: 'dark',
      tone: 'green',
      label: gateCopy.signals.darkPool.label,
      kicker: gateCopy.signals.darkPool.kicker,
      value: `${darkPoolScore.toFixed(1)}%`,
      sub: formatDarkPoolVolume(darkPoolFlow?.volume),
      insight: gateCopy.signals.darkPool.insight,
      score: darkPoolScore,
    },
    {
      key: 'squeeze',
      tone: 'pink',
      label: gateCopy.signals.squeeze.label,
      kicker: gateCopy.signals.squeeze.kicker,
      value: localizeRisk(gammaSqueeze?.risk),
      sub: `${squeezeScore.toFixed(0)}%`,
      insight: gateCopy.signals.squeeze.insight,
      score: squeezeScore,
    },
    {
      key: 'rotation',
      tone: 'amber',
      label: gateCopy.signals.rotation.label,
      kicker: gateCopy.signals.rotation.kicker,
      value: localizeRotation(sectorRotation?.direction),
      sub: `Rotation ${rotationScore.toFixed(0)}`,
      insight: gateCopy.signals.rotation.insight,
      score: rotationScore,
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
            const pctVal = t.changePercent ?? 0;
            const sign = pctVal >= 0 ? '+' : '';
            return {
              sym: t.ticker,
              px: t.price ? t.price.toFixed(2) : '0.00',
              chg: `${sign}${pctVal.toFixed(2)}%`,
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
          fetch('/api/live/quotes?symbols=XLK,XLE,XLY,XLB,XLI,XLF,XLV,XLU,SPY,QQQ'),
          fetch(`/api/live/premium-metrics?locale=${locale}`),
          fetch('/api/market/index-close'),
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
        if (indexRes && indexRes.status === 'fulfilled' && indexRes.value.ok) {
          try {
            const idx = await indexRes.value.json();
            const items: PulseItem[] = [];
            if (idx.dow) {
              items.push({
                sym: 'DOW',
                px: idx.dow.price,
                chg: idx.dow.changePct,
                up: idx.dow.changePct >= 0,
                spark: DEMO_INDICES[0].spark,
              });
            }
            if (idx.nasdaq) {
              items.push({
                sym: 'NASDAQ',
                px: idx.nasdaq.price,
                chg: idx.nasdaq.changePct,
                up: idx.nasdaq.changePct >= 0,
                spark: DEMO_INDICES[1].spark,
              });
            }
            if (idx.spx) {
              items.push({
                sym: 'S&P 500',
                px: idx.spx.price,
                chg: idx.spx.changePct,
                up: idx.spx.changePct >= 0,
                spark: DEMO_INDICES[2].spark,
              });
            }
            if (items.length >= 2) {
              setIndices(prev => items.map(item => {
                if (isLive || Math.abs(item.chg) >= 0.0001) {
                  return item;
                }
                const previous = prev.find(p => p.sym === item.sym);
                if (!previous || Math.abs(previous.chg) < 0.0001) {
                  return item;
                }
                return {
                  ...item,
                  px: item.px || previous.px,
                  chg: previous.chg,
                  up: previous.chg >= 0,
                  spark: previous.spark,
                };
              }));
            }
          } catch {
            // fallback
          }
        }

        // ── Build Macro Board from real data ──
        if (f) {
          try {
            // Populate Futures Row
            const futItems: PulseItem[] = [];
            if (f.nasdaq100) {
              futItems.push({
                sym: 'NASDAQ100 F',
                px: f.nasdaq100.level ?? 19850.50,
                chg: f.nasdaq100.chgPct ?? 0.45,
                up: (f.nasdaq100.chgPct ?? 0) >= 0,
                spark: DEMO_FUTURES[0].spark,
                ...feedMetaForItem(f.nasdaq100, isCmeGlobexActive('equity', isMarketHoliday), { requireFresh: false }),
              });
            }
            if (f.spx) {
              futItems.push({
                sym: 'S&P500 F',
                px: f.spx.level ?? 5490.25,
                chg: f.spx.chgPct ?? 0.30,
                up: (f.spx.chgPct ?? 0) >= 0,
                spark: DEMO_FUTURES[1].spark,
                ...feedMetaForItem(f.spx, isCmeGlobexActive('equity', isMarketHoliday), { requireFresh: false }),
              });
            }
            if (f.rut) {
              futItems.push({
                sym: 'Russell2k F',
                px: f.rut.level ?? 2120.40,
                chg: f.rut.chgPct ?? 0.15,
                up: (f.rut.chgPct ?? 0) >= 0,
                spark: DEMO_FUTURES[2].spark,
                ...feedMetaForItem(f.rut, isCmeGlobexActive('equity', isMarketHoliday), { requireFresh: false }),
              });
            }
            if (futItems.length >= 2) {
              setFutures(futItems);
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
            } else {
              // Fallback to VIX synthetic if CNN data is missing
              const vixVal = f.vix?.level ?? 20;
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

          const vixVal = f?.vix?.level ?? 21.5;
          const vixChg = f?.vix?.chgPct ?? -3.1;

          setEtfs(prev => {
            const prevSpy = prev.find(item => item.sym === 'SPY');
            const prevQqq = prev.find(item => item.sym === 'QQQ');
            const spyChg = stableChangePct(spyQuote, prevSpy?.chg ?? DEMO_ETFS[0].chg, equityExtendedLive);
            const qqqChg = stableChangePct(qqqQuote, prevQqq?.chg ?? DEMO_ETFS[1].chg, equityExtendedLive);
            return [
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
              {
                sym: 'VIX',
                px: vixVal,
                chg: vixChg,
                up: vixChg >= 0,
                spark: DEMO_ETFS[2].spark,
                ...feedMetaForItem(f?.vix, isVixSessionActive(isMarketHoliday), { requireFresh: false }),
              }
            ];
          });
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
              setVolRegime({ regime: pData.volatilityRegime.regime, score: pData.volatilityRegime.score });
              setDarkPoolFlow({ percent: pData.darkPool.percent, volume: pData.darkPool.volume, totalVolume: pData.darkPool.totalVolume ?? 0 });
              setGammaSqueeze({ score: pData.gammaSqueeze.score, risk: pData.gammaSqueeze.risk });
              setSectorRotation({ score: pData.sectorRotation.score, direction: pData.sectorRotation.direction, conviction: pData.sectorRotation.conviction });
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
            width="24" 
            height="24" 
            style={{ 
              filter: 'drop-shadow(0 0 6px rgba(34, 211, 238, 0.35))',
              flexShrink: 0
            }} 
          />
          <div className={s.brandText}>
            <span className={s.brandName}>
              SIGNUM<span style={{ color: 'var(--cyan)' }}>HQ</span>
            </span>
            <span className={s.brandSub}>DARK POOL INTEL</span>
          </div>
        </div>
        <div className={s.headerActions}>
          <button className={s.headerBtn} aria-label="Notifications" onClick={() => {
            setShowToast(true);
            setTimeout(() => setShowToast(false), 2500);
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div style={{ position: 'relative' }}>
            <button className={s.headerBtn} aria-label="Language" onClick={() => setShowLangDropdown(!showLangDropdown)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2Z" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </button>
            {showLangDropdown && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '8px',
                background: 'rgba(15, 23, 42, 0.98)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px', padding: '6px', zIndex: 100,
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)', minWidth: '120px'
              }}>
                {[{ code: 'ko', label: '🇰🇷 한국어' }, { code: 'en', label: '🇺🇸 English' }, { code: 'ja', label: '🇯🇵 日本語' }].map(lang => (
                  <button key={lang.code}
                    onClick={() => {
                      setShowLangDropdown(false);
                      const currentPath = window.location.pathname;
                      const newPath = currentPath.replace(/^\/(ko|en|ja)/, `/${lang.code}`);
                      router.push(newPath);
                    }}
                    style={{
                      display: 'block', width: '100%', padding: '10px 14px',
                      background: locale === lang.code ? 'rgba(34,211,238,0.1)' : 'transparent',
                      border: locale === lang.code ? '1px solid rgba(34,211,238,0.2)' : '1px solid transparent',
                      borderRadius: '8px', color: locale === lang.code ? 'var(--cyan)' : 'rgba(255,255,255,0.7)',
                      fontSize: '13px', fontWeight: locale === lang.code ? 700 : 500,
                      cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s ease'
                    }}
                  >{lang.label}</button>
                ))}
              </div>
            )}
          </div>
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
          <strong className={riskScore >= 58 ? s.regimePositive : riskScore <= 42 ? s.regimeNegative : s.regimeNeutral}>
            {riskTone}
          </strong>
          <span className={s.regimeNote}>{pulseStatusNote}</span>
        </div>
        <div className={s.regimeMetrics}>
          <div className={s.regimeMetric}>
            <span>{copy.futures}</span>
            <b className={futuresAvg >= 0 ? s.pos : s.neg}>{futuresTone} {fmtChg(futuresAvg)}</b>
          </div>
          <div className={s.regimeMetric}>
            <span>{copy.cash}</span>
            <b className={cashAvg >= 0 ? s.pos : s.neg}>{cashTone} {fmtChg(cashAvg)}</b>
          </div>
          <div className={s.regimeMetric}>
            <span>{copy.risk}</span>
            <b>{Math.round(riskScore)}</b>
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
              {futures.map((p) => (
                <div key={p.sym} className={`${s.pulseCard} ${itemSessionLive(p.sym) ? s.live : ''} ${p.up ? s.up : s.down}`}>
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
              {indices.map((p) => {
                // Cash index row is Redis/index-close based. ETF proxies must not overwrite index change.
                const displayChg = p.chg;
                const isUp = displayChg >= 0;
                
                // Flash animation class
                const flashClass = '';

                return (
                  <div key={p.sym} className={`${s.pulseCard} ${checkIsItemActive(p.sym) ? s.live : ''} ${isUp ? s.up : s.down} ${flashClass}`}>
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
              {etfs.map((p) => {
                const wsData = wsGetPrice(p.sym);
                const useWs = shouldUseWsQuote(p.sym, wsData);
                
                // Overlay price & change if available
                const displayPx = useWs ? wsData.price : p.px;
                const displayChg = useWs ? wsData.changePct : p.chg;
                const isUp = displayChg >= 0;
                
                // Flash animation class
                const flashClass = useWs ? (flashStates[p.sym] === 'up' ? s.flashUp : flashStates[p.sym] === 'down' ? s.flashDown : '') : '';

                return (
                  <div key={p.sym} className={`${s.pulseCard} ${itemSessionLive(p.sym) ? s.live : ''} ${isUp ? s.up : s.down} ${flashClass}`}>
                    <div className={s.pulseCardSymRow}>
                      {getSymBadge(p.sym)}
                      <span className={s.pulseSym}>{p.sym}</span>
                    </div>
                    <span className={s.pulsePrice}>
                      {p.sym === 'VIX' ? displayPx.toFixed(2) : `$${fmtPrice(displayPx)}`}
                    </span>
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
              <div key={m.label} className={`${s.macroCell} ${m.live ? s.live : ''}`}>
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
              {locale === 'ko' ? '거래대금' : locale === 'ja' ? '代금' : 'Value'}
            </button>
            <button 
              className={`${s.moverToggleBtn} ${moverSort === 'gainers' ? s.moverToggleBtnActive : ''}`}
              onClick={() => setMoverSort('gainers')}
            >
              {locale === 'ko' ? '상승률' : locale === 'ja' ? '상승' : 'Gainers'}
            </button>
            <button 
              className={`${s.moverToggleBtn} ${moverSort === 'losers' ? s.moverToggleBtnActive : ''}`}
              onClick={() => setMoverSort('losers')}
            >
              {locale === 'ko' ? '하락률' : locale === 'ja' ? '하락' : 'Losers'}
            </button>
          </div>
        </div>
        <span 
          className={s.sectionAction} 
          onClick={() => router.push('/app-view/movers')}
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
                  <span className={s.moverSym}>{mv.sym}</span>
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
          <span className={`${s.sessionPill} ${sectorSessionClass}`}>{sectorSessionLabel}</span>
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
                  <div className={s.instTrack}>
                    <div className={s.instFill} style={{ width: `${signal.score}%` }} />
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
                  <div className={s.instTrack}>
                    <div className={s.instFill} style={{ width: `${signal.score}%` }} />
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

      {/* Language dropdown backdrop */}
      {showLangDropdown && (
        <div
          onClick={() => setShowLangDropdown(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'transparent' }}
        />
      )}

      {/* Toast notification */}
      {showToast && (
        <div style={{
          position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(34,211,238,0.25)',
          borderRadius: '12px', padding: '12px 20px', zIndex: 200,
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', gap: '8px',
          animation: 'appFadeIn 0.2s ease',
        }}>
          <span style={{ fontSize: '14px' }}>🔔</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
            {locale === 'ko' ? '알림 기능 준비 중입니다' : locale === 'ja' ? '通知機能は準備中です' : 'Notifications coming soon'}
          </span>
        </div>
      )}
    </div>
  );
}
