/**
 * 선물 링크(from=gift)의 «초대자별» 집계 — 2026-10-06 (브랜치 feat/gift-pro)
 *
 * 기존 사람 클릭 집계(lib/marketing/clickHuman.recordClick — clk:<앱>:<태그>:<ET날짜> = {"<필드>": n})에 그대로 태운다. 새 저장소·새 집계 경로 없음.
 *   · 앱 이름 «gift», 키 자리의 «태그»에는 초대자 id 의 «첫 글자»(버킷, 최대 36개)가 들어간다:  clk:gift:<ref[0]>:<ET날짜>
 *   · 필드는 «<ref>|<기기>|<종류>» — 종류: human(사람 클릭, /app) · tap:<단추>(쿠폰 화면 단추, /api/coupon/event) · claim:<결과>(안드 «내 쿠폰 받기», /api/coupon/claim)
 *   왜 버킷인가: 초대자 id 는 랜덤이라 «어떤 id 가 있는지»를 키 목록으로 알 수 없다(EC2 프록시는 get·mget 만 — 키 스캔 없음).
 *   버킷 36개는 이름이 정해져 있어 한 번의 mget 으로 하루치를 전부 읽는다(scripts/mkt-gift.js). 한 칸에 초대자 수/36 명분만 쌓여 읽기·쓰기도 가볍다.
 *   · clk: 접두사는 EC2 전용(Upstash 명령 0) · 미리보기는 clkp:(운영 숫자 오염 없음) — clickKey 가 정한다.
 * 개인정보: 초대자 id 는 기기 로컬 랜덤 값이다(이름·연락처·기기 식별자와 무관). IP·UA 원문은 싣지 않는다.
 * ⚠ 서버 전용(clickHuman 이 레디스 클라이언트를 끌어온다) — 클라이언트 번들(lib/gift/gift.ts·useGift.ts)에서 import 하지 않는다.
 */
import { recordClick } from '@/lib/marketing/clickHuman';
import { normalizeGiftRef } from './gift';

/** 초대자 id → 저장 칸(버킷 = 첫 글자). 형식 밖이면 null. */
export function giftRefSlot(rawRef: unknown): { ref: string; bucket: string } | null {
  const ref = normalizeGiftRef(rawRef);
  return ref ? { ref, bucket: ref[0] } : null;
}

/** 초대자별 칸에 필드를 더한다 — 응답 뒤 after() 안에서만 부른다(실패는 recordClick 이 삼킨다). */
export async function recordGiftRef(rawRef: unknown, fields: string[]): Promise<void> {
  const slot = giftRefSlot(rawRef);
  if (!slot || fields.length === 0) return;
  await recordClick('gift', slot.bucket, fields.map((f) => `${slot.ref}|${f}`));
}
