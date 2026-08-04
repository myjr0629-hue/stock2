// ============================================================================
// sampleBriefing6 — 「주가는 올랐는데 돈은 반대로 갔다」
// ----------------------------------------------------------------------------
// 자막 트랙만 이어 읽어도 이야기가 성립해야 한다 (경제사냥꾼 ③ 차용).
// **3초마다 한 문장 + 배경도 함께 교체.**
//   ⚠️ 처음엔 배경만 5번 바꿨더니 컷이 12초당 1회로 잡혔다(게이트 FAIL).
//      경제사냥꾼은 중앙 이미지가 자막과 «같이» 갈린다(2.9초당 1컷). 그걸 맞춘다.
// 핵심어만 색: **빨강** __초록__ ==앰버==
//
// 전부 실측 (2026-08-04 장중, 우리 API + 앱 화면):
//   MU $881.17 +6.23% · 옵션 순방향 -$251.8M · 고래 최대체결 $12.6M(콜 $900)
//   AI 판정 하방압력 -59 (확신도 92%) · 감마플립 $850 (주가 위 +3.59%)
//   맥스페인 $855 (+2.99% 갭) · 총프리미엄 $126.4M 콜 우세 · 다크풀 1,004 · 고래 242
//
// ⚠️ [FIX] 처음 대본은 감마플립 $950·«아래 8.29%»로 썼는데, 캡처 시점에 값이 움직여
//    화면은 $850·«위 3.59%»를 보여줬다. 방향까지 반대였다. 영상 안에서 숫자가 두 개면
//    안 된다(V1 §5-C-2). 화면 기준으로 전부 맞췄다.
//
// 컴플라이언스: 관찰형만. 예측·매수매도·방향 암시 0.
// ============================================================================

import type { Briefing6Props } from '../compositions/BriefingV6';

export const SAMPLE_BRIEFING_6: Briefing6Props = {
  title: 'Micron jumped 6%.\nThe options money went the other way.',
  date: 'AUG 4, 2026',
  channel: 'SIGNUM HQ',
  hookBg: 'shorts/broll/v25_scene6_dashboard.png',

  lines: [
    { at: 0.0, bg: 'shorts/broll/v25_scene6_dashboard.png',
      text: 'Micron closed up __+6.23%__ today.',
      visual: { kind: 'big', label: 'MU · MICRON', value: '+6.23%', sub: '$881.17 · Aug 4', up: true } },

    { at: 3.2, bg: 'shorts/wall_broll_v4_tall.png',
      text: 'So I pulled the options flow.' },

    { at: 6.4, bg: 'shorts/broll/v25_scene2_darkpool.png',
      text: 'Net direction: **-$251.8M**.',
      visual: { kind: 'big', label: 'OPTIONS NET DIRECTION', value: '-$251.8M', sub: 'against the price move', up: false } },

    { at: 9.6, bg: 'shorts/broll/hook_wall.png',
      text: 'The stock went up. The money went down.' },

    { at: 12.8, bg: 'shorts/broll/pressure_compression.png',
      text: 'Same session. ==Same ticker.==',
      visual: { kind: 'split', aK: 'PRICE', aV: '+6.23%', bK: 'FLOW', bV: '-$251.8M' } },

    { at: 16.0, bg: 'shorts/broll/v25_scene3_reveal.png',
      text: 'But one whale did the opposite.' },

    { at: 19.2, bg: 'shorts/broll/v25_scene4_squeeze.png',
      text: 'A single **$12.6M** call print.',
      visual: { kind: 'big', label: 'LARGEST SINGLE PRINT', value: '$12.6M', sub: 'CALL · strike $900 · exp 08/07', up: true } },

    { at: 22.4, bg: 'shorts/wall_broll_v3.png',
      text: 'Strike ==$900==. Breakeven ==$930==.' },

    { at: 25.6, bg: 'shorts/broll/v25_scene5_implode.png',
      text: 'The stock is at $881. That bet is still below water.' },

    { at: 28.8, bg: 'shorts/broll/hook_v9a.png',
      text: 'Our engine read the whole book.' },

    { at: 32.0, bg: 'shorts/broll/v25_scene1_hook.png',
      text: 'Verdict: **downside hedging pressure**, confidence __92%__.',
      visual: { kind: 'split', aK: 'CONFIDENCE', aV: '92%', bK: 'VERDICT', bV: '-59' } },

    { at: 35.2, bg: 'shorts/broll/pressure_v9a.png',
      text: 'Put/call ratio 1.43. Gamma flip sits at ==$850==.' },

    { at: 38.4, bg: 'shorts/broll/v25_scene2_darkpool.png',
      text: 'Price is __3.59% above__ that flip.',
      visual: { kind: 'big', label: 'GAMMA FLIP', value: '$850', sub: 'price sits 3.59% above', up: true } },

    { at: 41.6, bg: 'shorts/broll/product_reveal.png',
      text: 'Here is the screen it came from.',
      visual: {
        kind: 'shot',
        src: 'shorts/appshots/mu-cmd.png',
        // [FIX] 처음엔 focus y=0.25 라 화면 상단(티커 칩)이 잡혔고 빨간 네모가 엉뚱한 곳을
        // 가리켰다. 타일 줄이 보이도록 내리고, 네모를 GAMMA FLIP 타일에 맞춘다.
        // 좌표는 원본 이미지(1206×2622) 기준 비율
        focus: { x: 0.04, y: 0.255, w: 0.92 },
        box: { x: 0.355, y: 0.268, w: 0.285, h: 0.085 },
        tag: 'GAMMA FLIP $850 · PRICE 3.59% ABOVE',
      } },

    { at: 46.0, bg: 'shorts/broll/v25_scene3_reveal.png',
      text: 'Max pain **$855**. Total premium __$126.4M__, call dominant.' },

    { at: 49.5, bg: 'shorts/broll/v25_scene2_darkpool.png',
      text: '1,004 dark pool prints. 242 whale trades.' },

    { at: 52.5, bg: 'shorts/broll/hook_wall.png',
      text: 'One session. ==Two stories.==' },
  ],

  cta: 'Which one would you have trusted —\nthe **price**, or the __flow__?',
  outro: { app: 'SIGNUM HQ', line: 'The tape institutions leave behind' },
};
