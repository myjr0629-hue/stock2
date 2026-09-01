import type { MetadataRoute } from 'next';
import { publicBase } from '@/lib/net/publicBase';
import { FLOW_TICKERS } from '@/lib/seo/flowTickers';
import { CONCEPT_SLUGS } from '@/lib/seo/concepts';

// Programmatic sitemap. Starts with a curated set of high-search tickers for the
// /flow/[ticker] pages (expand later toward the full universe). Without this, Google
// had no way to discover these pages. `new Date()` is fine here (server route, not a
// workflow script). x-default + per-locale URLs help Google pick the right language.
const LOCALES = ['en', 'ko', 'ja'] as const;
// 랭킹 상세 11종 — 각각 노리는 검색어가 다르다(맥스페인 이격 / 감마플립 /
// 내부자 매수는 서로 다른 사람이 찾는다). 등록부에서 직접 읽어 «표류»를 막는다.
import { RANKINGS as RANKING_SPECS } from '@/lib/rankings/registry';
const RANKING_IDS = RANKING_SPECS.map((r) => r.id);

// ⛔ 2026-08-20: '/wim' 이 빠져 있었다. 라이브 200 인데 sitemap 에 없어 3개 로케일 전부
//    검색엔진에 «존재하지 않는» 페이지였다. /app·/app-uc·/app-wim 은 404(리다이렉트 전용)라 넣지 않는다.
// '/tickers' = 595 티커 페이지의 허브. 이게 없으면 티커 페이지는 «고아»다.
const STATIC_PATHS = ['', '/undercurrent', '/wim', '/how-it-works', '/pricing', '/tickers', '/learn'];
// 개념 설명 6종 — 정보성 질의(dark pool, max pain …)를 겨냥하고,
// 동시에 595 티커 페이지가 링크하는 «개념 허브» 로 링크 그래프를 한 층 더 만든다.
const LEARN_PATHS = CONCEPT_SLUGS.map((c) => `/learn/${c}`);

// 티커 목록은 단일 진실원천에서 가져온다 (허브 페이지·상호링크와 공유)


/**
 * ⚠️ lastmod 를 «요청 시각»으로 주면 안 된다.
 *
 *   예전에는 모든 URL 이 `lastModified: now` 였다. 그러면 구글이 매번
 *   「전부 방금 바뀌었다」는 신호를 받는데, 그건 사실이 아니므로 구글은
 *   **lastmod 를 통째로 무시한다**(공식 문서: 신뢰할 수 없으면 쓰지 않는다).
 *   즉 재크롤 신호가 있으나 마나였다.
 *
 *   지금은 «실제로 그 페이지 내용이 바뀐 날»을 준다:
 *     · 티커 페이지 → 시장 데이터 기준일(전 거래일)
 *     · 정적/개념   → 실제로 고친 날(상수. 고칠 때 같이 올린다)
 */
const STATIC_LASTMOD = new Date('2026-08-31T00:00:00Z');  // 다크풀 복원으로 전 페이지 내용 변경

/** 마지막 미국 거래일(주말 보정). 데이터는 T+1 이므로 «전 거래일»이 기준이다. */
function lastSessionDate(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  // 미 동부 기준 자정 이후에도 당일 마감 데이터는 아직 없다 → 하루 뒤로
  d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicBase();
  const session = lastSessionDate();
  const entries: MetadataRoute.Sitemap = [];

  for (const loc of LOCALES) {
    for (const p of STATIC_PATHS) {
      entries.push({
        url: `${base}/${loc}${p}`,
        lastModified: p === '' ? session : STATIC_LASTMOD,
        changeFrequency: p === '' ? 'daily' : 'weekly',
        priority: p === '' ? 0.9 : 0.6,
      });
    }
    // /rankings — 랭킹 11종 허브. 매일 값이 바뀌고, 여기서 티커 페이지로
    // 내부 링크가 나간다(3,585개의 발견을 돕는다).
    entries.push({
      url: `${base}/${loc}/rankings`,
      lastModified: session,
      changeFrequency: 'daily',
      priority: 0.9,
    });
    for (const rid of RANKING_IDS) {
      entries.push({
        url: `${base}/${loc}/rankings/${rid}`,
        lastModified: session,
        changeFrequency: 'daily',
        priority: 0.8,
      });
    }
    // 다크풀 순위표는 «매 거래일 값이 바뀌는 허브»다. 정적 상수 날짜를 주면
    // 구글에 「안 바뀐다」고 거짓말하는 셈이 된다 — 실제 거래일을 준다.
    for (const hub of ['/dark-pool', '/options-flow']) {
      entries.push({
        url: `${base}/${loc}${hub}`,
        lastModified: session,
        changeFrequency: 'daily',
        priority: 0.9,
      });
    }
    for (const p of LEARN_PATHS) {
      entries.push({ url: `${base}/${loc}${p}`, lastModified: STATIC_LASTMOD, changeFrequency: 'monthly', priority: 0.5 });
    }
    for (const t of FLOW_TICKERS) {
      entries.push({
        url: `${base}/${loc}/flow/${t}`,
        // 티커 페이지는 매 거래일 «실제로» 값이 바뀐다 — 그 날짜를 준다
        lastModified: session,
        changeFrequency: 'daily',
        priority: 0.7,
      });
    }
  }

  return entries;
}
