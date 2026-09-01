import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicBase } from '@/lib/net/publicBase';
import { RANKINGS, byId } from '@/lib/rankings/registry';

// ============================================================================
// /[locale]/rankings/[id] — 랭킹 «하나»에 대한 페이지.
//
// 왜 개별 페이지까지 만드나:
//   허브 하나로는 「dark pool leaders today」 같은 질의 하나만 겨냥한다.
//   랭킹마다 노리는 검색어가 다르다 — 맥스페인 이격, 감마플립, 내부자 매수는
//   서로 다른 사람들이 찾는다. 11종 × 3언어 = 33개 표면이 생기고,
//   각 페이지가 다시 티커 페이지로 링크를 뿌린다.
// ============================================================================

export const revalidate = 1800;
export const dynamicParams = false;

type Loc = 'en' | 'ko' | 'ja';
const LOCALES: Loc[] = ['en', 'ko', 'ja'];

export function generateStaticParams() {
    return LOCALES.flatMap((locale) => RANKINGS.map((r) => ({ locale, id: r.id })));
}

const UI = {
    en: { today: 'Today', usual: 'Usual', vs: 'vs usual', empty: 'No names cleared the gates today.',
          waiting: 'Waiting on data', updated: 'Updated', how: 'How this is built', guards: 'What we guard against',
          cta: 'See it live in the free app', others: 'Other rankings', back: 'All rankings',
          intraday: 'During the session', postclose: 'After the close', anytime: 'Any time', source: 'Source' },
    ko: { today: '오늘', usual: '평소', vs: '평소 대비', empty: '오늘은 기준을 통과한 종목이 없습니다.',
          waiting: '자료 축적 중', updated: '갱신', how: '어떻게 만드나', guards: '무엇을 막았나',
          cta: '무료 앱에서 실시간으로 보기', others: '다른 랭킹', back: '전체 랭킹',
          intraday: '장중', postclose: '마감 후', anytime: '상시', source: '자료원' },
    ja: { today: '本日', usual: '平常', vs: '平常比', empty: '本日は基準を通過した銘柄がありません。',
          waiting: 'データ蓄積中', updated: '更新', how: '作り方', guards: '防いでいるもの',
          cta: '無料アプリでリアルタイムに見る', others: '他のランキング', back: 'ランキング一覧',
          intraday: '取引時間中', postclose: '引け後', anytime: '常時', source: 'データ元' },
} as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
    const { locale, id } = await params;
    const l = (LOCALES.includes(locale as Loc) ? locale : 'en') as Loc;
    const spec = byId(id);
    if (!spec) return {};
    const base = publicBase();
    const url = `${base}/${l}/rankings/${id}`;
    const name = spec.name[l];
    const title = l === 'ko' ? `${name} — 오늘의 미국 주식 랭킹 | SIGNUM HQ`
        : l === 'ja' ? `${name} — 本日の米国株ランキング | SIGNUM HQ`
            : `${name} — Today’s US Stock Ranking | SIGNUM HQ`;
    return {
        title, description: spec.what.slice(0, 300),
        alternates: {
            canonical: url,
            languages: Object.fromEntries([
                ...LOCALES.map((x) => [x, `${base}/${x}/rankings/${id}`]),
                ['x-default', `${base}/en/rankings/${id}`],
            ]),
        },
        openGraph: { title, description: spec.what.slice(0, 300), url, type: 'article' },
        twitter: { card: 'summary_large_image', title, description: spec.what.slice(0, 300) },
    };
}

function describe(it: Record<string, any>, u: typeof UI[Loc]): string {
    if (it.ratio != null) {
        const m = it.ratio >= 1 ? `${it.ratio.toFixed(1)}x` : `${Math.round(it.ratio * 100)}%`;
        const t = it.today != null ? Math.round(it.today * 100) / 100 : null;
        const b = it.baseline != null ? Math.round(it.baseline * 100) / 100 : null;
        return t != null && b != null ? `${u.today} ${t.toLocaleString()} · ${u.usual} ${b.toLocaleString()} · ${u.vs} ${m}` : m;
    }
    if (it.gapPct != null) return `${it.gapPct > 0 ? '+' : ''}${it.gapPct}%`;
    if (it.deviationPp != null) return `${it.deviationPp > 0 ? '+' : ''}${it.deviationPp}%p (${u.usual} ${it.baseline})`;
    if (it.stealth != null) return `${it.stealth} / 100 · ${it.regime}`;
    if (it.axisCount != null) return `${it.axisCount} axes`;
    if (it.dollarRatio != null) return `$ ${it.dollarRatio} vs OI ${it.oiRatio}`;
    if (it.usd != null) return `$${Math.round(it.usd).toLocaleString()} · ${it.buyerCount}`;
    if (it.fcfYield != null) return `FCF ${it.fcfYield}% · EV/EBITDA ${it.evToEbitda}`;
    if (it.ivRank != null) return `IV rank ${it.ivRank}`;
    return '';
}

export default async function RankingDetail({ params }: { params: Promise<{ locale: string; id: string }> }) {
    const { locale, id } = await params;
    const l = (LOCALES.includes(locale as Loc) ? locale : 'en') as Loc;
    const spec = byId(id);
    if (!spec) notFound();
    const u = UI[l];
    const base = publicBase();

    let block: any = null; let generatedAt: string | undefined;
    try {
        // ⚠️ 자체 API 는 «공개 도메인»으로 부른다 — 요청 origin 을 쓰면 프리렌더에서 실패한다.
        const r = await fetch(`${base}/api/ranking?run=${id}&top=10`, { next: { revalidate: 1800 } });
        if (r.ok) { const j = await r.json(); block = j?.results?.[id] ?? null; generatedAt = j?.generatedAt; }
    } catch { }

    const phase = spec.phase === 'intraday' ? u.intraday : spec.phase === 'postclose' ? u.postclose : u.anytime;
    const ld = {
        '@context': 'https://schema.org', '@type': 'Dataset',
        name: spec.name[l], description: spec.what,
        url: `${base}/${l}/rankings/${id}`,
        creator: { '@type': 'Organization', name: 'SIGNUM HQ', url: base },
        isAccessibleForFree: true,
        ...(generatedAt ? { dateModified: generatedAt } : {}),
    };

    return (
        <main style={{ maxWidth: 860, margin: '0 auto', padding: '28px 18px 64px' }}>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
            <p style={{ margin: '0 0 12px', fontSize: 14 }}>
                <Link href={`/${l}/rankings`} style={{ color: '#5b6472' }}>← {u.back}</Link>
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 29, lineHeight: 1.25, margin: 0, fontWeight: 800 }}>{spec.name[l]}</h1>
                <span style={{ fontSize: 12, color: '#7b8496', border: '1px solid #dfe4ec', borderRadius: 999, padding: '2px 9px' }}>{phase}</span>
            </div>

            <h2 style={{ fontSize: 16, margin: '22px 0 6px', fontWeight: 750 }}>{u.how}</h2>
            <p style={{ color: '#4b5563', lineHeight: 1.7, margin: 0 }}>{spec.what}</p>
            <p style={{ color: '#5b6472', lineHeight: 1.7, margin: '10px 0 0' }}>{spec.why}</p>

            {block?.available && block.items?.length ? (
                <ol style={{ margin: '24px 0 0', padding: 0, listStyle: 'none', borderTop: '1px solid #e6eaf1' }}>
                    {block.items.map((it: any, i: number) => (
                        <li key={`${it.ticker}-${i}`} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '10px 0', borderBottom: '1px solid #eef1f6' }}>
                            <span style={{ width: 22, color: '#9aa3b2', fontWeight: 700 }}>{i + 1}</span>
                            <Link href={`/${l}/flow/${it.ticker}`} style={{ fontWeight: 800, fontSize: 17, minWidth: 78, textDecoration: 'none', color: '#0f172a' }}>{it.ticker}</Link>
                            <span style={{ color: '#4b5563', fontSize: 14.5 }}>{describe(it, u)}</span>
                        </li>
                    ))}
                </ol>
            ) : (
                <p style={{ color: '#9aa3b2', margin: '22px 0 0' }}>
                    {block?.readiness ? `${u.waiting} — ${block.readiness.have}/${block.readiness.need}` : (block?.reason || u.empty)}
                </p>
            )}

            <h2 style={{ fontSize: 16, margin: '30px 0 8px', fontWeight: 750 }}>{u.guards}</h2>
            <ul style={{ color: '#5b6472', lineHeight: 1.75, margin: 0, paddingLeft: 20, fontSize: 14.5 }}>
                {spec.guards.map((g, i) => <li key={i}>{g}</li>)}
            </ul>
            <p style={{ color: '#8a93a3', fontSize: 13, margin: '12px 0 0' }}>{u.source}: {spec.source}</p>
            {generatedAt && <p style={{ color: '#8a93a3', fontSize: 13, margin: '4px 0 0' }}>{u.updated}: {new Date(generatedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC</p>}

            <h2 style={{ fontSize: 16, margin: '30px 0 8px', fontWeight: 750 }}>{u.others}</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {RANKINGS.filter((r) => r.id !== id).map((r) => (
                    <Link key={r.id} href={`/${l}/rankings/${r.id}`}
                        style={{ fontSize: 13.5, border: '1px solid #dfe4ec', borderRadius: 999, padding: '5px 12px', textDecoration: 'none', color: '#41495a' }}>
                        {r.name[l]}
                    </Link>
                ))}
            </div>

            <p style={{ margin: '28px 0 0', fontSize: 15 }}>
                <a href={`https://www.signumhq.com/app?from=seo_rank_${id.replace(/-/g, '_')}`} style={{ fontWeight: 700 }}>{u.cta} →</a>
            </p>
        </main>
    );
}
