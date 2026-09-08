// ============================================================================
// AdFreeIcon — 유료 티어(광고 제거)를 가리키는 단 하나의 마크
// ----------------------------------------------------------------------------
// 예전엔 ★(별)을 썼다. 별은 «즐겨찾기 / 프리미엄 등급»이지 «광고 제거»가 아니다.
// 우리가 파는 것은 등급이 아니라 «광고가 사라지는 것» 하나뿐이므로, 마크도
// 그것을 그대로 그린다 — 배너 모양에 사선.
//
// 세 자리(설정 행 · 대시보드 게이트 · ValueWall)가 같은 것을 쓰도록 컴포넌트로
// 둔다. 하나씩 그리면 반드시 어긋난다.
// ============================================================================

export function AdFreeIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* 배너 */}
      <rect
        x="2.6"
        y="6.6"
        width="18.8"
        height="10.8"
        rx="2.8"
        stroke="currentColor"
        strokeWidth="1.9"
      />
      {/* 사선 — 배너 밖으로 살짝 넘겨야 «지운다»로 읽힌다 */}
      <path
        d="M5.2 19.4 18.8 4.6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}
