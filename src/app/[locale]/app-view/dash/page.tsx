'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Sparkline } from '@/components/app/Sparkline';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import n9 from './dash9.module.css';   // 시안(e9) <style> 원본
import { AdBanner } from '@/components/app/AdBanner';
import { useAdUnlockGate } from '@/components/app/ValueWall';
import { IAP_LIVE } from '@/config/iap';
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

/* ── 9차: 오늘의 발견 / 괴리 시그널 ──────────────────────────────
   둘 다 /api/undercurrent/feed 한 콜에서 나온다(실측 0.67s · 16KB · 카드 12).
   발견 = money.darkPoolStealth(0~100) + darkPoolRegime
   괴리 = divergence:true 인 카드 (뉴스 방향과 돈 방향이 어긋난 것)
   ★ 값이 없는 카드는 «빼고», 지어내지 않는다. */
interface UcMoney {
  darkPoolStealth?: number | null;
  darkPoolRegime?: string | null;
  darkPoolPct?: number | null;
  darkPoolMarketAvg?: number | null;
  darkPoolDate?: string | null;
}
interface UcCard {
  ticker: string;
  tag?: string;
  plainTitle?: string;
  moneyRead?: string;
  moneyMood?: string;
  divergence?: boolean;
  hasMoneyData?: boolean;
  money?: UcMoney | null;
  source?: string;
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
  if (idx?.dow) items.push({ sym: 'DOW', px: idx.dow.price, chg: idx.dow.changePct, up: idx.dow.changePct >= 0, spark: [] });
  if (idx?.nasdaq) items.push({ sym: 'NASDAQ', px: idx.nasdaq.price, chg: idx.nasdaq.changePct, up: idx.nasdaq.changePct >= 0, spark: [] });
  if (idx?.spx) items.push({ sym: 'S&P 500', px: idx.spx.price, chg: idx.spx.changePct, up: idx.spx.changePct >= 0, spark: [] });
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


/* ── SPDR 8섹터 아이콘 (9차) ───────────────────────────────────────
   ★ components/intel/mobile/SectorIcon.tsx 는 «인텔 10섹터»(M7·반도체·바이오…)용이라
     여기 SPDR 8섹터와 분류 체계가 다르다. 그래서 따로 둔다 — 재사용하면 안 된다.
   섹터 색은 셀 배경(heatBg)이 이미 등락을 칠하므로, 아이콘은 currentColor 로
   이름과 같은 톤을 쓴다. 색을 두 번 쓰면 화면이 튄다. */
const SECTOR_ICON: Record<string, string> = {
  Tech:          '<rect x="7.8" y="7.8" width="8.4" height="8.4" rx="1.5"/><path d="M10 3.8v4M14 3.8v4M10 16.2v4M14 16.2v4M3.8 10h4M3.8 14h4M16.2 10h4M16.2 14h4"/>',
  Industrials:   '<path d="M3.4 20.6V11l5.6 3.4V11l5.6 3.4V7.2l5.6 3.8v9.6z"/><path d="M7.6 20.6v-3.2M12.4 20.6v-3.2M17.2 20.6v-3.2"/>',
  Utilities:     '<path d="M12.8 2.8L5.8 13.4h5.2l-.9 7.8 7.3-10.4H12z"/>',
  Materials:     '<path d="M12 3l7.8 4.4v8.8L12 20.6l-7.8-4.4V7.4z"/><path d="M4.2 7.4L12 11.8l7.8-4.4M12 11.8v8.8"/>',
  Finance:       '<path d="M3.4 10.6h17.2M5.8 10.6v7M9.6 10.6v7M14.2 10.6v7M18 10.6v7M2.8 20.4h18.4M12 3.6l9 5.2H3z"/>',
  Energy:        '<path d="M12 3.6c3.5 4.5 5.4 6.9 5.4 9.5a5.4 5.4 0 1 1-10.8 0c0-2.6 1.9-5 5.4-9.5z"/>',
  Healthcare:    '<circle cx="12" cy="12" r="7.8"/><path d="M12 8.4v7.2M8.4 12h7.2"/>',
  'Cons. Disc':  '<circle cx="9.8" cy="19.4" r="1.4"/><circle cx="17.4" cy="19.4" r="1.4"/><path d="M2.8 3.8h2.6l2.4 11h9.8l2.6-6.8H6.2"/>',
};

/* SPDR 8섹터 이름 — 앱은 ko/en/ja 를 다 서비스하는데 여기만 영어로 나가고 있었다.
   키는 API 가 주는 영어 이름 그대로 두고, 표시만 로케일로 바꾼다. */
const SECTOR_LABEL: Record<string, { ko: string; en: string; ja: string }> = {
  Tech:          { ko: '기술',       en: 'Tech',        ja: 'テクノロジー' },
  Energy:        { ko: '에너지',     en: 'Energy',      ja: 'エネルギー' },
  'Cons. Disc':  { ko: '임의소비재', en: 'Cons. Disc.', ja: '一般消費財' },
  Materials:     { ko: '소재',       en: 'Materials',   ja: '素材' },
  Industrials:   { ko: '산업재',     en: 'Industrials', ja: '資本財' },
  Finance:       { ko: '금융',       en: 'Financials',  ja: '金融' },
  Healthcare:    { ko: '헬스케어',   en: 'Health Care', ja: 'ヘルスケア' },
  Utilities:     { ko: '유틸리티',   en: 'Utilities',   ja: '公益' },
};

function sectorLabel(name: string, locale: string) {
  const m = SECTOR_LABEL[name];
  if (!m) return name;
  return locale === 'ko' ? m.ko : locale === 'ja' ? m.ja : m.en;
}

/* 시안(e9)의 섹터 색 — 아이콘 칩에만 쓴다.
   셀 배경은 heatBg 가 등락으로 칠하므로 색을 두 번 쓰지 않는다. */
const SECTOR_COLOR: Record<string, string> = {
  Tech: '#22d3ee', Industrials: '#34d399', Utilities: '#a3e635', Materials: '#94a3b8',
  Finance: '#60a5fa', Energy: '#fb923c', Healthcare: '#f472b6', 'Cons. Disc': '#c084fc',
};

/* 섹터 → SPDR ETF 심볼 (WS 오버레이용). 예전엔 렌더 안에 삼항 8단으로 있었다. */
const SECTOR_ETF: Record<string, string> = {
  Tech: 'XLK', Energy: 'XLE', 'Cons. Disc': 'XLY', Materials: 'XLB',
  Industrials: 'XLI', Finance: 'XLF', Healthcare: 'XLV', Utilities: 'XLU',
};

/* 매크로 8종 — 시안 sim9 macroFull 의 ic/c 를 그대로. 옛 s.macroBadgeIcon(색 원)이 아니다. */
const MACRO_IC: Record<string, { c: string; ic: string; tx?: string }> = {
  'BTC':    { c: '#f7931a', ic: '', tx: '\u20BF' },
  'GOLD':   { c: '#fbbf24', ic: '<path d="M3.4 18.4h17.2l-2.2-6H5.6z"/><path d="M7 12.4l1.6-4.8h6.8l1.6 4.8"/>' },
  'OIL':    { c: '#cbd5e1', ic: '<path d="M12 3.6c3.5 4.5 5.4 6.9 5.4 9.5a5.4 5.4 0 1 1-10.8 0c0-2.6 1.9-5 5.4-9.5z"/>' },
  'SOX':    { c: '#22d3ee', ic: '<rect x="7.8" y="7.8" width="8.4" height="8.4" rx="1.5"/><path d="M10 3.8v4M14 3.8v4M10 16.2v4M14 16.2v4M3.8 10h4M3.8 14h4M16.2 10h4M16.2 14h4"/>' },
  'US 10Y': { c: '#a78bfa', ic: '<rect x="4.6" y="3.4" width="14.8" height="17.2" rx="2.2"/><path d="M8.2 8.2h7.6M8.2 12h7.6M8.2 15.8h4.4"/>' },
  'DXY':    { c: '#34d399', ic: '', tx: '$' },
  '2S10S':  { c: '#818cf8', ic: '<path d="M3 15.4c4.2 0 6-8 10-8s4.4 5 8 5"/><path d="M3 19.6h18"/>' },
  'F&G':    { c: '#60a5fa', ic: '<path d="M4.4 17.4a7.6 7.6 0 1 1 15.2 0"/><path d="M12 17.4l4.2-5.4"/><circle cx="12" cy="17.4" r="1.2"/>' },
};

/* 지수 뱃지 — 시안 idxCard 의 {code, full, bg, fg}. 선물 3종은 시안 값 그대로,
   현물·ETF 3종씩은 같은 규칙으로 이어 붙였다(코드 3자 이내 · 지수색). */
/* 게이트 4신호 색 — 시안 signals[].c */
const GATE_SIG_C = ['#22d3ee', '#a78bfa', '#fbbf24', '#34d399'];

const IX_BADGE: Record<string, { code: string; full: string; bg: string; fg: string }> = {
  'NASDAQ100 F': { code: 'N',   full: 'NASDAQ 100',   bg: '#1b3a6b', fg: '#8fc2ff' },
  'S&P500 F':    { code: '500', full: 'S&P 500',      bg: '#6b1f2a', fg: '#ffb4b4' },
  'Russell2k F': { code: 'R2K', full: 'RUSSELL 2000', bg: '#17456b', fg: '#8fd4ff' },
  'NASDAQ':      { code: 'N',   full: 'NASDAQ',       bg: '#1b3a6b', fg: '#8fc2ff' },
  'S&P 500':     { code: '500', full: 'S&P 500',      bg: '#6b1f2a', fg: '#ffb4b4' },
  'DOW':         { code: 'DJI', full: 'DOW JONES',    bg: '#3a2f6b', fg: '#c0b4ff' },
  'SPY':         { code: 'SPY', full: 'SPDR S&P 500', bg: '#6b1f2a', fg: '#ffb4b4' },
  'QQQ':         { code: 'QQQ', full: 'INVESCO QQQ',  bg: '#1b3a6b', fg: '#8fc2ff' },
  'VIX':         { code: 'VIX', full: 'VOLATILITY',   bg: '#5c3a12', fg: '#ffce85' },
};

/* 빠른 진입 3칸 — 시안 e9 의 QUICK 그대로. 목적지는 실재하는 곳만 건다. */
function QUICK9(t: { qDark: string; qUnusual: string; qEarn: string }) {
  return [
    { key: 'darkpool', c: '#a78bfa', to: '/app-view/rankings?tab=postclose', label: t.qDark, dest: 'RANKING',
      ico: '<path d="M3 8.5c3-2.6 6-2.6 9 0s6 2.6 9 0M3 14c3-2.6 6-2.6 9 0s6 2.6 9 0M3 19.5c3-2.6 6-2.6 9 0s6 2.6 9 0"/>' },
    { key: 'unusual', c: '#22d3ee', to: '/app-view/rankings?tab=intraday', label: t.qUnusual, dest: 'RANKING',
      ico: '<circle cx="7.6" cy="15" r="4.2"/><circle cx="16.4" cy="15" r="4.2"/><path d="M7.6 10.8V5.4l3-2M16.4 10.8V5.4l-3-2M11.2 15h1.6"/>' },
    { key: 'earnings', c: '#fbbf24', to: '/app-view/earnings', label: t.qEarn, dest: 'NEW', nw: true,
      ico: '<rect x="3.2" y="5" width="17.6" height="15.8" rx="2.4"/><path d="M3.2 10h17.6M8 3v4M16 3v4"/><circle cx="9" cy="14.4" r="1.1"/><circle cx="15" cy="14.4" r="1.1"/>' },
  ];
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
  // ★★ [2026-09-04] macro·sectors·briefing 만 «준비 가드»가 없었다.
  //   지수·선물·ETF 는 *Ready 로 스켈레톤을 보여 주는데, 이 셋은 첫 페인트에
  //   DEMO 상수를 그대로 그렸다 — 화면엔 «오늘의 섹터 히트맵»처럼 보이는
  //   2.1 / 1.2 / 0.9 … 가 떴고 그건 소스에 박아 둔 숫자였다.
  //   빈칸은 «없다»고 말하지만 가짜 숫자는 «있다»고 거짓말한다.
  const [macro, setMacro] = useState<MacroItem[]>(DEMO_MACRO);
  const [macroReady, setMacroReady] = useState(false);
  /* 9차: 매크로 8칸이 항상 2줄을 차지했다. 4칸만 보이고 나머지는 그 자리에서 펼친다.
     — 「전체 ›」 로 내보내지 않는다. 목적지 페이지가 없고, 10줄짜리는 페이지가 안 된다. */
  const [macroOpen, setMacroOpen] = useState(false);
  /* 9차: 선물·현물·ETF 3줄(9카드)이 첫 화면을 다 먹었다. 탭으로 한 줄만 보인다.
     ★ 각 줄의 로직(WS 오버레이·플래시·세션 판정)은 손대지 않고 «표시 여부»만 감싼다. */
  const [pulseTab, setPulseTab] = useState<'futures' | 'cash' | 'etf'>('futures');

  /* 9차 신규 — 오늘의 발견 · 괴리 시그널 (둘 다 UC 피드 한 콜) */
  const [ucCards, setUcCards] = useState<UcCard[]>([]);
  const [ucReady, setUcReady] = useState(false);
  const [ucMeta, setUcMeta] = useState<{ marketAvg: number | null; date: string | null }>({ marketAvg: null, date: null });
  const [sectors, setSectors] = useState<SectorItem[]>(DEMO_SECTORS);
  const [sectorsReady, setSectorsReady] = useState(false);
  const [briefingReady, setBriefingReady] = useState(false);
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
      social: '14.2K unlocked today',
      teaserUnit: '1 of 4',
      signals: {
        instFlow: { label: 'New Positioning', kicker: 'Options opened yesterday', insight: 'Open-interest additions — invisible during the session.' },
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
    social: '14.2K unlocked today',
    teaserUnit: '1 of 4',
    signals: {
      instFlow: { label: 'New Positioning', kicker: 'Options opened yesterday', insight: 'Open-interest additions — invisible during the session.' },
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

  const adGate = useAdUnlockGate(locale);
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
              // ⚠️ 2026-09-05: `t.spark || [5,6,7,8,9]` 였다. 그런데 API 가 항상 상수
              //    배열을 줬으므로(movers/route.ts 옛 getSpark) 이 폴백은 애초에
              //    걸리지도 않았고, 화면엔 «오늘의 흐름»처럼 보이는 가짜 선이 떴다.
              //    이제 실측이 없으면 빈 배열 → 아래 렌더가 선을 그리지 않는다.
              spark: Array.isArray(t.spark) && t.spark.length >= 2 ? t.spark : []
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
        const [, macroRes, briefingRes, quotesRes, premiumRes, indexRes, newsRes, ucRes] = await Promise.allSettled([
          fetch('/api/live/market'),
          fetch('/api/market/macro'),
          fetch(`/api/guardian/briefing?locale=${locale}`),
          fetch('/api/live/quotes?symbols=XLK,XLE,XLY,XLB,XLI,XLF,XLV,XLU,SPY,QQQ', { cache: 'no-store' }),
          fetch(`/api/live/premium-metrics?locale=${locale}`),
          fetch('/api/market/index-close', { cache: 'no-store' }),
          fetch(`/api/guardian/news-digest?locale=${locale}`),
          // 9차: 발견 + 괴리를 한 콜로. SWR 이라 보통 stale hit 으로 즉시 온다.
          fetch(`/api/undercurrent/feed?locale=${locale}`),
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
          // ★★ [2026-09-04] 값이 없으면 **그 줄을 만들지 않는다.**
          //   예전엔 `?? 19850.50` 처럼 하드코딩 숫자로 메웠다. 화면엔 «—» 가 아니라
          //   그럴듯한 지수가 떴고, 대표는 그게 오늘 시세인 줄 알 수밖에 없었다.
          //   가짜 숫자는 빈칸보다 나쁘다 — 빈칸은 «없다»고 말하지만
          //   가짜 숫자는 «있다»고 거짓말한다.
          const pushFuture = (sym: string, f: any) => {
            const px = Number(f?.level);
            const chg = Number(f?.chgPct);
            if (!Number.isFinite(px) || px <= 0) return;   // 값이 없으면 줄 자체를 뺀다
            out.push({
              sym,
              px,
              chg: Number.isFinite(chg) ? chg : 0,
              up: (Number.isFinite(chg) ? chg : 0) >= 0,
              // ★ 지어낸 곡선 제거(9차). 예전엔 DEMO_FUTURES[n].spark 라는 «형태 상수»를
              //   실제 가격·등락률 옆에 붙여 그렸다 — 화면은 «오늘의 흐름»처럼 보이는데
              //   실제로는 매일 같은 모양이었다. 이 페이로드엔 일중 시계열이 없다.
              spark: [],
              ...feedMetaForItem(f, globexLive, { requireFresh: false }),
            });
          };
          pushFuture('NASDAQ100 F', fac?.nasdaq100);
          pushFuture('S&P500 F', fac?.spx);
          pushFuture('Russell2k F', fac?.rut);
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
            }
            // ⚠️ 못 재면 **아무것도 넣지 않는다.** 예전엔 DEMO_MACRO[6](+0.25 STEEP)을
            //   밀어 넣어 «오늘의 장단기 금리차»인 것처럼 보였다.

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
            if (macroItems.length > 0) setMacroReady(true);
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
          setSectorsReady(true);
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
                spark: [],
                live: equityExtendedLive,
              },
              {
                sym: 'QQQ',
                px: qqqQuote.price || prevQqq?.px || DEMO_ETFS[1].px,
                chg: qqqChg,
                up: qqqChg >= 0,
                spark: [],
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
                  spark: [],
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
              setBriefingReady(true);
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

        // ── 9차: 오늘의 발견 + 괴리 시그널 (UC 피드 한 콜) ──────────────
        if (ucRes && ucRes.status === 'fulfilled' && ucRes.value.ok) {
          try {
            const uc = await ucRes.value.json();
            const cards: UcCard[] = Array.isArray(uc?.cards) ? uc.cards : [];
            if (cards.length) {
              setUcCards(cards);
              setUcReady(true);
              // 시장 평균·기준일은 카드 안에 실려 온다 — 없으면 «없는 채로» 둔다.
              const withMoney = cards.find((c) => c.money?.darkPoolMarketAvg != null);
              setUcMeta({
                marketAvg: withMoney?.money?.darkPoolMarketAvg ?? null,
                date: withMoney?.money?.darkPoolDate ?? null,
              });
            }
          } catch {
            // silent fail — 섹션 자체가 안 그려진다(빈 껍데기를 남기지 않는다)
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

  /* ── 9차 문구 — 시안(e9)의 L9 를 그대로 옮겼다 ─────────────────── */
  const c9 = ({
    ko: {
      tagline: 'DARK POOL INTEL', secIdx: '지수', tFut: '선물', tCash: '현물', tEtf: 'ETF',
      idxNote: '지금 움직이는 건 선물뿐 — 현물·ETF는 마감값입니다.',
      idxNoteLive: '정규장 진행 중 — 선물·현물·ETF 모두 실시간입니다.',
      secMacro: '매크로', mcMore: (n: number) => `${n}개 더 보기`, mcLess: '접기',
      secSector: '섹터', heat: '히트맵',
      secDisc: '오늘의 발견', discAll: '랭킹 11종',
      discName: '은밀 축적·분산',
      discWhat: '장외 물량은 늘었는데, 그 물량 중 공매도 비중은 줄었다.',
      secGate: '기관이 어제 깔아둔 것',
      secMv: '가장 많이 움직인 것', all: '전체', mvVal: '거래대금', mvUp: '상승률', mvDn: '하락률',
      secDv: '괴리 시그널', dvSub: '뉴스와 돈이 반대로 움직이는 곳',
      secQuick: '빠른 진입',
      qDark: '다크풀 흐름', qUnusual: '이상 옵션 플로우', qEarn: '실적 캘린더',
      marketAvg: '시장 평균',
      discTally: (a: number, d: number) => `축적 상위 ${a} · 분산 ${d}`,
      gateN: (f: number, n: number) => `무료 ${f} / ${n}`, free: '무료',
      proOr: '또는', proNote: '광고 없이 항상 열림',
      ftLegal: '교육 및 리서치용 시장 데이터입니다. 투자 조언, 매수/매도 권유, 수익 보장이 아니며 모든 판단과 결과는 사용자 본인 책임입니다.',
      ftA: '앱 이용약관', ftB: '앱 개인정보처리방침', ftS: '지원: contact@signumhq.com',
    },
    en: {
      tagline: 'DARK POOL INTEL', secIdx: 'Indices', tFut: 'Futures', tCash: 'Cash', tEtf: 'ETF',
      idxNote: 'Only futures are trading now — cash and ETFs show the close.',
      idxNoteLive: 'Regular session is open — futures, cash and ETFs are all live.',
      secMacro: 'Macro', mcMore: (n: number) => `Show ${n} more`, mcLess: 'Show less',
      secSector: 'Sectors', heat: 'Heatmap',
      secDisc: "Today's Find", discAll: 'All 11 rankings',
      discName: 'Stealth Accumulation',
      discWhat: 'Off-exchange volume rose, while the short share of that volume fell.',
      secGate: 'What institutions set up yesterday',
      secMv: 'Biggest Movers', all: 'View all', mvVal: 'Value', mvUp: 'Gainers', mvDn: 'Losers',
      secDv: 'Divergence', dvSub: 'Where the news and the money disagree',
      secQuick: 'Quick Access',
      qDark: 'Dark Pool Flow', qUnusual: 'Unusual Options Flow', qEarn: 'Earnings Calendar',
      marketAvg: 'Market avg',
      discTally: (a: number, d: number) => `${a} accumulating · ${d} distributing`,
      gateN: (f: number, n: number) => `${f} of ${n} free`, free: 'FREE',
      proOr: 'or', proNote: 'Always open, no ads',
      ftLegal: 'Market data for education and research only. Not investment advice, not a buy/sell recommendation, and no accuracy or return is guaranteed.',
      ftA: 'App Terms', ftB: 'App Privacy', ftS: 'Support: contact@signumhq.com',
    },
    ja: {
      tagline: 'DARK POOL INTEL', secIdx: '指数', tFut: '先物', tCash: '現物', tEtf: 'ETF',
      idxNote: '今動いているのは先物のみ — 現物・ETFは終値です。',
      idxNoteLive: '通常取引中 — 先物・現物・ETFすべてリアルタイムです。',
      secMacro: 'マクロ', mcMore: (n: number) => `他${n}件を表示`, mcLess: '折りたたむ',
      secSector: 'セクター', heat: 'ヒートマップ',
      secDisc: '今日の発見', discAll: 'ランキング11種',
      discName: '隠れた蓄積・分散',
      discWhat: '場外の出来高は増えたが、そのうち空売り比率は下がった。',
      secGate: '機関が昨日仕込んだもの',
      secMv: '最も動いた銘柄', all: 'すべて', mvVal: '売買代金', mvUp: '上昇率', mvDn: '下落率',
      secDv: '乖離シグナル', dvSub: 'ニュースとカネが逆を向く場所',
      secQuick: 'クイックアクセス',
      qDark: 'ダークプールの流れ', qUnusual: '異常オプションフロー', qEarn: '決算カレンダー',
      marketAvg: '市場平均',
      discTally: (a: number, d: number) => `蓄積 上位${a} · 分散${d}`,
      gateN: (f: number, n: number) => `無料 ${f} / ${n}`, free: '無料',
      proOr: 'または', proNote: '広告なしで常に開く',
      ftLegal: '教育およびリサーチ目的の市場データです。投資助言、売買推奨、収益保証ではなく、すべての判断と結果は利用者本人の責任です。',
      ftA: 'アプリ利用規約', ftB: 'アプリプライバシー', ftS: 'サポート: contact@signumhq.com',
    },
  } as const)[locale as 'ko' | 'en' | 'ja'] ?? ({} as never);

  /* ── 9차 파생 ─────────────────────────────────────────────────
     발견: stealth 값이 있는 카드만, 높은 순. 12개라 정렬 비용은 무시할 수준.
     괴리: divergence:true 인 카드만.
     ★ 둘 다 «값이 없으면 행을 빼는» 규칙. 0 으로 채우지 않는다. */
  const discoveryRows = ucCards
    .filter((c) => typeof c.money?.darkPoolStealth === 'number')
    .sort((a, b) => (b.money!.darkPoolStealth as number) - (a.money!.darkPoolStealth as number))
    .slice(0, 5);
  const divergenceRows = ucCards.filter((c) => c.divergence).slice(0, 6);
  /* 매크로 «작동 중» = 그 지표의 «장이 열려 있는 시간»(대표 지시).
     값이 바뀔 때만 깜빡이면 안 보고 있을 때 지나가 버린다 — 라이브 표시가 목적이다.
     판정은 이미 있는 checkIsItemActive 를 쓴다(BTC 24/7 · GOLD·OIL Globex ·
     DXY FX 24/5 · US 10Y 채권시간 · SOX 정규장 · 2S10S·F&G 는 일 1회 산출이라 항상 꺼짐).
     시계 기반이라 30초마다 다시 그려 장 시작·마감에 저절로 켜지고 꺼진다. */
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClockTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const discAcc = discoveryRows.filter((c) => (c.money?.darkPoolRegime || '').toUpperCase() === 'ACCUMULATION').length;
  const discDis = discoveryRows.filter((c) => (c.money?.darkPoolRegime || '').toUpperCase() === 'DISTRIBUTION').length;
  const regimeLabel = (r?: string | null) => {
    const k = (r || '').toUpperCase();
    if (k === 'ACCUMULATION') return locale === 'ko' ? '축적' : locale === 'ja' ? '蓄積' : 'ACCUM';
    if (k === 'DISTRIBUTION') return locale === 'ko' ? '분산' : locale === 'ja' ? '分散' : 'DISTR';
    return locale === 'ko' ? '중립' : locale === 'ja' ? '中立' : 'NEUT';
  };
  const regimeClass = (r?: string | null) => {
    const k = (r || '').toUpperCase();
    return k === 'ACCUMULATION' ? s.discAcc : k === 'DISTRIBUTION' ? s.discDis : s.discNeu;
  };

  /* 기관 게이트 — 페이월 로직은 손대지 않고 그대로 옮겼다 */

  /* ── Render — 시안(e9) 마크업 그대로. 데이터만 꽂는다. ─────────────
     ★ 손으로 다시 설계하지 않는다. 클래스는 dash9.module.css(시안 <style> 원본).
       상태·이펙트·파생 계산은 위 본문 그대로 쓰고 여기서는 그리기만 한다. */
  const idxItems = pulseTab === 'futures' ? futures
                 : pulseTab === 'cash'    ? sortPulse(indices, PULSE_INDEX_ORDER)
                 : sortPulse(etfs, PULSE_ETF_ORDER);
  const idxReady = pulseTab === 'futures' ? futuresReady
                 : pulseTab === 'cash'    ? indicesReady
                 : etfsReady;
  const topNews = newsItems[tickerIndex];
  const verdictKey = !regimeReady ? 'mix' : riskScore >= 58 ? 'on' : riskScore <= 42 ? 'off' : 'mix';

  return (
    <div className={`${n9.e9Wrap} ${n9.e9Root} ${s.page}`} data-v={verdictKey}>

      {/* ① 판정 히어로 ─ 시안 e9Hero */}
      <div className={n9.e9Hero}>
        <div className={n9.e9Sky} />
        <img className={n9.e9Earth} src="/dash/earth.webp" alt="" aria-hidden="true"
             width={672} height={672} decoding="async" />
        <div className={n9.e9Veil} />
        <div className={n9.e9In}>

          <div className={n9.e9Hdr}>
            <div className={n9.e9Brand}>
              <img className={n9.e9Logo} src="/signum-sg-vectorized.svg" alt="" width={32} height={32} />
              <div>
                <div className={n9.e9Name}>SIGNUM<i>HQ</i></div>
                <div className={n9.e9Tag}>{c9.tagline}</div>
              </div>
            </div>
            <div className={n9.e9Acts}>
              <button
                type="button"
                className={n9.e9Act}
                aria-label="Settings"
                onClick={() => router.push(`/${locale}/app-view/settings`)}
              >
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
              </button>
            </div>
          </div>

          {/* TOP SIGNAL — 실제 뉴스 티커. 뉴스가 없으면 줄 자체를 안 그린다. */}
          {topNews && (
            <div
              className={n9.e9Signal}
              role="button"
              tabIndex={0}
              onClick={() => router.push('/app-view/guardian?tab=reality')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push('/app-view/guardian?tab=reality'); } }}
            >
              <svg className={n9.e9Bolt} viewBox="0 0 24 24"><path d="M13 2L5 13.5h6L10 22l8.5-11.5H12z" /></svg>
              <span className={n9.e9SigLab}>TOP SIGNAL</span>
              <span className={n9.e9SigBar} />
              <span className={n9.e9SigTx}>
                {(locale === 'ko' && topNews.summaryKR) ? topNews.summaryKR
                  : (locale === 'ja' && topNews.summaryJP) ? topNews.summaryJP
                  : (topNews.summaryEN || topNews.headline)}
              </span>
              <span className={n9.e9Age}>
                {topNews.ageMinutes < 60 ? `${topNews.ageMinutes}m` : `${Math.round(topNews.ageMinutes / 60)}h`}
              </span>
              <span className={n9.e9Chev}>&#8250;</span>
            </div>
          )}

          {/* ② 마켓 스테이터스 */}
          <div className={`${n9.e9Surf} ${n9.e9Status}`}>
            {regimeReady && (
              <>
                <img className={n9.e9Bull} src="/dash/bull.webp" alt="" aria-hidden="true"
                     width={264} height={237} decoding="async" />
                <img className={n9.e9Bear} src="/dash/bear.webp" alt="" aria-hidden="true"
                     width={264} height={280} decoding="async" />
              </>
            )}
            <div className={n9.e9StatusIn}>
              <div className={n9.e9Eyebrow}><s />MARKET STATUS</div>
              <div className={n9.e9Verdict}>{regimeReady ? riskTone : '—'}</div>
              <div className={n9.e9Say}>{pulseStatusNote}</div>
              <div className={n9.e9Cells}>
                <div className={`${n9.e9Cell} ${futuresAvg < 0 ? n9.dn : ''}`}>
                  <div className={n9.e9CellL}>{copy.futures}</div>
                  <div className={`${n9.e9CellV} num`}>{futuresReady ? fmtChg(futuresAvg) : '—'}</div>
                </div>
                <div className={`${n9.e9Cell} ${cashAvg < 0 ? n9.dn : ''}`}>
                  <div className={n9.e9CellL}>{copy.cash}</div>
                  <div className={`${n9.e9CellV} num`}>{indicesReady ? fmtChg(cashAvg) : '—'}</div>
                </div>
                <div className={n9.e9Cell}>
                  <div className={n9.e9CellL}>{copy.risk}</div>
                  <div className={`${n9.e9CellV} num`}>
                    {regimeReady ? Math.round(riskScore) : '—'}<s> /100</s>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ③ 지수 — 페이지가 없으므로 「전체 ›」를 그리지 않는다 */}
      <div className={n9.e9Sect}>
        <div className={n9.e9SectHead}>
          <span className={n9.e9SectT}>{c9.secIdx}</span>
          {(isLive || futuresLive || volatilityLive) && (
            <span className={n9.e9Live}><s />LIVE</span>
          )}
        </div>
        <div className={n9.e9IxTabs}>
          {([['futures', c9.tFut], ['cash', c9.tCash], ['etf', c9.tEtf]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`${n9.e9Tab} ${pulseTab === k ? n9.on : ''}`}
              aria-pressed={pulseTab === k}
              onClick={() => setPulseTab(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={n9.e9Ixs}>
          {!idxReady
            ? [0, 1, 2].map((i) => <div key={`skx-${i}`} className={`${n9.e9Skel} ${n9.e9SkelIx}`} />)
            : idxItems.map((p) => {
                const wsData = wsGetPrice(p.sym);
                const useWs = shouldUseWsQuote(p.sym, wsData);
                const px = useWs ? wsData.price : p.px;
                const chg = useWs ? wsData.changePct : p.chg;
                const up = chg >= 0;
                return (
                  <div key={p.sym} suppressHydrationWarning
                       className={`${n9.e9Ix} ${up ? n9.gr : n9.rd}`}>
                    <span className={n9.e9IxTop}>
                      <span className={n9.e9IxBadge}
                            style={{ background: IX_BADGE[p.sym]?.bg || '#1b2b45',
                                     color: IX_BADGE[p.sym]?.fg || '#9fb4d0' }}>
                        {IX_BADGE[p.sym]?.code || p.sym.slice(0, 3)}
                      </span>
                      <span className={n9.e9IxName}>{IX_BADGE[p.sym]?.full || p.sym}</span>
                    </span>
                    <span className={`${n9.e9IxV} num`}>
                      {p.noData && !useWs ? '—' : p.sym === 'VIX' ? px.toFixed(2) : fmtPrice(px)}
                    </span>
                    <span className={`${n9.e9IxP} num ${up ? n9.gr : n9.rd}`}>
                      {p.noData && !useWs ? '—' : <>{up ? '▲' : '▼'} {up ? '+' : ''}{chg.toFixed(2)}%</>}
                    </span>
                  </div>
                );
              })}
        </div>
        <div className={n9.e9Note}>{isLive ? c9.idxNoteLive : c9.idxNote}</div>
      </div>

      {/* ④ 매크로 — 지수와 같은 «좌표»라 붙인다. 링크 대신 인라인 펼침 */}
      <div className={`${n9.e9Sect} ${n9.e9MacWrap} ${macroOpen ? n9.open : ''}`}>
        <div className={n9.e9SectHead}><span className={n9.e9SectT}>{c9.secMacro}</span></div>
        <div className={`${n9.e9Surf} ${n9.e9Macro}`}>
          {!macroReady
            ? [0, 1, 2, 3].map((i) => <div key={`skm-${i}`} className={`${n9.e9Skel} ${n9.e9SkelRow}`} />)
            : (macroOpen ? macro : macro.slice(0, 4)).map((m) => (
                <div key={m.label} suppressHydrationWarning className={n9.e9Mc}
                     style={{ ['--c' as string]: MACRO_IC[m.label]?.c || '#94a3b8' }}>
                  <div className={n9.e9McTop}>
                    <span className={n9.e9McIco}>
                      {MACRO_IC[m.label]?.tx
                        ? <b>{MACRO_IC[m.label].tx}</b>
                        : <svg viewBox="0 0 24 24" aria-hidden="true"
                               dangerouslySetInnerHTML={{ __html: MACRO_IC[m.label]?.ic || '' }} />}
                    </span>
                    <span className={n9.e9McK}>{m.label}</span>
                    {/* 지표별 «도는 표시» — 그 지표의 값이 바뀔 때만 자기 점이 뛴다.
                        매크로 안에서도 도는 것(BTC·SOX)과 안 도는 것(2s10s·F&G)이 갈린다. */}
                    <i suppressHydrationWarning aria-hidden="true"
                       className={`${n9.e9McDot} ${itemSessionLive(m.label) ? n9.on : ''}`} />
                  </div>
                  <div className={`${n9.e9McV} num`}>{m.value}</div>
                  {m.badge
                    ? <em className={n9.e9McB}>{m.badge}</em>
                    : <div className={`${n9.e9McD} num ${m.chg > 0 ? n9.gr : m.chg < 0 ? n9.rd : ''}`}>
                        {m.chg > 0 ? '+' : ''}{m.chg !== 0 ? m.chg.toFixed(2) : '—'}{m.unit}
                      </div>}
                </div>
              ))}
        </div>
        {macroReady && macro.length > 4 && (
          <button type="button" className={n9.e9McMore} onClick={() => setMacroOpen((v) => !v)} aria-expanded={macroOpen}>
            <s>{macroOpen ? c9.mcLess : c9.mcMore(macro.length - 4)}</s>
            <i>&#9662;</i>
          </button>
        )}
      </div>

      {/* ⑤ 섹터 */}
      <div className={n9.e9Sect}>
        <div className={n9.e9SectHead}>
          <span className={n9.e9SectT}>{c9.secSector}</span>
          <span suppressHydrationWarning className={n9.e9Badge}>{sectorSessionLabel}</span>
          <span
            className={n9.e9All}
            role="button"
            tabIndex={0}
            onClick={() => router.push('/app-view/heatmap')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push('/app-view/heatmap'); } }}
          >
            {c9.heat} &#8250;
          </span>
        </div>
        <div className={n9.e9Scs}>
          {!sectorsReady
            ? [0, 1, 2, 3].map((i) => <div key={`sks-${i}`} className={`${n9.e9Skel} ${n9.e9SkelSc}`} />)
            : sectors.map((sec) => {
                const symbol = SECTOR_ETF[sec.name] || '';
                const wsData = wsGetPrice(symbol);
                const useWs = shouldUseWsQuote(symbol, wsData);
                const stale = useWs && Math.abs(wsData.changePct) < 0.0001 && Math.abs(sec.pct) >= 0.0001;
                const pct = useWs && !stale ? wsData.changePct : sec.pct;
                return (
                  <div key={sec.name} className={n9.e9Sc}
                       style={{ ['--c' as string]: SECTOR_COLOR[sec.name] || '#94a3b8' }}>
                    <span className={n9.e9ScTop}>
                      <span className={n9.e9ScIco}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"
                             dangerouslySetInnerHTML={{ __html: SECTOR_ICON[sec.name] || '' }} />
                      </span>
                      <span className={n9.e9ScN}>{sectorLabel(sec.name, locale)}</span>
                    </span>
                    <span className={`${n9.e9ScP} num ${pct > 0 ? n9.gr : pct < 0 ? n9.rd : n9.mut}`}>
                      {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
        </div>
      </div>

      {/* ⑥ 오늘의 발견 */}
      {ucReady && discoveryRows.length > 0 && (
        <div className={n9.e9Sect}>
          <div className={n9.e9SectHead}>
            <span className={n9.e9SectT}>{c9.secDisc}</span>
            <span className={n9.e9All} role="button" tabIndex={0}
                  onClick={() => router.push('/app-view/rankings')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push('/app-view/rankings'); } }}>
              {c9.discAll} &#8250;
            </span>
          </div>
          <div className={`${n9.e9Surf} ${n9.e9Disc}`}>
            <div className={n9.e9DiscTop}>
              <span className={n9.e9DiscTag}>DARK POOL</span>
              <span className={n9.e9DiscName}>{c9.discName}</span>
              {ucMeta.date && <span className={`${n9.e9DiscDate} num`}>{ucMeta.date}</span>}
            </div>
            <div className={n9.e9DiscWhat}>{c9.discWhat}</div>
            <div className={n9.e9DiscRows}>
              {discoveryRows.map((c) => {
                const v = c.money!.darkPoolStealth as number;
                const reg = (c.money?.darkPoolRegime || '').toUpperCase();
                return (
                  <a key={c.ticker}
                     className={`${n9.e9Dr} ${reg === 'ACCUMULATION' ? n9.acc : reg === 'DISTRIBUTION' ? n9.dis : n9.neu}`}
                     role="button" tabIndex={0}
                     onClick={() => router.push(`/app-view/cmd?t=${c.ticker}`)}
                     onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/app-view/cmd?t=${c.ticker}`); } }}>
                    <AppTickerLogo symbol={c.ticker} size={18} />
                    <b className={n9.e9DrT}>{c.ticker}</b>
                    <span className={n9.e9DrBar}>
                      <i className={n9.e9DrFill} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
                      {ucMeta.marketAvg != null && (
                        <i className={n9.e9DrMed} style={{ left: `${Math.max(0, Math.min(100, ucMeta.marketAvg))}%` }} />
                      )}
                    </span>
                    <b className={`${n9.e9DrV} num`}>{v}</b>
                    <em className={n9.e9DrReg}>{regimeLabel(c.money?.darkPoolRegime)}</em>
                  </a>
                );
              })}
            </div>
            <div className={n9.e9DiscFoot}>
              <span>{c9.discTally(discAcc, discDis)}</span>
              {ucMeta.marketAvg != null && (
                <span className="num">{c9.marketAvg} {ucMeta.marketAvg}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ⑦ 게이트 — 시안 e9Gate 그대로. 결제·광고 «동작»은 useAdUnlockGate(=ValueWall 과 같은 코드). */}
      <div className={n9.e9Sect}>
        <div className={n9.e9SectHead}><span className={n9.e9SectT}>{c9.secGate}</span></div>
        <div className={`${n9.e9Surf} ${n9.e9Gate}`}>
          <div className={n9.e9GateTop}>
            <span className={n9.e9GateT}>{gateCopy.title}</span>
            <span className={n9.e9GateN}>
              {adGate.isUnlocked ? c9.gateN(4, 4) : c9.gateN(1, 4)}
            </span>
          </div>
          <div className={n9.e9Sigs}>
            {institutionalSignals.map((sig, i) => {
              const open = adGate.isUnlocked || i === 0;
              return (
                <div key={sig.key}
                     className={`${n9.e9Sig} ${open ? n9.open : n9.locked}`}
                     style={{ ['--c' as string]: GATE_SIG_C[i] }}>
                  <div className={n9.e9SigTop}>
                    <span className={n9.e9SigT}>{sig.label}</span>
                    {open
                      ? <span className={n9.e9Free}>{c9.free}</span>
                      : <svg className={n9.e9Lock} viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="5" y="10.5" width="14" height="10" rx="2.2" />
                          <path d="M8.4 10.5V7.8a3.6 3.6 0 0 1 7.2 0v2.7" />
                        </svg>}
                  </div>
                  <div className={n9.e9SigH}>{sig.kicker}</div>
                  {open ? (
                    <>
                      <div className={n9.e9SigV}><b>{sig.value}</b><em>{sig.sub}</em></div>
                      <div className={n9.e9SigLine}>{sig.insight}</div>
                    </>
                  ) : (
                    <>
                      <div className={n9.e9SigV}>
                        <i className={`${n9.e9Bar} ${n9.w1}`} /><i className={`${n9.e9Bar} ${n9.w2}`} />
                      </div>
                      <div className={n9.e9SigLine}><i className={`${n9.e9Bar} ${n9.w3}`} /></div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {!adGate.isUnlocked && (
            <>
              <button type="button" className={n9.e9Cta}
                      onClick={adGate.handleUnlockPress} disabled={adGate.unlocking}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.5v11l9-5.5z" /></svg>
                {adGate.unlocking ? adGate.copy.modalWaitPrefix : gateCopy.cta}
              </button>

              {/* ★ 구독 진입점 — 시안에는 없는 요소다(시안 작성 시점엔 IAP 가 없었다).
                  기존 ValueWall(cmd·flow·가디언)은 이 블록을 갖고 있는데 9차 게이트를
                  다시 만들며 빠뜨렸다. 없으면 IAP 를 켜는 순간 «첫 화면만» 구독 버튼이
                  없는 상태가 되고, 애플이 요구하는 «구매 복원»도 사라진다.
                  ⚠️ 가격은 절대 쓰지 않는다 — 스토어가 준 값만 페이월이 보여준다
                     (한국은 ₩13,000 이라 $9.99 로 쓰면 표시 위반).
                  순서: 무료(광고)가 1순위, 구독은 2순위. 유료를 필수처럼 보이게 하지 않는다. */}
              {IAP_LIVE && (
                <>
                  <div className={n9.e9ProOr}><s />{c9.proOr}<s /></div>
                  <button type="button" className={n9.e9ProCta}
                          onClick={adGate.openPaywall}
                          disabled={adGate.purchasing || adGate.unlocking}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 3.2l2.5 5.4 5.9.5-4.5 3.9 1.4 5.8L12 15.7 6.7 18.8l1.4-5.8-4.5-3.9 5.9-.5z" />
                    </svg>
                    <b>{adGate.purchasing ? adGate.copy.modalWaitPrefix : adGate.copy.proCta}</b>
                    <em>{c9.proNote}</em>
                  </button>
                  {adGate.proError && (
                    <div className={n9.e9ProErr} role="alert">{adGate.copy.proErrorLabel}</div>
                  )}
                  {adGate.proNothing && (
                    <div className={`${n9.e9ProErr} ${n9.mut}`} role="status">{adGate.copy.proNothingLabel}</div>
                  )}
                  <button type="button" className={n9.e9ProRestore}
                          onClick={adGate.handleRestore} disabled={adGate.purchasing}>
                    {adGate.copy.proRestoreLabel}
                  </button>
                </>
              )}
            </>
          )}
          <div className={n9.e9GateSub}>{gateCopy.subtitle}</div>
          <div className={n9.e9GateLegal}>{adGate.copy.legalNote}</div>
        </div>
        {adGate.portals}
      </div>

      {/* ⑧ 가장 많이 움직인 것 — 페이지가 실재하므로 「전체 ›」 유지 */}
      <div className={n9.e9Sect}>
        <div className={n9.e9SectHead}>
          <span className={n9.e9SectT}>{c9.secMv}</span>
        </div>
        <div className={n9.e9MvTabs}>
          {([['value', c9.mvVal], ['gainers', c9.mvUp], ['losers', c9.mvDn]] as const).map(([k, label]) => (
            <button key={k} type="button"
                    className={`${n9.e9Tab} ${moverSort === k ? n9.on : ''}`}
                    aria-pressed={moverSort === k}
                    onClick={() => setMoverSort(k)}>
              {label}
            </button>
          ))}
          {/* «전체 ›» 는 탭과 같은 줄 끝에 — 제목 줄에 있으면 탭과 동떨어져 보인다(대표 지적) */}
          <span className={`${n9.e9All} ${n9.e9TabAll}`} role="button" tabIndex={0}
                onClick={() => router.push('/app-view/movers')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push('/app-view/movers'); } }}>
            {c9.all} &#8250;
          </span>
        </div>
        <div className={`${n9.e9Surf} ${n9.e9Mvs}`}>
          {(loading || moversLoading)
            ? [0, 1, 2, 3].map((i) => <div key={`skv-${i}`} className={`${n9.e9Skel} ${n9.e9SkelRow}`} />)
            : movers.map((mv, mi) => {
                const wsData = wsGetPrice(mv.sym);
                const useWs = shouldUseWsQuote(mv.sym, wsData);
                const displayPx = useWs ? wsData.price.toFixed(2) : mv.px;
                const displayChg = useWs
                  ? `${wsData.changePct >= 0 ? '+' : ''}${wsData.changePct.toFixed(2)}%`
                  : mv.chg;
                const isUp = displayChg.startsWith('+');
                return (
                  <a key={mv.sym} className={n9.e9Mv} role="button" tabIndex={0}
                     onClick={() => router.push(`/app-view/cmd?t=${mv.sym}`)}
                     onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/app-view/cmd?t=${mv.sym}`); } }}>
                    <span className={`${n9.e9MvRank} num`}>{mi + 1}</span>
                    <AppTickerLogo symbol={mv.sym} size={18} />
                    <b className={n9.e9MvT}>{mv.sym}</b>
                    {/* 실측 곡선이 있을 때만 그린다 — 없으면 자리만 비워 둔다 */}
                    {mv.spark.length >= 2
                      ? <svg className={n9.e9MvSpark} viewBox="0 0 76 20" preserveAspectRatio="none">
                          <polyline
                            points={mv.spark.map((v, i, a) => {
                              const mn = Math.min(...a), mx = Math.max(...a), rg = mx - mn || 1;
                              return `${(i / (a.length - 1)) * 76},${20 - ((v - mn) / rg) * 16 - 2}`;
                            }).join(' ')}
                            fill="none" stroke={isUp ? '#34d399' : '#f87171'} strokeWidth="1.5" strokeLinejoin="round" />
                        </svg>
                      : <span className={n9.e9MvSpark} />}
                    <b className={`${n9.e9MvP} num ${isUp ? n9.gr : n9.rd}`}>{displayChg}</b>
                    <span className={`${n9.e9MvPx} num`}>${displayPx}</span>
                  </a>
                );
              })}
        </div>
      </div>

      {/* ⑨ 괴리 시그널 */}
      {ucReady && divergenceRows.length > 0 && (
        <div className={n9.e9Sect}>
          <div className={n9.e9SectHead}>
            <span className={n9.e9SectT}>{c9.secDv}</span>
            <span className={`${n9.e9DivN} num`}>{divergenceRows.length}</span>
          </div>
          <div className={n9.e9DivSub}>{c9.dvSub}</div>
          <div className={n9.e9Divs}>
            {divergenceRows.map((c) => (
              <a key={c.ticker} className={n9.e9Dv} role="button" tabIndex={0}
                 onClick={() => router.push(`/app-view/cmd?t=${c.ticker}`)}
                 onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/app-view/cmd?t=${c.ticker}`); } }}>
                <span className={n9.e9DvTop}>
                  <AppTickerLogo symbol={c.ticker} size={16} />
                  <span className={n9.e9DvT}>{c.ticker}</span>
                  {c.tag && <span className={n9.e9DvTag}>{c.tag}</span>}
                </span>
                {c.plainTitle && <span className={n9.e9DvTitle}>{c.plainTitle}</span>}
                {c.moneyRead && (
                  <span className={`${n9.e9DvMoney} ${c.moneyMood === 'cautious' ? n9.rd : n9.gr}`}>
                    {c.moneyRead}
                  </span>
                )}
                {c.source && <span className={n9.e9DvSrc}>{c.source}</span>}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ⑩ 빠른 진입 — 나가는 문은 다 읽은 다음 */}
      <div className={n9.e9Sect}>
        <div className={n9.e9SectHead}><span className={n9.e9SectT}>{c9.secQuick}</span></div>
        <div className={`${n9.e9Surf} ${n9.e9Quick}`}>
          {QUICK9(c9).map((q) => (
            <a key={q.key} className={n9.e9Q} style={{ ['--c' as string]: q.c }}
               role="button" tabIndex={0}
               onClick={() => router.push(q.to)}
               onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(q.to); } }}>
              <span className={n9.e9QIco}>
                <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: q.ico }} />
              </span>
              <span className={n9.e9QT}>{q.label}</span>
              <span className={`${n9.e9QDest} ${q.nw ? n9.nw : ''}`}>{q.dest}</span>
              <span className={n9.e9Chev}>&#8250;</span>
            </a>
          ))}
        </div>
      </div>

      {/* 광고 배너 · 푸터 — 건드리지 않는다 */}
      {/* 푸터 — 시안 e9Foot. 목적지는 기존 그대로(약관·개인정보·지원). */}
      <div className={n9.e9Foot}>
        <div className={n9.e9FootLegal}>{c9.ftLegal}</div>
        <div className={n9.e9FootRow}>
          <Link href="/app-view/terms">{c9.ftA}</Link>
          <Link href="/app-view/privacy">{c9.ftB}</Link>
          <span>{c9.ftS}</span>
        </div>
        <div className={n9.e9Copy}>© 2026 SIGNUM HQ. ALL RIGHTS RESERVED.</div>
      </div>
      <AdBanner />
    </div>
  );
}
