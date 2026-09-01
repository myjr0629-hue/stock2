import type { Metadata } from 'next';
import Link from 'next/link';
import { publicBase } from '@/lib/net/publicBase';

// ============================================================================
// /[locale]/rankings — 랭킹 엔진의 «공개 표면».
//
// 왜 만드는가 (2026-09-01):
//   랭킹 11종을 만들어 놓고 API 에만 두면 검색엔진은 존재를 모른다. 이건
//   우리가 가진 것 중 «남이 못 만드는» 유일한 콘텐츠다 — 평소 대비 이탈,
//   은밀 축적, 실적 없는 IV 상승 같은 건 어디에도 없다.
//
//   그리고 이 페이지는 티커 3,585개 페이지로 내부 링크를 뿌린다. 매일 값이
//   바뀌므로 «신선한 허브»가 되고, 거기서 나가는 링크가 개별 티커 페이지의
//   발견·평가를 돕는다. (색인 531/960 이던 상황에서 이게 필요하다.)
//
// ⚠️ 자체 API 를 부를 때는 «공개 도메인»을 쓴다 — 요청 origin 을 쓰면
//    크론·프리렌더 시점에 보호된 내부 주소로 나가 실패한다.
// ============================================================================

export const revalidate = 1800;          // 30분 — 장중에도 적당히 신선하게

type Loc = 'en' | 'ko' | 'ja';

const COPY = {
    en: {
        h1: 'Today’s Market Rankings — What Broke From Normal',
        title: 'Unusual Options Activity & Dark Pool Rankings Today | SIGNUM HQ',
        desc: 'Daily rankings built from options flow and FINRA off-exchange data: what deviated from its own normal, max pain gaps, gamma flip proximity, stealth accumulation and insider open-market buys.',
        lead: 'Not the biggest — the furthest from their own normal. Every ranking below compares a stock against its own recent history, because absolute size just re-ranks the mega caps every day.',
        today: 'Today', usual: 'Usual', multiple: 'vs usual', empty: 'No names cleared the gates today.',
        waiting: 'Waiting on data', updated: 'Updated', method: 'How these are built',
        cta: 'See it live in the free app', ticker: 'Ticker',
        intraday: 'During the session', postclose: 'After the close', anytime: 'Any time',
    },
    ko: {
        h1: '오늘의 시장 랭킹 — 평소와 달라진 것',
        title: '오늘의 이상 옵션·다크풀 랭킹 | SIGNUM HQ',
        desc: '옵션 자금 흐름과 FINRA 장외 데이터로 매일 만드는 랭킹 — 평소 대비 이탈, 맥스페인 이격, 감마플립 근접, 은밀 축적, 내부자 장내 매수.',
        lead: '가장 큰 종목이 아니라 «자기 평소»에서 가장 멀어진 종목입니다. 절대 크기로 줄 세우면 매일 같은 대형주만 나옵니다.',
        today: '오늘', usual: '평소', multiple: '평소 대비', empty: '오늘은 기준을 통과한 종목이 없습니다.',
        waiting: '자료 축적 중', updated: '갱신', method: '어떻게 만드나',
        cta: '무료 앱에서 실시간으로 보기', ticker: '종목',
        intraday: '장중', postclose: '마감 후', anytime: '상시',
    },
    ja: {
        h1: '本日のマーケットランキング — 平常から外れた銘柄',
        title: '本日の異常オプション・ダークプール ランキング | SIGNUM HQ',
        desc: 'オプション資金フローとFINRA取引所外データから毎日作るランキング — 平常からの乖離、マックスペイン乖離、ガンマフリップ接近、静かな買い集め、インサイダーの市場内買い。',
        lead: '大きい銘柄ではなく«その銘柄の平常»から最も外れた銘柄です。絶対値で並べると毎日同じ大型株になります。',
        today: '本日', usual: '平常', multiple: '平常比', empty: '本日は基準を通過した銘柄がありません。',
        waiting: 'データ蓄積中', updated: '更新', method: '作り方',
        cta: '無料アプリでリアルタイムに見る', ticker: '銘柄',
        intraday: '取引時間中', postclose: '引け後', anytime: '常時',
    },
} as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const l = (['en', 'ko', 'ja'].includes(locale) ? locale : 'en') as Loc;
    const c = COPY[l];
    const base = publicBase();
    const url = `${base}/${l}/rankings`;
    return {
        title: c.title, description: c.desc,
        alternates: {
            canonical: url,
            languages: {
                en: `${base}/en/rankings`, ko: `${base}/ko/rankings`, ja: `${base}/ja/rankings`,
                'x-default': `${base}/en/rankings`,
            },
        },
        openGraph: { title: c.title, description: c.desc, url, type: 'website' },
        twitter: { card: 'summary_large_image', title: c.title, description: c.desc },
    };
}

type Item = Record<string, any>;
type Block = { available: boolean; phase?: string; name?: Record<string, string>; what?: string; why?: string; items?: Item[]; reason?: string; readiness?: any };

async function load(): Promise<{ results: Record<string, Block>; generatedAt?: string; darkPool?: any } | null> {
    try {
        const r = await fetch(`${publicBase()}/api/ranking?run=all&top=5`, { next: { revalidate: 1800 } });
        if (!r.ok) return null;
        return await r.json();
    } catch { return null; }
}

/** 값 한 줄을 사람이 읽는 형태로. 랭킹마다 필드가 다르므로 여기서 흡수한다. */
function describe(it: Item, c: typeof COPY[Loc]): string {
    if (it.ratio != null) {
        const m = it.ratio >= 1 ? `${it.ratio.toFixed(1)}x` : `${Math.round(it.ratio * 100)}%`;
        const t = it.today != null ? Math.round(it.today * 100) / 100 : null;
        const b = it.baseline != null ? Math.round(it.baseline * 100) / 100 : null;
        return t != null && b != null ? `${c.today} ${t.toLocaleString()} · ${c.usual} ${b.toLocaleString()} · ${c.multiple} ${m}` : m;
    }
    if (it.gapPct != null) return `${it.gapPct > 0 ? '+' : ''}${it.gapPct}%`;
    if (it.deviationPp != null) return `${it.deviationPp > 0 ? '+' : ''}${it.deviationPp}%p (${c.usual} ${it.baseline})`;
    if (it.stealth != null) return `${it.stealth} / 100 · ${it.regime}`;
    if (it.axisCount != null) return `${it.axisCount} axes`;
    if (it.dollarRatio != null) return `$ ${it.dollarRatio} vs OI ${it.oiRatio}`;
    if (it.usd != null) return `$${Math.round(it.usd).toLocaleString()} · ${it.buyerCount}`;
    if (it.fcfYield != null) return `FCF ${it.fcfYield}% · EV/EBITDA ${it.evToEbitda}`;
    if (it.ivRank != null) return `IV rank ${it.ivRank}`;
    return '';
}

export default async function RankingsPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const l = (['en', 'ko', 'ja'].includes(locale) ? locale : 'en') as Loc;
    const c = COPY[l];
    const data = await load();
    const blocks = Object.entries(data?.results || {});
    const phaseLabel = (p?: string) => (p === 'intraday' ? c.intraday : p === 'postclose' ? c.postclose : c.anytime);

    // 구조화 데이터 — Dataset. creator 에 @type 을 «인라인»으로 넣어야 유효하다.
    const ld = {
        '@context': 'https://schema.org', '@type': 'Dataset',
        name: c.h1, description: c.desc,
        url: `${publicBase()}/${l}/rankings`,
        creator: { '@type': 'Organization', name: 'SIGNUM HQ', url: publicBase() },
        isAccessibleForFree: true,
        ...(data?.generatedAt ? { dateModified: data.generatedAt } : {}),
    };

    return (
        <main style={{ maxWidth: 940, margin: '0 auto', padding: '28px 18px 64px' }}>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
            <h1 style={{ fontSize: 30, lineHeight: 1.25, margin: '0 0 10px', fontWeight: 800 }}>{c.h1}</h1>
            <p style={{ color: '#5b6472', margin: '0 0 8px', lineHeight: 1.6 }}>{c.lead}</p>
            {data?.generatedAt && (
                <p style={{ color: '#8a93a3', fontSize: 13, margin: '0 0 26px' }}>
                    {c.updated}: {new Date(data.generatedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC
                </p>
            )}

            {blocks.map(([id, b]) => (
                <section key={id} style={{ margin: '0 0 30px', border: '1px solid #e3e8ef', borderRadius: 14, padding: '18px 18px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                        <h2 style={{ fontSize: 19, margin: 0, fontWeight: 750 }}>{b.name?.[l] || id}</h2>
                        <span style={{ fontSize: 12, color: '#7b8496', border: '1px solid #dfe4ec', borderRadius: 999, padding: '2px 9px' }}>
                            {phaseLabel(b.phase)}
                        </span>
                    </div>
                    {b.what && <p style={{ color: '#5b6472', fontSize: 14, lineHeight: 1.65, margin: '8px 0 0' }}>{b.what}</p>}
                    {b.why && <p style={{ color: '#78818f', fontSize: 13.5, lineHeight: 1.65, margin: '6px 0 12px' }}>{b.why}</p>}

                    {b.available && b.items?.length ? (
                        <ol style={{ margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
                            {b.items.map((it, i) => (
                                <li key={`${id}-${it.ticker}-${i}`} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '9px 0', borderTop: '1px solid #eef1f6' }}>
                                    <span style={{ width: 20, color: '#9aa3b2', fontWeight: 700, fontSize: 14 }}>{i + 1}</span>
                                    {/* 티커 페이지로 내부 링크 — 이 허브가 3,585개 페이지의 발견을 돕는다 */}
                                    <Link href={`/${l}/flow/${it.ticker}`} style={{ fontWeight: 800, fontSize: 16, minWidth: 74, textDecoration: 'none', color: '#0f172a' }}>
                                        {it.ticker}
                                    </Link>
                                    <span style={{ color: '#4b5563', fontSize: 14 }}>{describe(it, c)}</span>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <p style={{ color: '#9aa3b2', fontSize: 13.5, margin: '10px 0 0' }}>
                            {b.readiness ? `${c.waiting} — ${b.readiness.have}/${b.readiness.need}` : (b.reason || c.empty)}
                        </p>
                    )}
                </section>
            ))}

            <p style={{ margin: '28px 0 0', fontSize: 15 }}>
                <a href="https://www.signumhq.com/app?from=seo_rankings" style={{ fontWeight: 700 }}>{c.cta} →</a>
            </p>
        </main>
    );
}
