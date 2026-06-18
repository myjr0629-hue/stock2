'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AdBanner } from '@/components/app/AdBanner';
import { MobileAppFooter } from '@/components/mobile/MobileAppFooter';
import { SwipeableTabs } from '@/components/app/SwipeableTabs';
import { ValueWall } from '@/components/app/ValueWall';
import dashStyles from '../dash/dash.module.css';
import s from '../cmd/cmd.module.css';

import { useMarketStatus } from '@/hooks/useMarketStatus';
import { useLivePrice } from '@/hooks/useLivePrice';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { calcPriceDisplay } from '@/utils/calcPriceDisplay';

/* ═══════════════════════════════════════════════════════════
   3-LANGUAGE LOCALIZATION DICTIONARY
   ═══════════════════════════════════════════════════════════ */

const TRANSLATIONS: Record<string, Record<string, string>> = {
  ko: {
    title: '실시간 옵션 플로우',
    searchPlaceholder: '티커 입력 (예: NVDA)...',
    opiGauge: '옵션 압박 지수 (OPI)',
    pcRatio: 'Volume P/C 비율',
    totalPremium: '총 프리미엄',
    callBullish: 'Call (상승 베팅)',
    putBearish: 'Put (하락 베팅)',
    liveFlow: '실시간 옵션 체인 거래 내역',
    maxPain: '맥스 페인 레벨',
    lockTitle: '기관급 실시간 옵션 체인',
    lockDesc: '30초 광고를 시청하시면 1시간 동안 실시간 옵션 체인 분석 및 맥스페인 레벨을 즉시 잠금 해제합니다.',
    unlockBtn: '광고 시청 후 해제',
    unlockSub: '또는 월 $9.99에 무광고 이용',
    regime: '변동성 모드',
    underlyer: '기초자산 가격',
    whaleRadar: '고래 블록 거래 (Whale Sweep)',
    uoaTitle: '이례적 옵션 거래 폭발 (UOA)',
    darkPoolTitle: '다크풀 & 기관 거래 (Dark Pool & Block Trades)',
    vol: '거래량',
    oi: '미결제약정',
    ratio: '배수',
    whaleLockDesc: '30초 광고를 시청하시면 $100K 이상의 고래 거래 전체 내역과 실시간 다크풀/블록딜 내역을 1시간 동안 해금합니다.',
    opiLabel: '옵션 압박 지수 (OPI)',
    atmIvPctLabel: 'ATM IV 분위수',
    whaleNetBetLabel: '대형 고래 순베팅',
    support: '지지선',
    resistance: '저항선',
    expiry: '만기',
    lowVol: '저변동',
    neutral: '중립',
    highVol: '고변동',
    bullishMomentum: '상방 추세',
    neutralLabel: '중립',
    bearishPressure: '하방 압력',
  },
  en: {
    title: 'Live Options Flow',
    searchPlaceholder: 'Enter ticker (e.g. NVDA)...',
    opiGauge: 'Options Pressure Index (OPI)',
    pcRatio: 'Volume P/C Ratio',
    totalPremium: 'Total Premium',
    callBullish: 'Call (Bullish)',
    putBearish: 'Put (Bearish)',
    liveFlow: 'Live Options Chain Transactions',
    maxPain: 'Max Pain Level',
    lockTitle: 'Institutional Options Flow',
    lockDesc: 'Watch a 30-second video to unlock live options flow and max pain levels for 1 hour.',
    unlockBtn: 'Watch & Unlock',
    unlockSub: 'or subscribe for $9.99/mo — ad free',
    regime: 'Volatility Regime',
    underlyer: 'Underlying Price',
    whaleRadar: 'Whale Sweep Radar',
    uoaTitle: 'Unusual Options Activity (UOA)',
    darkPoolTitle: 'Dark Pool & Block Trades',
    vol: 'Volume',
    oi: 'OI',
    ratio: 'Ratio',
    whaleLockDesc: 'Watch a 30-second video to unlock the full list of Whale Sweeps (>$100K) and Dark Pool & Block Trades for 1 hour.',
    opiLabel: 'Options Pressure Index (OPI)',
    atmIvPctLabel: 'ATM IV Percentile',
    whaleNetBetLabel: 'Whale Net Bet',
    support: 'Support',
    resistance: 'Resistance',
    expiry: 'exp',
    lowVol: 'LOW VOL',
    neutral: 'NEUTRAL',
    highVol: 'HIGH VOL',
    bullishMomentum: 'BULLISH MOMENTUM',
    neutralLabel: 'NEUTRAL',
    bearishPressure: 'BEARISH PRESSURE',
  },
  ja: {
    title: 'リアルタイム・オプション・フロー',
    searchPlaceholder: 'ティッカー入力 (例: NVDA)...',
    opiGauge: 'オプション圧力指数 (OPI)',
    pcRatio: 'Volume P/C比率',
    totalPremium: '総プレミアム',
    callBullish: 'コール (強気)',
    putBearish: 'プット (弱気)',
    liveFlow: 'リアルタイム・オプション・チェーン取引履歴',
    maxPain: 'マックス・ペイン・レベル',
    lockTitle: '機関投資家向けオプション・フロー',
    lockDesc: '30秒の広告を視聴すると、1時間リアルタイム・オプション・フローとマックス・ペインを即座にアンロックします。',
    unlockBtn: '広告を視聴して解除',
    unlockSub: 'または月額 $9.99 で広告なし利用',
    regime: 'ボラティリティ・レジーム',
    underlyer: '原資産価格',
    whaleRadar: 'クジラ大口取引 (Whale Sweep)',
    uoaTitle: '異常オプション取引爆発 (UOA)',
    darkPoolTitle: 'ダークプール & 機関取引 (Dark Pool & Block Trades)',
    vol: '出来高',
    oi: '建玉',
    ratio: '倍率',
    whaleLockDesc: '30秒の動画を視聴すると、1時間$100K以上のクジラ取引全履歴とリアルタイムダークプール・ブロックディール内訳をアンロックできます。',
    opiLabel: 'オプション圧力指数 (OPI)',
    atmIvPctLabel: 'ATM IV パーセンタイル',
    whaleNetBetLabel: 'クジラ純ベット',
    support: 'サポート',
    resistance: 'レジスタンス',
    expiry: '満期',
    lowVol: '低変動',
    neutral: 'ニュートラル',
    highVol: '高変動',
    bullishMomentum: '上昇トレンド',
    neutralLabel: '中立',
    bearishPressure: '下落圧力',
  }
};

/* ═══════════════════════════════════════════════════════════
   DEMO FALLBACK DATA — Always show content even if APIs fail
   ═══════════════════════════════════════════════════════════ */

/* FlowTransaction & DEMO_FLOW — removed (orphan: never read in JSX) */

/* ═══════════════════════════════════════════════════════════
   OPI GAUGE ARC HELPER
   ═══════════════════════════════════════════════════════════ */

function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(' ');
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians)
  };
}

const DEMO_DARK_POOL_TRADES = [
  { id: 'dp-1', exchangeName: 'FINRA ADF', side: 'SELL', size: 1400, price: 209.19, premium: 292866, timeET: '11:31:05' },
  { id: 'dp-2', exchangeName: 'FINRA ADF', side: 'SELL', size: 2100, price: 209.22, premium: 439362, timeET: '11:31:02' },
  { id: 'dp-3', exchangeName: 'FINRA ADF', side: 'SELL', size: 2200, price: 209.26, premium: 460372, timeET: '11:31:00' },
  { id: 'dp-4', exchangeName: 'FINRA ADF', side: 'SELL', size: 2000, price: 209.22, premium: 418440, timeET: '11:30:57' },
  { id: 'dp-5', exchangeName: 'FINRA ADF', side: 'SELL', size: 1000, price: 209.23, premium: 209230, timeET: '11:30:04' },
];

function SparklineBg({ up, seed = 'default' }: { up: boolean; seed?: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const pts = useMemo(() => {
    if (!mounted) return '';
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = seed.charCodeAt(i) + ((h << 5) - h);
    }
    const rand = () => {
      const x = Math.sin(h++) * 10000;
      return x - Math.floor(x);
    };

    const n = 40;
    const vals: number[] = [];
    let v = 50;
    for (let i = 0; i < n; i++) {
      v += (rand() - (up ? 0.42 : 0.58)) * 8;
      v = Math.max(10, Math.min(90, v));
      vals.push(v);
    }
    return vals.map((y, i) => `${(i / (n - 1)) * 100},${100 - y}`).join(' ');
  }, [up, seed, mounted]);

  if (!mounted) {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%"
        style={{ position: 'absolute', inset: 0, opacity: 0 }}>
      </svg>
    );
  }

  const gradId = `sparkGrad-${seed}`;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%"
      style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={up ? 'var(--green)' : 'var(--red)'} stopOpacity="0.15" />
          <stop offset="100%" stopColor={up ? 'var(--green)' : 'var(--red)'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={up ? 'var(--green)' : 'var(--red)'}
        strokeWidth="0.8" opacity="0.4" />
      <polygon points={`0,100 ${pts} 100,100`} fill={`url(#${gradId})`} />
    </svg>
  );
}

export default function AppFlowPage() {
  const locale = useLocale();
  const t = useMemo(() => TRANSLATIONS[locale] || TRANSLATIONS.en, [locale]);
  const tIndicators = useTranslations('indicators');

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [ticker, setTicker] = useState('NVDA');
  const [searchInput, setSearchInput] = useState('NVDA');
  const [loading, setLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Real-time market / price integrations (similar to cmd/page.tsx)
  const { status: marketStatus } = useMarketStatus();
  const livePrice = useLivePrice(ticker, marketStatus.market);
  const { getPrice: wsGetPrice } = useRealtimeData([ticker]);
  const wsPrice = wsGetPrice(ticker);

  // Flow State
  const [tickerData, setTickerData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'ai-intel' | 'whale-flow' | 'strike-profile'>('overview');
  
  const [price, setPrice] = useState(208.19);
  const [change, setChange] = useState(-0.22);
  const [opi, setOpi] = useState(72.4); // 0-100
  const [pcRatio, setPcRatio] = useState(0.68);
  const [totalPrem, setTotalPrem] = useState(18900000); // USD
  const [callPct, setCallPct] = useState(64.5); // %
  const [maxPainVal, setMaxPainVal] = useState(135.0);
  const [volRegime, setVolRegime] = useState('LOADED'); // STABLE, LOADED, ERUPTING
  /* transactions state — removed (orphan: never read in JSX) */
  const [rawChain, setRawChain] = useState<any[]>([]);
  const [darkPoolTrades, setDarkPoolTrades] = useState<any[]>([]);
  const [flowTab, setFlowTab] = useState<'whale' | 'darkpool'>('whale');
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const [minPremium, setMinPremium] = useState(100000); // 100k, 250k, 500k, 1000000

  // Click outside to close popovers
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (activePopover && !(e.target as HTMLElement).closest('.popover-container') && !(e.target as HTMLElement).closest('.info-btn')) {
        setActivePopover(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [activePopover]);

  // Compute display prices via util
  const effectiveSession = marketStatus.isHoliday || marketStatus.market === 'closed'
    ? 'CLOSED'
    : (tickerData?.session || tickerData?.rawTickerData?.session || 'CLOSED').toUpperCase();

  const opiCalculated = useMemo(() => {
    return {
      value: opi,
      isFallback: effectiveSession === 'CLOSED'
    };
  }, [opi, effectiveSession]);

  const liveGammaFlip = tickerData?.premium?.gammaFlip || tickerData?.flow?.gammaFlip || (ticker === 'TSLA' ? '$165.00' : ticker === 'AAPL' ? '$210.00' : '$208.00');

  const { displayPrice, displayChangePct, activeExtPrice, activeExtLabel, activeExtPct } = calcPriceDisplay({
    livePrice: wsPrice?.price || livePrice?.price,
    liveChangePct: wsPrice?.changePct || livePrice?.changePercent,
    liveExtPrice: livePrice?.extendedPrice,
    liveExtChangePct: livePrice?.extendedChangePercent,
    liveExtLabel: livePrice?.extendedLabel
      ? (effectiveSession === 'CLOSED' ? `${livePrice.extendedLabel} (CLOSED)` : livePrice.extendedLabel)
      : undefined,
    apiDisplayPrice: tickerData?.display?.price || tickerData?.rawTickerData?.display?.price || price || 0,
    apiDisplayChangePct: tickerData?.display?.changePctPct || tickerData?.rawTickerData?.display?.changePctPct || change || 0,
    session: effectiveSession,
    prevRegularClose: tickerData?.prices?.prevRegularClose || tickerData?.rawTickerData?.prices?.prevRegularClose || tickerData?.prevClose || null,
    prevClose: tickerData?.prevClose || tickerData?.rawTickerData?.prevClose || null,
    regularCloseToday: tickerData?.prices?.regularCloseToday || tickerData?.rawTickerData?.prices?.regularCloseToday || undefined,
    prevChangePct: tickerData?.prices?.prevChangePct || tickerData?.rawTickerData?.prices?.prevChangePct,
    fallbackChangePct: tickerData?.display?.changePctPct || tickerData?.rawTickerData?.display?.changePctPct || change || 0,
    lastTrade: tickerData?.prices?.lastTrade || tickerData?.rawTickerData?.prices?.lastTrade || price || 0,
    extended: tickerData?.extended || tickerData?.rawTickerData?.extended || {},
    prices: tickerData?.prices || tickerData?.rawTickerData?.prices || {},
  });

  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prevPriceRef = useRef(displayPrice);
  const displayPriceRef = useRef(displayPrice);
  const displayChangePctRef = useRef(displayChangePct);
  const effectiveSessionRef = useRef(effectiveSession);

  // Dynamic Dark Pool / Squeezes
  const dpPct = tickerData?.flow?.darkPoolPct ? (tickerData.flow.darkPoolPct > 1 ? tickerData.flow.darkPoolPct.toFixed(1) : (tickerData.flow.darkPoolPct * 100).toFixed(1)) + '%' : '60.5%';
  
  let dpVolStr = 'DP 18613.5K / 전체 30744.8K';
  if (tickerData?.flow?.darkPoolVol && tickerData?.flow?.darkPoolTotalVol) {
    const v1 = (tickerData.flow.darkPoolVol / 1000).toFixed(1);
    const v2 = (tickerData.flow.darkPoolTotalVol / 1000).toFixed(1);
    dpVolStr = 'DP ' + v1 + 'K / 전체 ' + v2 + 'K';
  }
  
  let dpNetBuyStr = '순매수 -53.5K';
  if (tickerData?.flow?.darkPoolNetBuyVal !== undefined && tickerData?.flow?.darkPoolNetBuyVal !== null) {
    const prefix = tickerData.flow.darkPoolNetBuyVal >= 0 ? '+' : '';
    const val = (tickerData.flow.darkPoolNetBuyVal / 1000).toFixed(1);
    dpNetBuyStr = '순매수 ' + prefix + val + 'K';
  }

  const shortPct = tickerData?.flow?.shortVolPct ? (tickerData.flow.shortVolPct > 1 ? tickerData.flow.shortVolPct.toFixed(1) : (tickerData.flow.shortVolPct * 100).toFixed(1)) + '%' : '45.2%';
  
  let shortVolStr = '공매도 17.8M / 전체 39.5M';
  if (tickerData?.flow?.shortVol && tickerData?.flow?.shortTotalVol) {
    const s1 = (tickerData.flow.shortVol / 1000000).toFixed(1);
    const s2 = (tickerData.flow.shortTotalVol / 1000000).toFixed(1);
    shortVolStr = '공매도 ' + s1 + 'M / 전체 ' + s2 + 'M';
  }

  const blockCount = tickerData?.flow?.blockTrades || 214;

  useEffect(() => {
    displayPriceRef.current = displayPrice;
    displayChangePctRef.current = displayChangePct;
    effectiveSessionRef.current = effectiveSession;
    if (displayPrice !== prevPriceRef.current) {
      const isUp = displayPrice >= prevPriceRef.current;
      setFlash(isUp ? 'up' : 'down');
      prevPriceRef.current = displayPrice;
      const tId = setTimeout(() => setFlash(null), 450);
      return () => clearTimeout(tId);
    }
  }, [displayPrice, displayChangePct, effectiveSession]);

  const resolvedPrevClose = tickerData?.prices?.prevRegularClose || tickerData?.rawTickerData?.prices?.prevRegularClose || tickerData?.prevClose || 0;
  const finalChangeAbs = resolvedPrevClose > 0 ? Math.abs(displayPrice - resolvedPrevClose) : Math.abs(tickerData?.display?.changeAbs || 0);
  const up = displayChangePct >= 0;

  // Check localStorage for unlock timestamp
  useEffect(() => {
    const checkUnlock = () => {
      const raw = localStorage.getItem('signum_ad_unlock');
      if (!raw) { setIsLocked(true); return; }
      try {
        const parsed = JSON.parse(raw);
        const until = parsed.unlockedUntil || parsed;
        setIsLocked(Date.now() >= Number(until));
      } catch {
        setIsLocked(Date.now() >= Number(raw));
      }
    };
    checkUnlock();
    window.addEventListener('storage', checkUnlock);
    window.addEventListener('signum:unlock', checkUnlock as EventListener);
    return () => {
      window.removeEventListener('storage', checkUnlock);
      window.removeEventListener('signum:unlock', checkUnlock as EventListener);
    };
  }, []);

  // Fetch Ticker Option Flow Data
  const initialLoadRef = useRef(true);
  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    initialLoadRef.current = true;

    async function fetchFlow() {
      if (initialLoadRef.current) setLoading(true);
      try {
        const [res, dpRes] = await Promise.all([
          fetch(`/api/live/ticker?t=${ticker.toUpperCase()}`),
          fetch(`/api/flow/dark-pool-trades?ticker=${ticker.toUpperCase()}&limit=20`).catch(() => null)
        ]);

        if (!res.ok) throw new Error();
        const data = await res.json();

        let dpItems = DEMO_DARK_POOL_TRADES;
        if (dpRes && dpRes.ok) {
          const dpData = await dpRes.json();
          if (dpData && Array.isArray(dpData.items) && dpData.items.length > 0) {
            dpItems = dpData.items;
          }
        }

        if (cancelled) return;

        setDarkPoolTrades(dpItems);
        setTickerData(data);
        if (data.display?.price) setPrice(data.display.price);
        if (data.display?.changePctPct) setChange(data.display.changePctPct);

        const flow = data.flow;
        if (flow) {
          if (flow.oiPcr != null) {
            setPcRatio(flow.oiPcr);
            // Derive a synthetic OPI between 0-100 (inverse of PC ratio)
            const calcOpi = Math.max(10, Math.min(95, Math.round(100 - flow.oiPcr * 50)));
            setOpi(calcOpi);
          }
          if (flow.netPremium != null) {
            // Estimate total premium from net premium
            setTotalPrem(Math.abs(flow.netPremium) * 2.5 || 12500000);
            setCallPct(flow.netPremium >= 0 ? 68.4 : 38.2);
          }
          if (flow.maxPain != null) setMaxPainVal(flow.maxPain);
          if (data.volatilityRegime?.regime) setVolRegime(data.volatilityRegime.regime);

          // Convert raw chain data to transactions
          if (flow.rawChain && flow.rawChain.length > 0) {
            setRawChain(flow.rawChain);
            const txs = flow.rawChain.slice(0, 8).map((c: any, i: number) => {
              const timeStr = c.time || new Date(Date.now() - i * 120000).toTimeString().split(' ')[0];
              return {
                time: timeStr,
                strike: c.details?.strike_price || c.strike || 0,
                type: c.details?.contract_type?.toUpperCase() || c.type || (i % 2 === 0 ? 'CALL' : 'PUT'),
                expiry: c.details?.expiration_date ? c.details.expiration_date.split('-').slice(1).join('/') : '06/19',
                size: c.day?.volume || c.size || 100 * (i + 1),
                px: c.last_quote?.midpoint || c.price || 1.5,
                premium: (c.day?.volume && c.last_quote?.midpoint) ? c.day.volume * c.last_quote.midpoint * 100 : (c.premium || (c.size || 100) * (c.price || 1.5) * 100),
                dir: c.side || (i % 3 === 0 ? 'ASK' : i % 3 === 1 ? 'BID' : 'MID'),
              };
            });
            // txs computed but no longer stored in state (orphan removed)
          } else {
            setRawChain([]);
          }
        }
      } catch {
        // Fallback to synthetic values for fallback ticker
        const dummyPrice = ticker === 'TSLA' ? 168.90 : ticker === 'AAPL' ? 212.55 : 208.19;
        const dummyChange = ticker === 'TSLA' ? -2.1 : 1.8;
        setTickerData({
          display: {
            price: dummyPrice,
            changePctPct: dummyChange,
          },
          rawTickerData: {
            display: {
              price: dummyPrice,
              changePctPct: dummyChange,
            }
          }
        });
        setPrice(dummyPrice);
        setChange(dummyChange);
        setOpi(ticker === 'TSLA' ? 38.5 : 62.4);
        setPcRatio(ticker === 'TSLA' ? 1.45 : 0.72);
        setTotalPrem(14500000);
        setCallPct(ticker === 'TSLA' ? 42.1 : 58.6);
        setMaxPainVal(ticker === 'TSLA' ? 170.0 : 210.0);
        setRawChain([]);
        setDarkPoolTrades(DEMO_DARK_POOL_TRADES);
      } finally {
        if (!cancelled) {
          setLoading(false);
          initialLoadRef.current = false;
        }
      }
    }

    fetchFlow();
    const interval = setInterval(() => { if (!cancelled) fetchFlow(); }, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [ticker]);

  // Demo Sweeps & UOA for fallback
  const DEMO_WHALES = useMemo(() => [
    { time: '10:14:22', strike: 140, type: 'CALL', expiry: '06/19', size: 1250, px: 2.45, premium: 306250, dir: 'ASK' as const },
    { time: '10:11:58', strike: 145, type: 'CALL', expiry: '06/19', size: 2100, px: 1.22, premium: 256200, dir: 'ASK' as const },
    { time: '10:10:15', strike: 130, type: 'PUT', expiry: '06/26', size: 800, px: 3.10, premium: 248000, dir: 'BID' as const },
    { time: '10:08:44', strike: 138, type: 'CALL', expiry: '06/12', size: 1100, px: 1.85, premium: 203500, dir: 'ASK' as const },
    { time: '10:05:12', strike: 135, type: 'PUT', expiry: '06/12', size: 1400, px: 1.12, premium: 156800, dir: 'BID' as const },
  ], []);

  const DEMO_UOA = useMemo(() => [
    { strike: 150, type: 'CALL', expiry: '06/19', volume: 4800, oi: 1200, ratio: 4.0 },
    { strike: 132, type: 'PUT', expiry: '06/12', volume: 3200, oi: 950, ratio: 3.37 },
    { strike: 142, type: 'CALL', expiry: '06/19', volume: 5500, oi: 2200, ratio: 2.5 },
    { strike: 128, type: 'PUT', expiry: '06/26', volume: 1800, oi: 800, ratio: 2.25 },
  ], []);

  // Compute real Whale Sweeps
  const whaleSweeps = useMemo(() => {
    const baseList = (!rawChain || rawChain.length === 0) 
      ? DEMO_WHALES 
      : rawChain.map((c: any, i: number) => {
          const strike = c.details?.strike_price || 0;
          const type = (c.details?.contract_type || 'call').toUpperCase();
          const expiry = c.details?.expiration_date ? c.details.expiration_date.split('-').slice(1).join('/') : '06/19';
          const volume = c.day?.volume || 0;
          const px = c.last_quote?.midpoint || c.day?.close || 0;
          const premium = volume * px * 100;
          const delta = c.greeks?.delta || 0;
          const dir = type === 'CALL' ? (delta > 0.6 ? 'ASK' : 'BID') : (delta < -0.6 ? 'ASK' : 'BID');
          const timeStr = c.time || new Date(Date.now() - i * 120000).toTimeString().split(' ')[0];

          return {
            time: timeStr,
            strike,
            type: type as 'CALL' | 'PUT',
            expiry,
            size: volume,
            px,
            premium,
            dir
          };
        });

    const filtered = baseList.filter(tx => tx.premium >= minPremium);
    return filtered.sort((a, b) => b.premium - a.premium);
  }, [rawChain, DEMO_WHALES, minPremium]);

  const filteredDarkPoolTrades = useMemo(() => {
    return darkPoolTrades.filter((tx: any) => tx.premium >= minPremium);
  }, [darkPoolTrades, minPremium]);

  const whaleSummary = useMemo(() => {
    const count = whaleSweeps.length;
    const total = whaleSweeps.reduce((sum: number, tx: any) => sum + tx.premium, 0);
    const callSum = whaleSweeps.filter((tx: any) => tx.type === 'CALL').reduce((sum: number, tx: any) => sum + tx.premium, 0);
    const putSum = whaleSweeps.filter((tx: any) => tx.type === 'PUT').reduce((sum: number, tx: any) => sum + tx.premium, 0);
    return { count, total, callSum, putSum };
  }, [whaleSweeps]);

  const dpSummary = useMemo(() => {
    const count = filteredDarkPoolTrades.length;
    const total = filteredDarkPoolTrades.reduce((sum: number, tx: any) => sum + tx.premium, 0);
    const buySum = filteredDarkPoolTrades.filter((tx: any) => tx.side === 'BUY').reduce((sum: number, tx: any) => sum + tx.premium, 0);
    const sellSum = filteredDarkPoolTrades.filter((tx: any) => tx.side === 'SELL').reduce((sum: number, tx: any) => sum + tx.premium, 0);
    return { count, total, buySum, sellSum };
  }, [filteredDarkPoolTrades]);

  // Compute real UOA
  const uoaList = useMemo(() => {
    if (!rawChain || rawChain.length === 0) return DEMO_UOA;
    const uoas = rawChain.map((c: any) => {
      const strike = c.details?.strike_price || 0;
      const type = (c.details?.contract_type || 'call').toUpperCase();
      const expiry = c.details?.expiration_date ? c.details.expiration_date.split('-').slice(1).join('/') : '06/19';
      const volume = c.day?.volume || 0;
      const oi = c.open_interest || c.day?.open_interest || 1;
      const ratio = volume / oi;

      return {
        strike,
        type,
        expiry,
        volume,
        oi,
        ratio
      };
    }).filter(item => item.ratio >= 2.0 && item.volume > 500);

    return uoas.length > 0 ? uoas.sort((a, b) => b.ratio - a.ratio) : DEMO_UOA;
  }, [rawChain, DEMO_UOA]);

  // Handle Search submit
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setTicker(searchInput.toUpperCase().trim());
      setIsSearchOpen(false);
    }
  };

  // Handle manual unlock (Simulated for now, AdMob callback in Phase 2)
  const handleUnlock = () => {
    const state = { unlockedUntil: Date.now() + 60 * 60 * 1000, tier: 'premium' };
    localStorage.setItem('signum_ad_unlock', JSON.stringify(state));
    window.dispatchEvent(new Event('signum:unlock'));
    setIsLocked(false);
  };

  // Gauge calculations
  const gaugeColor = opi >= 60 ? 'var(--green)' : opi >= 40 ? 'var(--amber)' : 'var(--red)';
  const gaugeStatus = opi >= 60 ? 'BULLISH' : opi >= 40 ? 'NEUTRAL' : 'BEARISH';
  const rotationAngle = -90 + (opi / 100) * 180; // maps 0-100 to -90 to +90 degrees

  // ── Task 5: Derived dynamic values for Overview & AI Intel tabs ──
  const ivRankVal = tickerData?.flow?.ivRank ?? tickerData?.unified?.volatility?.ivRank ?? null;
  const ivSkewVal = tickerData?.flow?.ivSkew ?? null;
  const putFloorVal = tickerData?.flow?.putFloor ?? null;
  const callWallVal = tickerData?.flow?.callWall ?? null;
  const atmIvVal = tickerData?.flow?.atmIv ?? tickerData?.unified?.volatility?.atmIv ?? null;
  const impliedMoveRaw = tickerData?.flow?.impliedMove ?? (atmIvVal != null ? (atmIvVal / Math.sqrt(252) * 100) : null);
  const impliedMoveStr = impliedMoveRaw != null ? `±${impliedMoveRaw.toFixed(1)}%` : '—';

  // Nearest expiry from rawChain
  const nearestExpiry = useMemo(() => {
    if (!rawChain || rawChain.length === 0) return null;
    const expiries = rawChain.map((c: any) => c?.expiry || c?.expirationDate).filter(Boolean);
    if (expiries.length === 0) return null;
    const sorted = [...expiries].sort();
    return sorted[0];
  }, [rawChain]);
  const nearestExpiryLabel = nearestExpiry
    ? `${nearestExpiry.slice(5, 7)}/${nearestExpiry.slice(8, 10)} ${t.expiry}`
    : '';

  // Regime label (Options Market Regime)
  const regimeLabel = ivRankVal == null ? '—' : ivRankVal < 30 ? t.lowVol : ivRankVal < 70 ? t.neutral : t.highVol;
  const regimeBadgeClass = ivRankVal == null ? s.badgeAmber : ivRankVal < 30 ? s.badgeGreen : ivRankVal < 70 ? s.badgeAmber : `${s.headerBadge}`;
  const regimeInsight = locale === 'ko'
    ? `IV Rank ${ivRankVal ?? '—'}% 수준에서 P/C 비율 ${pcRatio.toFixed(2)}의 옵션 시장 레짐`
    : locale === 'ja'
    ? `IV Rank ${ivRankVal ?? '—'}%水準でP/C比率${pcRatio.toFixed(2)}のオプション市場レジーム`
    : `Options market regime at IV Rank ${ivRankVal ?? '—'}% with P/C ratio ${pcRatio.toFixed(2)}`;

  // AI Verdict derived values
  const aiIvRank = ivRankVal ?? null;
  const whaleNetBetRaw = tickerData?.flow?.darkPoolNetBuyVal ?? null;
  const whaleNetBetStr = whaleNetBetRaw != null
    ? (Math.abs(whaleNetBetRaw) >= 1000000
      ? `${whaleNetBetRaw >= 0 ? '+' : '-'}$${(Math.abs(whaleNetBetRaw) / 1000000).toFixed(1)}M`
      : `${whaleNetBetRaw >= 0 ? '+' : '-'}$${(Math.abs(whaleNetBetRaw) / 1000).toFixed(0)}K`)
    : '—';

  // ── 9-Factor Option Sentiment Scoring Logic ──
  const netWhalePremium = useMemo(() => {
    return whaleNetBetRaw ?? (totalPrem * (callPct / 100 - 0.5) * 2);
  }, [whaleNetBetRaw, totalPrem, callPct]);

  const opiScore = useMemo(() => {
    const opiVal = (opi - 50) * 2; // maps 0~100 to -100~+100
    return opiVal * 0.25;
  }, [opi]);

  const whaleScore = useMemo(() => {
    if (netWhalePremium > 500000) return 25;
    if (netWhalePremium > 100000) return 15;
    if (netWhalePremium < -500000) return -25;
    if (netWhalePremium < -100000) return -15;
    return 0;
  }, [netWhalePremium]);

  const squeezeProb = useMemo(() => {
    return Math.round((parseFloat(shortPct) || 45.2) * 0.5 + (ivRankVal ?? 50) * 0.5);
  }, [shortPct, ivRankVal]);

  const squeezeScore = useMemo(() => {
    let score = 0;
    if (squeezeProb >= 70) score = 15;
    else if (squeezeProb >= 45) score = 8;
    return (opi - 50) > 0 ? score : -score;
  }, [squeezeProb, opi]);

  const skewScore = useMemo(() => {
    const val = ivSkewVal ?? 0;
    return Math.max(-15, Math.min(15, -val * 1.5));
  }, [ivSkewVal]);

  const smartScore = useMemo(() => {
    const smartMoneyScore = Math.max(10, Math.min(95, (blockCount / 3)));
    let score = 0;
    if (smartMoneyScore >= 60) score = 10;
    else if (smartMoneyScore >= 40) score = 5;
    else if (smartMoneyScore < 20) score = -5;
    return netWhalePremium >= 0 ? score : -score;
  }, [blockCount, netWhalePremium]);

  const dexScore = useMemo(() => {
    const gammaFlipNum = typeof liveGammaFlip === 'number'
      ? liveGammaFlip
      : parseFloat((liveGammaFlip || '').replace(/[^0-9.]/g, '')) || 0;
    const dist = gammaFlipNum > 0 ? ((displayPrice - gammaFlipNum) / gammaFlipNum) * 100 : 0;
    if (dist > 5) return -10;
    if (dist > 2) return -5;
    if (dist < -5) return 10;
    if (dist < -2) return 5;
    return 0;
  }, [liveGammaFlip, displayPrice]);

  const uoaScore = useMemo(() => {
    const uoaCount = uoaList.length;
    let score = 0;
    if (uoaCount >= 4) score = 5;
    else if (uoaCount >= 2) score = 3;
    return (opi - 50) < 0 ? -score : score;
  }, [uoaList, opi]);

  const pcScore = useMemo(() => {
    if (pcRatio >= 2.0) return -5;
    if (pcRatio >= 1.3) return -3;
    if (pcRatio <= 0.5) return 5;
    if (pcRatio <= 0.75) return 3;
    return 0;
  }, [pcRatio]);

  const zdteScore = useMemo(() => {
    const pinStrength = volRegime === 'STABLE' ? 75 : volRegime === 'LOADED' ? 45 : 15;
    let score = 0;
    if (pinStrength >= 60) score = 5;
    else if (pinStrength >= 35) score = 3;
    return (opi - 50) < 0 ? -score : score;
  }, [volRegime, opi]);

  const compositeScore = useMemo(() => {
    const flowBonus = Math.abs(netWhalePremium) > 1000000 ? (netWhalePremium > 0 ? 5 : -5) : 0;
    let score = opiScore + whaleScore + squeezeScore + skewScore + smartScore + dexScore + uoaScore + pcScore + zdteScore + flowBonus;
    return Math.max(-100, Math.min(100, Math.round(score)));
  }, [opiScore, whaleScore, squeezeScore, skewScore, smartScore, dexScore, uoaScore, pcScore, zdteScore, netWhalePremium]);

  const compositeIndex = Math.round((opi * 0.4) + (((ivRankVal ?? 50)) * 0.3) + ((100 - pcRatio * 50) * 0.3));

  const aiVerdictLabel = opi >= 65 ? t.bullishMomentum : opi >= 40 ? t.neutralLabel : t.bearishPressure;
  const aiVerdictBadgeStyle = opi >= 65
    ? { background: 'rgba(16, 185, 129, 0.12)', color: 'var(--green)', border: '1px solid rgba(16, 185, 129, 0.25)' }
    : opi >= 40
    ? { background: 'rgba(245, 158, 11, 0.12)', color: 'var(--amber)', border: '1px solid rgba(245, 158, 11, 0.25)' }
    : { background: 'rgba(239, 68, 68, 0.12)', color: 'var(--red)', border: '1px solid rgba(239, 68, 68, 0.25)' };
  const aiOpiColor = opi >= 65 ? 'var(--green)' : opi >= 40 ? 'var(--amber)' : 'var(--red)';

  // Info popover helper components
  const InfoBtn = ({ popKey }: { popKey: string }) => (
    <button
      className="info-btn"
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setActivePopover(activePopover === popKey ? null : popKey);
      }}
      style={{
        background: 'transparent',
        border: 'none',
        padding: '2px',
        marginLeft: '4px',
        color: activePopover === popKey ? 'var(--cyan)' : 'var(--text-muted)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        outline: 'none',
        transition: 'color 0.2s ease',
        verticalAlign: 'middle'
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    </button>
  );

  const renderPopover = (popKey: string, text: string, title: string) => {
    if (activePopover !== popKey) return null;
    return (
      <div 
        className="popover-container animate-in fade-in zoom-in-95 duration-150"
        style={{
          position: 'absolute',
          top: '45px',
          left: '16px',
          right: '16px',
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          borderRadius: '10px',
          padding: '12px 14px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(6, 182, 212, 0.15)',
          zIndex: 100,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 900, color: 'var(--cyan)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {title}
          </span>
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); setActivePopover(null); }}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', padding: '2px' }}
          >
            ✕
          </button>
        </div>
        <div style={{ fontSize: '11px', lineHeight: '1.4', color: '#b4c6ef', fontWeight: 500, textAlign: 'left' }}>
          {text}
        </div>
      </div>
    );
  };

  const renderWhaleCard = (tx: any, idx: number) => {
    const isCall = tx.type === 'CALL';
    const dirColor = tx.dir === 'ASK' ? '#10b981' : tx.dir === 'BID' ? '#ef4444' : '#f59e0b';
    const impactLabel = tx.premium > 500000 ? 'IMPACT: HIGH' : tx.premium > 100000 ? 'IMPACT: MID' : 'IMPACT: LOW';
    const impactColor = tx.premium > 500000 ? '#ef4444' : tx.premium > 100000 ? '#f59e0b' : 'var(--cyan)';

    return (
      <div
        key={idx}
        style={{
          flex: '0 0 78%',
          scrollSnapAlign: 'start',
          background: 'linear-gradient(135deg, rgba(20, 30, 50, 0.4) 0%, rgba(10, 15, 30, 0.6) 100%)',
          border: `1px solid ${isCall ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)'}`,
          borderRadius: '12px',
          padding: '12px 14px',
          position: 'relative',
          boxShadow: isCall 
            ? '0 4px 12px rgba(16,185,129,0.03)' 
            : '0 4px 12px rgba(239,68,68,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '125px'
        }}
      >
        {/* Ticker & Type */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 900, color: '#ffffff' }}>{ticker}</span>
            <span style={{
              fontSize: '8px',
              fontWeight: 900,
              padding: '2px 5px',
              borderRadius: '4px',
              background: isCall ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              color: isCall ? '#10b981' : '#ef4444',
              border: `1px solid ${isCall ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}`
            }}>
              {isCall ? 'CALL' : 'PUT'} | {tx.expiry}
            </span>
          </div>
          <span style={{ fontSize: '8px', fontWeight: 800, color: impactColor, background: 'rgba(255,255,255,0.02)', padding: '2px 5px', borderRadius: '4px' }}>
            {impactLabel}
          </span>
        </div>

        {/* Premium & Strike */}
        <div style={{ margin: '10px 0 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <span style={{ fontSize: '8px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              {locale === 'ko' ? '프리미엄' : 'PREMIUM'}
            </span>
            <span className="tnum" style={{ fontSize: '17px', fontWeight: 900, color: dirColor }}>
              ${(tx.premium / 1000).toFixed(1)}K
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '8px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              {locale === 'ko' ? '행사가' : 'STRIKE'}
            </span>
            <span className="tnum" style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff' }}>
              ${tx.strike}
            </span>
          </div>
        </div>

        {/* Time & Side */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '6px' }}>
          <span>{tx.time}</span>
          <span style={{ fontWeight: 800, color: '#ffffff' }}>
            {tx.dir}
          </span>
        </div>
      </div>
    );
  };

  const renderDarkPoolCard = (tx: any, idx: number) => {
    const isBuy = tx.side === 'BUY';
    const isSell = tx.side === 'SELL';
    const sideColor = isBuy ? '#10b981' : isSell ? '#ef4444' : 'var(--text-muted)';
    const sideText = isBuy ? 'BLOCK - BUY' : isSell ? 'BLOCK - SELL' : 'NEUTRAL';

    return (
      <div
        key={idx}
        style={{
          flex: '0 0 78%',
          scrollSnapAlign: 'start',
          background: 'linear-gradient(135deg, rgba(20, 30, 50, 0.4) 0%, rgba(10, 15, 30, 0.6) 100%)',
          border: `1px solid ${isBuy ? 'rgba(16,185,129,0.18)' : isSell ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: '12px',
          padding: '12px 14px',
          position: 'relative',
          boxShadow: isBuy
            ? '0 4px 12px rgba(16,185,129,0.03)'
            : isSell
            ? '0 4px 12px rgba(239,68,68,0.03)'
            : 'none',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '125px'
        }}
      >
        {/* Ticker & Side */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 900, color: '#ffffff' }}>{ticker}</span>
            <span style={{
              fontSize: '8px',
              fontWeight: 900,
              padding: '2px 5px',
              borderRadius: '4px',
              background: isBuy ? 'rgba(16,185,129,0.08)' : isSell ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
              color: sideColor,
              border: `1px solid ${isBuy ? 'rgba(16,185,129,0.15)' : isSell ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.08)'}`
            }}>
              {sideText}
            </span>
          </div>
          <span style={{ fontSize: '8px', fontWeight: 800, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', padding: '2px 5px', borderRadius: '4px' }}>
            {tx.exchangeName}
          </span>
        </div>

        {/* Value & Price */}
        <div style={{ margin: '10px 0 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <span style={{ fontSize: '8px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              {locale === 'ko' ? '거래 대금' : 'VALUE'}
            </span>
            <span className="tnum" style={{ fontSize: '17px', fontWeight: 900, color: 'var(--cyan)' }}>
              ${(tx.premium / 1000).toFixed(0)}K
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '8px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              {locale === 'ko' ? '체결단가' : 'PRICE'}
            </span>
            <span className="tnum" style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff' }}>
              ${tx.price.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Size & Time */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '6px' }}>
          <span>{tx.timeET}</span>
          <span style={{ fontWeight: 800, color: '#ffffff' }}>
            {(tx.size / 1000).toFixed(1)}K shares
          </span>
        </div>
      </div>
    );
  };

  const BRAND_COLORS: Record<string, { color: string, glow: string }> = {
    NVDA: { color: '#76b900', glow: 'rgba(118, 185, 0, 0.4)' },
    TSLA: { color: '#cc0000', glow: 'rgba(204, 0, 0, 0.4)' },
    AAPL: { color: '#a2aaad', glow: 'rgba(162, 170, 173, 0.4)' },
    SPY: { color: '#0ea5e9', glow: 'rgba(14, 165, 233, 0.4)' },
    QQQ: { color: '#22d3ee', glow: 'rgba(34, 211, 238, 0.4)' }
  };

  return (
    <div className={dashStyles.page} style={{ paddingBottom: '160px' }}>
      {/* HEADER */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Heartbeat/Pulse Icon SVG */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 4px rgba(6, 182, 212, 0.5))' }}>
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          <div className={dashStyles.headerTitle} style={{ font: 'var(--f-h2)', fontWeight: 800 }}>
            {t.title}
          </div>
        </div>
        <div className={dashStyles.headerActions} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Search Toggle Button */}
          <button
            type="button"
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            style={{
              background: 'none',
              border: 'none',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: isSearchOpen ? 'var(--cyan)' : 'rgba(255, 255, 255, 0.7)',
              transition: 'all 0.2s ease',
              outline: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--cyan)';
            }}
            onMouseLeave={(e) => {
              if (!isSearchOpen) {
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
              }
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', font: 'var(--f-micro)', fontWeight: 800, color: '#10b981', letterSpacing: '0.05em' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
            LIVE
          </span>
        </div>
      </header>

      {/* SEARCH BAR (Toggleable) */}
      {isSearchOpen && (
        <form onSubmit={handleSearch} style={{ padding: '12px 16px 4px', display: 'flex', justifyContent: 'center', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center', position: 'relative' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              {/* Magnifying Glass Icon on Left */}
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none', opacity: 0.6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t.searchPlaceholder}
                style={{
                  width: '100%',
                  height: '38px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 'var(--r-pill)',
                  padding: '0 16px 0 34px',
                  font: 'var(--f-small)',
                  fontWeight: 600,
                  color: 'var(--text)',
                  outline: 'none',
                  transition: 'all 0.3s ease',
                  backdropFilter: 'blur(16px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            {/* Close Search Button */}
            <button
              type="button"
              className="close-search-btn"
              onClick={() => setIsSearchOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '38px',
                height: '38px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '10px',
                cursor: 'pointer',
                color: 'rgba(255, 255, 255, 0.7)',
                transition: 'all 0.2s ease',
                outline: 'none',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                backdropFilter: 'blur(16px) saturate(180%)',
                WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                boxSizing: 'border-box'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
              }}
            >
              {/* Close/Cross (X) Icon SVG */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </form>
      )}

      {/* UNDERLYER TICKER TABS (M7 Ticker Logos with brand glows) */}
      <div style={{ display: 'flex', gap: '10px', padding: '12px 16px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }} className="no-scrollbar">
        {['NVDA', 'TSLA', 'AAPL', 'SPY', 'QQQ'].map((sym) => {
          const brand = BRAND_COLORS[sym] || { color: 'var(--cyan)', glow: 'rgba(6, 182, 212, 0.3)' };
          const isActive = ticker === sym;
          return (
            <button
              key={sym}
              onClick={() => {
                setTicker(sym);
                setSearchInput(sym);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: 'var(--r-pill)',
                border: '1px solid',
                borderColor: isActive ? brand.color : 'rgba(255,255,255,0.06)',
                background: isActive ? 'rgba(30, 41, 59, 0.55)' : 'rgba(255,255,255,0.02)',
                color: isActive ? '#ffffff' : 'var(--text-dim)',
                font: 'var(--f-micro)',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: isActive ? `0 0 12px ${brand.glow}` : 'none',
                flexShrink: 0,
                outline: 'none'
              }}
            >
              <div style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                overflow: 'hidden',
                background: 'rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <img
                  src={`https://assets.parqet.com/logos/symbol/${sym}?format=png`}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
              <span>{sym}</span>
            </button>
          );
        })}
      </div>

      {/* ── LOADING SKELETON ── */}
      {loading && (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
          {/* Price card skeleton */}
          <div className="app-skeleton" style={{ height: '180px', borderRadius: '12px' }} />
          {/* Tab bar skeleton */}
          <div className="app-skeleton" style={{ height: '44px', borderRadius: '10px' }} />
          {/* Content skeleton */}
          <div className="app-skeleton" style={{ height: '200px', borderRadius: '12px' }} />
          <div className="app-skeleton" style={{ height: '150px', borderRadius: '12px' }} />
        </div>
      )}

      {/* ── MAIN CONTENT (hidden during loading) ── */}
      {!loading && (<>

      {/* ── PRICE CARD v2 (From cmd/page.tsx) ── */}
      {(() => {
        const sessionLabel = effectiveSession === 'REG' ? 'MARKET OPEN'
          : effectiveSession === 'PRE' ? 'PRE-MARKET'
          : effectiveSession === 'POST' ? 'AFTER HOURS'
          : 'MARKET CLOSED';

        const isOpen = effectiveSession === 'REG';
        const isPrePost = effectiveSession === 'PRE' || effectiveSession === 'POST';
        const hasExt = activeExtPrice > 0 && activeExtLabel;

        const liveRsi = tickerData?.display?.rsi14 || tickerData?.rawTickerData?.display?.rsi14 || (ticker === 'TSLA' ? 44.5 : ticker === 'AAPL' ? 58.9 : 64.2);
        const liveVwap = tickerData?.display?.vwap || tickerData?.rawTickerData?.display?.vwap || (displayPrice * 0.995);
        const liveHigh = tickerData?.display?.high || tickerData?.rawTickerData?.display?.high || (displayPrice * 1.015);
        const liveLow = tickerData?.display?.low || tickerData?.rawTickerData?.display?.low || (displayPrice * 0.985);
        const liveGammaFlip = tickerData?.premium?.gammaFlip || tickerData?.flow?.gammaFlip || (ticker === 'TSLA' ? '$165.00' : ticker === 'AAPL' ? '$210.00' : '$208.00');

        const companyName = tickerData?.name || tickerData?.company || tickerData?.rawTickerData?.name || (ticker === 'NVDA' ? 'NVIDIA Corp' : ticker === 'TSLA' ? 'Tesla Inc' : ticker === 'AAPL' ? 'Apple Inc' : ticker === 'SPY' ? 'SPDR S&P 500 ETF' : ticker === 'QQQ' ? 'Invesco QQQ Trust' : '');

        return (
          <div
            className={`${s.p2Card} ${s.connectedP2Card} ${s.animateIn} ${s.delay1}`}
            style={{
              margin: '4px 16px 0px',
              borderBottom: 'none',
              borderBottomLeftRadius: '0px',
              borderBottomRightRadius: '0px'
            }}
          >
            {/* Background sparkline decoration */}
            <SparklineBg up={up} seed={ticker} />

            {/* ── Row 1: Identity (Logo + Ticker/Company) | Status ── */}
            <div className={s.heroIdentity}>
              <div className={s.heroLeft}>
                <div className={s.heroLogo}>
                  <img
                    src={`https://assets.parqet.com/logos/symbol/${ticker}?format=png`}
                    alt={ticker}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
                <div className={s.heroNameGroup}>
                  <span className={s.heroTicker}>{ticker}</span>
                  <span className={s.heroCompany}>{companyName}</span>
                </div>
                <span className={`${s.p2Tick} ${flash ? s[`show-${flash}`] : ''}`}>
                  {flash === 'down' ? '▼ TICK' : '▲ TICK'}
                </span>
              </div>
              <div className={s.heroRight}>
                <div className={isOpen ? s.heroStatusOpen : isPrePost ? s.heroStatusPrePost : s.heroStatusClosed}>
                  {isOpen ? (
                    <span className={s.marketDotActive} />
                  ) : isPrePost ? (
                    <span className={s.marketDotPulse} />
                  ) : null}
                  {sessionLabel}
                </div>
                <span className={s.heroTime}>
                  {mounted ? (() => {
                    const now = new Date();
                    const etStr = now.toLocaleString('en-US', {
                      timeZone: 'America/New_York',
                      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
                    });
                    return `${etStr} ET`;
                  })() : ''}
                </span>
              </div>
            </div>

            {/* ── Row 2: Big Price | Extended Hours Card ── */}
            <div className={s.heroMainRow}>
              <div className={s.heroPriceBlock}>
                <span className={`${s.p2Price} ${flash ? s[`flash-${flash}`] : ''}`}>
                  ${displayPrice.toFixed(2)}
                </span>
                <span className={`${s.p2Chg} ${up ? s.pos : s.neg}`}>
                  {up ? '▲' : '▼'} {up ? '+' : ''}{displayChangePct.toFixed(2)}%
                </span>
              </div>
              {hasExt && (
                <div className={s.heroExtCard}>
                  <SparklineBg up={activeExtPct >= 0} seed={`${ticker}-ext`} />
                  <span className={s.heroExtLabel}>{activeExtLabel}</span>
                  <span className={s.heroExtPrice}>${activeExtPrice.toFixed(2)}</span>
                  <span className={s.heroExtChange} style={{ color: activeExtPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {activeExtPct >= 0 ? '+' : ''}{activeExtPct.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>

            {/* ── Row 3: Option Metrics — MAX PAIN / GAMMA FLIP / TOTAL PREMIUM ── */}
            {(() => {
              const mpDiff = maxPainVal > 0 ? ((displayPrice - maxPainVal) / maxPainVal) * 100 : 0;
              const gammaFlipNum = typeof liveGammaFlip === 'number'
                ? liveGammaFlip
                : parseFloat((liveGammaFlip || '').replace(/[^0-9.]/g, '')) || 0;
              const gfDiff = gammaFlipNum > 0 ? ((displayPrice - gammaFlipNum) / gammaFlipNum) * 100 : 0;
              const netPremiumVal = tickerData?.flow?.netPremium ?? (callPct >= 50 ? totalPrem * (callPct - 50) / 50 : -totalPrem * (50 - callPct) / 50);

              return (
                <div className={s.heroMetrics}>
                  <div className={s.heroMetricCard}>
                    <span className={s.heroMetricLabel}>MAX PAIN</span>
                    <span className={s.heroMetricValue}>
                      ${maxPainVal > 0 ? maxPainVal.toFixed(0) : '—'}
                    </span>
                    {maxPainVal > 0 && (
                      <span className={s.heroMetricSub} style={{ color: Math.abs(mpDiff) <= 1.5 ? 'var(--amber)' : mpDiff > 0 ? 'var(--red)' : 'var(--green)' }}>
                        {mpDiff >= 0 ? '+' : ''}{mpDiff.toFixed(2)}% {locale === 'ko' ? '괴리' : locale === 'ja' ? '乖離' : 'gap'}
                      </span>
                    )}
                  </div>
                  <div className={s.heroMetricCard}>
                    <span className={s.heroMetricLabel}>GAMMA FLIP</span>
                    <span className={s.heroMetricValue}>{liveGammaFlip}</span>
                    {gammaFlipNum > 0 && (
                      <span className={s.heroMetricSub} style={{ color: gfDiff >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {gfDiff >= 0
                          ? (locale === 'ko' ? '상회' : locale === 'ja' ? '상회' : 'above')
                          : (locale === 'ko' ? '하회' : locale === 'ja' ? '하회' : 'below')
                        } ({gfDiff >= 0 ? '+' : ''}{gfDiff.toFixed(2)}%)
                      </span>
                    )}
                  </div>
                  <div className={s.heroMetricCard}>
                    <span className={s.heroMetricLabel}>TOTAL PREMIUM</span>
                    <span className={s.heroMetricValue}>
                      {netPremiumVal !== 0
                        ? (Math.abs(netPremiumVal) >= 1e6
                          ? `$${(netPremiumVal / 1e6).toFixed(1)}M`
                          : `$${(netPremiumVal / 1e3).toFixed(0)}K`)
                        : '—'}
                    </span>
                    <span className={s.heroMetricSub} style={{ color: netPremiumVal >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {netPremiumVal >= 0
                        ? (locale === 'ko' ? '콜 우세' : locale === 'ja' ? 'コール優勢' : 'Call dominant')
                        : (locale === 'ko' ? '풋 우세' : locale === 'ja' ? 'プット優勢' : 'Put dominant')
                      }
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* ── Row 4: Vitals Strip (RSI / VWAP / DAY RANGE) ── */}
            <div className={s.p2Vitals}>
              <div className={s.p2Vital}>
                <div className={s.k}>RSI 14</div>
                <div className={s.v}>{liveRsi.toFixed(1)}</div>
                <div className={s.bar}><i style={{ width: `${liveRsi}%` }} /></div>
              </div>
              <div className={s.p2Vital}>
                <div className={s.k}>VWAP</div>
                <div className={s.v}>${liveVwap.toFixed(2)}</div>
                <div className={s.bar}><i style={{ width: '52%' }} /></div>
              </div>
              <div className={s.p2Vital}>
                <div className={s.k}>DAY RANGE</div>
                <div className={s.v}>${liveLow.toFixed(1)}–${liveHigh.toFixed(1)}</div>
                <div className={s.bar}>
                  <i style={{ width: `${((displayPrice - liveLow) / (liveHigh - liveLow || 1)) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── SEGMENTED SUB-TABS (Overview, AI Intel, Options Flow, Strike Profile) ── */}
      <div 
        className={`${s.seg} ${s.seg4} ${s.connectedSeg}`} 
        style={{ 
          marginTop: '0px',
          marginBottom: '0px',
          borderRadius: '0px',
          borderTop: '1px solid rgba(255, 255, 255, 0.055)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.055)',
          marginLeft: '16px',
          marginRight: '16px'
        }}
      >
        <span className={s.segPill} style={{ left: `calc(3px + ${['overview', 'ai-intel', 'whale-flow', 'strike-profile'].indexOf(activeTab)} * (100% - 6px) / 4)` }}></span>
        <button
          className={activeTab === 'overview' ? s.on : ''}
          onClick={() => setActiveTab('overview')}
        >
          OVERVIEW
        </button>
        <button
          className={activeTab === 'ai-intel' ? s.on : ''}
          onClick={() => setActiveTab('ai-intel')}
        >
          <span style={{
            background: 'linear-gradient(90deg, #a855f7, #ec4899, #3b82f6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontWeight: 900,
            opacity: activeTab === 'ai-intel' ? 1 : 0.65
          }}>
            AI INTEL
          </span>
        </button>
        <button
          className={activeTab === 'whale-flow' ? s.on : ''}
          onClick={() => setActiveTab('whale-flow')}
        >
          WHALE & DP
        </button>
        <button
          className={activeTab === 'strike-profile' ? s.on : ''}
          onClick={() => setActiveTab('strike-profile')}
        >
          STRIKE
        </button>
      </div>


      {/* ── STYLE TAG FOR CUSTOM PREMIUM SCROLLBAR & VITAL CARD GLOWS ── */}
      <style jsx global>{`
        .premium-card {
          background: rgba(30, 41, 59, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02), 0 8px 32px rgba(0, 0, 0, 0.24);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .animate-glow {
          box-shadow: 0 0 15px rgba(6, 182, 212, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.02);
          transition: box-shadow 0.3s ease;
        }
        .animate-glow:hover {
          box-shadow: 0 0 20px rgba(6, 182, 212, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.02);
        }
        .premium-scroll::-webkit-scrollbar {
          width: 5px;
        }
        .premium-scroll::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.01);
          border-radius: 4px;
        }
        .premium-scroll::-webkit-scrollbar-thumb {
          background: rgba(6, 182, 212, 0.25);
          border-radius: 4px;
          border: 1px solid rgba(6, 182, 212, 0.1);
        }
        .premium-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(6, 182, 212, 0.55);
        }
        .no-scrollbar {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
        }

        @keyframes vital-pulse-gold {
          0% { border-color: rgba(245, 158, 11, 0.25); box-shadow: 0 0 4px rgba(245, 158, 11, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.03); }
          100% { border-color: rgba(245, 158, 11, 0.65); box-shadow: 0 0 10px rgba(245, 158, 11, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.03); }
        }
        @keyframes vital-pulse-cyan {
          0% { border-color: rgba(34, 211, 238, 0.25); box-shadow: 0 0 4px rgba(34, 211, 238, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.03); }
          100% { border-color: rgba(34, 211, 238, 0.65); box-shadow: 0 0 10px rgba(34, 211, 238, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.03); }
        }
        @keyframes vital-pulse-red {
          0% { border-color: rgba(239, 68, 68, 0.25); box-shadow: 0 0 4px rgba(239, 68, 68, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.03); }
          100% { border-color: rgba(239, 68, 68, 0.65); box-shadow: 0 0 10px rgba(239, 68, 68, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.03); }
        }

        .vital-gold-glow {
          animation: vital-pulse-gold 2s infinite alternate;
          background: rgba(245, 158, 11, 0.04) !important;
          border-color: rgba(245, 158, 11, 0.5) !important;
        }
        .vital-cyan-glow {
          animation: vital-pulse-cyan 2s infinite alternate;
          background: rgba(34, 211, 238, 0.04) !important;
          border-color: rgba(34, 211, 238, 0.5) !important;
        }
        .vital-red-glow {
          animation: vital-pulse-red 2s infinite alternate;
          background: rgba(239, 68, 68, 0.04) !important;
          border-color: rgba(239, 68, 68, 0.5) !important;
        }
      `}</style>

      {/* ── TAB CONTENT ── */}
      <SwipeableTabs
        onSwipeLeft={() => { const TABS = ['overview', 'ai-intel', 'whale-flow', 'strike-profile'] as const; const i = TABS.indexOf(activeTab); if (i < TABS.length - 1) setActiveTab(TABS[i + 1]); }}
        onSwipeRight={() => { const TABS = ['overview', 'ai-intel', 'whale-flow', 'strike-profile'] as const; const i = TABS.indexOf(activeTab); if (i > 0) setActiveTab(TABS[i - 1]); }}
      >
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 16px var(--s4)' }} className="animate-in fade-in duration-200">
          {/* OPI Radial Gauge (Module 1) */}
          <div className="premium-card" style={{ padding: '20px 18px', margin: 0, position: 'relative', borderTop: 'none', borderTopLeftRadius: '0px', borderTopRightRadius: '0px' }}>
            {renderPopover('opi', locale === 'ko' ? '옵션 가격 압박 지수. 콜/풋 포지셔닝에 따른 가격 압박 방향을 보여줍니다. 양수(+)는 콜 가격 우위, 음수(-)는 풋 가격 우위입니다.' : 'Options Price Gauge — price pressure direction from call/put positioning. Positive = call-price dominance, negative = put-price dominance.', locale === 'ko' ? 'OPI 설명' : 'OPI Info')}
            <div className="app-card-head" style={{ marginBottom: 0 }}>
              <span className="app-card-title" style={{ display: 'inline-flex', alignItems: 'center', color: '#f8fafc', fontWeight: 800 }}>
                {t.opiGauge}
                <InfoBtn popKey="opi" />
                <span style={{ 
                  fontSize: '8px', 
                  fontWeight: 900, 
                  background: opiCalculated.isFallback ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)', 
                  color: opiCalculated.isFallback ? '#f43f5e' : '#10b981',
                  border: `1px solid ${opiCalculated.isFallback ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
                  padding: '2.5px 7px', 
                  borderRadius: '12px', 
                  marginLeft: '8px',
                  verticalAlign: 'middle',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em'
                }}>
                  {opiCalculated.isFallback ? (locale === 'ko' ? '장마감' : 'Closed') : (locale === 'ko' ? '장중 작동' : 'Intraday')}
                </span>
              </span>
              <span style={{ font: 'var(--f-micro)', fontWeight: 900, color: gaugeColor, letterSpacing: '0.05em' }}>{gaugeStatus}</span>
            </div>

            {/* Semi-circular Gauge */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 12, position: 'relative', height: '115px' }}>
              <svg width="190" height="105" viewBox="0 0 180 100">
                <defs>
                  <linearGradient id="opiGaugeGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#f43f5e" />
                    <stop offset="50%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#10b981" />
                  </linearGradient>
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
                {/* Arc track */}
                <path
                  d={describeArc(90, 90, 80, -90, 90)}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.04)"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                {/* Filled arc with gradient */}
                <path
                  d={describeArc(90, 90, 80, -90, -90 + (opi / 100) * 180)}
                  fill="none"
                  stroke="url(#opiGaugeGrad)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  style={{ filter: 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.25))' }}
                />
                {/* Dial center pin */}
                <circle cx="90" cy="90" r="4.5" fill="#f8fafc" />
                {/* Dial hand */}
                <line
                  x1="90"
                  y1="90"
                  x2="90"
                  y2="30"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  style={{
                    transform: `rotate(${rotationAngle}deg)`,
                    transformOrigin: '90px 90px',
                    transition: 'transform 1.2s cubic-bezier(0.19, 1, 0.22, 1)',
                    filter: 'drop-shadow(0 0 3px rgba(255, 255, 255, 0.6))'
                  }}
                />
              </svg>
              {/* Positioned value badge below the hand but inside the arc */}
              <div style={{ position: 'absolute', bottom: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span className="tnum" style={{ font: 'var(--f-display)', fontSize: '32px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.03em', textShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
                  {opi.toFixed(1)}
                </span>
                <span style={{ font: 'var(--f-micro)', fontWeight: 800, color: 'var(--text-muted)', fontSize: '8.5px', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '-4px' }}>
                  OPI SCORE
                </span>
              </div>
            </div>

            {/* PCR Summary */}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.05)', marginTop: 14, paddingTop: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.pcRatio}</span>
                <span className="tnum" style={{ font: 'var(--f-body)', fontWeight: 800, color: '#ffffff', marginTop: 4 }}>{pcRatio.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{locale === 'ko' ? '기초자산 OPI' : 'Underlying OPI'}</span>
                <span className="tnum" style={{ font: 'var(--f-body)', fontWeight: 800, color: gaugeColor, marginTop: 4 }}>{opi.toFixed(0)} ({gaugeStatus})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.regime}</span>
                <span style={{ 
                  font: 'var(--f-micro)', 
                  fontWeight: 900, 
                  color: volRegime === 'ERUPTING' ? '#f43f5e' : volRegime === 'LOADED' ? '#fbbf24' : '#10b981',
                  background: volRegime === 'ERUPTING' ? 'rgba(239, 68, 68, 0.08)' : volRegime === 'LOADED' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                  border: `1px solid ${volRegime === 'ERUPTING' ? 'rgba(239, 68, 68, 0.15)' : volRegime === 'LOADED' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)'}`,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  marginTop: 4,
                  letterSpacing: '0.03em'
                }}>
                  {volRegime}
                </span>
              </div>
            </div>
          </div>

          {/* Sentiment & Squeeze Grid (Module 2) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Left Card: Composite Index */}
            {(() => {
              const compStatus = compositeIndex >= 65 ? (locale === 'ko' ? '강세 수급' : 'Strong Bullish') : compositeIndex >= 40 ? (locale === 'ko' ? '중립 혼조' : 'Neutral Mixed') : (locale === 'ko' ? '약세 흐름' : 'Bearish Flow');
              const compColor = compositeIndex >= 65 ? '#10b981' : compositeIndex >= 40 ? '#fbbf24' : '#f43f5e';
              const radius = 24;
              const circum = 2 * Math.PI * radius;
              const strokeDashoffset = circum - (compositeIndex / 100) * circum;
              
              return (
                <div className="premium-card" style={{ padding: '16px 14px', margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', position: 'relative' }}>
                  {renderPopover('composite', locale === 'ko' ? '종합 수급 지수. GEX 레짐, OPI, IV Rank, PC Ratio 등 9가지 핵심 지표의 방향 일치도를 가중치 점수화한 지표입니다.' : 'Multi-indicator composite — direction alignment score across 9 core indicators (flow, gamma, IV, short interest, etc.).', locale === 'ko' ? '종합지수 설명' : 'Composite Info')}
                  <span className="app-card-title" style={{ fontSize: '10px', alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {locale === 'ko' ? '종합 수급 지수' : 'Composite Index'}
                    <InfoBtn popKey="composite" />
                  </span>
                  <div style={{ position: 'relative', width: '64px', height: '64px', marginTop: '2px' }}>
                    <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="32" cy="32" r={radius} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="3" />
                      <circle cx="32" cy="32" r={radius} fill="none" stroke={compColor} strokeWidth="3" strokeDasharray={circum} strokeDashoffset={strokeDashoffset} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${compColor})` }} />
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', font: 'var(--f-small)', fontWeight: 900, color: '#ffffff', fontSize: '13px' }}>
                      {compositeIndex}%
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: compColor, letterSpacing: '0.02em' }}>{compStatus}</span>
                </div>
              );
            })()}

            {/* Right Card: Squeeze Probability */}
            {(() => {
              const sqStatus = squeezeProb >= 70 ? (locale === 'ko' ? '높음 (위험)' : 'High Squeeze') : squeezeProb >= 40 ? (locale === 'ko' ? '보통 (대기)' : 'Moderate') : (locale === 'ko' ? '낮음 (안정)' : 'Low Squeeze');
              const sqColor = squeezeProb >= 70 ? '#f43f5e' : squeezeProb >= 40 ? '#fbbf24' : '#10b981';
              const radius = 24;
              const circum = 2 * Math.PI * radius;
              const strokeDashoffset = circum - (squeezeProb / 100) * circum;

              return (
                <div className="premium-card" style={{ padding: '16px 14px', margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', position: 'relative' }}>
                  {renderPopover('squeeze', locale === 'ko' ? '숏 스퀴즈 발생 확률. 공매도 비율, 대차 잔고, Days to Cover(DTC) 등을 종합 분석하여 숏 스퀴즈 유발 압력을 보여줍니다.' : 'Short squeeze indicator — combines short interest, utilization rate & DTC. Higher values indicate increased squeeze pressure.', locale === 'ko' ? '스퀴즈 확률 설명' : 'Squeeze Info')}
                  <span className="app-card-title" style={{ fontSize: '10px', alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {locale === 'ko' ? '스퀴즈 분출 확률' : 'Squeeze Probability'}
                    <InfoBtn popKey="squeeze" />
                  </span>
                  <div style={{ position: 'relative', width: '64px', height: '64px', marginTop: '2px' }}>
                    <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="32" cy="32" r={radius} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="3" />
                      <circle cx="32" cy="32" r={radius} fill="none" stroke={sqColor} strokeWidth="3" strokeDasharray={circum} strokeDashoffset={strokeDashoffset} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${sqColor})` }} />
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', font: 'var(--f-small)', fontWeight: 900, color: '#ffffff', fontSize: '13px' }}>
                      {squeezeProb}%
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: sqColor, letterSpacing: '0.02em' }}>{sqStatus}</span>
                </div>
              );
            })()}
          </div>

          {/* Premium Total Option Flows (Module 3) */}
          <div className="premium-card" style={{ padding: '18px 16px', margin: 0 }}>
            <div className="app-card-head" style={{ marginBottom: '8px' }}>
              <span className="app-card-title" style={{ color: 'var(--text-muted)', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.totalPremium}</span>
              <span className="tnum" style={{ font: 'var(--f-h2)', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em' }}>
                ${(totalPrem / 1000000).toFixed(1)}M
              </span>
            </div>
            
            <div style={{ background: 'rgba(255,255,255,0.02)', height: '8px', borderRadius: '4px', overflow: 'hidden', display: 'flex', margin: '6px 0 14px', border: '1px solid rgba(255,255,255,0.03)' }}>
              <div style={{ width: `${callPct}%`, background: 'linear-gradient(90deg, #10b981, #34d399)', height: '100%' }} />
              <div style={{ width: `${100 - callPct}%`, background: 'linear-gradient(90deg, #ef4444, #f43f5e)', height: '100%' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-dim)', fontWeight: 600 }}>{t.callBullish}</span>
                <span className="tnum" style={{ font: 'var(--f-micro)', fontWeight: 800, color: '#10b981' }}>{callPct.toFixed(1)}%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-dim)', fontWeight: 600 }}>{t.putBearish}</span>
                <span className="tnum" style={{ font: 'var(--f-micro)', fontWeight: 800, color: '#ef4444' }}>{(100 - callPct).toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* Spot Price Positioning Ruler (Module 4) */}
          {(() => {
            const floor = putFloorVal || (displayPrice * 0.95);
            const wall = callWallVal || (displayPrice * 1.05);
            const range = wall - floor || 1;
            const pct = Math.max(2, Math.min(98, ((displayPrice - floor) / range) * 100));

            return (
              <div className="premium-card" style={{ padding: '18px 16px', margin: 0, position: 'relative' }}>
                {renderPopover('ruler', locale === 'ko' ? '현재가 위치 자. 풋 플로어(지지선, 하한)와 콜 월(저항선, 상한) 사이에서 현재 주가의 상대적인 위치를 백분율(%)로 표시합니다.' : 'Current price position ruler showing relative percentage between Put Floor (Support) and Call Wall (Resistance).', locale === 'ko' ? '현재가 위치 설명' : 'Ruler Info')}
                <span className="app-card-title" style={{ display: 'inline-flex', alignItems: 'center', marginBottom: '18px', color: 'var(--text-muted)', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {locale === 'ko' ? '현재가 위치 (Spot Price Position)' : 'Spot Price Position Ruler'}
                  <InfoBtn popKey="ruler" />
                </span>
                
                {/* Ruler track */}
                <div style={{ 
                  position: 'relative', 
                  height: '8px', 
                  background: 'rgba(255, 255, 255, 0.04)', 
                  borderRadius: '4px', 
                  margin: '30px 8px 18px',
                  border: '1px solid rgba(255, 255, 255, 0.02)'
                }}>
                  {/* Subtle technical tick marks behind slider */}
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05) 1px, transparent 1px, transparent 10px)',
                    borderRadius: '4px'
                  }} />
                  
                  {/* Glowing center indicator bar */}
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.12) 0%, rgba(245, 158, 11, 0.06) 50%, rgba(16, 185, 129, 0.12) 100%)', borderRadius: '4px' }} />
                  
                  {/* Floating Price Pin with Tooltip */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${pct}%`,
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      zIndex: 3,
                    }}
                  >
                    {/* Tooltip box above the pin */}
                    <div style={{
                      position: 'absolute',
                      bottom: '14px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'rgba(6, 182, 212, 0.95)',
                      border: '1px solid rgba(34, 211, 238, 0.4)',
                      boxShadow: '0 4px 14px rgba(6, 182, 212, 0.3)',
                      color: '#050a14',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      font: 'var(--f-micro)',
                      fontWeight: 900,
                      fontSize: '10px',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                    }}>
                      <span>${displayPrice.toFixed(2)}</span>
                      <span style={{ opacity: 0.8 }}>({pct.toFixed(0)}%)</span>
                    </div>
                    {/* Tooltip arrow */}
                    <div style={{
                      position: 'absolute',
                      bottom: '10px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 0,
                      height: 0,
                      borderLeft: '4px solid transparent',
                      borderRight: '4px solid transparent',
                      borderTop: '4px solid rgba(6, 182, 212, 0.95)',
                      zIndex: 4,
                    }} />
                    {/* Glowing marker dot */}
                    <div style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: 'var(--cyan)',
                      border: '2.5px solid #ffffff',
                      boxShadow: '0 0 10px var(--cyan), 0 0 4px #ffffff',
                    }} />
                  </div>
                </div>

                {/* Left & Right Anchors */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', font: 'var(--f-micro)', fontWeight: 700, padding: '0 4px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: '#ef4444', fontSize: '9px', letterSpacing: '0.04em' }}>PUT FLOOR ({t.support})</span>
                    <span className="tnum" style={{ fontSize: '13px', fontWeight: 900, color: '#f8fafc', marginTop: '3px' }}>${floor.toFixed(0)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ color: '#10b981', fontSize: '9px', letterSpacing: '0.04em' }}>CALL WALL ({t.resistance})</span>
                    <span className="tnum" style={{ fontSize: '13px', fontWeight: 900, color: '#f8fafc', marginTop: '3px' }}>${wall.toFixed(0)}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Options Market & GEX Regime Monitor (Module 5) */}
          {(() => {
            const gammaFlipNum = typeof liveGammaFlip === 'number'
              ? liveGammaFlip
              : parseFloat((liveGammaFlip || '').replace(/[^0-9.]/g, '')) || 0;
            const isAboveGamma = displayPrice >= gammaFlipNum;
            const gexRegimeColor = isAboveGamma ? '#10b981' : '#ef4444';
            const gexRegimeLabel = isAboveGamma 
              ? (locale === 'ko' ? 'LONG GAMMA (안정적 레짐)' : 'LONG GAMMA (STABLE)')
              : (locale === 'ko' ? 'SHORT GAMMA (변동성 레짐)' : 'SHORT GAMMA (VOLATILE)');

            return (
              <div className="premium-card" style={{ padding: '18px 16px', margin: 0, position: 'relative' }}>
                {renderPopover('gex', locale === 'ko' ? '감마 익스포저 레짐. 양(+)의 감마(Long Gamma)는 변동성을 억제하여 주가를 안정시키며, 음(-)의 감마(Short Gamma)는 변동성을 증폭시키는 환경을 의미합니다.' : 'GEX Regime indicates market volatility suppression (Long Gamma) vs amplification (Short Gamma).', locale === 'ko' ? '감마 레짐 설명' : 'Regime Info')}
                <div className="app-card-head" style={{ marginBottom: '14px', alignItems: 'center' }}>
                  <span className="app-card-title" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    OPTIONS MARKET & GEX REGIME
                    <InfoBtn popKey="gex" />
                  </span>
                  <span style={{
                    fontSize: '8px',
                    fontWeight: 900,
                    padding: '3px 8px',
                    borderRadius: '12px',
                    background: isAboveGamma ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                    color: gexRegimeColor,
                    border: `1px solid ${isAboveGamma ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em'
                  }}>
                    {gexRegimeLabel}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
                  <div style={{ background: 'rgba(30, 41, 59, 0.2)', padding: '11px 8px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '9px', textTransform: 'uppercase' }}>IV Rank</div>
                    <div className="tnum" style={{ font: 'var(--f-body)', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>{ivRankVal != null ? `${ivRankVal}%` : '—'}</div>
                  </div>
                  <div style={{ background: 'rgba(30, 41, 59, 0.2)', padding: '11px 8px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '9px', textTransform: 'uppercase' }}>IV Skew</div>
                    <div className="tnum" style={{ font: 'var(--f-body)', fontWeight: 900, color: '#f43f5e', marginTop: '4px' }}>{ivSkewVal != null ? `${ivSkewVal.toFixed(1)}%` : '—'}</div>
                  </div>
                  <div style={{ background: 'rgba(30, 41, 59, 0.2)', padding: '11px 8px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '9px', textTransform: 'uppercase' }}>Volume P/C</div>
                    <div className="tnum" style={{ font: 'var(--f-body)', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>{pcRatio.toFixed(2)}</div>
                  </div>
                </div>

                <div style={{ 
                  font: 'var(--f-micro)', 
                  fontWeight: 600,
                  color: '#b4c6ef', 
                  background: 'rgba(6, 182, 212, 0.04)', 
                  border: '1px solid rgba(6, 182, 212, 0.15)', 
                  borderRadius: '8px', 
                  padding: '10px 12px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '10px',
                  lineHeight: 1.4
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cyan)', boxShadow: '0 0 6px var(--cyan)', flexShrink: 0 }} />
                  <span>{regimeInsight}</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}
      {/* 2. AI INTEL TAB */}
      {activeTab === 'ai-intel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 16px var(--s4)' }} className="animate-in fade-in duration-200">
          {/* AI VERDICT GAUGE */}
          <div className="premium-card animate-glow" style={{ padding: '18px 16px', margin: 0, position: 'relative', borderTop: 'none', borderTopLeftRadius: '0px', borderTopRightRadius: '0px' }}>
            <div className="app-card-head" style={{ marginBottom: '14px', alignItems: 'center' }}>
              <span className="app-card-title" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                AI VERDICT
              </span>
              <span style={{
                fontSize: '9px',
                fontWeight: 900,
                padding: '3px 8px',
                borderRadius: '12px',
                ...aiVerdictBadgeStyle,
                textTransform: 'uppercase',
                letterSpacing: '0.06em'
              }}>
                {aiVerdictLabel}
              </span>
            </div>

            {/* Composite Slider Track */}
            {(() => {
              const posPct = ((compositeScore + 100) / 200) * 100;
              const scoreColor = compositeScore > 20 
                ? '#10b981' 
                : compositeScore < -20 
                ? '#ef4444' 
                : '#f59e0b';
              
              return (
                <div style={{ marginBottom: '20px', background: 'rgba(30, 41, 59, 0.15)', padding: '14px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.04em' }}>
                      {locale === 'ko' ? '분석 종합' : 'ANALYSIS VERDICT'}
                    </span>
                    <span className="tnum" style={{ fontSize: '15px', fontWeight: 900, color: scoreColor, textShadow: `0 0 8px ${scoreColor}40` }}>
                      {compositeScore > 0 ? '+' : ''}{compositeScore}
                    </span>
                  </div>
                  
                  {/* Slider Track */}
                  <div style={{ position: 'relative', height: '6px', borderRadius: '3px', background: 'linear-gradient(90deg, #ef4444 0%, #1e293b 45%, #1e293b 55%, #10b981 100%)', border: '1px solid rgba(255,255,255,0.05)', margin: '10px 0' }}>
                    {/* Center Mark */}
                    <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.2)' }} />
                    
                    {/* Glowing Pin */}
                    <div style={{
                      position: 'absolute',
                      left: `calc(${posPct}% - 4px)`,
                      top: '-5px',
                      width: '8px',
                      height: '16px',
                      borderRadius: '4px',
                      background: '#ffffff',
                      boxShadow: `0 0 10px ${scoreColor}, 0 0 4px #ffffff`,
                      border: `1.5px solid ${scoreColor}`,
                      zIndex: 3,
                      transition: 'left 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)'
                    }} />
                  </div>
                  
                  {/* Labels */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <span>{locale === 'ko' ? '극하락 (-100)' : 'EXT BEARISH (-100)'}</span>
                    <span>{locale === 'ko' ? '중립 (0)' : 'NEUTRAL (0)'}</span>
                    <span>{locale === 'ko' ? '극상승 (+100)' : 'EXT BULLISH (+100)'}</span>
                  </div>
                </div>
              );
            })()}

            {/* 9-Factor Option Sentiment Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {(() => {
                const factors = [
                  {
                    id: 'opi',
                    name: locale === 'ko' ? '옵션 압박 (OPI)' : 'OPI',
                    value: `${opiScore >= 0 ? '+' : ''}${Math.round(opiScore)}`,
                    score: opiScore,
                    maxScore: 25,
                    info: locale === 'ko' ? '옵션 압박 지수 (OPI)는 콜과 풋 옵션 프리미엄의 매수 세기 비율을 지수화한 것입니다.' : 'Options Pressure Index measures the buying strength ratio of call vs put premiums.'
                  },
                  {
                    id: 'whale',
                    name: locale === 'ko' ? '고래 포지션' : 'Whale Net',
                    value: `${whaleScore >= 0 ? '+' : ''}${Math.round(whaleScore)}`,
                    score: whaleScore,
                    maxScore: 25,
                    info: locale === 'ko' ? '기관 및 대형 고래 투자자의 옵션 순거래 방향과 총 매수 규모를 추적한 지표입니다.' : 'Tracks the net trading direction and total premium size of institutions.'
                  },
                  {
                    id: 'squeeze',
                    name: locale === 'ko' ? '스퀴즈 확률' : 'Squeeze',
                    value: `${squeezeScore >= 0 ? '+' : ''}${Math.round(squeezeScore)}`,
                    score: squeezeScore,
                    maxScore: 15,
                    info: locale === 'ko' ? '공매도 비중과 내재변동성(IV) 분석을 바탕으로 숏 스퀴즈 발생 잠재력을 나타냅니다.' : 'Indicates short squeeze potential based on short volume and IV rank.'
                  },
                  {
                    id: 'skew',
                    name: locale === 'ko' ? 'IV 스큐' : 'IV Skew',
                    value: `${skewScore >= 0 ? '+' : ''}${Math.round(skewScore)}`,
                    score: skewScore,
                    maxScore: 15,
                    info: locale === 'ko' ? '콜 옵션과 풋 옵션 간 내재변동성의 차이(기울기)를 측정하여 하방 베팅 강도를 탐색합니다.' : 'Measures the difference in implied volatility between OTM calls and puts.'
                  },
                  {
                    id: 'smart',
                    name: locale === 'ko' ? '스마트머니' : 'Smart Money',
                    value: `${smartScore >= 0 ? '+' : ''}${Math.round(smartScore)}`,
                    score: smartScore,
                    maxScore: 10,
                    info: locale === 'ko' ? '비공개 블록딜 거래 및 장외 기관 주문 흐름(Smart Money)을 분석하여 가중치를 부여합니다.' : 'Analyzes private block trades and over-the-counter institutional orders.'
                  },
                  {
                    id: 'dex',
                    name: locale === 'ko' ? '감마노출 (DEX)' : 'DEX Gamma',
                    value: `${dexScore >= 0 ? '+' : ''}${Math.round(dexScore)}`,
                    score: dexScore,
                    maxScore: 10,
                    info: locale === 'ko' ? '기초자산 가격과 감마 플립 레벨 간 이격도를 측정하여 딜러의 델타 헤징 압력을 추적합니다.' : 'Tracks dealer delta-hedging pressure by measuring distance to Gamma Flip.'
                  },
                  {
                    id: 'uoa',
                    name: locale === 'ko' ? '이례적 UOA' : 'Unusual UOA',
                    value: `${uoaScore >= 0 ? '+' : ''}${Math.round(uoaScore)}`,
                    score: uoaScore,
                    maxScore: 5,
                    info: locale === 'ko' ? '일반적인 수준을 넘어서는 대규모 또는 갑작스러운 이례적 옵션 수급(UOA) 강도를 추적합니다.' : 'Tracks unusual option activity volume multiples.'
                  },
                  {
                    id: 'pc',
                    name: locale === 'ko' ? '풋/콜 비율' : 'P/C Ratio',
                    value: `${pcScore >= 0 ? '+' : ''}${Math.round(pcScore)}`,
                    score: pcScore,
                    maxScore: 5,
                    info: locale === 'ko' ? '시장 전체의 풋 옵션 거래량 대비 콜 옵션 거래량의 상대적 비율을 점수화한 지표입니다.' : 'Scores the volume ratio of put options relative to call options.'
                  },
                  {
                    id: 'gex',
                    name: locale === 'ko' ? '감마 레짐' : 'GEX Regime',
                    value: `${zdteScore >= 0 ? '+' : ''}${Math.round(zdteScore)}`,
                    score: zdteScore,
                    maxScore: 5,
                    info: locale === 'ko' ? '시장 감마 환경을 나타내며, 롱 감마 레짐은 안정적 흐름, 숏 감마 레짐은 변동성 확대를 의미합니다.' : 'Indicates overall market gamma volatility regime.'
                  }
                ];

                return factors.map((f) => (
                  <div key={f.id} style={{
                    background: 'rgba(30, 41, 59, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '8px',
                    padding: '12px 6px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    position: 'relative',
                    minHeight: '84px',
                    justifyContent: 'space-between',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', gap: '1px' }}>
                      <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {f.name}
                      </span>
                      <InfoBtn popKey={f.id} />
                    </div>

                    <div className="tnum" style={{ fontSize: '17px', fontWeight: 900, color: '#f8fafc', margin: '3px 0' }}>
                      {f.value}
                    </div>

                    <div style={{ position: 'relative', width: '85%', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', margin: '2px auto 0' }}>
                      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.3)', zIndex: 2 }} />
                      {f.score !== 0 && (() => {
                        const pct = Math.min(100, (Math.abs(f.score) / f.maxScore) * 50);
                        const isPositive = f.score > 0;
                        return (
                          <div style={{
                            position: 'absolute',
                            left: isPositive ? '50%' : `calc(50% - ${pct}%)`,
                            width: `${pct}%`,
                            height: '100%',
                            background: isPositive ? 'linear-gradient(90deg, #10b981, #059669)' : 'linear-gradient(90deg, #dc2626, #ef4444)',
                            borderRadius: '1px',
                            boxShadow: isPositive ? '0 0 4px rgba(16,185,129,0.4)' : '0 0 4px rgba(239,68,68,0.4)'
                          }} />
                        );
                      })()}
                    </div>
                    {renderPopover(f.id, f.info, f.name)}
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* AI FLOW INTELLIGENCE */}
          <div className="premium-card" style={{ padding: '18px 16px', margin: 0, position: 'relative' }}>
            <div className="app-card-head" style={{ marginBottom: '14px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="var(--cyan)" strokeWidth="1.5" />
                  <path d="M12 8v4l3 3" stroke="var(--cyan)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span className="app-card-title" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {locale === 'ko' ? 'AI 플로우 인텔리전스' : locale === 'ja' ? 'AIフロー・インテリジェンス' : 'AI FLOW INTELLIGENCE'}
                </span>
              </div>
              <span style={{ fontSize: '10px', fontWeight: 900, background: 'rgba(6, 182, 212, 0.08)', color: 'var(--cyan)', border: '1px solid rgba(6, 182, 212, 0.2)', padding: '2px 8px', borderRadius: '12px', letterSpacing: '0.06em' }}>
                Claude
              </span>
            </div>
            
            {(() => {
              const aiTitle = locale === 'ko' ? '구조적 분배 분석 (Structural Distribution)'
                : locale === 'ja' ? '構造的分配分析 (Structural Distribution)'
                : 'Structural Distribution';

              const aiDesc = locale === 'ko' ? `기관 풋-헤지 포지션 확대, OPI ||| - 하방 수급이 콜을 압도. 약감마(Short Gamma) 전환 임계점에 접근 중이며, Put Wall($200, 4.6%) 이탈 시 재가격 가능성이 높아집니다.`
                : locale === 'ja' ? `機関投資家のプットヘッジポジション拡大、OPI ||| - 下方の需給がコールを圧倒。ショートガンマ（Short Gamma）転換の閾値に接近中であり、Put Wall（$200、4.6%）を下抜けた場合、リプライシングの可能性が高まります。`
                : `Institutional put-hedge positions are expanding, OPI ||| - downside liquidity dominates calls. Approaching the short gamma transition threshold, repricing probability increases if the Put Wall ($200, 4.6%) is breached.`;

              const insightHeader = locale === 'ko' ? '핵심 맥락 인사이트 4'
                : locale === 'ja' ? '主要な背景インサイト 4'
                : 'Key Context Insights (4)';

              const bullets = locale === 'ko' ? [
                `${ticker}는 현가 $${displayPrice.toFixed(2)}에서 강한 공매도 고래 포지셔닝($15.5M)과 종합적 OPI(+3)의 불일치를 나타내고 있으며, 이는 기관들이 단기 하방성 약세 베팅을 구축하는 와중에도 옵션 시장 구조는 아직 하향성 협의를 형성하지 않았음을 시사한다.`,
                `감마 플립 레벨($207)이 핸들 바로 아래에 위치한 상황에서 $200 풋 플로어와 $220 콜 월 사이의 좁은 거래 범위는 딜러 헤지 매락이 현재 양방향 모두에서 패널을 가하고 있음을 나타낸다.`,
                `만기 주간 $210 / $215 콜 감마 집중이 강한 저항으로 작용하고 있으며, $200 부근의 기관 풋 차단벽이 하단을 지지하고 있다.`,
                `다크풀의 대량 체결비율(50.8%)을 고려할 때 현 위치에서의 소폭 횡보세 이후 돌파 방향성 탐색 시나리오가 유력하다.`
              ] : locale === 'ja' ? [
                `${ticker}は現在値$${displayPrice.toFixed(2)}において、強力な空売りクジラポジション（$15.5M）と総合的なOPI（+3）の乖離を示しており、これは機関投資家が短期的な下落方向の弱気ベッティングを構築している最中であっても、オプション市場構造はまだ下落方向の合意を形成していないことを示唆しています。`,
                `ガンマフリップレベル（$207）が現在の株価のすぐ下に位置する状況で、$200プットフロアと$220コールウォールの間の狭い取引レンジは、ディーラーのヘッジフローが現在双方向で圧力をかけていることを示しています。`,
                `満期週の$210 / $215コールガンマの集中が強力な抵抗として作用しており、$200付近の機関投資家のプット障壁が下値を支持しています。`,
                `ダークプールの大量約定比率（50.8%）を考慮すると、現在の水準での小幅な横ばい推移の後、ブレイクアウトの方向性を模索するシナリオが有力です。`
              ] : [
                `${ticker} shows a divergence between strong short whale positioning ($15.5M) at the current price of $${displayPrice.toFixed(2)} and the composite OPI (+3), suggesting that although institutions are building short-term bearish bets, the options market structure has not yet reached a downward consensus.`,
                `With the Gamma Flip level ($207) situated just below the handle, the tight trading range between the $200 Put Floor and the $220 Call Wall indicates that dealer hedging flow is currently exerting pressure in both directions.`,
                `Expiration week Call Gamma concentration at $210 / $215 is acting as strong resistance, while the institutional Put wall near $200 supports the downside.`,
                `Considering the heavy Dark Pool execution ratio (50.8%), the most likely scenario is a brief consolidation at the current level followed by a directional breakout search.`
              ];

              const triggerLabel = locale === 'ko' ? '재가격 조건' : locale === 'ja' ? 'リプライシング条件' : 'Repricing Condition';
              const triggerValue = locale === 'ko' ? '풋 임계값 이탈' : locale === 'ja' ? 'プット閾値の逸脱' : 'Put Threshold Breach';

              return (
                <>
                  <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#b4c6ef', background: 'rgba(30, 41, 59, 0.15)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.02)' }}>
                    <div style={{ fontWeight: 800, color: '#ffffff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: 'var(--cyan)' }}>✦</span> {aiTitle}
                    </div>
                    {aiDesc}
                  </div>

                  {/* Bullet Insights */}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '14px', marginTop: '14px', position: 'relative' }}>
                    <ValueWall
                      title={locale === 'ko' ? 'AI 핵심 맥락 잠금해제' : 'Unlock AI Insights'}
                      subtitle={locale === 'ko' ? '광고 시청 후 1시간 동안 AI 상세 맥락 분석을 해제합니다.' : 'Watch an ad to unlock AI insights for 1 hour.'}
                      socialProof={locale === 'ko' ? '오늘 14.2K 잠금해제' : '14.2K unlocked today'}
                      onUnlock={() => setIsLocked(false)}
                      lockedPreview={
                        <div style={{ opacity: 0.12, filter: 'blur(3.5px)', pointerEvents: 'none' }}>
                          <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {insightHeader}
                          </div>
                          <ul style={{ paddingLeft: '0', margin: 0, display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12.5px', lineHeight: '1.6' }}>
                            <li style={{ listStyleType: 'none', position: 'relative', paddingLeft: '16px', color: '#b4c6ef' }}>
                              <span style={{ position: 'absolute', left: 0, color: 'var(--cyan)', fontWeight: 'bold' }}>•</span>
                              {bullets[0]}
                            </li>
                            <li style={{ listStyleType: 'none', position: 'relative', paddingLeft: '16px', color: '#b4c6ef' }}>
                              <span style={{ position: 'absolute', left: 0, color: 'var(--cyan)', fontWeight: 'bold' }}>•</span>
                              {bullets[1]}
                            </li>
                          </ul>
                        </div>
                      }
                    >
                      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {insightHeader}
                      </div>
                      <ul style={{
                        paddingLeft: '0',
                        margin: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        fontSize: '12.5px',
                        lineHeight: '1.6'
                      }}>
                        {bullets.map((txt, idx) => (
                          <li key={idx} style={{
                            listStyleType: 'none',
                            position: 'relative',
                            paddingLeft: '16px',
                            color: '#b4c6ef',
                          }}>
                            <span style={{
                              position: 'absolute',
                              left: 0,
                              color: 'var(--cyan)',
                              fontWeight: 'bold'
                            }}>•</span>
                            {txt}
                          </li>
                        ))}
                      </ul>
                    </ValueWall>
                  </div>

                  {/* Trigger condition */}
                  <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(245, 158, 11, 0.04)', border: '1px solid rgba(245, 158, 11, 0.15)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{triggerLabel}</span>
                      <span style={{ font: 'var(--f-small)', fontWeight: 800, color: '#ffffff', marginTop: '2px', display: 'block' }}>{triggerValue}</span>
                    </div>
                    <span style={{ fontSize: '9px', fontWeight: 900, background: 'rgba(245, 158, 11, 0.08)', color: 'var(--amber)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '3px 8px', borderRadius: '12px', letterSpacing: '0.04em' }}>
                      RISK: MEDIUM
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}{/* 3. FLOW (WHALE RADAR) TAB */}
      {activeTab === 'whale-flow' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 16px var(--s4)' }} className="animate-in fade-in duration-200">
            {/* TODAY'S WHALE FLOW & SUMMARY WIDGET */}
            {(() => {
              const whaleTotalVol = totalPrem;
              const whaleNetBet = netWhalePremium;
              const whaleCallPrem = Math.max(0, (whaleTotalVol + whaleNetBet) / 2);
              const whalePutPrem = Math.max(0, (whaleTotalVol - whaleNetBet) / 2);
              const callPctShare = whaleTotalVol > 0 ? (whaleCallPrem / whaleTotalVol) * 100 : 50;
              const putPctShare = whaleTotalVol > 0 ? (whalePutPrem / whaleTotalVol) * 100 : 50;

              return (
                <div className="premium-card animate-glow" style={{ padding: '18px 16px', margin: 0, borderTop: 'none', borderTopLeftRadius: '0px', borderTopRightRadius: '0px' }}>
                  <div className="app-card-head" style={{ marginBottom: '14px', alignItems: 'center' }}>
                    <span className="app-card-title" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {locale === 'ko' ? '기관 고래 주문 총합' : "TODAY'S WHALE FLOW"}
                    </span>
                    <span style={{
                      fontSize: '8px',
                      fontWeight: 900,
                      padding: '3px 8px',
                      borderRadius: '12px',
                      background: 'rgba(6, 182, 212, 0.08)',
                      color: 'var(--cyan)',
                      border: '1px solid rgba(6, 182, 212, 0.2)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em'
                    }}>
                      {locale === 'ko' ? '실시간 집계' : 'LIVE ACCUM'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px' }}>
                    <div>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                        {locale === 'ko' ? '당일 고래 누적 거래대금' : 'Whale Total Volume'}
                      </span>
                      <span className="tnum" style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em', marginTop: '2px', display: 'block' }}>
                        ${(whaleTotalVol / 1000000).toFixed(2)}M
                      </span>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700 }}>
                      <span style={{ color: '#10b981', marginRight: '8px' }}>C ${(whaleCallPrem / 1000000).toFixed(1)}M</span>
                      <span style={{ color: '#ef4444' }}>P ${(whalePutPrem / 1000000).toFixed(1)}M</span>
                    </div>
                  </div>

                  {/* Dual Distribution Bar */}
                  <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex', marginBottom: '16px' }}>
                    <div style={{ width: `${callPctShare}%`, background: 'linear-gradient(90deg, #059669, #10b981)', transition: 'width 0.4s ease' }} />
                    <div style={{ width: `${putPctShare}%`, background: 'linear-gradient(90deg, #ef4444, #dc2626)', transition: 'width 0.4s ease' }} />
                  </div>

                  {/* Three metrics */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '14px' }}>
                    <div style={{ background: 'rgba(30, 41, 59, 0.15)', padding: '10px 8px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.02)' }}>
                      <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontWeight: 800, fontSize: '9px', textTransform: 'uppercase' }}>Dark Pool %</div>
                      <div className="tnum" style={{ font: 'var(--f-body)', fontWeight: 900, color: 'var(--cyan)', marginTop: '4px' }}>{dpPct}</div>
                      <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontSize: '8px', display: 'block', marginTop: '2px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {dpNetBuyStr}
                      </span>
                    </div>
                    <div style={{ background: 'rgba(30, 41, 59, 0.15)', padding: '10px 8px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.02)' }}>
                      <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontWeight: 800, fontSize: '9px', textTransform: 'uppercase' }}>Short Vol %</div>
                      <div className="tnum" style={{ font: 'var(--f-body)', fontWeight: 900, color: '#f43f5e', marginTop: '4px' }}>{shortPct}</div>
                      <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontSize: '8px', display: 'block', marginTop: '2px' }}>
                        {locale === 'ko' ? '일일 공매도' : 'Daily Short'}
                      </span>
                    </div>
                    <div style={{ background: 'rgba(30, 41, 59, 0.15)', padding: '10px 8px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.02)' }}>
                      <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontWeight: 800, fontSize: '9px', textTransform: 'uppercase' }}>Block Trades</div>
                      <div className="tnum" style={{ font: 'var(--f-body)', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>{blockCount}</div>
                      <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontSize: '8px', display: 'block', marginTop: '2px' }}>
                        {locale === 'ko' ? '대량 체결' : 'Block Trades'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* VALUE WALL / PREMIUM OPTIONS TABLE */}
            <div style={{ position: 'relative', overflow: 'hidden', background: 'rgba(30, 41, 59, 0.12)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', padding: '12px' }}>
              {/* Sub-Tab Selector */}
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '3px', borderRadius: '8px', marginBottom: '14px' }}>
                <button
                  onClick={() => setFlowTab('whale')}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: '6px',
                    border: 'none',
                    background: flowTab === 'whale' ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                    color: flowTab === 'whale' ? 'var(--cyan)' : 'var(--text-muted)',
                    fontSize: '10px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {t.whaleRadar}
                </button>
                <button
                  onClick={() => setFlowTab('darkpool')}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: '6px',
                    border: 'none',
                    background: flowTab === 'darkpool' ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                    color: flowTab === 'darkpool' ? 'var(--cyan)' : 'var(--text-muted)',
                    fontSize: '10px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {t.darkPoolTitle || 'Dark Pool & Block Trades'}
                </button>
              </div>

              {/* Horizontal Scroll Deck wrapped in ValueWall */}
              <ValueWall
                title={locale === 'ko' ? '기관급 실시간 옵션 체인' : locale === 'ja' ? '機関レベルのオプションチェーン' : 'Institutional Options Chain'}
                subtitle={<>{locale === 'ko' ? '실시간 고래 거래 + 다크풀 플로우, ' : locale === 'ja' ? 'リアルタイムホエール取引 + リアルタイムダークプール, ' : 'Real-time whale sweeps + block trades, '}<span style={{ color: 'var(--amber)' }}><b>{locale === 'ko' ? '지금 업데이트 중' : locale === 'ja' ? '更新중' : 'updating now'}</b></span>.</>}
                socialProof={locale === 'ko' ? '오늘 14.2K 잠금해제' : locale === 'ja' ? '本日14.2Kがロック解除' : '14.2K unlocked today'}
                onUnlock={() => setIsLocked(false)}
                lockedPreview={
                  <div 
                    className="premium-scroll no-scrollbar" 
                    style={{ 
                      display: 'flex',
                      gap: '12px',
                      overflowX: 'hidden',
                      padding: '4px 0 10px',
                      opacity: 0.12,
                      filter: 'blur(3px)',
                      pointerEvents: 'none'
                    }}
                    aria-hidden="true"
                  >
                    {flowTab === 'whale'
                      ? whaleSweeps.slice(0, 2).map((tx, idx) => renderWhaleCard(tx, idx))
                      : filteredDarkPoolTrades.slice(0, 2).map((tx, idx) => renderDarkPoolCard(tx, idx))
                    }
                  </div>
                }
              >
                <div 
                  className="premium-scroll no-scrollbar" 
                  style={{ 
                    display: 'flex',
                    gap: '12px',
                    overflowX: 'auto',
                    padding: '4px 0 10px',
                    scrollSnapType: 'x mandatory',
                    WebkitOverflowScrolling: 'touch',
                    minHeight: '145px'
                  }}
                >
                  {flowTab === 'whale' ? (
                    /* Whale Sweep Radar Deck */
                    whaleSweeps.map((tx, idx) => renderWhaleCard(tx, idx))
                  ) : (
                    /* Dark Pool & Block Trades Deck */
                    filteredDarkPoolTrades.map((tx, idx) => renderDarkPoolCard(tx, idx))
                  )}
                </div>
              </ValueWall>
            </div>

            {/* Max Pain Info (also blurred if locked) */}
            <div style={{ 
              filter: isLocked ? 'blur(5px)' : 'none',
              opacity: isLocked ? 0.25 : 1,
              padding: '12px 14px',
              margin: 0,
              background: 'rgba(30, 41, 59, 0.15)',
              border: '1px solid rgba(255,255,255,0.03)',
              borderRadius: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              transition: 'all 0.3s ease'
            }}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.maxPain}</span>
              <span className="tnum" style={{ fontSize: '16px', fontWeight: 900, color: 'var(--amber)' }}>
                ${maxPainVal.toFixed(1)}
              </span>
            </div>

        </div>
      )}{/* 4. STRIKE PROFILE TAB */}
      {activeTab === 'strike-profile' && (() => {
        // Group rawChain by strike price
        const strikeMap: Record<number, { strike: number; put: number; call: number; isWall: boolean; isFloor: boolean; isUnderlyer?: boolean }> = {};
        
        const chain = rawChain || [];
        // Find nearest expiration date
        const expirations = Array.from(new Set(chain.map(opt => opt.details?.expiration_date).filter(Boolean))).sort() as string[];
        const nearestExpiry = expirations[0] || '';
        
        // Filter options for this nearest expiry (or all if none)
        const filteredChain = nearestExpiry 
          ? chain.filter(opt => opt.details?.expiration_date === nearestExpiry)
          : chain;

        filteredChain.forEach(opt => {
          const strike = opt.details?.strike_price;
          if (typeof strike !== 'number') return;
          
          const type = opt.details?.contract_type?.toUpperCase(); // "CALL" or "PUT"
          const vol = opt.day?.volume || 0;
          
          if (!strikeMap[strike]) {
            strikeMap[strike] = { strike, put: 0, call: 0, isWall: false, isFloor: false };
          }
          
          if (type === 'CALL') {
            strikeMap[strike].call += vol;
          } else if (type === 'PUT') {
            strikeMap[strike].put += vol;
          }
        });

        // Unique strikes sorted ascending
        let strikes = Object.keys(strikeMap).map(Number).sort((a, b) => a - b);
        
        // If empty or too few strikes, generate synthetic fallback strikes surrounding displayPrice
        if (strikes.length === 0) {
          const base = Math.round(displayPrice);
          const interval = displayPrice > 400 ? 10 : displayPrice > 100 ? 5 : 2.5;
          for (let i = -6; i <= 5; i++) {
            const strike = base + i * interval;
            strikes.push(strike);
            const dist = Math.abs(i);
            // Dummy distribution centered around current price
            strikeMap[strike] = {
              strike,
              put: Math.max(100, Math.round((12000 - dist * 1500) * (dist % 2 === 0 ? 0.8 : 1.2))),
              call: Math.max(100, Math.round((12000 - dist * 1500) * (dist % 2 === 0 ? 1.2 : 0.8))),
              isWall: false,
              isFloor: false
            };
          }
          strikes.sort((a, b) => a - b);
        }

        // Find closest strike index to displayPrice
        let closestIdx = 0;
        let minDiff = Infinity;
        strikes.forEach((stk, idx) => {
          const diff = Math.abs(stk - displayPrice);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = idx;
          }
        });

        // Select a window of 12 strikes around the closest strike
        const startIdx = Math.max(0, closestIdx - 5);
        const endIdx = Math.min(strikes.length - 1, closestIdx + 6);
        const selectedStrikes = strikes.slice(startIdx, endIdx + 1);
        
        // Sort descending (highest strike at the top)
        selectedStrikes.sort((a, b) => b - a);

        // Calculate max call and put volume in the selected window for auto-scaling
        const maxVal = Math.max(100, ...selectedStrikes.map(stk => Math.max(strikeMap[stk].call || 0, strikeMap[stk].put || 0)));

        // Find dynamic call wall and put floor in the selected window
        let maxCallVol = 0;
        let maxPutVol = 0;
        let wallStrike = -1;
        let floorStrike = -1;

        selectedStrikes.forEach(stk => {
          const cVol = strikeMap[stk].call || 0;
          const pVol = strikeMap[stk].put || 0;
          if (cVol > maxCallVol) {
            maxCallVol = cVol;
            wallStrike = stk;
          }
          if (pVol > maxPutVol) {
            maxPutVol = pVol;
            floorStrike = stk;
          }
        });

        const closestStrike = selectedStrikes.reduce((prev, curr) => 
          Math.abs(curr - displayPrice) < Math.abs(prev - displayPrice) ? curr : prev
        , selectedStrikes[0]);

        // Format nearest expiry date
        const expiryLabel = nearestExpiry 
          ? nearestExpiry.split('-').slice(1).join('/') + ' ' + (locale === 'ko' ? '만기' : locale === 'ja' ? '満期' : 'Expiry')
          : (locale === 'ko' ? '실시간 만기' : locale === 'ja' ? 'リアルタイム満期' : 'Live Expiry');

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 16px var(--s4)' }} className="animate-in fade-in duration-200">
            <div className="premium-card" style={{ padding: '18px 16px', margin: 0, borderTop: 'none', borderTopLeftRadius: '0px', borderTopRightRadius: '0px' }}>
              <div className="app-card-head" style={{ marginBottom: '14px', alignItems: 'center' }}>
                <span className="app-card-title" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {locale === 'ko' ? '장중 행사가 프로파일' : locale === 'ja' ? 'イントラデイ行使価格プロファイル' : 'INTRADAY STRIKE PROFILE'}
                </span>
                <span style={{ fontSize: '9px', fontWeight: 900, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: '12px', letterSpacing: '0.04em' }}>
                  {expiryLabel}
                </span>
              </div>

              {/* Label header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--f-micro)', color: 'var(--text-muted)', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <span style={{ color: '#ef4444' }}>{locale === 'ko' ? 'PUT 지지' : 'PUT SUPPORT'}</span>
                <span style={{ width: '60px', textAlign: 'center' }}>STRIKE</span>
                <span style={{ color: '#10b981' }}>{locale === 'ko' ? 'CALL 저항' : 'CALL RESIST'}</span>
              </div>

              {/* Bar List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px', position: 'relative' }}>
                
                {/* Dynamic Underlyer Line */}
                {(() => {
                  if (selectedStrikes.length < 2) return null;
                  
                  let yPos = -999;
                  const topStrike = selectedStrikes[0];
                  const bottomStrike = selectedStrikes[selectedStrikes.length - 1];
                  
                  if (displayPrice >= topStrike) {
                    yPos = 13;
                  } else if (displayPrice <= bottomStrike) {
                    yPos = (selectedStrikes.length - 1) * 36 + 13;
                  } else {
                    for (let i = 0; i < selectedStrikes.length - 1; i++) {
                      const upper = selectedStrikes[i];
                      const lower = selectedStrikes[i + 1];
                      if (displayPrice <= upper && displayPrice > lower) {
                        const ratio = (upper - displayPrice) / (upper - lower);
                        yPos = i * 36 + 13 + ratio * 36;
                        break;
                      }
                    }
                  }
                  
                  if (yPos === -999) return null;
                  
                  return (
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: `${yPos}px`,
                      display: 'flex',
                      alignItems: 'center',
                      transform: 'translateY(-50%)',
                      zIndex: 5,
                      pointerEvents: 'none'
                    }}>
                      <div style={{
                        flex: 1,
                        borderTop: '1.5px dashed var(--cyan)',
                        opacity: 0.85,
                        boxShadow: '0 0 6px rgba(6, 182, 212, 0.4)'
                      }} />
                      <div style={{
                        background: 'rgba(6, 182, 212, 0.95)',
                        color: '#050a14',
                        font: '900 9px var(--f-mono)',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        boxShadow: '0 0 10px rgba(6, 182, 212, 0.5)',
                        marginLeft: '8px',
                        marginRight: '8px',
                        border: '1px solid var(--cyan)',
                        whiteSpace: 'nowrap',
                        letterSpacing: '0.02em'
                      }}>
                        ${displayPrice.toFixed(2)}
                      </div>
                      <div style={{
                        flex: 1,
                        borderTop: '1.5px dashed var(--cyan)',
                        opacity: 0.85,
                        boxShadow: '0 0 6px rgba(6, 182, 212, 0.4)'
                      }} />
                    </div>
                  );
                })()}

                {/* Rows */}
                {selectedStrikes.map((strike, idx) => {
                  const data = strikeMap[strike];
                  const putPct = Math.min(90, Math.max(2, (data.put / maxVal) * 100));
                  const callPct = Math.min(90, Math.max(2, (data.call / maxVal) * 100));
                  const isClosest = strike === closestStrike;
                  const isWall = strike === wallStrike;
                  const isFloor = strike === floorStrike;

                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', height: '26px', position: 'relative' }}>
                      {/* Put bar (grows left) */}
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', paddingRight: '12px' }}>
                        <div style={{
                          width: `${putPct}%`,
                          height: '7px',
                          background: isFloor 
                            ? 'linear-gradient(270deg, rgba(239, 68, 68, 0.2) 0%, #ef4444 100%)' 
                            : 'linear-gradient(270deg, rgba(239, 68, 68, 0.06) 0%, rgba(239, 68, 68, 0.65) 100%)',
                          borderRadius: '3.5px',
                          boxShadow: isFloor ? '0 0 8px rgba(239, 68, 68, 0.4)' : 'none',
                          transition: 'width 0.4s ease'
                        }} />
                      </div>

                      {/* Strike Label */}
                      <div className="tnum" style={{
                        width: '60px',
                        textAlign: 'center',
                        fontSize: '11px',
                        fontWeight: 900,
                        color: isClosest ? 'var(--cyan)' : '#ffffff',
                        background: isClosest ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
                        border: isClosest ? '1px solid rgba(6, 182, 212, 0.3)' : 'none',
                        borderRadius: '6px',
                        padding: isClosest ? '2px 0' : 0,
                        zIndex: 2,
                        textShadow: isClosest ? '0 0 8px rgba(6, 182, 212, 0.3)' : 'none'
                      }}>
                        ${strike}
                      </div>

                      {/* Call bar (grows right) */}
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start', paddingLeft: '12px' }}>
                        <div style={{
                          width: `${callPct}%`,
                          height: '7px',
                          background: isWall 
                            ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.2) 0%, #10b981 100%)' 
                            : 'linear-gradient(90deg, rgba(16, 185, 129, 0.06) 0%, rgba(16, 185, 129, 0.65) 100%)',
                          borderRadius: '3.5px',
                          boxShadow: isWall ? '0 0 8px rgba(16, 185, 129, 0.4)' : 'none',
                          transition: 'width 0.4s ease'
                        }} />
                      </div>

                      {/* Floating Barrier Badges */}
                      {isWall && (
                        <span style={{
                          position: 'absolute',
                          right: 0,
                          fontSize: '8px',
                          fontFamily: 'var(--f-mono)',
                          fontWeight: 900,
                          background: 'rgba(16, 185, 129, 0.08)',
                          color: '#10b981',
                          padding: '2px 6px',
                          borderRadius: '10px',
                          border: '1px solid rgba(16, 185, 129, 0.2)',
                          letterSpacing: '0.04em'
                        }}>
                          WALL
                        </span>
                      )}
                      {isFloor && (
                        <span style={{
                          position: 'absolute',
                          left: 0,
                          fontSize: '8px',
                          fontFamily: 'var(--f-mono)',
                          fontWeight: 900,
                          background: 'rgba(239, 68, 68, 0.08)',
                          color: '#ef4444',
                          padding: '2px 6px',
                          borderRadius: '10px',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          letterSpacing: '0.04em'
                        }}>
                          FLOOR
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}</SwipeableTabs>
      </>)}

      {/* AD BANNER */}
      <AdBanner />
      <MobileAppFooter />
    </div>
  );
}
