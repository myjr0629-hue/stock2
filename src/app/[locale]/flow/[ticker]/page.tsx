// ============================================================================
// /[locale]/flow/[ticker] — programmatic SEO/GEO page (public, indexable).
// One page per ticker: the money snapshot (dark pool, max pain, option walls) +
// where the news and the money diverge. Unique proprietary data per page = clears
// Google's "scaled content" bar; structured data feeds LLM answer engines. Funnels
// to the apps via ?from=seo. ISR (hourly) → self-updating, zero daily human.
// Does NOT touch the mobile apps or the app-view UI — a separate discovery surface.
// ============================================================================
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { publicBase } from '@/lib/net/publicBase';

export const revalidate = 3600; // ISR: refresh at most hourly
export const dynamicParams = true;

const TICKER_RE = /^[A-Z]{1,6}$/;

interface Money {
  darkPoolPct: number | null; oiPcr: number | null; volumePcr: number | null;
  squeezeScore: number | null; maxPain: number | null; callWall: number | null;
  putFloor: number | null; price: number | null;
}
interface Card {
  plainTitle: string; whyItMatters: string | null; moneyRead: string | null;
  moneyMood: string; divergence: boolean; source: string | null; url: string | null;
}
interface TickerData {
  success: boolean; ticker: string; money: Money; hasMoneyData: boolean;
  tickerRead: string | null; cards: Card[];
}

async function getData(locale: string, ticker: string): Promise<TickerData | null> {
  if (!TICKER_RE.test(ticker)) return null;
  try {
    const r = await fetch(
      `${publicBase()}/api/undercurrent/ticker?t=${ticker}&locale=${locale}`,
      { next: { revalidate: 3600 } },
    );
    if (!r.ok) return null;
    const d = await r.json();
    if (!d?.success) return null;
    return d as TickerData;
  } catch { return null; }
}

type Strings = {
  kicker: string; sub: (t: string) => string; money: string; read: string; news: string;
  divergence: string; whatT: string; whatB: string; glossT: string; gloss: [string, string][];
  ctaT: string; ctaUc: string; ctaSg: string; disc: string;
  lbl: Record<string, string>;
};
const L: Record<string, Strings> = {
  en: {
    kicker: 'Money-flow snapshot',
    sub: (t) => `What the institutional money is doing on ${t} right now — dark pool, options positioning, and where the news and the money disagree. Free.`,
    money: 'The money right now', read: 'What it means', news: 'News vs the money', divergence: 'DIVERGENCE',
    whatT: 'What is a “divergence”?',
    whatB: 'A divergence is when the news narrative and the institutional money flow point in opposite directions — a bearish headline while large call premium is bought, or heavy dark-pool selling under a bullish story. It signals the crowd and the desks may disagree.',
    glossT: 'How to read these numbers',
    gloss: [
      ['Dark-pool volume', 'The share of trading done off-exchange, where institutions move size quietly. Well above ~40% means big players are active.'],
      ['Max pain', 'The price where the most options expire worthless — positioning often gravitates toward it near expiry.'],
      ['Call wall / Put floor', 'Strikes with the heaviest call/put open interest — they often act as short-term resistance and support.'],
      ['Put/Call ratio', 'Below ~0.7 leans bullish (more calls); above ~1 leans defensive (more puts).'],
    ],
    ctaT: 'See it live, free', ctaUc: 'Get Undercurrent — the news behind the money',
    ctaSg: 'Or go deeper with SIGNUM HQ — the pro options terminal',
    disc: 'Data, scores and interpretations are for information and education only — not investment advice or a buy/sell recommendation. All decisions and outcomes are your own.',
    lbl: { darkPool: 'Dark-pool volume', maxPain: 'Max pain', callWall: 'Call wall', putFloor: 'Put floor', price: 'Price', pcr: 'Put/Call ratio', squeeze: 'Squeeze pressure' },
  },
  ko: {
    kicker: '수급 스냅샷',
    sub: (t) => `지금 ${t}에 기관의 돈이 무엇을 하고 있나 — 다크풀·옵션 포지셔닝, 그리고 뉴스와 돈이 어긋나는 지점. 무료.`,
    money: '지금 돈은', read: '무슨 의미인가', news: '뉴스 vs 돈', divergence: '괴리',
    whatT: '“괴리(divergence)”란?',
    whatB: '괴리는 뉴스의 서사와 기관 자금 흐름이 반대를 가리킬 때입니다 — 약세 헤드라인인데 대규모 콜 프리미엄이 매수되거나, 강세 스토리 밑에서 다크풀 매도가 몰릴 때. 대중과 데스크가 엇갈릴 수 있다는 신호죠.',
    glossT: '이 숫자 읽는 법',
    gloss: [
      ['다크풀 비중', '거래소 밖(장외)에서 일어난 거래 비율. 기관이 조용히 물량을 움직이는 곳. ~40% 훨씬 위면 큰손 활발.'],
      ['맥스페인', '가장 많은 옵션이 소멸하는 가격. 만기 근처엔 포지셔닝이 이쪽으로 끌리곤 함.'],
      ['콜월 / 풋플로어', '콜/풋 미결제약정이 가장 두꺼운 행사가 — 단기 저항/지지로 작용하곤 함.'],
      ['풋/콜 비율', '~0.7 아래는 강세(콜 우세), ~1 위는 방어적(풋 우세).'],
    ],
    ctaT: '실시간으로 무료로 보기', ctaUc: 'Undercurrent 받기 — 뉴스 뒤의 돈',
    ctaSg: '또는 SIGNUM HQ로 더 깊이 — 프로 옵션 터미널',
    disc: '데이터·점수·해석은 정보·교육용이며 투자자문이나 매수/매도 권유가 아닙니다. 모든 판단과 결과의 책임은 본인에게 있습니다.',
    lbl: { darkPool: '다크풀 비중', maxPain: '맥스페인', callWall: '콜월', putFloor: '풋플로어', price: '현재가', pcr: '풋/콜 비율', squeeze: '스퀴즈 압력' },
  },
  ja: {
    kicker: '資金フロー・スナップショット',
    sub: (t) => `いま${t}に機関のお金が何をしているか — ダークプール・オプション建玉、そしてニュースとお金が食い違うポイント。無料。`,
    money: 'いまのお金', read: 'どういう意味か', news: 'ニュース vs お金', divergence: '乖離',
    whatT: '「乖離(divergence)」とは？',
    whatB: '乖離とは、ニュースの物語と機関の資金フローが逆を向くこと — 弱気の見出しなのに大口のコールプレミアムが買われる、強気の話の裏でダークプール売りが集まる、など。大衆とデスクが食い違うサインです。',
    glossT: 'この数字の読み方',
    gloss: [
      ['ダークプール比率', '取引所外で行われた取引の割合。機関が静かに大口を動かす場所。~40%を大きく超えると大口が活発。'],
      ['マックスペイン', '最も多くのオプションが無価値で満期を迎える価格。満期近くは建玉がここに引き寄せられがち。'],
      ['コールウォール / プットフロア', 'コール/プット建玉が最も厚い権利行使価格 — 短期の抵抗/支持として働きがち。'],
      ['プット/コール比', '~0.7未満は強気(コール優勢)、~1超は守勢(プット優勢)。'],
    ],
    ctaT: 'リアルタイムで無料で見る', ctaUc: 'Undercurrentを入手 — ニュースの裏側のお金',
    ctaSg: 'またはSIGNUM HQでさらに深く — プロ向けオプション端末',
    disc: 'データ・スコア・解釈は情報・教育目的であり、投資助言や売買推奨ではありません。すべての判断と結果は利用者ご自身の責任です。',
    lbl: { darkPool: 'ダークプール比率', maxPain: 'マックスペイン', callWall: 'コールウォール', putFloor: 'プットフロア', price: '現在値', pcr: 'プット/コール比', squeeze: 'スクイーズ圧力' },
  },
};

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string; ticker: string }> },
): Promise<Metadata> {
  const { locale, ticker: raw } = await params;
  const ticker = (raw || '').toUpperCase();
  const l = L[locale] ?? L.en;
  const base = publicBase();
  const data = await getData(locale, ticker);
  const div = data?.cards?.some((c) => c.divergence);
  const title = `${ticker} — dark pool, max pain & options flow${div ? ' (divergence)' : ''} | Undercurrent`;
  const desc = (data?.tickerRead || l.sub(ticker)).slice(0, 200);
  const m = data?.money;
  const og = new URLSearchParams({ ticker, priceLabel: 'PRICE' });
  if (m?.price) og.set('price', String(m.price));
  if (m?.callWall) og.set('callWall', String(m.callWall));
  if (m?.maxPain) og.set('maxPain', String(m.maxPain));
  if (m?.putFloor) og.set('putFloor', String(m.putFloor));
  const ogUrl = `${base}/api/og/level?${og.toString()}`;
  const url = `${base}/${locale}/flow/${ticker}`;
  return {
    title, description: desc,
    alternates: {
      canonical: url,
      languages: { en: `${base}/en/flow/${ticker}`, ko: `${base}/ko/flow/${ticker}`, ja: `${base}/ja/flow/${ticker}` },
    },
    openGraph: { title, description: desc, url, images: [ogUrl], type: 'article' },
    twitter: { card: 'summary_large_image', title, description: desc, images: [ogUrl] },
  };
}

const money$ = (v: number | null) => (v == null ? null : `$${Math.round(v).toLocaleString()}`);

export default async function FlowTickerPage(
  { params }: { params: Promise<{ locale: string; ticker: string }> },
) {
  const { locale, ticker: raw } = await params;
  const ticker = (raw || '').toUpperCase();
  if (!TICKER_RE.test(ticker)) notFound();
  const data = await getData(locale, ticker);
  if (!data) notFound();
  const l = L[locale] ?? L.en;
  const m = data.money || ({} as Money);
  const cards = (data.cards || []).filter((c) => c.plainTitle);
  const pcr = m.oiPcr ?? m.volumePcr;

  const metrics: [string, string][] = [];
  if (m.price != null) metrics.push([l.lbl.price, money$(m.price)!]);
  if (m.darkPoolPct != null) metrics.push([l.lbl.darkPool, `${Math.round(m.darkPoolPct)}%`]);
  if (m.maxPain != null) metrics.push([l.lbl.maxPain, money$(m.maxPain)!]);
  if (m.callWall != null) metrics.push([l.lbl.callWall, money$(m.callWall)!]);
  if (m.putFloor != null) metrics.push([l.lbl.putFloor, money$(m.putFloor)!]);
  if (pcr != null) metrics.push([l.lbl.pcr, pcr.toFixed(2)]);
  if (m.squeezeScore != null) metrics.push([l.lbl.squeeze, String(Math.round(m.squeezeScore))]);

  // JSON-LD FAQ from the real data — rich results + LLM extraction
  const faq: { q: string; a: string }[] = [];
  if (m.darkPoolPct != null) faq.push({ q: `What is ${ticker}'s dark-pool activity?`, a: `${ticker}'s dark-pool volume is about ${Math.round(m.darkPoolPct)}%.` });
  if (m.maxPain != null) faq.push({ q: `Where is ${ticker}'s max pain?`, a: `${ticker}'s max pain is around ${money$(m.maxPain)}.` });
  if (m.callWall != null || m.putFloor != null) faq.push({ q: `What are ${ticker}'s option walls?`, a: `${[m.callWall != null ? `call wall ${money$(m.callWall)}` : '', m.putFloor != null ? `put floor ${money$(m.putFloor)}` : ''].filter(Boolean).join(', ')}.` });
  const jsonLd = faq.length
    ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }
    : null;

  const S = {
    wrap: { maxWidth: 720, margin: '0 auto', padding: '32px 20px 64px', fontFamily: 'Pretendard, system-ui, sans-serif', color: '#17191E', lineHeight: 1.6 } as const,
    kicker: { fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#C2410C' },
    h1: { fontSize: 30, fontWeight: 900, margin: '6px 0 4px' },
    sub: { fontSize: 15, color: '#55606B', margin: '0 0 24px' },
    sec: { fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#8A939E', margin: '28px 0 10px' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 } as const,
    cell: { border: '1px solid #E7E3DA', borderRadius: 12, padding: '12px 14px', background: '#FAF8F3' } as const,
    cellLbl: { fontSize: 12, color: '#8A939E', fontWeight: 700 },
    cellVal: { fontSize: 20, fontWeight: 850 as any, fontVariantNumeric: 'tabular-nums' as const },
    read: { fontSize: 15, background: '#F3F5F4', border: '1px solid #E1E7E4', borderRadius: 12, padding: '14px 16px', margin: '12px 0 0' },
    card: { border: '1px solid #E7E3DA', borderRadius: 12, padding: '14px 16px', marginBottom: 10 } as const,
    divTag: { fontSize: 11, fontWeight: 900, color: '#C2410C', background: '#FCEEE4', border: '1px solid #F3D3BC', borderRadius: 6, padding: '2px 6px', marginRight: 8 },
    cta: { display: 'block', textAlign: 'center' as const, background: '#17191E', color: '#fff', textDecoration: 'none', fontWeight: 800, borderRadius: 12, padding: '14px 16px', margin: '10px 0' },
    cta2: { display: 'block', textAlign: 'center' as const, color: '#55606B', textDecoration: 'none', fontWeight: 700, fontSize: 14, padding: '6px' },
    disc: { fontSize: 12, color: '#9AA3AD', marginTop: 28, borderTop: '1px solid #EEE9E0', paddingTop: 14 },
    gloss: { fontSize: 14, marginBottom: 10 },
  };

  return (
    <main style={S.wrap}>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}

      <div style={S.kicker}>Undercurrent · {l.kicker}</div>
      <h1 style={S.h1}>{ticker} — {l.money}</h1>
      <p style={S.sub}>{l.sub(ticker)}</p>

      {metrics.length > 0 && (
        <section>
          <div style={S.sec}>{l.money}</div>
          <div style={S.grid}>
            {metrics.map(([k, v]) => (
              <div key={k} style={S.cell}>
                <div style={S.cellLbl}>{k}</div>
                <div style={S.cellVal}>{v}</div>
              </div>
            ))}
          </div>
          {data.tickerRead && <div style={S.read}><strong>{l.read}: </strong>{data.tickerRead}</div>}
        </section>
      )}

      {cards.length > 0 && (
        <section>
          <div style={S.sec}>{l.news}</div>
          {cards.map((c, i) => (
            <article key={i} style={S.card}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>
                {c.divergence && <span style={S.divTag}>⚡ {l.divergence}</span>}
                {c.plainTitle}
              </h2>
              {c.moneyRead && <p style={{ fontSize: 14, color: '#55606B', margin: '6px 0 0' }}>{c.moneyRead}</p>}
              {c.source && <div style={{ fontSize: 12, color: '#9AA3AD', marginTop: 6 }}>{c.source}</div>}
            </article>
          ))}
        </section>
      )}

      <section style={{ margin: '28px 0', padding: '16px 18px', background: '#FAF8F3', border: '1px solid #E7E3DA', borderRadius: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 900, textAlign: 'center', marginBottom: 10 }}>{l.ctaT}</div>
        <a href="https://www.signumhq.com/app-uc?from=seo" style={S.cta} rel="noopener">{l.ctaUc} →</a>
        <a href="https://www.signumhq.com/app?from=seo" style={S.cta2} rel="noopener">{l.ctaSg} →</a>
      </section>

      <section>
        <div style={S.sec}>{l.whatT}</div>
        <p style={{ fontSize: 15, color: '#3A424C' }}>{l.whatB}</p>
        <div style={S.sec}>{l.glossT}</div>
        {l.gloss.map(([term, def]) => (
          <p key={term} style={S.gloss}><strong>{term}</strong> — <span style={{ color: '#55606B' }}>{def}</span></p>
        ))}
      </section>

      <footer style={S.disc}>{l.disc}</footer>
    </main>
  );
}
