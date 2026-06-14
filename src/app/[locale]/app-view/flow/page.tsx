'use client';

import { useState, useEffect, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { AdBanner } from '@/components/app/AdBanner';
import s from '../dash/dash.module.css';

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
    vol: '거래량',
    oi: '미결제약정',
    ratio: '배수',
    whaleLockDesc: '30초 광고를 시청하시면 $100K 이상의 고래 거래 전체 내역과 이례적 거래 폭발 종목을 1시간 동안 해금합니다.'
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
    vol: 'Volume',
    oi: 'OI',
    ratio: 'Ratio',
    whaleLockDesc: 'Watch a 30-second video to unlock the full list of Whale Sweeps (>$100K) and Unusual Option Activities for 1 hour.'
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
    vol: '出来高',
    oi: '建玉',
    ratio: '倍率',
    whaleLockDesc: '30秒의 광고를 시청하면, 1시간 $100K 이상의 고래 거래 전체 내역과 이례적 거래 폭발 종목을 해금합니다.'
  }
};

/* ═══════════════════════════════════════════════════════════
   DEMO FALLBACK DATA — Always show content even if APIs fail
   ═══════════════════════════════════════════════════════════ */

interface FlowTransaction {
  time: string;
  strike: number;
  type: 'CALL' | 'PUT';
  expiry: string;
  size: number;
  px: number;
  premium: number;
  dir: 'BID' | 'ASK' | 'MID';
}

const DEMO_FLOW: FlowTransaction[] = [
  { time: '10:14:22', strike: 140, type: 'CALL', expiry: 'Jun 19', size: 1250, px: 2.45, premium: 306250, dir: 'ASK' },
  { time: '10:13:05', strike: 135, type: 'PUT', expiry: 'Jun 12', size: 850, px: 1.12, premium: 95200, dir: 'BID' },
  { time: '10:11:58', strike: 145, type: 'CALL', expiry: 'Jun 19', size: 2100, px: 1.22, premium: 256200, dir: 'ASK' },
  { time: '10:10:15', strike: 130, type: 'PUT', expiry: 'Jun 26', size: 500, px: 3.10, premium: 155000, dir: 'MID' },
  { time: '10:08:44', strike: 138, type: 'CALL', expiry: 'Jun 12', size: 1100, px: 1.85, premium: 203500, dir: 'ASK' },
];

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

export default function AppFlowPage() {
  const locale = useLocale();
  const t = useMemo(() => TRANSLATIONS[locale] || TRANSLATIONS.en, [locale]);

  const [ticker, setTicker] = useState('NVDA');
  const [searchInput, setSearchInput] = useState('NVDA');
  const [loading, setLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(true);

  // Flow State
  const [price, setPrice] = useState(208.19);
  const [change, setChange] = useState(-0.22);
  const [opi, setOpi] = useState(72.4); // 0-100
  const [pcRatio, setPcRatio] = useState(0.68);
  const [totalPrem, setTotalPrem] = useState(18900000); // USD
  const [callPct, setCallPct] = useState(64.5); // %
  const [maxPainVal, setMaxPainVal] = useState(135.0);
  const [volRegime, setVolRegime] = useState('LOADED'); // STABLE, LOADED, ERUPTING
  const [transactions, setTransactions] = useState<FlowTransaction[]>(DEMO_FLOW);
  const [rawChain, setRawChain] = useState<any[]>([]);
  const [flowTab, setFlowTab] = useState<'whale' | 'uoa'>('whale');

  // Check localStorage for unlock timestamp
  useEffect(() => {
    const checkUnlock = () => {
      const expiry = localStorage.getItem('flow_unlock_expiry');
      if (expiry && Date.now() < parseInt(expiry)) {
        setIsLocked(false);
      } else {
        setIsLocked(true);
      }
    };
    checkUnlock();
    // Listen for storage changes
    window.addEventListener('storage', checkUnlock);
    return () => window.removeEventListener('storage', checkUnlock);
  }, []);

  // Fetch Ticker Option Flow Data
  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;

    async function fetchFlow() {
      setLoading(true);
      try {
        const res = await fetch(`/api/live/ticker?t=${ticker.toUpperCase()}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (cancelled) return;

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
            const txs: FlowTransaction[] = flow.rawChain.slice(0, 8).map((c: any, i: number) => {
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
            setTransactions(txs);
          } else {
            setRawChain([]);
            setTransactions(DEMO_FLOW);
          }
        }
      } catch {
        // Fallback to synthetic values for fallback ticker
        setPrice(ticker === 'TSLA' ? 168.90 : ticker === 'AAPL' ? 212.55 : 208.19);
        setChange(ticker === 'TSLA' ? -2.1 : 1.8);
        setOpi(ticker === 'TSLA' ? 38.5 : 62.4);
        setPcRatio(ticker === 'TSLA' ? 1.45 : 0.72);
        setTotalPrem(14500000);
        setCallPct(ticker === 'TSLA' ? 42.1 : 58.6);
        setMaxPainVal(ticker === 'TSLA' ? 170.0 : 210.0);
        setRawChain([]);
        setTransactions(DEMO_FLOW);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchFlow();
    return () => { cancelled = true; };
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
    const expiry = Date.now() + 60 * 60 * 1000; // 1 hour
    localStorage.setItem('flow_unlock_expiry', String(expiry));
    // Trigger custom event to notify storage listener
    window.dispatchEvent(new Event('storage'));
  };

  // Gauge calculations
  const gaugeColor = opi >= 60 ? 'var(--green)' : opi >= 40 ? 'var(--amber)' : 'var(--red)';
  const gaugeStatus = opi >= 60 ? 'BULLISH' : opi >= 40 ? 'NEUTRAL' : 'BEARISH';
  const rotationAngle = -90 + (opi / 100) * 180; // maps 0-100 to -90 to +90 degrees

  return (
    <div className={s.page} style={{ paddingBottom: '90px' }}>
      {/* HEADER */}
      <header className="app-header">
        <div className={s.headerTitle} style={{ font: 'var(--f-h2)', fontWeight: 800 }}>
          {t.title}
        </div>
        <div className={s.headerActions}>
          <span className="app-label-premium" style={{ padding: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cyan)', boxShadow: '0 0 6px var(--cyan)' }} />
            LIVE
          </span>
        </div>
      </header>

      {/* SEARCH BAR */}
      <form onSubmit={handleSearch} style={{ padding: '12px 16px 4px' }}>
        <div style={{ position: 'relative', display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t.searchPlaceholder}
            style={{
              flex: 1,
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-btn)',
              padding: '10px 14px',
              font: 'var(--f-body)',
              color: 'var(--text)',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              background: 'var(--cyan-dim)',
              border: '1px solid var(--cyan)',
              color: 'var(--cyan)',
              borderRadius: 'var(--r-btn)',
              padding: '0 16px',
              font: 'var(--f-h3)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            GO
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

      {/* UNDERLYING PRICE INFO */}
      <div className="app-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
        <div>
          <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)' }}>{t.underlyer}</span>
          <div style={{ font: 'var(--f-h2)', fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{ticker}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="tnum" style={{ font: 'var(--f-h2)', fontWeight: 800 }}>${price.toFixed(2)}</div>
          <div className="tnum" style={{ font: 'var(--f-small)', color: change >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 2 }}>
            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* OPI GAUGE & PCR */}
      <div className="app-card" style={{ padding: '20px 16px' }}>
        <div className="app-card-head" style={{ marginBottom: 0 }}>
          <span className="app-card-title">{t.opiGauge}</span>
          <span style={{ font: 'var(--f-micro)', fontWeight: 700, color: gaugeColor }}>{gaugeStatus}</span>
        </div>

        {/* Semi-circular Gauge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 12, position: 'relative' }}>
          <svg width="180" height="96" viewBox="0 0 180 96">
            {/* Background path */}
            <path
              d={describeArc(90, 90, 80, -90, 90)}
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            {/* Value path */}
            <path
              d={describeArc(90, 90, 80, -90, -90 + (opi / 100) * 180)}
              fill="none"
              stroke={gaugeColor}
              strokeWidth="12"
              strokeLinecap="round"
            />
            {/* Dial needle center */}
            <circle cx="90" cy="90" r="6" fill="var(--text)" />
            {/* Dial needle */}
            <line
              x1="90"
              y1="90"
              x2="90"
              y2="24"
              stroke="var(--text)"
              strokeWidth="2.5"
              strokeLinecap="round"
              transform={`rotate(${rotationAngle} 90 90)`}
              style={{ transition: 'transform 0.8s ease-out' }}
            />
          </svg>
          <div style={{ position: 'absolute', bottom: 2, textAlign: 'center' }}>
            <span className="tnum" style={{ font: 'var(--f-display)', fontSize: '26px', fontWeight: 800 }}>{opi.toFixed(1)}</span>
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

      {/* FLOW SUMMARY */}
      <div className="app-card">
        <div className="app-card-head">
          <span className="app-card-title">{t.totalPremium}</span>
          <span className="tnum" style={{ font: 'var(--f-h3)', fontWeight: 700 }}>
            ${(totalPrem / 1000000).toFixed(1)}M
          </span>
        </div>
        
        {/* Double bar slider chart */}
        <div style={{ background: 'rgba(255,255,255,0.03)', height: '14px', borderRadius: '7px', overflow: 'hidden', display: 'flex', margin: '8px 0 16px' }}>
          <div style={{ width: `${callPct}%`, background: 'var(--green)', height: '100%' }} />
          <div style={{ width: `${100 - callPct}%`, background: 'var(--red)', height: '100%' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
            <span style={{ font: 'var(--f-small)', color: 'var(--text-dim)' }}>{t.callBullish}</span>
            <span className="tnum" style={{ font: 'var(--f-small)', fontWeight: 700, color: 'var(--green)' }}>{callPct.toFixed(1)}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)' }} />
            <span style={{ font: 'var(--f-small)', color: 'var(--text-dim)' }}>{t.putBearish}</span>
            <span className="tnum" style={{ font: 'var(--f-small)', fontWeight: 700, color: 'var(--red)' }}>{(100 - callPct).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* VALUE WALL / PREMIUM OPTIONS TABLE */}
      <div style={{ position: 'relative', overflow: 'hidden', margin: '12px 16px var(--s3)', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--r-card)' }}>
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
            onClick={() => setFlowTab('uoa')}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 'var(--r-btn)',
              border: 'none',
              background: flowTab === 'uoa' ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
              color: flowTab === 'uoa' ? '#a78bfa' : 'var(--text-dim)',
              font: 'var(--f-micro)',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {t.uoaTitle}
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ padding: '0 12px' }}>
          {flowTab === 'whale' ? (
            /* Whale Sweep Radar */
            <div>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', font: 'var(--f-micro)', color: 'var(--text-muted)' }}>
                <span style={{ width: '55px' }}>TIME</span>
                <span style={{ width: '65px', textAlign: 'center' }}>STRIKE</span>
                <span style={{ width: '35px', textAlign: 'center' }}>TYPE</span>
                <span style={{ width: '50px', textAlign: 'center' }}>EXPIRY</span>
                <span style={{ flex: 1, textAlign: 'right' }}>PREMIUM</span>
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
            /* Unusual Options Activity (UOA) */
            <div>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', font: 'var(--f-micro)', color: 'var(--text-muted)' }}>
                <span style={{ width: '65px' }}>STRIKE</span>
                <span style={{ width: '45px', textAlign: 'center' }}>TYPE</span>
                <span style={{ width: '60px', textAlign: 'center' }}>EXPIRY</span>
                <span style={{ width: '65px', textAlign: 'right' }}>{t.vol}</span>
                <span style={{ flex: 1, textAlign: 'right' }}>{t.ratio}</span>
              </div>
              {/* List */}
              {uoaList.map((item, idx) => {
                const blur = isLocked && idx >= 2;
                return (
                  <div 
                    key={idx} 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      padding: '12px 0', 
                      borderBottom: idx < uoaList.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none', 
                      font: 'var(--f-small)',
                      filter: blur ? 'blur(5px)' : 'none',
                      opacity: blur ? 0.25 : 1,
                      pointerEvents: blur ? 'none' : 'auto',
                      transition: 'filter 0.3s ease, opacity 0.3s ease'
                    }}
                  >
                    <span className="tnum" style={{ width: '65px', fontWeight: 700, color: 'var(--text)' }}>
                      ${item.strike}
                    </span>
                    <span style={{ width: '45px', textAlign: 'center', fontWeight: 900, color: item.type === 'CALL' ? 'var(--green)' : 'var(--red)' }}>
                      {item.type === 'CALL' ? 'C' : 'P'}
                    </span>
                    <span className="tnum" style={{ width: '60px', textAlign: 'center', color: 'var(--text-dim)' }}>{item.expiry}</span>
                    <span className="tnum" style={{ width: '65px', textAlign: 'right', color: 'var(--text)' }}>{item.volume}</span>
                    <span className="tnum" style={{ flex: 1, textAlign: 'right', fontWeight: 800, color: '#a78bfa' }}>
                      {item.ratio.toFixed(2)}x
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Max Pain Info (also blurred if locked) */}
        <div style={{ 
          filter: isLocked ? 'blur(5px)' : 'none',
          opacity: isLocked ? 0.25 : 1,
          padding: '14px',
          margin: '12px',
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

        {/* Lock Overlay (Value Wall / Peek mode) */}
        {isLocked && (
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '240px',
            background: 'linear-gradient(to bottom, rgba(5,10,20,0) 0%, rgba(5,10,20,0.85) 35%, rgba(5,10,20,0.98) 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '20px 20px 24px',
            textAlign: 'center',
            zIndex: 10
          }}>
            {/* Glowing lock icon */}
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid var(--amber)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(245, 158, 11, 0.2)',
              marginBottom: '10px'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="var(--amber)" strokeWidth="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="var(--amber)" strokeWidth="2" />
              </svg>
            </div>

            <h3 style={{ font: 'var(--f-h3)', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>
              {t.lockTitle}
            </h3>
            <p style={{ font: 'var(--f-micro)', color: 'var(--text-dim)', maxWidth: '280px', lineHeight: 1.4, marginBottom: '14px' }}>
              {t.whaleLockDesc}
            </p>

            <button
              onClick={handleUnlock}
              style={{
                background: 'linear-gradient(135deg, var(--amber) 0%, #d97706 100%)',
                border: 'none',
                color: '#050a14',
                padding: '10px 24px',
                borderRadius: 'var(--r-pill)',
                font: 'var(--f-small)',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              {t.unlockBtn}
            </button>
            <span style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', marginTop: '8px' }}>
              {t.unlockSub}
            </span>
          </div>
        )}
      </div>

      {/* AD BANNER */}
      <AdBanner />
    </div>
  );
}
