'use client';

import { useState, useEffect, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { Sparkline } from '@/components/app/Sparkline';
import { AdBanner } from '@/components/app/AdBanner';
import { ValueWall } from '@/components/app/ValueWall';
import { useMarketStatus } from '@/hooks/useMarketStatus';
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

const DEMO_ETFS: PulseItem[] = [
  { sym: 'SPY', px: 542.30, chg: 0.82, up: true, spark: [5, 5, 6, 5, 7, 8, 7, 9, 10] },
  { sym: 'QQQ', px: 470.15, chg: 1.24, up: true, spark: [4, 5, 5, 6, 6, 8, 9, 9, 11] },
  { sym: 'VIX', px: 21.5, chg: -3.1, up: false, spark: [11, 10, 11, 9, 8, 8, 7, 6, 6] },
];

const DEMO_MACRO: MacroItem[] = [
  { label: 'US 10Y', value: '4.25%', chg: -0.03, unit: '' },
  { label: 'DXY', value: '104.2', chg: 0.1, unit: '' },
  { label: 'BTC', value: '$68.5K', chg: 2.1, unit: '%' },
  { label: 'GOLD', value: '$2,340', chg: -0.4, unit: '%' },
  { label: 'OIL', value: '$72.3', chg: 1.2, unit: '%' },
  { label: 'R2K', value: '2,180', chg: -0.5, unit: '%' },
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
  if (label === 'Russell 2K') return level.toLocaleString('en-US', { maximumFractionDigits: 0 });
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
    case 'R2K':
      return (
        <span className={`${s.macroBadgeIcon} ${s.r2kBadge}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 17v-4h3a2 2 0 0 0 0-4H9V5" />
            <path d="M12 13l4 4" />
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

export default function AppDashPage() {
  const locale = useLocale();
  const { status: marketStatusInfo } = useMarketStatus();
  const isLive = marketStatusInfo?.session === 'regular' && !marketStatusInfo?.isHoliday;
  const [loading, setLoading] = useState(true);
  const [indices, setIndices] = useState<PulseItem[]>(DEMO_INDICES);
  const [etfs, setEtfs] = useState<PulseItem[]>(DEMO_ETFS);
  const [macro, setMacro] = useState<MacroItem[]>(DEMO_MACRO);
  const [sectors, setSectors] = useState<SectorItem[]>(DEMO_SECTORS);
  const [movers, setMovers] = useState<MoverItem[]>(DEMO_MOVERS);
  const [briefing, setBriefing] = useState<string>(DEMO_BRIEFING);
  const [volRegime, setVolRegime] = useState<{ regime: string; score: number } | null>({ regime: 'COILING', score: 38 });
  const [darkPoolFlow, setDarkPoolFlow] = useState<{ percent: number; value: number } | null>({ percent: 42.5, value: 8500000000 });

  /* ── Fetch live data from APIs ── */
  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      try {
        const [marketRes, macroRes, briefingRes, quotesRes, volRes, dpRes, indexRes] = await Promise.allSettled([
          fetch('/api/live/market'),
          fetch('/api/market/macro'),
          fetch(`/api/guardian/briefing?locale=${locale}`),
          fetch('/api/live/quotes?symbols=XLK,XLE,XLY,XLB,XLI,XLF,XLV,XLU,NVDA,TSLA,AAPL,AMD,SPY,QQQ'),
          fetch('/api/live/volatility-regime?t=SPY'),
          fetch('/api/flow/dark-pool-trades?ticker=SPY&limit=1'),
          fetch('/api/market/index-close'),
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
            const macroItems: MacroItem[] = [];

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

            // Russell 2K
            macroItems.push({
              label: 'R2K',
              value: fmtMacroValue(f.rut?.level, 'Russell 2K'),
              chg: f.rut?.chgPct ?? 0,
              unit: '%',
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

          // 2. Top Movers
          const moverSymbols = ['NVDA', 'TSLA', 'AAPL', 'AMD'];
          const mappedMovers: MoverItem[] = moverSymbols.map(sym => {
            const quote = q[sym] || {};
            const pctVal = quote.changePercent ?? 0;
            const sign = pctVal >= 0 ? '+' : '';
            const demoMover = DEMO_MOVERS.find(d => d.sym === sym);
            return {
              sym,
              px: quote.price ? quote.price.toFixed(2) : (demoMover?.px ?? '0.00'),
              chg: `${sign}${pctVal.toFixed(2)}%`,
              up: pctVal >= 0,
              spark: demoMover?.spark ?? [5, 6, 7, 8, 9]
            };
          });
          setMovers(mappedMovers);

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
              setBriefing(html);
            }
          }
        }

        // ── Volatility Regime ──
        if (volRes.status === 'fulfilled' && volRes.value.ok) {
          const vData = await volRes.value.json();
          setVolRegime({ regime: vData.regime || 'COILING', score: vData.regimeScore ?? 38 });
        }

        // ── Dark Pool Flow ──
        if (dpRes.status === 'fulfilled' && dpRes.value.ok) {
          const dpData = await dpRes.value.json();
          setDarkPoolFlow({ percent: dpData.darkPoolPercent ?? 42.5, value: dpData.totalDarkPoolValue ?? 8500000000 });
        }
      } catch {
        // silently fall back to demo data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, []);

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
          <button className={s.headerBtn} aria-label="Notifications">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className={s.headerBtn} aria-label="Settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2Z" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </div>
      </header>

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
          <div className={s.skelPulse} style={{ height: '144px' }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* ── Indices Row (DOW, NASDAQ, S&P 500) ── */}
            <div className={s.pulseRow}>
              {indices.map((p) => (
                <div key={p.sym} className={`${s.pulseCard} ${isLive ? s.live : ''} ${p.up ? s.up : s.down}`}>
                  <div className={s.pulseCardSymRow}>
                    {getSymBadge(p.sym)}
                    <span className={s.pulseSym}>{p.sym}</span>
                  </div>
                  <span className={s.pulsePrice}>{fmtPrice(p.px)}</span>
                  <span className={`${s.pulseChg} ${p.up ? s.pos : s.neg}`} style={{ width: 'fit-content' }}>
                    {p.up ? '▲' : '▼'} {fmtChg(Math.abs(p.chg))}
                  </span>
                  <div className={s.pulseSparkline}>
                    <Sparkline data={p.spark} up={p.up} />
                  </div>
                </div>
              ))}
            </div>

            {/* ── ETFs Row (SPY, QQQ, VIX) ── */}
            <div className={s.pulseRow}>
              {etfs.map((p) => (
                <div key={p.sym} className={`${s.pulseCard} ${isLive ? s.live : ''} ${p.up ? s.up : s.down}`}>
                  <div className={s.pulseCardSymRow}>
                    {getSymBadge(p.sym)}
                    <span className={s.pulseSym}>{p.sym}</span>
                  </div>
                  <span className={s.pulsePrice}>
                    {p.sym === 'VIX' ? p.px.toFixed(2) : `$${fmtPrice(p.px)}`}
                  </span>
                  <span className={`${s.pulseChg} ${p.up ? s.pos : s.neg}`} style={{ width: 'fit-content' }}>
                    {p.up ? '▲' : '▼'} {fmtChg(Math.abs(p.chg))}
                  </span>
                  <div className={s.pulseSparkline}>
                    <Sparkline data={p.spark} up={p.up} />
                  </div>
                </div>
              ))}
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
              <div key={m.label} className={`${s.macroCell} ${isLive ? s.live : ''}`}>
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
            {sectors.map((sec) => (
              <div
                key={sec.name}
                className={s.sectorCell}
                style={{
                  background: heatBg(sec.pct),
                  borderColor: heatBorder(sec.pct),
                }}
              >
                <span className={s.sectorName}>{sec.name}</span>
                <span className={`${s.sectorPct} ${sec.pct >= 0 ? s.pos : s.neg}`}>
                  {sec.pct >= 0 ? '+' : ''}{sec.pct.toFixed(1)}%
                </span>
              </div>
            ))}
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
          <div className={s.briefingHeader}>
            <span className={s.briefingIcon}>✨</span>
            <span className={s.briefingTitle}>AI MORNING BRIEFING</span>
          </div>
          <div
            className={s.briefingBody}
            dangerouslySetInnerHTML={{ __html: briefing }}
          />
          <div className={s.briefingCta}>Read Full Report →</div>
        </div>
      )}

      {/* ══════════════ INSTITUTIONAL PULSE (PREMIUM) ══════════════ */}
      <div className={s.card} style={{ padding: 0, overflow: 'hidden' }}>
        <ValueWall
          title="Institutional Pulse"
          subtitle={<>Volatility regime + dark-pool flow map, updating <span style={{ color: 'var(--amber)' }}><b>right now</b></span>.</>}
          teaser={{
            label: 'VOL REGIME · 1 OF 4 FREE',
            value: volRegime?.regime || 'COILING'
          }}
          socialProof="14.2K unlocked today"
          lockedPreview={
            <div className={s.instPulseGrid} style={{ opacity: 0.15, padding: '16px', filter: 'blur(2px)' }} aria-hidden="true">
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
            </div>
          }
        >
          {loading ? (
            <div style={{ height: '84px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', margin: '16px' }} />
          ) : (
            <div className={s.instPulseGrid} style={{ padding: '16px' }}>
              {/* Volatility Regime */}
              <div className={s.instCell}>
                <span className={s.instLabel}>Volatility Regime</span>
                <div className={s.instValRow}>
                  <span className={s.instVal}>{volRegime?.regime || 'COILING'}</span>
                  <span className={s.instSub}>{volRegime?.score || 38}%</span>
                </div>
                <div className={s.instTrack}>
                  <div 
                    className={s.instFill} 
                    style={{ 
                      width: `${volRegime?.score || 38}%`, 
                      background: (volRegime?.score || 38) >= 75 ? 'var(--red)' : (volRegime?.score || 38) >= 50 ? 'var(--amber)' : 'var(--cyan)' 
                    }} 
                  />
                </div>
              </div>

              {/* Dark Pool Flow */}
              <div className={s.instCell}>
                <span className={s.instLabel}>Dark Pool Volume</span>
                <div className={s.instValRow}>
                  <span className={s.instVal}>{darkPoolFlow?.percent || 42.5}%</span>
                  <span className={s.instSub}>
                    ${Math.round((darkPoolFlow?.value || 8500000000) / 100000000) / 10}B
                  </span>
                </div>
                <div className={s.instTrack}>
                  <div 
                    className={s.instFill} 
                    style={{ 
                      width: `${darkPoolFlow?.percent || 42.5}%`, 
                      background: 'var(--green)' 
                    }} 
                  />
                </div>
              </div>
            </div>
          )}
        </ValueWall>
      </div>

      {/* ══════════════ TOP MOVERS ══════════════ */}
      <div className={s.sectionHead}>
        <div className={s.sectionLabel}>
          <div className={s.sectionBar} />
          <span className={s.sectionTitle}>TOP MOVERS</span>
        </div>
        <span className={s.sectionAction}>VIEW ALL &gt;</span>
      </div>
      {loading ? (
        <div className={s.skelMovers}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={s.skelMoverCard} />
          ))}
        </div>
      ) : (
        <div className={s.moversScroll}>
          {movers.map((mv) => (
            <div key={mv.sym} className={s.moverCard}>
              <div className={s.moverTop}>
                <span className={s.moverSym}>{mv.sym}</span>
                <span className={mv.up ? s.moverChgUp : s.moverChgDown}>
                  {mv.chg}
                </span>
              </div>
              <span className={s.moverPrice}>${mv.px}</span>
              <div className={s.moverSpark}>
                <Sparkline data={mv.spark} up={mv.up} height={28} fill />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════ AD BANNER ══════════════ */}
      <AdBanner />
    </div>
  );
}
