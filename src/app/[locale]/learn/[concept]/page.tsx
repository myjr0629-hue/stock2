// ============================================================================
// /[locale]/learn/[concept] — 개념 설명 페이지 (공개, 색인 대상)
// ----------------------------------------------------------------------------
// 왜 (2026-08-22 Bing Keyword Research 실측):
//   `dark pool` 3개월 527노출. 상위 10위가 Investopedia·Wikipedia·FINRA 같은
//   «설명 콘텐츠» + Unusual Whales·Cheddar Flow 같은 경쟁 도구였는데,
//   우리는 이 층에 페이지가 하나도 없었다.
//
// 두 가지 일을 한다:
//   ① 정보성 질의(dark pool, max pain, gamma exposure …)에서 자리를 잡는다
//   ② 595개 티커 페이지가 여기로 링크하는 «개념 허브» — 링크 그래프를 한 층 더 만든다
//
// 정적(SSG). 데이터 호출이 없어 항상 200이고 항상 빠르다.
// ============================================================================
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { publicBase } from '@/lib/net/publicBase';
import { CONCEPTS, CONCEPT_SLUGS, type ConceptSlug } from '@/lib/seo/concepts';

export const revalidate = 86400;

const LOCALES = ['en', 'ko', 'ja'] as const;
type Loc = (typeof LOCALES)[number];
const loc = (l: string): Loc => (LOCALES as readonly string[]).includes(l) ? (l as Loc) : 'en';
const isSlug = (s: string): s is ConceptSlug => (CONCEPT_SLUGS as readonly string[]).includes(s);

const UI: Record<Loc, { back: string; more: string; tickers: string; disc: string; leaders: string; flowLeaders: string }> = {
  en: {
    back: 'All concepts',
    more: 'Related',
    tickers: 'See this on a live ticker',
    leaders: 'Today’s off-exchange leaders — the whole market, ranked',
    flowLeaders: 'Today’s biggest new options positions — the whole market, ranked',
    disc: 'Information and education only. Not investment advice and not a recommendation to buy or sell any security.',
  },
  ko: {
    back: '전체 개념',
    more: '관련 개념',
    tickers: '실제 종목에서 보기',
    leaders: '오늘의 장외 상위 종목 — 시장 전체 순위',
    flowLeaders: '오늘 새로 열린 옵션 포지션 상위 — 시장 전체 순위',
    disc: '정보 제공·교육 목적입니다. 투자 자문이나 매수·매도 추천이 아닙니다.',
  },
  ja: {
    back: 'すべての概念',
    more: '関連する概念',
    tickers: '実際の銘柄で見る',
    leaders: '今日の場外上位銘柄 — 市場全体のランキング',
    flowLeaders: '今日の新規オプション建玉の上位 — 市場全体のランキング',
    disc: '情報提供・教育目的です。投資助言や売買推奨ではありません。',
  },
};

export async function generateStaticParams() {
  return LOCALES.flatMap((l) => CONCEPT_SLUGS.map((c) => ({ locale: l, concept: c })));
}

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string; concept: string }> },
): Promise<Metadata> {
  const { locale, concept } = await params;
  if (!isSlug(concept)) return {};
  const lc = loc(locale);
  const c = CONCEPTS[lc][concept];
  const base = publicBase();
  return {
    title: `${c.title} | SIGNUM HQ`,
    description: c.desc,
    // 이 층은 Undercurrent 콘텐츠다 — 루트 layout 의 SIGNUM 기본값을 덮는다.
    itunes: { appId: '6788779895' },
    alternates: {
      canonical: `${base}/${lc}/learn/${concept}`,
      languages: {
        ...Object.fromEntries(LOCALES.map((x) => [x, `${base}/${x}/learn/${concept}`])),
        'x-default': `${base}/en/learn/${concept}`,
      },
    },
    openGraph: { title: c.title, description: c.desc, url: `${base}/${lc}/learn/${concept}`, type: 'article', images: [`${base}/og-brand.png`] },
    twitter: { card: 'summary_large_image', title: c.title, description: c.desc, images: [`${base}/og-brand.png`] },
  };
}

export default async function ConceptPage(
  { params }: { params: Promise<{ locale: string; concept: string }> },
) {
  const { locale, concept } = await params;
  if (!isSlug(concept)) notFound();
  const lc = loc(locale);
  const c = CONCEPTS[lc][concept];
  const t = UI[lc];
  const base = publicBase();
  const url = `${base}/${lc}/learn/${concept}`;

  const jsonLd = [
    {
      '@context': 'https://schema.org', '@type': 'Article', '@id': `${url}#article`,
      headline: c.h1, description: c.desc, url, inLanguage: lc,
      articleSection: 'Investing education',
      publisher: { '@type': 'Organization', name: 'SIGNUM HQ', url: base },
      isAccessibleForFree: true,
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'SIGNUM HQ', item: `${base}/${lc}` },
        { '@type': 'ListItem', position: 2, name: t.back, item: `${base}/${lc}/learn` },
        { '@type': 'ListItem', position: 3, name: c.h1, item: url },
      ],
    },
  ];

  const S = {
    wrap: { maxWidth: 720, margin: '0 auto', padding: '32px 20px 64px', fontFamily: 'Pretendard, system-ui, sans-serif', color: '#17191E', lineHeight: 1.68 } as const,
    kicker: { fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#C2410C' },
    h1: { fontSize: 32, fontWeight: 900, margin: '6px 0 12px', letterSpacing: '-0.02em' },
    lead: { fontSize: 17, color: '#3A424C', margin: '0 0 30px' },
    h2: { fontSize: 19, fontWeight: 850 as any, margin: '30px 0 8px' },
    p: { fontSize: 16, color: '#3A424C', margin: 0 },
    ctaBox: { margin: '34px 0 0', padding: '16px 18px', background: '#FAF8F3', border: '1px solid #E7E3DA', borderRadius: 14 } as const,
    cta: { display: 'block', textAlign: 'center' as const, background: '#17191E', color: '#fff', textDecoration: 'none', fontWeight: 800, borderRadius: 12, padding: '13px 16px' },
    relH: { fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#8A939E', margin: '30px 0 8px' },
    relA: { display: 'block', fontSize: 15, fontWeight: 700, color: '#17191E', textDecoration: 'none', borderTop: '1px solid #EEE9E0', padding: '11px 0' },
    back: { display: 'inline-block', marginTop: 26, fontSize: 14, fontWeight: 700, color: '#C2410C', textDecoration: 'none' },
    disc: { fontSize: 12, color: '#9AA3AD', marginTop: 26, borderTop: '1px solid #EEE9E0', paddingTop: 14 },
  };

  return (
    <main style={S.wrap}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div style={S.kicker}>SIGNUM HQ · {t.back}</div>
      <h1 style={S.h1}>{c.h1}</h1>
      <p style={S.lead}>{c.lead}</p>

      {c.sections.map((s) => (
        <section key={s.h}>
          <h2 style={S.h2}>{s.h}</h2>
          <p style={S.p}>{s.p}</p>
        </section>
      ))}

      <div style={S.ctaBox}>
        {/* 다크풀 개념을 읽고 온 사람에게 「오늘 실제로 그런 종목」을 바로 준다.
            순위표는 이 개념 페이지의 자연스러운 다음 단계다. */}
        {concept === 'dark-pool' && (
          <a href={`/${lc}/dark-pool`} style={S.cta}>{t.leaders} →</a>
        )}
        {concept === 'options-flow' && (
          <a href={`/${lc}/options-flow`} style={S.cta}>{t.flowLeaders} →</a>
        )}
        <a href={`/${lc}/tickers`} style={S.cta}>{t.tickers} →</a>
      </div>

      <div style={S.relH}>{t.more}</div>
      {c.related.map((r) => (
        <a key={r} href={`/${lc}/learn/${r}`} style={S.relA}>
          {CONCEPTS[lc][r as ConceptSlug].h1} →
        </a>
      ))}

      <a href={`/${lc}/learn`} style={S.back}>← {t.back}</a>
      <footer style={S.disc}>{t.disc}</footer>
    </main>
  );
}
