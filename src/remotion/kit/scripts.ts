// ============================================================================
// kit/scripts — 시간대별 «대본». 템플릿은 하나, 이 배열만 바꾼다.
// ----------------------------------------------------------------------------
// 각 beat 의 `say` 는 **ElevenLabs 가 읽을 문장과 같은 문자열**이다.
// 자막과 음성이 어긋날 수 없는 구조 — 한 곳에서만 온다.
//
// role 이 배경을 고른다(kit/spec.ts BG_FOR). 배경이 내용과 따로 놀지 않는다.
// 컴플라이언스: 관찰형만. 액션 요구 0. 예측·매수매도 0.
// ============================================================================

import type { BriefingProps } from './Briefing';

const MU_SERIES = [
  843, 846, 851, 850, 856, 859, 861, 859, 865, 867,
  866, 870, 872, 871, 875, 878, 876, 880, 884, 881,
  885, 889, 886, 883, 880, 878, 880, 883, 881, 881,
];

/** T1 · 「모순」 — 가격과 플로우가 어긋난 종목 */
export const SCRIPT_T1: BriefingProps = {
  title: 'Micron rose 6%.\nThe options money did not.',
  date: 'AUG 4, 2026',
  hook: {
    line: 'Micron closed\nup 6.23%.',
    sub: 'The money went the other way.',
    role: 'market',
  },
  loop: 'One session.\nTwo stories.',

  beats: [
    {
      role: 'money',
      eyebrow: 'What the tape showed',
      head: 'Micron finished\nthe session +6.23%',
      say: "It closed at $881, near the day's high.",
      ask: 'So what did the options book say?',
      visual: { kind: 'chart', series: MU_SERIES, label: 'MU · MICRON', value: '$881.17', pct: '+6.23%', up: true },
    },
    {
      role: 'conflict',
      eyebrow: 'The answer',
      head: 'Net option flow:\nminus $251.8M',
      say: 'Stock up. Option money down.',
      ask: 'But one trade broke the pattern.',
      visual: { kind: 'versus', aK: 'PRICE', aV: '+6.23%', bK: 'FLOW', bV: '-$251.8M' },
    },
    {
      role: 'depth',
      eyebrow: 'The one that broke it',
      head: 'A single $12.6M\ncall print',
      say: 'Strike 900. Breakeven 930. Spot 881.',
      ask: 'Is that bet working yet?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'PREMIUM', v: '$12.6M', up: true, note: 'largest single print' },
          { k: 'STRIKE', v: '$900', up: true, note: 'expires 08/07' },
          { k: 'BREAKEVEN', v: '$930', up: false, note: '5.5% above spot' },
        ],
      },
    },
    {
      role: 'evidence',
      eyebrow: 'Where the book was pinned',
      head: 'Max pain $855.\nGamma flip $850.',
      say: 'Price above the flip, off max pain.',
      ask: 'And this is only the surface.',
      // ⚠️ 이 대본은 8/4 캡처 기준 — appshots 가 재촬영되면 숫자·좌표가 죽는다.
      //    (실전 대본은 SCRIPT_FLIP 처럼 캡처 «당일» .txt 에서 새로 쓴다)
      visual: {
        kind: 'shot',
        src: 'shorts/appshots/mu-cmd.png',
        focus: { x: 0.04, y: 0.158, w: 0.92 },
        callout: { box: { x: 0.355, y: 0.268, w: 0.285, h: 0.085 }, label: 'GAMMA FLIP $850' },
      },
    },
    {
      role: 'chips',
      eyebrow: 'Not just one name',
      head: 'The whole memory shelf\nmoved together',
      say: 'MU, NVDA and SNDK all closed green.',
      ask: 'Chart said one thing. Book said another.',
      visual: {
        kind: 'logos',
        items: [
          { t: 'MU', pct: '+6.23%', up: true },
          { t: 'NVDA', pct: '+1.76%', up: true },
          { t: 'SNDK', pct: '+6.03%', up: true },
        ],
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Chart, or book —\nwhich one would you read?',
  },
};

// ============================================================================
// SCRIPT_FLIP — 「$900 위에 정확히 앉은 가격」 (2026-08-06 11:59 ET 실측)
// ----------------------------------------------------------------------------
// ★ 모든 숫자의 출처 = public/shorts/appshots/{mu-cmd,mu-flow,signum-dash}.txt
//   — 캡처와 «같은 순간» 저장된 텍스트다. 화면과 대본이 어긋날 수 없다.
//   화면에 보이는 값(PNG)과 대본이 겹치는 지표는 PNG 표기를 그대로 쓴다:
//   MU $900.02 +0.76% · GAMMA FLIP $900.00 above (+0.00%) · MAX PAIN $870 (+3.45%)
//   · TOTAL PREMIUM $271.1M Call dominant.
// 대본 트리: 시장(가지1) → 종목(줄기) → 플립 일치(핵심) → 화면 증거
//   → 옵션 북(가지2) → 압력 게이지(가지3) → 컨센서스(인용) → 피어(가지4) → 주간 수렴
// 길이: 훅3 + 본문 31.4 + CTA4 + 루프2.5 = 40.9초 (LENGTH 36~50 ✓)
// 컴플라이언스: 관찰형만. «pinned or passing» 은 현재 상태에 대한 질문이다.
// ============================================================================
export const SCRIPT_FLIP: BriefingProps = {
  title: 'MU pinned at $900.\nPrice meets the gamma flip.',
  date: 'AUG 6 · LIVE SESSION',
  data: { seed: 'MU' },
  hook: {
    line: 'Micron is sitting on\nits gamma flip.',
    sub: '$900.02 vs $900.00',
  },
  loop: 'Price. Book. Street.\nOne dollar line.',

  beats: [
    {
      role: 'market',
      eyebrow: 'Session backdrop',
      head: 'The tape is\ndrifting red',
      say: 'All three indexes are slipping.',
      ask: 'So why is one chip name green?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'NASDAQ', v: '-0.07%', up: false },
          { k: 'S&P 500', v: '-0.21%', up: false },
          { k: 'DOW', v: '-0.68%', up: false },
        ],
      },
    },
    {
      role: 'money',
      eyebrow: 'The exception',
      head: 'Micron holds\nplus 0.76%',
      say: 'MU trades at $900.02.',   // «right now» 는 자막 위도우(외톨이 줄)를 만들었다
      ask: 'Look closer at that number.',
      visual: { kind: 'stat', label: 'MU · MICRON', value: '$900.02', sub: '+0.76% · session live', up: true },
    },
    {
      role: 'conflict',
      eyebrow: 'The line underneath',
      head: 'The gamma flip\nsits at $900.00',
      say: 'Two cents. That is the gap.',
      ask: 'Pinned, or passing through?',
      visual: { kind: 'versus', aK: 'PRICE', aV: '$900.02', bK: 'FLIP', bV: '$900.00' },
    },
    {
      role: 'evidence',
      eyebrow: 'Straight from the screen',
      head: 'The screen reads\nplus 0.00%',
      say: 'Distance above the flip: zero.',
      ask: 'What does the rest of the book say?',
      // 좌표는 2026-08-07 캡처에 PIL 로 실측·검증 (co_check.png)
      visual: {
        kind: 'shot',
        src: 'shorts/appshots/mu-cmd.png',
        focus: { x: 0.04, y: 0.148, w: 0.92 },
        callout: { box: { x: 0.375, y: 0.304, w: 0.25, h: 0.1 }, label: 'GAMMA FLIP $900.00' },
      },
    },
    {
      role: 'depth',
      eyebrow: 'The rest of the book',
      head: 'Max pain is\n3.45% below',
      say: 'Max pain $870. Price holds above.',
      ask: 'And the pressure gauges?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'MAX PAIN', v: '$870', up: false, note: '+3.45% gap to price' },
          { k: 'PREMIUM', v: '$271.1M', up: true, note: 'call dominant' },
          { k: 'DAY RANGE', v: '827–913', up: true, note: 'wide session' },
        ],
      },
    },
    {
      role: 'money',
      eyebrow: 'Two gauges disagree',
      head: 'Volume leans put.\nPremium leans call.',
      say: 'P/C ratio 1.36. Premium 58% call.',
      ask: 'Who do the pros side with?',
      visual: { kind: 'versus', aK: 'PREMIUM BIAS', aV: '58% CALL', bK: 'VOLUME P/C', bV: '1.36' },
    },
    {
      role: 'verdict',
      eyebrow: 'The street, aggregated',
      head: '70 analysts.\n81% say Buy.',
      say: 'The consensus reads 81% bullish.',
      ask: 'One layer left: the peers.',
      sec: 4.5,
      visual: { kind: 'consensus', rating: 'Buy', pct: '81%', n: '70', up: true, note: 'Buy 57 · Hold 11 · Sell 2' },
    },
    {
      role: 'chips',
      eyebrow: 'Same shelf, different day',
      head: 'The chip shelf\nsplit today',
      say: 'Peers split. Micron did not move.',
      ask: 'Zoom out one week.',
      visual: {
        kind: 'logos',
        items: [
          { t: 'AVGO', pct: '+1.09%', up: true },
          { t: 'NVDA', pct: '-0.57%', up: false },
          { t: 'SNDK', pct: '-4.75%', up: false },
        ],
      },
    },
    {
      role: 'money',
      eyebrow: 'The week behind it',
      head: 'Up 3.9%\non the week',
      say: 'Tuesday alone added 7.6%.',
      ask: 'Price, book, street — one screen.',
      visual: { kind: 'stat', label: 'MU · THIS WEEK', value: '+3.9%', sub: 'Tuesday +7.6% · 4 up, 1 down', up: true },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Which layer do you\nread first?',
  },
};
