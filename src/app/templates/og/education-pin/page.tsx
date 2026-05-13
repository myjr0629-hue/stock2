'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// Education topics with content
const TOPICS: Record<string, { title: string; subtitle: string; positiveLabel: string; negativeLabel: string; positiveCopy: string; negativeCopy: string; whyLine: string; cards: [string, string, string] }> = {
  gex: {
    title: 'What is GEX?',
    subtitle: 'Gamma Exposure Explained',
    positiveLabel: 'GEX POSITIVE',
    negativeLabel: 'GEX NEGATIVE',
    positiveCopy: 'Dealers buy dips,\nsell rips → Market stabilizes',
    negativeCopy: 'Dealers sell into drops,\nbuy rallies → Volatility explodes',
    whyLine: 'Most traders watch price. Institutional desks watch GEX.',
    cards: [
      'GEX Positive + VIX Low = Low risk, mean-reversion likely',
      'GEX Neutral + VIX Rising = Watch for breakout',
      'GEX Negative + VIX High = Trend acceleration, elevated risk',
    ],
  },
  dark_pool: {
    title: 'Dark Pools',
    subtitle: 'Institutional Hidden Orders',
    positiveLabel: 'HIGH DP%',
    negativeLabel: 'LOW DP%',
    positiveCopy: 'Institutions are active\nbeneath the surface',
    negativeCopy: 'Institutional activity\nwithin normal range',
    whyLine: 'Retail sees price. Institutions use dark pools to hide size.',
    cards: [
      'DP% > 40% + Rising = Heavy institutional accumulation',
      'DP% 25-40% = Normal institutional flow',
      'DP% < 25% + Falling = Institutions stepping back',
    ],
  },
  smart_flow: {
    title: 'Smart Flow',
    subtitle: 'Institutional Direction Index',
    positiveLabel: 'ACCUMULATION',
    negativeLabel: 'DISTRIBUTION',
    positiveCopy: 'Institutions building\npositions → Bullish bias',
    negativeCopy: 'Institutions reducing\npositions → Bearish bias',
    whyLine: 'Price follows volume. Volume follows institutions.',
    cards: [
      'Smart Flow > 65 = Accumulation pattern observed',
      'Smart Flow 35-65 = No directional conviction',
      'Smart Flow < 35 = Distribution pattern detected',
    ],
  },
};

function EducationPinContent() {
  const sp = useSearchParams();
  const topic = sp.get('topic') || 'gex';
  const t = TOPICS[topic] || TOPICS.gex;

  return (
    <>
      <style>{`
        .pin {
          position: relative; width: 1000px; height: 1500px; overflow: hidden; color: #f1f5f9;
          background: radial-gradient(circle at 94% 34%, rgba(34,211,238,0.26), transparent 28%), radial-gradient(circle at 8% 96%, rgba(124,58,237,0.34), transparent 30%), radial-gradient(circle at 50% 22%, rgba(34,211,238,0.10), transparent 32%), linear-gradient(180deg, #02050d 0%, #040710 42%, #050817 100%);
          font-family: Inter, ui-sans-serif, system-ui, sans-serif; isolation: isolate;
        }
        .pin::before {
          content: ""; position: absolute; inset: 0; z-index: -4; opacity: 0.25;
          background-image: linear-gradient(rgba(34,211,238,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.045) 1px, transparent 1px);
          background-size: 32px 32px;
          mask-image: linear-gradient(to bottom, transparent 0%, black 10%, black 92%, transparent 100%);
        }
        .pin::after {
          content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 80; opacity: 0.035;
          background: repeating-linear-gradient(to bottom, rgba(255,255,255,0.9) 0, rgba(255,255,255,0.9) 1px, transparent 1px, transparent 5px);
          mix-blend-mode: overlay;
        }
        .orbital-decor {
          position: absolute; left: -240px; bottom: -230px; width: 460px; height: 460px;
          border-radius: 50%; border: 1px solid rgba(124,58,237,0.20);
          box-shadow: inset 0 0 90px rgba(124,58,237,0.05); opacity: 0.75;
        }
        .top { position: absolute; left: 64px; right: 64px; top: 42px; text-align: center; }
        .brand { display: inline-flex; align-items: center; gap: 22px; margin-bottom: 46px; }
        .logo-box {
          width: 78px; height: 78px; display: grid; place-items: center; border-radius: 18px;
          background: radial-gradient(circle at 24% 18%, rgba(255,255,255,0.26), transparent 36%), linear-gradient(135deg, #a78bfa 0%, #7c3aed 46%, #22d3ee 100%);
          box-shadow: 0 0 30px rgba(34,211,238,0.22), inset 0 1px 0 rgba(255,255,255,0.22);
          border: 1px solid rgba(255,255,255,0.14);
        }
        .brand-text { color: #f1f5f9; font-size: 38px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; text-shadow: 0 0 18px rgba(255,255,255,0.12); }
        .title { margin: 0; color: #f1f5f9; font-size: 74px; line-height: 0.96; font-weight: 900; letter-spacing: -0.07em; text-shadow: 0 8px 32px rgba(0,0,0,0.35); }
        .subtitle { margin-top: 24px; color: #22d3ee; font-size: 39px; font-weight: 500; letter-spacing: -0.035em; text-shadow: 0 0 18px rgba(34,211,238,0.25); }
        .top-divider { height: 2px; width: 820px; margin: 32px auto 0; background: linear-gradient(90deg, transparent, #22d3ee, rgba(255,255,255,0.22), transparent); box-shadow: 0 0 18px rgba(34,211,238,0.32); }
        .section-title { color: #22d3ee; font-size: 25px; font-weight: 900; letter-spacing: 0.38em; text-align: center; text-transform: uppercase; text-shadow: 0 0 14px rgba(34,211,238,0.18); }
        .concept { position: absolute; left: 94px; right: 94px; top: 350px; height: 305px; }
        .concept-grid { margin-top: 26px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .concept-card {
          position: relative; height: 222px; border-radius: 14px; border: 1px solid currentColor;
          background: radial-gradient(circle at 50% 18%, currentColor 0%, transparent 32%), linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015)), rgba(10,17,30,0.74);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 42px rgba(0,0,0,0.24);
          overflow: hidden; padding: 32px 28px 26px; text-align: center;
        }
        .concept-card::before { content: ""; position: absolute; inset: 0; background: currentColor; opacity: 0.055; pointer-events: none; }
        .concept-card.positive { color: #34d399; }
        .concept-card.negative { color: #f87171; }
        .concept-icon { width: 74px; height: 74px; margin: 0 auto 24px; color: currentColor; filter: drop-shadow(0 0 16px currentColor); }
        .concept-name { color: currentColor; font-size: 32px; font-weight: 900; letter-spacing: 0.02em; text-transform: uppercase; }
        .concept-copy { margin-top: 19px; color: #f1f5f9; font-size: 21px; line-height: 1.34; font-weight: 500; white-space: pre-line; }
        .why-section { position: absolute; left: 88px; right: 88px; top: 678px; height: 270px; }
        .spectrum { position: relative; margin-top: 32px; height: 110px; }
        .scale-bar { position: absolute; left: 120px; right: 120px; top: 53px; height: 16px; border-radius: 999px; background: linear-gradient(90deg, #8b5cf6 0%, #4b5563 50%, #34d399 100%); box-shadow: 0 0 24px rgba(34,211,238,0.12), inset 0 1px 3px rgba(255,255,255,0.20); }
        .knob { position: absolute; right: 42px; top: 41px; width: 45px; height: 45px; border-radius: 50%; border: 5px solid #d9ffe7; background: rgba(52,211,153,0.18); box-shadow: 0 0 28px rgba(52,211,153,0.72), inset 0 0 0 8px rgba(52,211,153,0.18); z-index: 4; }
        .scale-label { position: absolute; top: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.10em; text-transform: uppercase; }
        .scale-label.neg { left: 0; color: #8b5cf6; }
        .scale-label.neu { left: 50%; transform: translateX(-50%); color: #94a3b8; }
        .scale-label.pos { right: 0; color: #34d399; }
        .scale-icon-left { position: absolute; left: 22px; top: 42px; width: 52px; height: 52px; opacity: 0.92; color: #8b5cf6; filter: drop-shadow(0 0 16px currentColor); }
        .scale-icon-right { position: absolute; right: -6px; top: 42px; width: 52px; height: 52px; opacity: 0.92; color: #b6ffbf; filter: drop-shadow(0 0 16px currentColor); }
        .why-line { margin-top: 22px; color: #f1f5f9; text-align: center; font-size: 25px; line-height: 1.32; font-style: italic; font-weight: 500; }
        .read-section { position: absolute; left: 94px; right: 94px; top: 972px; height: 275px; }
        .read-stack { margin-top: 24px; display: grid; gap: 13px; }
        .read-card {
          position: relative; height: 76px; border-radius: 11px; border: 1px solid currentColor;
          background: linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015)), rgba(10,17,30,0.76);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 14px 34px rgba(0,0,0,0.20);
          display: grid; grid-template-columns: 104px 1fr; align-items: center; overflow: hidden; padding-right: 26px;
        }
        .read-card::before { content: ""; position: absolute; inset: 0; background: currentColor; opacity: 0.045; pointer-events: none; }
        .read-card.green { color: #34d399; }
        .read-card.amber { color: #fbbf24; }
        .read-card.red { color: #f87171; }
        .read-icon { width: 51px; height: 51px; margin-left: 29px; border-radius: 50%; border: 1.5px solid currentColor; display: grid; place-items: center; color: currentColor; filter: drop-shadow(0 0 11px currentColor); }
        .read-copy { color: #f1f5f9; font-size: 22px; line-height: 1.24; font-weight: 600; }
        .read-copy strong { color: currentColor; font-weight: 900; }
        .cta { position: absolute; left: 0; right: 0; bottom: 36px; text-align: center; }
        .save { color: #f1f5f9; font-size: 30px; font-weight: 500; margin-bottom: 20px; }
        .site { display: inline-block; color: #06b6d4; font-size: 31px; font-weight: 500; text-decoration: underline; text-underline-offset: 8px; text-decoration-thickness: 2px; text-shadow: 0 0 16px rgba(6,182,212,0.18); }
        .footer-brand { display: inline-flex; align-items: center; gap: 15px; margin-top: 30px; }
        .small-logo { width: 54px; height: 54px; display: grid; place-items: center; border-radius: 13px; background: linear-gradient(135deg, #a78bfa 0%, #7c3aed 46%, #22d3ee 100%); box-shadow: 0 0 20px rgba(34,211,238,0.18); }
        .small-word { color: #f1f5f9; font-size: 28px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; }
        .disclaimer { margin-top: 25px; color: #94a3b8; font-size: 19px; font-weight: 500; }
      `}</style>

      <main className="pin">
        <div className="orbital-decor" />

        {/* TOP */}
        <section className="top">
          <div className="brand">
            <div className="logo-box">
              <svg viewBox="0 0 64 64" fill="none" width="48" height="48">
                <path d="M48 10H25C15 10 9 16 9 25c0 8 5 13 15 17l16 6c5 2 8 5 8 9 0 5-4 8-12 8H15" stroke="white" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
                <path d="M48 10 37 21M16 54 28 43" stroke="white" strokeWidth="11" strokeLinecap="round" opacity="0.95" />
              </svg>
            </div>
            <div className="brand-text">SIGNUM HQ</div>
          </div>
          <h1 className="title">{t.title}</h1>
          <div className="subtitle">{t.subtitle}</div>
          <div className="top-divider" />
        </section>

        {/* SECTION 1: The Concept */}
        <section className="concept">
          <div className="section-title">01 · The Concept</div>
          <div className="concept-grid">
            <article className="concept-card positive">
              <svg className="concept-icon" viewBox="0 0 74 74" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round">
                <path d="M37 7 62 17v19c0 18-11 29-25 34C23 65 12 54 12 36V17L37 7Z" />
                <path d="M25 37 34 46 50 26" strokeLinecap="round" />
              </svg>
              <div className="concept-name">{t.positiveLabel}</div>
              <div className="concept-copy">{t.positiveCopy}</div>
            </article>
            <article className="concept-card negative">
              <svg className="concept-icon" viewBox="0 0 74 74" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M42 5 15 43h21l-3 26 27-43H39L42 5Z" />
              </svg>
              <div className="concept-name">{t.negativeLabel}</div>
              <div className="concept-copy">{t.negativeCopy}</div>
            </article>
          </div>
        </section>

        {/* SECTION 2: Why It Matters */}
        <section className="why-section">
          <div className="section-title">02 · Why It Matters</div>
          <div className="spectrum">
            <div className="scale-label neg">Negative</div>
            <div className="scale-label neu">Neutral</div>
            <div className="scale-label pos">Positive</div>
            <svg className="scale-icon-left" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M32 3 38 25 57 12 44 32 61 40 40 40 45 61 32 45 19 61 24 40 3 40 20 32 7 12 26 25 32 3Z" />
            </svg>
            <div className="scale-bar" />
            <span className="knob" />
            <svg className="scale-icon-right" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
              <path d="M32 6 54 15v17c0 16-10 26-22 30C20 58 10 48 10 32V15L32 6Z" />
            </svg>
          </div>
          <div className="why-line">{t.whyLine}</div>
        </section>

        {/* SECTION 3: How To Read It */}
        <section className="read-section">
          <div className="section-title">03 · How To Read It</div>
          <div className="read-stack">
            {t.cards.map((card, i) => {
              const cls = i === 0 ? 'green' : i === 1 ? 'amber' : 'red';
              const [boldPart, ...rest] = card.split(' = ');
              return (
                <article key={i} className={`read-card ${cls}`}>
                  <div className="read-icon">
                    {i === 0 && <svg width="34" height="34" viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M17 4 29 9v10c0 9-5 14-12 17C10 33 5 28 5 19V9l12-5Z"/></svg>}
                    {i === 1 && <svg width="34" height="34" viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="17" cy="17" r="11"/><circle cx="17" cy="17" r="4"/></svg>}
                    {i === 2 && <svg width="34" height="34" viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M19 2 7 20h10l-1 12 12-20H18l1-10Z"/></svg>}
                  </div>
                  <div className="read-copy"><strong>{boldPart}</strong> = {rest.join(' = ')}</div>
                </article>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <footer className="cta">
          <div className="save">Save this for your trading toolkit</div>
          <div className="site">signumhq.com</div>
          <div className="footer-brand">
            <div className="small-logo">
              <svg viewBox="0 0 64 64" fill="none" width="34" height="34">
                <path d="M48 10H25C15 10 9 16 9 25c0 8 5 13 15 17l16 6c5 2 8 5 8 9 0 5-4 8-12 8H15" stroke="white" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
                <path d="M48 10 37 21M16 54 28 43" stroke="white" strokeWidth="11" strokeLinecap="round" opacity="0.95" />
              </svg>
            </div>
            <div className="small-word">SIGNUM HQ</div>
          </div>
          <div className="disclaimer">Observation only — not financial advice</div>
        </footer>
      </main>
    </>
  );
}

export default function EducationPinTemplate() {
  return (
    <Suspense fallback={<div style={{ width: 1000, height: 1500, background: '#040710' }} />}>
      <EducationPinContent />
    </Suspense>
  );
}
