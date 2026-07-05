'use client';

// ============================================================================
// Undercurrent — spin-off PROTOTYPE page (news × money)
// ----------------------------------------------------------------------------
// COMPLETELY ISOLATED: fresh route, fresh design system (bright editorial —
// deliberately NOT SIGNUM's dark/gold), no shared app-view components/CSS.
// Reads /api/undercurrent/feed (news + our per-ticker money data + AI verdicts).
// Design refs (user-approved): Headway (bright, bold stats, cards), Swiggy
// (badge-on-card, browse), Calm (glanceable ring/mood), Tripadvisor (big image
// cards, tag chips). No emoji in UI chrome; one restrained accent per meaning.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

type Locale = 'ko' | 'en' | 'ja';
const normLocale = (l: unknown): Locale => (l === 'en' || l === 'ja' ? l : 'ko');

const T: Record<Locale, Record<string, string>> = {
  ko: {
    tagline: '뉴스 뒤에서 움직이는 돈',
    pulseTitle: '지금 시장 기류',
    bullish: '돈: 강세',
    cautious: '돈: 경계',
    neutral: '돈: 중립',
    divergence: '뉴스 ≠ 돈',
    divergenceLong: '뉴스와 돈이 다르게 움직임',
    moneyTitle: '돈의 움직임',
    loading: '돈의 흐름을 읽는 중…',
    error: '불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    disclaimer: '교육·정보 목적의 시장 데이터입니다. 투자 조언이 아니며 정확성을 보장하지 않습니다.',
    pulseB: '강세',
    pulseC: '경계',
    pulseD: '괴리',
  },
  en: {
    tagline: 'The money moving behind the news',
    pulseTitle: 'Market undercurrent now',
    bullish: 'Money: bullish',
    cautious: 'Money: cautious',
    neutral: 'Money: neutral',
    divergence: 'News ≠ Money',
    divergenceLong: 'News and money point different ways',
    moneyTitle: 'What the money is doing',
    loading: 'Reading the money flow…',
    error: 'Could not load. Please try again shortly.',
    disclaimer: 'Educational market information only. Not investment advice; accuracy not guaranteed.',
    pulseB: 'Bullish',
    pulseC: 'Cautious',
    pulseD: 'Diverging',
  },
  ja: {
    tagline: 'ニュースの裏で動くお金',
    pulseTitle: 'いまの市場の底流',
    bullish: 'マネー: 強気',
    cautious: 'マネー: 警戒',
    neutral: 'マネー: 中立',
    divergence: 'ニュース ≠ マネー',
    divergenceLong: 'ニュースとお金が逆方向',
    moneyTitle: 'お金の動き',
    loading: 'マネーフローを読み取り中…',
    error: '読み込めませんでした。しばらくして再試行してください。',
    disclaimer: '教育・情報目的の市場データです。投資助言ではなく、正確性は保証されません。',
    pulseB: '強気',
    pulseC: '警戒',
    pulseD: '乖離',
  },
};

// ── design tokens (bright editorial) ──
const C = {
  bg: '#F6F3ED',
  card: '#FFFFFF',
  ink: '#17191E',
  sub: '#5C6470',
  faint: '#9AA1AB',
  line: 'rgba(23,25,30,0.08)',
  emerald: '#0B8A5C',
  emeraldBg: '#E4F3EC',
  amber: '#B45309',
  amberBg: '#FBEEDC',
  neutral: '#5C6470',
  neutralBg: '#EEECE6',
  diverge: '#C2410C',
  divergeBg: '#FDE8DC',
  shadow: '0 10px 30px rgba(23,25,30,0.07)',
};

interface Card {
  ticker: string;
  tag: string | null;
  plainTitle: string;
  whyItMatters: string | null;
  moneyRead: string | null;
  moneyMood: 'bullish' | 'cautious' | 'neutral';
  divergence: boolean;
  hasMoneyData: boolean;
  image: string | null;
  source: string | null;
  publishedAt: string | null;
}
interface Feed {
  success: boolean;
  pulse?: { bullish: number; cautious: number; neutral: number; divergences: number };
  cards?: Card[];
}

function moodStyle(mood: Card['moneyMood']) {
  if (mood === 'bullish') return { color: C.emerald, bg: C.emeraldBg, arrow: '↑' };
  if (mood === 'cautious') return { color: C.amber, bg: C.amberBg, arrow: '↓' };
  return { color: C.neutral, bg: C.neutralBg, arrow: '–' };
}

function MoodBadge({ mood, t }: { mood: Card['moneyMood']; t: Record<string, string> }) {
  const s = moodStyle(mood);
  const label = mood === 'bullish' ? t.bullish : mood === 'cautious' ? t.cautious : t.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 12, fontWeight: 700, color: s.color, background: s.bg,
      padding: '5px 10px', borderRadius: 999, whiteSpace: 'nowrap',
    }}>
      <span aria-hidden style={{ fontSize: 12 }}>{s.arrow}</span>{label}
    </span>
  );
}

function DivergenceBadge({ t }: { t: Record<string, string> }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11.5, fontWeight: 800, color: '#fff', background: C.diverge,
      padding: '5px 10px', borderRadius: 999, letterSpacing: '0.02em', whiteSpace: 'nowrap',
    }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" aria-hidden>
        <path d="M7 17L17 7M17 7H9M17 7v8" transform="rotate(90 12 12)" />
      </svg>
      {t.divergence}
    </span>
  );
}

export default function UndercurrentPage() {
  const params = useParams();
  const loc = normLocale((params as any)?.locale);
  const t = T[loc];
  const [feed, setFeed] = useState<Feed | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let dead = false;
    fetch(`/api/undercurrent/feed?locale=${loc}&limit=6`)
      .then((r) => r.json())
      .then((d) => { if (!dead) (d?.success ? setFeed(d) : setErr(true)); })
      .catch(() => { if (!dead) setErr(true); });
    return () => { dead = true; };
  }, [loc]);

  const dateStr = useMemo(() => {
    const tag = loc === 'ko' ? 'ko-KR' : loc === 'ja' ? 'ja-JP' : 'en-US';
    return new Date().toLocaleDateString(tag, { month: 'long', day: 'numeric', weekday: 'short' });
  }, [loc]);

  const cards = feed?.cards || [];
  const hero = cards.find((c) => c.divergence) || cards[0];
  const rest = cards.filter((c) => c !== hero);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, fontFamily: "-apple-system, 'SF Pro Display', 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 18px calc(40px + env(safe-area-inset-bottom))' }}>

        {/* masthead */}
        <header style={{ paddingTop: 'calc(22px + env(safe-area-inset-top))', paddingBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em' }}>Undercurrent</div>
            <div style={{ fontSize: 12.5, color: C.faint, fontWeight: 600 }}>{dateStr}</div>
          </div>
          <div style={{ fontSize: 13.5, color: C.sub, marginTop: 3, fontWeight: 500 }}>{t.tagline}</div>
        </header>

        {/* pulse strip */}
        {feed?.pulse && (
          <section aria-label={t.pulseTitle} style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 16,
            background: C.card, border: `1px solid ${C.line}`, borderRadius: 16,
            padding: '11px 14px', boxShadow: C.shadow,
          }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.sub, letterSpacing: '0.03em', marginRight: 2 }}>{t.pulseTitle}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 12.5, fontWeight: 800 }}>
              <span style={{ color: C.emerald }}>● {t.pulseB} {feed.pulse.bullish}</span>
              <span style={{ color: C.amber }}>● {t.pulseC} {feed.pulse.cautious}</span>
              <span style={{ color: C.diverge }}>● {t.pulseD} {feed.pulse.divergences}</span>
            </span>
          </section>
        )}

        {/* loading / error */}
        {!feed && !err && (
          <div style={{ padding: '70px 0', textAlign: 'center' }}>
            <div style={{
              width: 34, height: 34, margin: '0 auto 14px', borderRadius: '50%',
              border: `3px solid ${C.line}`, borderTopColor: C.emerald,
              animation: 'ucspin 0.9s linear infinite',
            }} />
            <div style={{ fontSize: 14, color: C.sub, fontWeight: 600 }}>{t.loading}</div>
          </div>
        )}
        {err && <div style={{ padding: '70px 0', textAlign: 'center', fontSize: 14, color: C.sub }}>{t.error}</div>}

        {/* hero card */}
        {hero && (
          <article style={{ marginTop: 16, background: C.card, borderRadius: 22, overflow: 'hidden', border: `1px solid ${C.line}`, boxShadow: C.shadow }}>
            {hero.image && (
              <div style={{ position: 'relative', aspectRatio: '16/9', background: '#E8E4DC' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={hero.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', gap: 7 }}>
                  {hero.divergence && <DivergenceBadge t={t} />}
                </div>
              </div>
            )}
            <div style={{ padding: '15px 17px 17px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                {hero.tag && <span style={{ fontSize: 11.5, fontWeight: 800, color: C.sub, background: C.neutralBg, padding: '4px 10px', borderRadius: 999 }}>{hero.tag}</span>}
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.faint }}>{hero.ticker}</span>
                <span style={{ marginLeft: 'auto' }}><MoodBadge mood={hero.moneyMood} t={t} /></span>
              </div>
              <h2 style={{ margin: 0, fontSize: 21, fontWeight: 850 as any, lineHeight: 1.3, letterSpacing: '-0.015em' }}>{hero.plainTitle}</h2>
              {hero.whyItMatters && <p style={{ margin: '9px 0 0', fontSize: 14.5, lineHeight: 1.65, color: C.sub }}>{hero.whyItMatters}</p>}
              {hero.moneyRead && (
                <div style={{ marginTop: 13, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.09em', color: moodStyle(hero.moneyMood).color, marginBottom: 5 }}>
                    {t.moneyTitle.toUpperCase()}
                  </div>
                  <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65, color: C.ink, fontWeight: 550 as any }}>{hero.moneyRead}</p>
                </div>
              )}
            </div>
          </article>
        )}

        {/* list cards */}
        {rest.map((c, i) => (
          <article key={i} style={{
            marginTop: 12, background: C.card, borderRadius: 18, border: `1px solid ${C.line}`,
            boxShadow: C.shadow, padding: 14, display: 'flex', gap: 13, alignItems: 'flex-start',
          }}>
            {c.image && (
              <div style={{ position: 'relative', width: 92, height: 74, flexShrink: 0, borderRadius: 12, overflow: 'hidden', background: '#E8E4DC' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: C.faint }}>{c.tag ? `${c.tag} · ` : ''}{c.ticker}</span>
                {c.divergence && (
                  <span style={{ fontSize: 10, fontWeight: 900, color: C.diverge, background: C.divergeBg, padding: '2px 7px', borderRadius: 999 }}>{t.divergence}</span>
                )}
              </div>
              <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, lineHeight: 1.35, letterSpacing: '-0.01em' }}>{c.plainTitle}</h3>
              {c.moneyRead && (
                <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.55, color: C.sub, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {c.moneyRead}
                </p>
              )}
              <div style={{ marginTop: 8 }}><MoodBadge mood={c.moneyMood} t={t} /></div>
            </div>
          </article>
        ))}

        {/* disclaimer */}
        {cards.length > 0 && (
          <footer style={{ marginTop: 22, fontSize: 11, lineHeight: 1.6, color: C.faint, fontStyle: 'italic' }}>
            {t.disclaimer}
          </footer>
        )}
      </div>
      <style>{`@keyframes ucspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
