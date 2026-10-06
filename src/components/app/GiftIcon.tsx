// «친구에게 PRO 1개월 선물» 아이콘 — 설정 카드·대시보드 단추가 같이 쓴다(2026-10-06). 이모지는 기기마다 모양이 달라 선 아이콘으로 그린다.
export function GiftIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="8" width="18" height="4.2" rx="1.2" />
      <path d="M12 8v13" />
      <path d="M19 12.2V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6.8" />
      <path d="M7.6 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8" />
      <path d="M16.4 8a2.5 2.5 0 0 0 0-5C13 3 12 8 12 8" />
    </svg>
  );
}
