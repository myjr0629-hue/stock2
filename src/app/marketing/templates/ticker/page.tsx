'use client';

// ============================================================================
// Marketing Template: Ticker Spotlight — V2 Hybrid
// GPT 2열 레이아웃 + Gemini 밝기/그라디언트 + Claude 기술 구조
// /marketing/templates/ticker?t=NVDA&price=1247.50&change=3.2&gex=positive&dp=42&maxpain=1200&iv=67&format=tweet
// ============================================================================

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const FORMATS: Record<string, { width: number; height: number }> = {
  tweet:    { width: 1200, height: 675 },
  og:       { width: 1200, height: 630 },
  story:    { width: 1080, height: 1920 },
  square:   { width: 1080, height: 1080 },
};

function TickerCard() {
  const searchParams = useSearchParams();
  const ticker   = searchParams.get('t') || 'NVDA';
  const company  = searchParams.get('name') || '';
  const exchange = searchParams.get('ex') || 'NASDAQ | EQUITY';
  const price    = parseFloat(searchParams.get('price') || '1247.50');
  const change   = parseFloat(searchParams.get('change') || '3.2');
  const changeDol = searchParams.get('cd') || '';
  const gex      = (searchParams.get('gex') || 'positive').toLowerCase();
  const dp       = parseFloat(searchParams.get('dp') || '42');
  const maxpain  = parseFloat(searchParams.get('maxpain') || '1200');
  const iv       = parseFloat(searchParams.get('iv') || '67');
  const mktcap   = searchParams.get('cap') || '$3.08T';
  const pe       = searchParams.get('pe') || '66.71';
  const eps      = searchParams.get('eps') || '18.69';
  const beta     = searchParams.get('beta') || '1.68';
  const format   = searchParams.get('format') || 'tweet';
  const session  = searchParams.get('session') || 'OPEN';

  const { width, height } = FORMATS[format] || FORMATS.tweet;
  const isVertical = height > width;
  const isSquare = format === 'square';

  const isPositive = change >= 0;
  const changeColor = isPositive ? '#34d399' : '#f87171';
  const isGexPositive = gex === 'positive';
  const gexColor = isGexPositive ? '#34d399' : gex === 'negative' ? '#f87171' : '#fbbf24';
  const gexLabel = gex.toUpperCase();
  const dpColor = dp >= 50 ? '#fbbf24' : '#7c3aed';
  const ivColor = iv >= 70 ? '#f97316' : iv >= 40 ? '#fbbf24' : '#34d399';

  // Generate sparkline data
  const seed = ticker.charCodeAt(0) + ticker.charCodeAt(ticker.length - 1);
  const sparkData = Array.from({ length: 40 }, (_, i) => {
    const base = price * (1 - change / 100);
    const progress = i / 39;
    const trend = base + (price - base) * progress;
    const noise = Math.sin(seed + i * 0.7) * price * 0.008 + Math.cos(seed * 2 + i * 1.1) * price * 0.005;
    return trend + noise;
  });
  const sparkMin = Math.min(...sparkData) * 0.999;
  const sparkMax = Math.max(...sparkData) * 1.001;
  const sparkRange = sparkMax - sparkMin || 1;

  const chartW = isVertical ? width - 80 : (isSquare ? width - 80 : 520);
  const chartH = isVertical ? 280 : (isSquare ? 260 : 200);

  const sparkPoints = sparkData.map((v, i) => {
    const x = (i / (sparkData.length - 1)) * chartW;
    const y = chartH - 24 - ((v - sparkMin) / sparkRange) * (chartH - 48);
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `0,${chartH} ${sparkPoints} ${chartW},${chartH}`;

  const priceLabels = Array.from({ length: 5 }, (_, i) => {
    const val = sparkMax - (sparkRange * i) / 4;
    return val >= 100 ? Math.round(val).toLocaleString() : val.toFixed(2);
  });

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'America/New_York' }) + ' ET';

  // Badge data
  const badges = [
    { label: 'Dark Pool', value: `${dp.toFixed(1)}%`, sub: '% OF TOTAL VOLUME', color: dpColor, icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
    { label: 'GEX Regime', value: gexLabel, sub: 'NET GAMMA EXPOSURE', color: gexColor, icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
    { label: 'Max Pain', value: `$${maxpain.toLocaleString()}`, sub: 'OPTIONS EXPIRY', color: '#fbbf24', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
    { label: 'IV Rank', value: `${iv}th`, sub: '52W IV RANK', color: ivColor, icon: 'M18 20V10M12 20V4M6 20v-6' },
  ];

  // ── VERTICAL (Story) ──
  if (isVertical) {
    return (
      <div style={{ width: `${width}px`, height: `${height}px`, background: '#080c14', fontFamily: "'Inter', system-ui, sans-serif", overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <BgEffects />
        <BorderGlow />
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', height: '100%', padding: '48px 40px' }}>
          <Header />
          <div style={{ marginTop: '32px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', letterSpacing: '0.2em', fontWeight: 600 }}>{exchange}</div>
            <div style={{ fontSize: '96px', fontWeight: 900, color: '#f1f5f9', letterSpacing: '-0.04em', lineHeight: 1 }}>{ticker}</div>
            {company && <div style={{ fontSize: '14px', color: '#64748b', marginTop: '4px', letterSpacing: '0.1em' }}>{company}</div>}
          </div>
          <div style={{ marginTop: '16px' }}>
            <span style={{ fontSize: '48px', fontWeight: 800, color: '#f1f5f9' }}>${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: changeColor }}>▲ {isPositive ? '+' : ''}{change.toFixed(1)}%</span>
              {changeDol && <span style={{ fontSize: '14px', color: '#64748b' }}>{changeDol} TODAY</span>}
            </div>
          </div>
          {/* Chart */}
          <div style={{ marginTop: '32px', padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px' }}>
            <ChartTimeTabs />
            <svg width={chartW} height={chartH} style={{ display: 'block', marginTop: '8px' }}>
              <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={changeColor} stopOpacity="0.3" /><stop offset="100%" stopColor={changeColor} stopOpacity="0" /></linearGradient></defs>
              <polygon points={areaPoints} fill="url(#area)" />
              <polyline points={sparkPoints} fill="none" stroke={changeColor} strokeWidth="2" strokeLinejoin="round" />
              {priceLabels.map((l, i) => <text key={i} x={chartW - 4} y={24 + i * ((chartH - 48) / 4)} fill="#475569" fontSize="10" textAnchor="end" fontFamily="Inter">{l}</text>)}
            </svg>
            <FundRow mktcap={mktcap} pe={pe} eps={eps} beta={beta} />
          </div>
          {/* Badges */}
          <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
            {badges.map((b, i) => <Badge key={i} {...b} horizontal />)}
          </div>
          <Footer session={session} timeStr={timeStr} />
        </div>
      </div>
    );
  }

  // ── SQUARE ──
  if (isSquare) {
    return (
      <div style={{ width: `${width}px`, height: `${height}px`, background: '#080c14', fontFamily: "'Inter', system-ui, sans-serif", overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <BgEffects />
        <BorderGlow />
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', height: '100%', padding: '32px 36px' }}>
          <Header />
          {/* Top: Ticker + Price */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '16px' }}>
            <div>
              <div style={{ fontSize: '72px', fontWeight: 900, color: '#f1f5f9', letterSpacing: '-0.04em', lineHeight: 1 }}>{ticker}</div>
              <div style={{ fontSize: '11px', color: '#64748b', letterSpacing: '0.15em', marginTop: '2px' }}>{exchange}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '36px', fontWeight: 800, color: '#f1f5f9' }}>${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              <span style={{ fontSize: '18px', fontWeight: 700, color: changeColor }}>▲ {isPositive ? '+' : ''}{change.toFixed(1)}%</span>
            </div>
          </div>
          {/* Chart */}
          <div style={{ marginTop: '16px', padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px' }}>
            <ChartTimeTabs />
            <svg width={chartW} height={chartH} style={{ display: 'block', marginTop: '6px' }}>
              <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={changeColor} stopOpacity="0.3" /><stop offset="100%" stopColor={changeColor} stopOpacity="0" /></linearGradient></defs>
              <polygon points={areaPoints} fill="url(#area)" />
              <polyline points={sparkPoints} fill="none" stroke={changeColor} strokeWidth="2" strokeLinejoin="round" />
              {priceLabels.map((l, i) => <text key={i} x={chartW - 4} y={24 + i * ((chartH - 48) / 4)} fill="#475569" fontSize="10" textAnchor="end" fontFamily="Inter">{l}</text>)}
            </svg>
            <FundRow mktcap={mktcap} pe={pe} eps={eps} beta={beta} />
          </div>
          {/* 2x2 Badges */}
          <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', flex: 1 }}>
            {badges.map((b, i) => <Badge key={i} {...b} />)}
          </div>
          <Footer session={session} timeStr={timeStr} />
        </div>
      </div>
    );
  }

  // ── TWEET / OG (Horizontal) ──
  return (
    <div style={{ width: `${width}px`, height: `${height}px`, background: '#080c14', fontFamily: "'Inter', system-ui, sans-serif", overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <BgEffects />
      <BorderGlow />
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', height: '100%', padding: '22px 36px' }}>
        <Header />
        {/* Main: 2-column */}
        <div style={{ flex: 1, display: 'flex', gap: '24px', marginTop: '10px', minHeight: 0 }}>
          {/* LEFT: Ticker Info */}
          <div style={{ flex: '0 0 44%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#34d399', padding: '3px 10px', borderRadius: '4px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', letterSpacing: '0.15em' }}>● TICKER SPOTLIGHT</span>
            </div>
            <div style={{ fontSize: '80px', fontWeight: 900, color: '#f1f5f9', letterSpacing: '-0.04em', lineHeight: 0.95, marginTop: '4px' }}>{ticker}</div>
            <div style={{ fontSize: '11px', color: '#64748b', letterSpacing: '0.15em', marginTop: '2px' }}>{company || exchange}</div>
            <div style={{ marginTop: '8px' }}>
              <span style={{ fontSize: '40px', fontWeight: 800, color: '#f1f5f9' }}>${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '18px', fontWeight: 700, color: changeColor }}>{isPositive ? '▲' : '▼'} {isPositive ? '+' : ''}{change.toFixed(1)}%</span>
              <span style={{ fontSize: '12px', color: '#64748b' }}>{changeDol ? `${changeDol} TODAY` : 'TODAY'}</span>
            </div>
            {/* 2x2 mini badges */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '14px' }}>
              {badges.map((b, i) => (
                <div key={i} style={{ padding: '8px 10px', borderRadius: '8px', background: `${b.color}08`, borderLeft: `3px solid ${b.color}`, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '9px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.12em' }}>{b.label}</span>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: b.label === 'GEX Regime' ? b.color : '#f1f5f9', marginTop: '1px' }}>{b.value}</span>
                </div>
              ))}
            </div>
          </div>
          {/* RIGHT: Chart */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 16px', background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}>
            <ChartTimeTabs />
            <svg width={chartW} height={chartH} style={{ display: 'block', marginTop: '6px', flex: 1 }}>
              <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={changeColor} stopOpacity="0.25" /><stop offset="100%" stopColor={changeColor} stopOpacity="0" /></linearGradient></defs>
              <polygon points={areaPoints} fill="url(#area)" />
              <polyline points={sparkPoints} fill="none" stroke={changeColor} strokeWidth="2.5" strokeLinejoin="round" />
              <circle cx={sparkData.length > 0 ? (39 / 39) * chartW : 0} cy={chartH - 24 - ((sparkData[sparkData.length - 1] - sparkMin) / sparkRange) * (chartH - 48)} r="4" fill={changeColor} />
              {priceLabels.map((l, i) => <text key={i} x={chartW - 4} y={24 + i * ((chartH - 48) / 4)} fill="#475569" fontSize="10" textAnchor="end" fontFamily="Inter">{l}</text>)}
            </svg>
            <FundRow mktcap={mktcap} pe={pe} eps={eps} beta={beta} />
          </div>
        </div>
        <Footer session={session} timeStr={timeStr} />
      </div>
    </div>
  );
}

// ── Sub-components ──

function BgEffects() {
  return (
    <>
      <div style={{ position: 'absolute', top: '-150px', right: '-150px', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-150px', left: '-150px', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.025, backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.15) 0px, rgba(255,255,255,0.15) 1px, transparent 1px, transparent 4px)' }} />
    </>
  );
}

function BorderGlow() {
  return (
    <div style={{
      position: 'absolute', inset: '6px', borderRadius: '14px', pointerEvents: 'none', zIndex: 1,
      border: '1px solid rgba(6,182,212,0.15)',
      boxShadow: '0 0 30px rgba(124,58,237,0.08), 0 0 60px rgba(6,182,212,0.05), inset 0 0 30px rgba(124,58,237,0.03)',
    }} />
  );
}

function Header() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px',
          background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 16px rgba(124,58,237,0.3)',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192x192.png" alt="" width={26} height={26} style={{ borderRadius: '6px' }} />
        </div>
        <span style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '2px' }}>SIGNUM HQ</span>
      </div>
    </div>
  );
}

function ChartTimeTabs() {
  const tabs = ['5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y'];
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {tabs.map((tab, i) => (
        <span key={tab} style={{
          fontSize: '9px', fontWeight: i === 0 ? 700 : 500, letterSpacing: '0.05em',
          color: i === 0 ? '#06b6d4' : '#475569',
          padding: '3px 8px', borderRadius: '4px',
          background: i === 0 ? 'rgba(6,182,212,0.12)' : 'transparent',
          border: i === 0 ? '1px solid rgba(6,182,212,0.25)' : '1px solid transparent',
        }}>{tab}</span>
      ))}
    </div>
  );
}

function FundRow({ mktcap, pe, eps, beta }: { mktcap: string; pe: string; eps: string; beta: string }) {
  const items = [
    { label: 'MKT CAP', value: mktcap },
    { label: 'P/E (TTM)', value: pe },
    { label: 'EPS (TTM)', value: eps },
    { label: 'BETA (5Y)', value: beta },
  ];
  return (
    <div style={{ display: 'flex', gap: '16px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      {items.map(it => (
        <div key={it.label} style={{ flex: 1 }}>
          <div style={{ fontSize: '8px', fontWeight: 600, color: '#475569', letterSpacing: '0.12em' }}>{it.label}</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

function Badge({ label, value, sub, color, icon, horizontal }: { label: string; value: string; sub: string; color: string; icon: string; horizontal?: boolean }) {
  return (
    <div style={{
      padding: horizontal ? '12px 16px' : '12px 14px', borderRadius: '10px',
      background: `${color}06`, borderLeft: `3px solid ${color}`,
      display: 'flex', alignItems: 'center', gap: '12px',
    }}>
      <div style={{
        width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
        background: `${color}10`, border: `1px solid ${color}25`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={icon} />
        </svg>
      </div>
      <div>
        <div style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.1em' }}>{label}</div>
        <span style={{ fontSize: horizontal ? '22px' : '18px', fontWeight: 800, color: label === 'GEX Regime' ? color : '#f1f5f9' }}>{value}</span>
        <div style={{ fontSize: '8px', fontWeight: 600, color: '#475569', letterSpacing: '0.1em', marginTop: '1px' }}>{sub}</div>
      </div>
    </div>
  );
}

function Footer({ session, timeStr }: { session: string; timeStr: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', color: '#64748b', letterSpacing: '0.1em' }}>MARKET STATUS</span>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px rgba(52,211,153,0.5)' }} />
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#34d399' }}>{session}</span>
        </div>
        <span style={{ fontSize: '10px', color: '#475569' }}>LAST UPDATE {timeStr}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#06b6d4' }}>signumhq.com</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z" /></svg>
      </div>
    </div>
  );
}

export default function TickerTemplatePage() {
  return (
    <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { margin: 0; padding: 0; background: #000; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        `}</style>
      </head>
      <body>
        <Suspense fallback={<div style={{color:'#fff'}}>Loading...</div>}>
          <TickerCard />
        </Suspense>
      </body>
    </html>
  );
}
