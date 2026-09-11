import { NextRequest, NextResponse } from 'next/server';
import { requireMktAdmin, appendAudit, etDate } from '@/lib/marketing-console/mkt';
import { getFromCache, setInCache } from '@/services/redisClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// Cold-start metrics. `?from=` hits are auto (once /app patch lands); the rest
// are manual entry for the first weeks (X analytics / store reconciliation).
const KEY_MANUAL = 'mkt:metrics:manual';
const KEY_HITS = (from: string) => `mkt:attr:hit:${from}:${etDate()}`;

interface ManualStats {
  weekOf: string;
  impressions?: number;
  profileClicks?: number;
  followerDelta?: number;
  installs?: number;
  repliesPosted?: number;
  updatedAt: number;
}

// ★ 여기 없는 태그는 «세어지지 않는다». 실제로 붙이는 태그와 반드시 일치시킬 것.
//   (2026-08-26: 하루 12건을 붙이고 나서 보니 x_us·x_jp·seo 가 목록에 없어 전부 미집계였다.)
//   정본 규약은 .agent/marketing/ATTRIBUTION-TAGS.md.
const CHANNELS = [
  'x_us', 'x_jp',            // X 답글 — 계정별로 나눠야 어느 시장이 먹히는지 보인다
  'stocktwits',              // 종목 게시판
  'reddit',                  // r/Daytrading Software Sunday 등
  'seo',                     // /{locale}/flow/{ticker} 1,785 페이지에 이미 붙어 있다
  'ph',                      // Product Hunt
  'note',                    // note.com (일본)
  'x_en', 'x_ja', 'bsky', 'stwits', // 자동 파이프라인(autopilot.ts landingFor)이 쓰는 태그
  'x_kr', // 2026-08-26: 계정 국적(JP)과 무관하게 한국어 청중을 겨냥한 답글에 쓴다.
          // «어느 계정으로 올렸나»가 아니라 «어느 시장을 겨냥했나»로 태그한다.
  'x_bio', 'x_reply', 'toss', // 기존 태그 — 과거 데이터 보존용

  // ★ 2026-09-10 추가. 또 같은 함정에 빠졌다 —
  //   quora·linkedin·bluesky_post 로 하루치 링크를 붙여 놓고 보니 이 배열에 없었다.
  //   («클릭은 Redis 에 쌓이는데 화면엔 0» 이라 «효과 없음» 으로 오독하게 된다.)
  //   Redis 클라이언트에 SCAN 이 없어 자동 발견이 안 되므로 **여기가 정본 목록이다.**
  //   새 채널에 링크를 붙이기 «전에» 이 배열과 .agent/marketing/ATTRIBUTION-TAGS.md 를 먼저 고친다.
  'quora',                   // Quora Space (SIGNUM HQ — US Stock Market Intelligence)
  'linkedin',                // LinkedIn /in/signumhq
  'bluesky_post', 'bluesky_bio', // Bluesky (기존 자동 파이프라인은 'bsky' 를 쓴다 — 둘 다 센다)
  'medium',                  // Medium @signum_hq
  'threads',                 // Threads @signumhq_official
  'ig_bio',                  // Instagram 프로필 링크(모바일에서만 편집 가능)
  'pinterest',               // Pinterest (⚠️ 핀 설명에서 `?from=` 이 잘린 전례가 있다)
  'tiktok',                  // TikTok @signumhq
  'youtube',                 // YouTube 설명란

  // ★ 2026-09-12 추가. 또 걸렸다 — 세 번째다.
  //   레딧 프로필·인디해커 등재·GitHub awesome 목록에 이미 링크를 붙여 놓고 보니 없었다.
  'reddit_bio',              // u/SignumHQ 프로필 소셜 링크 (댓글엔 링크 금지 서브가 많다 →
                             //   가치 댓글로 프로필 방문을 만들고 «여기»서 전환시킨다)
  'indiehackers',            // indiehackers.com/product/signum-hq + 프로필 3앱
  'github_gex',              // awesome-options-analytics (GEX > Tools) PR
  'reddit_sp',               // r/SideProject 정식 글 — 자기홍보가 «허용»되는 서브라
                             //   댓글과 달리 본문에 링크를 넣을 수 있다(83.6만 회원)
];

export async function GET() {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;

  const manual = (await getFromCache<ManualStats>(KEY_MANUAL)) || null;
  const hitEntries = await Promise.all(
    CHANNELS.map(async (c) => [c, (await getFromCache<number>(KEY_HITS(c))) || 0] as const)
  );
  const hits = Object.fromEntries(hitEntries);
  return NextResponse.json({ ok: true, manual, hits, etDate: etDate() });
}

export async function POST(req: NextRequest) {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;

  let body: Partial<ManualStats>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const stats: ManualStats = {
    weekOf: etDate(),
    impressions: Number(body.impressions) || 0,
    profileClicks: Number(body.profileClicks) || 0,
    followerDelta: Number(body.followerDelta) || 0,
    installs: Number(body.installs) || 0,
    repliesPosted: Number(body.repliesPosted) || 0,
    updatedAt: Date.now(),
  };
  await setInCache(KEY_MANUAL, stats);
  await appendAudit(gate.admin.email, 'metrics-manual', `week ${stats.weekOf}`);
  return NextResponse.json({ ok: true, manual: stats });
}
