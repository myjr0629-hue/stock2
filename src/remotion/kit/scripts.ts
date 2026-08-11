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
import { VOICE_CLOSE811 } from './voice-close811';
import { VOICE_T2 } from './voice-t2';
import { VOICE_T4 } from './voice-t4';
import { VOICE_T2B } from './voice-t2b';

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
      prio: 1,
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
      prio: 1,
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
      role: 'money',
      prio: 2,
      eyebrow: 'Where the money went',
      head: 'Tech and retail led.\nEnergy lagged.',
      say: 'Tech and consumer discretionary led. Energy lagged.',
      ask: 'Was the buying broad, or just a few names?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'CONS. DISC', v: '+1.5%', up: true, sym: 'CONSUMER' },
          { k: 'TECH', v: '+1.4%', up: true, sym: 'TECH' },
          { k: 'ENERGY', v: '-1.1%', up: false, sym: 'ENERGY' },
        ],
      },
    },
    {
      role: 'evidence',
      prio: 2,
      eyebrow: 'How broad the green was',
      head: 'Advancers beat\ndecliners 3 to 1',
      say: 'Advancers beat decliners nearly three to one.',
      ask: 'So is anything holding back?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'A/D RATIO', v: '2.91 : 1', up: true, sym: 'RISK' },
          { k: 'ADVANCERS', v: '73%', up: true, sym: 'SP500' },
          { k: 'BUY VOLUME', v: '71.0%', up: true, sym: 'NASDAQ' },
        ],
      },
    },
    {
      role: 'evidence',
      prio: 1,
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
      prio: 2,
      eyebrow: 'The volatility dial',
      head: 'VIX sleeps\nunder fifteen',
      say: 'Volatility sleeps under fifteen.',
      ask: 'Then where is the tension?',
      bg: { kind: 'video', src: 'shorts/broll/video/sd25_calm_sea.mp4', loopFrames: 148 },
      visual: { kind: 'stat', label: 'VIX · VOLATILITY', value: '14.90', sub: '-1.65% · as of Aug 8 close', up: false, sym: 'VIX' },
    },
    {
      role: 'evidence',
      prio: 1,
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
      role: 'depth',
      prio: 3,
      eyebrow: 'Under the open book',
      head: 'Liquidity reads\ndry at 19',
      say: 'Dark pool takes almost a quarter of volume. Liquidity reads dry.',
      ask: 'That is the part a green board does not show.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'DARK POOL', v: '23.9%', up: true, sym: 'RISK' },
          { k: 'SQUEEZE RISK', v: 'HIGH · 56%', up: false, sym: 'VIX' },
          { k: 'LIQUIDITY', v: '19 · DRY', up: false, sym: 'FED' },
        ],
      },
    },
    {
      role: 'conflict',
      prio: 1,
      eyebrow: 'Two dials disagree',
      head: 'Crowd greedy.\nMachine neutral.',
      say: 'The machine index holds at fifty.',
      ask: 'Greed says go. The machine says wait.',
      visual: { kind: 'versus', aK: 'FEAR&GREED', aV: '64 GREED', bK: 'RLSI', bV: '50 NEUTRAL', aSym: 'FEARGREED', bSym: 'RLSI' },
    },
    {
      role: 'depth',
      prio: 2,
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

// ============================================================================
// SCRIPT_T4 — 장마감 브리핑 (2026-08-11 장마감 직후 실캡처)
// ----------------------------------------------------------------------------
// 숫자 출처: public/shorts/appshots/t4-{dash,guardian,intel}.txt — 전부 실측값.
//
// 오늘의 이야기: **지수는 거의 안 움직였는데, 그 아래는 전부 갈라졌다.**
//   · 다크풀 60.6% — 오늘 거래량의 절반 이상이 거래소를 안 거쳤다  ← 훅
//   · 지수는 −0.06 ~ −0.32%로 «아무 일 없음»처럼 보인다
//   · 그런데 VIX 는 +3.76% 올랐다 (보합 테이프 위에서 공포만 올랐다)
//   · 반도체가 부러졌다: SOX −2.94% · NVDA −2.86% · MU −1.89%
//   · 돈은 반대로 갔다: 에너지 +4.7% · 헬스케어 +1.7% vs 테크 −0.9%
//   · 금 +1.05% $4,466 — 방어 매수
//   · 폭: A/D 0.64:1 «Overwhelming Sell» · 상승 38% / 하락 62%
//   · 기계: RLSI 44 · 참여 32 Caution · 가격추세 29 Weak
//   · 시계: FOMC D-36 — 인상 51.2%가 앞선다
//
// 속도감(대표 지시): say 는 «한 문장», ask 는 «한 마디». 비트당 3초대를 목표로 한다.
// ============================================================================
// ============================================================================
// SCRIPT_CLOSE811 — 「지수는 빠졌는데 반도체는 올랐다」 · 2026-08-11 ET 마감 실측
// ----------------------------------------------------------------------------
// ★ 숫자 출처 — 두 갈래로 나뉜다. 섞지 않는다.
//   [A] 캡처 c812-dash.txt 중 «CLOSED» 로 표시된 것과 우리 고유 지표만 쓴다:
//       NASDAQ 26,445 -0.60% · S&P 500 7,728.20 -0.32% · DOW 53,792 -0.34%
//       다크풀 42.7% (11.4M) · F&G 60.8 GREED · RISK 51
//   [B] 개별 종목·섹터는 Polygon 공식 종가로 «다시 확인한 값»만 쓴다 (2026-08-12 실조회):
//       SOXX +0.91% · MU 868.52 +0.87% · NVDA 217.50 -0.02%
//       XLE +1.25% · XLU +1.16% · XLK -0.12% · XLI +0.60% · XLV -0.26%
//
//   ⛔ 캡처의 TOP MOVERS 블록은 쓰지 않는다 — 두 가지 이유로 위험하다:
//      ① 마감 후에도 «시간외» 값이 흐른다. 실제로 NVDA 를 +0.23% 로 표시했지만
//         공식 종가는 -0.02% 였다. 그대로 썼으면 "엔비디아도 올랐다"는 거짓말이 나갔다.
//      ② 소형·마이너 종목이 섞여 들어온다 (대표 지시 2026-08-12).
//   ⛔ SECTOR HEATMAP 도 「POST」 표기가 붙어 있으면 시간외다. 실제로 유틸리티를 1위로
//      보여줬지만 공식 종가 1위는 에너지였다(+1.25% vs +1.16%). 섹터는 ETF 종가로 다시 잰다.
//   ⛔ VIX 도 뺐다 — 우리 Polygon 플랜은 I:VIX 를 주지 않아 «독립 검증»이 불가능하다.
//      검증 못 하는 숫자는 화면에 올리지 않는다.
//
//   ⇒ 규칙: 캡처는 «무엇을 말할지»를 고르는 데 쓰고, 화면에 나가는 개별 수치는
//     반드시 1차 출처로 다시 잰다. 캡처의 라이브 블록을 그대로 옮기면 거짓말이 나간다.
//
// ★ 인사이트 = 직접 계산 (Polygon 일봉, 2021-01 ~ 2026-08-04, QQQ/SOXX 대용):
//   조건 «지수 하락 + 반도체 상승» = 103건
//     · 반도체 5일 뒤 상승 58%  (대조군 56%)  → 우위 사실상 없음
//     · 지수  5일 뒤 상승 54%  (대조군 58%)  → 오히려 평균보다 나쁘다
//     · 반도체 5일 중앙 수익률 +0.36% (대조군 +0.64%)
//   ⇒ «반도체가 지수를 이긴 날은 바닥 신호»라는 통념이 데이터로 깨진다.
//     우위가 없을 때 그걸 그대로 말하는 것도 소재다 (kit/insight.ts noEdgeBeat).
//
// 컴플라이언스: 과거 빈도 서술만. 미래형 동사 0. 「SIGNUM READ」로 사실과 해석 분리.
// ============================================================================
export const SCRIPT_CLOSE811: BriefingProps = {
  voice: VOICE_CLOSE811,
  title: 'Red close.\nGreen chips.',
  date: 'AUG 11 · AFTER THE CLOSE',
  data: { seed: 'CLOSE811' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['NVDA', 'MU', 'SPY', 'AAPL'],
  tape: [
    { t: 'NASDAQ', v: '-0.60%', up: false }, { t: 'S&P 500', v: '-0.32%', up: false },
    { t: 'DOW', v: '-0.34%', up: false }, { t: 'SEMIS', v: '+0.91%', up: true },
    { t: 'MU', v: '+0.87%', up: true }, { t: 'NVDA', v: '-0.02%', up: false },
    { t: 'DARK POOL', v: '42.7%', up: true }, { t: 'US10Y', v: '4.68%', up: false },
  ],
  hook: {
    line: 'The Nasdaq fell.\nChips went up.',
    sub: 'Nvidia did not move at all.',
    syms: ['NVDA'],
    stamp: 'AUG 11 · AFTER THE CLOSE',
  },
  loop: 'Two tapes closed today.\nOnly one was red.',

  beats: [
    {
      // prio 2 — 훅이 이미 «지수가 빠졌다»를 말한다. 짧은 판에서는 이 확인 비트를 버려야
      // 틱톡 창(28~38s)에 들어간다. prio 1 로 두면 40.4s 가 나와 창을 넘는다(실측).
      role: 'market', prio: 2,
      eyebrow: 'The board',
      head: 'All three\nclosed red',
      say: 'Nasdaq down zero point six. S&P down zero point three.',
      ask: 'So it was a risk-off day?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'NASDAQ', v: '-0.60%', up: false, sym: 'NASDAQ' },
          { k: 'S&P 500', v: '-0.32%', up: false, sym: 'SP500' },
          { k: 'DOW', v: '-0.34%', up: false, sym: 'DOW' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      eyebrow: 'Except for one shelf',
      head: 'Semiconductors\nclosed up 0.9%',
      say: 'Semiconductors closed up nine tenths of a percent. Micron finished up almost one.',
      ask: 'And the biggest chip name did nothing.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'SEMIS', v: '+0.91%', up: true, sym: 'SEMIS' },
          { k: 'MU', v: '+0.87%', up: true, sym: 'MU' },
          { k: 'NVDA', v: '-0.02%', up: false, sym: 'NVDA' },
        ],
      },
    },
    {
      // ★ 우리 고유 데이터 — 공개 시세로는 볼 수 없는 층. 이게 채널이 파는 것이다.
      role: 'depth', prio: 2,
      eyebrow: 'The layer a red board hides',
      head: 'Dark pool took\n42.7% of volume',
      say: 'Almost forty-three percent of volume never touched the public exchange.',
      ask: 'The board is red. The prints are not public.',
      visual: { kind: 'stat', label: 'DARK POOL SHARE', value: '42.7%', sub: 'institutional prints, 11.4M', up: true },
    },
    {
      role: 'money', prio: 2,
      eyebrow: 'Where the money went',
      head: 'Energy and utilities\nled the tape',
      say: 'Energy led. Utilities second. Technology finished slightly red.',
      ask: 'Oil and defense on top of a red board.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'ENERGY', v: '+1.25%', up: true },
          { k: 'UTILITIES', v: '+1.16%', up: true },
          { k: 'TECHNOLOGY', v: '-0.12%', up: false },
        ],
      },
    },
    {
      role: 'conflict', prio: 2,
      eyebrow: 'Crowd versus machine',
      head: 'Greed 60.8.\nRisk dial 51.',
      say: 'Fear and Greed prints sixty point eight. Our risk dial reads fifty-one.',
      ask: 'The crowd is warmer than the machine.',
      visual: { kind: 'versus', aK: 'FEAR&GREED', aV: '60.8 GREED', bK: 'RISK DIAL', bV: '51', aSym: 'FEARGREED', bSym: 'RISK' },
    },
    {
      // ★★ 인사이트 비트 — 우위가 «없다»는 것을 세어서 보여준다 (kit/insight.ts noEdgeBeat 형식)
      role: 'evidence', prio: 1,
      eyebrow: 'SIGNUM BASE RATE',
      head: 'We counted\n103 of them',
      say: 'We checked every session like this since 2021. One hundred and three.',
      ask: 'Chips were higher 58 percent of the time.',
      visual: {
        kind: 'rows',
        rows: [
          // sym 을 «반드시» 준다. 안 주면 resolveSymbol 이 키 앞 4글자를 잘라
          // 「EVEN」「ANYG」 같은 깨진 배지를 만든다 (2026-08-12 프레임 검수에서 발견).
          { k: 'EVENTS SINCE 2021', v: '103', up: true, sym: 'RISK' },
          { k: 'CHIPS HIGHER IN 5D', v: '58%', up: true, sym: 'SEMIS' },
          { k: 'ANY GIVEN DAY', v: '56%', up: false, sym: 'SEMIS' },
        ],
      },
    },
    {
      // ★ 통념이 깨지는 지점 — 지수는 오히려 «평균보다» 나빴다
      role: 'depth', prio: 1,
      eyebrow: 'The part that breaks it',
      head: 'The index did\nworse, not better',
      say: 'And the index itself was higher only 54 percent, against 58 on any day.',
      ask: 'The bounce signal is not a signal.',
      visual: {
        kind: 'versus',
        aK: 'AFTER THIS SETUP', aV: '54%', aSym: 'NASDAQ',
        bK: 'ANY GIVEN DAY', bV: '58%', bSym: 'NASDAQ',
      },
    },
    {
      // ★ 의견 비트 — 사실과 시각·청각 양쪽으로 분리한다
      role: 'verdict', prio: 1,
      eyebrow: 'SIGNUM READ',
      head: 'The split is real.\nThe edge is not.',
      say: 'Our read: the split is real. The edge is not.',
      ask: 'One hundred and three times. A coin flip.',
      visual: { kind: 'stat', label: 'SIGNUM READ · AUG 11', value: 'NO EDGE', sub: '103 events, 58% vs 56% baseline', up: false, sym: 'RISK' },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Green chips, red board —\nwhich one would you trade?',
  },
};

// ============================================================================
// SCRIPT_OIL — 「원유가 이끈 날」 · 인사이트 비트를 «먼저» 정하고 쓴 1호 대본
// ----------------------------------------------------------------------------
// 이 대본이 다른 이유: 소재를 고르고 인사이트를 찾은 게 아니라, **계산을 먼저 돌리고**
// 우위가 나온 조건을 소재로 삼았다. `node scripts/morning-edge.mjs` 12개 조건 중
// 판정선(표본 40+ · 대조군 대비 8%p+)을 넘은 유일한 조건이 «원유 하루 +4%» 였다.
//
// ★ 화면·낭독에 나가는 모든 숫자의 출처 (2026-08-12 Polygon 실조회, 일봉 종가 기준):
//   최신 세션 2026-08-11 — USO +1.34% · XLE +1.25% · XLK -0.12% · SPY -0.32%
//                          에너지-기술 격차 +1.37%p
//   베이스레이트 — 원유 하루 +4% 이상, 2021-01 ~ 2026-07-29, **50건**
//     · 5거래일 뒤 에너지 상승 66% (대조군 57%)
//     · 에너지 중앙 수익률 +1.85% (대조군 +0.58%)
//     · 에너지 > S&P 64% · 초과 중앙 +1.72%p (대조군 초과 중앙 -0.05%p)
//     · 최근 2건은 반대로 갔다 — 07-23 -0.7% · 07-29 -2.3%  ← 반증 조건으로 대본에 넣는다
//
// 컴플라이언스: 과거 빈도의 서술만. 미래형 동사 0. 「SIGNUM READ」 로 사실과 해석 분리.
// ============================================================================
export const SCRIPT_OIL: BriefingProps = {
  title: 'Oil led.\nNobody was watching.',
  date: 'AUG 11 · THE SESSION',
  data: { seed: 'OIL-0811' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['XOM', 'CVX', 'NVDA', 'SPY'],
  tape: [
    { t: 'OIL', v: '+1.34%', up: true }, { t: 'ENERGY', v: '+1.25%', up: true },
    { t: 'TECH', v: '-0.12%', up: false }, { t: 'S&P 500', v: '-0.32%', up: false },
    { t: 'GOLD', v: '$4,466', up: true }, { t: 'VIX', v: '15.46', up: true },
  ],
  hook: {
    line: 'Energy beat tech\nby 1.4 points.',
    sub: 'On a day the S&P went down.',
    syms: ['XOM'],
    stamp: 'AUG 11 · THE SESSION',
  },
  loop: 'The shock is the headline.\nThe rotation is the trade.',

  beats: [
    {
      role: 'market', prio: 1,
      eyebrow: 'What the board showed',
      head: 'The index fell.\nEnergy did not.',
      say: 'The S&P closed down. Energy closed up one and a quarter percent.',
      ask: 'One day, or a pattern?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'ENERGY', v: '+1.25%', up: true },
          { k: 'TECH', v: '-0.12%', up: false },
          { k: 'S&P 500', v: '-0.32%', up: false },
        ],
      },
    },
    {
      role: 'money', prio: 2,
      eyebrow: 'What moved it',
      head: 'Oil closed up\n1.34%',
      say: 'Crude closed up one point three four percent.',
      ask: 'And what does everyone say that means?',
      visual: { kind: 'stat', label: 'CRUDE OIL', value: '+1.34%', sub: 'session close, Aug 11', up: true },
    },
    {
      role: 'conflict', prio: 1,
      eyebrow: 'The obvious read',
      head: 'Oil up means\nstocks down',
      say: 'Higher oil means higher costs. Higher costs mean lower stocks.',
      ask: 'That is the story. Is it true?',
      visual: { kind: 'versus', aK: 'THE STORY', aV: 'OIL UP', bK: 'THE STORY', bV: 'STOCKS DOWN' },
    },
    {
      // ★★ 인사이트 비트 — kit/insight.ts baseRateBeat 과 같은 형식. 이게 상품이다.
      role: 'evidence', prio: 1,
      eyebrow: 'SIGNUM BASE RATE',
      head: 'We counted\n50 of them',
      say: 'We checked every oil shock since 2021. Fifty of them.',
      ask: 'Sixty-six percent were higher five days later.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'EVENTS SINCE 2021', v: '50', up: true },
          { k: 'ENERGY HIGHER IN 5D', v: '66%', up: true },
          { k: 'ANY GIVEN DAY', v: '57%', up: false },
        ],
      },
    },
    {
      // ★ 더 날카로운 숫자 — 절대 상승률이 아니라 «초과 수익»
      role: 'depth', prio: 1,
      eyebrow: 'The sharper number',
      head: 'Energy beat the S&P\n64% of the time',
      say: 'Energy beat the index sixty-four percent of the time, by one point seven points.',
      ask: 'On any given day that edge is zero.',
      visual: {
        kind: 'versus',
        aK: 'AFTER AN OIL SHOCK', aV: '+1.72%p',
        bK: 'ANY GIVEN DAY', bV: '-0.05%p',
      },
    },
    {
      // ★ 반증 조건 — 우리 주장이 틀리는 모습을 «우리가 먼저» 보여준다
      role: 'conflict', prio: 2,
      eyebrow: 'Where it failed',
      head: 'The last two\nwent the other way',
      say: 'The last two events went the other way. Minus zero point seven, then minus two point three.',
      ask: 'A base rate is not a promise.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'JUL 13 · OIL +8.4%', v: '+2.1%', up: true },
          { k: 'JUL 23 · OIL +5.9%', v: '-0.7%', up: false },
          { k: 'JUL 29 · OIL +7.3%', v: '-2.3%', up: false },
        ],
      },
    },
    {
      role: 'evidence', prio: 2,
      eyebrow: 'The part that surprises',
      head: 'The index itself\nrose 64%',
      say: 'And the index itself was higher sixty-four percent of the time.',
      ask: 'The oil scare did not sink the market.',
      visual: { kind: 'stat', label: 'S&P HIGHER IN 5 DAYS', value: '64%', sub: '50 oil shocks since 2021', up: true },
    },
    {
      // ★ 의견 비트 — 사실과 시각·청각 양쪽으로 분리한다
      role: 'verdict', prio: 1,
      eyebrow: 'SIGNUM READ',
      head: 'The shock was never\nthe trade',
      say: 'Our read: the shock was never the trade. The rotation was.',
      ask: 'Fifty times. Not a forecast.',
      visual: { kind: 'stat', label: 'SIGNUM READ · AUG 11', value: 'ROTATION', sub: 'energy over index, 50-event base rate', up: true },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'The scare, or the rotation —\nwhich one did you read?',
  },
};

export const SCRIPT_T4: BriefingProps = {
  voice: VOICE_T4,
  title: 'Flat close.\nBroken underneath.',
  date: 'AUG 11 · AFTER THE CLOSE',
  data: { seed: 'T4-0811' },
  tape: [
    { t: 'NASDAQ', v: '-0.32%', up: false }, { t: 'S&P 500', v: '-0.06%', up: false },
    { t: 'DOW', v: '-0.11%', up: false }, { t: 'VIX', v: '15.46', up: true },
    { t: 'SOX', v: '-2.94%', up: false }, { t: 'GOLD', v: '$4,466', up: true },
    { t: 'NVDA', v: '-2.86%', up: false }, { t: 'US10Y', v: '4.70%', up: true },
  ],
  // 그날 주목 종목 — 배경에 «실제 로고»로 흩뿌려진다 (components/TickerField)
  // 출처: t4-dash.txt TOP MOVERS + t4-intel.txt LEAD NAME
  field: ['NVDA', 'MU', 'SPCX', 'AAPL'],
  hook: {
    line: 'Nvidia fell\nalmost 3%.',
    sub: 'The S&P 500 didn\u2019t move.',
    syms: ['NVDA'],
    stamp: 'AUG 11 · AFTER THE CLOSE',
    bg: { kind: 'video', src: 'shorts/bg/morning/morning-06-city-waking-above-golden.mp4', loopFrames: 148 },
  },
  loop: 'The board closed flat.\nNothing under it was.',

  beats: [
    {
      role: 'market', prio: 1,
      eyebrow: 'The closing board',
      head: 'Every index\nclosed red',
      say: 'Every index closed red. Barely.',
      ask: 'So a quiet day?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'NASDAQ', v: '-0.32%', up: false, sym: 'NASDAQ' },
          { k: 'S&P 500', v: '-0.06%', up: false, sym: 'SP500' },
          { k: 'DOW', v: '-0.11%', up: false, sym: 'DOW' },
        ],
      },
    },
    {
      role: 'depth', prio: 1,
      eyebrow: 'The volatility dial',
      head: 'VIX rose\nnearly 4%',
      say: 'No. Volatility rose almost four percent.',
      ask: 'Fear went up on a flat tape.',
      visual: { kind: 'stat', label: 'VIX · VOLATILITY', value: '15.46', sub: '+3.76% on the day', up: true, sym: 'VIX' },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/hook/hook-01-extreme-macro-shot-silicon.mp4', loopFrames: 148 },
      eyebrow: 'What actually broke',
      head: 'Semis fell\nalmost 3%',
      say: 'Semiconductors fell almost three percent.',
      ask: 'Where did the money go?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'SOX', v: '-2.94%', up: false, sym: 'SEMIS' },
          { k: 'NVDA', v: '-2.86%', up: false, sym: 'NVDA' },
          { k: 'MU', v: '-1.89%', up: false, sym: 'MU' },
        ],
      },
    },
    {
      role: 'money', prio: 1,
      eyebrow: 'The other side of the trade',
      head: 'Energy rose\nalmost 5%',
      say: 'Into energy. It rose almost five percent.',
      ask: 'The same day tech fell.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'ENERGY', v: '+4.7%', up: true, sym: 'ENERGY' },
          { k: 'HEALTHCARE', v: '+1.7%', up: true, sym: 'HEALTH' },
          { k: 'TECH', v: '-0.9%', up: false, sym: 'TECH' },
        ],
      },
    },
    {
      role: 'evidence', prio: 2,
      eyebrow: 'The defensive bid',
      head: 'Gold closed\nat 4,466',
      say: 'Gold closed higher at four thousand four sixty six.',
      ask: 'Someone paid up for safety.',
      visual: { kind: 'stat', label: 'GOLD · SPOT', value: '$4,466', sub: '+1.05% on the day', up: true, sym: 'GOLD' },
    },
    {
      role: 'evidence', prio: 2,
      eyebrow: 'How broad the red was',
      head: 'Decliners beat\nadvancers',
      say: 'Decliners beat advancers, nearly two to one.',
      ask: 'The flat close was not broad.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'A/D RATIO', v: '0.64 : 1', up: false, sym: 'RISK' },
          { k: 'DECLINERS', v: '62%', up: false, sym: 'SP500' },
          { k: 'BUY VOLUME', v: '49.3%', up: false, sym: 'NASDAQ' },
        ],
      },
    },
    {
      role: 'depth', prio: 1,
      eyebrow: 'Under the open book',
      head: 'Dark pool took\n60.6% of volume',
      say: 'Dark pool took sixty point six percent of volume.',
      ask: 'That is where the size went.',
      visual: { kind: 'stat', label: 'DARK POOL · INSTITUTIONAL', value: '60.6%', sub: 'DP 16.8M prints', up: true, sym: 'RISK' },
    },
    {
      role: 'conflict', prio: 1,
      eyebrow: 'Two readings disagree',
      head: 'Crowd greedy.\nMachine cautious.',
      say: 'Fear and Greed still prints 64. The machine reads 44.',
      ask: 'Greed says fine. The machine says careful.',
      visual: { kind: 'versus', aK: 'FEAR&GREED', aV: '64 GREED', bK: 'RLSI', bV: '44 CAUTION', aSym: 'FEARGREED', bSym: 'RLSI' },
    },
    {
      role: 'evidence', prio: 3,
      eyebrow: 'What the machine saw',
      head: 'Participation\nreads 32',
      say: 'Participation 32. Price trend 29. Both weak.',
      ask: 'The engine under the rally is quiet.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'PARTICIPATION', v: '32 · CAUTION', up: false, sym: 'RLSI' },
          { k: 'PRICE TREND', v: '29 · WEAK', up: false, sym: 'RISK' },
          { k: 'ROTATION', v: '100 · ROBUST', up: true, sym: 'FEARGREED' },
        ],
      },
    },
    {
      role: 'depth', prio: 2,
      eyebrow: 'The clock above it all',
      head: 'Hike risk\nnow leads',
      say: 'FedWatch puts a hike at fifty-one percent.',
      ask: 'Thirty-six days to the decision.',
      visual: { kind: 'stat', label: 'FEDWATCH · FOMC D-36', value: '51.2%', sub: 'hike odds · vs hold 48.8%', up: true, sym: 'FED' },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Flat on top.\nWhich layer did you watch?',
  },
};

// ============================================================================
// SCRIPT_T2B — 모닝 브리핑 (2026-08-11 프리마켓 실캡처)
// ----------------------------------------------------------------------------
// 숫자 출처: public/shorts/appshots/t2b-{dash,guardian}.txt — 전부 실측값.
//
// 오늘의 이야기 = **모순**:
//   어제 반도체가 −2.94% 로 부러졌다. 그런데 오늘 아침 가장 큰 헤드라인은
//   «또 다른 회사가 반도체에 168억 달러를 넣는다»(Tesla·SpaceX Terafab).
//   테이프와 자본지출이 반대 방향을 가리키고 있다 — 이게 오늘의 관전 포인트다.
//
// ⚖️ 컴플라이언스 (정본 .agent/BUFFER_OPS §0 rule 7):
//   «의견»은 넣되 **예측 프레이밍 금지**. will·expect·should·watch for·headed 등
//   미래를 함의하는 동사·은유를 쓰지 않는다. 지금 상태의 «해석»만 말한다.
//   의견 비트는 eyebrow 를 'SIGNUM READ' 로 명시해 사실과 시각적으로 분리한다.
//   면책 밴드(하단)는 프레임0부터 상시 노출된다.
// ============================================================================
export const SCRIPT_T2B: BriefingProps = {
  voice: VOICE_T2B,
  title: 'Chips broke.\nCapex did not.',
  date: 'AUG 11 · BEFORE THE OPEN',
  data: { seed: 'T2B-0811' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['NVDA', 'MU', 'TSLA', 'INTC'],
  tape: [
    { t: 'NQ100 F', v: '+0.32%', up: true }, { t: 'S&P500 F', v: '+0.15%', up: true },
    { t: 'R2K F', v: '+0.19%', up: true }, { t: 'VIX', v: '15.49', up: true },
    { t: 'SOX', v: '-2.94%', up: false }, { t: 'GOLD', v: '$4,446', up: true },
    { t: 'NVDA', v: '+1.08%', up: true }, { t: 'US10Y', v: '4.70%', up: true },
  ],
  hook: {
    line: 'Chips fell 3%\nyesterday.',
    sub: 'Today someone bet $16.8B on them.',
    syms: ['NVDA'],
    stamp: 'AUG 11 · BEFORE THE OPEN',
    bg: { kind: 'video', src: 'shorts/bg/brief/brief-01-extreme-macro-silicon-wafer.mp4', loopFrames: 148 },
  },
  loop: 'The tape said sell.\nThe capex said build.',

  beats: [
    {
      role: 'market', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/stylized/stylized-02-tiltshift-miniature-semiconductor-fab.mp4', loopFrames: 148 },
      eyebrow: 'What just happened',
      head: 'Tesla and SpaceX\ncommitted $16.8B',
      say: 'Tesla and SpaceX committed sixteen point eight billion dollars to a Texas chip plant.',
      ask: 'How big is that, really?',
      visual: { kind: 'stat', label: 'TERAFAB · TEXAS', value: '$16.8B', sub: 'semiconductor plant commitment', up: true, sym: 'TSLA' },
    },
    {
      role: 'evidence', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/stylized/stylized-01-anime-style-crisp-cel.mp4', loopFrames: 148 },
      eyebrow: 'The scale of it',
      head: '4.4 times\nTesla\u2019s annual profit',
      say: 'That is four point four times Tesla\u2019s annual profit.',
      ask: 'And the chip tape yesterday?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'TERAFAB COMMITMENT', v: '$16.8B', up: true, sym: 'TSLA' },
          { k: 'TESLA ANNUAL PROFIT', v: '$3.8B', up: false, sym: 'TSLA' },
          { k: 'RATIO', v: '4.4 x', up: true, sym: 'RISK' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/hook/hook-01-extreme-macro-shot-silicon.mp4', loopFrames: 148 },
      eyebrow: 'The other direction',
      head: 'Semis closed\ndown 2.94%',
      say: 'Semiconductors closed down almost three percent yesterday.',
      ask: 'Two signals, opposite directions.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'SOX', v: '-2.94%', up: false, sym: 'SEMIS' },
          { k: 'NASDAQ', v: '-0.32%', up: false, sym: 'NASDAQ' },
          { k: 'S&P 500', v: '-0.06%', up: false, sym: 'SP500' },
        ],
      },
    },
    {
      // ★ 의견 비트 — 사실이 아니라 «해석»임을 라벨로 분리한다
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/hook/hook-05-extreme-macro-liquid-mercury.mp4', loopFrames: 148 },
      eyebrow: 'SIGNUM READ',
      head: 'Price and capex\ndisagree today',
      say: 'Our read: price and capital spending are pointing opposite ways.',
      ask: 'That gap is the story, not a verdict.',
      visual: { kind: 'versus', aK: 'THE TAPE', aV: 'SOX -2.94%', bK: 'THE CAPEX', bV: '+$16.8B', aSym: 'SEMIS', bSym: 'TSLA' },
    },
    {
      role: 'money', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/morning/morning-01-sunrise-manhattanstyle-skyline-golden.mp4', loopFrames: 148 },
      eyebrow: 'This morning',
      head: 'Futures opened\ngreen anyway',
      say: 'This morning futures are green, and Nvidia is up one percent.',
      ask: 'So the machine changed its mind?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'NASDAQ100 F', v: '+0.32%', up: true, sym: 'NASDAQ' },
          { k: 'NVDA', v: '+1.08%', up: true, sym: 'NVDA' },
          { k: 'MU', v: '+0.93%', up: true, sym: 'MU' },
        ],
      },
    },
    {
      role: 'evidence', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/tech/tech-11-rocket-engine-static-fire.mp4', loopFrames: 148 },
      eyebrow: 'What the machine reads now',
      head: 'Price trend\njumped to 71',
      say: 'Price trend reads 71 healthy. Yesterday it read 29.',
      ask: 'The engine restarted overnight.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'PRICE TREND', v: '71 · HEALTHY', up: true, sym: 'RLSI' },
          { k: 'MOMENTUM', v: '53 · STABLE', up: true, sym: 'RISK' },
          { k: 'PARTICIPATION', v: '50 · STABLE', up: true, sym: 'FEARGREED' },
        ],
      },
    },
    {
      role: 'depth', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/morning/morning-05-timelapse-dawn-light-sweeping.mp4', loopFrames: 148 },
      eyebrow: 'The one that did not move',
      head: 'Volatility stayed\nat 15.5',
      say: 'Volatility barely moved. It sits at fifteen point five.',
      ask: 'Nobody paid up for protection.',
      visual: { kind: 'stat', label: 'VIX · VOLATILITY', value: '15.49', sub: '+0.19% · flat overnight', up: true, sym: 'VIX' },
    },
    {
      role: 'conflict', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/finance/finance-01-facade-classical-stock-exchange.mp4', loopFrames: 148 },
      eyebrow: 'Crowd versus machine',
      head: 'Greed 65.\nMachine 45.',
      say: 'Fear and Greed prints 65. The machine reads 45.',
      ask: 'The crowd is warmer than the data.',
      visual: { kind: 'versus', aK: 'FEAR&GREED', aV: '65 GREED', bK: 'RLSI', bV: '45 NEUTRAL', aSym: 'FEARGREED', bSym: 'RLSI' },
    },
    {
      // ★ 두 번째 의견 — 마무리 해석. 예측 동사 없음.
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/morning/morning-03-enormous-polished-golden-bell.mp4', loopFrames: 148 },
      eyebrow: 'SIGNUM READ',
      head: 'A divergence,\nnot a verdict',
      say: 'Our read: this is a divergence, not a verdict.',
      ask: 'One tape. Two stories inside it.',
      visual: { kind: 'stat', label: 'SIGNUM READ · AUG 11', value: 'DIVERGENCE', sub: 'tape down, capex up, vol flat', up: true, sym: 'RISK' },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Chips or capex \u2014\nwhich one are you reading?',
  },
};
