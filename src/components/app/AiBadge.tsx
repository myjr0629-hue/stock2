'use client';

// ============================================================================
// AiBadge — 「이 화면은 AI가 만든다」를 상단에서 한눈에 알리는 하나의 배지.
//
// 대표 지시(2026-09-10):
//   · 라벨은 **「AI 분석」 하나뿐**. «분석 완료» 상태는 만들지 않는다.
//     보여주려는 것은 결과가 아니라 **작동하고 있다는 사실**이다.
//   · **컨테이너를 텍스트 높이에 맞춰 키우지 말 것.** 배지는 20px 고정이고,
//     존재감은 후광이 «배지 밖으로» 퍼져서 낸다(absolute → 레이아웃 불변).
//   · 네 화면(가디언·커맨드·플로우·인텔) 어디에 넣어도 **기존 배치가 틀어지면 안 된다.**
//
// 색: 샴페인 골드 #E8C877.
//   초록=상승/LIVE · 로즈=하락 · 앰버=경고 로 이미 뜻이 박혀 있어 쓸 수 없고,
//   청록은 이 앱에서 이미 83곳에 쓰여 «강조»가 되지 않는다.
//   금색은 어두운 남색 위에서 가장 먼저 인식되고 프리미엄의 관용 신호다.
//   경고 앰버(#f59e0b, 채도 92%·밝기 50%)와는 **채도로 갈린다**(65%·82%).
// ============================================================================

type Locale = 'ko' | 'en' | 'ja';

const LABEL: Record<Locale, string> = {
  ko: 'AI 분석',
  en: 'AI ANALYSIS',
  ja: 'AI 分析',
};

export function AiBadge({
  locale = 'ko',
  iconOnly = false,
  style,
  title,
}: {
  locale?: string;
  /** 자리가 좁으면 라벨을 빼고 별만 (커맨드 티커 바 등) */
  iconOnly?: boolean;
  style?: React.CSSProperties;
  title?: string;
}) {
  const loc = (locale === 'en' || locale === 'ja' ? locale : 'ko') as Locale;
  const label = LABEL[loc];

  return (
    <span
      className={`ai-badge${iconOnly ? ' ai-badge--icon' : ''}`}
      style={style}
      aria-label={label}
      title={title ?? label}
      role="status"
    >
      <span className="ai-badge__halo" aria-hidden="true" />
      <svg className="ai-badge__star" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" fill="#E8C877" />
      </svg>
      {!iconOnly && <span className="ai-badge__label">{label}</span>}
    </span>
  );
}

export default AiBadge;
