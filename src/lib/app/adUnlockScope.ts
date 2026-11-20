// ============================================================================
// 광고 잠금해제 범위 — «한 편 = 지금 누른 그 잠금 하나만 1시간» (2026-11-20, 순수 모듈 · 시험: tests/adUnlockScope1120.test.ts)
// ----------------------------------------------------------------------------
// 왜: 11/20 전까지는 보상형 한 편(또는 광고가 없을 때 30초 대체 창)이 앱 전역 키(signum_ad_unlock)를 1시간 열어
//   cmd·flow·가디언·대시보드 게이트의 PRO 잠금이 «전부» 같이 풀렸다 — 돈 낼 이유를 우리가 없앴다(마케팅 검토 11/20 §1-4).
//   AdMob 14일(UTC 11/6~19) 보상형 노출 iOS 10·안드 37 — 해제가 실제로 쓰인다.
// 무엇: 잠금마다 범위(scope) 하나. 광고를 본 그 범위만 1시간 열린다. 다른 잠금은 그대로 잠겨 있고 같은 단추로 또 볼 수 있다
//   (보상형 노출 기회는 줄지 않는다 — 여러 잠금을 원하면 광고를 더 본다). 화면 문구(«광고 보고 1시간 잠금해제»)는 그대로 참이다.
// 그대로인 것: 앱 전역 키(signum_ad_unlock)는 계속 쓴다 — adManager 의 «보상형 뒤 1시간 전면 광고 쉬기»(2026-08-19 대표 지시)가 그 키를 본다.
//   잠금(화면 가림) 판정만 이 모듈의 범위 키를 본다.
// ============================================================================

export const SCOPED_UNLOCK_KEY = 'signum_ad_unlock_scoped';
export const AD_UNLOCK_MS = 60 * 60 * 1000;
const MAX_SCOPES = 24;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** 범위 이름 — 빈 값은 'default'. 길이만 자른다(제목 문자열을 그대로 써도 된다). */
export function unlockScopeName(scope?: string | null): string {
  const s = String(scope ?? '').trim();
  return s ? s.slice(0, 80) : 'default';
}

/** 아직 유효한 범위들 {범위: 만료 시각}. 깨진 값·만료된 값은 버린다. */
export function readScopedUnlocks(storage: StorageLike | null | undefined, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  try {
    const raw = storage?.getItem(SCOPED_UNLOCK_KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const until = Number(v);
      if (Number.isFinite(until) && until > now) out[k] = until;
    }
  } catch { /* 저장소 막힘·깨진 값 = 잠김 */ }
  return out;
}

/** 이 범위가 지금 열려 있나 */
export function scopeUnlockedAt(storage: StorageLike | null | undefined, scope: string | null | undefined, now: number): boolean {
  return (readScopedUnlocks(storage, now)[unlockScopeName(scope)] ?? 0) > now;
}

/** 이 범위를 1시간 연다 — 만료된 범위는 지우고, 범위 수는 상한 안에서 가장 늦게 끝나는 것부터 남긴다. 돌려주는 값: 이 범위 말고 이미 열려 있던 범위 수 */
export function grantScopeUnlock(storage: StorageLike | null | undefined, scope: string | null | undefined, now: number): number {
  const name = unlockScopeName(scope);
  const live = readScopedUnlocks(storage, now);
  const others = Object.keys(live).filter((k) => k !== name).length;
  live[name] = now + AD_UNLOCK_MS;
  const kept = Object.entries(live).sort((a, b) => b[1] - a[1]).slice(0, MAX_SCOPES);
  try { storage?.setItem(SCOPED_UNLOCK_KEY, JSON.stringify(Object.fromEntries(kept))); } catch { /* 저장 못 하면 이번 실행 동안만(상태) 열린다 */ }
  return others;
}

// ── 계측: 해제 «뒤» 페이월·결제 (기기 안에서만 잇는다 · 서버엔 하루 합계만 · 식별자 없음) ─────────────────
export const REWARD_FOLLOW_KEY = 'signum_rw_follow';
export const REWARD_FOLLOW_MS = 24 * 60 * 60 * 1000;
export type RewardFollowSrc = 'rw_open' | 'rw_cta' | 'rw_buy';
const FOLLOW_OF: Record<string, RewardFollowSrc> = { open: 'rw_open', cta: 'rw_cta', buy_ok: 'rw_buy' };

/** 해제가 주어졌다 — 24시간 창을 새로 연다(창마다 열림·버튼·결제를 한 번씩만 센다) */
export function noteRewardForFollow(storage: StorageLike | null | undefined, now: number) {
  try { storage?.setItem(REWARD_FOLLOW_KEY, JSON.stringify({ at: now, done: [] })); } catch { /* 계측만 */ }
}

/** 퍼널 단계 하나가 해제 뒤 24시간 안의 첫 «열림·버튼·결제»면 그 출처를 돌려주고 표시한다. 아니면 null */
export function rewardFollowUp(storage: StorageLike | null | undefined, stage: string, now: number): RewardFollowSrc | null {
  const src = FOLLOW_OF[stage];
  if (!src) return null;
  try {
    const raw = storage?.getItem(REWARD_FOLLOW_KEY);
    if (!raw) return null;
    const st = JSON.parse(raw) as { at?: unknown; done?: unknown };
    const at = Number(st?.at);
    const done = Array.isArray(st?.done) ? (st.done as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    if (!Number.isFinite(at) || now < at || now - at > REWARD_FOLLOW_MS || done.includes(src)) return null;
    storage?.setItem(REWARD_FOLLOW_KEY, JSON.stringify({ at, done: [...done, src] }));
    return src;
  } catch { return null; }
}
