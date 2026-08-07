// ============================================================================
// kit/ads — 앱 «광고» 대본들 (AdPromo 템플릿용)
// ----------------------------------------------------------------------------
// 설계 근거 = .agent/SEEDANCE_PROMPT_GUIDE.md (공식 문서 조사 2026-08-07):
//  · 4막 구조: 훅(0-3s) → 데모(3-15s, 실 UI) → 프루프 → CTA. 15~30s 최적.
//  · ★ 실앱 UI = 실캡처만 (시덴스는 UI·숫자를 «창작»한다 — 컴플라이언스 사고)
//    시덴스 컷은 전부 «화면 비노출» 각도 (face-down 폰 · 모니터 뒷면 · 글로우만)
//  · 수익 약속 0 · 관찰형 클레임만 · 면책 상시 (FINRA 2210 계열)
//  · 캡처 = 2026-08-07 22:44 KST, NVDA +1.51% 실세션 (좌표 PIL 선검증)
// ============================================================================

import type { AdPromoProps } from './AdPromo';
import { VOICE_ADSIGNUM } from './voice-adsignum';

/** 각 씬의 낭독 문장 — scenes[i] 와 1:1 (tts 생성기 입력) */
export const AD_SIGNUM_VO = [
  'The market moves before you see it.',
  'Institutions leave a trail.',
  'One signal away.',
  'SIGNUM reads the whole tape.',
  'Gamma. Max pain. Whale prints.',
  'One screen. One verdict.',
  'SIGNUM HQ. Free on iOS and Android.',
];

export const AD_SIGNUM: AdPromoProps = {
  voice: VOICE_ADSIGNUM,
  scenes: [
    // ── 훅: 고래 메타포 (기관 = 심해의 고래) ─────────────────────────────────
    {
      kind: 'cine',
      src: 'shorts/broll/video/sd25_whale.mp4',
      clipSec: 5,
      title: 'The market moves\nbefore you see it.',
      sec: 5.0,
    },
    // ── 문제: 밤샘 트레이더 (모니터는 뒷면만 — UI 비노출 원칙) ───────────────
    {
      kind: 'cine',
      src: 'shorts/broll/video/sd25_trader.mp4',
      clipSec: 5,
      title: 'Institutions\nleave a trail.',
      sec: 3.5,
    },
    // ── 시그널: face-down 폰의 틸·골드 글로우 ────────────────────────────────
    {
      kind: 'cine',
      src: 'shorts/broll/video/sd25_phone_glow.mp4',
      clipSec: 5,
      title: 'One signal away.',
      sec: 4.0,
    },
    // ── ★ 실 UI 데모 3연타 (광고의 심장 — 전부 실캡처) ──────────────────────
    {
      kind: 'app',
      src: 'shorts/appshots/ad-dash.png',
      focus: { x: 0.03, y: 0.10, w: 0.94 },     // MARKET PULSE 풀보드 (선검증)
      title: 'See the whole tape.',
      sub: 'Futures · Dark pool · Live risk',
      sec: 4.5,
    },
    {
      kind: 'app',
      src: 'shorts/appshots/ad-cmd.png',
      focus: { x: 0.03, y: 0.075, w: 0.94 },    // NVDA 헤더+타일 (선검증)
      callout: { box: { x: 0.375, y: 0.298, w: 0.25, h: 0.10 }, label: 'GAMMA FLIP' },
      title: 'Options intel,\ndecoded.',
      sub: 'Gamma · Max pain · Whales',
      sec: 4.5,
    },
    {
      kind: 'app',
      src: 'shorts/appshots/ad-flow.png',
      focus: { x: 0.05, y: 0.52, w: 0.90 },     // Bullish flow dominance 패널 전폭 (문장 잘림 방지)
      title: 'The verdict,\nin one line.',
      sub: 'AI reads the whole book',
      sec: 4.5,
    },
    // ── CTA 엔드카드 (실로고 + 골드 터널) ────────────────────────────────────
    {
      kind: 'brand',
      app: 'SIGNUM HQ',
      line: 'The tape institutions leave behind',
      cta: 'FREE · iOS & Android',
      sec: 4.5,
    },
  ],
};
