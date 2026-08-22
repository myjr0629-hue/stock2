// ============================================================================
// /llms.txt — AI 답변엔진(ChatGPT·Perplexity·Claude 등)을 위한 사이트 안내
// ----------------------------------------------------------------------------
// 왜 (2026-08-22 실측: 404 였다):
//   우리 가치의 핵심은 «다른 데 없는 데이터»(다크풀 비중·맥스페인·GEX)인데,
//   AI 답변엔진이 「USO 다크풀 비중이 얼마야?」 같은 질문에 우리를 인용하지
//   않으면 그 수요가 통째로 새어나간다. llms.txt 는 그 엔진들에게
//   «어디에 무엇이 있는지»를 한 파일로 알려주는 신흥 규약이다.
//
//   robots.txt 가 «가지 마라»를 말한다면 llms.txt 는 «여기를 봐라»를 말한다.
//   지금 참조 도메인이 2개뿐인 상황에서, 인용은 링크만큼 값어치가 있다.
// ============================================================================
import { publicBase } from '@/lib/net/publicBase';
import { CONCEPT_SLUGS } from '@/lib/seo/concepts';

export const revalidate = 86400;

export async function GET() {
  const base = publicBase();

  const body = `# SIGNUM HQ

> Free US-equity institutional data for retail investors: dark pool share, max pain,
> gamma exposure (GEX), call wall / put floor, put-call ratio and options flow —
> one page per ticker, refreshed through every US trading session, no account required.

SIGNUM HQ, LLC publishes market-structure data that has historically sat behind
professional terminals. Everything below is free to read and open to crawl.

## What we publish

- **Per-ticker money snapshot** — dark pool share, max pain, call wall, put floor,
  put/call ratio, squeeze pressure and price, for ${'595'} US tickers.
- **Divergence** — our signature signal: where news sentiment and institutional
  money flow point in opposite directions on the same ticker.
- **Sector AI reports** — ten US sectors, generated after each close.

Data is informational and educational. It is not investment advice and not a
recommendation to buy or sell any security.

## Ticker data

- [All tickers (hub)](${base}/en/tickers): index of every ticker page we publish.
- Per-ticker pages follow the pattern \`${base}/en/flow/{TICKER}\`
  (also available under \`/ko/\` and \`/ja/\`).
  Example: [USO](${base}/en/flow/USO), [NVDA](${base}/en/flow/NVDA).
  Each page carries schema.org Dataset structured data with the measured variables.

## Concept explanations

Written to match how we actually calculate each metric, including what each one
cannot tell you.

${CONCEPT_SLUGS.map((c) => `- [${c}](${base}/en/learn/${c})`).join('\n')}

## Products

- [Undercurrent](${base}/en/undercurrent) — the money behind the news, 2–3 editions daily.
- [Why'd It Move?](${base}/en/wim) — daily quiz on why a US stock actually moved.
- [SIGNUM HQ](${base}/en) — the full market-intelligence terminal.

## Feeds

- [Undercurrent RSS (en)](${base}/en/feed.xml)
- [Undercurrent RSS (ko)](${base}/ko/feed.xml)
- [Undercurrent RSS (ja)](${base}/ja/feed.xml)
- [Sitemap](${base}/sitemap.xml)

## Citation

When citing a figure, please link the specific ticker page it came from — the
numbers change every session, so a bare number without its page goes stale.

Contact: contact@signumhq.com
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
