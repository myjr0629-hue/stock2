'use client';

import { useState, useEffect, Suspense, useMemo, useRef } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { MobileAppFooter } from '@/components/mobile/MobileAppFooter';
import { Sparkline } from '@/components/app/Sparkline';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import s from './movers.module.css';

type MoversTab = 'value' | 'gainers' | 'losers';

interface MoverItem {
  ticker: string;
  price: number;
  changePercent: number;
  volume: number;
  value: number;
  up: boolean;
  spark: number[];
}

function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtVolume(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
  return n.toLocaleString();
}

function fmtValue(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000000000) return '$' + (n / 1000000000).toFixed(2) + 'B';
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
  return '$' + n.toLocaleString();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeMover(item: any): MoverItem {
  const price = Number(item?.price) || 0;
  const changePercent = Number(item?.changePercent) || 0;
  const volume = Number(item?.volume) || 0;
  const value = Number(item?.value) || volume * price;
  return {
    ticker: String(item?.ticker || item?.symbol || '').toUpperCase(),
    price,
    changePercent,
    volume,
    value,
    up: changePercent >= 0,
    spark: Array.isArray(item?.spark) ? item.spark.map((v: unknown) => Number(v)).filter(Number.isFinite) : [],
  };
}

function StockLogo({ symbol }: { symbol: string }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const sources = [
    `/api/logo/${symbol}?v=2`,
    `https://assets.parqet.com/logos/symbol/${symbol}?format=png`,
  ];
  const src = sources[sourceIndex];

  if (!src) {
    return (
      <div className={s.logoFallback}>
        {symbol.slice(0, 2)}
      </div>
    );
  }

  return (
    <div className={s.logoBubble}>
      <img
        loading="lazy"
        src={src}
        alt={symbol}
        className={s.logoImg}
        onError={() => setSourceIndex((idx) => idx + 1)}
      />
    </div>
  );
}

function MoversPageContent() {
  const locale = useLocale();
  const router = useRouter();
  const { status: marketStatus } = useMarketStatus();
  const [data, setData] = useState<{
    value: MoverItem[];
    gainers: MoverItem[];
    losers: MoverItem[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MoversTab>('value');
  const hasDataRef = useRef(false);

  const allTickers = useMemo(() => (
    data
      ? Array.from(new Set([
        ...data.value.map(m => m.ticker),
        ...data.gainers.map(m => m.ticker),
        ...data.losers.map(m => m.ticker)
      ]))
      : []
  ), [data]);

  const { prices } = useRealtimeData(allTickers);
  const equityWsActive = !marketStatus.isHoliday && marketStatus.market === 'open'
    && (marketStatus.session === 'pre' || marketStatus.session === 'regular' || marketStatus.session === 'post');

  useEffect(() => {
    let active = true;
    async function fetchAllMovers() {
      try {
        const res = await fetch('/api/market/movers?limit=20', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to fetch movers');
        const json = await res.json();
        if (active) {
          setData({
            value: (json.value || []).map(normalizeMover).filter((m: MoverItem) => m.ticker),
            gainers: (json.gainers || []).map(normalizeMover).filter((m: MoverItem) => m.ticker),
            losers: (json.losers || []).map(normalizeMover).filter((m: MoverItem) => m.ticker)
          });
          hasDataRef.current = true;
        }
      } catch (err) {
        console.error('Error fetching movers:', err);
        if (active && !hasDataRef.current) {
          setData({ value: [], gainers: [], losers: [] });
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchAllMovers();
    const interval = setInterval(fetchAllMovers, 15000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const t = {
    ko: {
      title: '실시간 마켓 무버',
      valueSec: '거래대금 상위 20',
      gainersSec: '상승률 상위 20',
      losersSec: '하락률 상위 20',
      loading: '실시간 데이터를 받아오는 중...',
      vol: '거래량',
      val: '거래대금',
      valueMetric: '거래대금',
      volumeMetric: '거래량',
      lastSession: 'CLOSE',
      leaderShare: '리더 대비',
      gainerImpact: '상승 임팩트',
      loserImpact: '하락 압력',
      errorNotice: '서버 연결 중... 데모 데이터를 표시합니다'
    },
    en: {
      title: 'Live Market Movers',
      valueSec: 'Top 20 Trading Value',
      gainersSec: 'Top 20 Gainers',
      losersSec: 'Top 20 Losers',
      loading: 'Fetching real-time data...',
      vol: 'Vol',
      val: 'Value',
      valueMetric: 'Trading value',
      volumeMetric: 'Volume',
      lastSession: 'CLOSE',
      leaderShare: 'Leader share',
      gainerImpact: 'Move impact',
      loserImpact: 'Downside pressure',
      errorNotice: 'Connecting to server... Showing demo data'
    },
    ja: {
      title: 'リアルタイム・ムーバー',
      valueSec: '取引代金上位 20',
      gainersSec: '上昇率上位 20',
      losersSec: '下落率上位 20',
      loading: 'リアルタイムデータを取得中...',
      vol: '出来高',
      val: '売買代金',
      valueMetric: '売買代金',
      volumeMetric: '出来高',
      lastSession: 'CLOSE',
      leaderShare: '首位比',
      gainerImpact: '上昇インパクト',
      loserImpact: '下落圧力',
      errorNotice: 'サーバー接続中... デモデータを表示しています'
    }
  }[locale as 'ko' | 'en' | 'ja'] || {
    title: 'Live Market Movers',
    valueSec: 'Top 20 Trading Value',
    gainersSec: 'Top 20 Gainers',
    losersSec: 'Top 20 Losers',
    loading: 'Fetching real-time data...',
    vol: 'Vol',
    val: 'Value',
    valueMetric: 'Trading value',
    volumeMetric: 'Volume',
    lastSession: 'CLOSE',
    leaderShare: 'Leader share',
    gainerImpact: 'Move impact',
    loserImpact: 'Downside pressure',
    errorNotice: 'Connecting to server... Showing demo data'
  };

  const handleTickerClick = (ticker: string) => {
    router.push(`/app-view/cmd?t=${ticker}`);
  };

  if (loading || !data) {
    return (
      <div className={s.loadingContainer}>
        <div className={s.spinner} />
        <span>{t.loading}</span>
      </div>
    );
  }



  const tabConfig = [
    { key: 'value' as const, color: '#22d3ee', rgb: '34,211,238',
      label: { ko: '거래대금', en: 'Value', ja: '売買代金' },
      sub: { ko: 'TOP 20', en: 'TOP 20', ja: 'TOP 20' },
    },
    { key: 'gainers' as const, color: '#10b981', rgb: '16,185,129',
      label: { ko: '상승률', en: 'Gainers', ja: '上昇率' },
      sub: { ko: 'TOP 20', en: 'TOP 20', ja: 'TOP 20' },
    },
    { key: 'losers' as const, color: '#ef4444', rgb: '239,68,68',
      label: { ko: '하락률', en: 'Losers', ja: '下落率' },
      sub: { ko: 'TOP 20', en: 'TOP 20', ja: 'TOP 20' },
    },
  ];

  const loc = (locale as 'ko' | 'en' | 'ja') || 'en';
  const activeColor = tabConfig.find(tb => tb.key === activeTab)?.color || '#22d3ee';
  const activeItems = activeTab === 'value' ? data.value : activeTab === 'gainers' ? data.gainers : data.losers;
  const activeTitle = activeTab === 'value' ? t.valueSec : activeTab === 'gainers' ? t.gainersSec : t.losersSec;
  const activeMetric = activeTab === 'value' ? t.valueMetric : t.volumeMetric;
  const maxRef = Math.max(
    ...activeItems.map((item) => activeTab === 'value' ? (item.value || item.volume * item.price) : item.volume),
    1
  );

  const renderRow = (item: MoverItem, index: number) => {
    const wsData = prices.get(item.ticker);
    const wsFresh = Boolean(wsData?.ts && Date.now() - wsData.ts < 120000);
    const useWsPrice = Boolean(equityWsActive && wsFresh && isFiniteNumber(wsData?.price) && wsData.price > 0);
    const useWsChange = Boolean(
      useWsPrice &&
      isFiniteNumber(wsData?.changePct) &&
      (Math.abs(wsData.changePct) >= 0.005 || Math.abs(item.changePercent) < 0.005)
    );
    const displayPrice = useWsPrice ? wsData!.price : item.price;
    const displayChangePercent = useWsChange ? wsData!.changePct : item.changePercent;
    
    const displayVolume = item.volume;
    const displayValue = item.value || displayVolume * item.price;

    const chgText = `${displayChangePercent >= 0 ? '+' : ''}${displayChangePercent.toFixed(2)}%`;
    const rankClass = index === 0 ? s.rank1 : index === 1 ? s.rank2 : index === 2 ? s.rank3 : s.rank;
    const relativePercent = Math.min(100, Math.max(5, ((activeTab === 'value' ? displayValue : displayVolume) / maxRef) * 100));
    const reasonLine = activeTab === 'value'
      ? `${t.leaderShare} ${Math.round(relativePercent)}%`
      : activeTab === 'gainers'
        ? `${t.gainerImpact} ${chgText}`
        : `${t.loserImpact} ${chgText}`;

    return (
      <div key={item.ticker} className={s.row} onClick={() => handleTickerClick(item.ticker)}>
        <span className={rankClass}>{index + 1}</span>
        <div className={s.logoCol}>
          <StockLogo symbol={item.ticker} />
        </div>
        <div className={s.infoCol}>
          <span className={s.name}>{item.ticker}</span>
          <span className={s.volume}>
            {activeTab === 'value' ? `${t.val}: ${fmtValue(displayValue)}` : `${t.vol}: ${fmtVolume(displayVolume)}`}
          </span>
          <span className={`${s.reason} ${displayChangePercent >= 0 ? s.reasonUp : s.reasonDn}`}>{reasonLine}</span>
          <div className={s.progressTrack}>
            <div className={s.progressBar} style={{ width: `${relativePercent}%`, background: activeColor }} />
          </div>
        </div>
        <div className={s.sparkCol}>
          <Sparkline data={item.spark || []} up={displayChangePercent >= 0} height={20} fill />
        </div>
        <div className={s.priceCol}>
          <span className={s.price}>${fmtPrice(displayPrice)}</span>
          <span className={`${s.chg} ${displayChangePercent >= 0 ? s.chgUp : s.chgDn}`}>
            {chgText}
          </span>
        </div>
      </div>
    );
  };

  // SVG icons for each tab
  const tabIcons: Record<string, React.ReactNode> = {
    value: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" />
        <line x1="12" y1="11" x2="12" y2="17" />
        <line x1="9" y1="14" x2="15" y2="14" />
      </svg>
    ),
    gainers: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
    losers: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
        <polyline points="16 17 22 17 22 11" />
      </svg>
    ),
  };

  return (
    <div className={s.viewport}>
      {/* Header */}
      <div className={s.hdr}>
        <button className={s.backBtn} onClick={() => router.back()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        <span className={s.title}>{t.title}</span>
      </div>

      {/* Premium Infographic Tab Control */}
      <div className={s.tabContainer}>
        <div className={s.tabTrack}>
          {tabConfig.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                className={`${s.tabBtn} ${isActive ? s.tabActive : ''}`}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  '--tab-color': tab.color,
                  '--tab-rgb': tab.rgb,
                  borderColor: isActive ? `rgba(${tab.rgb}, 0.5)` : 'transparent',
                  background: isActive
                    ? `linear-gradient(135deg, rgba(${tab.rgb}, 0.2) 0%, rgba(${tab.rgb}, 0.06) 100%)`
                    : 'transparent',
                } as React.CSSProperties}
              >
                <div className={s.tabIconWrap} style={{
                  color: isActive ? tab.color : '#94a3b8',
                  background: isActive ? `rgba(${tab.rgb}, 0.15)` : 'rgba(255,255,255,0.05)',
                  boxShadow: isActive ? `0 0 12px rgba(${tab.rgb}, 0.25)` : 'none',
                }}>
                  {tabIcons[tab.key]}
                </div>
                <span className={s.tabLabel} style={{ color: isActive ? tab.color : '#94a3b8' }}>
                  {tab.label[loc]}
                </span>
                {isActive && <div className={s.tabGlow} style={{ background: tab.color }} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content scroll */}
      <div className={s.scroll}>
        <div className={`${s.card} ${activeTab === 'value' ? s.cardValue : activeTab === 'gainers' ? s.cardGainers : s.cardLosers}`}>
          <div className={s.listHead}>
            <div>
              <span className={s.listEyebrow}>{activeMetric}</span>
              <h2 className={s.listTitle}>{activeTitle}</h2>
            </div>
            <span className={s.sessionPill}>{equityWsActive ? 'LIVE' : t.lastSession}</span>
          </div>
          {activeItems.map((item, index) => renderRow(item, index))}
        </div>
        <MobileAppFooter />
      </div>
    </div>
  );
}

export default function MoversPage() {
  return (
    <Suspense fallback={
      <div className={s.loadingContainer}>
        <div className={s.spinner} />
      </div>
    }>
      <MoversPageContent />
    </Suspense>
  );
}
