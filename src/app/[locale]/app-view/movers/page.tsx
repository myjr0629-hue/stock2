'use client';

import { useState, useEffect, Suspense } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { Sparkline } from '@/components/app/Sparkline';
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
      val: '거래대금'
    },
    en: {
      title: 'Live Market Movers',
      valueSec: 'Top 10 Trading Value',
      gainersSec: 'Top 10 Gainers',
      losersSec: 'Top 10 Losers',
      loading: 'Fetching real-time data...',
      vol: 'Vol',
      val: 'Value'
    },
    ja: {
      title: 'リアルタイム・ムーバー',
      valueSec: '取引代金上位 10',
      gainersSec: '上昇率上位 10',
      losersSec: '下落率上位 10',
      loading: 'リアルタイムデータを取得中...',
      vol: '出来高',
      val: '売買代金'
    }
  }[locale as 'ko' | 'en' | 'ja'] || {
    title: 'Live Market Movers',
    valueSec: 'Top 10 Trading Value',
    gainersSec: 'Top 10 Gainers',
    losersSec: 'Top 10 Losers',
    loading: 'Fetching real-time data...',
    vol: 'Vol',
    val: 'Value'
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

      {/* Main content scroll */}
      <div className={s.scroll}>
        {/* 1. Trading Value Section */}
        <div className={s.section}>
          <div className={s.secHead}>
            <div className={s.secBar} style={{ background: 'var(--cyan)', boxShadow: '0 0 8px var(--cyan)' }} />
            <span className={s.secTitle}>{t.valueSec}</span>
          </div>
          <div className={`${s.card} ${s.cardValue}`}>
            {data.value.map((item, index) => {
              const chgText = `${item.changePercent >= 0 ? '+' : ''}${item.changePercent.toFixed(2)}%`;
              const rankClass = index === 0 ? s.rank1 : index === 1 ? s.rank2 : index === 2 ? s.rank3 : s.rank;
              const maxVal = data.value[0]?.value || 1;
              const relativePercent = Math.min(100, Math.max(5, (item.value / maxVal) * 100));

              return (
                <div key={item.ticker} className={s.row} onClick={() => handleTickerClick(item.ticker)}>
                  <span className={rankClass}>{index + 1}</span>
                  <div className={s.logoCol}>
                    <StockLogo symbol={item.ticker} />
                  </div>
                  <div className={s.infoCol}>
                    <span className={s.name}>{item.ticker}</span>
                    <span className={s.volume}>
                      {t.val}: {fmtValue(item.value)}
                    </span>
                    <div className={s.progressTrack}>
                      <div className={s.progressBar} style={{ width: `${relativePercent}%`, background: 'var(--cyan)' }} />
                    </div>
                  </div>
                  <div className={s.sparkCol}>
                    <Sparkline data={item.spark || []} up={item.changePercent >= 0} height={20} fill />
                  </div>
                  <div className={s.priceCol}>
                    <span className={s.price}>${fmtPrice(item.price)}</span>
                    <span className={`${s.chg} ${item.changePercent >= 0 ? s.chgUp : s.chgDn}`}>
                      {chgText}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Gainers Section */}
        <div className={s.section}>
          <div className={s.secHead}>
            <div className={s.secBar} style={{ background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
            <span className={s.secTitle}>{t.gainersSec}</span>
          </div>
          <div className={`${s.card} ${s.cardGainers}`}>
            {data.gainers.map((item, index) => {
              const chgText = `${item.changePercent >= 0 ? '+' : ''}${item.changePercent.toFixed(2)}%`;
              const rankClass = index === 0 ? s.rank1 : index === 1 ? s.rank2 : index === 2 ? s.rank3 : s.rank;
              const maxVol = Math.max(...data.gainers.map(x => x.volume), 1);
              const relativePercent = Math.min(100, Math.max(5, (item.volume / maxVol) * 100));

              return (
                <div key={item.ticker} className={s.row} onClick={() => handleTickerClick(item.ticker)}>
                  <span className={rankClass}>{index + 1}</span>
                  <div className={s.logoCol}>
                    <StockLogo symbol={item.ticker} />
                  </div>
                  <div className={s.infoCol}>
                    <span className={s.name}>{item.ticker}</span>
                    <span className={s.volume}>
                      {t.vol}: {fmtVolume(item.volume)}
                    </span>
                    <div className={s.progressTrack}>
                      <div className={s.progressBar} style={{ width: `${relativePercent}%`, background: '#10b981' }} />
                    </div>
                  </div>
                  <div className={s.sparkCol}>
                    <Sparkline data={item.spark || []} up={item.changePercent >= 0} height={20} fill />
                  </div>
                  <div className={s.priceCol}>
                    <span className={s.price}>${fmtPrice(item.price)}</span>
                    <span className={`${s.chg} ${item.changePercent >= 0 ? s.chgUp : s.chgDn}`}>
                      {chgText}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Losers Section */}
        <div className={s.section}>
          <div className={s.secHead}>
            <div className={s.secBar} style={{ background: '#ef4444', boxShadow: '0 0 8px #ef4444' }} />
            <span className={s.secTitle}>{t.losersSec}</span>
          </div>
          <div className={`${s.card} ${s.cardLosers}`}>
            {data.losers.map((item, index) => {
              const chgText = `${item.changePercent >= 0 ? '+' : ''}${item.changePercent.toFixed(2)}%`;
              const rankClass = index === 0 ? s.rank1 : index === 1 ? s.rank2 : index === 2 ? s.rank3 : s.rank;
              const maxVol = Math.max(...data.losers.map(x => x.volume), 1);
              const relativePercent = Math.min(100, Math.max(5, (item.volume / maxVol) * 100));

              return (
                <div key={item.ticker} className={s.row} onClick={() => handleTickerClick(item.ticker)}>
                  <span className={rankClass}>{index + 1}</span>
                  <div className={s.logoCol}>
                    <StockLogo symbol={item.ticker} />
                  </div>
                  <div className={s.infoCol}>
                    <span className={s.name}>{item.ticker}</span>
                    <span className={s.volume}>
                      {t.vol}: {fmtVolume(item.volume)}
                    </span>
                    <div className={s.progressTrack}>
                      <div className={s.progressBar} style={{ width: `${relativePercent}%`, background: '#ef4444' }} />
                    </div>
                  </div>
                  <div className={s.sparkCol}>
                    <Sparkline data={item.spark || []} up={item.changePercent >= 0} height={20} fill />
                  </div>
                  <div className={s.priceCol}>
                    <span className={s.price}>${fmtPrice(item.price)}</span>
                    <span className={`${s.chg} ${item.changePercent >= 0 ? s.chgUp : s.chgDn}`}>
                      {chgText}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
