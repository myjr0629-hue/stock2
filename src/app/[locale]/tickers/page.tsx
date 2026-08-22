// ============================================================================
// /[locale]/tickers — /flow/[ticker] 595개의 «허브» 페이지 (공개, 색인 대상)
// ----------------------------------------------------------------------------
// 왜 만들었나 (2026-08-22 실측):
//   홈페이지에서 /flow/{티커} 로 가는 링크가 «0개», 티커 페이지끼리도 0개였다.
//   (페이지에 있던 링크 4개는 전부 hreflang 자기참조였다)
//   즉 595개 페이지가 사이트맵에만 존재하는 «고아»라 내부 링크 가중치가
//   한 방울도 흐르지 않았다. GSC 평균순위가 10위대에 갇힌 구조적 이유다.
//
// 이 페이지가 하는 일: 595개 전부에 한 홉으로 닿는 링크 허브.
//   크롤 발견성 ↑, 링크 가중치 분배 ↑, 그리고 사람에게도 쓸모있는 색인이다.
//
// 정적(SSG) — 데이터 호출이 없어 항상 빠르고 항상 200이다.
// ============================================================================
import type { Metadata } from 'next';
import { publicBase } from '@/lib/net/publicBase';
import { FLOW_TICKERS } from '@/lib/seo/flowTickers';

export const revalidate = 86400; // 목록은 하루 한 번이면 충분

const LOCALES = ['en', 'ko', 'ja'] as const;
type Loc = (typeof LOCALES)[number];

const L: Record<Loc, {
  title: string; desc: string; h1: string; lead: string;
  count: (n: number) => string; sec: string; back: string; disc: string;
}> = {
  en: {
    title: 'All Tickers — Dark Pool, Max Pain & Options Flow',
    desc: 'Every US ticker we track: dark pool share, max pain, call wall, put floor and options flow. Free, updated through each session.',
    h1: 'All tickers',
    lead: 'Dark pool share, max pain, call wall, put floor and unusual options flow — one page per ticker, refreshed through every US session. Free, no account.',
    count: (n) => `${n} tickers`,
    sec: 'Browse by first letter',
    back: 'Undercurrent — the money behind the news',
    disc: 'Information and education only. Not investment advice and not a recommendation to buy or sell any security.',
  },
  ko: {
    title: '전체 티커 — 다크풀·맥스페인·옵션 플로우',
    desc: '우리가 추적하는 미국주식 전 종목: 다크풀 비중, 맥스페인, 콜월, 풋플로어, 옵션 플로우. 무료, 세션마다 갱신.',
    h1: '전체 티커',
    lead: '다크풀 비중, 맥스페인, 콜월, 풋플로어, 이상 옵션 플로우 — 종목당 한 페이지, 미국장 세션마다 갱신됩니다. 무료, 가입 없이.',
    count: (n) => `${n}개 종목`,
    sec: '첫 글자로 찾기',
    back: '언더커런트 — 뉴스 뒤의 돈',
    disc: '정보 제공·교육 목적입니다. 투자 자문이나 매수·매도 추천이 아닙니다.',
  },
  ja: {
    title: '全ティッカー — ダークプール・マックスペイン・オプションフロー',
    desc: '追跡している米国株の全銘柄：ダークプール比率、マックスペイン、コールウォール、プットフロア、オプションフロー。無料、セッションごとに更新。',
    h1: '全ティッカー',
    lead: 'ダークプール比率、マックスペイン、コールウォール、プットフロア、異常オプションフロー — 銘柄ごとに1ページ、米国市場のセッションごとに更新。無料、登録不要。',
    count: (n) => `${n}銘柄`,
    sec: '頭文字で探す',
    back: 'アンダーカレント — ニュースの裏のお金',
    disc: '情報提供・教育目的です。投資助言や売買推奨ではありません。',
  },
};

const loc = (l: string): Loc => (LOCALES as readonly string[]).includes(l) ? (l as Loc) : 'en';

export async function generateStaticParams() {
  return LOCALES.map((l) => ({ locale: l }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = L[loc(locale)];
  const base = publicBase();
  return {
    title: `${l.title} | SIGNUM HQ`,
    description: l.desc,
    // 스마트앱배너 — 이 허브는 Undercurrent 콘텐츠다. 루트 layout 의 SIGNUM 기본값을 덮는다.
    itunes: { appId: '6788779895' },
    // OG — 없으면 브랜드 기본 이미지가 떠서 «전체 티커 목록»임을 공유 카드가 못 알린다.
    openGraph: {
      images: [`${base}/og-brand.png`],
      title: l.title, description: l.desc,
      url: `${base}/${loc(locale)}/tickers`, type: 'website',
    },
    twitter: { card: 'summary_large_image', title: l.title, description: l.desc, images: [`${base}/og-brand.png`] },
    alternates: {
      canonical: `${base}/${loc(locale)}/tickers`,
      languages: {
        ...Object.fromEntries(LOCALES.map((x) => [x, `${base}/${x}/tickers`])),
        'x-default': `${base}/en/tickers`,
      },
    },
  };
}

export default async function TickersIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const lc = loc(locale);
  const l = L[lc];
  const base = publicBase();

  // 첫 글자로 묶는다 — 595개를 한 덩어리로 뿌리면 사람도 크롤러도 읽기 어렵다.
  const groups = new Map<string, string[]>();
  for (const t of [...FLOW_TICKERS].sort()) {
    const k = t[0];
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  const letters = [...groups.keys()].sort();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: l.title,
    description: l.desc,
    url: `${base}/${lc}/tickers`,
    isPartOf: { '@type': 'WebSite', name: 'SIGNUM HQ', url: base },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: FLOW_TICKERS.length,
      itemListElement: [...FLOW_TICKERS].sort().slice(0, 100).map((t, i) => ({
        '@type': 'ListItem', position: i + 1, name: t, url: `${base}/${lc}/flow/${t}`,
      })),
    },
  };

  const S = {
    wrap: { maxWidth: 900, margin: '0 auto', padding: '32px 20px 64px', fontFamily: 'Pretendard, system-ui, sans-serif', color: '#17191E', lineHeight: 1.6 } as const,
    kicker: { fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#C2410C' },
    h1: { fontSize: 32, fontWeight: 900, margin: '6px 0 6px' },
    lead: { fontSize: 15, color: '#55606B', margin: '0 0 8px', maxWidth: 640 },
    count: { fontSize: 13, color: '#8A939E', fontWeight: 700, margin: '0 0 22px' },
    jump: { display: 'flex', flexWrap: 'wrap' as const, gap: 6, margin: '0 0 26px' },
    jumpA: { display: 'inline-block', minWidth: 30, textAlign: 'center' as const, fontSize: 13, fontWeight: 800, color: '#17191E', textDecoration: 'none', border: '1px solid #E7E3DA', borderRadius: 8, padding: '4px 8px', background: '#FAF8F3' },
    secH: { fontSize: 13, fontWeight: 900, color: '#8A939E', margin: '22px 0 8px', letterSpacing: '0.06em' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 6 } as const,
    cell: { display: 'block', fontSize: 14, fontWeight: 700, color: '#17191E', textDecoration: 'none', border: '1px solid #E7E3DA', borderRadius: 8, padding: '8px 10px', background: '#fff' } as const,
    back: { display: 'inline-block', marginTop: 30, fontSize: 14, fontWeight: 700, color: '#C2410C', textDecoration: 'none' },
    disc: { fontSize: 12, color: '#9AA3AD', marginTop: 26, borderTop: '1px solid #EEE9E0', paddingTop: 14 },
  };

  return (
    <main style={S.wrap}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div style={S.kicker}>SIGNUM HQ · Undercurrent</div>
      <h1 style={S.h1}>{l.h1}</h1>
      <p style={S.lead}>{l.lead}</p>
      <p style={S.count}>{l.count(FLOW_TICKERS.length)}</p>

      <nav style={S.jump} aria-label={l.sec}>
        {letters.map((k) => (
          <a key={k} href={`#g-${k}`} style={S.jumpA}>{k}</a>
        ))}
      </nav>

      {letters.map((k) => (
        <section key={k} id={`g-${k}`}>
          <h2 style={S.secH}>{k}</h2>
          <div style={S.grid}>
            {groups.get(k)!.map((t) => (
              <a key={t} href={`/${lc}/flow/${t}`} style={S.cell}>{t}</a>
            ))}
          </div>
        </section>
      ))}

      <a href={`/${lc}/undercurrent`} style={S.back}>{l.back} →</a>
      <footer style={S.disc}>{l.disc}</footer>
    </main>
  );
}
