/**
 * 안드로이드 Play 프로모션(맞춤 코드) — 2026-10-05 (브랜치 feat/android-promo-link · 운영 반영은 대표 폰 시험 G2 통과 뒤)
 *
 * 무엇: 안드로이드 사람이 우리 «애플» 맞춤 코드 링크(/app?…&code=<8종>)를 누르면, 예전엔 Play «설치» 화면으로 갔다(애플 코드는 Play 에서 안 통한다).
 *   Play 프로모션 코드가 생겨서, 켜져 있으면 Play «코드 사용» 창(play.google.com/redeem?code=<Play 코드>)으로 보낸다 — 앱이 없으면 Play 가 설치부터 안내한다.
 * 값: Play 코드 값·만료는 공개 저장소에 쓰지 않는다(운영 세션 10/5 지시) → 환경변수 «하나의 정의»로만 읽는다.
 *   ANDROID_PROMO_CODE  = Play 맞춤 코드(대문자·숫자 4~24자)
 *   ANDROID_PROMO_UNTIL = 만료 시각 ISO(예: 2026-10-31T00:00:00Z — Play 콘솔은 GMT)
 *   둘 중 하나라도 없거나 형식이 틀리면 «꺼짐» = 예전 동작(Play 설치). 켜기·끄기는 환경변수만(코드 배포 없이).
 * 홈 칩의 안드로이드 노출은 공개 플래그 NEXT_PUBLIC_ANDROID_PROMO=1(값 없음, 표시만) — 서버 변수와 «같이» 켜고 끈다.
 */
export type AndroidPromo = { code: string; until: number };

/** 환경변수 → 정의 하나(순수 함수, 시험 대상). */
export function parseAndroidPromo(code: string | undefined, until: string | undefined): AndroidPromo | null {
  const c = (code || '').trim().toUpperCase();
  const u = Date.parse((until || '').trim());
  if (!/^[A-Z0-9]{4,24}$/.test(c) || !Number.isFinite(u)) return null;
  return { code: c, until: u };
}

export const ANDROID_PROMO: AndroidPromo | null = parseAndroidPromo(process.env.ANDROID_PROMO_CODE, process.env.ANDROID_PROMO_UNTIL);

/** 안드로이드 코드 링크의 행선지 — 켜져 있고 만료 전이면 Play 코드 사용 창, 아니면 null(= 예전 Play 설치). 순수 함수. */
export function androidRedeemUrl(promo: AndroidPromo | null, now = Date.now()): string | null {
  if (!promo || now >= promo.until) return null;
  return `https://play.google.com/redeem?code=${encodeURIComponent(promo.code)}`;
}
