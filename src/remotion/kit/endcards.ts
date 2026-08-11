// ============================================================================
// kit/endcards — 3앱 엔드카드 «정본 수치» (SHORTS_FRAMEWORK_V3 §6-2)
// ----------------------------------------------------------------------------
// 여기 없는 값을 컴포넌트가 지어내지 않는다. 문구·색·자산 경로가 전부 여기 있다.
//
// 절대 규칙 (§8):
//  · 앱 화면은 «실캡처»만. AI 가 그린 UI 는 절대 쓰지 않는다.
//  · 타사 티커 로고를 엔드카드에 넣지 않는다 — 후원·제휴 오인이 된다.
//  · CTA 는 「Free, with ads.」로 고정 (광고 탑재·향후 IAP 와 충돌 방지).
// ============================================================================

export type AppKey = 'signum' | 'uc' | 'wim';

export interface EndCardSpec {
  name: string;
  icon: string;            // public/ 기준 경로 (1024 원본)
  accent: string;
  ink: string;
  panel: string;           // 패널 배경
  bezel: string;           // 폰 베젤
  plate?: string;          // 배경 플레이트 영상 (없으면 그라디언트 폴백)
  plateFilter: string;
  hero: string;            // 폰 안에 들어가는 실캡처
  panels: string[];        // 궤도 패널 실캡처 (0~3장, 없으면 폰만)
  tagline: string;
  cta: string;
  loopAskFallback: string;
  disclaimer: string;
  vo: string;              // 1줄 VO 대본 (scripts/tts-ads.mjs 가 굽는다)
  store: string;           // 스마트링크
}

export const ENDCARD: Record<AppKey, EndCardSpec> = {
  signum: {
    name: 'SIGNUM HQ',
    icon: 'app-icons/signum.png',
    accent: '#FFB020',
    ink: '#FFFFFF',
    panel: 'rgba(8,13,22,.74)',
    bezel: '#0B0F18',
    // plate: 수확 후 hf-sync 가 채운다 (endcard-01-*). 없으면 그라디언트 폴백.
    plate: undefined,
    plateFilter: 'brightness(1.02) saturate(0.95)',
    hero: 'shorts/appshots/signum-dash.png',
    panels: ['shorts/appshots/signum-cmd.png', 'shorts/appshots/ad-flow.png', 'shorts/appshots/t2-guardian.png'],
    tagline: 'The tape institutions leave behind',
    cta: "Today's whole board. Free, with ads.",
    loopAskFallback: 'Which dial would you read first?',
    disclaimer: 'Informational only. Not investment advice.',
    vo: 'SIGNUM HQ. Free, with ads.',
    store: 'https://signumhq.com/app',
  },
  uc: {
    name: 'Undercurrent',
    icon: 'app-icons/uc.png',
    accent: '#C4441A',
    ink: '#1C1C1E',
    panel: 'rgba(255,255,255,.82)',
    bezel: '#F5F2EC',
    plate: undefined,
    plateFilter: 'brightness(1.06) saturate(0.98)',
    hero: 'shorts/appshots/uc-home.png',
    panels: [],
    tagline: 'Where the news meets the money',
    cta: 'The other half of the story. Free, with ads.',
    loopAskFallback: 'News or money — which moved first?',
    disclaimer: 'Informational only. Not investment advice.',
    vo: 'Undercurrent. Where the news meets the money.',
    store: 'https://signumhq.com/app-uc',
  },
  wim: {
    name: "Why'd It Move?",
    icon: 'app-icons/wim-1024.png',
    accent: '#FFA51F',
    ink: '#FFFFFF',
    panel: 'rgba(46,32,110,.62)',
    bezel: '#2A1E5E',
    plate: undefined,
    plateFilter: 'brightness(1.04) saturate(1.02)',
    hero: 'shorts/appshots/wim-home.png',
    panels: [],
    tagline: 'Learn the market by playing it',
    cta: 'Name the reason. Free, with ads.',
    loopAskFallback: 'Can you name the reason?',
    disclaimer: 'Educational only. Not investment advice.',
    vo: "Why'd It Move? Learn the market by playing it.",
    store: 'https://signumhq.com/app-wim',
  },
};

/** 길이 정본 — 105f 가 기본(브리핑 부착), 210f 는 X·웹 히어로·광고 헤드 전용 */
export const ENDCARD_FRAMES = { short: 105, long: 210 } as const;

/**
 * 크로스프로모 로테이션 (§6-1).
 * 아침(T2)은 최대 도달이라 본진 SIGNUM 고정, 장마감(T4)은 날짜로 UC/WIM 교대.
 */
export function endcardFor(template: string, date: Date): AppKey {
  if (template === 'T2') return 'signum';
  return date.getUTCDate() % 2 === 0 ? 'uc' : 'wim';
}
