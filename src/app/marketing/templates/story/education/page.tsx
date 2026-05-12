'use client';

// ============================================================================
// Marketing Template: IG Story — Education Concept Explainer (1080×1920)
// /marketing/templates/story/education?topic=gex&lang=en
// EC2 Puppeteer captures at 1080×1920
// ============================================================================

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const TOPICS: Record<string, {
  question: string; title: string; subtitle: string; series: string;
  negLabel: string; posLabel: string;
  negCaption: string; negDesc: string; posCaption: string; posDesc: string;
  bullets: { color: string; label: string; text: string }[];
  why: string; whyHighlight: string;
}> = {
  gex: {
    question: 'What is', title: 'GEX?', subtitle: 'Gamma Exposure', series: 'Options Intelligence Series',
    negLabel: 'NEGATIVE', posLabel: 'POSITIVE',
    negCaption: 'Volatility Amplified', negDesc: 'Price swings expand.\nMoves beget moves.',
    posCaption: 'Volatility Dampened', posDesc: 'Price swings compress.\nMean reversion dominates.',
    bullets: [
      { color: '#34d399', label: 'Positive GEX', text: ' = Dealers sell rallies, buy dips → Market stabilizer' },
      { color: '#f87171', label: 'Negative GEX', text: ' = Dealers buy rallies, sell dips → Move amplifier' },
      { color: '#fbbf24', label: 'Gamma Flip', text: ' = The price where dealer behavior inverts' },
    ],
    why: 'When GEX flips negative, historical realized volatility increases by ', whyHighlight: '~40%',
  },
  dark_pool: {
    question: 'What is', title: 'Dark Pool?', subtitle: 'Institutional Trading Venue', series: 'Market Structure Series',
    negLabel: 'LOW', posLabel: 'HIGH',
    negCaption: 'Retail Driven', negDesc: 'Direction uncertain.\nLow conviction moves.',
    posCaption: 'Institutional', posDesc: 'Smart money positioning.\nDirectional bias forming.',
    bullets: [
      { color: '#22d3ee', label: 'Above 40%', text: ' = Institutions positioning before the next move' },
      { color: '#f87171', label: 'Below 30%', text: ' = Retail-driven, low institutional conviction' },
      { color: '#fbbf24', label: '48-Hour Signal', text: ' = Directional moves historically follow high DP' },
    ],
    why: 'When dark pool activity rises above 40%, directional moves follow within ', whyHighlight: '48 hours',
  },
  iv_percentile: {
    question: 'What is', title: 'IV%?', subtitle: 'Implied Volatility Percentile', series: 'Options Intelligence Series',
    negLabel: 'CHEAP', posLabel: 'EXPENSIVE',
    negCaption: 'Low Premiums', negDesc: 'Options historically cheap.\nBuying opportunity zone.',
    posCaption: 'High Premiums', posDesc: 'Options historically expensive.\nSelling opportunity zone.',
    bullets: [
      { color: '#34d399', label: '90th Percentile', text: ' = Options more expensive than 90% of past year' },
      { color: '#f87171', label: '10th Percentile', text: ' = Options cheaper than 90% of history' },
      { color: '#fbbf24', label: 'Context', text: ' = Without this, you cannot tell if premiums are high or low' },
    ],
    why: 'IV Percentile gives context that raw IV cannot. It tells you ', whyHighlight: 'where you stand in history',
  },
  pcr: {
    question: 'What is', title: 'PCR?', subtitle: 'Put/Call Ratio', series: 'Sentiment Analysis Series',
    negLabel: 'FEAR', posLabel: 'GREED',
    negCaption: 'Heavy Hedging', negDesc: 'Put volume elevated.\nFear dominates.',
    posCaption: 'Speculative', posDesc: 'Call volume elevated.\nOptimism may be stretched.',
    bullets: [
      { color: '#f87171', label: 'PCR > 1.0', text: ' = More puts purchased. Fear elevated.' },
      { color: '#34d399', label: 'PCR < 0.7', text: ' = More calls. Optimism may be excessive.' },
      { color: '#fbbf24', label: 'Extremes', text: ' = Historically coincide with market turning points' },
    ],
    why: 'Extreme PCR readings have coincided with major market reversals ', whyHighlight: '~78% of the time',
  },
  max_pain: {
    question: 'What is', title: 'Max Pain?', subtitle: 'Options Gravity Level', series: 'Options Intelligence Series',
    negLabel: 'PUT FLOOR', posLabel: 'CALL WALL',
    negCaption: 'Support Zone', negDesc: 'Highest put open interest.\nActs as a floor.',
    posCaption: 'Resistance Zone', posDesc: 'Highest call open interest.\nActs as a ceiling.',
    bullets: [
      { color: '#a78bfa', label: 'Max Pain', text: ' = Strike where option buyers lose the most at expiration' },
      { color: '#34d399', label: 'Call Wall', text: ' = Highest call OI. Price ceiling.' },
      { color: '#f87171', label: 'Put Floor', text: ' = Highest put OI. Price support.' },
    ],
    why: 'Price orbits around structure. It doesn\'t move randomly — it follows ', whyHighlight: 'options gravity',
  },
};

function EducationStoryCard() {
  const sp = useSearchParams();
  const topicId = sp.get('topic') || 'gex';
  const topic = TOPICS[topicId] || TOPICS.gex;

  return (
    <div style={{
      position: 'relative', width: '1080px', height: '1920px', overflow: 'hidden',
      color: '#f1f5f9',
      fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
      isolation: 'isolate',
    }}>
      {/* BG */}
      <div style={{ position: 'absolute', inset: 0, zIndex: -5,
        background: 'radial-gradient(circle at 50% 34%, rgba(34,211,238,0.15), transparent 38%), radial-gradient(circle at 50% 70%, rgba(16,185,129,0.05), transparent 36%), linear-gradient(180deg, #05080d 0%, #080c14 20%, #0d1117 50%, #080c14 78%, #05080d 100%)',
      }} />
      <div style={{ position: 'absolute', inset: 0, zIndex: -3, opacity: 0.03,
        backgroundImage: 'radial-gradient(circle, rgba(34,211,238,0.24) 1px, transparent 1.5px)', backgroundSize: '24px 24px',
      }} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 80, pointerEvents: 'none', opacity: 0.032, mixBlendMode: 'overlay' as any,
        background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.85) 0, rgba(255,255,255,0.85) 1px, transparent 1px, transparent 5px)',
      }} />

      {/* ═══ HEADER ═══ */}
      <div style={{ position: 'absolute', left: '34px', right: '34px', top: '32px', height: '130px', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/signum-sg-vectorized.svg" alt="SIGNUM HQ" width={104} height={104} style={{ display: 'block', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column' as any, gap: '12px' }}>
              <span style={{ color: '#f1f5f9', fontSize: '42px', fontWeight: 800, letterSpacing: '-0.02em', textShadow: '0 0 18px rgba(255,255,255,0.10)' }}>SIGNUM HQ</span>
              <span style={{ color: '#94a3b8', fontSize: '29px', fontWeight: 500, letterSpacing: '-0.02em' }}>{topic.series}</span>
            </div>
          </div>
          <div style={{
            height: '72px', marginTop: '18px', display: 'inline-flex', alignItems: 'center', gap: '15px',
            padding: '0 30px', borderRadius: '16px',
            border: '2px solid rgba(16,185,129,0.70)',
            background: 'radial-gradient(circle at 18% 45%, rgba(16,185,129,0.16), transparent 40%), rgba(8,12,20,0.78)',
            color: '#10b981', fontSize: '30px', fontWeight: 900, letterSpacing: '0.02em', textTransform: 'uppercase' as any,
            boxShadow: '0 0 25px rgba(16,185,129,0.14), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}>📚 LEARN</div>
        </div>
      </div>

      {/* ═══ TITLE ZONE ═══ */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '188px', height: '310px',
        display: 'flex', flexDirection: 'column' as any, alignItems: 'center', justifyContent: 'center', textAlign: 'center' as any, zIndex: 2,
      }}>
        <div style={{ color: '#cbd5e1', fontSize: '42px', fontWeight: 500, letterSpacing: '-0.04em' }}>{topic.question}</div>
        <div style={{ marginTop: '28px', fontSize: '160px', lineHeight: 0.82, fontWeight: 900, letterSpacing: '-0.075em', textShadow: '0 0 36px rgba(34,211,238,0.42), 0 10px 35px rgba(0,0,0,0.34)' }}>{topic.title}</div>
        <div style={{ marginTop: '42px', color: '#22d3ee', fontSize: '44px', fontWeight: 700, letterSpacing: '-0.04em', textShadow: '0 0 22px rgba(34,211,238,0.22)' }}>{topic.subtitle}</div>
      </div>

      {/* ═══ VISUAL PANEL ═══ */}
      <div style={{
        position: 'absolute', left: '40px', right: '40px', top: '542px', height: '635px',
        borderRadius: '18px', border: '1px solid rgba(34,211,238,0.24)',
        background: 'radial-gradient(circle at 52% 36%, rgba(34,211,238,0.09), transparent 36%), linear-gradient(135deg, rgba(34,211,238,0.035), rgba(255,255,255,0.015)), rgba(15,19,24,0.84)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 54px rgba(0,0,0,0.22)',
        overflow: 'hidden', zIndex: 2,
      }}>
        {/* Bar + labels */}
        <div style={{ position: 'absolute', left: '50px', right: '50px', top: '78px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '25px', fontSize: '30px', fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase' as any }}>
            <span style={{ color: '#f87171' }}>{topic.negLabel}</span>
            <span style={{ color: '#34d399' }}>{topic.posLabel}</span>
          </div>
          <div style={{ position: 'relative', height: '25px', borderRadius: '999px', background: 'linear-gradient(90deg, #ef4444 0%, #fb923c 30%, #fbbf24 50%, #84cc16 72%, #34d399 100%)', boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.14), 0 0 24px rgba(34,211,238,0.08)' }}>
            {/* Pivot line */}
            <div style={{ position: 'absolute', left: '50%', top: '-48px', height: '558px', borderLeft: '2px dashed rgba(34,211,238,0.70)', transform: 'translateX(-50%)', zIndex: 3 }} />
            {/* Pivot dot */}
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: '44px', height: '44px', borderRadius: '50%', background: '#0b111b', border: '7px solid #fbbf24', transform: 'translate(-50%, -50%)', boxShadow: '0 0 20px rgba(251,191,36,0.62), inset 0 0 0 5px #0b111b', zIndex: 5 }} />
          </div>
        </div>
        {/* Pivot label */}
        <div style={{ position: 'absolute', left: '50%', top: '142px', transform: 'translateX(-50%)', fontSize: '25px', fontWeight: 900, letterSpacing: '0.02em', zIndex: 5 }}>GAMMA FLIP</div>

        {/* Zone grid */}
        <div style={{ position: 'absolute', left: '48px', right: '48px', bottom: '48px', top: '185px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '56px' }}>
          {/* Negative zone */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' as any, justifyContent: 'flex-end', color: '#f87171' }}>
            <svg style={{ position: 'absolute', left: 0, right: 0, top: '20px', height: '250px' }} viewBox="0 0 400 250" fill="none">
              <defs><filter id="rG" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
              <circle cx="196" cy="128" r="18" fill="#f87171" filter="url(#rG)"/>
              <circle cx="196" cy="128" r="50" stroke="#f87171" strokeOpacity="0.55" strokeDasharray="3 7"/>
              <circle cx="196" cy="128" r="82" stroke="#f87171" strokeOpacity="0.32" strokeDasharray="3 8"/>
              <circle cx="196" cy="128" r="114" stroke="#f87171" strokeOpacity="0.18" strokeDasharray="3 9"/>
              <g stroke="#f87171" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" filter="url(#rG)">
                <path d="M196 128 C160 110 124 88 91 57"/><path d="M91 57l3 28M91 57l29 2"/>
                <path d="M196 128 C232 106 270 82 309 50"/><path d="M309 50l-5 30M309 50l-30 4"/>
                <path d="M196 128 C150 133 96 139 45 145"/><path d="M45 145l22 18M45 145l22-18"/>
                <path d="M196 128 C246 133 300 141 355 151"/><path d="M355 151l-25 16M355 151l-20-23"/>
                <path d="M196 128 C180 170 156 210 125 237"/><path d="M125 237l8-28M125 237l27-4"/>
                <path d="M196 128 C213 172 239 211 272 236"/><path d="M272 236l-28-4M272 236l-7-28"/>
                <path d="M196 128 C196 90 196 55 196 20"/><path d="M196 20l-17 24M196 20l17 24"/>
              </g>
            </svg>
            <div style={{ display: 'grid', gridTemplateColumns: '74px 1fr', gap: '22px', alignItems: 'center' }}>
              <div style={{ width: '66px', height: '66px', borderRadius: '50%', border: '2px solid currentColor', display: 'grid', placeItems: 'center', filter: 'drop-shadow(0 0 12px currentColor)' }}>
                <svg width="42" height="42" viewBox="0 0 42 42" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 22h8l4-13 8 25 5-12h11" /></svg>
              </div>
              <div>
                <div style={{ fontSize: '29px', fontWeight: 900, letterSpacing: '-0.03em' }}>{topic.negCaption}</div>
                <div style={{ marginTop: '11px', color: '#e2e8f0', fontSize: '23px', lineHeight: 1.26, fontWeight: 500, letterSpacing: '-0.03em', whiteSpace: 'pre-line' as any }}>{topic.negDesc}</div>
              </div>
            </div>
          </div>
          {/* Positive zone */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' as any, justifyContent: 'flex-end', color: '#34d399' }}>
            <svg style={{ position: 'absolute', left: 0, right: 0, top: '20px', height: '250px' }} viewBox="0 0 400 250" fill="none">
              <defs><filter id="gG" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
              <circle cx="204" cy="128" r="18" fill="#34d399" filter="url(#gG)"/>
              <circle cx="204" cy="128" r="50" stroke="#34d399" strokeOpacity="0.55" strokeDasharray="3 7"/>
              <circle cx="204" cy="128" r="82" stroke="#34d399" strokeOpacity="0.32" strokeDasharray="3 8"/>
              <g stroke="#34d399" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" filter="url(#gG)">
                <path d="M35 128 C90 128 131 128 165 128"/><path d="M165 128l-25-15M165 128l-25 15"/>
                <path d="M365 128 C310 128 269 128 235 128"/><path d="M235 128l25-15M235 128l25 15"/>
                <path d="M204 18 C204 65 204 90 204 105"/><path d="M204 105l-15-25M204 105l15-25"/>
                <path d="M204 238 C204 192 204 166 204 151"/><path d="M204 151l-15 25M204 151l15 25"/>
                <path d="M62 64 C112 89 145 104 171 116"/><path d="M171 116l-28-1M171 116l-15-24"/>
                <path d="M337 64 C288 90 260 105 234 116"/><path d="M234 116l28-2M234 116l15-24"/>
                <path d="M64 194 C112 168 145 152 171 140"/><path d="M171 140l-28 1M171 140l-15 24"/>
                <path d="M337 194 C290 169 260 153 234 140"/><path d="M234 140l28 1M234 140l15 24"/>
              </g>
            </svg>
            <div style={{ display: 'grid', gridTemplateColumns: '74px 1fr', gap: '22px', alignItems: 'center' }}>
              <div style={{ width: '66px', height: '66px', borderRadius: '50%', border: '2px solid currentColor', display: 'grid', placeItems: 'center', filter: 'drop-shadow(0 0 12px currentColor)' }}>
                <svg width="42" height="42" viewBox="0 0 42 42" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 23c7-9 14-9 21 0s13 9 16 1" /></svg>
              </div>
              <div>
                <div style={{ fontSize: '29px', fontWeight: 900, letterSpacing: '-0.03em' }}>{topic.posCaption}</div>
                <div style={{ marginTop: '11px', color: '#e2e8f0', fontSize: '23px', lineHeight: 1.26, fontWeight: 500, letterSpacing: '-0.03em', whiteSpace: 'pre-line' as any }}>{topic.posDesc}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ BULLETS ═══ */}
      <div style={{ position: 'absolute', left: '78px', right: '78px', top: '1213px', zIndex: 2 }}>
        {topic.bullets.map((b, i) => (
          <div key={i} style={{ minHeight: '84px', display: 'grid', gridTemplateColumns: '48px 1fr', gap: '28px', alignItems: 'start', padding: '18px 0 21px', borderBottom: i < topic.bullets.length - 1 ? '1px solid rgba(255,255,255,0.10)' : 'none' }}>
            <span style={{ width: '28px', height: '28px', borderRadius: '50%', marginTop: '4px', background: b.color, boxShadow: `0 0 18px ${b.color}` }} />
            <div style={{ fontSize: '28px', lineHeight: 1.34, fontWeight: 500, letterSpacing: '-0.038em' }}>
              <strong style={{ fontWeight: 900 }}>{b.label}</strong>{b.text}
            </div>
          </div>
        ))}
      </div>

      {/* ═══ WHY IT MATTERS ═══ */}
      <div style={{
        position: 'absolute', left: '56px', right: '56px', top: '1452px', height: '235px',
        borderRadius: '18px', border: '1px solid rgba(34,211,238,0.62)',
        background: 'radial-gradient(circle at 0% 45%, rgba(34,211,238,0.13), transparent 30%), linear-gradient(135deg, rgba(34,211,238,0.055), rgba(255,255,255,0.015)), rgba(15,19,24,0.84)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 54px rgba(0,0,0,0.22)',
        display: 'grid', gridTemplateColumns: '164px 1fr', alignItems: 'center', padding: '0 44px 0 34px',
        overflow: 'hidden', zIndex: 2,
      }}>
        <div style={{ width: '124px', height: '124px', borderRadius: '50%', border: '2px solid #22d3ee', color: '#22d3ee', display: 'grid', placeItems: 'center', boxShadow: '0 0 20px rgba(34,211,238,0.20)' }}>
          <svg width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M36 12c-14 0-23 11-23 23 0 9 5 16 12 21v6h22v-6c7-5 12-12 12-21 0-12-9-23-23-23Z" />
            <path d="M28 67h16M30 62h12" />
            <path d="M36 2v7M12 13l6 6M60 13l-6 6M3 36h8M61 36h8" />
          </svg>
        </div>
        <div>
          <div style={{ color: '#22d3ee', fontSize: '29px', fontWeight: 900, letterSpacing: '0.05em', textTransform: 'uppercase' as any, textShadow: '0 0 18px rgba(34,211,238,0.18)' }}>💡 WHY TRADERS WATCH THIS</div>
          <div style={{ marginTop: '22px', fontSize: '30px', lineHeight: 1.36, fontWeight: 500, letterSpacing: '-0.04em' }}>
            {topic.why}<span style={{ color: '#22d3ee', fontWeight: 900 }}>{topic.whyHighlight}</span>. Understanding this helps you anticipate, not react.
          </div>
        </div>
      </div>

      {/* ═══ FOOTER ═══ */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: '1735px', textAlign: 'center' as any, zIndex: 2 }}>
        <div style={{ color: '#fbbf24', fontSize: '30px', fontWeight: 800, letterSpacing: '-0.02em', textShadow: '0 0 15px rgba(251,191,36,0.16)' }}>📌 Save this for reference</div>
        <div style={{ width: '100px', height: '3px', margin: '29px auto 24px', borderRadius: '999px', background: 'linear-gradient(90deg, transparent, #22d3ee, transparent)' }} />
        <div style={{ color: '#06b6d4', fontSize: '38px', fontWeight: 900, letterSpacing: '-0.04em', textShadow: '0 0 18px rgba(6,182,212,0.22)' }}>signumhq.com</div>
        <div style={{ marginTop: '25px', color: '#cbd5e1', fontSize: '28px', fontWeight: 500, letterSpacing: '-0.03em' }}>Free institutional analytics · Not financial advice</div>
      </div>
    </div>
  );
}

export default function EducationStoryPage() {
  return (
    <Suspense fallback={<div style={{ width: '1080px', height: '1920px', background: '#080c14' }} />}>
      <EducationStoryCard />
    </Suspense>
  );
}
