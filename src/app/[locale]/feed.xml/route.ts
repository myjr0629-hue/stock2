// ============================================================================
// /[locale]/feed.xml — Undercurrent RSS 2.0 피드
// ----------------------------------------------------------------------------
// 왜 만들었나 (2026-08-22 실측):
//   /feed.xml · /rss.xml · /atom.xml 전부 404 였다. UC 는 하루 2~3회 에디션을
//   발행하는데 «구독·수집 경로가 0» 이었다는 뜻이다.
//
//   RSS 가 만드는 것 (전부 새 유입):
//     · Feedly / Inoreader 같은 리더에 등록되면 발행할 때마다 도달이 생긴다
//     · 리더 디렉터리 자체가 백링크가 된다 (참조 도메인 2개인 지금 의미가 크다)
//     · 뉴스·AI 크롤러가 정형 피드를 선호한다
//
//   각 항목은 «우리 티커 페이지»로 보낸다(원문 매체가 아니라). 원문으로 보내면
//   트래픽을 남에게 넘기는 꼴이고, 우리 페이지엔 그 종목의 실데이터가 있다.
// ============================================================================
import { publicBase } from '@/lib/net/publicBase';

export const revalidate = 900; // 15분 — 하루 2~3 에디션이면 충분하고 캐시도 산다

type Card = {
  ticker?: string; plainTitle?: string; whyItMatters?: string | null;
  moneyRead?: string | null; divergence?: boolean; source?: string | null;
  publishedAt?: string | null; image?: string | null;
};

const META: Record<string, { title: string; desc: string; lang: string }> = {
  en: {
    title: 'Undercurrent — the money behind the news',
    desc: 'Where news sentiment and institutional money disagree, updated through every US session. Dark pool, options positioning and flow, in plain language.',
    lang: 'en-US',
  },
  ko: {
    title: '언더커런트 — 뉴스 뒤의 돈',
    desc: '뉴스와 기관 자금이 어긋나는 지점을 미국장 세션마다 갱신합니다. 다크풀, 옵션 포지션, 자금 흐름을 쉬운 말로.',
    lang: 'ko-KR',
  },
  ja: {
    title: 'アンダーカレント — ニュースの裏のお金',
    desc: 'ニュースと機関の資金が食い違う地点を米国市場のセッションごとに更新。ダークプール、オプションのポジション、資金フローをやさしい言葉で。',
    lang: 'ja-JP',
  },
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: raw } = await params;
  const locale = ['en', 'ko', 'ja'].includes(raw) ? raw : 'en';
  const m = META[locale];
  const base = publicBase();

  let cards: Card[] = [];
  try {
    const r = await fetch(`${base}/api/undercurrent/feed?locale=${locale}`, {
      next: { revalidate: 900 },
    });
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d?.cards)) cards = d.cards.slice(0, 30);
    }
  } catch {
    /* 피드는 비어도 200 이어야 한다 — 리더가 404 를 만나면 구독을 끊는다 */
  }

  const items = cards.map((c) => {
    // 링크는 «우리» 티커 페이지로. 원문으로 보내면 트래픽을 넘겨주는 꼴이다.
    const link = c.ticker
      ? `${base}/${locale}/flow/${c.ticker}?from=rss`
      : `${base}/${locale}/undercurrent?from=rss`;
    const title = [c.divergence ? '⚡' : '', c.ticker ? `${c.ticker} —` : '', c.plainTitle || '']
      .filter(Boolean).join(' ').trim();
    const body = [c.moneyRead, c.whyItMatters].filter(Boolean).join(' ');
    const date = c.publishedAt ? new Date(c.publishedAt) : new Date();
    return `    <item>
      <title>${esc(title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${esc(link)}</guid>
      <description>${esc(body.slice(0, 600))}</description>
      <pubDate>${date.toUTCString()}</pubDate>
${c.source ? `      <source url="${esc(base)}">${esc(c.source)}</source>\n` : ''}    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(m.title)}</title>
    <link>${esc(`${base}/${locale}/undercurrent`)}</link>
    <description>${esc(m.desc)}</description>
    <language>${m.lang}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${esc(`${base}/${locale}/feed.xml`)}" rel="self" type="application/rss+xml"/>
    <copyright>SIGNUM HQ, LLC</copyright>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=900, stale-while-revalidate=3600',
    },
  });
}
