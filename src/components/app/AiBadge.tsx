'use client';

// ============================================================================
// AiBadge — 「이 화면은 AI가 만든다」를 알리는 **로고 하나**.
//
// 대표 지시(2026-09-10, 2차): 「AI 분석」 텍스트를 빼고 로고만.
//   · 텍스트가 있으니 영어(AI ANALYSIS)에서 폭이 터졌다. AI 는 세 언어가 «같은 글자»라
//     라벨을 없애면 로케일에 따라 폭이 변하지 않는다 — 결함이 구조적으로 사라진다.
//   · 「분석 중」 같은 상태 문구는 쓰지 않는다. **스파클의 맥동만으로 작동을 알린다.**
//   · «분석 완료» 상태는 만들지 않는다. 보여줄 것은 결과가 아니라 돌아가고 있다는 사실이다.
//   · 크기는 24px. 인텔의 커커 줄이 28px 이라 그것이 «어느 화면도 안 밀리는» 상한이다.
//
// ★ 컨테이너 높이는 24px 고정이고, 스파클은 viewBox 밖으로 넘친다(overflow:visible).
//   존재감만 커지고 레이아웃 높이는 변하지 않는다 — 대표 반복 지시.
// 색: 샴페인 골드 #E8C877.
// ============================================================================

const GOLD = '#E8C877';

const LABEL: Record<string, string> = {
  ko: 'AI 분석',
  en: 'AI analysis',
  ja: 'AI 分析',
};

export function AiBadge({
  locale = 'ko',
  style,
}: {
  locale?: string;
  /** @deprecated 라벨이 없어져 의미가 없다. 호출부 호환용으로만 남긴다. */
  iconOnly?: boolean;
  style?: React.CSSProperties;
  title?: string;
}) {
  // 화면에는 글자가 없다. 이 문구는 스크린리더·툴팁 전용이다.
  const label = LABEL[locale] || LABEL.ko;

  return (
    <span className="ai-mark" style={style} role="img" aria-label={label} title={label}>
      <svg width="24" height="24" viewBox="-3 -3 26 26" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="18" height="18" rx="5.5" stroke={GOLD} strokeWidth="1.7" fill="none" />
        <text
          x="9.6" y="13.4" textAnchor="middle"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize="9.5" fontWeight={900} letterSpacing="-0.3" fill={GOLD}
        >
          AI
        </text>
        {/* 큰 스파클 — 오른쪽 위 모서리에 걸친다 */}
        <path
          className="ai-mark__s1"
          d="M19.6 -0.6l.85 2.5 2.5.85-2.5.85-.85 2.5-.85-2.5-2.5-.85 2.5-.85z"
          fill={GOLD}
          transform="translate(-2.2 1.2) scale(.82)"
          style={{ transformOrigin: '19.6px 3.2px' }}
        />
        {/* 작은 스파클 — 반 박자 늦게 */}
        <path
          className="ai-mark__s2"
          d="M22.4 5.4l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5z"
          fill={GOLD}
          transform="translate(-3.4 -0.4) scale(.8)"
          style={{ transformOrigin: '22.4px 7.3px' }}
        />
      </svg>
    </span>
  );
}

export default AiBadge;
