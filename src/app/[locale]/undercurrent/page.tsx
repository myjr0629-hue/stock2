'use client';

// ============================================================================
// Undercurrent — spin-off PROTOTYPE page (news × money)  [v2: multi-layer home]
// ----------------------------------------------------------------------------
// COMPLETELY ISOLATED: fresh route + fresh bright-editorial design system
// (deliberately NOT SIGNUM's dark/gold), no shared app-view components.
//
// v2 layout (user direction): SIGNUM symbol in the masthead · sticky multi-menu ·
// sections with DISTINCT personalities (visual variety):
//   1) Pulse strip        — glanceable market undercurrent (lock-in: re-check)
//   2) Hero               — editorial image-led divergence story
//   3) 괴리 시그널 rail    — amber horizontal snap-scroll image cards
//   4) 큰손 레이더 rail    — emerald stat-led numeric cards (fintech character)
//   5) 스토리 리스트       — editorial rows (anchor targets)
// Spider-web lock-in: ticker/section chips anchor-jump into the full story rows;
// hero links "connected flows" (same mood/divergence) → everything cross-links.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

type Locale = 'ko' | 'en' | 'ja';
const normLocale = (l: unknown): Locale => (l === 'en' || l === 'ja' ? l : 'ko');

const T: Record<Locale, Record<string, string>> = {
  ko: {
    tagline: '뉴스 뒤에서 움직이는 돈',
    menuToday: '오늘', menuDiv: '괴리', menuWhale: '큰손', menuStories: '스토리',
    pulseTitle: '지금 시장 기류',
    pulseB: '강세', pulseC: '경계', pulseD: '괴리',
    bullish: '돈: 강세', cautious: '돈: 경계', neutral: '돈: 중립',
    divergence: '뉴스 ≠ 돈',
    moneyTitle: '돈의 움직임',
    secDiv: '괴리 시그널', secDivSub: '뉴스와 돈이 반대로 움직이는 곳',
    secWhale: '큰손 레이더', secWhaleSub: '기관이 장외에서 조용히 움직인 비중',
    secStories: '오늘의 스토리', secStoriesSub: '돈의 반응과 함께 읽는 뉴스',
    connected: '연결된 흐름',
    offExchange: '장외 거래 비중',
    loading: '돈의 흐름을 읽는 중…',
    error: '불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    disclaimer: '교육·정보 목적의 시장 데이터입니다. 투자 조언이 아니며 정확성을 보장하지 않습니다.',
  },
  en: {
    tagline: 'The money moving behind the news',
    menuToday: 'Today', menuDiv: 'Diverge', menuWhale: 'Whales', menuStories: 'Stories',
    pulseTitle: 'Market undercurrent now',
    pulseB: 'Bullish', pulseC: 'Cautious', pulseD: 'Diverging',
    bullish: 'Money: bullish', cautious: 'Money: cautious', neutral: 'Money: neutral',
    divergence: 'News ≠ Money',
    moneyTitle: 'What the money is doing',
    secDiv: 'Divergence signals', secDivSub: 'Where news and money point opposite ways',
    secWhale: 'Whale radar', secWhaleSub: 'Institutional off-exchange share',
    secStories: "Today's stories", secStoriesSub: 'News read together with the money',
    connected: 'Connected flows',
    offExchange: 'off-exchange share',
    loading: 'Reading the money flow…',
    error: 'Could not load. Please try again shortly.',
    disclaimer: 'Educational market information only. Not investment advice; accuracy not guaranteed.',
  },
  ja: {
    tagline: 'ニュースの裏で動くお金',
    menuToday: '今日', menuDiv: '乖離', menuWhale: '大口', menuStories: 'ストーリー',
    pulseTitle: 'いまの市場の底流',
    pulseB: '強気', pulseC: '警戒', pulseD: '乖離',
    bullish: 'マネー: 強気', cautious: 'マネー: 警戒', neutral: 'マネー: 中立',
    divergence: 'ニュース ≠ マネー',
    moneyTitle: 'お金の動き',
    secDiv: '乖離シグナル', secDivSub: 'ニュースとお金が逆方向の銘柄',
    secWhale: '大口レーダー', secWhaleSub: '機関投資家の場外取引シェア',
    secStories: '今日のストーリー', secStoriesSub: 'お金の反応と一緒に読むニュース',
    connected: 'つながる流れ',
    offExchange: '場外取引シェア',
    loading: 'マネーフローを読み取り中…',
    error: '読み込めませんでした。しばらくして再試行してください。',
    disclaimer: '教育・情報目的の市場データです。投資助言ではなく、正確性は保証されません。',
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
  emeraldDeep: '#07553A',
  amber: '#B45309',
  amberBg: '#FBEEDC',
  neutral: '#5C6470',
  neutralBg: '#EEECE6',
  diverge: '#C2410C',
  divergeBg: '#FDE8DC',
  shadow: '0 10px 30px rgba(23,25,30,0.07)',
};

interface Money {
  darkPoolPct: number | null;
  oiPcr: number | null;
  volumePcr: number | null;
  squeezeScore: number | null;
}
interface Card {
  ticker: string;
  tag: string | null;
  plainTitle: string;
  whyItMatters: string | null;
  moneyRead: string | null;
  moneyMood: 'bullish' | 'cautious' | 'neutral';
  divergence: boolean;
  hasMoneyData: boolean;
  money: Money;
  image: string | null;
  source: string | null;
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

function MoodBadge({ mood, t, small }: { mood: Card['moneyMood']; t: Record<string, string>; small?: boolean }) {
  const s = moodStyle(mood);
  const label = mood === 'bullish' ? t.bullish : mood === 'cautious' ? t.cautious : t.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: small ? 10.5 : 12, fontWeight: 700, color: s.color, background: s.bg,
      padding: small ? '3px 8px' : '5px 10px', borderRadius: 999, whiteSpace: 'nowrap',
    }}>
      <span aria-hidden>{s.arrow}</span>{label}
    </span>
  );
}

function DivBadge({ t, small }: { t: Record<string, string>; small?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: small ? 10 : 11.5, fontWeight: 800, color: '#fff', background: C.diverge,
      padding: small ? '3px 8px' : '5px 10px', borderRadius: 999, letterSpacing: '0.02em', whiteSpace: 'nowrap',
    }}>
      {t.divergence}
    </span>
  );
}

function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function SectionHead({ title, sub, color }: { title: string; sub: string; color: string }) {
  return (
    <div style={{ margin: '26px 2px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 3, background: color, display: 'inline-block' }} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 850 as any, letterSpacing: '-0.02em' }}>{title}</h2>
      </div>
      <div style={{ fontSize: 12.5, color: C.faint, fontWeight: 550 as any, marginTop: 3, marginLeft: 16 }}>{sub}</div>
    </div>
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
    fetch(`/api/undercurrent/feed?locale=${loc}&limit=8`)
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
  const divCards = cards.filter((c) => c.divergence && c !== hero);
  const whaleCards = [...cards]
    .filter((c) => (c.money?.darkPoolPct ?? 0) >= 40)
    .sort((a, b) => (b.money?.darkPoolPct ?? 0) - (a.money?.darkPoolPct ?? 0))
    .slice(0, 5);
  const connected = hero ? cards.filter((c) => c !== hero && (c.moneyMood === hero.moneyMood || c.divergence === hero.divergence)).slice(0, 3) : [];

  const menu = [
    { id: 'uc-top', label: t.menuToday },
    { id: 'uc-div', label: t.menuDiv, show: divCards.length > 0 || (hero?.divergence ?? false) },
    { id: 'uc-whale', label: t.menuWhale, show: whaleCards.length > 0 },
    { id: 'uc-stories', label: t.menuStories },
  ].filter((m) => m.show !== false);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, fontFamily: "-apple-system, 'SF Pro Display', 'Segoe UI', sans-serif" }}>
      <div id="uc-top" style={{ maxWidth: 560, margin: '0 auto', padding: '0 18px calc(46px + env(safe-area-inset-bottom))' }}>

        {/* masthead: OUR symbol + wordmark */}
        <header style={{ paddingTop: 'calc(20px + env(safe-area-inset-top))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 34, height: 34, borderRadius: 10, background: C.ink,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/signum-sg-vectorized.svg" alt="SIGNUM" style={{ width: 20, height: 20 }} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em' }}>Undercurrent</span>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: C.faint }}>by SIGNUM HQ</span>
              </div>
              <div style={{ fontSize: 12.5, color: C.sub, fontWeight: 500 }}>{t.tagline}</div>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: C.faint, fontWeight: 600, whiteSpace: 'nowrap' }}>{dateStr}</span>
          </div>
        </header>

        {/* sticky multi-menu */}
        <nav style={{
          position: 'sticky', top: 0, zIndex: 50, margin: '14px -18px 0', padding: '10px 18px',
          background: 'rgba(246,243,237,0.88)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          borderBottom: `1px solid ${C.line}`, display: 'flex', gap: 8, overflowX: 'auto',
        }}>
          {menu.map((m, i) => (
            <button key={m.id} type="button" onClick={() => jump(m.id)} style={{
              font: 'inherit', fontSize: 13, fontWeight: 750 as any, cursor: 'pointer', whiteSpace: 'nowrap',
              color: i === 0 ? '#fff' : C.ink, background: i === 0 ? C.ink : C.card,
              border: `1px solid ${i === 0 ? C.ink : C.line}`, padding: '7px 14px', borderRadius: 999,
            }}>
              {m.label}
            </button>
          ))}
        </nav>

        {/* pulse strip */}
        {feed?.pulse && (
          <section aria-label={t.pulseTitle} style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 14,
            background: C.card, border: `1px solid ${C.line}`, borderRadius: 16,
            padding: '11px 14px', boxShadow: C.shadow,
          }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.sub, letterSpacing: '0.03em' }}>{t.pulseTitle}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 11, fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
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
              border: `3px solid ${C.line}`, borderTopColor: C.emerald, animation: 'ucspin 0.9s linear infinite',
            }} />
            <div style={{ fontSize: 14, color: C.sub, fontWeight: 600 }}>{t.loading}</div>
          </div>
        )}
        {err && <div style={{ padding: '70px 0', textAlign: 'center', fontSize: 14, color: C.sub }}>{t.error}</div>}

        {/* hero — editorial image story */}
        {hero && (
          <article style={{ marginTop: 14, background: C.card, borderRadius: 22, overflow: 'hidden', border: `1px solid ${C.line}`, boxShadow: C.shadow }}>
            {hero.image && (
              <div style={{ position: 'relative', aspectRatio: '16/9', background: '#E8E4DC' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={hero.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                {hero.divergence && <div style={{ position: 'absolute', left: 12, top: 12 }}><DivBadge t={t} /></div>}
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
              {/* spider-web: connected flows */}
              {connected.length > 0 && (
                <div style={{ marginTop: 13, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.faint, letterSpacing: '0.05em' }}>{t.connected}</span>
                  {connected.map((c) => (
                    <button key={c.ticker} type="button" onClick={() => jump(`t-${c.ticker}`)} style={{
                      font: 'inherit', fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
                      color: C.ink, background: C.bg, border: `1px solid ${C.line}`,
                      padding: '4px 10px', borderRadius: 999,
                    }}>
                      {c.ticker} ↗
                    </button>
                  ))}
                </div>
              )}
            </div>
          </article>
        )}

        {/* 괴리 시그널 — amber horizontal rail (distinct personality) */}
        {divCards.length > 0 && (
          <section id="uc-div" style={{ scrollMarginTop: 70 }}>
            <SectionHead title={t.secDiv} sub={t.secDivSub} color={C.diverge} />
            <div style={{ display: 'flex', gap: 11, overflowX: 'auto', margin: '0 -18px', padding: '2px 18px 6px', scrollSnapType: 'x mandatory' }}>
              {divCards.map((c) => (
                <button key={c.ticker} type="button" onClick={() => jump(`t-${c.ticker}`)} style={{
                  font: 'inherit', textAlign: 'left', cursor: 'pointer', border: 'none', padding: 0,
                  flex: '0 0 236px', scrollSnapAlign: 'start', borderRadius: 18, overflow: 'hidden',
                  background: C.card, boxShadow: C.shadow, outline: `1px solid ${C.line}`,
                }}>
                  <div style={{ position: 'relative', height: 110, background: '#E8E4DC' }}>
                    {c.image && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={c.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    )}
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 30%, rgba(60,20,0,0.55))' }} />
                    <div style={{ position: 'absolute', left: 10, top: 10 }}><DivBadge t={t} small /></div>
                    <div style={{ position: 'absolute', left: 11, right: 11, bottom: 9, color: '#fff', fontSize: 13.5, fontWeight: 800, lineHeight: 1.3, textShadow: '0 1px 8px rgba(0,0,0,0.4)' }}>
                      {c.plainTitle}
                    </div>
                  </div>
                  <div style={{ padding: '9px 12px 11px', display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: C.faint }}>{c.ticker}</span>
                    <span style={{ marginLeft: 'auto' }}><MoodBadge mood={c.moneyMood} t={t} small /></span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 큰손 레이더 — emerald stat-led rail (fintech personality) */}
        {whaleCards.length > 0 && (
          <section id="uc-whale" style={{ scrollMarginTop: 70 }}>
            <SectionHead title={t.secWhale} sub={t.secWhaleSub} color={C.emerald} />
            <div style={{ display: 'flex', gap: 11, overflowX: 'auto', margin: '0 -18px', padding: '2px 18px 6px', scrollSnapType: 'x mandatory' }}>
              {whaleCards.map((c) => (
                <button key={c.ticker} type="button" onClick={() => jump(`t-${c.ticker}`)} style={{
                  font: 'inherit', textAlign: 'left', cursor: 'pointer', padding: '14px 15px',
                  flex: '0 0 172px', scrollSnapAlign: 'start', borderRadius: 18, border: 'none',
                  background: `linear-gradient(160deg, ${C.emeraldDeep}, #0B3D2C)`, color: '#fff', boxShadow: C.shadow,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 900, letterSpacing: '0.02em' }}>{c.ticker}</span>
                    {c.divergence && <span style={{ fontSize: 9.5, fontWeight: 800, color: '#FFD9C4', background: 'rgba(194,65,12,0.55)', padding: '2px 7px', borderRadius: 999 }}>{t.divergence}</span>}
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em', margin: '10px 0 1px', fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(c.money?.darkPoolPct ?? 0)}<span style={{ fontSize: 15, fontWeight: 800, opacity: 0.75 }}>%</span>
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.03em' }}>{t.offExchange}</div>
                  <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.18)', marginTop: 9, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, Math.max(4, c.money?.darkPoolPct ?? 0))}%`, height: '100%', background: '#5BE3A9', borderRadius: 99 }} />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 스토리 — editorial rows (anchor targets of the web) */}
        {cards.length > 0 && (
          <section id="uc-stories" style={{ scrollMarginTop: 70 }}>
            <SectionHead title={t.secStories} sub={t.secStoriesSub} color={C.ink} />
            {cards.map((c) => (
              <article key={c.ticker} id={`t-${c.ticker}`} style={{
                scrollMarginTop: 70, marginTop: 11, background: C.card, borderRadius: 18,
                border: `1px solid ${C.line}`, boxShadow: C.shadow, padding: 14,
                display: 'flex', gap: 13, alignItems: 'flex-start',
              }}>
                {c.image && (
                  <div style={{ width: 92, height: 74, flexShrink: 0, borderRadius: 12, overflow: 'hidden', background: '#E8E4DC' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: C.faint }}>{c.tag ? `${c.tag} · ` : ''}{c.ticker}</span>
                    {c.divergence && <DivBadge t={t} small />}
                  </div>
                  <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, lineHeight: 1.35, letterSpacing: '-0.01em' }}>{c.plainTitle}</h3>
                  {c.moneyRead && (
                    <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.55, color: C.sub }}>
                      {c.moneyRead}
                    </p>
                  )}
                  <div style={{ marginTop: 8 }}><MoodBadge mood={c.moneyMood} t={t} small /></div>
                </div>
              </article>
            ))}
          </section>
        )}

        {cards.length > 0 && (
          <footer style={{ marginTop: 22, fontSize: 11, lineHeight: 1.6, color: C.faint, fontStyle: 'italic' }}>
            {t.disclaimer}
          </footer>
        )}
      </div>
      <style>{`@keyframes ucspin { to { transform: rotate(360deg); } } html { scroll-behavior: smooth; }`}</style>
    </div>
  );
}
