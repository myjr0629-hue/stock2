'use client';

// ============================================================================
// MorningBrief — premium, self-contained AI morning-briefing banner + report
// ----------------------------------------------------------------------------
// APP-ONLY. Imported only by app-view/guardian/page.tsx (the app's Guardian
// screen). Touches NO shared web component, so the website (/intel-guardian, /,
// /intel …) is completely unaffected.
//
// - Compact, premium one-line banner (subtle pulse + generation time) at the top
//   of the Guardian "AI Overview" tab, above the Gravity Gauge.
// - Tapping it (or the morning push via ?brief=1) opens a full-screen report
//   overlay styled like the closing report: sunrise hero + the AI narrative with
//   key figures / percentages / tickers highlighted + a "Key Outlook" callout +
//   disclaimer.
// - Fully localized ko / en / ja. Self-fetches its data (SWR key shared with the
//   page → no duplicate network). Renders nothing when there is no usable briefing.
//
// Highlighting is pure presentation over the existing briefing text (no data or
// generation change): numbers/percentages/tickers are wrapped in styled spans,
// built programmatically (no HTML injection). Percentages/numbers are language-
// agnostic; the keyword list covers the common indices/tickers across ko/en/ja.
// ============================================================================

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import useSWR from 'swr';

type Locale = 'ko' | 'en' | 'ja';
const normLocale = (l: string): Locale => (l === 'ko' || l === 'ja' ? l : 'en');

const T: Record<Locale, {
  banner: string;
  cta: string;
  eyebrow: string;
  title: string;
  generated: string;
  outlook: string;
  disclaimer: string;
  close: string;
}> = {
  ko: {
    banner: 'AI 모닝브리핑',
    cta: '리포트',
    eyebrow: 'AI 모닝 인텔리전스',
    title: 'AI 모닝브리핑',
    generated: '생성',
    outlook: '핵심 전망',
    disclaimer: '교육 및 리서치용 시장 데이터입니다. 투자 조언이나 매수/매도 권유가 아니며, 정확성 또는 수익을 보장하지 않습니다.',
    close: '닫기',
  },
  en: {
    banner: 'AI Morning Brief',
    cta: 'Report',
    eyebrow: 'AI MORNING INTELLIGENCE',
    title: 'AI Morning Brief',
    generated: 'generated',
    outlook: 'Key Outlook',
    disclaimer: 'Educational market-data research only. Not investment advice or a buy/sell recommendation. Accuracy and returns are not guaranteed.',
    close: 'Close',
  },
  ja: {
    banner: 'AI モーニングブリーフ',
    cta: 'レポート',
    eyebrow: 'AI モーニング・インテリジェンス',
    title: 'AI モーニングブリーフ',
    generated: '生成',
    outlook: '重要見通し',
    disclaimer: '教育およびリサーチ用の市場データです。投資助言や売買推奨ではなく、正確性または収益を保証しません。',
    close: '閉じる',
  },
};

const fetcher = (u: string) => fetch(u).then((r) => r.json());

interface BriefingResp {
  success?: boolean;
  briefing?: string;
  date?: string;
  generatedAt?: string;
}

// Colors (self-contained; CSS-var fallbacks for the dark app theme).
const GOLD = '#f5b301';
const TICKER = '#7cc4ff';
const UP = '#10b981';
const DOWN = '#f43f5e';
const BRIGHT = '#f4f7fb';

function localeTag(loc: Locale): string {
  return loc === 'ko' ? 'ko-KR' : loc === 'ja' ? 'ja-JP' : 'en-US';
}

// Generation time formatted in US Eastern (the briefing's reference zone) + "ET".
function formatGenTime(iso: string | undefined, loc: Locale): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    const t = d.toLocaleTimeString(localeTag(loc), {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${t} ET`;
  } catch {
    return '';
  }
}

// ── Inline highlighting ────────────────────────────────────────────────────
// Space + no-space variants (ja often writes "S&P500" / "NASDAQ100" without a space).
// Longer / more-specific entries first so alternation prefers them.
const HL_KEYWORDS = ['S&P 500', 'S&P500', 'S&P', 'NASDAQ 100', 'NASDAQ100', 'NASDAQ', 'VIX3M', 'VIX', 'RLSI', 'OPEC+', 'OPEC', 'DXY', 'GEX', 'PCR', 'DOW'];
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const HL_RE = new RegExp(
  '(' + HL_KEYWORDS.map(escapeRe).join('|') + ')' + // 1: keyword / index / ticker
  '|([+\\-−]?\\d+(?:\\.\\d+)?%)' +               // 2: percentage
  '|(\\$[A-Za-z]{1,6})' +                             // 3: $TICKER
  '|(\\d[\\d,]*\\.\\d+)',                             // 4: decimal number / price
  'g',
);

function renderHighlighted(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  HL_RE.lastIndex = 0;
  while ((m = HL_RE.exec(text)) !== null) {
    const full = m[0];
    if (!full) { HL_RE.lastIndex += 1; continue; }
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] || m[3]) {
      out.push(<b key={i++} style={{ color: TICKER, fontWeight: 700 }}>{full}</b>);
    } else if (m[2]) {
      const neg = /^[-−]/.test(full);
      out.push(<b key={i++} style={{ color: neg ? DOWN : UP, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>{full}</b>);
    } else {
      out.push(<b key={i++} style={{ color: BRIGHT, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>{full}</b>);
    }
    last = m.index + full.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Split the narrative into body + a concluding "outlook" sentence (only when the
// text is long enough to have a clear conclusion — otherwise no callout).
function splitOutlook(text: string): { body: string; outlook: string | null } {
  const sentences = text.match(/[^.。!?！？]+[.。!?！？]+/g);
  if (sentences && sentences.length >= 3) {
    return {
      outlook: sentences[sentences.length - 1].trim(),
      body: sentences.slice(0, -1).join(' ').trim(),
    };
  }
  return { body: text.trim(), outlook: null };
}

function splitParagraphs(text: string): string[] {
  const byNewline = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  return byNewline.length > 0 ? byNewline : [text.trim()];
}

export function MorningBrief({ locale, autoOpen = false }: { locale: string; autoOpen?: boolean }) {
  const loc = normLocale(locale);
  const t = T[loc];
  const [open, setOpen] = useState(false);

  const { data: brief } = useSWR<BriefingResp>(
    `/api/guardian/briefing?locale=${loc}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const hasBrief = Boolean(
    brief?.success && typeof brief?.briefing === 'string' && brief.briefing.trim().length > 30,
  );

  const genTime = useMemo(() => formatGenTime(brief?.generatedAt, loc), [brief?.generatedAt, loc]);
  const { bodyParagraphs, outlook } = useMemo(() => {
    if (!hasBrief) return { bodyParagraphs: [] as string[], outlook: null as string | null };
    const { body, outlook } = splitOutlook(brief!.briefing!.trim());
    return { bodyParagraphs: splitParagraphs(body), outlook };
  }, [hasBrief, brief]);

  useEffect(() => {
    if (autoOpen && hasBrief) setOpen(true);
  }, [autoOpen, hasBrief]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!hasBrief) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${t.banner} — ${t.cta}`}
        style={{
          display: 'flex', alignItems: 'center', gap: '9px', width: '100%', padding: '11px 14px',
          background: 'linear-gradient(90deg, rgba(245,179,1,0.10), rgba(245,179,1,0.03))',
          border: '1px solid rgba(245,179,1,0.28)', borderRadius: '12px', cursor: 'pointer',
          textAlign: 'left', font: 'inherit', WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span className="mb-pulse-dot" aria-hidden="true" />
        <span style={{ fontSize: '13px', fontWeight: 700, color: GOLD, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
          {t.banner}
        </span>
        {genTime && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted, #8a93a6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            · {genTime} {t.generated}
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '12px', fontWeight: 600, color: GOLD, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {t.cta}
          <span aria-hidden="true">→</span>
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.title}
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 3000,
            background: 'rgba(2,6,14,0.72)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            className="mb-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '640px', overflowY: 'auto',
              background: 'linear-gradient(180deg, #0b1220 0%, #070b14 100%)',
              border: '1px solid rgba(245,179,1,0.18)', borderBottom: 'none',
              borderRadius: '20px 20px 0 0', boxShadow: '0 -16px 48px rgba(0,0,0,0.6)',
            }}
          >
            {/* grabber + close */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 0' }}>
              <div style={{ width: '38px', height: '4px', borderRadius: '999px', background: 'rgba(255,255,255,0.16)' }} />
              <button
                type="button" onClick={() => setOpen(false)} aria-label={t.close}
                style={{
                  width: '30px', height: '30px', borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--text-dim, #c3c9d4)', fontSize: '16px', lineHeight: 1, cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            {/* sunrise hero header */}
            <div style={{ position: 'relative', padding: '10px 16px 16px', background: 'radial-gradient(120% 90% at 18% 130%, rgba(245,179,1,0.20), rgba(245,179,1,0.04) 46%, transparent 72%)' }}>
              <svg viewBox="0 0 60 34" width="50" height="28" style={{ position: 'absolute', right: '16px', top: '12px', opacity: 0.9 }} aria-hidden="true">
                <defs>
                  <radialGradient id="mbSun" cx="50%" cy="90%" r="70%">
                    <stop offset="0%" stopColor="#ffd873" />
                    <stop offset="100%" stopColor={GOLD} />
                  </radialGradient>
                </defs>
                <circle cx="30" cy="30" r="11" fill="url(#mbSun)" />
                <g stroke={GOLD} strokeWidth="1.6" strokeLinecap="round" opacity="0.8">
                  <line x1="30" y1="8" x2="30" y2="3" />
                  <line x1="14" y1="14" x2="10" y2="10" />
                  <line x1="46" y1="14" x2="50" y2="10" />
                </g>
                <line x1="2" y1="30" x2="58" y2="30" stroke={GOLD} strokeWidth="1.4" opacity="0.5" />
              </svg>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px' }}>
                <span className="mb-pulse-dot" aria-hidden="true" />
                <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', color: GOLD }}>{t.eyebrow}</span>
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: BRIGHT, lineHeight: 1.2 }}>{t.title}</div>
              {(brief?.date || genTime) && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted, #8a93a6)', marginTop: '5px' }}>
                  {brief?.date || ''}
                  {brief?.date && genTime ? ' · ' : ''}
                  {genTime ? `${genTime} ${t.generated}` : ''}
                </div>
              )}
            </div>

            {/* body */}
            <div style={{ padding: '4px 16px calc(28px + env(safe-area-inset-bottom))' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
                {bodyParagraphs.map((p, i) => (
                  <p key={i} style={{ margin: 0, fontSize: '15px', lineHeight: 1.9, color: '#c8cede' }}>
                    {renderHighlighted(p)}
                  </p>
                ))}
              </div>

              {outlook && (
                <div style={{ marginTop: '16px', background: 'rgba(245,179,1,0.06)', borderLeft: `3px solid ${GOLD}`, borderRadius: '0 10px 10px 0', padding: '11px 13px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                    <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: GOLD }}>{t.outlook}</span>
                  </div>
                  <div style={{ fontSize: '14px', lineHeight: 1.7, color: '#e6e9f0' }}>{renderHighlighted(outlook)}</div>
                </div>
              )}

              <div style={{ marginTop: '18px', fontSize: '11px', lineHeight: 1.6, color: 'var(--text-muted, #7a8290)', fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                {t.disclaimer}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* Bottom-sheet height: dvh = the actually-visible viewport (fixes iOS WebView vh
           overflowing past the visible area with contentInset, which pinned long English
           content to the very top). 86 leaves a consistent top gap so short (ko) and long
           (en) content both read as a detached sheet. vh line is the pre-dvh fallback. */
        .mb-sheet { max-height: 86vh; max-height: 86dvh; }
        @keyframes mbPulseDot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.3; transform: scale(0.72); } }
        .mb-pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: ${GOLD}; box-shadow: 0 0 8px ${GOLD}; animation: mbPulseDot 1.7s ease-in-out infinite; flex-shrink: 0; }
        @media (prefers-reduced-motion: reduce) { .mb-pulse-dot { animation: none; } }
      `}</style>
    </>
  );
}
