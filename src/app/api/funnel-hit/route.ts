import { NextRequest, NextResponse, after } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { PREVIEW_BOT_RE } from '@/lib/marketing/linkPreview';
import {
  isFunnelStage, isFunnelSrc, isFunnelPlatform, normalizeVersion, normalizeCode, funnelNs, funnelKeys, etDay,
} from '@/lib/app/funnelSchema';

// ============================================================================
// /api/funnel-hit — 구독 퍼널 비콘 (2026-09-30, 브랜치 growth/funnel-metrics)
// ----------------------------------------------------------------------------
//   클라이언트: src/lib/app/funnel.ts 가 navigator.sendBeacon 으로 POST(본문 없음, 값은 쿼리).
//   ?st=<단계>&s=<출처>&p=<플랫폼>&v=<앱 버전>[&c=<오류 코드>]  — 전부 닫힌 목록(funnelSchema.ts), 모르면 버린다.
//
// ★ 저장: EC2 레디스 전용(fx:·fxp: 는 복제 정책 밖) — Upstash 명령 0. 하루 합계 숫자만, 45일 보존.
// ★ 싣지 않는 것: IP·기기 식별자·사용자 ID. 요청 헤더는 봇 판정·출처 확인에만 쓰고 저장하지 않는다.
// ★ 프리뷰·로컬은 fxp: 로 쓴다(운영과 같은 레디스 — 운영 숫자를 오염시키지 않게).
// ★ 응답은 항상 204 — 집계가 실패해도 화면·결제에 아무 영향이 없다(쓰기는 응답 뒤 after()).
// 패턴 출처: feat/share-loop 의 /api/share-hit(같은 방식·같은 보존 기간).
// ============================================================================

const TTL = 60 * 60 * 24 * 45;

async function bump(key: string): Promise<void> {
  const cur = (await getFromCache<number>(key)) || 0;
  await setInCache(key, cur + 1, TTL);
}

/** 한 키에 모은 분해표({"a|b|c": n})에 1 을 더한다. 필드 수 상한 — 이상한 값이 쌓여도 키가 무한히 커지지 않게. */
async function bumpField(key: string, field: string): Promise<void> {
  const cur = await getFromCache<Record<string, number>>(key);
  const next: Record<string, number> = cur && typeof cur === 'object' && !Array.isArray(cur) ? { ...cur } : {};
  if (!(field in next) && Object.keys(next).length >= 400) return;
  next[field] = (Number(next[field]) || 0) + 1;
  await setInCache(key, next, TTL);
}

/** 다른 사이트가 우리 숫자를 부풀리지 못하게 — 오리진이 있으면 우리 것이어야 한다(없으면 네이티브·구형 허용). */
function originOk(req: NextRequest): boolean {
  const o = req.headers.get('origin');
  if (!o || o === 'null') return true;
  try {
    const h = new URL(o).hostname;
    return h === 'signumhq.com' || h.endsWith('.signumhq.com') || h.endsWith('.vercel.app') || h === 'localhost'
      || o.startsWith('capacitor://') || o.startsWith('ionic://');
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const st = q.get('st');
  const s = q.get('s');
  const p = q.get('p');
  const ua = req.headers.get('user-agent') || '';
  if (isFunnelStage(st) && isFunnelSrc(s) && isFunnelPlatform(p) && !PREVIEW_BOT_RE.test(ua) && originOk(req)) {
    const v = normalizeVersion(q.get('v'));
    const c = q.get('c') ? normalizeCode(q.get('c')) : null;
    const day = etDay();
    const k = funnelKeys(funnelNs(process.env.VERCEL_ENV), day, st, s, p);
    after(async () => {
      try {
        await bump(k.main);
        await bumpField(k.ver, `${st}|${p}|${v}`);
        if (c) await bumpField(k.code, `${st}|${p}|${c}`);
      } catch { /* 집계 실패는 삼킨다 */ }
    });
  }
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
