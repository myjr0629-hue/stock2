import type { Metadata } from 'next';
import Link from 'next/link';
import { ShareLanding } from '@/components/share/ShareLanding';
import { readShareQuery } from '@/lib/share/shareQuery';
import { notFound } from 'next/navigation';
import { publicBase } from '@/lib/net/publicBase';
import { RANKINGS, byId, specCopy } from '@/lib/rankings/registry';
import { loadRankingSnapshot, describeItem, emptyText } from '@/lib/rankings/present';

// ============================================================================
// /[locale]/rankings/[id] — 랭킹 «하나»에 대한 페이지.
//
// 왜 개별 페이지까지 만드나:
//   허브 하나로는 「dark pool leaders today」 같은 질의 하나만 겨냥한다.
//   랭킹마다 노리는 검색어가 다르다 — 맥스페인 이격, 감마플립, 내부자 매수는
//   서로 다른 사람들이 찾는다. 11종 × 3언어 = 33개 표면이 생기고,
//   각 페이지가 다시 티커 페이지로 링크를 뿌린다.
// ============================================================================

// (layout 이 headers() 를 읽어 매 요청 동적 렌더다 — 자료의 신선도는 present.ts 의 공용 스냅샷이 정한다)
export const revalidate = 1800;
export const dynamicParams = false;

type Loc = 'en' | 'ko' | 'ja';
const LOCALES: Loc[] = ['en', 'ko', 'ja'];

export function generateStaticParams() {
    return LOCALES.flatMap((locale) => RANKINGS.map((r) => ({ locale, id: r.id })));
}

const UI = {
    en: { empty: 'No names cleared the gates today.',
          waiting: 'Waiting on data', updated: 'Updated', how: 'How this is built', guards: 'What we guard against',
          cta: 'See it live in the free app', others: 'Other rankings', back: 'All rankings',
          intraday: 'During the session', postclose: 'After the close', anytime: 'Any time', source: 'Source' },
    ko: { empty: '오늘은 기준을 통과한 종목이 없습니다.',
          waiting: '자료 축적 중', updated: '갱신', how: '어떻게 만드나', guards: '무엇을 막았나',
          cta: '무료 앱에서 실시간으로 보기', others: '다른 랭킹', back: '전체 랭킹',
          intraday: '장중', postclose: '마감 후', anytime: '상시', source: '자료원' },
    ja: { empty: '本日は基準を通過した銘柄がありません。',
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
    // ⚠️ 2026-09-28: 여기 spec.what(한국어 원문)이 그대로 들어가 /en·/ja 22장의 메타 설명·OG 가 한국어였다.
    const description = specCopy(spec, l).what.slice(0, 300);
    return {
        title, description,
        alternates: {
            canonical: url,
            languages: Object.fromEntries([
                ...LOCALES.map((x) => [x, `${base}/${x}/rankings/${id}`]),
                ['x-default', `${base}/en/rankings/${id}`],
            ]),
        },
        openGraph: { title, description, url, type: 'article' },
        twitter: { card: 'summary_large_image', title, description },
    };
}

export default async function RankingDetail({ params }: { params: Promise<{ locale: string; id: string }> }) {
    const { locale, id } = await params;
    const l = (LOCALES.includes(locale as Loc) ? locale : 'en') as Loc;
    const spec = byId(id);
    if (!spec) notFound();
    const u = UI[l];
    const c = specCopy(spec, l);
    const base = publicBase();

    // 허브·상세 36장이 함께 쓰는 한 스냅샷(present.ts 참조) — URL 마다 따로 낡지 않게
    const snap = await loadRankingSnapshot();
    const block: any = snap?.results?.[id] ?? null;
    const generatedAt: string | undefined = snap?.generatedAt;

    const phase = spec.phase === 'intraday' ? u.intraday : spec.phase === 'postclose' ? u.postclose : u.anytime;
    const ld = {
        '@context': 'https://schema.org', '@type': 'Dataset',
        name: spec.name[l], description: c.what,
        url: `${base}/${l}/rankings/${id}`,
        creator: { '@type': 'Organization', name: 'SIGNUM HQ', url: base },
        isAccessibleForFree: true,
        ...(generatedAt ? { dateModified: generatedAt } : {}),
    };

    // 공유 링크(?from=share, 2026-09-29 공유 루프)로 온 «그 요청»에만: 맨 위 설치 카드 + 아래 CTA 태그를
    // share 로(기존 집계 mkt:attr:hit:share). 일반 방문자는 그대로 seo_rank_<id>.
    // 쿼리는 미들웨어의 x-url 로 읽는다 — 시그니처를 건드리지 않아 대기 중인 fix/seo-fresh-numbers 와 안 겹친다.
    const share = await readShareQuery();

    return (
        <main style={{ maxWidth: 860, margin: '0 auto', padding: '28px 18px 64px' }}>
            {share.fromShare && <ShareLanding app="signum" surface="rank" locale={l} via={share.via} variant="card" />}
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
            <p style={{ margin: '0 0 12px', fontSize: 14 }}>
                <Link href={`/${l}/rankings`} style={{ color: '#5b6472' }}>← {u.back}</Link>
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 29, lineHeight: 1.25, margin: 0, fontWeight: 800 }}>{spec.name[l]}</h1>
                <span style={{ fontSize: 12, color: '#7b8496', border: '1px solid #dfe4ec', borderRadius: 999, padding: '2px 9px' }}>{phase}</span>
            </div>

            <h2 style={{ fontSize: 16, margin: '22px 0 6px', fontWeight: 750 }}>{u.how}</h2>
            <p style={{ color: '#4b5563', lineHeight: 1.7, margin: 0 }}>{c.what}</p>
            <p style={{ color: '#5b6472', lineHeight: 1.7, margin: '10px 0 0' }}>{c.why}</p>

            {block?.available && block.items?.length ? (
                <ol style={{ margin: '24px 0 0', padding: 0, listStyle: 'none', borderTop: '1px solid #e6eaf1' }}>
                    {block.items.slice(0, 10).map((it: any, i: number) => (
                        <li key={`${it.ticker}-${i}`} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '10px 0', borderBottom: '1px solid #eef1f6' }}>
                            <span style={{ width: 22, color: '#9aa3b2', fontWeight: 700 }}>{i + 1}</span>
                            <Link href={`/${l}/flow/${it.ticker}`} style={{ fontWeight: 800, fontSize: 17, minWidth: 78, textDecoration: 'none', color: '#0f172a' }}>{it.ticker}</Link>
                            <span style={{ color: '#4b5563', fontSize: 14.5 }}>{describeItem(it, l)}</span>
                        </li>
                    ))}
                </ol>
            ) : (
                <p style={{ color: '#9aa3b2', margin: '22px 0 0' }}>{emptyText(block, l, u.waiting, u.empty)}</p>
            )}

            <h2 style={{ fontSize: 16, margin: '30px 0 8px', fontWeight: 750 }}>{u.guards}</h2>
            <ul style={{ color: '#5b6472', lineHeight: 1.75, margin: 0, paddingLeft: 20, fontSize: 14.5 }}>
                {c.guards.map((g, i) => <li key={i}>{g}</li>)}
            </ul>
            <p style={{ color: '#8a93a3', fontSize: 13, margin: '12px 0 0' }}>{u.source}: {c.source}</p>
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
                <a href={`https://www.signumhq.com/app?from=${share.fromShare ? `share&l=${l}` : `seo_rank_${id.replace(/-/g, '_')}`}`} style={{ fontWeight: 700 }}>{u.cta} →</a>
            </p>
        </main>
    );
}
