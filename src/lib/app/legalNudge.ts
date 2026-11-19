// ============================================================================
// 첫 실행 법적 고지 — «회색 [계속]을 눌렀을 때» 동의 체크 줄로 데려가기 (2026-11-17)
// ----------------------------------------------------------------------------
// 안드 작은 화면(360dp)+큰 글꼴(1.3)에서는 동의 체크 줄이 화면 아래로 밀려 처음 화면에 안 보이고, 붙박이 회색 [계속]만 보인다.
// 예전 버튼은 진짜 disabled 라 눌러도 아무 반응이 없었다 → «앱이 안 눌린다»로 보여 안드 신규의 95%가 여기서 멈췄다(11/15~16 21→1).
// 이제 버튼은 aria-disabled(모양은 그대로 회색)이고, 누르면 패널 안에서 체크 줄을 «버튼 위 보이는 칸» 가운데로 부드럽게 굴리고
// 약 1초 테두리를 깜빡인다. 체크가 이미 보이는 화면(대부분)에서는 굴리지 않고 깜빡이기만 한다. 글·배치는 바꾸지 않는다.
// ============================================================================

/** 강조 길이(ms) — 두 번 깜빡임 */
export const LEGAL_NUDGE_MS = 1000;

/** 부드러운 굴림이 이 시간 안에 못 가면 바로 놓는다(ms) */
export const LEGAL_NUDGE_SETTLE_MS = 600;

/** 법적 고지 단계에서 동의 전 [계속]은 «막힘» — 누르면 진행 대신 체크 줄로 데려간다 */
export function legalContinueBlocked(legal: boolean, accepted: boolean): boolean {
  return legal && !accepted;
}

type Box = { top: number; height: number };

/**
 * 체크 줄(target)이 패널(container)의 «보이는 칸» — 붙박이 버튼 줄(bottomCover) 위 — 안에 위아래 모두 들어와 있나.
 * (굴림 위치 계산과 ★11/19 고정 체크 줄 판정이 같은 상자 계산을 쓴다)
 */
export function legalAckFullyVisible(container: Box, target: Box, bottomCover = 0, margin = 0): boolean {
  const visTop = container.top + margin;
  const visBottom = container.top + container.height - Math.max(0, bottomCover) - margin;
  return target.top >= visTop && target.top + target.height <= visBottom;
}

// ============================================================================
// ★11/19 고정 체크 줄 — 진짜 체크 줄이 버튼 줄 뒤(화면 밖)에 있으면, 같은 체크 줄(같은 글·같은 동의 상태)을
// 붙박이 버튼 줄 안 [계속] 바로 위에 하나 더 그린다. 회색 버튼만 보고 떠나던 안드 작은 화면(11/18 12명 중 8명 무조작 이탈)용.
// 체크 줄이 이미 보이는 화면(375×812 기본·대부분의 아이폰)에서는 아무것도 그리지 않는다(배치·화소 불변).
// 한 번 띄우면 이 법적 고지 단계 동안 유지한다 — 굴림·체크로 줄이 들어왔다 나갔다 하면 버튼 줄 높이가 바뀌어
// 패널 길이·굴림 위치가 튀는(깜빡임·점프) 고리가 생기기 때문이다. 단계를 떠나면 내린다.
// ============================================================================

/**
 * 진짜 체크 줄이 «아래로» 가려졌나 — 아랫변이 버튼 줄 위 보이는 칸 아래로 내려가 있다(버튼 줄 뒤·화면 밖).
 * 위로 굴려 지나간 경우(윗변이 패널 위로 잘림)는 가려진 것이 아니다 — 사용자가 이미 체크 줄을 지나 내려왔다.
 */
export function legalAckCoveredBelow(container: Box, target: Box, bottomCover = 0): boolean {
  const visBottom = container.top + container.height - Math.max(0, bottomCover);
  return target.top + target.height > visBottom;
}

/**
 * 고정 체크 줄 다음 상태. prev = 지금 띄워 둔 상태 · legal = 법적 고지 단계인가 · ackCovered = 진짜 체크 줄이 버튼 줄 뒤로 가려졌나(못 쟀으면 null).
 * 못 쟀으면 띄우지 않는다(배치 불변이 기본).
 */
export function legalPinNext(prev: boolean, legal: boolean, ackCovered: boolean | null): boolean {
  if (!legal) return false;
  if (prev) return true;
  if (ackCovered == null) return false;
  return ackCovered;
}

/** 화면 요소로 잰 «진짜 체크 줄이 버튼 줄 뒤로 가려졌나» — 패널·체크 줄·버튼 줄 중 하나라도 없거나 크기가 0 이면 null(모름) */
export function measureLegalAckCovered(
  panel: HTMLElement | null,
  ack: HTMLElement | null,
  bar: HTMLElement | null,
): boolean | null {
  if (!panel || !ack || !bar) return null;
  try {
    const c = panel.getBoundingClientRect();
    const t = ack.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    if (!(c.height > 0) || !(t.height > 0)) return null;
    return legalAckCoveredBelow({ top: c.top, height: c.height }, { top: t.top, height: t.height }, b.height);
  } catch {
    return null;
  }
}

/**
 * 체크 줄을 패널의 «보이는 칸»(붙박이 버튼 줄 위) 가운데에 놓는 scrollTop. 이미 다 보이면 null(굴리지 않는다).
 * container = 스크롤 패널의 화면 상자, target = 체크 줄의 화면 상자, bottomCover = 패널 아래를 덮는 붙박이 버튼 줄 높이.
 */
export function legalNudgeScrollTop(
  scrollTop: number,
  maxScrollTop: number,
  container: Box,
  target: Box,
  bottomCover = 0,
  margin = 8,
): number | null {
  const visTop = container.top + margin;
  const visBottom = container.top + container.height - Math.max(0, bottomCover) - margin;
  if (legalAckFullyVisible(container, target, bottomCover, margin)) return null;
  const visHeight = Math.max(0, visBottom - visTop);
  const want = scrollTop + (target.top - visTop) - Math.max(0, (visHeight - target.height) / 2);
  const clamped = Math.min(Math.max(0, maxScrollTop), Math.max(0, Math.round(want)));
  return clamped === Math.round(scrollTop) ? null : clamped;
}

function prefersReducedMotion(): boolean {
  try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** 강조 프레임 — 체크 줄(.ack)의 테두리·바깥 고리. 색은 기존 체크 줄 테두리색(#22d3ee 계열) */
export const LEGAL_NUDGE_FRAMES: Keyframe[] = [
  { boxShadow: '0 0 0 0 rgba(34, 211, 238, 0)', borderColor: 'rgba(34, 211, 238, 0.18)' },
  { boxShadow: '0 0 0 3px rgba(34, 211, 238, 0.75)', borderColor: 'rgba(34, 211, 238, 1)' },
  { boxShadow: '0 0 0 0 rgba(34, 211, 238, 0)', borderColor: 'rgba(34, 211, 238, 0.18)' },
  { boxShadow: '0 0 0 3px rgba(34, 211, 238, 0.75)', borderColor: 'rgba(34, 211, 238, 1)' },
  { boxShadow: '0 0 0 0 rgba(34, 211, 238, 0)', borderColor: 'rgba(34, 211, 238, 0.18)' },
];

const USER_SCROLL_EVENTS = ['touchstart', 'wheel', 'pointerdown', 'keydown'] as const;

/** 부드러운 굴림 보정 — LEGAL_NUDGE_SETTLE_MS 뒤에도 못 갔고 그 사이 사용자 조작이 없었으면 바로 놓는다 */
function settleScroll(container: HTMLElement, target: HTMLElement, top: number): void {
  let cancelled = false;
  const cancel = () => { cancelled = true; };
  const off = () => {
    for (const ev of USER_SCROLL_EVENTS) { try { container.removeEventListener?.(ev, cancel); } catch { /* 무시 */ } }
  };
  for (const ev of USER_SCROLL_EVENTS) { try { container.addEventListener?.(ev, cancel, { passive: true }); } catch { /* 무시 */ } }
  setTimeout(() => {
    off();
    try {
      // 단계가 바뀌면 같은 패널 DOM 이 재사용될 수 있다 → 체크 줄(대상)이 아직 그 패널 안에 있을 때만
      if (cancelled || container.isConnected === false || target.isConnected === false) return;
      if (typeof container.contains === 'function' && !container.contains(target)) return;
      if (Math.abs(container.scrollTop - top) > 4) container.scrollTop = top;
    } catch { /* 무시 */ }
  }, LEGAL_NUDGE_SETTLE_MS);
}

/**
 * 체크 줄로 데려간다: 패널 안에서 굴림(필요할 때만) → 테두리 깜빡임 → 체크 상자에 포커스(굴림 없이, 화면 읽기용).
 * 어떤 단계가 실패해도 조용히 넘어간다(첫 실행 화면을 절대 깨뜨리지 않는다).
 */
export function nudgeLegalAck(
  target: HTMLElement | null,
  container: HTMLElement | null,
  bottomCoverEl?: HTMLElement | null,
  opts?: { scroll?: boolean },
): void {
  if (!target) return;
  const reduced = prefersReducedMotion();
  try {
    // ★11/19 고정 체크 줄(버튼 바로 위 · 늘 보인다)을 강조할 때는 굴리지 않는다 — 깜빡임·포커스만
    if (opts?.scroll === false) { /* 굴림 없음 */ } else if (container) {
      const c = container.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      const cover = bottomCoverEl ? bottomCoverEl.getBoundingClientRect().height : 0;
      const top = legalNudgeScrollTop(
        container.scrollTop,
        container.scrollHeight - container.clientHeight,
        { top: c.top, height: c.height },
        { top: t.top, height: t.height },
        cover,
      );
      if (top != null) {
        if (typeof container.scrollTo === 'function') {
          container.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
          // 화면 갱신이 굶는 기기(저가폰·뒤 화면 부하)에서는 부드러운 굴림이 멈추다시피 한다(운영 실측: 초당 2프레임 환경에서 1초에 16px)
          // → 잠시 뒤 아직 못 갔으면 바로 놓는다(체크 줄이 반드시 보이게)
          //   사용자가 그 사이 직접 만지면(터치·휠·포인터·키) 보정을 취소한다 — 사용자의 스크롤을 덮어쓰지 않는다. 패널이 사라졌으면(단계 전환) 아무것도 안 한다
          if (!reduced) settleScroll(container, target, top);
        } else container.scrollTop = top;
      }
    } else if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    }
  } catch { /* 굴림 실패 — 강조만 */ }
  try {
    if (typeof target.animate === 'function') target.animate(LEGAL_NUDGE_FRAMES, { duration: LEGAL_NUDGE_MS, easing: 'ease-in-out' });
  } catch { /* 강조 미지원 */ }
  try {
    const input = target.querySelector('input');
    if (input && typeof input.focus === 'function') input.focus({ preventScroll: true });
  } catch { /* 포커스 실패 */ }
}
