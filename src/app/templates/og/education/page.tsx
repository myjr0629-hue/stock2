'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function EducationContent() {
  const sp = useSearchParams();
  const topicId = sp.get('topic') || 'gex';
  const topic = TOPICS[topicId] || TOPICS.gex;

  return (
    <div style={{
      width: 1200, height: 630, position: 'relative', overflow: 'hidden',
      color: '#f1f5f9', fontFamily: "'Inter', system-ui, sans-serif",
      background: `
        radial-gradient(circle at 77% 45%, rgba(34,211,238,0.17), transparent 28%),
        radial-gradient(circle at 57% 62%, rgba(124,58,237,0.16), transparent 32%),
        radial-gradient(circle at 5% 95%, rgba(34,211,238,0.12), transparent 24%),
        linear-gradient(135deg, #06090f 0%, #070c15 52%, #04070d 100%)
      `,
      isolation: 'isolate',
    }}>
      {/* Grid */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, opacity: 0.06,
        backgroundImage: 'linear-gradient(rgba(34,211,238,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.4) 1px, transparent 1px)',
        backgroundSize: '36px 36px',
        maskImage: 'radial-gradient(circle at 82% 14%, black 0%, transparent 26%)',
        WebkitMaskImage: 'radial-gradient(circle at 82% 14%, black 0%, transparent 26%)',
      }} />
      {/* Scanline */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'none', opacity: 0.045,
        background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.9) 0, rgba(255,255,255,0.9) 1px, transparent 1px, transparent 5px)',
        mixBlendMode: 'overlay',
      }} />
      {/* Decorative orbit */}
      <div style={{
        position: 'absolute', left: -68, bottom: -62, width: 220, height: 220,
        border: '1px solid rgba(148,163,184,0.18)', borderRadius: '50%', zIndex: 0,
      }}>
        <div style={{ position: 'absolute', inset: 34, border: '1px solid rgba(148,163,184,0.14)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', inset: 72, border: '1px solid rgba(148,163,184,0.12)', borderRadius: '50%' }} />
      </div>

      {/* ── Header ── */}
      <div style={{
        position: 'absolute', top: 22, left: 42, right: 42,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <img src="/icons/icon-192x192.png" alt="" style={{
            width: 42, height: 42, filter: 'drop-shadow(0 0 18px rgba(34,211,238,0.28))',
          }} />
          <div style={{ width: 1, height: 38, marginLeft: 6, background: 'linear-gradient(to bottom, transparent, rgba(34,211,238,0.75), transparent)' }} />
          <div style={{ paddingTop: 4 }}>
            <div style={{ fontSize: 26, lineHeight: 0.94, fontWeight: 900, letterSpacing: '0.10em', textShadow: '0 0 18px rgba(241,245,249,0.12)' }}>
              SIGNUM <span style={{ color: '#22d3ee' }}>HQ</span>
            </div>
            <div style={{ marginTop: 8, color: '#d2d9e6', fontSize: 13, fontWeight: 500, letterSpacing: '0.02em' }}>
              See What Others Cannot
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 30, marginTop: 9, color: '#67e8f9', fontSize: 14, fontWeight: 800, letterSpacing: '0.55em' }}>
          <div style={{ width: 1, height: 32, background: 'linear-gradient(to bottom, transparent, rgba(34,211,238,0.82), transparent)' }} />
          MARKET INSIGHT
        </div>
      </div>

      {/* ── Left Copy ── */}
      <div style={{ position: 'absolute', left: 42, top: 88, width: 510, zIndex: 8 }}>
        <h1 style={{
          margin: 0, fontSize: 66, lineHeight: 1.0, fontWeight: 900, letterSpacing: '-0.065em',
          background: 'linear-gradient(105deg, #a855f7 0%, #a78bfa 42%, #22d3ee 96%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>
          {topic.title.split('\n').map((line: string, i: number) => (
            <span key={i}>{line}{i < topic.title.split('\n').length - 1 && <br />}</span>
          ))}
        </h1>
        <div style={{
          width: 250, height: 2, margin: '20px 0 18px',
          background: 'linear-gradient(90deg, #a78bfa, #22d3ee)',
          boxShadow: '0 0 22px rgba(34,211,238,0.26)',
        }} />
        <p style={{ margin: 0, maxWidth: 440, color: '#c6cedb', fontSize: 18, lineHeight: 1.4, fontWeight: 500, letterSpacing: '-0.02em' }}>
          {topic.subtitle}
        </p>

        {/* Legend */}
        <div style={{
          position: 'relative', marginTop: 22, width: 440, height: 66,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28,
          border: '1px solid rgba(167,139,250,0.42)', borderRadius: 10,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.014))',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 0 24px rgba(34,211,238,0.05)',
          backdropFilter: 'blur(14px)',
        }}>
          {topic.legend.map((item: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              {i > 0 && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.75)' }} />}
              <div style={{
                width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: '50%',
                border: `2px solid ${item.color}`, fontSize: 28, lineHeight: 1, color: item.color,
                filter: `drop-shadow(0 0 14px ${item.color})`,
              }}>
                {item.icon}
              </div>
              <div style={{ color: 'white', fontSize: 14, fontWeight: 800, letterSpacing: '0.05em' }}>
                {item.label}
                <div style={{ marginTop: 2, color: '#d8dee8', fontSize: 13, fontWeight: 500, letterSpacing: 0 }}>
                  {item.desc}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 14, fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em' }}>
          <div style={{
            width: 40, height: 40, display: 'grid', placeItems: 'center',
            border: '1.6px solid #22d3ee', borderRadius: '50%', color: '#dffbff',
            boxShadow: '0 0 18px rgba(34,211,238,0.28)',
          }}>
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z" />
              <path d="M8 6h8" />
            </svg>
          </div>
          <span style={{ background: 'linear-gradient(90deg, #f1f5f9, #67e8f9)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            {topic.cta}
          </span>
          <b style={{ color: '#22d3ee', fontSize: 32, lineHeight: 1, marginLeft: 3 }}>→</b>
        </div>
      </div>

      {/* ── Right: SVG Concept Diagram ── */}
      <div style={{ position: 'absolute', right: 20, top: 70, width: 540, height: 440, zIndex: 6 }}
        dangerouslySetInnerHTML={{ __html: topic.svg }}
      />

      {/* ── Footer ── */}
      <div style={{
        position: 'absolute', left: 42, right: 42, bottom: 16, height: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
      }}>
        <div style={{ position: 'absolute', top: '50%', left: 0, width: 420, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.20), transparent)' }} />
        <div style={{ position: 'absolute', top: '50%', right: 0, width: 430, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.20), transparent)' }} />
        <div style={{ color: '#d7dde8', fontSize: 15, fontWeight: 500, letterSpacing: '0.45em' }}>
          signumhq.com
        </div>
      </div>
    </div>
  );
}

// ── GEX Seesaw SVG ──
const GEX_SVG = `<svg viewBox="0 0 560 460" fill="none" style="width:100%;height:100%;overflow:visible">
<defs>
<linearGradient id="beamG" x1="60" y1="255" x2="505" y2="255" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset=".5" stop-color="#dbeafe"/><stop offset="1" stop-color="#22d3ee"/></linearGradient>
<linearGradient id="cG" x1="360" y1="150" x2="485" y2="315" gradientUnits="userSpaceOnUse"><stop stop-color="#67e8f9"/><stop offset="1" stop-color="#0284c7"/></linearGradient>
<linearGradient id="pG" x1="100" y1="141" x2="260" y2="321" gradientUnits="userSpaceOnUse"><stop stop-color="#a855f7"/><stop offset="1" stop-color="#4c1d95"/></linearGradient>
<radialGradient id="fG" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(290 337) rotate(90) scale(92 200)"><stop stop-color="#22d3ee" stop-opacity=".38"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
</defs>
<ellipse cx="290" cy="322" rx="200" ry="60" fill="url(#fG)" opacity=".65"/>
<g opacity=".35"><ellipse cx="290" cy="105" rx="200" ry="150" stroke="#8fb7d8" stroke-opacity=".44" stroke-dasharray="2 5"/><ellipse cx="290" cy="105" rx="150" ry="112" stroke="#22d3ee" stroke-opacity=".16"/><ellipse cx="290" cy="105" rx="100" ry="75" stroke="#a78bfa" stroke-opacity=".13"/></g>
<g fill="#22d3ee" opacity=".9"><circle cx="200" cy="7" r="2.5"/><circle cx="380" cy="8" r="2.5"/><circle cx="495" cy="113" r="2.5"/><circle cx="380" cy="250" r="2.5"/><circle cx="200" cy="250" r="2.5"/><circle cx="85" cy="113" r="2.5"/></g>
<path d="M56 260 508 244 506 253 58 270Z" fill="url(#beamG)" opacity=".96"/>
<path d="M56 260 508 244" stroke="#dffbff" stroke-opacity=".75" stroke-width="2"/>
<path d="M58 270 506 253" stroke="#22d3ee" stroke-opacity=".6" stroke-width="2"/>
<path d="M285 263 350 406H220L285 263Z" fill="url(#pG)" opacity=".72" stroke="#dbeafe" stroke-opacity=".75" stroke-width="2"/>
<circle cx="285" cy="256" r="22" fill="#0f172a" stroke="#dbeafe" stroke-width="3"/>
<circle cx="285" cy="256" r="12" fill="#7c3aed" stroke="#67e8f9" stroke-width="3"/>
<g transform="translate(85 82)"><circle cx="78" cy="78" r="68" fill="url(#pG)" opacity=".78"/><circle cx="78" cy="78" r="52" stroke="#d8b4fe" stroke-opacity=".62"/><circle cx="78" cy="78" r="74" stroke="#a78bfa" stroke-opacity=".38"/>
<path d="M60 68 78 58l18 10v18l-18 10-18-10V68Z" stroke="#e9d5ff" stroke-width="2"/><path d="M78 70v17" stroke="#e9d5ff" stroke-width="2"/><path d="M69 82h18" stroke="#e9d5ff" stroke-width="2"/>
<text x="78" y="125" text-anchor="middle" fill="#fff" font-size="15" font-weight="900" letter-spacing="2">DEALER</text><text x="78" y="145" text-anchor="middle" fill="#fff" font-size="15" font-weight="900" letter-spacing="2">HEDGING</text></g>
<g transform="translate(358 82)"><circle cx="78" cy="78" r="68" fill="url(#cG)" opacity=".74"/><circle cx="78" cy="78" r="52" stroke="#a5f3fc" stroke-opacity=".62"/><circle cx="78" cy="78" r="74" stroke="#22d3ee" stroke-opacity=".38"/>
<path d="M44 80c12 0 10-25 22-25s10 38 24 38 11-46 29-46" stroke="#dffbff" stroke-width="3.5" fill="none"/><path d="M110 47h8v8" stroke="#dffbff" stroke-width="2.5"/>
<text x="78" y="125" text-anchor="middle" fill="#fff" font-size="15" font-weight="900" letter-spacing="2">PRICE</text><text x="78" y="145" text-anchor="middle" fill="#fff" font-size="15" font-weight="900" letter-spacing="2">MOVEMENT</text></g>
<g transform="translate(250 82)" opacity=".9"><path d="M16 65c24-37 72-38 95-2" stroke="url(#beamG)" stroke-width="2.5" stroke-linecap="round"/><path d="M108 55 114 72 98 68" fill="#22d3ee"/>
<path d="M110 105c-24 37-72 38-95 2" stroke="url(#beamG)" stroke-width="2.5" stroke-linecap="round"/><path d="M19 117 13 100 29 104" fill="#a78bfa"/>
<text x="64" y="85" text-anchor="middle" fill="#dbeafe" font-size="12" font-weight="800" letter-spacing="4">DYNAMIC</text><text x="64" y="103" text-anchor="middle" fill="#dbeafe" font-size="12" font-weight="800" letter-spacing="4">FEEDBACK</text><text x="64" y="121" text-anchor="middle" fill="#dbeafe" font-size="12" font-weight="800" letter-spacing="4">LOOP</text></g>
<g opacity=".55"><ellipse cx="285" cy="410" rx="170" ry="18" stroke="#22d3ee" stroke-opacity=".35"/><ellipse cx="285" cy="410" rx="120" ry="12" stroke="#a78bfa" stroke-opacity=".28"/><ellipse cx="285" cy="410" rx="70" ry="7" stroke="#22d3ee" stroke-opacity=".26"/></g>
</svg>`;

// ── Topic Data ──
const TOPICS: Record<string, any> = {
  gex: {
    title: 'How Gamma\nExposure\nDrives Price',
    subtitle: 'A structural guide to dealer hedging, volatility, and market behavior.',
    legend: [
      { icon: '+', label: 'POSITIVE GEX', desc: 'dampens moves', color: '#34d399' },
      { icon: '−', label: 'NEGATIVE GEX', desc: 'amplifies moves', color: '#f87171' },
    ],
    cta: 'Read the full breakdown',
    svg: GEX_SVG,
  },
  dark_pool: {
    title: 'Dark Pool\nActivity\nExplained',
    subtitle: 'How institutions trade invisibly — and what their footprint reveals.',
    legend: [
      { icon: '▲', label: 'ABOVE 40%', desc: 'institutions active', color: '#a78bfa' },
      { icon: '▼', label: 'BELOW 30%', desc: 'retail-driven', color: '#64748b' },
    ],
    cta: 'Track the footprint',
    svg: GEX_SVG, // placeholder — same diagram for now
  },
  iv_percentile: {
    title: 'IV Percentile\nDecoded',
    subtitle: 'The only objective way to measure if options are expensive or cheap.',
    legend: [
      { icon: '⬆', label: '90TH PCTL', desc: 'expensive premiums', color: '#fbbf24' },
      { icon: '⬇', label: '10TH PCTL', desc: 'cheap premiums', color: '#34d399' },
    ],
    cta: 'Check IV levels',
    svg: GEX_SVG,
  },
  pcr: {
    title: 'Put/Call\nRatio\nRevealed',
    subtitle: 'One ratio reveals whether the market is hedging or speculating.',
    legend: [
      { icon: '>', label: 'PCR > 1.0', desc: 'fear elevated', color: '#f87171' },
      { icon: '<', label: 'PCR < 0.7', desc: 'greed stretched', color: '#34d399' },
    ],
    cta: 'See live sentiment',
    svg: GEX_SVG,
  },
  max_pain: {
    title: 'Max Pain &\nKey Levels\nMapped',
    subtitle: "There's a price level that acts like a magnet near expiration.",
    legend: [
      { icon: '⊤', label: 'CALL WALL', desc: 'ceiling resistance', color: '#22d3ee' },
      { icon: '⊥', label: 'PUT FLOOR', desc: 'floor support', color: '#a78bfa' },
    ],
    cta: 'See key levels',
    svg: GEX_SVG,
  },
};

export default function EducationOGPage() {
  return (
    <Suspense fallback={<div style={{ width: 1200, height: 630, background: '#04070d' }} />}>
      <EducationContent />
    </Suspense>
  );
}
