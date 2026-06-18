'use client';

import { useState, useEffect, Suspense } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { MobileAppFooter } from '@/components/mobile/MobileAppFooter';
import { Sparkline } from '@/components/app/Sparkline';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import s from './movers.module.css';

interface MoverItem {
  ticker: string;
  price: number;
  changePercent: number;
  volume: number;
  value: number;
  up: boolean;
  spark: number[];
}

const DEMO_MOVERS: MoverItem[] = [
  { ticker: 'NVDA', price: 135.42, changePercent: 5.2, volume: 45200000, value: 6100000000, up: true, spark: [128,130,132,131,134,135] },
  { ticker: 'TSLA', price: 168.90, changePercent: -2.1, volume: 38100000, value: 6430000000, up: false, spark: [172,171,170,169,168,169] },
  { ticker: 'AAPL', price: 212.55, changePercent: 1.8, volume: 31200000, value: 6628000000, up: true, spark: [208,209,210,211,212,213] },
  { ticker: 'AMD', price: 164.30, changePercent: 3.4, volume: 28900000, value: 4749000000, up: true, spark: [158,160,161,163,164,164] },
  { ticker: 'MSFT', price: 432.10, changePercent: 0.8, volume: 22100000, value: 9550000000, up: true, spark: [428,429,430,431,432,432] },
];

function fmtPrice(n: number): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtVolume(n: number): string {
  if (n == null) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
  return n.toLocaleString();
}

function fmtValue(n: number): string {
  if (n == null) return '—';
  if (n >= 1000000000) return '$' + (n / 1000000000).toFixed(2) + 'B';
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
  return '$' + n.toLocaleString();
}

function StockLogo({ symbol }: { symbol: string }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#22d3ee',
        fontWeight: 800,
        fontSize: '12px',
        fontFamily: 'monospace',
        flexShrink: 0
      }}>
        {symbol.charAt(0)}
      </div>
    );
  }

  return (
    <div style={{
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      background: '#ffffff',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '4px',
      overflow: 'hidden',
      flexShrink: 0
    }}>
      <img
        loading="lazy"
        src={`/api/logo/${symbol}`}
        alt={symbol}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        onError={() => setError(true)}
      />
    </div>
  );
}

function MoversPageContent() {
  const locale = useLocale();
  const router = useRouter();
  const [data, setData] = useState<{
    value: MoverItem[];
    gainers: MoverItem[];
    losers: MoverItem[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'value' | 'gainers' | 'losers'>('value');

  const allTickers = data 
    ? Array.from(new Set([
        ...data.value.map(m => m.ticker),
        ...data.gainers.map(m => m.ticker),
        ...data.losers.map(m => m.ticker)
      ]))
    : [];

  const { prices } = useRealtimeData(allTickers);

  useEffect(() => {
    let active = true;
    async function fetchAllMovers() {
      try {
        const res = await fetch('/api/market/movers');
        if (!res.ok) throw new Error('Failed to fetch movers');
        const json = await res.json();
        if (active) {
          setData({
            value: json.value || [],
            gainers: json.gainers || [],
            losers: json.losers || []
          });
        }
      } catch (err) {
        console.error('Error fetching movers:', err);
        if (active && !data) {
          setData({
            value: DEMO_MOVERS,
            gainers: DEMO_MOVERS.filter(m => m.up),
            losers: DEMO_MOVERS.filter(m => !m.up)
          });
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
      valueSec: '거래대금 상위 10',
      gainersSec: '상승률 상위 10',
      losersSec: '하락률 상위 10',
      loading: '실시간 데이터를 받아오는 중...',
      vol: '거래량',
      val: '거래대금',
      errorNotice: '서버 연결 중... 데모 데이터를 표시합니다'
    },
    en: {
      title: 'Live Market Movers',
      valueSec: 'Top 10 Trading Value',
      gainersSec: 'Top 10 Gainers',
      losersSec: 'Top 10 Losers',
      loading: 'Fetching real-time data...',
      vol: 'Vol',
      val: 'Value',
      errorNotice: 'Connecting to server... Showing demo data'
    },
    ja: {
      title: 'リアルタイム・ムーバー',
      valueSec: '取引代金上位 10',
      gainersSec: '上昇率上位 10',
      losersSec: '下落率上位 10',
      loading: 'リアルタイムデータを取得中...',
      vol: '出来高',
      val: '売買代金',
      errorNotice: 'サーバー接続中... デモデータを表示しています'
    }
  }[locale as 'ko' | 'en' | 'ja'] || {
    title: 'Live Market Movers',
    valueSec: 'Top 10 Trading Value',
    gainersSec: 'Top 10 Gainers',
    losersSec: 'Top 10 Losers',
    loading: 'Fetching real-time data...',
    vol: 'Vol',
    val: 'Value',
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
      label: { ko: '거래대금', en: 'Volume', ja: '売買代金' },
      sub: { ko: 'TOP 10', en: 'TOP 10', ja: 'TOP 10' },
    },
    { key: 'gainers' as const, color: '#10b981', rgb: '16,185,129',
      label: { ko: '상승률', en: 'Gainers', ja: '上昇率' },
      sub: { ko: 'TOP 10', en: 'TOP 10', ja: 'TOP 10' },
    },
    { key: 'losers' as const, color: '#ef4444', rgb: '239,68,68',
      label: { ko: '하락률', en: 'Losers', ja: '下落率' },
      sub: { ko: 'TOP 10', en: 'TOP 10', ja: 'TOP 10' },
    },
  ];

  const loc = (locale as 'ko' | 'en' | 'ja') || 'en';
  const activeColor = tabConfig.find(tb => tb.key === activeTab)?.color || '#22d3ee';
  const activeItems = activeTab === 'value' ? data.value : activeTab === 'gainers' ? data.gainers : data.losers;

  const renderRow = (item: MoverItem, index: number) => {
    const wsData = prices.get(item.ticker);
    const displayPrice = wsData ? wsData.price : item.price;
    const displayChangePercent = wsData ? wsData.changePct : item.changePercent;
    
    // Use the actual daily volume from the snapshot (item.volume).
    // The WebSocket volume (wsData.volume) is only the volume accumulated since the connection started, not the full daily volume.
    const displayVolume = item.volume;
    const displayValue = displayVolume * displayPrice;

    const chgText = `${displayChangePercent >= 0 ? '+' : ''}${displayChangePercent.toFixed(2)}%`;
    const rankClass = index === 0 ? s.rank1 : index === 1 ? s.rank2 : index === 2 ? s.rank3 : s.rank;

    // Calculate maxRef based on displayValue of the first item (which is the highest) or max volume of active items
    const firstItem = data.value[0];
    const firstItemPrice = firstItem ? (prices.get(firstItem.ticker)?.price || firstItem.price) : 1;
    const firstItemVal = firstItem ? firstItem.volume * firstItemPrice : 1;

    const maxRef = activeTab === 'value'
      ? firstItemVal
      : Math.max(...activeItems.map(x => x.volume), 1);

    const relativePercent = Math.min(100, Math.max(5, ((activeTab === 'value' ? displayValue : displayVolume) / maxRef) * 100));

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
            const count = tab.key === 'value' ? data.value.length : tab.key === 'gainers' ? data.gainers.length : data.losers.length;
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
