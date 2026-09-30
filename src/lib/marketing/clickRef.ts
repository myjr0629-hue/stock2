// ============================================================================
// 스마트링크 클릭의 «어디서 왔나» — /app · /app-uc · /app-wim 공용 (2026-09-30)
// ----------------------------------------------------------------------------
// 기존 클릭 카운터(mkt:attr:hit:<from>:…)는 «어느 링크»만 안다. 폰 클릭의 절반인 from=home 은
// 홈에 오기 «전» 어디서 왔는지가 핵심인데, 버튼을 누를 때의 Referer 는 우리 홈 자신이다.
// 그래서: ① 링크에 ?ref=<분류>(홈이 방문 순간의 document.referrer 로 붙인다)가 있으면 그것,
//        ② 없으면 Referer 헤더의 호스트를 분류한다(소셜 게시물 링크 등).
//
// 키: ref:<앱>:<from>:<ET날짜> = {"<android|ios|desktop>|<분류>": n}  (프리뷰·로컬은 refp: — 운영 숫자 오염 방지)
//   · 접두사 ref:/refp: 는 redisClient 복제 정책 밖 → EC2 전용(Upstash 명령 0). mkt: 로 쓰면 클릭마다 Upstash 쓰기가 는다.
//   · 값은 닫힌 목록(REF_BUCKETS × 3 기기) — 키도 필드도 무한히 늘지 않는다. 45일 보존(mkt:attr 와 같음).
//   · 응답 «뒤» after() 에서만 부른다 — 이동(302)·넘겨주기 화면 속도에 영향 없음, 실패는 삼킨다.
// 개인정보: 주소 전체·IP·기기 식별자는 남기지 않는다. 호스트 → 분류 이름 하나.
// ============================================================================

import type { NextRequest } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { isRefBucket, refBucketFromUrl, type RefBucket } from './referrer';

export type RefApp = 'sg' | 'uc' | 'wim';
export type RefDevice = 'android' | 'ios' | 'desktop';

/** /app 의 hitPlatform 과 같은 판정(안드로이드 → 아이폰·아이패드 → 나머지 데스크톱). */
export function refDevice(ua: string): RefDevice {
  return /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) ? 'ios' : 'desktop';
}

/** ?ref= 가 닫힌 목록이면 그것, 아니면 Referer 헤더. */
export function refBucketFor(req: NextRequest): RefBucket {
  const p = req.nextUrl.searchParams.get('ref');
  if (isRefBucket(p)) return p;
  return refBucketFromUrl(req.headers.get('referer'));
}

function etDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function refKey(app: RefApp, from: string, day: string, vercelEnv = process.env.VERCEL_ENV): string {
  return `${vercelEnv === 'production' ? 'ref' : 'refp'}:${app}:${from}:${day}`;
}

export async function recordRef(app: RefApp, fromRaw: string | null, device: RefDevice, bucket: RefBucket): Promise<void> {
  const from = (fromRaw || '').toLowerCase();
  if (!/^[a-z0-9_]{1,24}$/.test(from)) return; // 태그 없는 클릭은 기존 카운터와 똑같이 세지 않는다
  try {
    const key = refKey(app, from, etDate());
    const cur = await getFromCache<Record<string, number>>(key);
    const next: Record<string, number> = cur && typeof cur === 'object' && !Array.isArray(cur) ? { ...cur } : {};
    const field = `${device}|${bucket}`;
    next[field] = (Number(next[field]) || 0) + 1;
    await setInCache(key, next, 60 * 60 * 24 * 45);
  } catch { /* 집계 실패가 이동을 막지 않는다 */ }
}
