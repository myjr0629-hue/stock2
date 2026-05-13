'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// ============================================================================
// Education Pin — Pinterest 1000×1500 vertical infographic
// Market Insight 스타일 — 실제 로고 사용
// /templates/og/education-pin?topic=gex
// ============================================================================

const TOPICS: Record<string, {
  title: string; subtitle: string;
  positiveLabel: string; negativeLabel: string;
  positiveCopy: string; negativeCopy: string;
  positiveIcon: string; negativeIcon: string;
  whyLine: string;
  cards: [string, string, string];
  accentColor: string;
}> = {
  gex: {
    title: 'What is GEX?',
    subtitle: 'Gamma Exposure Explained',
    positiveLabel: 'GEX POSITIVE',
    negativeLabel: 'GEX NEGATIVE',
    positiveCopy: 'Dealers buy dips, sell rips\n→ Market stabilizes',
    negativeCopy: 'Dealers sell into drops,\nbuy rallies → Volatility explodes',
    positiveIcon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    negativeIcon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    whyLine: 'Most traders watch price.\nInstitutional desks watch GEX.',
    cards: [
      'GEX Positive + VIX Low = Low risk, mean-reversion likely',
      'GEX Neutral + VIX Rising = Watch for breakout',
      'GEX Negative + VIX High = Trend acceleration, elevated risk',
    ],
    accentColor: '#22d3ee',
  },
  dark_pool: {
    title: 'Dark Pools',
    subtitle: 'Institutional Hidden Orders',
    positiveLabel: 'HIGH DP%',
    negativeLabel: 'LOW DP%',
    positiveCopy: 'Institutions positioning\n→ Directional moves follow',
    negativeCopy: 'Retail-driven market\n→ Direction uncertain',
    positiveIcon: 'M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4z',
    negativeIcon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    whyLine: 'Retail sees price.\nInstitutions use dark pools to hide size.',
    cards: [
      'DP% > 40% + Rising = Heavy institutional accumulation',
      'DP% 25-40% = Normal institutional flow',
      'DP% < 25% + Falling = Institutions stepping back',
    ],
    accentColor: '#a855f7',
  },
  smart_flow: {
    title: 'Smart Flow',
    subtitle: 'Institutional Direction Index',
    positiveLabel: 'ACCUMULATION',
    negativeLabel: 'DISTRIBUTION',
    positiveCopy: 'Institutions building\npositions → Bullish bias',
    negativeCopy: 'Institutions reducing\npositions → Bearish bias',
    positiveIcon: 'M23 6l-9.5 9.5-5-5L1 18',
    negativeIcon: 'M23 18l-9.5-9.5-5 5L1 6',
    whyLine: 'Price follows volume.\nVolume follows institutions.',
    cards: [
      'Smart Flow > 65 = Accumulation pattern observed',
      'Smart Flow 35-65 = No directional conviction',
      'Smart Flow < 35 = Distribution pattern detected',
    ],
    accentColor: '#34d399',
  },
};

function EducationPinContent() {
  const sp = useSearchParams();
  const topic = sp.get('topic') || 'gex';
  const t = TOPICS[topic] || TOPICS.gex;

  return (
    <div style={{
      width: 1000, height: 1500, position: 'relative', overflow: 'hidden',
      color: '#f1f5f9', fontFamily: "'Inter', system-ui, sans-serif",
      background: `
        radial-gradient(circle at 90% 20%, rgba(34,211,238,0.18), transparent 30%),
        radial-gradient(circle at 10% 85%, rgba(124,58,237,0.22), transparent 28%),
        radial-gradient(circle at 50% 50%, rgba(34,211,238,0.06), transparent 40%),
        linear-gradient(180deg, #02050d 0%, #040710 50%, #050817 100%)
      `,
      isolation: 'isolate',
    }}>
      {/* Grid overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, opacity: 0.04,
        backgroundImage: 'linear-gradient(rgba(34,211,238,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.4) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
      }} />
      {/* Scanline */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'none', opacity: 0.035,
        background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.9) 0, rgba(255,255,255,0.9) 1px, transparent 1px, transparent 5px)',
        mixBlendMode: 'overlay',
      }} />
      {/* Top accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #a855f7, #22d3ee)', zIndex: 60 }} />
      {/* Bottom accent bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #22d3ee, #a855f7)', zIndex: 60 }} />

      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', height: '100%', padding: '42px 58px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192x192.png" alt="" width={56} height={56} style={{
              filter: 'drop-shadow(0 0 16px rgba(34,211,238,0.28))',
            }} />
            <div style={{ width: 1, height: 42, background: 'linear-gradient(to bottom, transparent, rgba(34,211,238,0.7), transparent)' }} />
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '0.10em', lineHeight: 1 }}>
                SIGNUM <span style={{ color: '#22d3ee' }}>HQ</span>
              </div>
              <div style={{ marginTop: 6, color: '#94a3b8', fontSize: 13, fontWeight: 500, letterSpacing: '0.02em' }}>
                See What Others Cannot
              </div>
            </div>
          </div>
          <div style={{
            padding: '8px 20px', borderRadius: 20,
            background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)',
            color: '#67e8f9', fontSize: 13, fontWeight: 800, letterSpacing: '0.4em',
          }}>
            MARKET INSIGHT
          </div>
        </div>

        {/* ── Title ── */}
        <div style={{ marginTop: 38, textAlign: 'center' }}>
          <h1 style={{
            margin: 0, fontSize: 78, fontWeight: 900, lineHeight: 0.96, letterSpacing: '-0.06em',
            color: '#f1f5f9', textShadow: '0 6px 28px rgba(0,0,0,0.35)',
          }}>{t.title}</h1>
          <div style={{
            marginTop: 18, color: '#22d3ee', fontSize: 36, fontWeight: 500,
            letterSpacing: '-0.03em', textShadow: '0 0 16px rgba(34,211,238,0.2)',
          }}>{t.subtitle}</div>
          <div style={{
            width: 600, height: 2, margin: '28px auto 0',
            background: 'linear-gradient(90deg, transparent, #a78bfa, #22d3ee, transparent)',
            boxShadow: '0 0 18px rgba(34,211,238,0.2)',
          }} />
        </div>

        {/* ── Section 1: The Concept ── */}
        <div style={{ marginTop: 34 }}>
          <div style={{
            textAlign: 'center', color: '#22d3ee', fontSize: 20, fontWeight: 900,
            letterSpacing: '0.35em', textTransform: 'uppercase',
          }}>01 · THE CONCEPT</div>
          <div style={{ display: 'flex', gap: 22, marginTop: 22 }}>
            {/* Positive */}
            <div style={{
              flex: 1, padding: '28px 26px', borderRadius: 16,
              background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.18)',
              borderLeft: '4px solid #34d399', textAlign: 'center',
            }}>
              <div style={{
                width: 62, height: 62, margin: '0 auto 16px', borderRadius: '50%',
                background: 'rgba(52,211,153,0.08)', border: '1.5px solid rgba(52,211,153,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={t.positiveIcon} /></svg>
              </div>
              <div style={{ color: '#34d399', fontSize: 24, fontWeight: 900, letterSpacing: '0.02em' }}>
                {t.positiveLabel}
              </div>
              <div style={{ marginTop: 14, color: '#cbd5e1', fontSize: 19, lineHeight: 1.45, whiteSpace: 'pre-line', fontWeight: 500 }}>
                {t.positiveCopy}
              </div>
            </div>
            {/* Negative */}
            <div style={{
              flex: 1, padding: '28px 26px', borderRadius: 16,
              background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.18)',
              borderLeft: '4px solid #f87171', textAlign: 'center',
            }}>
              <div style={{
                width: 62, height: 62, margin: '0 auto 16px', borderRadius: '50%',
                background: 'rgba(248,113,113,0.08)', border: '1.5px solid rgba(248,113,113,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={t.negativeIcon} /></svg>
              </div>
              <div style={{ color: '#f87171', fontSize: 24, fontWeight: 900, letterSpacing: '0.02em' }}>
                {t.negativeLabel}
              </div>
              <div style={{ marginTop: 14, color: '#cbd5e1', fontSize: 19, lineHeight: 1.45, whiteSpace: 'pre-line', fontWeight: 500 }}>
                {t.negativeCopy}
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 2: Why It Matters ── */}
        <div style={{ marginTop: 30 }}>
          <div style={{
            textAlign: 'center', color: '#22d3ee', fontSize: 20, fontWeight: 900,
            letterSpacing: '0.35em', textTransform: 'uppercase',
          }}>02 · WHY IT MATTERS</div>
          {/* Spectrum bar */}
          <div style={{ position: 'relative', margin: '22px auto 0', width: 780, height: 80 }}>
            <span style={{ position: 'absolute', left: 0, top: 0, color: '#a855f7', fontSize: 18, fontWeight: 800, letterSpacing: '0.08em' }}>NEGATIVE</span>
            <span style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', color: '#94a3b8', fontSize: 18, fontWeight: 800, letterSpacing: '0.08em' }}>NEUTRAL</span>
            <span style={{ position: 'absolute', right: 0, top: 0, color: '#34d399', fontSize: 18, fontWeight: 800, letterSpacing: '0.08em' }}>POSITIVE</span>
            <div style={{
              position: 'absolute', left: 80, right: 80, top: 38, height: 14, borderRadius: 999,
              background: 'linear-gradient(90deg, #a855f7 0%, #64748b 50%, #34d399 100%)',
              boxShadow: '0 0 20px rgba(34,211,238,0.1)',
            }} />
            <div style={{
              position: 'absolute', right: 60, top: 30, width: 30, height: 30, borderRadius: '50%',
              border: '3px solid #d9ffe7', background: 'rgba(52,211,153,0.15)',
              boxShadow: '0 0 20px rgba(52,211,153,0.6)',
            }} />
          </div>
          <div style={{
            marginTop: 14, textAlign: 'center', color: '#f1f5f9', fontSize: 22,
            lineHeight: 1.4, fontStyle: 'italic', fontWeight: 500, whiteSpace: 'pre-line',
          }}>{t.whyLine}</div>
        </div>

        {/* ── Section 3: How To Read It ── */}
        <div style={{ marginTop: 28 }}>
          <div style={{
            textAlign: 'center', color: '#22d3ee', fontSize: 20, fontWeight: 900,
            letterSpacing: '0.35em', textTransform: 'uppercase',
          }}>03 · HOW TO READ IT</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
            {t.cards.map((card, i) => {
              const colors = ['#34d399', '#fbbf24', '#f87171'];
              const color = colors[i];
              const [boldPart, ...rest] = card.split(' = ');
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '16px 22px', borderRadius: 12,
                  background: `${color}08`, border: `1px solid ${color}22`,
                  borderLeft: `4px solid ${color}`,
                }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                    border: `1.5px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: color, filter: `drop-shadow(0 0 8px ${color})`,
                  }}>
                    {i === 0 && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>}
                    {i === 1 && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>}
                    {i === 2 && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>}
                  </div>
                  <div style={{ color: '#f1f5f9', fontSize: 20, fontWeight: 600, lineHeight: 1.3 }}>
                    <strong style={{ color: color, fontWeight: 900 }}>{boldPart}</strong> = {rest.join(' = ')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ marginTop: 'auto', paddingTop: 24 }}>
          <div style={{ textAlign: 'center', color: '#cbd5e1', fontSize: 24, fontWeight: 500, marginBottom: 18 }}>
            Save this for your trading toolkit
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
            padding: '18px 30px', borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(34,211,238,0.1))',
            border: '1px solid rgba(124,58,237,0.2)',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192x192.png" alt="" width={42} height={42} style={{
              filter: 'drop-shadow(0 0 12px rgba(34,211,238,0.2))',
            }} />
            <div style={{ width: 1, height: 32, background: 'linear-gradient(to bottom, transparent, rgba(34,211,238,0.5), transparent)' }} />
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.12em' }}>SIGNUM HQ</span>
            <span style={{ color: '#475569', fontSize: 18 }}>·</span>
            <span style={{ color: '#22d3ee', fontSize: 22, fontWeight: 600 }}>signumhq.com</span>
          </div>
          <div style={{ marginTop: 14, textAlign: 'center', color: '#64748b', fontSize: 16, fontWeight: 500 }}>
            Observation only — not financial advice
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EducationPinTemplate() {
  return (
    <Suspense fallback={<div style={{ width: 1000, height: 1500, background: '#040710' }} />}>
      <EducationPinContent />
    </Suspense>
  );
}
