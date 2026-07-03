'use client';

// ============================================================================
// MorningBrief — premium, self-contained AI morning-briefing banner + report
// ----------------------------------------------------------------------------
// APP-ONLY. Imported only by app-view/guardian/page.tsx (the app's Guardian
// screen). It touches NO shared web component, so the website (/intel-guardian,
// /, /intel …) is completely unaffected.
//
// - Compact, premium one-line banner (subtle pulse + generation time) that sits
//   at the top of the Guardian "AI Overview" tab, above the Gravity Gauge.
// - Tapping it (or the morning push notification via ?brief=1) opens a full-screen
//   report overlay styled like the closing (장마감) report: header + the AI
//   narrative + disclaimer.
// - Fully localized ko / en / ja. Self-fetches its data (SWR key is shared with
//   the page, so no duplicate network calls). Renders nothing when there is no
//   usable briefing for today.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

type Locale = 'ko' | 'en' | 'ja';
const normLocale = (l: string): Locale => (l === 'ko' || l === 'ja' ? l : 'en');

const T: Record<Locale, {
  banner: string;
  cta: string;
  eyebrow: string;
  title: string;
  generated: string;
  disclaimer: string;
  close: string;
}> = {
  ko: {
    banner: 'AI 모닝브리핑',
    cta: '리포트',
    eyebrow: 'AI 모닝 인텔리전스',
    title: 'AI 모닝브리핑',
    generated: '생성',
    disclaimer: '교육 및 리서치용 시장 데이터입니다. 투자 조언이나 매수/매도 권유가 아니며, 정확성 또는 수익을 보장하지 않습니다.',
    close: '닫기',
  },
  en: {
    banner: 'AI Morning Brief',
    cta: 'Report',
    eyebrow: 'AI MORNING INTELLIGENCE',
    title: 'AI Morning Brief',
    generated: 'generated',
    disclaimer: 'Educational market-data research only. Not investment advice or a buy/sell recommendation. Accuracy and returns are not guaranteed.',
    close: 'Close',
  },
  ja: {
    banner: 'AI モーニングブリーフ',
    cta: 'レポート',
    eyebrow: 'AI モーニング・インテリジェンス',
    title: 'AI モーニングブリーフ',
    generated: '生成',
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

function splitParagraphs(text: string): string[] {
  const byNewline = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  return byNewline.length > 0 ? byNewline : [text.trim()];
}

const GOLD = '#f5b301';

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
  const paragraphs = useMemo(
    () => (hasBrief ? splitParagraphs(brief!.briefing!.trim()) : []),
    [hasBrief, brief],
  );

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
          display: 'flex',
          alignItems: 'center',
          gap: '9px',
          width: '100%',
          padding: '11px 14px',
          background: 'linear-gradient(90deg, rgba(245,179,1,0.10), rgba(245,179,1,0.03))',
          border: '1px solid rgba(245,179,1,0.28)',
          borderRadius: '12px',
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit',
          WebkitTapHighlightColor: 'transparent',
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
            position: 'fixed',
            inset: 0,
            zIndex: 3000,
            background: 'rgba(2,6,14,0.72)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '640px',
              maxHeight: '92vh',
              overflowY: 'auto',
              background: 'linear-gradient(180deg, #0b1220 0%, #070b14 100%)',
              border: '1px solid rgba(245,179,1,0.18)',
              borderBottom: 'none',
              borderRadius: '20px 20px 0 0',
              boxShadow: '0 -16px 48px rgba(0,0,0,0.6)',
              padding: '18px 18px calc(28px + env(safe-area-inset-bottom))',
            }}
          >
            {/* grabber + close */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ width: '38px', height: '4px', borderRadius: '999px', background: 'rgba(255,255,255,0.16)' }} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t.close}
                style={{
                  width: '30px', height: '30px', borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--text-dim, #c3c9d4)', fontSize: '16px', lineHeight: 1, cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            {/* header */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px' }}>
                <span className="mb-pulse-dot" aria-hidden="true" />
                <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', color: GOLD }}>
                  {t.eyebrow}
                </span>
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-bright, #f4f7fb)', lineHeight: 1.2 }}>
                {t.title}
              </div>
              {(brief?.date || genTime) && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted, #8a93a6)', marginTop: '5px' }}>
                  {brief?.date || ''}
                  {brief?.date && genTime ? ' · ' : ''}
                  {genTime ? `${genTime} ${t.generated}` : ''}
                </div>
              )}
            </div>

            {/* narrative */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '13px', marginBottom: '18px' }}>
              {paragraphs.map((p, i) => (
                <p key={i} style={{ margin: 0, fontSize: '15px', lineHeight: 1.85, color: 'var(--text-dim, #d4dae4)' }}>
                  {p}
                </p>
              ))}
            </div>

            {/* disclaimer */}
            <div style={{ fontSize: '11px', lineHeight: 1.6, color: 'var(--text-muted, #7a8290)', fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
              {t.disclaimer}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes mbPulseDot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.3; transform: scale(0.72); } }
        .mb-pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: ${GOLD}; box-shadow: 0 0 8px ${GOLD}; animation: mbPulseDot 1.7s ease-in-out infinite; flex-shrink: 0; }
        @media (prefers-reduced-motion: reduce) { .mb-pulse-dot { animation: none; } }
      `}</style>
    </>
  );
}
