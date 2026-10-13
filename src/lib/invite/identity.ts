/**
 * 익명 초대 신원 — 2026-10-14 (브랜치 feat/viral-loop)
 *
 * 두 값을 쓴다.
 *   key  기기 로컬 «비공개 열쇠» — 선물함(보상 번호)을 읽을 때만 서버에 보낸다. 링크에는 절대 싣지 않는다.
 *   ref  «공개 id» = SHA-256(key) 에서 한 방향으로 만든 10자 — 공유 링크에 실린다. ref 로는 key 를 되돌릴 수 없다.
 * 왜 둘인가: 예전 선물 ref 는 «링크에 실리는 값 = 기기 값» 하나뿐이었다. 보상 번호를 보여 주려면 «내 것»을 증명할 열쇠가 따로 있어야 한다
 *   (링크를 받은 누구나 ref 를 알기 때문에, ref 만으로 선물함을 열면 남의 번호를 가져갈 수 있다).
 *   서버는 key 를 받으면 같은 함수로 ref 를 다시 계산해 선물함 칸을 찾는다 — 등록 호출이 필요 없고 오프라인에서도 링크가 만들어진다.
 * 형식: ref 는 기존 선물 ref 규칙(lib/gift/gift.GIFT_REF_RE — 영문 소문자·숫자 8~16자 + 숫자 하나 이상)을 그대로 통과한다 →
 *   /app·/api/coupon/* 의 기존 검증·초대자별 집계가 «글자 하나 안 바뀌고» 같이 받는다.
 * 개인정보: 이름·이메일·기기 식별자와 무관한 랜덤 값. 앱 데이터를 지우면 새로 만들어진다(= 새 초대자).
 * ⚠ 서버(라우트)·클라이언트가 같이 import 한다 — node 전용 모듈을 넣지 않는다.
 */
import { sha256Bytes } from './sha256';

export const INVITE_KEY_STORAGE = 'signumhq.inv.key.v1';
/** 헷갈리는 글자(i·l·o·0·1)를 뺀 31자 — lib/gift/gift 와 같은 글자판 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const DIGITS = '23456789';
export const INVITE_KEY_RE = /^[a-hjkmnp-z2-9]{20,32}$/;
export const INVITE_KEY_LEN = 24;

function randomInt(max: number): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % max;
  } catch {
    return Math.floor(Math.random() * max);
  }
}

/** 새 열쇠 — 24자(≈ 119비트). 시험용으로 난수 함수를 받는다. */
export function newInviteKey(rand: (max: number) => number = randomInt): string {
  let s = '';
  for (let i = 0; i < INVITE_KEY_LEN; i++) s += ALPHABET[rand(ALPHABET.length)];
  return s;
}

export const normalizeInviteKey = (raw: unknown): string | null => {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return INVITE_KEY_RE.test(s) ? s : null;
};

/** 열쇠 → 공개 id(10자). 같은 열쇠는 늘 같은 값. 숫자가 하나도 없으면 해시에서 정한 자리를 숫자로 바꾼다. */
export function inviteRefOf(key: string): string {
  const h = sha256Bytes(`signum-invite-ref-v1|${key}`);
  let s = '';
  for (let i = 0; i < 10; i++) s += ALPHABET[h[i] % ALPHABET.length];
  if (!/\d/.test(s)) {
    const p = h[10] % s.length;
    s = s.slice(0, p) + DIGITS[h[11] % DIGITS.length] + s.slice(p + 1);
  }
  return s;
}

let memoryKey: string | null = null;
/** 이 기기의 열쇠 — 없으면 만들어 저장한다. 저장소가 막힌 환경이면 이 화면이 열려 있는 동안만 같은 값. */
export function getInviteKey(): string {
  try {
    const cur = normalizeInviteKey(localStorage.getItem(INVITE_KEY_STORAGE));
    if (cur) return cur;
    const fresh = newInviteKey();
    localStorage.setItem(INVITE_KEY_STORAGE, fresh);
    return fresh;
  } catch { /* 저장소 막힘 — 아래 메모리 값 */ }
  if (!memoryKey) memoryKey = newInviteKey();
  return memoryKey;
}

/** 이 기기의 공개 초대 id(링크에 싣는 값) */
export function getInviteRef(): string {
  return inviteRefOf(getInviteKey());
}

/** 이 기기에서 «공유를 한 번이라도 했다»는 표식 — 보상이 올 수 있는 사람만 선물함을 조회하게(서버 호출을 아끼려고) */
export const INVITE_SHARED_KEY = 'signumhq.inv.shared.v1';
export function markInviteShared(now = Date.now()): void {
  try { localStorage.setItem(INVITE_SHARED_KEY, String(now)); } catch { /* 저장소 막힘 */ }
}
export function hasInviteShared(): boolean {
  try { return !!localStorage.getItem(INVITE_SHARED_KEY); } catch { return false; }
}

/** 공유를 마친 뒤 «내게 오는 것(보상)» 한 줄을 보여 준 횟수 — 기기에서 두 번까지만(매번 뜨면 소음이다) */
export const INVITE_HINT_KEY = 'signumhq.inv.hint.v1';
export const INVITE_HINT_MAX = 2;
export function inviteHintCount(): number {
  try { return parseInt(localStorage.getItem(INVITE_HINT_KEY) || '0', 10) || 0; } catch { return INVITE_HINT_MAX; }   // 저장소가 막히면 «이미 봤다»로(한 번도 못 세는 곳에서 매번 뜨지 않게)
}
export function bumpInviteHint(): void {
  try { localStorage.setItem(INVITE_HINT_KEY, String(inviteHintCount() + 1)); } catch { /* 저장소 막힘 */ }
}
