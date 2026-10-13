import { ImageResponse } from 'next/og';
import { publicBase } from '@/lib/net/publicBase';
import { loadCardFonts, loadIconDataUrl } from '@/lib/invite/ogFonts';
import { toInviteLang } from '@/lib/invite/kinds';
import { loadLanding, ogCardOf, ogGlyphs, parseLandingParams, type OgCard } from '@/lib/invite/landing';

// ============================================================================
// /[locale]/s/[kind]/[ticker] 의 링크 미리보기 카드(og:image) — 공유 카드 «실제 숫자 · 기준 시각 · ✦AI 해설» (2026-10-14, 브랜치 feat/viral-loop)
//
// · 매 요청 생성(force-dynamic): 빌드 때 그리면 그 순간의 숫자가 박제된다. 내용은 페이지와 «같은 뷰 모델»(lib/invite/landing — 저장본 읽기만, AI 호출 0)이다.
// · 글꼴: lib/invite/ogFonts.loadCardFonts — 영어 Inter, 한국어·일본어는 Noto Sans 를 «쓰는 글자만» 받는다. 못 받으면 영어판으로 다시 그린다 — 카드는 항상 나온다.
// · 데이터가 없거나 대체 화면이면 «종류 제목 + 브랜드»만 그리는 카드(깨진 이미지 금지).
// · Satori 제약: 모든 div 는 display:flex, 텍스트 노드는 문자열 하나, ✦ 는 글꼴에 없어 SVG 로 그린다.
// ============================================================================
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'SIGNUM HQ — shared card';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// today/opengraph-image.tsx 의 팔레트 + 실적 주간의 amber(예상 변동폭 숫자)
const C = { bg: '#0B0E14', title: '#F4F1E8', label: '#8B92A5', value: '#D2D8E4', line: '#232B3B', accent: '#7DD3FC', amber: '#F59E4B', foot: '#566074' };

/** ✦ 모양(4점 별) — 글꼴에 의존하지 않는 SVG */
const SPARK = 'M12 0C12.9 7.2 16.8 11.1 24 12C16.8 12.9 12.9 16.8 12 24C11.1 16.8 7.2 12.9 0 12C7.2 11.1 11.1 7.2 12 0Z';

/** 앱 아이콘 data: URL — 한 번 받으면 인스턴스 메모리에 둔다(요청마다 운영 도메인을 다시 부르지 않게). 못 받으면 null → 색 칸으로 대신 */
let iconCache: string | null = null;
async function appIcon(): Promise<string | null> {
  if (iconCache) return iconCache;
  const d = await loadIconDataUrl(`${publicBase()}/app-icons/signum-72.png`);
  if (d) iconCache = d;
  return d;
}

function AiBadge({ px }: { px: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexShrink: 0, gap: `${Math.round(px * 0.22)}px`,
      padding: `${Math.round(px * 0.1)}px ${Math.round(px * 0.42)}px ${Math.round(px * 0.1)}px ${Math.round(px * 0.34)}px`,
      borderRadius: `${Math.round(px * 0.36)}px`, color: '#FFFFFF', fontSize: `${px}px`, fontWeight: 700, lineHeight: 1.2,
      backgroundImage: 'linear-gradient(100deg, #7C3AED, #0369A1)',
    }}>
      <svg width={Math.round(px * 0.9)} height={Math.round(px * 0.9)} viewBox="0 0 24 24"><path d={SPARK} fill="#FFFFFF" /></svg>
      <div style={{ display: 'flex' }}>{'AI'}</div>
    </div>
  );
}

function Body({ card }: { card: OgCard }) {
  // 대체 카드 — 종류 제목 + 브랜드만
  if (!card.data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', gap: '16px' }}>
        {card.ticker ? <div style={{ display: 'flex', fontSize: '104px', fontWeight: 700, color: C.title, lineHeight: 1 }}>{card.ticker}</div> : null}
        <div style={{ display: 'flex', fontSize: card.kindName ? '54px' : '84px', fontWeight: 700, color: card.kindName ? C.value : C.accent, lineHeight: 1.15 }}>{card.kindName || 'SIGNUM HQ'}</div>
      </div>
    );
  }
  const hero = !!card.hero;
  // 큰 숫자(hero)가 있는 실적 카드는 줄이 많아 한 단계씩 작게 — 하단 푸터와 겹치지 않게
  const tickerPx = hero ? 80 : 104;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', gap: hero ? '10px' : '14px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
        <div style={{ display: 'flex', fontSize: `${tickerPx}px`, fontWeight: 700, color: C.title, lineHeight: 1 }}>{card.ticker}</div>
        {card.chip ? (
          <div style={{ display: 'flex', fontSize: '26px', fontWeight: 700, color: C.accent, border: `2px solid ${C.accent}`, borderRadius: '999px', padding: '4px 18px' }}>{card.chip}</div>
        ) : null}
        {card.name ? <div style={{ display: 'flex', fontSize: '28px', fontWeight: 700, color: C.value }}>{card.name}</div> : null}
      </div>

      {card.hero ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ display: 'flex', fontSize: '84px', fontWeight: 700, color: C.amber, lineHeight: 1 }}>{card.hero.value}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', fontSize: '30px', fontWeight: 700, color: C.value }}>{card.hero.label}</div>
            {card.hero.note ? <div style={{ display: 'flex', fontSize: '22px', color: C.label }}>{card.hero.note}</div> : null}
          </div>
        </div>
      ) : null}

      {card.headline ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          {card.headlineAi ? <AiBadge px={22} /> : null}
          <div style={{ display: 'flex', maxWidth: card.headlineAi ? '940px' : '1072px', fontSize: hero ? '28px' : '38px', fontWeight: 700, color: C.title, lineHeight: 1.3 }}>{card.headline}</div>
        </div>
      ) : null}

      {card.aiLine ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          {card.aiLine.ai ? <AiBadge px={20} /> : null}
          <div style={{ display: 'flex', maxWidth: card.aiLine.ai ? '950px' : '1072px', fontSize: hero ? '24px' : '26px', color: C.value, lineHeight: 1.35 }}>{card.aiLine.text}</div>
        </div>
      ) : null}

      {card.stats.length > 0 ? (
        <div style={{ display: 'flex', gap: '44px', marginTop: '4px' }}>
          {card.stats.map((s, i) => (
            <div key={`${s.label}-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', fontSize: '18px', color: C.label }}>{s.label}</div>
              <div style={{ display: 'flex', fontSize: hero ? '30px' : '32px', fontWeight: 700, color: C.title }}>{s.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {card.asOf ? <div style={{ display: 'flex', maxWidth: '1072px', fontSize: hero ? '18px' : '20px', color: C.label, lineHeight: 1.25 }}>{card.asOf}</div> : null}
    </div>
  );
}

export default async function ShareCardOg({ params }: { params: Promise<{ locale: string; kind: string; ticker: string }> }) {
  const p = await params;
  const want = toInviteLang(p.locale);
  const parsed = parseLandingParams(p.kind, p.ticker);

  // 데이터와 아이콘은 같이 받는다(아이콘이 안 와도 색 칸으로 대신)
  const [view0, icon] = await Promise.all([
    parsed ? loadLanding(parsed.kind, parsed.ticker, want) : Promise.resolve(null),
    appIcon(),
  ]);
  let card = ogCardOf(view0, want);
  const first = await loadCardFonts(want, ogGlyphs(card), 'Card');
  // 한·일 글꼴을 못 받았으면 영어판으로 다시 그린다 — 카드는 항상 나온다
  if (want !== 'en' && !first.cjk) {
    const viewEn = parsed ? await loadLanding(parsed.kind, parsed.ticker, 'en') : null;
    card = ogCardOf(viewEn, 'en');
  }
  const fonts = first.fonts;

  return new ImageResponse(
    (
      <div style={{
        width: '1200px', height: '630px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        backgroundColor: C.bg, padding: '38px 64px 32px', fontFamily: 'Card, sans-serif',
        backgroundImage: 'radial-gradient(ellipse 80% 70% at 12% 0%, rgba(124,58,237,0.22), transparent 58%), radial-gradient(ellipse 70% 60% at 100% 100%, rgba(3,105,161,0.20), transparent 60%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {icon ? (
              <img src={icon} width={44} height={44} style={{ borderRadius: '10px' }} />
            ) : (
              <div style={{ display: 'flex', width: '44px', height: '44px', borderRadius: '10px', backgroundImage: 'linear-gradient(135deg, #7C3AED, #0369A1)' }} />
            )}
            <div style={{ display: 'flex', fontSize: '24px', fontWeight: 700, letterSpacing: '0.12em', color: C.accent }}>{'SIGNUM HQ'}</div>
          </div>
          {card.data ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {card.aiBadge ? <AiBadge px={22} /> : null}
              <div style={{ display: 'flex', fontSize: '24px', fontWeight: 700, color: C.label }}>{card.kindName}</div>
            </div>
          ) : null}
        </div>

        <Body card={card} />

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '20px', color: C.foot }}>
          <div style={{ display: 'flex' }}>{card.foot}</div>
          <div style={{ display: 'flex' }}>{'signumhq.com'}</div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
