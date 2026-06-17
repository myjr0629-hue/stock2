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

export default function AppFlowPage() {
  const locale = useLocale();
  const t = useMemo(() => TRANSLATIONS[locale] || TRANSLATIONS.en, [locale]);
  const tIndicators = useTranslations('indicators');

  const [ticker, setTicker] = useState('NVDA');
  const [searchInput, setSearchInput] = useState('NVDA');
  const [loading, setLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(true);

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

  // Compute display prices via util
  const effectiveSession = marketStatus.isHoliday || marketStatus.market === 'closed'
    ? 'CLOSED'
    : (tickerData?.session || tickerData?.rawTickerData?.session || 'CLOSED').toUpperCase();

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
    if (!rawChain || rawChain.length === 0) return DEMO_WHALES;
    const sweeps = rawChain.map((c: any, i: number) => {
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
    }).filter(tx => tx.premium >= 100000); // $100K 이상

    return sweeps.length > 0 ? sweeps.sort((a, b) => b.premium - a.premium) : DEMO_WHALES;
  }, [rawChain, DEMO_WHALES]);

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
  const compositeIndex = Math.round((opi * 0.4) + (((ivRankVal ?? 50)) * 0.3) + ((100 - pcRatio * 50) * 0.3));
  const whaleNetBetRaw = tickerData?.flow?.darkPoolNetBuyVal ?? null;
  const whaleNetBetStr = whaleNetBetRaw != null
    ? (Math.abs(whaleNetBetRaw) >= 1000000
      ? `${whaleNetBetRaw >= 0 ? '+' : '-'}$${(Math.abs(whaleNetBetRaw) / 1000000).toFixed(1)}M`
      : `${whaleNetBetRaw >= 0 ? '+' : '-'}$${(Math.abs(whaleNetBetRaw) / 1000).toFixed(0)}K`)
    : '—';
  const aiVerdictLabel = opi >= 65 ? t.bullishMomentum : opi >= 40 ? t.neutralLabel : t.bearishPressure;
  const aiVerdictBadgeStyle = opi >= 65
    ? { background: 'rgba(16, 185, 129, 0.12)', color: 'var(--green)', border: '1px solid rgba(16, 185, 129, 0.25)' }
    : opi >= 40
    ? { background: 'rgba(245, 158, 11, 0.12)', color: 'var(--amber)', border: '1px solid rgba(245, 158, 11, 0.25)' }
    : { background: 'rgba(239, 68, 68, 0.12)', color: 'var(--red)', border: '1px solid rgba(239, 68, 68, 0.25)' };
  const aiOpiColor = opi >= 65 ? 'var(--green)' : opi >= 40 ? 'var(--amber)' : 'var(--red)';

  return (
    <div className={dashStyles.page} style={{ paddingBottom: '90px' }}>
      {/* HEADER */}
      <header className="app-header">
        <div className={dashStyles.headerTitle} style={{ font: 'var(--f-h2)', fontWeight: 800 }}>
          {t.title}
        </div>
        <div className={dashStyles.headerActions}>
          <span className="app-label-premium" style={{ padding: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cyan)', boxShadow: '0 0 6px var(--cyan)' }} />
            LIVE
          </span>
        </div>
      </header>

      {/* SEARCH BAR */}
      <form onSubmit={handleSearch} style={{ padding: '12px 16px 4px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '280px' }}>
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
              background: 'rgba(22, 32, 54, 0.45)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 'var(--r-pill)',
              padding: '8px 56px 8px 34px', // padding left for icon, right for button
              font: 'var(--f-small)',
              fontWeight: 600,
              color: 'var(--text)',
              outline: 'none',
              transition: 'all 0.3s ease',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.02), 0 4px 12px rgba(0, 0, 0, 0.15)'
            }}
          />
          {/* Premium Integrated Submit Button on Right */}
          <button
            type="submit"
            style={{
              position: 'absolute',
              right: '4px',
              top: '4px',
              bottom: '4px',
              background: 'linear-gradient(135deg, var(--cyan) 0%, #0891b2 100%)',
              border: 'none',
              color: '#050a14',
              borderRadius: 'var(--r-pill)',
              padding: '0 12px',
              font: '700 11px var(--f-sans)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(6, 182, 212, 0.3)',
              transition: 'transform 0.15s ease, opacity 0.15s ease'
            }}
          >
            {locale === 'ko' ? '검색' : locale === 'ja' ? '検索' : 'GO'}
          </button>
        </div>
      </form>

      {/* UNDERLYER TICKER TABS */}
      <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', overflowX: 'auto' }}>
        {['NVDA', 'TSLA', 'AAPL', 'SPY', 'QQQ'].map((sym) => (
          <button
            key={sym}
            onClick={() => {
              setTicker(sym);
              setSearchInput(sym);
            }}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--r-pill)',
              border: '1px solid',
              borderColor: ticker === sym ? 'var(--cyan)' : 'var(--border)',
              background: ticker === sym ? 'var(--cyan-dim)' : 'transparent',
              color: ticker === sym ? 'var(--cyan)' : 'var(--text-dim)',
              font: 'var(--f-micro)',
              fontWeight: 700,
            }}
          >
            {sym}
          </button>
        ))}
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

        return (
          <div className={`${s.p2Card} ${s.animateIn} ${s.delay1}`} style={{ margin: '4px 16px 12px' }}>
            <div className={s.p2Topline}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--s3)' }}>
                <div className={isOpen ? s.marketBadge : isPrePost ? s.marketBadgePrePost : s.marketBadgeClosed} style={{ marginBottom: 0 }}>
                  {isOpen ? (
                    <span className={s.marketDotActive} />
                  ) : isPrePost ? (
                    <span className={s.marketDotPulse} />
                  ) : null}
                  {sessionLabel}
                </div>
                <span className={`${s.headerBadge} ${s.badgeGold}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {tIndicators('gammaFlip')} {liveGammaFlip}
                </span>
              </div>
              <span className={`${s.p2Tick} ${flash ? s[`show-${flash}`] : ''}`} style={{ marginBottom: 'var(--s3)' }}>
                {flash === 'down' ? '▼ TICK' : '▲ TICK'}
              </span>
            </div>
            <div className={s.p2PriceRow}>
              <span className={`${s.p2Price} ${flash ? s[`flash-${flash}`] : ''}`}>
                ${displayPrice.toFixed(2)}
              </span>
              <span className={`${s.p2Chg} ${up ? s.pos : s.neg}`}>
                {up ? '▲' : '▼'} {up ? '+' : ''}{finalChangeAbs.toFixed(2)} ({up ? '+' : ''}{displayChangePct.toFixed(2)}%)
              </span>
            </div>
            {hasExt && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--ext-session-dim)', flexShrink: 0, marginTop: '8px', width: 'fit-content', background: 'var(--ext-session-dim)' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--ext-session)', whiteSpace: 'nowrap' }}>{activeExtLabel}</span>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#f1f5f9', fontFamily: 'var(--f-mono)', fontVariantNumeric: 'tabular-nums' }}>${activeExtPrice.toFixed(2)}</span>
                <span style={{ fontSize: '12px', fontWeight: 'bold', fontFamily: 'var(--f-mono)', fontVariantNumeric: 'tabular-nums', color: activeExtPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {activeExtPct >= 0 ? '+' : ''}{activeExtPct.toFixed(2)}%
                </span>
              </div>
            )}

            {(() => {
              const maxPainDiffPct = maxPainVal > 0 ? ((displayPrice - maxPainVal) / maxPainVal) * 100 : 0;
              const maxPainDiffSign = maxPainDiffPct >= 0 ? '+' : '';
              const maxPainDiffText = locale === 'ko'
                ? `${maxPainDiffSign}${maxPainDiffPct.toFixed(2)}% 괴리`
                : locale === 'ja'
                ? `${maxPainDiffSign}${maxPainDiffPct.toFixed(2)}% 乖離`
                : `${maxPainDiffSign}${maxPainDiffPct.toFixed(2)}% gap`;

              const gammaFlipNum = typeof liveGammaFlip === 'number'
                ? liveGammaFlip
                : parseFloat((liveGammaFlip || '').replace(/[^0-9.]/g, '')) || 0;
              const gammaFlipDiffPct = gammaFlipNum > 0 ? ((displayPrice - gammaFlipNum) / gammaFlipNum) * 100 : 0;
              const gammaFlipDiffSign = gammaFlipDiffPct >= 0 ? '+' : '';
              const isAboveGamma = displayPrice >= gammaFlipNum;
              const gammaFlipDiffText = gammaFlipNum > 0
                ? (isAboveGamma
                  ? (locale === 'ko' ? `상회 (${gammaFlipDiffSign}${gammaFlipDiffPct.toFixed(2)}%)` : locale === 'ja' ? `上回る (${gammaFlipDiffSign}${gammaFlipDiffPct.toFixed(2)}%)` : `Above (${gammaFlipDiffSign}${gammaFlipDiffPct.toFixed(2)}%)`)
                  : (locale === 'ko' ? `하회 (${gammaFlipDiffSign}${gammaFlipDiffPct.toFixed(2)}%)` : locale === 'ja' ? `下回る (${gammaFlipDiffSign}${gammaFlipDiffPct.toFixed(2)}%)` : `Below (${gammaFlipDiffSign}${gammaFlipDiffPct.toFixed(2)}%)`))
                : '-';
              const gammaFlipTextColor = gammaFlipNum > 0
                ? (isAboveGamma ? '#22d3ee' : '#f87171')
                : 'var(--text-muted)';

              const isMaxPainClose = Math.abs(maxPainDiffPct) <= 1.5;
              const isGammaFlipClose = gammaFlipNum > 0 && Math.abs(gammaFlipDiffPct) <= 1.5;

              return (
                <div className={s.p2Vitals}>
                  <div className={`${s.p2Vital} ${isMaxPainClose ? 'vital-gold-glow' : ''}`}>
                    <div className={s.k}>MAX PAIN</div>
                    <div className={s.v}>${maxPainVal.toFixed(1)}</div>
                    <div style={{ font: '700 10px/1 Inter', marginTop: '5px', color: isMaxPainClose ? '#fbbf24' : 'var(--text-muted)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {maxPainDiffText}
                    </div>
                    <div className={s.bar}><i style={{ width: '65%' }} /></div>
                  </div>
                  <div className={`${s.p2Vital} ${isGammaFlipClose ? (isAboveGamma ? 'vital-cyan-glow' : 'vital-red-glow') : ''}`}>
                    <div className={s.k}>GAMMA FLIP</div>
                    <div className={s.v}>{liveGammaFlip}</div>
                    <div style={{ font: '700 10px/1 Inter', marginTop: '5px', color: gammaFlipTextColor, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {gammaFlipDiffText}
                    </div>
                    <div className={s.bar}><i style={{ width: '52%' }} /></div>
                  </div>
                  <div className={s.p2Vital}>
                    <div className={s.k}>TOTAL PREMIUM</div>
                    <div className={s.v}>${(totalPrem / 1000000).toFixed(1)}M</div>
                    <div style={{ font: '700 10px/1 Inter', marginTop: '5px', color: 'var(--text-muted)', visibility: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      placeholder
                    </div>
                    <div className={s.bar}><i style={{ width: '80%' }} /></div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* ── SEGMENTED SUB-TABS (Overview, AI Intel, Options Flow, Strike Profile) ── */}
      <div className={`${s.seg} ${s.seg4}`} style={{ margin: '12px 16px var(--s3)' }}>
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
          {/* PCR & OPI Gauge */}
          <div className="app-card" style={{ padding: '18px 16px', margin: 0 }}>
            <div className="app-card-head" style={{ marginBottom: 0 }}>
              <span className="app-card-title">{t.opiGauge}</span>
              <span style={{ font: 'var(--f-micro)', fontWeight: 700, color: gaugeColor }}>{gaugeStatus}</span>
            </div>

            {/* Semi-circular Gauge */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 12, position: 'relative' }}>
              <svg width="180" height="96" viewBox="0 0 180 96">
                <path
                  d={describeArc(90, 90, 80, -90, 90)}
                  fill="none"
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
                <path
                  d={describeArc(90, 90, 80, -90, -90 + (opi / 100) * 180)}
                  fill="none"
                  stroke={gaugeColor}
                  strokeWidth="10"
                  strokeLinecap="round"
                />
                <circle cx="90" cy="90" r="5" fill="var(--text)" />
                <line
                  x1="90"
                  y1="90"
                  x2="90"
                  y2="28"
                  stroke="var(--text)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  transform={`rotate(${rotationAngle} 90 90)`}
                  style={{ transition: 'transform 0.8s ease-out' }}
                />
              </svg>
              <div style={{ position: 'absolute', bottom: 2, textAlign: 'center' }}>
                <span className="tnum" style={{ font: 'var(--f-display)', fontSize: '24px', fontWeight: 800 }}>{opi.toFixed(1)}</span>
              </div>
            </div>

            {/* PCR Summary */}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', marginTop: 18, paddingTop: 14 }}>
              <div>
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)' }}>{t.pcRatio}</span>
                <div className="tnum" style={{ font: 'var(--f-h3)', fontWeight: 700, marginTop: 4 }}>{pcRatio.toFixed(2)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)' }}>{t.regime}</span>
                <div style={{ font: 'var(--f-h3)', fontWeight: 700, color: volRegime === 'ERUPTING' ? 'var(--red)' : volRegime === 'LOADED' ? 'var(--amber)' : 'var(--green)', marginTop: 4 }}>
                  {volRegime}
                </div>
              </div>
            </div>
          </div>

          {/* Premium Total Option Flows (Call/Put double bar) */}
          <div className="app-card" style={{ padding: '16px', margin: 0 }}>
            <div className="app-card-head" style={{ marginBottom: '8px' }}>
              <span className="app-card-title">{t.totalPremium}</span>
              <span className="tnum" style={{ font: 'var(--f-h3)', fontWeight: 700, color: 'var(--text)' }}>
                ${(totalPrem / 1000000).toFixed(1)}M
              </span>
            </div>
            
            <div style={{ background: 'rgba(255,255,255,0.03)', height: '10px', borderRadius: '5px', overflow: 'hidden', display: 'flex', margin: '4px 0 12px' }}>
              <div style={{ width: `${callPct}%`, background: 'var(--green)', height: '100%' }} />
              <div style={{ width: `${100 - callPct}%`, background: 'var(--red)', height: '100%' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-dim)' }}>{t.callBullish}</span>
                <span className="tnum" style={{ font: 'var(--f-micro)', fontWeight: 700, color: 'var(--green)' }}>{callPct.toFixed(1)}%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)' }} />
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-dim)' }}>{t.putBearish}</span>
                <span className="tnum" style={{ font: 'var(--f-micro)', fontWeight: 700, color: 'var(--red)' }}>{(100 - callPct).toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* OPTIONS MARKET REGIME SPEC WIDGET */}
          <div className="app-card" style={{ padding: '16px', margin: 0 }}>
            <div className="app-card-head" style={{ marginBottom: '10px' }}>
              <span className="app-card-title">OPTIONS MARKET REGIME</span>
              <span className={`${s.headerBadge} ${ivRankVal != null && ivRankVal < 30 ? s.badgeGreen : s.badgeAmber}`} style={{ fontSize: '9px', padding: '3px 8px' }}>
                {regimeLabel}
              </span>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 8px', borderRadius: '6px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)' }}>IVRank</div>
                <div style={{ font: 'var(--f-h3)', fontWeight: 800, color: 'var(--text)', marginTop: '4px' }}>{ivRankVal != null ? `${ivRankVal}%` : '—'}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 8px', borderRadius: '6px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)' }}>Skew</div>
                <div style={{ font: 'var(--f-h3)', fontWeight: 800, color: 'var(--red)', marginTop: '4px' }}>{ivSkewVal != null ? `${ivSkewVal}%` : '—'}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 8px', borderRadius: '6px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)' }}>{"P/C Ratio"}</div>
                <div style={{ font: 'var(--f-h3)', fontWeight: 800, color: 'var(--text)', marginTop: '4px' }}>{pcRatio.toFixed(2)}</div>
              </div>
            </div>

            <div style={{ font: 'var(--f-micro)', color: 'var(--text-dim)', background: 'rgba(6, 182, 212, 0.05)', border: '1px solid rgba(6, 182, 212, 0.15)', borderRadius: '6px', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cyan)' }} />
              <span>{regimeInsight}</span>
            </div>
          </div>

          {/* IMPLIED MOVE & KEY BARRIERS */}
          <div className="app-card" style={{ padding: '16px', margin: 0 }}>
            <div className="app-card-head" style={{ marginBottom: '10px' }}>
              <span className="app-card-title">{"IMPLIED MOVE & BARRIERS"}</span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ font: 'var(--f-small)', color: 'var(--text-dim)' }}>IMPLIED MOVE</span>
              <div style={{ textAlign: 'right' }}>
                <span className="tnum" style={{ font: 'var(--f-h3)', fontWeight: 800, color: 'var(--amber)' }}>{impliedMoveStr}</span>
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', display: 'block' }}>{nearestExpiryLabel ? `ATM Straddle (${nearestExpiryLabel})` : 'ATM Straddle'}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
              <div style={{ flex: 1 }}>
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)' }}>{`PUT FLOOR (${t.support})`}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                  <span className="tnum" style={{ font: 'var(--f-h3)', fontWeight: 800, color: 'var(--red)' }}>{putFloorVal != null ? `$${putFloorVal.toFixed(0)}` : '—'}</span>
                  <span style={{ fontSize: '9px', fontWeight: 'bold', background: 'var(--red-dim)', color: 'var(--red)', padding: '2px 6px', borderRadius: '4px' }}>{t.support.toUpperCase()}</span>
                </div>
              </div>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)' }}>{`CALL WALL (${t.resistance})`}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '9px', fontWeight: 'bold', background: 'var(--green-dim)', color: 'var(--green)', padding: '2px 6px', borderRadius: '4px' }}>{t.resistance.toUpperCase()}</span>
                  <span className="tnum" style={{ font: 'var(--f-h3)', fontWeight: 800, color: 'var(--green)' }}>{callWallVal != null ? `$${callWallVal.toFixed(0)}` : '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. AI INTEL TAB */}
      {activeTab === 'ai-intel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 16px var(--s4)' }} className="animate-in fade-in duration-200">
          {/* AI VERDICT GAUGE */}
          <div className="app-card" style={{ padding: '16px', margin: 0 }}>
            <div className="app-card-head" style={{ marginBottom: '12px' }}>
              <span className="app-card-title">{`AI VERDICT (${aiVerdictLabel})`}</span>
              <span className={s.headerBadge} style={{ fontSize: '9px', padding: '3px 8px', ...aiVerdictBadgeStyle }}>
                {aiVerdictLabel}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)' }}>{t.opiLabel}</span>
                <div className="tnum" style={{ font: 'var(--f-h2)', fontWeight: 800, color: aiOpiColor, marginTop: '4px' }}>{opi >= 0 ? '+' : ''}{opi.toFixed(0)}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)' }}>{t.atmIvPctLabel}</span>
                <div className="tnum" style={{ font: 'var(--f-h2)', fontWeight: 800, color: 'var(--text)', marginTop: '4px' }}>{aiIvRank != null ? `${aiIvRank}%` : '—'}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)' }}>COMPOSITE INDEX</span>
                <div className="tnum" style={{ font: 'var(--f-h2)', fontWeight: 800, color: 'var(--text)', marginTop: '4px' }}>{compositeIndex}%</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)' }}>{t.whaleNetBetLabel}</span>
                <div className="tnum" style={{ font: 'var(--f-h2)', fontWeight: 800, color: whaleNetBetRaw != null && whaleNetBetRaw >= 0 ? 'var(--green)' : 'var(--red)', marginTop: '4px' }}>{whaleNetBetStr}</div>
              </div>
            </div>
          </div>

          {/* AI FLOW INTELLIGENCE */}
          <div className={s.aiInsight} style={{ margin: 0 }}>
            <div className={s.aiInsightHead} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="var(--cyan)" strokeWidth="1.5" />
                  <path d="M12 8v4l3 3" stroke="var(--cyan)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span className={s.aiInsightLabel}>{locale === 'ko' ? 'AI 플로우 인텔리전스' : locale === 'ja' ? 'AIフロー・インテリジェンス' : 'AI FLOW INTELLIGENCE'}</span>
              </div>
              <span style={{ fontSize: '9px', fontWeight: 'bold', background: 'rgba(6, 182, 212, 0.15)', color: 'var(--cyan)', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px' }}>
                CLAUDE 3.5
              </span>
            </div>
            
            {(() => {
              // Localized texts
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
                `${ticker}は現在値$${displayPrice.toFixed(2)}において、強力な空売りクジラポジション（$15.5M）と総合的なOPI（+3）の乖離を示しており、これは機関投資家が短期的な下落方向の弱気ベッティングを構築している最中であっても、オプション市場構造はまだ下落方向의 合意を形成していないことを示唆しています。`,
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
                  <div className={s.aiInsightText} style={{ fontSize: '13px', lineHeight: '1.6' }}>
                    <div style={{ fontWeight: 800, color: 'var(--text)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: 'var(--cyan)' }}>✦</span> {aiTitle}
                    </div>
                    {aiDesc}
                  </div>

                  {/* Bullet Insights */}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px', marginTop: '12px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '10px' }}>
                      {insightHeader}
                    </div>
                    <div style={{
                      filter: isLocked ? 'blur(5px)' : 'none',
                      opacity: isLocked ? 0.2 : 1,
                      transition: 'all 0.3s ease'
                    }}>
                      <ul style={{
                        paddingLeft: '0',
                        margin: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        fontSize: '13px',
                        lineHeight: '1.6'
                      }}>
                      {bullets.map((txt, idx) => (
                        <li key={idx} style={{
                          listStyleType: 'none',
                          position: 'relative',
                          paddingLeft: '14px',
                          color: '#b4c6ef',
                          transition: 'color 0.2s ease'
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
                    </div>

                    {isLocked && (
                      <div style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: '22px',
                        bottom: 0,
                        background: 'linear-gradient(to bottom, rgba(5,10,20,0) 0%, rgba(5,10,20,0.92) 50%, rgba(5,10,20,0.98) 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '10px',
                        textAlign: 'center',
                        zIndex: 5
                      }}>
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'rgba(6, 182, 212, 0.1)',
                          border: '1px solid var(--cyan)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 0 10px rgba(6, 182, 212, 0.2)',
                          marginBottom: '4px'
                        }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                            <rect x="3" y="11" width="18" height="11" rx="2" stroke="var(--cyan)" strokeWidth="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="var(--cyan)" strokeWidth="2" />
                          </svg>
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text)', marginBottom: '1px' }}>
                          {locale === 'ko' ? 'AI 핵심 맥락 잠금해제' : locale === 'ja' ? 'AIインサイト解除' : 'Unlock AI Insights'}
                        </span>
                        <span style={{ fontSize: '8px', color: 'var(--text-muted)', marginBottom: '6px', maxWidth: '200px', lineHeight: 1.2 }}>
                          {locale === 'ko' ? '광고 시청 후 1시간 동안 AI 상세 맥락 분석을 해제합니다.' : locale === 'ja' ? '広告視聴で1時間AIインサイトを解禁します。' : 'Watch an ad to unlock AI insights for 1 hour.'}
                        </span>
                        <button
                          onClick={handleUnlock}
                          style={{
                            background: 'linear-gradient(135deg, var(--cyan) 0%, #0891b2 100%)',
                            border: 'none',
                            color: '#050a14',
                            padding: '3px 12px',
                            borderRadius: 'var(--r-pill)',
                            fontSize: '9px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(6, 182, 212, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                          {t.unlockBtn}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Trigger condition */}
                  <div style={{ marginTop: '16px', padding: '10px 12px', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.15)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', display: 'block' }}>{triggerLabel}</span>
                      <span style={{ font: 'var(--f-small)', fontWeight: 'bold', color: 'var(--text)' }}>{triggerValue}</span>
                    </div>
                    <span style={{ font: 'var(--f-micro)', fontWeight: 'bold', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--amber)', padding: '4px 10px', borderRadius: '4px' }}>RISK: MEDIUM</span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* 3. FLOW (WHALE RADAR) TAB */}
      {activeTab === 'whale-flow' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 16px var(--s4)' }} className="animate-in fade-in duration-200">
            {/* DARK POOL & SHORT INTEREST WIDGET */}
            <div className="app-card" style={{ padding: '16px', margin: 0 }}>
              <div className="app-card-head" style={{ marginBottom: '10px' }}>
                <span className="app-card-title">{locale === 'ko' ? '다크풀 & 공매도' : locale === 'ja' ? 'ダークプール＆ショートインタレスト' : 'DARK POOL & SHORT INTEREST'}</span>
                <span style={{ fontSize: '9px', fontWeight: 'bold', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--amber)', padding: '2px 6px', borderRadius: '4px' }}>
                  DP ACCUMULATION
                </span>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 8px', borderRadius: '6px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)' }}>Dark Pool %</div>
                  <div className="tnum" style={{ font: 'var(--f-h3)', fontWeight: 800, color: 'var(--cyan)', marginTop: '4px' }}>{dpPct}</div>
                  <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontSize: '8px', display: 'block', marginTop: '2px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={dpVolStr}>
                    {dpNetBuyStr}
                  </span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 8px', borderRadius: '6px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)' }}>Short Vol %</div>
                  <div className="tnum" style={{ font: 'var(--f-h3)', fontWeight: 800, color: 'var(--red)', marginTop: '4px' }}>{shortPct}</div>
                  <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontSize: '8px', display: 'block', marginTop: '2px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={shortVolStr}>
                    {locale === 'ko' ? '일일 공매도' : locale === 'ja' ? '日次空売' : 'Daily Short'}
                  </span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 8px', borderRadius: '6px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)' }}>Block Trades</div>
                  <div className="tnum" style={{ font: 'var(--f-h3)', fontWeight: 800, color: 'var(--text)', marginTop: '4px' }}>{blockCount}</div>
                  <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', fontSize: '8px', display: 'block', marginTop: '2px' }}>
                    {locale === 'ko' ? '대량 거래 건수' : locale === 'ja' ? '大口取引件数' : 'Block Count'}
                  </span>
                </div>
              </div>
            </div>

            {/* VALUE WALL / PREMIUM OPTIONS TABLE */}
            <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--r-card)' }}>
              {/* Sub-Tab Selector */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '4px', gap: '4px' }}>
                <button
                  onClick={() => setFlowTab('whale')}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 'var(--r-btn)',
                    border: 'none',
                    background: flowTab === 'whale' ? 'var(--cyan-dim)' : 'transparent',
                    color: flowTab === 'whale' ? 'var(--cyan)' : 'var(--text-dim)',
                    font: 'var(--f-micro)',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {t.whaleRadar}
                </button>
                <button
                  onClick={() => setFlowTab('darkpool')}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 'var(--r-btn)',
                    border: 'none',
                    background: flowTab === 'darkpool' ? 'var(--cyan-dim)' : 'transparent',
                    color: flowTab === 'darkpool' ? 'var(--cyan)' : 'var(--text-dim)',
                    font: 'var(--f-micro)',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {t.darkPoolTitle || 'Dark Pool & Block Trades'}
                </button>
              </div>

              {/* Compact scrollable container with customized scrollbar */}
              <div className="premium-scroll" style={{ maxHeight: '280px', overflowY: 'auto', padding: '0 12px 14px' }}>
                {flowTab === 'whale' ? (
                  /* Whale Sweep Radar */
                  <div>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', font: 'var(--f-micro)', color: 'var(--text-muted)', position: 'sticky', top: 0, background: 'var(--surface-1)', zIndex: 5 }}>
                      <span style={{ width: '55px' }}>{locale === 'ko' ? '시간' : locale === 'ja' ? '時刻' : 'TIME'}</span>
                      <span style={{ width: '65px', textAlign: 'center' }}>{locale === 'ko' ? '행사가' : locale === 'ja' ? '行使価格' : 'STRIKE'}</span>
                      <span style={{ width: '35px', textAlign: 'center' }}>{locale === 'ko' ? '유형' : locale === 'ja' ? 'タイプ' : 'TYPE'}</span>
                      <span style={{ width: '50px', textAlign: 'center' }}>{locale === 'ko' ? '만기' : locale === 'ja' ? '満期' : 'EXPIRY'}</span>
                      <span style={{ flex: 1, textAlign: 'right' }}>{locale === 'ko' ? '프리미엄' : locale === 'ja' ? 'プレミアム' : 'PREMIUM'}</span>
                    </div>
                    {/* List */}
                    {whaleSweeps.map((tx, idx) => {
                      const blur = isLocked && idx >= 3;
                      return (
                        <div 
                          key={idx} 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            padding: '12px 0', 
                            borderBottom: idx < whaleSweeps.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none', 
                            font: 'var(--f-small)',
                            filter: blur ? 'blur(5px)' : 'none',
                            opacity: blur ? 0.25 : 1,
                            pointerEvents: blur ? 'none' : 'auto',
                            transition: 'filter 0.3s ease, opacity 0.3s ease'
                          }}
                        >
                          <span className="tnum" style={{ width: '55px', color: 'var(--text-dim)' }}>{tx.time}</span>
                          <span className="tnum" style={{ width: '65px', textAlign: 'center', fontWeight: 700, color: 'var(--text)' }}>
                            ${tx.strike}
                          </span>
                          <span style={{ width: '35px', textAlign: 'center', fontWeight: 900, color: tx.type === 'CALL' ? 'var(--green)' : 'var(--red)' }}>
                            {tx.type === 'CALL' ? 'C' : 'P'}
                          </span>
                          <span className="tnum" style={{ width: '50px', textAlign: 'center', color: 'var(--text-dim)' }}>{tx.expiry}</span>
                          <span className="tnum" style={{ flex: 1, textAlign: 'right', fontWeight: 700, color: tx.dir === 'ASK' ? 'var(--green)' : tx.dir === 'BID' ? 'var(--red)' : 'var(--text)' }}>
                            ${(tx.premium / 1000).toFixed(1)}K
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Dark Pool & Institutional Block Trades */
                  <div>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', font: 'var(--f-micro)', color: 'var(--text-muted)', position: 'sticky', top: 0, background: 'var(--surface-1)', zIndex: 5 }}>
                      <span style={{ width: '90px' }}>{"TIME / EXCH"}</span>
                      <span style={{ width: '80px', textAlign: 'center' }}>{"PRICE / SIDE"}</span>
                      <span style={{ flex: 1, textAlign: 'right' }}>{"VALUE / SIZE"}</span>
                    </div>
                    {/* List */}
                    {darkPoolTrades.map((tx, idx) => {
                      const blur = isLocked && idx >= 3;
                      const isBuy = tx.side === 'BUY';
                      const isSell = tx.side === 'SELL';
                      const sideColor = isBuy ? 'var(--green)' : isSell ? 'var(--red)' : 'var(--text-muted)';
                      const sideText = isBuy ? 'BUY' : isSell ? 'SELL' : 'NEUTRAL';
                      
                      return (
                        <div 
                          key={idx} 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            padding: '12px 0', 
                            borderBottom: idx < darkPoolTrades.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none', 
                            font: 'var(--f-small)',
                            filter: blur ? 'blur(5px)' : 'none',
                            opacity: blur ? 0.25 : 1,
                            pointerEvents: blur ? 'none' : 'auto',
                            transition: 'filter 0.3s ease, opacity 0.3s ease'
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '90px' }}>
                            <span className="tnum" style={{ color: 'var(--text-dim)', fontSize: '11px' }}>{tx.timeET}</span>
                            <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{tx.exchangeName}</span>
                          </div>
                          <div style={{ width: '80px', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                            <span className="tnum" style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text)' }}>${tx.price.toFixed(2)}</span>
                            <span style={{ fontSize: '9px', fontWeight: 700, color: sideColor }}>{sideText}</span>
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
                            <span className="tnum" style={{ fontSize: '11px', fontWeight: 800, color: 'var(--cyan)' }}>
                              ${(tx.premium / 1000).toFixed(0)}K
                            </span>
                            <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                              {(tx.size / 1000).toFixed(1)}K shares
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Lock Overlay — ValueWall inside position:relative container */}
              {isLocked && (
                <div style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: '90px',
                  bottom: 0,
                  zIndex: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}>
                  <div style={{ height: '50px', background: 'linear-gradient(to bottom, rgba(5,10,20,0) 0%, rgba(5,10,20,1) 100%)' }} />
                  <div style={{ background: 'rgba(5,10,20,1)', padding: '0 8px 8px' }}>
                    <ValueWall
                      title={locale === 'ko' ? '기관급 실시간 옵션 체인' : locale === 'ja' ? '機関レベルのオプションチェーン' : 'Institutional Options Chain'}
                      subtitle={<>{locale === 'ko' ? '실시간 고래 거래 + 다크풀 플로우, ' : locale === 'ja' ? 'リアルタイムホエール取引 + ダークプールフロー、' : 'Real-time whale trades + dark-pool flow, '}<span style={{ color: 'var(--amber)' }}><b>{locale === 'ko' ? '지금 업데이트 중' : locale === 'ja' ? '更新中' : 'updating now'}</b></span>.</>}
                      teaser={{
                        label: locale === 'ko' ? 'INSTITUTIONAL · 무료 미리보기' : locale === 'ja' ? 'INSTITUTIONAL · 無料プレビュー' : 'INSTITUTIONAL · FREE PREVIEW',
                        value: volRegime || 'LOADED'
                      }}
                      socialProof={locale === 'ko' ? '오늘 14.2K 잠금해제' : locale === 'ja' ? '本日14.2Kがロック解除' : '14.2K unlocked today'}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Max Pain Info (also blurred if locked) */}
            <div style={{ 
              filter: isLocked ? 'blur(5px)' : 'none',
              opacity: isLocked ? 0.25 : 1,
              padding: '12px 14px',
              margin: '0 12px 12px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-btn)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              transition: 'all 0.3s ease'
            }}>
              <span style={{ font: 'var(--f-small)', color: 'var(--text-dim)' }}>{t.maxPain}</span>
              <span className="tnum" style={{ font: 'var(--f-h3)', fontWeight: 800, color: 'var(--amber)' }}>
                ${maxPainVal.toFixed(1)}
              </span>
            </div>

          </div>
      )}

      {/* 4. STRIKE PROFILE TAB */}
      {activeTab === 'strike-profile' && (() => {
        // Group rawChain by strike price
        const strikeMap: Record<number, { strike: number; put: number; call: number; isWall: boolean; isFloor: boolean; isUnderlyer?: boolean }> = {};
        
        // Find nearest expiration date
        const expirations = Array.from(new Set(rawChain.map(opt => opt.details?.expiration_date).filter(Boolean))).sort() as string[];
        const nearestExpiry = expirations[0] || '';
        
        // Filter options for this nearest expiry (or all if none)
        const filteredChain = nearestExpiry 
          ? rawChain.filter(opt => opt.details?.expiration_date === nearestExpiry)
          : rawChain;

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
            <div className="app-card" style={{ padding: '18px 16px', margin: 0 }}>
              <div className="app-card-head" style={{ marginBottom: '14px' }}>
                <span className="app-card-title">{locale === 'ko' ? '장중 행사가 프로파일' : locale === 'ja' ? 'イントラデイ行使価格プロファイル' : 'INTRADAY STRIKE PROFILE'}</span>
                <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)' }}>{expiryLabel}</span>
              </div>

              {/* Label header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--f-micro)', color: 'var(--text-muted)', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span>{locale === 'ko' ? 'PUT (매도/하방 지지)' : locale === 'ja' ? 'PUT (売り/下値支持)' : 'PUT (Sell/Support)'}</span>
                <span style={{ width: '60px', textAlign: 'center' }}>STRIKE</span>
                <span>{locale === 'ko' ? 'CALL (매수/상방 저항)' : locale === 'ja' ? 'CALL (買い/上値抵抗)' : 'CALL (Buy/Resistance)'}</span>
              </div>

              {/* Bar List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px', position: 'relative' }}>
                
                {/* Dynamic Underlyer Line */}
                {(() => {
                  if (selectedStrikes.length < 2) return null;
                  
                  let yPos = -999;
                  const topStrike = selectedStrikes[0];
                  const bottomStrike = selectedStrikes[selectedStrikes.length - 1];
                  
                  if (displayPrice >= topStrike) {
                    yPos = 10;
                  } else if (displayPrice <= bottomStrike) {
                    yPos = (selectedStrikes.length - 1) * 30 + 10;
                  } else {
                    for (let i = 0; i < selectedStrikes.length - 1; i++) {
                      const upper = selectedStrikes[i];
                      const lower = selectedStrikes[i + 1];
                      if (displayPrice <= upper && displayPrice > lower) {
                        const ratio = (upper - displayPrice) / (upper - lower);
                        yPos = i * 30 + 10 + ratio * 30;
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
                        boxShadow: '0 0 4px rgba(6, 182, 212, 0.5)'
                      }} />
                      <div style={{
                        background: 'rgba(6, 182, 212, 0.95)',
                        color: '#050a14',
                        font: '700 9px var(--f-mono)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        boxShadow: '0 0 8px rgba(6, 182, 212, 0.6)',
                        marginLeft: '6px',
                        marginRight: '6px',
                        border: '1px solid var(--cyan)',
                        whiteSpace: 'nowrap'
                      }}>
                        ${displayPrice.toFixed(2)}
                      </div>
                      <div style={{
                        flex: 1,
                        borderTop: '1.5px dashed var(--cyan)',
                        opacity: 0.85,
                        boxShadow: '0 0 4px rgba(6, 182, 212, 0.5)'
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
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', height: '20px', position: 'relative' }}>
                      {/* Put bar (grows left) */}
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', paddingRight: '10px' }}>
                        <div style={{
                          width: `${putPct}%`,
                          height: '8px',
                          background: isFloor ? 'linear-gradient(90deg, #ef4444 0%, #ef4444 100%)' : 'rgba(239, 68, 68, 0.45)',
                          borderRadius: '4px',
                          boxShadow: isFloor ? '0 0 8px rgba(239, 68, 68, 0.5)' : 'none',
                          transition: 'width 0.5s ease'
                        }} />
                      </div>

                      {/* Strike Label */}
                      <div className="tnum" style={{
                        width: '60px',
                        textAlign: 'center',
                        font: 'var(--f-micro)',
                        fontWeight: 800,
                        color: isClosest ? 'var(--cyan)' : 'var(--text)',
                        background: isClosest ? 'rgba(6, 182, 212, 0.1)' : 'transparent',
                        border: isClosest ? '1px solid rgba(6, 182, 212, 0.3)' : 'none',
                        borderRadius: '4px',
                        padding: isClosest ? '2px 0' : 0,
                        zIndex: 2
                      }}>
                        ${strike}
                      </div>

                      {/* Call bar (grows right) */}
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start', paddingLeft: '10px' }}>
                        <div style={{
                          width: `${callPct}%`,
                          height: '8px',
                          background: isWall ? 'linear-gradient(90deg, #10b981 0%, #10b981 100%)' : 'rgba(16, 185, 129, 0.45)',
                          borderRadius: '4px',
                          boxShadow: isWall ? '0 0 8px rgba(16, 185, 129, 0.5)' : 'none',
                          transition: 'width 0.5s ease'
                        }} />
                      </div>

                      {/* Floating Barrier Badges */}
                      {isWall && (
                        <span style={{ position: 'absolute', right: 0, font: '600 8px var(--f-mono)', background: 'var(--green-dim)', color: 'var(--green)', padding: '1px 4px', borderRadius: '3px', border: '1px solid rgba(16,185,129,0.2)' }}>
                          CALL WALL
                        </span>
                      )}
                      {isFloor && (
                        <span style={{ position: 'absolute', left: 0, font: '600 8px var(--f-mono)', background: 'var(--red-dim)', color: 'var(--red)', padding: '1px 4px', borderRadius: '3px', border: '1px solid rgba(239,68,68,0.2)' }}>
                          PUT FLOOR
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      </SwipeableTabs>
      </>)}

      {/* AD BANNER */}
      <AdBanner />
      <MobileAppFooter />
    </div>
  );
}
