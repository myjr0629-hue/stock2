'use client';

// ============================================================================
// Marketing Template: Compare Card
// /marketing/templates/compare?format=tweet&lang=en
// "Bloomberg $2K vs SIGNUM HQ $79" — 가격 비교 차별화 카드
// Puppeteer captures this page → Supabase Storage → Buffer
// ============================================================================

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const FORMATS: Record<string, { width: number; height: number }> = {
  tweet:    { width: 1200, height: 675 },
  og:       { width: 1200, height: 630 },
  story:    { width: 1080, height: 1920 },
  carousel: { width: 1080, height: 1080 },
  pin:      { width: 1000, height: 1500 },
  square:   { width: 1080, height: 1080 },
};

interface Competitor {
  name: string;
  price: string;
  features: string[];
  color: string;
  opacity: number;
}

const COMPETITORS: Competitor[] = [
  { name: 'Bloomberg Terminal', price: '$2,000/mo', features: ['Institutional Data', 'Real-time Feeds', 'Options Analytics'], color: '#f97316', opacity: 0.3 },
  { name: 'SpotGamma', price: '$249/mo', features: ['GEX Data', 'Key Levels', 'Daily Report'], color: '#8b5cf6', opacity: 0.4 },
  { name: 'Unusual Whales', price: '$75/mo', features: ['Options Flow', 'Dark Pool', 'Alerts'], color: '#3b82f6', opacity: 0.5 },
];

const SIGNUM = {
  name: 'SIGNUM HQ',
  price: '$79/mo',
  features: [
    'GEX + Options Structure',
    'Dark Pool 100% SSOT',
    'AI Guardian Briefing',
    'Real-time Alerts',
    'Multi-language (EN/KO/JA)',
    'Institutional Dashboard',
  ],
  color: '#22d3ee',
};

function CompareCard() {
  const searchParams = useSearchParams();
  const format = searchParams.get('format') || 'tweet';
  const lang   = searchParams.get('lang') || 'en';

  const { width, height } = FORMATS[format] || FORMATS.tweet;
  const isVertical = height > width;

  const title = lang === 'ko' ? '왜 SIGNUM HQ인가?' 
    : lang === 'ja' ? 'なぜSIGNUM HQか？' 
    : 'Why SIGNUM HQ?';

  const subtitle = lang === 'ko' ? '기관급 인텔리전스, 개인 투자자 가격'
    : lang === 'ja' ? '機関級インテリジェンス、個人投資家価格'
    : 'Institutional intelligence at retail price';

  const vsText = lang === 'ko' ? '비교' : lang === 'ja' ? '比較' : 'vs';

  return (
    <div style={{
      width: `${width}px`, height: `${height}px`,
      background: '#06090f',
      fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      overflow: 'hidden',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Background grid + glow */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.03,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
        <div style={{
          position: 'absolute', right: '-20%', top: '-30%',
          width: '60%', height: '80%',
          background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', left: '-10%', bottom: '-20%',
          width: '40%', height: '60%',
          background: 'radial-gradient(circle, rgba(124,58,237,0.04) 0%, transparent 70%)',
        }} />
      </div>

      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column',
        height: '100%',
        padding: isVertical ? '48px 36px' : '28px 40px',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(124,58,237,0.3)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192x192.png" alt="SIGNUM" width={30} height={30} style={{ borderRadius: '6px' }} />
            </div>
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '3px' }}>
              SIGNUM HQ
            </span>
          </div>
          <div style={{
            padding: '6px 16px', borderRadius: '8px',
            background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.2)',
          }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#fbbf24', letterSpacing: '2px' }}>
              COMPARE
            </span>
          </div>
        </div>

        {/* ── Title ── */}
        <div style={{
          marginTop: isVertical ? '32px' : '16px',
          textAlign: 'center',
        }}>
          <h1 style={{
            fontSize: isVertical ? '36px' : '32px',
            fontWeight: 900, color: '#f1f5f9',
            lineHeight: 1.1, margin: 0,
          }}>{title}</h1>
          <p style={{
            fontSize: '15px', color: '#64748b', fontWeight: 500,
            marginTop: '6px',
          }}>{subtitle}</p>
        </div>

        {/* ── Comparison Grid ── */}
        <div style={{
          display: 'flex',
          flexDirection: isVertical ? 'column' : 'row',
          gap: '10px',
          marginTop: isVertical ? '28px' : '18px',
          flex: 1,
        }}>
          {/* Competitors */}
          {COMPETITORS.map((comp) => (
            <div key={comp.name} style={{
              flex: 1,
              padding: isVertical ? '16px 20px' : '14px 16px',
              borderRadius: '14px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', flexDirection: 'column',
              opacity: comp.opacity + 0.4,
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '1px' }}>
                {comp.name}
              </div>
              <div style={{
                fontSize: isVertical ? '22px' : '18px', fontWeight: 900,
                color: comp.color, marginTop: '4px',
                textDecoration: 'line-through',
                textDecorationColor: `${comp.color}60`,
              }}>
                {comp.price}
              </div>
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {comp.features.map((f, i) => (
                  <span key={i} style={{ fontSize: '10px', color: '#475569' }}>
                    ✓ {f}
                  </span>
                ))}
              </div>
            </div>
          ))}

          {/* SIGNUM HQ — highlighted */}
          <div style={{
            flex: isVertical ? 1.5 : 1.2,
            padding: isVertical ? '20px 24px' : '14px 18px',
            borderRadius: '14px',
            background: 'rgba(34,211,238,0.05)',
            border: '2px solid rgba(34,211,238,0.3)',
            boxShadow: '0 0 30px rgba(34,211,238,0.08)',
            display: 'flex', flexDirection: 'column',
            position: 'relative',
          }}>
            {/* "BEST VALUE" badge */}
            <div style={{
              position: 'absolute', top: '-10px', right: '16px',
              padding: '3px 12px', borderRadius: '6px',
              background: 'linear-gradient(135deg, #22d3ee, #06b6d4)',
              fontSize: '9px', fontWeight: 800, color: '#06090f',
              letterSpacing: '2px',
            }}>
              BEST VALUE
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: SIGNUM.color, letterSpacing: '1px' }}>
              {SIGNUM.name}
            </div>
            <div style={{
              fontSize: isVertical ? '28px' : '22px', fontWeight: 900,
              color: '#f1f5f9', marginTop: '4px',
            }}>
              {SIGNUM.price}
            </div>
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {SIGNUM.features.map((f, i) => (
                <span key={i} style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>
                  ✅ {f}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: isVertical ? '16px' : '12px',
          paddingTop: '12px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#22d3ee', letterSpacing: '1px' }}>
              See What Others Cannot
            </span>
          </div>
          <span style={{ fontSize: '12px', color: '#475569', letterSpacing: '2px' }}>SIGNAL. ANALYZE. EXECUTE.</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>signumhq.com</span>
        </div>
      </div>
    </div>
  );
}

export default function CompareTemplatePage() {
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
          <CompareCard />
        </Suspense>
      </body>
    </html>
  );
}
