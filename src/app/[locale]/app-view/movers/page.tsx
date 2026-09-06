'use client';

import { useState, useEffect, Suspense, useMemo, useRef } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { MobileAppFooter } from '@/components/mobile/MobileAppFooter';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
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

// Delegates to the shared app logo so Movers matches every other surface.

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

  // Session-accurate badge (mirrors the Intel screen): LIVE / PRE-MKT / POST-MKT / CLOSED.
  // Previously this hard-coded "CLOSE" whenever the websocket was idle, which showed
  // "CLOSE" during pre/post-market. Derive from the real market session instead.
  const sessionBadge = marketStatus.session === 'regular'
    ? { text: 'LIVE', color: '#10b981', pulse: true }
    : marketStatus.session === 'pre'
      ? { text: 'PRE-MKT', color: '#f59e0b', pulse: true }
      : marketStatus.session === 'post'
        ? { text: 'POST-MKT', color: '#22d3ee', pulse: true }
        : { text: 'CLOSED', color: '#94a3b8', pulse: false };

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
  const activeItems = activeTab === 'value' ? data.value : activeTab === 'gainers' ? data.gainers : data.losers;
  const activeTitle = activeTab === 'value' ? t.valueSec : activeTab === 'gainers' ? t.gainersSec : t.losersSec;

  /* 행 — 히트맵 «오늘의 양 끝»(hmXR)과 같은 한 줄 문법으로 맞춘다(대표 지시).
     [순위][로고][티커][가격 · 지표][막대][등락률] — 4줄 스택을 한 줄로. */
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
    const up = displayChangePercent >= 0;
    const chgText = `${up ? '+' : ''}${displayChangePercent.toFixed(2)}%`;
    const metric = activeTab === 'value'
      ? `${t.val} ${fmtValue(displayValue)}`
      : `${t.vol} ${fmtVolume(displayVolume)}`;

    return (
      <a
        key={item.ticker}
        className={s.mvR}
        role="button"
        tabIndex={0}
        onClick={() => handleTickerClick(item.ticker)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTickerClick(item.ticker); } }}
      >
        <span className={`${s.mvRk} num`}>{index + 1}</span>
        <AppTickerLogo symbol={item.ticker} size={18} />
        <b className={s.mvT}>{item.ticker}</b>
        <span className={`${s.mvS} num`}>{metric}</span>
        <b className={`${s.mvP} num ${up ? s.mvGr : s.mvRd}`}>{chgText}</b>
        <span className={`${s.mvPx} num`}>${fmtPrice(displayPrice)}</span>
      </a>
    );
  };

  // SVG icons for each tab


  return (
    <div className={s.mvWrap}>
      <div className={s.mvNav}>
        <button type="button" className={s.mvBack} aria-label="Back" onClick={() => router.back()}>
          <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span className={s.mvEy}>MARKET MOVERS</span>
      </div>

      <div className={s.mvHead}>
        <div className={s.mvTitle}>{t.title}</div>
        <div className={s.mvSub}>{[activeTitle, activeItems.length ? `${activeItems.length}` : null]
          .filter(Boolean).join(' · ')}</div>
      </div>

      <div className={s.mvTabs}>
        {tabConfig.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${s.mvTab} ${activeTab === tab.key ? s.on : ''}`}
            aria-pressed={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label[loc]}
          </button>
        ))}
        <span className={s.mvSess}>{sessionBadge.text}</span>
      </div>

      <div className={s.mvList}>
        {activeItems.length
          ? activeItems.map((item, index) => renderRow(item, index))
          : [0, 1, 2, 3, 4].map((i) => <div key={`mvskel-${i}`} className={s.mvSkel} />)}
      </div>

      <MobileAppFooter />
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
