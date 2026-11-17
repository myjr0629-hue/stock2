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

/** 법적 고지 단계에서 동의 전 [계속]은 «막힘» — 누르면 진행 대신 체크 줄로 데려간다 */
export function legalContinueBlocked(legal: boolean, accepted: boolean): boolean {
  return legal && !accepted;
}

type Box = { top: number; height: number };

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
  if (target.top >= visTop && target.top + target.height <= visBottom) return null;
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

/**
 * 체크 줄로 데려간다: 패널 안에서 굴림(필요할 때만) → 테두리 깜빡임 → 체크 상자에 포커스(굴림 없이, 화면 읽기용).
 * 어떤 단계가 실패해도 조용히 넘어간다(첫 실행 화면을 절대 깨뜨리지 않는다).
 */
export function nudgeLegalAck(
  target: HTMLElement | null,
  container: HTMLElement | null,
  bottomCoverEl?: HTMLElement | null,
): void {
  if (!target) return;
  const reduced = prefersReducedMotion();
  try {
    if (container) {
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
        if (typeof container.scrollTo === 'function') container.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
        else container.scrollTop = top;
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
