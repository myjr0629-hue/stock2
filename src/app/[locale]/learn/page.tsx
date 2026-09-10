// ============================================================================
// /[locale]/learn — 개념 설명 6종의 인덱스 (공개, 색인 대상)
// 티커 페이지 → 여기 → 개별 개념 → 다시 /tickers 로 링크가 순환한다.
// ============================================================================
import type { Metadata } from 'next';
import { publicBase } from '@/lib/net/publicBase';
import { CONCEPTS, CONCEPT_SLUGS, type ConceptSlug } from '@/lib/seo/concepts';

export const revalidate = 86400;

const LOCALES = ['en', 'ko', 'ja'] as const;
type Loc = (typeof LOCALES)[number];
const loc = (l: string): Loc => (LOCALES as readonly string[]).includes(l) ? (l as Loc) : 'en';

const UI: Record<Loc, { title: string; desc: string; h1: string; lead: string; tickers: string; disc: string; appCta: string; appNote: string }> = {
  en: {
    title: 'Learn — Dark Pool, Max Pain, Gamma & Options Flow',
    desc: 'Plain-language explanations of the institutional data we publish: dark pool volume, max pain, gamma exposure, call wall, put/call ratio and options flow.',
    h1: 'Learn the numbers',
    lead: 'Six concepts that explain what institutions are doing — written the way we actually calculate them, including what each one cannot tell you.',
    tickers: 'See all of it on a live ticker',
    appCta: 'Free app — our AI reads the whole chain',
    appNote: 'iOS and Android. Every concept here, live on real tickers.',
    disc: 'Information and education only. Not investment advice and not a recommendation to buy or sell any security.',
  },
  ko: {
    title: '개념 — 다크풀·맥스페인·감마·옵션 플로우',
    desc: '우리가 공개하는 기관 데이터를 쉬운 말로 설명합니다: 다크풀 비중, 맥스페인, 감마 노출, 콜월, 풋콜 비율, 옵션 플로우.',
    h1: '숫자를 읽는 법',
    lead: '기관이 무엇을 하는지 설명하는 여섯 개념 — 우리가 «실제로 계산하는 방식»으로, 각 지표가 알려주지 «못하는» 것까지 함께.',
    tickers: '실제 종목에서 전부 보기',
    appCta: '무료 앱 — AI가 체인 전체를 읽습니다',
    appNote: 'iOS·안드로이드. 여기 개념 전부를 실제 종목에서 실시간으로.',
    disc: '정보 제공·교육 목적입니다. 투자 자문이나 매수·매도 추천이 아닙니다.',
  },
  ja: {
    title: '基礎知識 — ダークプール・マックスペイン・ガンマ・オプションフロー',
    desc: '当社が公開する機関データをやさしい言葉で解説します：ダークプール比率、マックスペイン、ガンマエクスポージャー、コールウォール、プットコールレシオ、オプションフロー。',
    h1: '数字の読み方',
    lead: '機関投資家が何をしているかを説明する6つの概念 — 当社が「実際に計算している方法」で、各指標が示せ「ない」ことまで含めて。',
    tickers: '実際の銘柄ですべて見る',
    appCta: '無料アプリ — AIがチェーン全体を読みます',
    appNote: 'iOS・Android。ここの概念すべてを実銘柄でリアルタイムに。',
    disc: '情報提供・教育目的です。投資助言や売買推奨ではありません。',
  },
};

export async function generateStaticParams() {
  return LOCALES.map((l) => ({ locale: l }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const lc = loc(locale);
  const t = UI[lc];
  const base = publicBase();
  return {
    title: `${t.title} | SIGNUM HQ`,
    description: t.desc,
    itunes: { appId: '6788779895' },
    alternates: {
      canonical: `${base}/${lc}/learn`,
      languages: {
        ...Object.fromEntries(LOCALES.map((x) => [x, `${base}/${x}/learn`])),
        'x-default': `${base}/en/learn`,
      },
    },
    openGraph: { title: t.title, description: t.desc, url: `${base}/${lc}/learn`, type: 'website', images: [`${base}/og-brand.png`] },
    twitter: { card: 'summary_large_image', title: t.title, description: t.desc, images: [`${base}/og-brand.png`] },
  };
}

export default async function LearnIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const lc = loc(locale);
  const t = UI[lc];
  const base = publicBase();

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    name: t.title, description: t.desc, url: `${base}/${lc}/learn`,
    isPartOf: { '@type': 'WebSite', name: 'SIGNUM HQ', url: base },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: CONCEPT_SLUGS.length,
      itemListElement: CONCEPT_SLUGS.map((s, i) => ({
        '@type': 'ListItem', position: i + 1,
        name: CONCEPTS[lc][s as ConceptSlug].h1,
        url: `${base}/${lc}/learn/${s}`,
      })),
    },
  };

  const S = {
    wrap: { maxWidth: 720, margin: '0 auto', padding: '32px 20px 64px', fontFamily: 'Pretendard, system-ui, sans-serif', color: '#17191E', lineHeight: 1.68 } as const,
    kicker: { fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#C2410C' },
    h1: { fontSize: 32, fontWeight: 900, margin: '6px 0 10px', letterSpacing: '-0.02em' },
    lead: { fontSize: 16, color: '#55606B', margin: '0 0 28px' },
    card: { display: 'block', textDecoration: 'none', border: '1px solid #E7E3DA', borderRadius: 12, padding: '15px 17px', marginBottom: 9, background: '#fff' } as const,
    cardH: { fontSize: 17, fontWeight: 850 as any, color: '#17191E', margin: 0 },
    cardP: { fontSize: 14, color: '#55606B', margin: '5px 0 0' },
    cta: { display: 'block', textAlign: 'center' as const, background: '#17191E', color: '#fff', textDecoration: 'none', fontWeight: 800, borderRadius: 12, padding: '13px 16px', marginTop: 26 },
    ctaBox: { marginTop: 26, display: 'flex', flexDirection: 'column', gap: 8 } as const,
    cta2: { display: 'block', textAlign: 'center' as const, background: '#fff', color: '#17191E', textDecoration: 'none', fontWeight: 750 as any, borderRadius: 12, padding: '12px 16px', border: '1px solid #DED9CE' },
    appNote: { fontSize: 12, color: '#7C848E', textAlign: 'center' as const, margin: 0 },
    disc: { fontSize: 12, color: '#9AA3AD', marginTop: 26, borderTop: '1px solid #EEE9E0', paddingTop: 14 },
  };

  return (
    <main style={S.wrap}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={S.kicker}>SIGNUM HQ</div>
      <h1 style={S.h1}>{t.h1}</h1>
      <p style={S.lead}>{t.lead}</p>

      {CONCEPT_SLUGS.map((s) => {
        const c = CONCEPTS[lc][s as ConceptSlug];
        return (
          <a key={s} href={`/${lc}/learn/${s}`} style={S.card}>
            <div style={S.cardH}>{c.h1}</div>
            <p style={S.cardP}>{c.lead.slice(0, 110)}…</p>
          </a>
        );
      })}

      {/* ★ 개념 허브에도 앱 링크가 없었다. 스마트링크를 «첫 번째»로 둔다 —
          내부 웹 경로로만 보내면 페이지뷰만 늘고 설치가 안 는다. */}
      <div style={S.ctaBox}>
        <a style={{ ...S.cta, marginTop: 0 }} href={`${base}/app?from=seo_learn_hub`} rel="noopener">{t.appCta} →</a>
        <p style={S.appNote}>{t.appNote}</p>
        <a href={`/${lc}/tickers`} style={S.cta2}>{t.tickers} →</a>
      </div>
      <footer style={S.disc}>{t.disc}</footer>
    </main>
  );
}
