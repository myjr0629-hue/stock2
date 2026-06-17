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
}

interface MacroItem {
  label: string;
  value: string;
  chg: number;
  unit: string;
  badge?: string;
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

const DEMO_MOVERS: MoverItem[] = [
  { sym: 'NVDA', px: '136.42', chg: '+5.2%', up: true, spark: [4, 5, 5, 7, 8, 9, 11, 13, 14] },
  { sym: 'TSLA', px: '168.90', chg: '-2.1%', up: false, spark: [12, 11, 12, 10, 9, 9, 8, 7, 7] },
  { sym: 'AAPL', px: '212.55', chg: '+1.8%', up: true, spark: [6, 6, 7, 6, 8, 8, 9, 10, 11] },
  { sym: 'AMD', px: '164.30', chg: '+3.4%', up: true, spark: [5, 6, 5, 7, 8, 8, 10, 11, 12] },
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
  const abs = Math.min(Math.abs(pct), 5);
  const alpha = 0.06 + (abs / 5) * 0.18;
  return pct >= 0
    ? `rgba(16, 185, 129, ${alpha.toFixed(2)})`
    : `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
}

function heatBorder(pct: number): string {
  const abs = Math.min(Math.abs(pct), 5);
  const alpha = 0.08 + (abs / 5) * 0.15;
  return pct >= 0
    ? `rgba(16, 185, 129, ${alpha.toFixed(2)})`
    : `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
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
  const { status: marketStatusInfo } = useMarketStatus();
  const isLive = marketStatusInfo?.session === 'regular' && !marketStatusInfo?.isHoliday;
  const [loading, setLoading] = useState(true);
  const [indices, setIndices] = useState<PulseItem[]>(DEMO_INDICES);
  const [futures, setFutures] = useState<PulseItem[]>(DEMO_FUTURES);
  const [etfs, setEtfs] = useState<PulseItem[]>(DEMO_ETFS);
  const [macro, setMacro] = useState<MacroItem[]>(DEMO_MACRO);
  const [sectors, setSectors] = useState<SectorItem[]>(DEMO_SECTORS);
  const [movers, setMovers] = useState<MoverItem[]>(DEMO_MOVERS);
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
          const timer = setTimeout(() => {
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
    const now = new Date();
    // Convert to New York time parts reliably without string parsing
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    
    const parts = formatter.formatToParts(now);
    const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
    
    const year = parseInt(partMap.year, 10);
    const month = parseInt(partMap.month, 10) - 1; // 0-indexed month
    const date = parseInt(partMap.day, 10);
    const hour = parseInt(partMap.hour, 10);
    const min = parseInt(partMap.minute, 10);
    
    const nyDate = new Date(year, month, date, hour, min);
    const day = nyDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const totalMins = hour * 60 + min;

    const isFuturesClosed = 
      (day === 5 && totalMins >= 17 * 60) || // Friday after 5 PM
      day === 6 || // Saturday
      (day === 0 && totalMins < 18 * 60); // Sunday before 6 PM

    const symbol = symOrLabel.toUpperCase();

    // 1. Crypto (BTC): always active (24/7/365)
    if (symbol === 'BTC') {
      return true;
    }

    // 2. Futures (NASDAQ100 F, Russell2k F, S&P500 F, GOLD, OIL)
    const CME_FUTURES_SYMBOLS = ['NASDAQ100 F', 'RUSSELL2K F', 'S&P500 F', 'GOLD', 'OIL'];
    if (CME_FUTURES_SYMBOLS.includes(symbol)) {
      if (isFuturesClosed) return false;
      // Daily maintenance break: 5:00 PM to 6:00 PM ET (17:00 - 18:00)
      const isMaintenanceBreak = hour === 17;
      return !isMaintenanceBreak;
    }

    // 3. DXY (Dollar Index proxy UUP): Weekdays 4:00 AM - 8:00 PM ET
    if (symbol === 'DXY') {
      const isWeekday = day >= 1 && day <= 5;
      const isTradingHours = totalMins >= 4 * 60 && totalMins < 20 * 60; // 4:00 AM - 8:00 PM
      return isWeekday && isTradingHours && !marketStatusInfo?.isHoliday;
    }

    // 4. US 10Y (Bond Yields): Standard stock market hours (weekdays 9:30 AM - 4:00 PM ET)
    if (symbol === 'US 10Y' || symbol === 'TNX') {
      const isRegularActive = marketStatusInfo?.session === 'regular' && !marketStatusInfo?.isHoliday;
      return isRegularActive;
    }

    // 5. Fear & Greed (F&G) and Yield Curve spread (2s10s)
    if (symbol === 'F&G' || symbol === '2S10S') {
      return false;
    }

    // 6. Regular Equities/ETFs/Sectors (DOW, NASDAQ, S&P 500, SPY, QQQ, VIX, R2K)
    const isRegularActive = marketStatusInfo?.session === 'regular' && !marketStatusInfo?.isHoliday;
    return isRegularActive;
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
          setMovers(mapped);
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
  }, [moverSort]);

  /* ── Fetch live data from APIs ── */
  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      try {
        const [marketRes, macroRes, briefingRes, quotesRes, premiumRes, indexRes, newsRes] = await Promise.allSettled([
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
              setIndices(items);
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
              });
            }
            if (f.spx) {
              futItems.push({
                sym: 'S&P500 F',
                px: f.spx.level ?? 5490.25,
                chg: f.spx.chgPct ?? 0.30,
                up: (f.spx.chgPct ?? 0) >= 0,
                spark: DEMO_FUTURES[1].spark,
              });
            }
            if (f.rut) {
              futItems.push({
                sym: 'Russell2k F',
                px: f.rut.level ?? 2120.40,
                chg: f.rut.chgPct ?? 0.15,
                up: (f.rut.chgPct ?? 0) >= 0,
                spark: DEMO_FUTURES[2].spark,
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
            });

            // GOLD
            macroItems.push({
              label: 'GOLD',
              value: fmtMacroValue(f.gold?.level, 'Gold'),
              chg: f.gold?.chgPct ?? 0,
              unit: '%',
            });

            // OIL
            macroItems.push({
              label: 'OIL',
              value: fmtMacroValue(f.oil?.level, 'Oil'),
              chg: f.oil?.chgPct ?? 0,
              unit: '%',
            });

            // SOX
            macroItems.push({
              label: 'SOX',
              value: fmtMacroValue(f.sox?.level, 'SOX'),
              chg: f.sox?.chgPct ?? 0,
              unit: '%',
            });

            // US 10Y
            macroItems.push({
              label: 'US 10Y',
              value: fmtMacroValue(f.us10y?.level, 'US 10Y'),
              chg: f.us10y?.chgPct ?? 0,
              unit: '',
            });

            // DXY
            macroItems.push({
              label: 'DXY',
              value: fmtMacroValue(f.dxy?.level, 'DOLLAR (DXY)'),
              chg: f.dxy?.chgPct ?? 0,
              unit: '',
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
          const mappedSectors: SectorItem[] = [
            { name: 'Tech', pct: q.XLK?.changePercent ?? 2.1 },
            { name: 'Energy', pct: q.XLE?.changePercent ?? 1.2 },
            { name: 'Cons. Disc', pct: q.XLY?.changePercent ?? 0.9 },
            { name: 'Materials', pct: q.XLB?.changePercent ?? 0.6 },
            { name: 'Industrials', pct: q.XLI?.changePercent ?? 0.4 },
            { name: 'Finance', pct: q.XLF?.changePercent ?? 0.3 },
            { name: 'Healthcare', pct: q.XLV?.changePercent ?? -0.5 },
            { name: 'Utilities', pct: q.XLU?.changePercent ?? -0.8 },
          ];
          setSectors(mappedSectors);

          // 2. Top Movers (Handled dynamically by separate effect hook based on active toggle tab)

          // 3. ETFs (SPY, QQQ, VIX)
          const spyQuote = q.SPY || {};
          const qqqQuote = q.QQQ || {};

          const vixVal = f?.vix?.level ?? 21.5;
          const vixChg = f?.vix?.chgPct ?? -3.1;

          const etfItems: PulseItem[] = [
            {
              sym: 'SPY',
              px: spyQuote.price || DEMO_ETFS[0].px,
              chg: spyQuote.changePercent != null ? spyQuote.changePercent : DEMO_ETFS[0].chg,
              up: (spyQuote.changePercent != null ? spyQuote.changePercent : DEMO_ETFS[0].chg) >= 0,
              spark: DEMO_ETFS[0].spark,
            },
            {
              sym: 'QQQ',
              px: qqqQuote.price || DEMO_ETFS[1].px,
              chg: qqqQuote.changePercent != null ? qqqQuote.changePercent : DEMO_ETFS[1].chg,
              up: (qqqQuote.changePercent != null ? qqqQuote.changePercent : DEMO_ETFS[1].chg) >= 0,
              spark: DEMO_ETFS[1].spark,
            },
            {
              sym: 'VIX',
              px: vixVal,
              chg: vixChg,
              up: vixChg >= 0,
              spark: DEMO_ETFS[2].spark,
            }
          ];
          setEtfs(etfItems);
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
  }, []);

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
            width="28" 
            height="28" 
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

      {/* ══════════════ MARKET PULSE ══════════════ */}
      <div className={s.card}>
        <div className={s.pulseGlow} />
        <div className={s.cardHead}>
          <div className={s.pulseHeaderContainer}>
            <div className={s.pulseHeader}>
              <span className={s.pulseHeaderDecorator}>|</span>
              <span className={s.cardTitle}>Market Pulse</span>
            </div>
            <div className={`${s.pulseLiveBadge} ${!isLive ? s.closed : ''}`}>
              <div className={`${s.pulseDot} ${!isLive ? s.closed : ''}`} />
              <span style={{ fontSize: '10px', fontWeight: '900', color: isLive ? 'var(--cyan)' : '#64748b', letterSpacing: '0.08em', lineHeight: 1 }}>
                {isLive ? 'LIVE' : 'CLOSED'}
              </span>
            </div>
          </div>
        </div>
        {loading ? (
          <div className={s.skelPulse} style={{ height: '232px' }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* ── Futures Row (NASDAQ100 F, Russell2k F, S&P500 F) ── */}
            <div className={s.pulseRow}>
              {futures.map((p) => (
                <div key={p.sym} className={`${s.pulseCard} ${checkIsItemActive(p.sym) ? s.live : ''} ${p.up ? s.up : s.down}`}>
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
            <div className={s.pulseRow}>
              {indices.map((p) => {
                const proxySym = p.sym === 'DOW' ? 'DIA'
                               : p.sym === 'NASDAQ' ? 'QQQ'
                               : p.sym === 'S&P 500' ? 'SPY'
                               : '';
                const wsData = wsGetPrice(proxySym);
                
                // Overlay change if available
                const displayChg = wsData && wsData.changePct != null ? wsData.changePct : p.chg;
                const isUp = displayChg >= 0;
                
                // Flash animation class
                const flashClass = wsData ? (flashStates[proxySym] === 'up' ? s.flashUp : flashStates[proxySym] === 'down' ? s.flashDown : '') : '';

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
            <div className={s.pulseRow}>
              {etfs.map((p) => {
                const wsData = wsGetPrice(p.sym);
                
                // Overlay price & change if available
                const displayPx = wsData && wsData.price > 0 ? wsData.price : p.px;
                const displayChg = wsData && wsData.changePct != null ? wsData.changePct : p.chg;
                const isUp = displayChg >= 0;
                
                // Flash animation class
                const flashClass = wsData ? (flashStates[p.sym] === 'up' ? s.flashUp : flashStates[p.sym] === 'down' ? s.flashDown : '') : '';

                return (
                  <div key={p.sym} className={`${s.pulseCard} ${checkIsItemActive(p.sym) ? s.live : ''} ${isUp ? s.up : s.down} ${flashClass}`}>
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
        )}
      </div>

      {/* ══════════════ MACRO BOARD ══════════════ */}
      <div className={s.card}>
        <div className={s.cardHead}>
          <div className={s.pulseHeader}>
            <span className={s.pulseHeaderDecorator}>|</span>
            <span className={s.cardTitle}>Macro Board</span>
          </div>
        </div>
        {loading ? (
          <div className={s.skelMacro} />
        ) : (
          <div className={s.macroGrid}>
            {macro.map((m) => (
              <div key={m.label} className={`${s.macroCell} ${checkIsItemActive(m.label) ? s.live : ''}`}>
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
        )}
      </div>

      {/* ══════════════ SECTOR HEATMAP ══════════════ */}
      <div className={s.card}>
        <div className={s.cardHead}>
          <span className={s.cardTitle}>SECTOR HEATMAP</span>
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
              const displayPct = wsData && wsData.changePct != null ? wsData.changePct : sec.pct;
              const flashClass = wsData ? (flashStates[symbol] === 'up' ? s.flashUp : flashStates[symbol] === 'down' ? s.flashDown : '') : '';

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
                  <span className={`${s.sectorPct} ${displayPct >= 0 ? s.pos : s.neg}`}>
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
          title="Institutional Pulse"
          subtitle={<>Volatility regime + dark-pool flow map, updating <span style={{ color: 'var(--amber)' }}><b>right now</b></span>.</>}
          teaser={{
            label: 'INSTITUTIONAL · 1 OF 4 FREE',
            value: volRegime?.regime || 'COILING'
          }}
          socialProof={locale === 'ko' ? '오늘 14.2K 잠금해제' : locale === 'ja' ? '本日14.2Kがロック解除' : '14.2K unlocked today'}
          lockedPreview={
            <div className={s.instPulseGrid} style={{ opacity: 0.12, padding: '0', filter: 'blur(2.5px)', gap: '10px' }} aria-hidden="true">
              {/* 1 */}
              <div className={s.instCell}>
                <span className={s.instLabel}>Volatility Regime</span>
                <div className={s.instValRow}>
                  <span className={s.instVal}>COILING</span>
                  <span className={s.instSub}>38%</span>
                </div>
                <div className={s.instTrack}>
                  <div className={s.instFill} style={{ width: '38%', background: 'var(--cyan)' }} />
                </div>
              </div>
              {/* 2 */}
              <div className={s.instCell}>
                <span className={s.instLabel}>Dark Pool Volume</span>
                <div className={s.instValRow}>
                  <span className={s.instVal}>42.5%</span>
                  <span className={s.instSub}>$8.5B</span>
                </div>
                <div className={s.instTrack}>
                  <div className={s.instFill} style={{ width: '42.5%', background: 'var(--green)' }} />
                </div>
              </div>
              {/* 3 */}
              <div className={s.instCell}>
                <span className={s.instLabel}>Squeeze Risk</span>
                <div className={s.instValRow}>
                  <span className={s.instVal}>LOW</span>
                  <span className={s.instSub}>34%</span>
                </div>
                <div className={s.instTrack}>
                  <div className={s.instFill} style={{ width: '34%', background: '#ec4899' }} />
                </div>
              </div>
              {/* 4 */}
              <div className={s.instCell}>
                <span className={s.instLabel}>Rotation Intensity</span>
                <div className={s.instValRow}>
                  <span className={s.instVal}>NEUTRAL</span>
                  <span className={s.instSub}>50%</span>
                </div>
                <div className={s.instTrack}>
                  <div className={s.instFill} style={{ width: '50%', background: 'var(--amber)' }} />
                </div>
              </div>
            </div>
          }
        >
          {loading ? (
            <div style={{ height: '180px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', margin: '16px' }} />
          ) : (
            <div className={s.instPulseGrid} style={{ padding: '0', gap: '10px' }}>
              {/* 1. Volatility Regime */}
              <div 
                className={s.instCell} 
                style={{ 
                  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6) 0%, rgba(30, 41, 59, 0.4) 100%)',
                  border: '1px solid rgba(34, 211, 238, 0.15)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25), 0 0 8px rgba(34, 211, 238, 0.05)',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={s.instLabel} style={{ color: 'var(--cyan)', fontSize: '9px', fontWeight: 'bold' }}>Volatility Regime</span>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>{locale === 'ko' ? '시장의 날씨' : locale === 'ja' ? '市場のウェザー' : 'Market Weather'}</span>
                </div>
                <div className={s.instValRow} style={{ marginTop: '4px' }}>
                  <span className={s.instVal} style={{ fontSize: '16px', textShadow: '0 0 8px rgba(34, 211, 238, 0.3)' }}>{volRegime?.regime || 'COILING'}</span>
                  <span className={s.instSub} style={{ fontSize: '11px', color: 'var(--cyan)' }}>{volRegime?.score || 38}%</span>
                </div>
                <div className={s.instTrack} style={{ marginTop: '6px', height: '4px', background: 'rgba(255,255,255,0.05)' }}>
                  <div 
                    className={s.instFill} 
                    style={{ 
                      height: '100%',
                      width: `${volRegime?.score || 38}%`, 
                      background: (volRegime?.score || 38) >= 75 ? 'linear-gradient(90deg, var(--red) 0%, #ff4b4b 100%)' : (volRegime?.score || 38) >= 50 ? 'linear-gradient(90deg, var(--amber) 0%, #ffb84d 100%)' : 'linear-gradient(90deg, var(--cyan) 0%, #00f0ff 100%)',
                      boxShadow: (volRegime?.score || 38) >= 75 ? '0 0 8px var(--red)' : (volRegime?.score || 38) >= 50 ? '0 0 8px var(--amber)' : '0 0 8px var(--cyan)'
                    }} 
                  />
                </div>
              </div>

              {/* 2. Dark Pool Volume */}
              <div 
                className={s.instCell} 
                style={{ 
                  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6) 0%, rgba(30, 41, 59, 0.4) 100%)',
                  border: '1px solid rgba(16, 185, 129, 0.15)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25), 0 0 8px rgba(16, 185, 129, 0.05)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={s.instLabel} style={{ color: 'var(--green)', fontSize: '9px', fontWeight: 'bold' }}>Dark Pool Volume</span>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>{locale === 'ko' ? '기관 비밀 거래' : locale === 'ja' ? '機関取引フロー' : 'Institutional Flow'}</span>
                </div>
                <div className={s.instValRow} style={{ marginTop: '4px' }}>
                  <span className={s.instVal} style={{ fontSize: '16px', color: 'var(--green)', textShadow: '0 0 8px rgba(16, 185, 129, 0.3)' }}>{darkPoolFlow?.percent || 42.5}%</span>
                  <span className={s.instSub} style={{ fontSize: '11px', color: '#a3e635' }}>
                    DP {darkPoolFlow?.volume ? (darkPoolFlow.volume >= 1e6 ? `${(darkPoolFlow.volume / 1e6).toFixed(1)}M` : `${(darkPoolFlow.volume / 1e3).toFixed(1)}K`) : '—'}
                  </span>
                </div>
                <div className={s.instTrack} style={{ marginTop: '6px', height: '4px', background: 'rgba(255,255,255,0.05)' }}>
                  <div 
                    className={s.instFill} 
                    style={{ 
                      height: '100%',
                      width: `${darkPoolFlow?.percent || 42.5}%`, 
                      background: 'linear-gradient(90deg, var(--green) 0%, #10b981 100%)',
                      boxShadow: '0 0 8px var(--green)'
                    }} 
                  />
                </div>
              </div>

              {/* 3. Gamma Squeeze Risk */}
              <div 
                className={s.instCell} 
                style={{ 
                  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6) 0%, rgba(30, 41, 59, 0.4) 100%)',
                  border: '1px solid rgba(236, 72, 153, 0.15)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25), 0 0 8px rgba(236, 72, 153, 0.05)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={s.instLabel} style={{ color: '#ec4899', fontSize: '9px', fontWeight: 'bold' }}>Squeeze Risk</span>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>{locale === 'ko' ? '주가 폭발력' : locale === 'ja' ? 'スクイーズリスク' : 'Squeeze Risk'}</span>
                </div>
                <div className={s.instValRow} style={{ marginTop: '4px' }}>
                  <span className={s.instVal} style={{ fontSize: '16px', color: '#f43f5e', textShadow: '0 0 8px rgba(244, 63, 94, 0.3)' }}>{gammaSqueeze?.risk || 'LOW'}</span>
                  <span className={s.instSub} style={{ fontSize: '11px', color: '#fda4af' }}>{gammaSqueeze?.score || 34}%</span>
                </div>
                <div className={s.instTrack} style={{ marginTop: '6px', height: '4px', background: 'rgba(255,255,255,0.05)' }}>
                  <div 
                    className={s.instFill} 
                    style={{ 
                      height: '100%',
                      width: `${gammaSqueeze?.score || 34}%`, 
                      background: 'linear-gradient(90deg, #ec4899 0%, #f43f5e 100%)',
                      boxShadow: '0 0 8px #ec4899'
                    }} 
                  />
                </div>
              </div>

              {/* 4. Sector Rotation Intensity */}
              <div 
                className={s.instCell} 
                style={{ 
                  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6) 0%, rgba(30, 41, 59, 0.4) 100%)',
                  border: '1px solid rgba(234, 179, 8, 0.15)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25), 0 0 8px rgba(234, 179, 8, 0.05)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={s.instLabel} style={{ color: 'var(--amber)', fontSize: '9px', fontWeight: 'bold' }}>Rotation Intensity</span>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>{locale === 'ko' ? '공격/수비 전환' : locale === 'ja' ? 'ローテーション' : 'Rotation'}</span>
                </div>
                <div className={s.instValRow} style={{ marginTop: '4px' }}>
                  <span className={s.instVal} style={{ fontSize: '16px', color: 'var(--amber)', textShadow: '0 0 8px rgba(245, 158, 11, 0.3)' }}>{sectorRotation?.direction || 'NEUTRAL'}</span>
                  <span className={s.instSub} style={{ fontSize: '11px', color: '#fde047' }}>{sectorRotation?.score || 50}%</span>
                </div>
                <div className={s.instTrack} style={{ marginTop: '6px', height: '4px', background: 'rgba(255,255,255,0.05)' }}>
                  <div 
                    className={s.instFill} 
                    style={{ 
                      height: '100%',
                      width: `${sectorRotation?.score || 50}%`, 
                      background: 'linear-gradient(90deg, var(--amber) 0%, #fbbf24 100%)',
                      boxShadow: '0 0 8px var(--amber)'
                    }} 
                  />
                </div>
              </div>
            </div>
          )}
        </ValueWall>

      {/* ══════════════ TOP MOVERS ══════════════ */}
      <div className={s.sectionHead}>
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
          onClick={() => router.push('/app-view/movers')}
          style={{ cursor: 'pointer' }}
        >
          VIEW ALL &gt;
        </span>
      </div>
      {loading || moversLoading ? (
        <div className={s.skelMovers}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={s.skelMoverCard} />
          ))}
        </div>
      ) : (
        <div className={s.moversScroll}>
          {movers.map((mv) => {
            const wsData = wsGetPrice(mv.sym);

            // Overlay price & change if available
            const displayPx = wsData && wsData.price > 0 ? wsData.price.toFixed(2) : mv.px;
            const displayChg = wsData && wsData.changePct != null 
              ? `${wsData.changePct >= 0 ? '+' : ''}${wsData.changePct.toFixed(2)}%`
              : mv.chg;
            const isUp = displayChg.startsWith('+');

            // Flash animation class
            const flashClass = wsData ? (flashStates[mv.sym] === 'up' ? s.flashUp : flashStates[mv.sym] === 'down' ? s.flashDown : '') : '';

            return (
              <div key={mv.sym} className={`${s.moverCard} ${flashClass}`}>
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
