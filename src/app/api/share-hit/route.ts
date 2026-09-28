import { NextRequest, NextResponse, after } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { PREVIEW_BOT_RE } from '@/lib/marketing/linkPreview';

// ============================================================================
// /api/share-hit — 공유 루프 퍼널 비콘 (2026-09-29, 브랜치 feat/share-loop)
// ----------------------------------------------------------------------------
//   tap   앱에서 공유 버튼을 누름          (보낸 쪽, via = 보낸 쪽 플랫폼)
//   sent  시스템 공유 시트 완료 또는 링크 복사
//   open  받은 사람이 ?from=share 페이지를 엶(자바스크립트가 돈 «사람»만 — 미리보기 봇 제외)
//   click 그 페이지의 앱 받기 버튼을 누름   (→ /app?from=share 가 기존 집계로 또 센다)
//
// ★ 저장소: EC2 레디스(ElastiCache) 전용. 키 접두사 `share:` 는 redisClient 의 복제 정책
//   (REPLICATE_PREFIXES·UPSTASH_ONLY_PREFIXES) 어디에도 없어 TTL 쓰기는 EC2 에만 가고,
//   EC2 가 정상 응답한 미스는 Upstash 를 읽지 않는다 → Upstash 명령 0(프록시 장애 때만 폴백).
//   scripts/test-redis-policy.ts 가 이 결정을 고정한다.
// ★ 키 공간은 닫혀 있다: 4 이벤트 × 4 표면 × 4 플랫폼 × 날짜. 모르는 값은 버린다.
// ★ 프리뷰·로컬은 운영과 같은 레디스를 쓴다 → 운영 숫자를 오염시키지 않게 `share:probe:` 로 쓴다.
// 응답은 항상 204 — 집계가 실패해도 화면·이동에 아무 영향이 없다.
// ============================================================================

const EVENTS = new Set(['tap', 'sent', 'open', 'click']);
const SURFACES = new Set(['ticker', 'rank', 'uc', 'wim']);
const VIAS = new Set(['ios', 'android', 'web', 'na']);

// ET 날짜 — /app 의 etDate()·mkt.ts 와 같은 형식(YYYY-MM-DD, America/New_York).
function etDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

async function bump(key: string): Promise<void> {
  const current = (await getFromCache<number>(key)) || 0;
  await setInCache(key, current + 1, 60 * 60 * 24 * 45); // 45일 — mkt:attr 와 같은 보존
}

/** 다른 사이트가 우리 숫자를 부풀리지 못하게 — 오리진이 있으면 우리 것이어야 한다(없으면 네이티브·구형 허용). */
function originOk(req: NextRequest): boolean {
  const o = req.headers.get('origin');
  if (!o || o === 'null') return true;
  try {
    const h = new URL(o).hostname;
    return h === 'signumhq.com' || h.endsWith('.signumhq.com') || h.endsWith('.vercel.app') || h === 'localhost';
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const e = q.get('e') || '';
  const s = q.get('s') || '';
  const v = q.get('v') || 'na';
  const ua = req.headers.get('user-agent') || '';
  if (EVENTS.has(e) && SURFACES.has(s) && VIAS.has(v) && !PREVIEW_BOT_RE.test(ua) && originOk(req)) {
    const ns = process.env.VERCEL_ENV === 'production' ? 'share' : 'share:probe';
    after(async () => {
      try { await bump(`${ns}:${e}:${s}:${v}:${etDate()}`); } catch { /* 집계 실패는 삼킨다 */ }
    });
  }
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
