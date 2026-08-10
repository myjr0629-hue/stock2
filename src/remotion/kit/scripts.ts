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
import { VOICE_CLOSE } from './voice-close';
import { VOICE_T2 } from './voice-t2';

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
  tape: [
    { t: 'NASDAQ', v: '-0.07%', up: false }, { t: 'S&P 500', v: '-0.21%', up: false },
    { t: 'DOW', v: '-0.68%', up: false }, { t: 'VIX', v: '15.49', up: false },
    { t: 'BTC', v: '$64.6K', up: false }, { t: 'GOLD', v: '$4,308', up: true },
    { t: 'OIL', v: '$76.9', up: true }, { t: 'SOX', v: '+1.41%', up: true },
  ],
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


// ============================================================================
// SCRIPT_CLOSE — 「빨간 마감, 차분해진 옵션」 ★ T4 장마감 레짐 브리핑 1호
// ----------------------------------------------------------------------------
// 대표 지시(2026-08-07): "종목 템플릿만이 아니라 레짐·시장분석 장마감 리포트 —
// 뉴스와 흐름을 통해 «하나의 스토리» 느낌이 나게."
// ★ 모든 숫자 출처 = public/shorts/appshots/close-dash.{png,txt} (8/6 장마감 후 캡처)
// 스토리 줄기(one idea): 지수는 빨갛게 닫혔는데 공포 게이지(VIX)는 -4.17% 급락했다.
//   가지: 레짐 판정(Mixed·RISK 43) → 섹터(에너지 주도) → 뉴스(사운드하운드 실적)
//        → 무버(MU, $900 핀에서 페이드 — 전편과 이어지는 서사) → 매크로 → 야간 선물
//   수렴: 탐욕 59.7 vs 리스크 43 — 두 다이얼이 어긋난 채 하루가 닫혔다.
// ============================================================================
export const SCRIPT_CLOSE: BriefingProps = {
  voice: VOICE_CLOSE,
  title: 'Red close, calmer options.\nThe session in one story.',
  date: 'AUG 6 · MARKET CLOSE',
  data: { seed: 'CLOSE' },
  tape: [
    { t: 'NASDAQ', v: '-0.06%', up: false }, { t: 'S&P 500', v: '-0.18%', up: false },
    { t: 'DOW', v: '-0.85%', up: false }, { t: 'VIX', v: '15.15', up: false },
    { t: 'US 10Y', v: '4.67%', up: true }, { t: 'OIL', v: '$78.1', up: true },
    { t: 'GOLD', v: '$4,304', up: true }, { t: 'BTC', v: '$64.2K', up: false },
  ],
  hook: {
    line: 'The market closed red.\nFear fell anyway.',
    sub: 'VIX -4.17% into the close',
  },
  loop: 'Red tape. Calm options.\nThat was the close.',

  beats: [
    {
      role: 'market',
      eyebrow: 'The scoreboard',
      head: 'All three\nclosed red',
      say: 'Every benchmark slipped today.',
      ask: 'Then why did fear sink?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'NASDAQ', v: '-0.06%', up: false },
          { k: 'S&P 500', v: '-0.18%', up: false },
          { k: 'DOW', v: '-0.85%', up: false },
        ],
      },
    },
    {
      role: 'conflict',
      eyebrow: 'The odd one out',
      head: 'VIX dropped\n4.17% today',
      say: 'Stocks red. Fear down 4%.',
      ask: 'Calmer options. Why?',   // 낭독 6.6s → 압축 (컷이 7초로 늘어졌다)
      visual: { kind: 'versus', aK: 'DOW', aV: '-0.85%', bK: 'VIX', bV: '-4.17%' },
    },
    {
      role: 'evidence',
      eyebrow: 'The regime, on screen',
      head: 'Mixed tape.\nRisk dial: 43.',
      say: 'The engine calls it a mixed tape.',
      ask: 'So where was the strength?',
      // 좌표는 close-dash.png 에 PIL 로 실측·검증 (dash_co.png)
      visual: {
        kind: 'shot',
        src: 'shorts/appshots/close-dash.png',
        focus: { x: 0.03, y: 0.045, w: 0.94 },
        callout: { box: { x: 0.74, y: 0.157, w: 0.185, h: 0.05 }, label: 'RISK 43' },
      },
    },
    {
      role: 'money',
      eyebrow: 'Under the surface',
      head: 'Energy led.\nMaterials lagged.',
      say: 'The sector map split in two.',
      ask: 'Who made the loudest move?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'ENERGY', v: '+1.6%', up: true },
          { k: 'TECH', v: '+0.1%', up: true, note: 'post session' },
          { k: 'MATERIALS', v: '-1.4%', up: false },
        ],
      },
    },
    {
      role: 'depth',
      eyebrow: 'The tape of the day',
      head: 'Earnings did\nthe talking',
      say: 'Record revenue. A 10% pop.',   // 원문장은 «one» 외톨이 줄을 만들었다
      ask: "And the session's $900 star?",
      visual: {
        kind: 'source', outlet: 'SIGNUM News Pulse', at: 'today',
        headline: 'SoundHound AI surged 10.11% after record Q2 revenue of $61.9M',
        body: 'Smaller-than-expected loss; 2026 guidance raised to $245M.',
      },
    },
    {
      role: 'chips',
      eyebrow: 'The pin did not hold',
      head: 'Micron faded\nto $888.90',
      say: 'MU slipped off the $900 line.',
      ask: 'What did the macro board say?',
      visual: {
        kind: 'logos',
        items: [
          { t: 'SPCX', pct: '+5.41%', up: true },
          { t: 'NVDA', pct: '+0.15%', up: true },
          { t: 'MU', pct: '-0.48%', up: false },
        ],
      },
    },
    {
      role: 'money',
      eyebrow: 'The macro board',
      head: 'Yields up.\nOil up. Gold flat.',
      say: 'The 10-year pushed to 4.67%.',
      ask: 'And the overnight tape?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'US 10Y', v: '4.67%', up: true, note: '+1.15bp' },
          { k: 'OIL', v: '$78.1', up: true, note: '+1.04%' },
          { k: 'GOLD', v: '$4,304', up: true, note: '+0.11%' },
        ],
      },
    },
    {
      role: 'verdict',
      eyebrow: 'Two dials, one tape',
      head: 'Greed 59.7.\nRisk 43.',
      say: 'The dials disagree at the close.',
      ask: 'Which one matched the tape?',
      sec: 4.5,
      visual: { kind: 'versus', aK: 'FEAR & GREED', aV: '59.7 GREED', bK: 'RISK DIAL', bV: '43' },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Which dial would you\nread first?',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SCRIPT_T2 — 장시작 전 모닝브리핑 1호 (2026-08-10 KST 새벽 캡처 실측)
// 숫자 출처: public/shorts/appshots/t2-dash.txt · t2-guardian.txt (같은 순간)
// 서사: 탐욕(F&G 64)은 돌아왔는데 머신(RLSI 50)은 중립 — 그리고 Fed 시계 D-39.
// 배경: BRIGHT 캐넌 v2 — 훅=아침 금융가(영상), VIX=거울 바다(영상), Fed=기둥(영상)
// 콜아웃 좌표: PIL 선검증 (co_dash2.png · co_guardian2.png, 2026-08-10)
// ═══════════════════════════════════════════════════════════════════════════
export const SCRIPT_T2: BriefingProps = {
  voice: VOICE_T2,
  title: 'Green board, quiet fear.\nOne dial disagrees.',
  date: 'AUG 10 · BEFORE THE OPEN',
  data: { seed: 'T2-0810' },
  tape: [
    { t: 'NASDAQ', v: '+1.30%', up: true }, { t: 'S&P 500', v: '+0.62%', up: true },
    { t: 'DOW', v: '+0.28%', up: true }, { t: 'VIX', v: '14.90', up: false },
    { t: 'QQQ', v: '$723.03', up: true }, { t: 'SPY', v: '$773.26', up: true },
    { t: 'NQ100 F', v: '+1.18%', up: true }, { t: 'R2K F', v: '+1.08%', up: true },
  ],
  hook: {
    line: 'Every index closed\nhigher on Friday.',
    sub: 'Volatility closed lower too.',
    syms: ['SP500', 'NASDAQ', 'DOW'],
    stamp: 'AUG 10 · 7:32 AM ET',
    bg: { kind: 'video', src: 'shorts/broll/video/sd25_riskon_morning.mp4', loopFrames: 148 },
  },
  loop: 'Every index moved.\nThe machine did not.',

  beats: [
    {
      role: 'market',
      eyebrow: 'The board this morning',
      head: 'Index futures\nall lean green',
      say: 'This morning the futures board is green.',
      ask: 'So what did Friday actually close at?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'NASDAQ100 F', v: '+1.18%', up: true, sym: 'NASDAQ' },
          { k: 'S&P500 F', v: '+0.58%', up: true, sym: 'SP500' },
          { k: 'RUSSELL2K F', v: '+1.08%', up: true, sym: 'RUSSELL' },
        ],
      },
    },
    {
      role: 'money',
      eyebrow: 'The handoff',
      head: 'Friday closed\nhigher everywhere',
      say: 'Friday closed green. Nasdaq up one point three.',
      ask: 'And the mood this morning?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'NASDAQ', v: '+1.30%', up: true, sym: 'NASDAQ' },
          { k: 'S&P 500', v: '+0.62%', up: true, sym: 'SP500' },
          { k: 'DOW', v: '+0.28%', up: true, sym: 'DOW' },
        ],
      },
    },
    {
      role: 'evidence',
      eyebrow: 'Straight from the screen',
      head: 'The machine tilts\nRisk-On · 72',
      say: 'The machine tilts Risk-On. Risk reads 72.',
      ask: 'So everyone is calm?',
      visual: {
        kind: 'shot',
        src: 'shorts/appshots/t2-dash.png',
        focus: { x: 0.03, y: 0.100, w: 0.94 },
        callout: { box: { x: 0.742, y: 0.151, w: 0.185, h: 0.056 }, label: 'RISK 72' },
      },
    },
    {
      role: 'depth',
      eyebrow: 'The volatility dial',
      head: 'VIX sleeps\nunder fifteen',
      say: 'Volatility sleeps under fifteen.',
      ask: 'Then where is the tension?',
      bg: { kind: 'video', src: 'shorts/broll/video/sd25_calm_sea.mp4', loopFrames: 148 },
      visual: { kind: 'stat', label: 'VIX · VOLATILITY', value: '14.90', sub: '-1.65% · as of Aug 8 close', up: false, sym: 'VIX' },
    },
    {
      role: 'evidence',
      eyebrow: 'The crowd dial',
      head: 'Fear & Greed\nprints 64',
      say: 'Fear and Greed prints 64. Greed.',
      ask: 'But the neutral dial?',
      visual: {
        kind: 'shot',
        src: 'shorts/appshots/t2-guardian.png',
        focus: { x: 0.04, y: 0.098, w: 0.92 },
        callout: { box: { x: 0.070, y: 0.137, w: 0.205, h: 0.060 }, label: 'GREED 64' },
      },
    },
    {
      role: 'conflict',
      eyebrow: 'Two dials disagree',
      head: 'Crowd greedy.\nMachine neutral.',
      say: 'The machine index holds at fifty.',
      ask: 'Greed says go. The machine says wait.',
      visual: { kind: 'versus', aK: 'FEAR&GREED', aV: '64 GREED', bK: 'RLSI', bV: '50 NEUTRAL', aSym: 'FEARGREED', bSym: 'RLSI' },
    },
    {
      role: 'depth',
      eyebrow: 'The clock above it all',
      head: 'FedWatch leans\n57% to a hold',
      say: 'FedWatch: fifty-seven percent odds of a hold.',
      ask: 'Thirty-nine days on the clock.',
      bg: { kind: 'video', src: 'shorts/broll/video/sd25_fed_columns.mp4', loopFrames: 148 },
      visual: { kind: 'stat', label: 'FEDWATCH · FOMC D-39', value: '57%', sub: 'hold odds · vs hike 43%', up: true, sym: 'FED' },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Greed, or neutral —\nwhich dial reads true?',
  },
};
