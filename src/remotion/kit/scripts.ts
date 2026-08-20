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
import { VOICE_COPPER } from './voice-copper';
import { VOICE_RECORDS } from './voice-records';
import { VOICE_OILSYM } from './voice-oilsym';
import { VOICE_DEFENSE } from './voice-defense';
import { VOICE_CPI812 } from './voice-cpi812';
import { VOICE_META812 } from './voice-meta812';
import { VOICE_GOOGL812 } from './voice-googl812';
import { VOICE_CPIOUT } from './voice-cpiout';
import { VOICE_MU812 } from './voice-mu812';
import { VOICE_CLOSE812 } from './voice-close812';
import { VOICE_CLOSE814 } from './voice-close814';
import { VOICE_RETAIL817 } from './voice-retail817';
import { VOICE_JOBS817 } from './voice-jobs817';
import { VOICE_FEDGAP817 } from './voice-fedgap817';
import { VOICE_MORNING818 } from './voice-morning818';
import { VOICE_CLOSE817 } from './voice-close817';
import { VOICE_LONGEND818 } from './voice-longend818';
import { VOICE_UNWIND818 } from './voice-unwind818';
import { VOICE_TRIPLE818 } from './voice-triple818';
import { VOICE_TRIPLEB } from './voice-tripleb';
import { VOICE_AMD819 } from './voice-amd819';
import { VOICE_DISP820 } from './voice-disp820';
import { VOICE_KOREA820 } from './voice-korea820';
import { VOICE_MEMCORR } from './voice-memcorr';
import { VOICE_GOLD821 } from './voice-gold821';
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
// SCRIPT_CLOSE812 — 「지수는 올랐는데 거래의 절반이 안 보였다」 (장마감 브리핑)
// ----------------------------------------------------------------------------
// ★ 이 편의 인사이트는 «우리 고유 지표» 다. 공개 시세로는 볼 수 없는 층.
//
// ★ 숫자 출처
//   [캡처 c813-dash.txt · 마감 직후]
//     NASDAQ 26,588 +0.54% · S&P 7,748.50 +0.26% · DOW 53,770 -0.04%
//     MARKET STATE "Risk-On Tilt" · RISK 63 · 로테이션 96 · 스퀴즈 High 65% · 변동성레짐 71%
//     ★ DARK POOL VOLUME **54.1%**  ← 전일(m812/c812 캡처) 42.7% 에서 +11.4%p
//   [Polygon 공식 종가 2026-08-12]
//     SOXX +2.32% · MU $911.29 +4.92% · NVDA $224.09 +3.03% · SNDK +5.76%
//     XLY -1.13% (유일한 적색 섹터) · XLP +0.46% · XLK +1.49%
//     XLE 5일 +6.49% · USO 5일 +10.81%
//   [당일 우리 영상 검증] 아침 MU 편에서 «옵션 북은 약세» 라고 했다.
//     MU 는 장중 +6.58% 에서 종가 +4.92% 로 되돌렸다 — 방향이 맞았다.
//
// ⚠️ 다크풀 54.1% 는 «우리 캡처 두 개» 의 비교다(42.7% → 54.1%). 장기 분포는 주장하지 않는다.
// 컴플라이언스: 관찰형만. 예측 동사 0.
// ============================================================================
export const SCRIPT_CLOSE812: BriefingProps = {
  voice: VOICE_CLOSE812,
  title: 'Green close.\nHalf the volume was hidden.',
  date: 'AUG 12 · AFTER THE CLOSE',
  data: { seed: 'CLOSE812' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['MU', 'NVDA'],
  tape: [
    { t: 'NASDAQ', v: '+0.54%', up: true }, { t: 'S&P 500', v: '+0.26%', up: true },
    { t: 'DOW', v: '-0.04%', up: false }, { t: 'SEMIS', v: '+2.32%', up: true },
    { t: 'DARK POOL', v: '54.1%', up: true }, { t: 'RISK', v: '63', up: true },
  ],
  hook: {
    line: 'Stocks closed green.\nHalf the volume hid.',
    sub: '54% never hit the public exchange.',
    bigNum: '54.1%',
    stamp: 'AUG 12 · AFTER THE CLOSE',
    bg: { kind: 'video', src: 'shorts/bg/video/undercurrent-pull.mp4', loopFrames: 300 },
  },
  loop: 'The board was green.\nMost of it happened elsewhere.',

  beats: [
    {
      role: 'market', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/nyse-flags.mp4', loopFrames: 180 },
      eyebrow: 'The close',
      head: 'Three green.\nOne red.',
      say: 'Cool inflation lifted the tape. Nasdaq up half a percent, the S&P a quarter.',
      ask: 'The Dow finished red.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'NASDAQ', v: '+0.54%', up: true, sym: 'NASDAQ' },
          { k: 'S&P 500', v: '+0.26%', up: true, sym: 'SP500' },
          { k: 'DOW', v: '-0.04%', up: false, sym: 'DOW' },
        ],
      },
    },
    {
      role: 'chips', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/wafer-arm.mp4', loopFrames: 300 },
      eyebrow: 'Where the buying went',
      head: 'Memory led\nthe whole market',
      say: 'Micron closed up almost five percent. Sandisk nearly six. Nvidia three.',
      ask: 'The chip shelf carried the index.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'MU', v: '+4.92%', up: true, sym: 'MU' },
          { k: 'SNDK', v: '+5.76%', up: true, sym: 'SNDK' },
          { k: 'NVDA', v: '+3.03%', up: true, sym: 'NVDA' },
        ],
      },
    },
    {
      // ★★ 우리 고유 지표 — 공개 시세로는 안 보이는 층
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/mirror-city.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM DARK POOL',
      head: '54% of volume\nnever printed public',
      say: 'More than half of the volume never touched the public exchange.',
      ask: 'Yesterday that number was 43.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'DARK POOL TODAY', v: '54.1%', up: true, sym: 'RISK' },
          { k: 'YESTERDAY', v: '42.7%', up: false, sym: 'RISK' },
          { k: 'ONE-DAY JUMP', v: '+11.4%p', up: true, sym: 'RISK' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 180 },
      eyebrow: 'The one shelf that fell',
      head: 'Consumer wants\nwent the other way',
      say: 'Consumer discretionary was the only sector to close red, down one percent.',
      ask: 'Staples closed green.',
      visual: {
        kind: 'versus',
        aK: 'DISCRETIONARY', aV: '-1.13%', bK: 'STAPLES', bV: '+0.46%',
      },
    },
    {
      role: 'money', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/glass-tube-array.mp4', loopFrames: 151 },
      eyebrow: 'What the engine reads',
      head: 'Risk dial jumped\n51 to 63',
      say: 'Our risk dial jumped from fifty-one to sixty-three. Rotation is running hot.',
      ask: 'Squeeze pressure still reads high.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'RISK DIAL', v: '63', up: true, sym: 'RISK' },
          { k: 'ROTATION', v: '96', up: true, sym: 'RISK' },
          { k: 'SQUEEZE RISK', v: 'HIGH 65%', up: false, sym: 'RISK' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/temple-storm.mp4', loopFrames: 452 },
      eyebrow: 'SIGNUM READ',
      head: 'A green board\nyou mostly did not see',
      say: 'Our read: the board was green, but most of the trading happened where you cannot see it.',
      ask: 'Also - Micron gave back a third of its jump.',
      visual: { kind: 'stat', label: 'SIGNUM READ · AUG 12', value: 'HIDDEN TAPE', sub: '54.1% off-exchange, risk dial 63', up: true, sym: 'RISK' },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'The half you saw, or the half\nyou did not — which one moved it?',
  },
};

// ============================================================================
// SCRIPT_MU812 — 「마이크론이 6.6% 올랐다. 우리 옵션 압력 지수는 BEARISH 다」 (FLASH)
// ----------------------------------------------------------------------------
// ★ 이 편은 «베이스레이트가 아닌» 우리 자원으로 만든다.
//   반도체 폭등을 여러 조건으로 검증했지만 (SOXX vs DIA 9개 조합) 전부 탈락했다.
//   대신 «아무도 못 보는 층» 을 쓴다 — 우리 엔진만 계산하는 옵션 압력 지수와 감마 구조.
//
// ★ 숫자 출처 = public/shorts/appshots/mu812-cmd.txt · mu812-flow.txt (8/12 11:20 ET 실캡처)
//   MU $925.63 (+6.58%) · 전일종가 $906.00 · 일중 $899.5 ~ $931.0 · VWAP $916.71
//   MAX PAIN $870 (현재가 대비 -6.39%) · GAMMA FLIP $900.00 (가격이 위 +2.85%)
//   TOTAL PREMIUM $95.5M · Call dominant · P/C 1.38 · 프리미엄 편향 58% Call
//   OPI (옵션 압력 지수) **BEARISH 12.0** · 판정 "Downside hedge pressure" HIGH CONVICTION
//   RSI14 42.1 Neutral · 5일 성적 2↑ 3↓ · 주간 +3.5%
//   시장: SOX +3.20% · SNDK +8.56% · NVDA +2.89% · DOW -0.07% · VIX 14.88
//
// ⚠️ 핵심 모순: 프리미엄은 58% 콜인데 «건수» P/C 는 1.38 로 풋이 많다.
//    = 소수의 큰 콜 매수 + 다수의 풋 헤지. 이 둘을 같이 말해야 정직하다.
// 컴플라이언스: 관찰형만. 매수·매도 표현 0. 예측 동사 0.
// ============================================================================
export const SCRIPT_MU812: BriefingProps = {
  voice: VOICE_MU812,
  title: 'Micron +6.6%.\nOur pressure index is bearish.',
  date: 'AUG 12 · LIVE SESSION',
  data: { seed: 'MU812' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['MU', 'NVDA'],
  tape: [
    { t: 'MU', v: '+6.58%', up: true }, { t: 'SOX', v: '+3.20%', up: true },
    { t: 'SNDK', v: '+8.56%', up: true }, { t: 'MAX PAIN', v: '$870', up: false },
    { t: 'GAMMA FLIP', v: '$900', up: true }, { t: 'P/C', v: '1.38', up: false },
  ],
  hook: {
    line: 'Micron ripped 6.6%.\nOur index says bearish.',
    sub: 'Two forces, opposite directions.',
    bigNum: '+6.6%',
    stamp: 'AUG 12 · LIVE SESSION',
    bg: { kind: 'video', src: 'shorts/bg/video/rams-vs-block.mp4', loopFrames: 300 },
  },
  loop: 'Price went one way.\nThe book went the other.',

  beats: [
    {
      role: 'chips', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/wafer-press.mp4', loopFrames: 180 },
      eyebrow: 'What is happening',
      head: 'Memory is\nexploding today',
      say: 'Micron is up six and a half percent. Sandisk over eight. The chip index up three.',
      ask: 'The Dow is red.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'SNDK', v: '+8.56%', up: true, sym: 'SNDK' },
          { k: 'MU', v: '+6.58%', up: true, sym: 'MU' },
          { k: 'SOX', v: '+3.20%', up: true, sym: 'SEMIS' },
        ],
      },
    },
    {
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/undercurrent-pull.mp4', loopFrames: 300 },
      eyebrow: 'What our engine reads',
      head: 'Pressure index:\nbearish 12',
      say: 'Our options pressure index reads bearish twelve while the stock rips.',
      ask: 'It flags downside hedge pressure.',
      visual: { kind: 'stat', label: 'OPTIONS PRESSURE INDEX', value: 'BEARISH 12.0', sub: 'downside hedge pressure - high conviction', up: false, sym: 'MU' },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/rams-vs-block.mp4', loopFrames: 300 },
      eyebrow: 'Two forces pressing',
      head: 'Above the flip.\nBelow max pain.',
      say: 'Price sits above the gamma flip at nine hundred, where dealers amplify moves up.',
      ask: 'But max pain is six percent lower.',
      visual: {
        kind: 'versus',
        aK: 'GAMMA FLIP', aV: '$900', aSym: 'MU',
        bK: 'MAX PAIN', bV: '$870', bSym: 'MU',
      },
    },
    {
      role: 'money', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 180 },
      eyebrow: 'The split nobody shows',
      head: 'Money says calls.\nCount says puts.',
      say: 'Premium is fifty-eight percent calls. But the put-call count is one point three eight.',
      ask: 'A few big calls against many puts.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'TOTAL PREMIUM', v: '$95.5M', up: true, sym: 'MU' },
          { k: 'PREMIUM BIAS', v: '58% CALL', up: true, sym: 'MU' },
          { k: 'PUT/CALL COUNT', v: '1.38', up: false, sym: 'MU' },
        ],
      },
    },
    {
      role: 'evidence', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/fab-hall-bright.mp4', loopFrames: 151 },
      eyebrow: 'And it is not overheated',
      head: 'RSI still reads 42\nafter a 6% day',
      say: 'Momentum reads forty-two. Neutral, even after a six percent day.',
      ask: 'Three of the last five sessions were red.',
      visual: { kind: 'stat', label: 'RSI 14 · WEEK', value: '42.1', sub: 'neutral - 2 up 3 down, week +3.5%', up: false, sym: 'MU' },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/temple-storm.mp4', loopFrames: 452 },
      eyebrow: 'SIGNUM READ',
      head: 'The tape and the book\ndisagree today',
      say: 'Our read: the tape and the option book are pointing opposite ways right now.',
      ask: 'A divergence, not a verdict.',
      visual: { kind: 'stat', label: 'SIGNUM READ · MICRON', value: 'DIVERGENCE', sub: 'price +6.6%, pressure index bearish', up: false, sym: 'MU' },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'The price, or the book —\nwhich one are you reading?',
  },
};

// ============================================================================
// SCRIPT_CPIOUT — 「CPI 가 +0.1% 로 나왔다. 우리가 30분 전에 말한 그대로다」 (FLASH)
// ----------------------------------------------------------------------------
// 제작 2026-08-12 ET 09:05 (개장 25분 전). CPI 는 ET 08:30 발표.
// 우리는 발표 «전» 에 SCRIPT_CPI812 로 "7월 유가 급등은 이번 프린트에 없다" 고 했다.
// 결과가 그 주장과 일치했다 — 이 편은 그 확인이다.
//
// ★ 숫자 출처
//   [발표치]  헤드라인 3.4% YoY (6월 3.5% → 하락, 예상 부합) · **MoM +0.1%**
//             코어 2.5% YoY (예상 2.5%) · MoM +0.2%
//   [시장]    나스닥 선물 +0.97% (29,912.75) · S&P +0.45% (7,782.25) · 다우 +0.26% (54,022)
//             연준 베팅: 전날 50-50 → 동결 쪽으로 기울음
//   [우리 계산 · FRED 434개월] WTI «월평균» +15% 이상인 달 15번 → 다음 달 헤드라인 CPI 가
//             평소보다 뜨거웠던 비율 80% (기준 50%), 중앙 +0.48% vs 전체 +0.22%
//   [7월 실제] WTI 월내 +23.5% ($69.74→$86.16) 이지만 «월평균» 은 $80.46 로 6월 $84.81 대비 -5.1%
//
// ⚠️ 우리 주장은 "CPI 가 낮게 나온다" 가 아니라 "유가가 이 프린트를 밀어올리지 않는다" 였다.
//    헤드라인 MoM +0.1% 는 그 주장과 일치한다. 그 이상으로 확대해석하지 않는다.
// ============================================================================
export const SCRIPT_CPIOUT: BriefingProps = {
  voice: VOICE_CPIOUT,
  title: 'CPI +0.1%.\nThe oil was not in it.',
  date: 'AUG 12 · CPI DAY',
  data: { seed: 'CPIOUT' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['XOM', 'NVDA'],
  tape: [
    { t: 'CPI YoY', v: '3.4%', up: false }, { t: 'CPI MoM', v: '+0.1%', up: false },
    { t: 'CORE YoY', v: '2.5%', up: false }, { t: 'NASDAQ F', v: '+0.97%', up: true },
    { t: 'S&P F', v: '+0.45%', up: true }, { t: 'WTI JUL AVG', v: '-5.1%', up: false },
  ],
  hook: {
    line: 'CPI landed at\nplus one tenth.',
    sub: 'We said the oil would not be in it.',
    bigNum: '+0.1%',
    stamp: 'AUG 12 · CPI DAY',
    bg: { kind: 'video', src: 'shorts/bg/video/exchange-storm.mp4', loopFrames: 452 },
  },
  loop: 'Right spike.\nStill the wrong month.',

  beats: [
    {
      role: 'market', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/fed-building.mp4', loopFrames: 180 },
      eyebrow: 'The print',
      head: 'Headline cooled.\nCore held.',
      say: 'Headline inflation came in at three point four, down from three point five.',
      ask: 'One tenth of a percent on the month.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'HEADLINE YoY', v: '3.4%', up: false, sym: 'FED' },
          { k: 'HEADLINE MoM', v: '+0.1%', up: false, sym: 'FED' },
          { k: 'CORE YoY', v: '2.5%', up: false, sym: 'FED' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/refinery-stacks.mp4', loopFrames: 151 },
      eyebrow: 'What was supposed to happen',
      head: 'Oil ran 23%\ninside July',
      say: 'Crude ran twenty-three percent inside July. Everyone expected that to show up.',
      ask: 'It did not.',
      visual: { kind: 'stat', label: 'WTI WITHIN JULY', value: '+23.5%', sub: '$69.74 to $86.16', up: true, sym: 'XOM' },
    },
    {
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/glass-tube-array.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM BASE RATE',
      head: 'We checked\n434 months',
      say: 'The link is real. In 15 months where the oil average jumped, inflation ran hot.',
      ask: 'Eighty percent of the time.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'MONTHS CHECKED', v: '434', up: true, sym: 'RISK' },
          { k: 'BIG OIL MONTHS', v: '15', up: true, sym: 'XOM' },
          { k: 'HOTTER NEXT MONTH', v: '80%', up: true, sym: 'FED' },
        ],
      },
    },
    {
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/tankers-strait.mp4', loopFrames: 180 },
      eyebrow: 'Why it stayed out',
      head: 'The July average\nfell 5%',
      say: 'But inflation reads the monthly average, and July averaged below June.',
      ask: 'The trigger never fired.',
      visual: {
        kind: 'versus',
        aK: 'JUNE AVERAGE', aV: '$84.81', aSym: 'XOM',
        bK: 'JULY AVERAGE', bV: '$80.46', bSym: 'XOM',
      },
    },
    {
      role: 'money', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/columns-goldenhour.mp4', loopFrames: 151 },
      eyebrow: 'What the tape did',
      head: 'Futures took it\nas a hold',
      say: 'Nasdaq futures added almost one percent and rate bets tilted to a hold.',
      ask: 'From a coin flip the day before.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'NASDAQ FUTURES', v: '+0.97%', up: true, sym: 'NASDAQ' },
          { k: 'S&P FUTURES', v: '+0.45%', up: true, sym: 'SP500' },
          { k: 'DOW FUTURES', v: '+0.26%', up: true, sym: 'DOW' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/temple-storm.mp4', loopFrames: 452 },
      eyebrow: 'SIGNUM READ',
      head: 'The spike is still\ncoming. Just later.',
      say: 'Our read: the climb sits in August, and August is reported in September.',
      ask: '434 months. Not a forecast.',
      visual: { kind: 'stat', label: 'SIGNUM READ · CPI DAY', value: 'NEXT PRINT', sub: 'the July average never rose', up: false, sym: 'RISK' },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'The spike, or the average —\nwhich one does CPI read?',
  },
};

// ============================================================================
// SCRIPT_GOOGL812 — 「구글이 3.8% 빠졌다. 그런데 급락 자체는 신호가 아니다」 (FLASH)
// ----------------------------------------------------------------------------
// 이 편의 특징: «우리가 검증에 실패한 것»을 영상 안에서 말한다.
//   급락을 사라는 통념을 9개 조합으로 테스트했고 전부 탈락했다. 그 사실이 곧 인사이트다.
//
// ★ 숫자 출처 (Polygon 일봉, 2026-08-12 실조회)
//   GOOGL 08-11 종가 $343.80  전일 대비 -3.84%
//   52주 최고 $402.62 → 현재 -14.6%
//   최근: 08-05 -4.03% · 08-06 -1.29% · 08-07 -0.96% (3일 연속) → 08-10 +0.91% (끊김) → 08-11 -3.84%
//   ⇒ 지금은 «1일차». 조건 미성립.
//
// ★ 검증 결과
//   [탈락] 하루 -2% / -3% / -4% 이하 × 5·10·21일 = 9개 조합 전부
//          표본 11~101, 격차 없음 또는 전·후반 방향 반대
//   [통과] 3일 연속 하락 → 5일 뒤 (.agent/TOPIC_BANK.json · GOOGL-dn3d)
//          합산 125건 · 상승 68.0% · 대조군 54.4% · 격차 +13.6%p
//          전반 +13.6%p / 후반 +13.5%p ← 은행 26건 중 «양쪽이 가장 같은» 조건
//
// 컴플라이언스: 매수 권유 아님. "우리가 무엇을 세었고 무엇이 실패했나" 의 서술이다.
// ============================================================================
export const SCRIPT_GOOGL812: BriefingProps = {
  voice: VOICE_GOOGL812,
  title: 'Google fell 3.8%.\nThe drop is not the signal.',
  date: 'SINGLE NAME BRIEF',
  data: { seed: 'GOOGL812' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['GOOGL', 'META'],
  tape: [
    { t: 'GOOGL', v: '$343.80', up: false }, { t: 'DAY', v: '-3.84%', up: false },
    { t: 'FROM HIGH', v: '-14.6%', up: false }, { t: 'TESTS FAILED', v: '9', up: false },
    { t: 'CASES', v: '125', up: true }, { t: 'HIGHER 5D', v: '68%', up: true },
  ],
  hook: {
    line: 'Google fell 3.8%\nyesterday.',
    sub: 'We tested the dip nine ways. It failed.',
    stamp: 'SINGLE NAME BRIEF',
    bg: { kind: 'video', src: 'shorts/bg/video/euv-plasma-a.mp4', loopFrames: 151 },
  },
  loop: 'One red day is noise.\nThree in a row is a count.',

  beats: [
    {
      role: 'market', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/datacenter-aisle.mp4', loopFrames: 180 },
      eyebrow: 'What happened',
      head: 'Down 3.8%, and\n15% off its high',
      say: 'Alphabet closed down three point eight percent at three forty-three.',
      ask: 'The dip buyers are already talking.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'CLOSE AUG 11', v: '$343.80', up: false, sym: 'GOOGL' },
          { k: 'ONE-DAY MOVE', v: '-3.84%', up: false, sym: 'GOOGL' },
          { k: 'BELOW 52W HIGH', v: '-14.6%', up: false, sym: 'GOOGL' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/glass-tube-array.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM BASE RATE',
      head: 'We tested the dip\nnine different ways',
      say: 'We tested buying a one-day drop nine different ways.',
      ask: 'Every single one failed.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'THRESHOLDS TESTED', v: '-2 / -3 / -4%', up: false, sym: 'GOOGL' },
          { k: 'HORIZONS TESTED', v: '5 / 10 / 21D', up: false, sym: 'GOOGL' },
          { k: 'COMBINATIONS THAT HELD', v: '0 of 9', up: false, sym: 'RISK' },
        ],
      },
    },
    {
      role: 'depth', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/crack-star.mp4', loopFrames: 151 },
      eyebrow: 'Why they failed',
      head: 'Small samples,\nopposite halves',
      say: 'Some had too few cases. Others flipped sign between the two halves.',
      ask: 'A pattern that flips is not a pattern.',
      visual: { kind: 'stat', label: 'ONE-DAY DROP', value: 'NO EDGE', sub: '9 combinations, none survived both halves', up: false, sym: 'RISK' },
    },
    {
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/fab-hall-bright.mp4', loopFrames: 151 },
      eyebrow: 'What did survive',
      head: 'Three red days\nin a row',
      say: 'One thing did hold. Three losing sessions in a row, 125 times.',
      ask: 'Sixty-eight percent were higher a week later.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'THREE-DAY STREAKS', v: '125', up: true, sym: 'GOOGL' },
          { k: 'HIGHER IN 5 DAYS', v: '68%', up: true, sym: 'GOOGL' },
          { k: 'ANY GIVEN DAY', v: '54%', up: false, sym: 'GOOGL' },
        ],
      },
    },
    {
      role: 'depth', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/quantum-fridge.mp4', loopFrames: 151 },
      eyebrow: 'The cleanest one we have',
      head: 'Both halves gave\nthe same answer',
      say: 'Plus thirteen point six in the first half. Plus thirteen point five in the second.',
      ask: 'That is the steadiest number we found.',
      visual: {
        kind: 'versus',
        aK: 'FIRST HALF', aV: '+13.6%p', aSym: 'GOOGL',
        bK: 'SECOND HALF', bV: '+13.5%p', bSym: 'GOOGL',
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/temple-storm.mp4', loopFrames: 452 },
      eyebrow: 'SIGNUM READ',
      head: 'Day one of three.\nNot yet.',
      say: 'Our read: yesterday was day one. The setup we counted has not formed.',
      ask: '125 cases. Not a forecast.',
      visual: { kind: 'stat', label: 'SIGNUM READ · ALPHABET', value: 'DAY 1 OF 3', sub: 'the condition has not triggered', up: false, sym: 'GOOGL' },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'One red day, or three —\nwhich one are you counting?',
  },
};

// ============================================================================
// SCRIPT_META812 — 「메타가 5일 연속 올랐다. 138번은 그게 좋은 신호가 아니었다」
// ----------------------------------------------------------------------------
// 종목편. 소재 은행 조건이 «지금 발동 중»이라 훅이 강하다 (scripts/bank-live.mjs).
//
// ★ 숫자 출처 (Polygon 일봉, 2026-08-12 실조회)
//   연속 상승 5일: 08-05 +0.14% · 08-06 +0.19% · 08-07 +0.37% · 08-10 +0.48% · 08-11 +0.71%
//   3일 누적 +1.56%  ($589.90 -> $599.12)
//   52주 최고 $790.00 · 최저 $525.72 → 현재 고점 대비 -24.2%
//   직전 급락: 07-30 -7.95%
//
// ★ 베이스레이트 (.agent/TOPIC_BANK.json · META-up3d, 21일)
//   표본 138건 (전반 60 / 후반 78)
//   21일 뒤 상승 49%  ← 대조군 66%   격차 -16%p
//   전반 -10%p / 후반 -21%p  → 약해진 게 아니라 «강해졌다»
//
// ⚠️ 대조군이 66% 로 높은 것이 이 편의 핵심이다. 메타는 원래 잘 올랐다.
//    그런데 «연속 상승 뒤»에는 49% 로 떨어진다. 절대수치가 아니라 이 격차가 주장이다.
// ============================================================================
export const SCRIPT_META812: BriefingProps = {
  voice: VOICE_META812,
  title: 'Five green days.\nHistory says wait.',
  date: 'SINGLE NAME BRIEF',
  data: { seed: 'META812' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['META', 'NVDA'],
  tape: [
    { t: 'META', v: '$599.12', up: true }, { t: 'STREAK', v: '5 DAYS', up: true },
    { t: '3-DAY', v: '+1.56%', up: true }, { t: 'FROM HIGH', v: '-24.2%', up: false },
    { t: 'CASES', v: '138', up: true }, { t: 'HIGHER 21D', v: '49%', up: false },
  ],
  hook: {
    line: 'Meta rose five\ndays straight.',
    sub: '138 cases say that is not the tell.',
    stamp: 'SINGLE NAME BRIEF',
    bg: { kind: 'video', src: 'shorts/bg/video/pcb-cyan-dark.mp4', loopFrames: 151 },
  },
  loop: 'Five green days.\nOne and a half percent.',

  beats: [
    {
      role: 'market', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/datacenter-aisle.mp4', loopFrames: 180 },
      eyebrow: 'The streak',
      head: 'Five closes up.\nOne and a half percent.',
      say: 'Meta closed higher five sessions running. Together that is one and a half percent.',
      ask: 'That is a grind, not a breakout.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'CLOSE AUG 11', v: '$599.12', up: true, sym: 'META' },
          { k: 'THREE-DAY MOVE', v: '+1.56%', up: true, sym: 'META' },
          { k: 'BIGGEST DAY', v: '+0.71%', up: true, sym: 'META' },
        ],
      },
    },
    {
      role: 'depth', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/crack-star.mp4', loopFrames: 151 },
      eyebrow: 'Where it is climbing from',
      head: 'Still 24% below\nits own high',
      say: 'It is still twenty-four percent under its high, two weeks after an eight percent drop.',
      ask: 'So is the grind the recovery?',
      visual: { kind: 'stat', label: 'BELOW 52-WEEK HIGH', value: '-24.2%', sub: 'high $790.00 - after a -7.95% day', up: false, sym: 'META' },
    },
    {
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/fab-hall-bright.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM BASE RATE',
      head: 'We counted 138\nof these streaks',
      say: 'We checked every three-day green streak in Meta since 2021.',
      ask: 'A month later only 49 percent were higher.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'STREAKS SINCE 2021', v: '138', up: true, sym: 'META' },
          { k: 'HIGHER IN 21 DAYS', v: '49%', up: false, sym: 'META' },
          { k: 'META ON ANY DAY', v: '66%', up: true, sym: 'META' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/chip-city.mp4', loopFrames: 151 },
      eyebrow: 'Why that matters',
      head: 'Meta usually goes\nup. Just not after this.',
      say: 'Meta is normally higher a month later two times out of three.',
      ask: 'After a green streak it is a coin flip.',
      visual: {
        kind: 'versus',
        aK: 'AFTER A GREEN STREAK', aV: '49%', aSym: 'META',
        bK: 'ANY GIVEN DAY', bV: '66%', bSym: 'META',
      },
    },
    {
      role: 'depth', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/glass-tube-array.mp4', loopFrames: 151 },
      eyebrow: 'And it held up',
      head: 'It sharpened.\nIt did not fade.',
      say: 'We split the years in two. Minus ten, then minus twenty-one.',
      ask: 'The second half was worse.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'FIRST HALF', v: '-10%p', up: false, sym: 'RISK' },
          { k: 'SECOND HALF', v: '-21%p', up: false, sym: 'RISK' },
          { k: 'CONDITIONS TESTED', v: '1,440', up: true, sym: 'RISK' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/temple-storm.mp4', loopFrames: 452 },
      eyebrow: 'SIGNUM READ',
      head: 'The streak is not\nthe signal',
      say: 'Our read: in this name, a quiet green streak has not been the tell.',
      ask: '138 cases. Not a forecast.',
      visual: { kind: 'stat', label: 'SIGNUM READ · META', value: 'STREAK != SIGNAL', sub: '138 cases, 49% against a 66% baseline', up: false, sym: 'META' },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Five green days —\nstrength, or just noise?',
  },
};

// ============================================================================
// SCRIPT_CPI812 — 「유가는 올랐다. 그런데 이번 CPI 에는 안 들어간다」 (MARKET FLASH)
// ----------------------------------------------------------------------------
// 게시 시각 고정: 2026-08-12 KST 21:00 = ET 08:00. CPI 발표(ET 08:30) «30분 전».
//
// ★ 숫자 출처 (전부 실조회, 2026-08-12)
//   [FRED DCOILWTICO 일별]  7월 시작 $69.74 → 끝 $86.16 = «월내» +23.5%
//                            7월 최고 $93.08(07-23) · 최저 $69.60(07-06)
//   [FRED WTISPLC 월평균]    7월 $80.46 · 6월 $84.81 → «월평균» -5.1%
//                            6월은 $95.96 에서 시작해 $70.30 까지 무너져 평균이 높았다
//   [FRED CPIAUCSL/CPILFESL] 1990-02 ~ 2026-05, 434개월
//     · WTI «월평균» +15% 이상인 달 15번 → 다음 달 헤드라인 CPI 중앙 +0.48% (전체 중앙 +0.22%)
//     · 그중 «평소보다 뜨거웠던» 비율 80% (기준 50%)
//   [캡처 m812-dash.txt]     NDX F 29,742 +0.39% · SPX F 7,760.00 +0.16% · RISK 53
//   [컨센서스]               헤드라인 3.4%(전월 3.5%) · 코어 2.5%(전월 2.6%)
//
// ⛔ 뉴스는 "7월 유가 21% 급등" 이라고만 말한다. 그건 «월내» 변화다.
//    CPI 는 그 달의 «평균 물가»를 잰다. 전달이 성립하려면 월평균이 올라야 하는데 내렸다.
//    이 구분이 이 영상의 전부다.
// ============================================================================
export const SCRIPT_CPI812: BriefingProps = {
  voice: VOICE_CPI812,
  title: 'Oil surged in July.\nThis print will not show it.',
  date: 'AUG 12 · BEFORE THE OPEN',
  data: { seed: 'CPI812' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['XOM', 'CVX'],
  tape: [
    { t: 'NASDAQ100 F', v: '+0.39%', up: true }, { t: 'S&P500 F', v: '+0.16%', up: true },
    { t: 'WTI JUL', v: '+23.5%', up: true }, { t: 'JUL AVG', v: '-5.1%', up: false },
    { t: 'CPI EST', v: '3.4%', up: false }, { t: 'CORE EST', v: '2.5%', up: false },
  ],
  hook: {
    line: 'Oil jumped 23%\nin July.',
    sub: "Today's CPI will not show it.",
    stamp: 'AUG 12 · BEFORE THE OPEN',
    bg: { kind: 'video', src: 'shorts/bg/video/supertanker.mp4', loopFrames: 180 },
  },
  loop: 'The spike is real.\nIt is in the wrong month.',

  beats: [
    {
      role: 'money', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/refinery-stacks.mp4', loopFrames: 151 },
      eyebrow: 'What happened',
      head: 'Crude ran from\n69 to 86 dollars',
      say: 'Crude opened July near sixty-nine dollars and left it above eighty-six.',
      ask: 'So inflation runs hot today?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'WTI JULY OPEN', v: '$69.74', up: false, sym: 'XOM' },
          { k: 'WTI JULY CLOSE', v: '$86.16', up: true, sym: 'XOM' },
          { k: 'MOVE WITHIN JULY', v: '+23.5%', up: true, sym: 'XOM' },
        ],
      },
    },
    {
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/fed-building.mp4', loopFrames: 180 },
      eyebrow: 'SIGNUM BASE RATE',
      head: 'That link is real.\nWe checked 434 months.',
      say: 'Since 1990 there were 15 months where oil rose that much.',
      ask: 'Eighty percent ran hotter than a typical month.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'MONTHS CHECKED', v: '434', up: true, sym: 'RISK' },
          { k: 'BIG OIL MONTHS', v: '15', up: true, sym: 'XOM' },
          { k: 'HOTTER NEXT MONTH', v: '80%', up: true, sym: 'FED' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/tankers-strait.mp4', loopFrames: 180 },
      eyebrow: 'The part nobody checks',
      head: 'CPI measures the\nmonth, not the finish',
      say: 'But inflation is measured on the average price across the month.',
      ask: 'And July averaged lower than June.',
      visual: {
        kind: 'versus',
        aK: 'JUNE AVERAGE', aV: '$84.81', aSym: 'XOM',
        bK: 'JULY AVERAGE', bV: '$80.46', bSym: 'XOM',
      },
    },
    {
      role: 'depth', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/glass-tube-array.mp4', loopFrames: 151 },
      eyebrow: 'Why the average fell',
      head: 'June started at 96\nand collapsed to 70',
      say: 'June opened near ninety-six and collapsed to seventy.',
      ask: 'July started at that bottom and climbed.',
      visual: { kind: 'stat', label: 'JULY AVG VS JUNE AVG', value: '-5.1%', sub: 'the transmission never triggered', up: false, sym: 'XOM' },
    },
    {
      role: 'evidence', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/columns-goldenhour.mp4', loopFrames: 151 },
      eyebrow: 'Where it does land',
      head: 'The spike belongs\nto the next print',
      say: 'The climb sits in August, and August is reported in September.',
      ask: 'Not in the number landing this morning.',
      visual: { kind: 'stat', label: 'CONSENSUS TODAY', value: '3.4%', sub: 'headline, down from 3.5% - core 2.5%', up: false, sym: 'FED' },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/temple-storm.mp4', loopFrames: 452 },
      eyebrow: 'SIGNUM READ',
      head: 'Right spike.\nWrong month.',
      say: 'Our read: the oil spike is real, and it is in the wrong month for this print.',
      ask: '434 months. Not a forecast.',
      visual: { kind: 'stat', label: 'SIGNUM READ · CPI DAY', value: 'WRONG MONTH', sub: 'oil rose 23% but the average fell 5%', up: false, sym: 'RISK' },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'The spike, or the average —\nwhich one does CPI read?',
  },
};

// ============================================================================
// 재고형 3편 (2026-08-12) — 소재 은행에서 나왔다. 실시간 사건이 아니라 «계산된 우위»다.
// ----------------------------------------------------------------------------
// 출처: .agent/TOPIC_BANK.json — 1,440개 조건 전수 스캔 → 전·후반 «양쪽»에서
//   표본 40+ AND 격차 8%p+ AND 같은 방향을 만족한 26건만 은행에 들어왔다.
//   (전반부만 통과한 172개는 «우연»으로 보고 버렸다 — 다중검정 방어)
//
// 이 세 편의 숫자는 전·후반을 합산한 값이다. 각 반쪽 값은 대본 주석에 함께 남긴다.
// ============================================================================

// ── ① 「같은 신고가, 정반대 결과」 ─────────────────────────────────────────
//   SOXX 52주 신고가 → 21일 뒤 상승 106건 중 72%  (대조군 59%)  IS +13.1 / OOS +12.2
//   GOOGL 52주 신고가 → 21일 뒤 상승  93건 중 46%  (대조군 59%)  IS -10.6 / OOS -15.0
export const SCRIPT_RECORDS: BriefingProps = {
  voice: VOICE_RECORDS,
  title: 'Record highs.\nTwo opposite answers.',
  date: 'BASE RATE BRIEF',
  data: { seed: 'RECORDS' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['NVDA', 'GOOGL'],
  tape: [
    { t: 'SOXX HIGHS', v: '106', up: true }, { t: 'HIGHER 21D', v: '72%', up: true },
    { t: 'GOOGL HIGHS', v: '93', up: true }, { t: 'HIGHER 21D', v: '46%', up: false },
    { t: 'BASELINE', v: '59%', up: true }, { t: 'SINCE', v: '2021', up: true },
  ],
  hook: {
    line: '199 record closes.\nTwo opposite answers.',
    sub: 'The same signal, split by name.',
    stamp: 'BASE RATE BRIEF',
    bg: { kind: 'video', src: 'shorts/bg/video/temple-storm.mp4', loopFrames: 452 },
  },
  loop: 'One signal.\nIt depends who prints it.',

  beats: [
    {
      role: 'market', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/nyse-flags.mp4', loopFrames: 180 },
      eyebrow: 'What everyone believes',
      head: 'A record high means\nstrength',
      say: 'A stock at a fifty-two week high is supposed to be strength.',
      ask: 'Is that true for every name?',
      visual: { kind: 'stat', label: 'THE COMMON READ', value: 'BUY STRENGTH', sub: 'record high = momentum', up: true, sym: 'SP500' },
    },
    {
      role: 'chips', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/fab-hall-bright.mp4', loopFrames: 151 },
      eyebrow: 'Semiconductors',
      head: 'Chips at a record\nkept going',
      say: 'We counted 106 record closes in semiconductors since 2021.',
      ask: '72 percent were higher a month later.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'RECORD CLOSES', v: '106', up: true, sym: 'SEMIS' },
          { k: 'HIGHER IN 21 DAYS', v: '72%', up: true, sym: 'SEMIS' },
          { k: 'ANY GIVEN DAY', v: '59%', up: false, sym: 'SEMIS' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/datacenter-aisle.mp4', loopFrames: 180 },
      eyebrow: 'Same signal, other name',
      head: 'Alphabet at a record\ndid the opposite',
      say: 'Alphabet printed 93 record closes over the same years.',
      ask: 'Only 46 percent were higher a month later.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'RECORD CLOSES', v: '93', up: true, sym: 'GOOGL' },
          { k: 'HIGHER IN 21 DAYS', v: '46%', up: false, sym: 'GOOGL' },
          { k: 'ANY GIVEN DAY', v: '59%', up: true, sym: 'GOOGL' },
        ],
      },
    },
    {
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/pcb-one-chip-lit.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM BASE RATE',
      head: 'Plus 13 against\nminus 13',
      say: 'Against the same baseline, chips run plus thirteen points and Alphabet minus thirteen.',
      ask: 'The identical signal, mirrored.',
      visual: {
        kind: 'versus',
        aK: 'SEMIS AT A RECORD', aV: '+13%p', aSym: 'SEMIS',
        bK: 'ALPHABET AT A RECORD', bV: '-13%p', bSym: 'GOOGL',
      },
    },
    {
      role: 'depth', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/glass-tube-array.mp4', loopFrames: 151 },
      eyebrow: 'And it held up',
      head: 'Both halves of the\nsample agreed',
      say: 'We split the years in two. Both halves pointed the same way.',
      ask: 'That is what separates a pattern from a fluke.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'FIRST HALF', v: '+13 / -11', up: true, sym: 'RISK' },
          { k: 'SECOND HALF', v: '+12 / -15', up: true, sym: 'RISK' },
          { k: 'CONDITIONS TESTED', v: '1,440', up: true, sym: 'RISK' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/temple-storm.mp4', loopFrames: 452 },
      eyebrow: 'SIGNUM READ',
      head: 'A record is not\na signal by itself',
      say: 'Our read: a record high is not one signal. It is two, and the name decides which.',
      ask: '199 closes. Not a forecast.',
      visual: { kind: 'stat', label: 'SIGNUM READ · RECORDS', value: 'IT DEPENDS', sub: '199 record closes, opposite outcomes', up: false, sym: 'RISK' },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Strength, or exhaustion —\nwhich one are you buying?',
  },
};

// ── ② 「급락은 되돌리고, 급등은 못 지킨다」 ───────────────────────────────
//   USO 5일 -5% 이하 → 10일 뒤 상승 143건 중 71%  (대조군 54%)  IS +16.7 / OOS +17.6
//   USO 5일 +5% 이상 → 10일 뒤 상승 180건 중 42%  (대조군 54%)  IS -13.0 / OOS -11.0
export const SCRIPT_OILSYM: BriefingProps = {
  voice: VOICE_OILSYM,
  title: 'Oil crashed.\nOil spiked. Not symmetric.',
  date: 'BASE RATE BRIEF',
  data: { seed: 'OILSYM' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['XOM', 'CVX'],
  tape: [
    { t: 'CRASH CASES', v: '143', up: true }, { t: 'HIGHER 10D', v: '71%', up: true },
    { t: 'SPIKE CASES', v: '180', up: true }, { t: 'HIGHER 10D', v: '42%', up: false },
    { t: 'BASELINE', v: '54%', up: true }, { t: 'SINCE', v: '2021', up: true },
  ],
  hook: {
    line: 'Oil crashed 5%.\n143 times before.',
    sub: 'The bounce is not the surprise.',
    stamp: 'BASE RATE BRIEF',
    bg: { kind: 'video', src: 'shorts/bg/video/copper-mine-dusk.mp4', loopFrames: 452 },
  },
  loop: 'Falling oil pays.\nRising oil does not.',

  beats: [
    {
      role: 'money', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/refinery-stacks.mp4', loopFrames: 151 },
      eyebrow: 'The setup',
      head: 'Crude down 5%\nin a week',
      say: 'Crude falling five percent in a week happens more than you think.',
      ask: '143 times since 2021.',
      visual: { kind: 'stat', label: 'FIVE-DAY DROP OF 5%', value: '143', sub: 'cases since 2021', up: true, sym: 'XOM' },
    },
    {
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/tankers-strait.mp4', loopFrames: 180 },
      eyebrow: 'SIGNUM BASE RATE',
      head: 'It came back\n71% of the time',
      say: 'Two weeks later crude was higher seventy-one percent of the time.',
      ask: 'On any random week it is fifty-four.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'CASES SINCE 2021', v: '143', up: true, sym: 'XOM' },
          { k: 'HIGHER IN 10 DAYS', v: '71%', up: true, sym: 'XOM' },
          { k: 'ANY GIVEN WEEK', v: '54%', up: false, sym: 'XOM' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/supertanker.mp4', loopFrames: 180 },
      eyebrow: 'Now flip it',
      head: 'A 5% spike did\nthe opposite',
      say: 'When crude spiked five percent instead, only forty-two percent held it.',
      ask: 'Same baseline. Twelve points worse.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'SPIKE CASES', v: '180', up: true, sym: 'XOM' },
          { k: 'HIGHER IN 10 DAYS', v: '42%', up: false, sym: 'XOM' },
          { k: 'ANY GIVEN WEEK', v: '54%', up: true, sym: 'XOM' },
        ],
      },
    },
    {
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/vault-doors.mp4', loopFrames: 151 },
      eyebrow: 'The gap',
      head: '71 against 42\nfrom the same base',
      say: 'Buying the fall beat chasing the rally by twenty-nine points.',
      ask: 'The baseline never moved.',
      visual: {
        kind: 'versus',
        aK: 'AFTER A CRASH', aV: '71%', aSym: 'XOM',
        bK: 'AFTER A SPIKE', bV: '42%', bSym: 'XOM',
      },
    },
    {
      role: 'evidence', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/refinery-stacks.mp4', loopFrames: 151 },
      eyebrow: 'And it held up',
      head: 'Both halves of the\nsample agreed',
      say: 'We split the years in two. Both halves said the same thing.',
      ask: 'Plus seventeen, then plus eighteen.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'FIRST HALF', v: '+17%p', up: true, sym: 'RISK' },
          { k: 'SECOND HALF', v: '+18%p', up: true, sym: 'RISK' },
          { k: 'CONDITIONS TESTED', v: '1,440', up: true, sym: 'RISK' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/copper-mine-dusk.mp4', loopFrames: 452 },
      eyebrow: 'SIGNUM READ',
      head: 'Oil pays for\npatience, not chase',
      say: 'Our read: crude has paid for patience and punished the chase.',
      ask: '323 cases. Not a forecast.',
      visual: { kind: 'stat', label: 'SIGNUM READ · CRUDE', value: 'ASYMMETRIC', sub: '143 crashes, 180 spikes, opposite ends', up: true, sym: 'RISK' },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'The crash, or the spike —\nwhich one would you buy?',
  },
};

// ── ③ 「방어주가 앞서면 그 뒤가 나쁘다」 — 은행 최대 격차 ─────────────────
//   XLY 가 XLP 에 25일 8%p 이상 뒤진 뒤 21일: 상승 136건 중 27% (대조군 55%)
//   IS -19.1 / OOS -36.6 — 은행 26건 중 격차 최대
export const SCRIPT_DEFENSE: BriefingProps = {
  voice: VOICE_DEFENSE,
  title: 'Defensives won.\nThat was the warning.',
  date: 'BASE RATE BRIEF',
  data: { seed: 'DEFENSE' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['COST', 'AMZN'],
  tape: [
    { t: 'CASES', v: '136', up: true }, { t: 'HIGHER 21D', v: '27%', up: false },
    { t: 'BASELINE', v: '55%', up: true }, { t: 'GAP', v: '-28%p', up: false },
    { t: 'SINCE', v: '2021', up: true }, { t: 'TESTED', v: '1,440', up: true },
  ],
  hook: {
    line: 'Defensives beat\ncyclicals by 8 points.',
    sub: '136 times. It ended badly.',
    stamp: 'BASE RATE BRIEF',
    bg: { kind: 'video', src: 'shorts/bg/video/exchange-storm.mp4', loopFrames: 452 },
  },
  loop: 'Safety leading\nis not safety.',

  beats: [
    {
      role: 'market', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/columns-goldenhour.mp4', loopFrames: 151 },
      eyebrow: 'Two shelves',
      head: 'What people want\nversus what they need',
      say: 'One basket is what people want. The other is what they cannot skip.',
      ask: 'When the second one wins, what does it mean?',
      visual: { kind: 'versus', aK: 'CYCLICALS', aV: 'WANT', bK: 'DEFENSIVES', bV: 'NEED' },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/exchange-storm.mp4', loopFrames: 452 },
      eyebrow: 'The setup',
      head: 'Staples ahead by\n8 points in a month',
      say: 'We looked for every time staples beat cyclicals by eight points over a month.',
      ask: 'It happened 136 times since 2021.',
      visual: { kind: 'stat', label: 'DEFENSIVE LEAD OF 8 POINTS', value: '136', sub: 'cases since 2021', up: true, sym: 'RISK' },
    },
    {
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/crack-star.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM BASE RATE',
      head: 'Only 27% were\nhigher after',
      say: 'A month later the cyclical basket was higher only twenty-seven percent of the time.',
      ask: 'On any random month it is fifty-five.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'CASES SINCE 2021', v: '136', up: true, sym: 'RISK' },
          { k: 'HIGHER IN 21 DAYS', v: '27%', up: false, sym: 'RISK' },
          { k: 'ANY GIVEN MONTH', v: '55%', up: true, sym: 'RISK' },
        ],
      },
    },
    {
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/vault-doors.mp4', loopFrames: 151 },
      eyebrow: 'The widest gap we found',
      head: 'Minus 28 points\nfrom baseline',
      say: 'Twenty-eight points below the baseline. The widest gap in our whole scan.',
      ask: 'We tested fourteen hundred conditions.',
      visual: {
        kind: 'versus',
        aK: 'AFTER A DEFENSIVE LEAD', aV: '27%', aSym: 'RISK',
        bK: 'ANY GIVEN MONTH', bV: '55%', bSym: 'RISK',
      },
    },
    {
      role: 'evidence', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/glass-tube-array.mp4', loopFrames: 151 },
      eyebrow: 'And it held up',
      head: 'Both halves agreed,\nand the second was worse',
      say: 'First half minus nineteen. Second half minus thirty-seven.',
      ask: 'It did not fade. It sharpened.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'FIRST HALF', v: '-19%p', up: false, sym: 'RISK' },
          { k: 'SECOND HALF', v: '-37%p', up: false, sym: 'RISK' },
          { k: 'CONDITIONS TESTED', v: '1,440', up: true, sym: 'RISK' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/temple-storm.mp4', loopFrames: 452 },
      eyebrow: 'SIGNUM READ',
      head: 'Money moving to\nsafety is the tell',
      say: 'Our read: when safety leads, the market has already told you something.',
      ask: '136 cases. Not a forecast.',
      visual: { kind: 'stat', label: 'SIGNUM READ · ROTATION', value: 'DEFENSIVE LEAD', sub: '136 cases, 27% vs 55% baseline', up: false, sym: 'RISK' },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Which basket is leading\nyour portfolio right now?',
  },
};

// ============================================================================
// SCRIPT_COPPER — 「AI가 구리를 먹는다. 그런데 광산주를 쫓지는 마라」 (DEEP BRIEF)
// ----------------------------------------------------------------------------
// 자기반박 원형 — 우리 구조적 강세론을 «우리 계산»으로 제동한다. 채널 포지셔닝 그 자체.
//
// ★ 모든 숫자 출처 = Polygon 일봉 종가, 2026-08-12 실조회 (scratchpad/copper.js)
//   7/1 이후:  COPX +17.7% · SCCO +16.6% · FCX +13.8% · NVDA +10.1%
//   현재 25거래일 리드 폭: COPX - NVDA = +8.3%p (2026-07-07 ~ 08-11)
//   베이스레이트 (25거래일 리드 → 이후 21거래일, 2021-01 ~ 2026-07-13):
//     · 전체 창 1,361개 · 광산주가 앞선 창 577개(42%)
//     · 그중 다음 한 달 반납 337개 = 58%
//     · 초과수익 중앙 -4.3%p   ← 대조군(아무 창) -2.4%p 와 «반드시 같이» 낸다
//     · 광산주 단독 수익 중앙 +0.64% → 폭락이 아니라 «뒤처짐»
//
// ⛔ 구버전(2026-08-11 ffmpeg 판)은 -4.1%p 만 말하고 대조군을 뺐다. 절반은 원래 그런 값이라
//    빼고 말하면 과장이 된다. 이번 판은 둘을 나란히 놓는다.
//
// 컴플라이언스: 과거 빈도 서술만. 미래형 동사 0. 「SIGNUM READ」로 사실과 해석 분리.
// ============================================================================
export const SCRIPT_COPPER: BriefingProps = {
  voice: VOICE_COPPER,
  title: 'AI eats copper.\nThe trade is not the story.',
  date: 'RESOURCE BRIEF',
  data: { seed: 'COPPER' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['FCX', 'NVDA', 'SCCO'],
  tape: [
    { t: 'COPX', v: '+17.7%', up: true }, { t: 'SCCO', v: '+16.6%', up: true },
    { t: 'FCX', v: '+13.8%', up: true }, { t: 'NVDA', v: '+10.1%', up: true },
    { t: 'LEAD', v: '+8.3%p', up: true }, { t: 'SINCE', v: 'JUL 1', up: true },
  ],
  hook: {
    line: 'Copper miners beat\nNvidia by 8 points.',
    sub: 'We counted 1,361 windows anyway.',
    // syms 없음 — 로고 프록시가 100x100 만 줘서 히어로 크기로 키우면 뭉개진다(실측).
    // 용융 광산 배경 자체가 프레임0 지배 요소다. 작은 배지(행·테이프)에는 로고를 쓴다.
    stamp: 'RESOURCE BRIEF',
    bg: { kind: 'video', src: 'shorts/bg/video/copper-mine-molten.mp4', loopFrames: 180 },
  },
  loop: 'The shovel is winning.\nThat is not the same as buying it.',

  beats: [
    {
      role: 'money', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/copper-mine-molten.mp4', loopFrames: 180 },
      eyebrow: 'Since July',
      head: 'The miners ran\nwhile chips walked',
      say: 'Since July first the copper miners are up almost eighteen percent.',
      ask: 'And the AI trade everyone owns?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'COPX MINERS', v: '+17.7%', up: true, sym: 'FCX' },
          { k: 'SCCO', v: '+16.6%', up: true, sym: 'SCCO' },
          { k: 'FCX', v: '+13.8%', up: true, sym: 'FCX' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/chip-glow.mp4', loopFrames: 180 },
      eyebrow: 'The comparison',
      head: 'The shovel beat\nthe chip',
      say: 'Nvidia is up ten percent over the same stretch.',
      ask: 'Eight points behind the diggers.',
      visual: { kind: 'versus', aK: 'COPPER MINERS', aV: '+17.7%', bK: 'NVIDIA', bV: '+10.1%', aSym: 'FCX', bSym: 'NVDA' },
    },
    {
      role: 'evidence', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/datacenter-aisle.mp4', loopFrames: 180 },
      eyebrow: 'Why it makes sense',
      head: 'Every AI hall\nis wired in copper',
      say: 'Data centers run on copper. That part of the story is real.',
      ask: 'So you buy the miners, right?',
      visual: { kind: 'stat', label: 'THE STRUCTURAL CASE', value: 'REAL', sub: 'AI build-out is copper-intensive', up: true, sym: 'FCX' },
    },
    {
      // ★★ 인사이트 비트 — 우리가 직접 센 것
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/fab-hall-bright.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM BASE RATE',
      head: 'We counted\n1,361 windows',
      say: 'We checked every five-week window since 2021. One thousand three hundred sixty-one.',
      ask: 'The miners led in 577 of them.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'WINDOWS SINCE 2021', v: '1,361', up: true, sym: 'RISK' },
          { k: 'MINERS LED', v: '577', up: true, sym: 'FCX' },
          { k: 'GAVE IT BACK NEXT MONTH', v: '58%', up: false, sym: 'FCX' },
        ],
      },
    },
    {
      // ★ 대조군을 «같이» 낸다 — 구버전이 뺐던 부분
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/grid-heliostat.mp4', loopFrames: 300 },
      eyebrow: 'Against the baseline',
      head: 'Minus 4.3 points.\nBaseline was 2.4.',
      say: 'After a lead they trail Nvidia by four point three points at the median.',
      ask: 'Any random window trails by two point four.',
      visual: {
        kind: 'versus',
        aK: 'AFTER A 5-WEEK LEAD', aV: '-4.3%p', aSym: 'FCX',
        bK: 'ANY GIVEN WINDOW', bV: '-2.4%p', bSym: 'FCX',
      },
    },
    {
      // ★ 반증·정직 — 폭락이 아니다
      role: 'evidence', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/supertanker.mp4', loopFrames: 180 },
      eyebrow: 'What it is not',
      head: 'They did not fall.\nThey fell behind.',
      say: 'The miners still rose. Just slower than the chip.',
      ask: 'A lag, not a crash.',
      visual: { kind: 'stat', label: 'MINERS AFTER A LEAD', value: '+0.64%', sub: 'median own return, next month', up: true, sym: 'FCX' },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/nyse-flags.mp4', loopFrames: 180 },
      eyebrow: 'SIGNUM READ',
      head: 'Right story.\nWrong entry.',
      say: 'Our read: the structural case and the five-week trade are not the same thing.',
      ask: '1,361 windows. Not a forecast.',
      visual: { kind: 'stat', label: 'SIGNUM READ · RESOURCE', value: 'STRUCTURAL YES', sub: 'tactical lead already spent, 577 cases', up: false, sym: 'RISK' },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'The story, or the entry —\nwhich one are you buying?',
  },
};

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
    bg: { kind: 'video', src: 'shorts/bg/video/c811-hook-chip.mp4', loopFrames: 120 },
  },
  loop: 'Two tapes closed today.\nOnly one was red.',

  beats: [
    {
      // prio 2 — 훅이 이미 «지수가 빠졌다»를 말한다. 짧은 판에서는 이 확인 비트를 버려야
      // 틱톡 창(28~38s)에 들어간다. prio 1 로 두면 40.4s 가 나와 창을 넘는다(실측).
      role: 'market', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/c811-00-exchange.mp4', loopFrames: 180 },
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
      bg: { kind: 'video', src: 'shorts/bg/video/c811-01-cleanroom.mp4', loopFrames: 300 },
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
      bg: { kind: 'video', src: 'shorts/bg/video/c811-02-mirrorcity.mp4', loopFrames: 151 },
      eyebrow: 'The layer a red board hides',
      head: 'Dark pool took\n42.7% of volume',
      say: 'Almost forty-three percent of volume never touched the public exchange.',
      ask: 'The board is red. The prints are not public.',
      visual: { kind: 'stat', label: 'DARK POOL SHARE', value: '42.7%', sub: 'institutional prints, 11.4M', up: true },
    },
    {
      role: 'money', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/c811-03-energygrid.mp4', loopFrames: 300 },
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
      bg: { kind: 'video', src: 'shorts/bg/video/c811-04-papercrowd.mp4', loopFrames: 180 },
      eyebrow: 'Crowd versus machine',
      head: 'Greed 60.8.\nRisk dial 51.',
      say: 'Fear and Greed prints sixty point eight. Our risk dial reads fifty-one.',
      ask: 'The crowd is warmer than the machine.',
      visual: { kind: 'versus', aK: 'FEAR&GREED', aV: '60.8 GREED', bK: 'RISK DIAL', bV: '51', aSym: 'FEARGREED', bSym: 'RISK' },
    },
    {
      // ★★ 인사이트 비트 — 우위가 «없다»는 것을 세어서 보여준다 (kit/insight.ts noEdgeBeat 형식)
      role: 'evidence', prio: 1,
      // 수백 장의 «똑같은» 거울판 = "우리가 하나하나 다 세어봤다". 강철 볼(추상)은 폐기했다 —
      // 배경은 시장·산업 소재여야 한다(대표 지시 2026-08-12 · 맥도 추상 B롤 64편 전량 폐기).
      bg: { kind: 'video', src: 'shorts/bg/video/c811-05-mirrorfield.mp4', loopFrames: 165 },
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
      bg: { kind: 'video', src: 'shorts/bg/video/c811-06-columns-tight.mp4', loopFrames: 83 },
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
      bg: { kind: 'video', src: 'shorts/bg/video/c811-07-wafer-tight.mp4', loopFrames: 135 },
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

// ============================================================================
// SCRIPT_CLOSE814 — 「브로드컴이 6% 빠졌다. 섹터 열한 개 중 일곱 개는 올랐다」
//                    2026-08-14 (금) ET 마감 · 장마감 브리핑
// ----------------------------------------------------------------------------
// ★ 숫자 출처 — 두 갈래. 섞지 않는다.
//   [A] 캡처 c815-dash.txt 중 «CLOSED» 표기 + 우리 고유 지표만:
//       NASDAQ 26,729 -0.28% · S&P 500 7,785.76 -0.17% · DOW 53,732 -0.20%
//       ROTATION 94 「Defensive Tilt」 · DARK POOL 55.2% (13.4M) · RISK 53
//       ⛔ TOP MOVERS 미사용 · VIX 미사용(I:VIX 플랜 밖 = 독립검증 불가)
//   [B] 개별 종목·섹터·ETF 는 Polygon 일봉 종가로 재측정 (2026-08-15 실조회):
//       AVGO 392.99 -5.94% · AMD 514.39 +6.50% · SMH 587.82 -0.22%
//       IWM +0.52% · RSP +0.02%
//       섹터 11개 등락: XLE +1.39 · XLU +0.61 · XLB +0.44 · XLI +0.39 · XLC +0.36
//                      · XLRE +0.33 · XLP +0.10  (7개 상승)
//                      XLV -0.60 · XLK -0.40 · XLY -0.21 · XLF -0.17  (4개 하락)
//
// ★ 인사이트 = 직접 계산 (Polygon 일봉 2021-01-05 ~ 2026-08-14, 1,410 세션)
//   조건은 «전방수익률을 보기 전에» 고정했다:
//     SPY 당일 하락 AND 11개 섹터 SPDR 중 7개 이상 상승
//   결과: 총 56건(당일 포함) · 전방 데이터가 있는 55건 기준
//     · S&P 5거래일 뒤 상승 65.5% (대조군 59.8%)  → +5.7%p
//     · 중앙 수익률 +0.69% (대조군 +0.40%)
//     · 10거래일 뒤 상승 65.5% · 1거래일 뒤는 50.9% (사실상 동전던지기)
//   ⇒ «지수가 빠져도 폭이 살아있으면 강세»라는 통념은 «방향은 맞지만 크기는 과장»이다.
//     우리 아침 스캔의 채택선(8%p)을 넘지 못한다 → 그 사실을 그대로 말한다.
//
// ★ 종목 맥락 (Polygon, 2024-01-01 이후 656 세션 기준)
//   AVGO -5.94% = 하위 17번째(상위 2.6% 악화일) · 이만큼 나쁜 날은 2026-06-05 이후 처음
//   AMD +6.50% = 상위 32번째 · 같은 날 두 종목 간격 12.4%p, 그런데 SMH 는 -0.22%
//
// 컴플라이언스: 과거 빈도 서술만. 미래형 동사 0. 「SIGNUM READ」로 사실과 해석 분리.
// 로테이션 축: 지수·매크로 (직전 6편이 AI·기술수급/시장구조에 몰려 있어 축을 바꿨다)
// ============================================================================
export const SCRIPT_CLOSE814: BriefingProps = {
  voice: VOICE_CLOSE814,
  title: 'Broadcom fell 6%.\nHere is what the index hid.',
  date: 'AUG 14 · AFTER THE CLOSE',
  data: { seed: 'CLOSE814' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['AVGO', 'AMD'],
  tape: [
    { t: 'S&P 500', v: '-0.17%', up: false }, { t: 'NASDAQ', v: '-0.28%', up: false },
    { t: 'AVGO', v: '-5.94%', up: false }, { t: 'AMD', v: '+6.50%', up: true },
    { t: 'SECTORS UP', v: '7 of 11', up: true }, { t: 'ROTATION', v: '94', up: true },
  ],
  hook: {
    // 배경 교체 근거(썸네일 하드룰 ①): 이전 skyline-red-river 는 저채도·어두워 스크롤을 못 멈춘다.
    // rams-vs-block = 두 유압 램이 발광 강괴를 «양쪽에서» 짓누르는 그림 = 이 편의 이야기 그 자체
    // (AMD 와 AVGO 가 반대로 당겨 반도체 지수를 제자리에 묶었다). 고대비 주황 + 하단 암부.
    line: 'Broadcom fell 6%.\nHere is what the index hid.',
    sub: 'Seven of eleven sectors closed green.',
    bigNum: '-5.94%',
    stamp: 'AUG 14 · AFTER THE CLOSE',
    bg: { kind: 'video', src: 'shorts/bg/video/rams-vs-block.mp4', loopFrames: 300 },
  },
  loop: 'The index closed red.\nMost of the market did not.',

  beats: [
    {
      // prio 2 — 훅이 이미 «적색 마감»을 말했다. 틱톡판은 여기를 버려 창 안으로 들어간다.
      role: 'market', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/nyse-flags.mp4', loopFrames: 180 },
      eyebrow: 'The close',
      head: 'All three\nfinished red',
      say: 'All three indexes closed red.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'S&P 500', v: '-0.17%', up: false, sym: 'SP500' },
          { k: 'NASDAQ', v: '-0.28%', up: false, sym: 'NASDAQ' },
          { k: 'DOW', v: '-0.20%', up: false, sym: 'DOW' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 180 },
      eyebrow: 'Underneath the index',
      head: 'Seven of eleven\nsectors closed green',
      say: 'Seven of the eleven sectors closed green. Small caps rose half a percent.',
      ask: 'Equal weight finished flat, not red.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'SECTORS GREEN', v: '7 of 11', up: true, sym: 'RISK' },
          { k: 'RUSSELL 2000', v: '+0.52%', up: true, sym: 'RUSSELL' },
          { k: 'EQUAL WEIGHT', v: '+0.02%', up: true, sym: 'SP500' },
        ],
      },
    },
    {
      role: 'chips', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/fiber-one-lit.mp4', loopFrames: 151 },
      eyebrow: 'Where the red came from',
      head: 'Broadcom down 6\nAMD up 6.5',
      say: 'Broadcom fell almost six percent, its worst day since June. AMD ran six and a half.',
      ask: 'Same sector, same day, twelve points apart.',
      visual: { kind: 'versus', aK: 'AMD', aV: '+6.50%', bK: 'AVGO', bV: '-5.94%' },
    },
    {
      // ★★ 인사이트 비트 — 직접 계산한 베이스레이트
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/glass-tube-array.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM BASE RATE',
      head: '55 days like this\nsince 2021',
      say: 'We counted every session since twenty twenty-one. Index red, most sectors green, fifty-five times.',
      ask: 'Higher five days later in sixty-six percent.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'EVENTS SINCE 2021', v: '55', up: true, sym: 'SP500' },
          { k: 'HIGHER 5 DAYS', v: '65.5%', up: true, sym: 'SP500' },
          { k: 'ANY GIVEN DAY', v: '59.8%', up: false, sym: 'SP500' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/temple-storm.mp4', loopFrames: 452 },
      eyebrow: 'SIGNUM READ',
      head: 'The index got\nthe breadth wrong',
      say: 'Our read: the index reported one stock, not the market.',
      ask: 'That edge is six points, not a green light.',
      visual: {
        kind: 'stat',
        label: 'SIGNUM READ · AUG 14', value: 'BREADTH BEAT INDEX',
        sub: '7 of 11 sectors green on a red tape', up: true, sym: 'RISK',
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    // ★ 구독 CTA (실측 5원칙 중 하나). 참여 질문은 고정댓글로 옮겼다 —
    //   아웃트로에 둘 다 넣으면 어느 쪽도 안 남는다.
    ask: 'Subscribe - we count the tape\nevery close.',
  },
};

/**
 * RETAIL817 · 「소매가 실적 «전»에 사람을 줄였다」
 * ---------------------------------------------------------------------------
 * ★ 전 수치 «1차 출처» 검증 완료 (2026-08-17). 2차 기사 인용 0건.
 *   · BLS「THE EMPLOYMENT SITUATION - JULY 2026」USDL-26-1291 (8/7 08:30 ET)
 *       "Retail trade lost 19,000 jobs in July."
 *       "warehouse clubs, supercenters, and other general merchandise retailers (-21,000)"
 *       "Total nonfarm payroll employment changed little in July (-23,000)"
 *       실업률 4.1% · 시간당임금 $37.62(전년 +3.2%)
 *   · Census「Advance Monthly Sales for Retail and Food Services」CB26-131 (8/14)
 *       "$763.6 billion, down 0.6 percent (±0.4 percent) from the previous month,
 *        but up 5.0 percent (±0.5 percent) from July 2025"
 *   · 실적일: Home Depot 8/18(화) 장전 · Target 8/19(수) 장전 · Walmart 8/20(목)
 *
 * ★ 이 편의 «앵글» — 뉴스가 안 한 연결.
 *   기사들은 소매판매 -0.6% 만 다뤘다. 아무도 «같은 달 소매 고용»을 붙이지 않았다.
 *   그런데 21,000 을 줄인 그 세부업종(창고형 클럽·슈퍼센터·종합소매)이
 *   바로 이번 주 실적을 내는 Walmart·Target·Costco 의 카테고리다.
 *   고용은 «지난 분기 보고»가 아니라 «다음 분기 베팅»이다 — 그래서 선행한다.
 *
 * ★ 뉴스형 연출: 사실 비트 2개를 visual.kind='source' 로 간다.
 *   빨간 SOURCE 배지 + 기관명 + 발표일 + 원문 헤드라인 = 뉴스 카드.
 *   우리 해석(depth)과 «시각적으로» 분리된다 — 사실과 의견을 섞지 않는다.
 */
export const SCRIPT_RETAIL817: BriefingProps = {
  voice: VOICE_RETAIL817,
  title: '21,000 jobs gone in\nWalmart’s category.',
  date: 'AUG 17 · BEFORE THE OPEN',
  data: { seed: 'RETAIL817' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['WMT', 'TGT'],
  tape: [
    { t: 'RETAIL JOBS JUL', v: '-19,000', up: false },
    { t: 'CLUBS & SUPERCENTERS', v: '-21,000', up: false },
    { t: 'TOTAL PAYROLLS', v: '-23,000', up: false },
    { t: 'RETAIL SALES JUL', v: '-0.6%', up: false },
    { t: 'VS YEAR AGO', v: '+5.0%', up: true },
    { t: 'UNEMPLOYMENT', v: '4.1%', up: false },
  ],
  hook: {
    // ★ 배경 교체 이력 (2026-08-17):
    //   1안 crack-star(회색 균열) → 렌더 실측 결과 거의 균일한 회색. 하드룰 ① 위반 폐기
    //   2안 rams-vs-block → 은유는 맞았으나 CLOSE814(8/14)와 중복
    //   3안 retail-carts-dusk ★ 확정 — Flow 신규 발주분.
    //     비 오는 주차장에 남겨진 쇼핑카트 줄. 주황 가로등 + 청색 황혼 = 고채도 고대비,
    //     하단 젖은 아스팔트가 어두워 제목이 박힌다(하드룰 ②).
    //     무엇보다 «소매 그 자체»다 — 비유가 아니라 대상을 직접 보여준다.
    // ★ 심볼 히어로 (2026-08-10 지시 「모든 티커에 심볼도 같이」 — v3 까지 «비어 있었다»).
    //   종목 편의 프레임0 은 문장보다 «심볼»이 먼저 읽혀야 한다. 460px 단독 배치.
    //   WMT 는 스파크 도형이라 100px 원본을 4.6배로 키워도 깨지지 않는다(실측).
    //   HD 를 같이 넣지 않는 이유: 워드마크라 이 크기에서 글자가 뭉갠다(실측).
    syms: ['WMT'],
    line: '21,000 jobs gone in\nWalmart’s category.',
    sub: 'They report Thursday.',
    // ★ bigNum 을 «쓰지 않는다» — 2026-08-17 A/B 실측(still 렌더 비교):
    //   심볼 히어로(460px)와 숫자 슬래브(168px)를 같이 넣으면 블록이 넘쳐
    //   sub("They report Thursday.")가 면책 문구와 «겹친다». 게다가 21,000 이
    //   슬래브와 헤드라인에 두 번 나와 중복이다.
    //   bigNum 은 원래 「심볼 없는 프레임이 밋밋하다」(8/12)를 풀려고 넣은 장치다.
    //   심볼 히어로가 그 역할을 대신하므로 «심볼이 있으면 bigNum 은 뺀다».
    stamp: 'AUG 17 · BEFORE THE OPEN',
    bg: { kind: 'video', src: 'shorts/bg/video/retail-carts-dusk.mp4', loopFrames: 300 },
  },
  loop: 'They cut the staff first.\nNow they tell us why.',

  beats: [
    {
      // 뉴스 ① — 고용. 원문 문장을 그대로 화면에 띄운다.
      role: 'evidence', prio: 1,
      // 텅 빈 셀프계산대 열 — 「사람이 사라졌다」를 비유 없이 직접 보여준다.
      // 이 비트가 말하는 -21,000 이 바로 저 자리에 서 있던 사람들이다.
      bg: { kind: 'video', src: 'shorts/bg/video/retail-checkout-empty.mp4', loopFrames: 300 },
      eyebrow: 'BLS · JULY JOBS REPORT',
      head: 'Retail lost 19,000\njobs in July',
      say: 'On August seventh, the Labor Department reported retail trade lost nineteen thousand jobs in July.',
      ask: 'Warehouse clubs and supercenters alone lost twenty-one thousand.',
      visual: {
        kind: 'source',
        outlet: 'U.S. Bureau of Labor Statistics',
        at: 'AUG 7 · USDL-26-1291',
        headline: 'Retail trade lost 19,000 jobs in July.',
        body: 'Warehouse clubs, supercenters and other general merchandise retailers: -21,000. Total nonfarm payrolls: -23,000.',
      },
    },
    {
      // 뉴스 ② — 매출. 오차범위까지 읽어준다(우리 채널의 차별점).
      role: 'money', prio: 1,
      // 창고형 클럽 통로에 천장까지 쌓인 팔레트 — 「물건은 있는데 안 나간다」.
      // 매출 -0.6% 비트에 정확히 맞고, BLS 가 지목한 그 업종(창고형 클럽)이기도 하다.
      bg: { kind: 'video', src: 'shorts/bg/video/retail-warehouse-aisle.mp4', loopFrames: 300 },
      eyebrow: 'CENSUS · JULY RETAIL SALES',
      head: 'Retail sales fell\n0.6 percent',
      say: 'One week later, the Census Bureau reported July retail sales fell six tenths of a percent.',
      ask: 'The margin of error is four tenths. This drop is real.',
      visual: {
        kind: 'source',
        outlet: 'U.S. Census Bureau',
        at: 'AUG 14 · CB26-131',
        headline: 'July retail sales: $763.6 billion, down 0.6 percent.',
        body: 'Down 0.6% (±0.4%) from June, up 5.0% (±0.5%) from July 2025.',
      },
    },
    {
      // ★★ 해석 비트 — 이게 상품이다. 두 조사는 «독립»이라는 점이 핵심.
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/vault-doors.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM READ',
      head: 'Payrolls are a\nforward decision',
      say: 'Two separate surveys. One asks companies about payrolls, one asks about sales. Both landed on July.',
      ask: 'Staff cuts are a bet on the quarter ahead, not the one behind.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'JOBS SURVEY', v: '-21,000', up: false, sym: 'FED' },
          { k: 'SALES SURVEY', v: '-0.6%', up: false, sym: 'CPI' },
          { k: 'SAME MONTH', v: 'JULY', up: false, sym: 'RISK' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/desks-dawn.mp4', loopFrames: 151 },
      eyebrow: 'THIS WEEK',
      head: 'Three retailers\nanswer it',
      say: 'Home Depot reports Tuesday. Target Wednesday. Walmart Thursday.',
      ask: 'The category that cut the most reports last.',
      visual: {
        kind: 'rows',
        rows: [
          // ★ 2026-08-17: 종전엔 DJI·500 «지수 배지»로 때웠다(WMT·TGT·HD 로고가
          //   라이브러리에 없었다). 로고를 수확해 실 심볼로 바꿨다.
          //   행 크기(SYM.card)에서는 워드마크인 HD 도 또렷하다.
          { k: 'HOME DEPOT', v: 'TUE', up: true, sym: 'HD' },
          { k: 'TARGET', v: 'WED', up: true, sym: 'TGT' },
          { k: 'WALMART', v: 'THU', up: true, sym: 'WMT' },
        ],
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Subscribe - we read the filings\nbefore the headlines.',
  },
};

/**
 * JOBS817 · 「충격이 아니라 «이미 1년째»였다」
 * ---------------------------------------------------------------------------
 * ★ 전 수치 1차 출처 — BLS「THE EMPLOYMENT SITUATION - JULY 2026」USDL-26-1291
 *   (2026-08-07 08:30 ET 발표). 2차 기사 인용 0건. 원문 문장:
 *     "Total nonfarm payroll employment changed little in July (-23,000),
 *      following an average monthly gain of 34,000 over the prior 12 months."
 *     "the number of people on temporary layoff increased by 153,000 to 921,000"
 *     "Since January, the labor force participation rate declined by 0.7 percentage point"
 *     "Financial activities employment is down by 121,000 since a recent peak in May 2025."
 *     실업률 4.1% · 실업자 6.9M · 장기실업 1.8M(전체의 25.5%)
 *
 * ★ 앵글 — 헤드라인이 놓친 «같은 보도자료 안»의 문장.
 *   시장은 -23,000 을 «충격»으로 다뤘다. 그런데 바로 다음 절에 「직전 12개월 평균이
 *   +34,000」이라고 적혀 있다. 한 달에 3만 4천 명은 «사실상 정지»다.
 *   즉 7월은 예외가 아니라 «추세가 도착한 달»이다.
 *   그리고 아무도 인용하지 않은 한 줄: 임시해고가 «한 달에» 15만 3천 명 늘었다.
 *   임시해고는 영구해고에 선행한다 — 이게 이 편에서 가장 무서운 숫자다.
 *
 * ★ 심볼: 매크로 편이라 «종목 티커»가 없다 → hook.syms 를 쓰지 않고 bigNum 으로 간다.
 *   (2026-08-17 규칙: 심볼 히어로가 있으면 bigNum 을 빼고, 없으면 bigNum 을 쓴다)
 */
export const SCRIPT_JOBS817: BriefingProps = {
  voice: VOICE_JOBS817,
  title: 'Payrolls fell 23,000.\nThe year averaged 34,000.',
  date: 'AUG 17 · LABOR MARKET',
  data: { seed: 'JOBS817' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['SPY', 'DIA'],
  tape: [
    { t: 'JULY PAYROLLS', v: '-23,000', up: false },
    { t: 'PRIOR 12-MO AVG', v: '+34,000', up: false },
    { t: 'TEMP LAYOFFS', v: '+153,000', up: false },
    { t: 'UNEMPLOYMENT', v: '4.1%', up: false },
    { t: 'PARTICIPATION', v: '61.4%', up: false },
    { t: 'WAGES YoY', v: '+3.2%', up: true },
  ],
  hook: {
    // 밤에 내려진 셔터 — 하단 암부가 가장 깊어 제목이 박힌다(하드룰 ②).
    // 소매업이 7월 최대 감원 업종이었으므로 소재와도 맞는다.
    line: 'Payrolls fell 23,000.\nThe year averaged 34,000.',
    sub: 'It was never a shock.',
    bigNum: '-23,000',
    stamp: 'AUG 17 · LABOR MARKET',
    bg: { kind: 'video', src: 'shorts/bg/video/retail-shutter-night.mp4', loopFrames: 300 },
  },
  loop: 'The trend did not break in July.\nIt just arrived.',

  beats: [
    {
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/paper-crowd.mp4', loopFrames: 180 },
      eyebrow: 'BLS · JULY EMPLOYMENT SITUATION',
      head: 'Payrolls fell\n23,000 in July',
      say: 'Payrolls fell twenty-three thousand in July.',
      ask: 'Unemployment held at four point one.',
      visual: {
        kind: 'source',
        outlet: 'U.S. Bureau of Labor Statistics',
        at: 'AUG 7 · USDL-26-1291',
        headline: 'Nonfarm payroll employment changed little in July (-23,000).',
        body: 'Unemployment rate 4.1%. 6.9 million unemployed. Long-term unemployed 1.8 million, 25.5% of the total.',
      },
    },
    {
      // ★★ 반전 — 같은 보도자료 «다음 문장»
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 180 },
      eyebrow: 'THE NEXT SENTENCE',
      head: 'The prior year\naveraged 34,000',
      say: 'The prior year averaged just thirty-four thousand.',
      ask: 'That is already a standstill.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'JULY', v: '-23,000', up: false, sym: 'RISK' },
          { k: 'PRIOR 12-MO AVG', v: '+34,000', up: false, sym: 'RISK' },
          { k: 'GAP', v: '57,000', up: false, sym: 'CPI' },
        ],
      },
    },
    {
      // ★★★ 가장 무서운 줄 — 아무도 인용하지 않았다
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/desks-dawn.mp4', loopFrames: 151 },
      eyebrow: 'THE LINE NOBODY QUOTED',
      head: 'Temporary layoffs\nrose 153,000',
      say: 'Temporary layoffs jumped in a single month.',
      ask: 'And they lead permanent cuts.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'TEMP LAYOFF NOW', v: '921,000', up: false, sym: 'RISK' },
          { k: 'ONE-MONTH RISE', v: '+153,000', up: false, sym: 'RISK' },
          { k: 'PERMANENT LOSERS', v: '1.7M', up: false, sym: 'CPI' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/undercurrent-pull.mp4', loopFrames: 300 },
      eyebrow: 'SIGNUM READ',
      head: 'People are leaving,\nnot just losing',
      say: 'Participation is down since January.',
      ask: 'Our read: erosion, not one bad month.',
      visual: {
        kind: 'stat',
        label: 'SIGNUM READ · AUG 17', value: 'EROSION, NOT A SHOCK',
        sub: 'Participation -0.7pt since January', up: false, sym: 'RISK',
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Subscribe - we read the release,\nnot the headline.',
  },
};

/**
 * FEDGAP817 · 교육형 「왜 나쁜 고용 뉴스가 주가를 «올리나»」
 * ---------------------------------------------------------------------------
 * ★ 채널 실측: 최고 성과 2편이 «교육형»이다 (183회·178회). 상시 검색으로도 걸린다.
 * ★ 전 수치 1차 출처:
 *   · Fed「Summary of Economic Projections, June 16-17 2026」(federalreserve.gov)
 *       18명 제출 · end-2026 중앙값 3.8% · 분포 4.375%:1 / 4.125%:5 / 3.875%:3
 *       / 3.625%:8 / 3.375%:1  → 현재 수준(3.625%) «위»가 9명, 동결 8명, 인하 1명
 *   · Fed 「FOMC calendars」 다음 회의 = 9월 15-16일 (점도표 갱신 회차)
 *   · BLS USDL-26-1291 — 7월 고용 -23,000
 *
 * ★ 앵글: 메커니즘을 «이 달의 실제 숫자»로 가르친다. 일반론으로 끝내지 않는다.
 *   연준 위원 «절반»이 인상을 찍어놨는데 고용이 무너졌다 → 인상 명분이 사라진다
 *   → 그래서 나쁜 뉴스가 주가에 좋게 작용한다. 답은 9월 16일에 나온다.
 */
export const SCRIPT_FEDGAP817: BriefingProps = {
  voice: VOICE_FEDGAP817,
  title: 'Why bad jobs news\nmakes stocks go up.',
  date: 'AUG 17 · HOW IT WORKS',
  data: { seed: 'FEDGAP817' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['SPY', 'QQQ'],
  tape: [
    { t: 'FED TARGET', v: '3.50-3.75%', up: false },
    { t: 'JUNE DOTS · HIGHER', v: '9 of 18', up: false },
    { t: 'JUNE DOTS · HOLD', v: '8 of 18', up: false },
    { t: 'JUNE DOTS · LOWER', v: '1 of 18', up: false },
    { t: 'JULY PAYROLLS', v: '-23,000', up: false },
    { t: 'NEXT FOMC', v: 'SEP 15-16', up: true },
  ],
  hook: {
    line: 'Why bad jobs news\nmakes stocks go up.',
    sub: 'Nine of eighteen wanted a hike.',
    bigNum: '9 of 18',
    stamp: 'AUG 17 · HOW IT WORKS',
    bg: { kind: 'video', src: 'shorts/bg/video/fed-building.mp4', loopFrames: 180 },
  },
  loop: 'Weak jobs take the hike\noff the table. That is the whole trick.',

  beats: [
    {
      role: 'money', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 180 },
      eyebrow: 'STEP 1 · WHO SETS THE PRICE',
      head: 'Rates set what\nstocks are worth',
      say: 'Higher rates make future earnings worth less.',
      ask: 'The Fed moves the whole board.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'RATES UP', v: 'STOCKS DOWN', up: false, sym: 'FED' },
          { k: 'RATES DOWN', v: 'STOCKS UP', up: true, sym: 'FED' },
          { k: 'FED TARGET NOW', v: '3.50-3.75%', up: false, sym: 'FED' },
        ],
      },
    },
    {
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/temple-storm.mp4', loopFrames: 452 },
      eyebrow: 'STEP 2 · WHAT THE FED PENCILLED IN',
      head: 'Nine of eighteen\npencilled in a hike',
      say: 'Nine of eighteen put rates higher.',
      ask: 'Eight held. Only one went lower.',
      visual: {
        kind: 'source',
        outlet: 'Federal Reserve · Summary of Economic Projections',
        at: 'JUNE 16-17, 2026',
        headline: 'Median end-2026 federal funds rate: 3.8 percent.',
        body: 'Above the current 3.50-3.75% target. 9 of 18 participants projected higher, 8 unchanged, 1 lower.',
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/retail-shutter-night.mp4', loopFrames: 300 },
      eyebrow: 'STEP 3 · THEN JULY HAPPENED',
      head: 'Payrolls fell\n23,000',
      say: 'Then payrolls fell twenty-three thousand.',
      ask: 'The hike case weakened. Stocks called it relief.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'FED PENCILLED', v: 'HIGHER', up: false, sym: 'FED' },
          { k: 'JULY JOBS', v: '-23,000', up: false, sym: 'RISK' },
          { k: 'HIKE CASE', v: 'WEAKER', up: true, sym: 'FED' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/golden-bell.mp4', loopFrames: 180 },
      eyebrow: 'STEP 4 · WHEN YOU FIND OUT',
      head: 'September 16\nsettles it',
      say: 'Next meeting: September fifteenth and sixteenth.',
      ask: 'A new dot plot lands with it.',
      visual: {
        kind: 'stat',
        label: 'NEXT FOMC · WITH PROJECTIONS', value: 'SEP 15-16',
        sub: 'New dot plot. The June dots get replaced.', up: true, sym: 'FED',
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Subscribe - we explain the\nmechanics, not the noise.',
  },
};

/**
 * MORNING818 · 월요일 개장 전 브리핑 「인하 0%. 인상 32.5%.」
 * ---------------------------------------------------------------------------
 * ★ 게시: 2026-08-17(월) 21:00 KST = 08:00 ET — 개장(09:30 ET) «1시간 30분 전»
 *
 * ★ 수치 출처 — «우리 파이프라인» 우선 (2026-08-17 06:32~06:34 UTC 실호출)
 *   · /api/market/index-close   금요일 마감: SPX 7,785.76 -0.17% · NAS 26,729.16 -0.28% · DOW 53,732.41 -0.20%
 *   · /api/market/macro         라이브 선물(02:22 ET): NQ 30,273.75 +0.44% · SPX선물 7,816.50 +0.15%
 *                               US10Y 4.696% (+1.19%) · DXY 99.495 · Gold 4,451.30 · Oil 81.82 · SOX -0.31%
 *                               VIX 14.25 (※ marketTime 8/14 = «금요일 종가», 라이브 아님)
 *   · /api/guardian/fedwatch    인하 0% · 동결 67.5% · 인상 32.5% (scrapedAt 2026-08-14 22:12 = 최신본)
 *   · /api/guardian/economic-calendar  FOMC 의사록 8/19 18:00 UTC = 14:00 ET (HIGH)
 *                               Empire State 8/17 08:30 ET(prev 15.6) · Housing Starts 8/18(HIGH)
 *                               Jobless Claims 8/20 08:30 ET(prev 209K) · PMI 8/21 09:45 ET
 *   · 실적일(교차검증): Home Depot 8/18 장전 · Target 8/19 장전 · Walmart 8/20
 *   · BLS USDL-26-1291: 7월 고용 -23,000 (원문 직독)
 *
 * ★ 이 편의 앵글 — 「모두가 반대로 알고 있다」
 *   언론과 대중은 「고용이 무너졌으니 연준이 인하하겠지」로 읽는다.
 *   그런데 «선물시장이 반영한 인하 확률은 0.0%»다. 오히려 인상이 32.5%다.
 *   그리고 10년물이 4.696%로 «오르고» 있다 — 채권시장은 침체가 아니라 «인플레»를 본다.
 *   즉 시장의 실제 질문은 「언제 내리나」가 아니라 「또 올릴 것인가」다.
 *   WSJ 헤드라인도 rate-CUT 이 아니라 "reduced rate-HIKE expectations" 라고 쓴다(8/16).
 *
 * ★ 심볼: 매크로 편 → hook.syms 없이 bigNum('0%')로 간다 (2026-08-17 확립 규칙)
 */
export const SCRIPT_MORNING818: BriefingProps = {
  voice: VOICE_MORNING818,
  title: 'Rate cut odds are 0%.\nHike odds are 32.5%.',
  date: 'AUG 17 · BEFORE THE OPEN',
  data: { seed: 'MORNING818' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['SPY', 'QQQ'],
  tape: [
    { t: 'RATE CUT ODDS', v: '0.0%', up: false },
    { t: 'HOLD', v: '67.5%', up: true },
    { t: 'HIKE', v: '32.5%', up: false },
    { t: 'US 10Y', v: '4.696%', up: false },
    { t: 'NASDAQ FUT', v: '+0.44%', up: true },
    { t: 'VIX (FRI)', v: '14.25', up: true },
    { t: 'FOMC MINUTES', v: 'WED 2PM', up: false },
  ],
  hook: {
    // 연준 청사 — 이 편의 주어가 연준이다. 밝은 대리석 + 파란 하늘 = 고채도 고대비.
    line: 'Rate cut odds are 0%.\nHike odds are 32.5%.',
    sub: 'The market is not betting on relief.',
    bigNum: '0%',
    stamp: 'AUG 17 · BEFORE THE OPEN',
    bg: { kind: 'video', src: 'shorts/bg/video/fed-building.mp4', loopFrames: 180 },
  },
  loop: 'Everyone read it as a cut coming.\nThe market priced zero.',

  beats: [
    {
      // 최신성 — 금요일 마감과 «지금» 선물이 다르다
      role: 'market', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/skyline-sunrise-fog.mp4', loopFrames: 151 },
      eyebrow: 'FRIDAY CLOSE vs THIS MORNING',
      head: 'All three closed red.\nFutures opened green',
      say: 'All three closed red Friday. Futures are green.',
      ask: 'The bounce is not rate-cut hope.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'S&P 500 (FRI)', v: '-0.17%', up: false, sym: 'SP500' },
          { k: 'NASDAQ (FRI)', v: '-0.28%', up: false, sym: 'NASDAQ' },
          { k: 'NASDAQ FUT (NOW)', v: '+0.44%', up: true, sym: 'NASDAQ' },
        ],
      },
    },
    {
      // ★★ 핵심 — 우리 FedWatch 실측
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 180 },
      eyebrow: 'SIGNUM · FED FUNDS FUTURES',
      head: 'Zero percent\nchance of a cut',
      say: 'Fed funds futures: cut odds are zero point zero.',
      ask: 'Hold sixty-seven. Hike thirty-two and a half.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'CUT', v: '0.0%', up: false, sym: 'FED' },
          { k: 'HOLD', v: '67.5%', up: true, sym: 'FED' },
          { k: 'HIKE', v: '32.5%', up: false, sym: 'FED' },
        ],
      },
    },
    {
      // ★★★ 해석 — 채권이 답을 말한다
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/undercurrent-pull.mp4', loopFrames: 300 },
      eyebrow: 'SIGNUM READ',
      head: 'Inflation fear,\nnot recession',
      say: 'The ten-year is rising, not falling.',
      ask: 'Slowdowns pull yields down. This is not that.',
      // ★ 기사 인용 — 우리 해석(head)을 «제3자 보도»가 뒷받침한다.
      //   우리 /api/guardian/news-digest 에서 나온 WSJ 헤드라인.
      //   「인하」가 아니라 「인상 기대 «축소»」라고 쓴다 — 이 편의 논지 그대로다.
      visual: {
        kind: 'source',
        outlet: 'The Wall Street Journal',
        at: 'AUG 16 · 21:01 ET',
        headline: 'Asian Currencies Strengthen Amid Reduced Fed Rate-Hike Expectations',
        body: 'The debate is hike versus hold - not when the cut comes. US 10Y 4.696%, up 1.19%.',
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/golden-bell.mp4', loopFrames: 151 },
      eyebrow: 'THIS WEEK DECIDES IT',
      head: 'Fed minutes land\nWednesday at two',
      say: 'Fed minutes land Wednesday at two.',
      ask: 'Home Depot Tuesday. Walmart Thursday.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'FOMC MINUTES', v: 'WED 2PM', up: false, sym: 'FED' },
          { k: 'RETAIL EARNINGS', v: 'TUE-THU', up: true, sym: 'DOW' },
          { k: 'JOBLESS CLAIMS', v: 'THU 8:30', up: false, sym: 'RISK' },
        ],
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Subscribe - we read the tape\nbefore the bell.',
  },
};

/**
 * CLOSE817 · 월요일 장마감 「좋은 지표가 나왔는데 지수는 빨갛게 닫혔다」
 * ---------------------------------------------------------------------------
 * ★ 게시: 2026-08-18(화) 06:00 KST = 8/17(월) 17:00 ET — 마감 «1시간 후»
 *   (마감 직후 30분은 시간외로 확정 종가가 흔들린다. 1시간 뒤면 전부 확정)
 *
 * ★ 수치 — 우리 파이프라인 실호출 (2026-08-17 22:48 UTC · «정규장 확정 종가»)
 *   /api/market/index-close   SPX 7,745.06 -0.52% · DOW 53,459.78 -0.51% · NAS 26,644.91 -0.32%
 *   /api/market/macro         SOX 12,621.01 +1.64%  ← 지수가 빨간 날 홀로 초록
 *                             VIX 15.19 +6.60% · US10Y 4.724% +0.60% · Russell2K -0.08%
 *                             Oil 85.12 +0.73% · Gold 4,469.80 -0.09% · DXY 99.581
 *   /api/market/movers        거래대금 1위 MU $33.7B +4.13% · 2위 SNDK $31.9B +8.88%
 *                             MSFT -3.04% ($14.2B) · NVDA -0.07% · AMD -1.63%
 *   /api/guardian/fedwatch    인하 0% · 동결 65% · 인상 35%  (직전 0/63.4/36.6 — 인상이 «올랐다»)
 *   /api/guardian/economic-calendar  Empire State 20.6 (이전 15.6) · NAHB 35 (이전 34)
 *                             FOMC 의사록 8/19 14:00 ET (HIGH)
 *   Motley Fool 8/17          MSFT 하락 원인 = 모건스탠리 「AI 매출이 AI 비용을 못 따라간다」
 *                             MSFT 올해 AI 인프라 지출 $1,900억
 *   MarketWatch 8/17 18:33    TLT(20년물 ETF) 2004년 이후 최저
 *
 * ★ 앵글 — 「좋은 지표 → 주식 하락」이라는 «역전»
 *   엠파이어스테이트가 15.6→20.6 으로 뛰었는데 3대 지수 전부 하락했고 10년물은 올랐다.
 *   경기가 좋으면 오르는 게 정상인데 반대로 갔다.
 *   이유: 좋은 지표가 「연준이 안 내린다」로 읽힌다. 인하 확률은 여전히 «정확히 0%»이고
 *   인상은 32.5%(아침) → 35.0%(마감)으로 «올랐다».
 *
 *   그리고 그 위에서 MSFT 와 메모리가 갈렸다 — 금리가 높게 유지되면 «먼 미래의 이익»을
 *   파는 쪽이 먼저 맞는다. MSFT 의 $1,900억 AI 투자는 수익이 몇 년 뒤다.
 *   메모리는 «지금 팔리는 물건»이라 할인율에 덜 다친다.
 *   같은 AI 테마인데 「지금 돈이 되는 쪽」과 「나중에 될 쪽」이 갈렸다. 이게 이 편의 해석이다.
 *
 * ★ 심볼: 매크로 편이라 hook.syms 없이 bigNum 으로 간다 (2026-08-17 확립 규칙)
 */
export const SCRIPT_CLOSE817: BriefingProps = {
  voice: VOICE_CLOSE817,
  title: 'Good data.\nRed close.',
  date: 'AUG 17 · AFTER THE CLOSE',
  data: { seed: 'CLOSE817' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['MU', 'MSFT'],
  tape: [
    { t: 'S&P 500', v: '-0.52%', up: false },
    { t: 'DOW', v: '-0.51%', up: false },
    { t: 'NASDAQ', v: '-0.32%', up: false },
    { t: 'SOX', v: '+1.64%', up: true },
    { t: 'EMPIRE STATE', v: '20.6', up: true },
    { t: 'US 10Y', v: '4.724%', up: false },
    { t: 'VIX', v: '15.19', up: false },
    { t: 'CUT ODDS', v: '0.0%', up: false },
  ],
  hook: {
    // exchange-storm = 거래소 파사드 위 폭풍. 「지표는 맑은데 시장은 흐리다」
    line: 'Good data.\nRed close.',
    sub: 'Every index finished lower.',
    bigNum: '-0.52%',
    stamp: 'AUG 17 · AFTER THE CLOSE',
    bg: { kind: 'video', src: 'shorts/bg/video/exchange-storm.mp4', loopFrames: 451 },
  },
  loop: 'Good data used to lift stocks.\nNot this week.',

  beats: [
    {
      role: 'market', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/skyline-red-river.mp4', loopFrames: 180 },
      eyebrow: 'THE CLOSE · AUG 17',
      head: 'Manufacturing beat.\nStocks still fell',
      say: 'Empire State beat: fifteen to twenty.',
      ask: 'All three indexes still closed red.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'EMPIRE STATE', v: '15.6 → 20.6', up: true, sym: 'CPI' },
          { k: 'S&P 500', v: '-0.52%', up: false, sym: 'SP500' },
          { k: 'DOW', v: '-0.51%', up: false, sym: 'DOW' },
        ],
      },
    },
    {
      role: 'chips', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/fiber-one-lit.mp4', loopFrames: 151 },
      eyebrow: 'WHERE THE MONEY WENT',
      head: 'Microsoft down 3.\nMemory led everything',
      say: 'Microsoft dropped three percent today.',
      ask: 'Memory took the top two in volume.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'MICRON', v: '+4.13%', up: true, sym: 'MU' },
          { k: 'SANDISK', v: '+8.88%', up: true, sym: 'SNDK' },
          { k: 'MICROSOFT', v: '-3.04%', up: false, sym: 'MSFT' },
        ],
      },
    },
    {
      // ★★ 해석 비트 — 이게 상품
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/undercurrent-pull.mp4', loopFrames: 300 },
      eyebrow: 'SIGNUM READ · US 10Y 4.724%',
      head: 'Good news now\nmeans no cut',
      say: 'The ten-year rose to four point seven.',
      ask: 'Strong data now means no rate cut.',
      visual: {
        kind: 'source',
        outlet: 'MarketWatch',
        at: 'AUG 17 · 18:33 ET',
        headline: 'Why this popular Treasury bond ETF is trading at its lowest since 2004',
        body: 'Strong data lifts yields, not stocks. Cut odds 0.0%, hike odds 35.0% - up from 32.5% this morning.',
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/golden-bell.mp4', loopFrames: 151 },
      eyebrow: 'TOMORROW AND AFTER',
      head: 'Fed minutes land\nWednesday at two',
      say: 'Fed minutes land Wednesday at two.',
      ask: 'Cut odds zero. Hike odds thirty-five.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'CUT ODDS', v: '0.0%', up: false, sym: 'FED' },
          { k: 'HIKE ODDS', v: '35.0%', up: false, sym: 'FED' },
          { k: 'FOMC MINUTES', v: 'WED 2PM', up: true, sym: 'FED' },
        ],
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Subscribe - we read the close,\nnot the headline.',
  },
};

/**
 * LONGEND818 · 「금리를 내리면 당신 모기지는 «더» 비싸진다」
 * ---------------------------------------------------------------------------
 * ★ 게시: 2026-08-18(화) 22:00 KST = 8/18 09:00 ET — 개장 «30분 전»
 *
 * ★ 사건 (2026-08-17 마감) — 30년물 국채금리가 5.31%, «2007년 6월 이후 최고»
 *   실측1  Yahoo ^TYX 일봉 종가 5.309% (marketTime 08-17 18:59 UTC) · 전일 5.236%
 *   실측2  Yahoo ^TYX 월봉 스캔(2005~) — 고가가 5.31% 를 넘은 달은 «2007-06 단 하나»
 *          → CNBC 의 "19년 최고" 보도를 «우리 계산으로 독립 검증»했다
 *   실측3  TradingEconomics 현재 5.3260% (+0.0200pp) — 지금도 오르는 중
 *   실측4  Mortgage News Daily 30년 고정 모기지 6.73% (8/17, +0.02pp)
 *   실측5  우리 파이프라인 /api/market/macro (asOfET 8/18 02:32)
 *          NQ선물 29,846 -0.83% · ES선물 7,736.25 -0.42% · US10Y 4.724% +0.60%
 *          Oil 85.37 +1.03% · Gold 4,450.80 -0.51% · VIX 15.19 +6.60%
 *   실측6  /api/guardian/fedwatch  인하 0% · 동결 65% · 인상 35%
 *   실측7  /api/guardian/economic-calendar  Housing Starts 8/18 08:30 ET (HIGH)
 *          FOMC 의사록 8/19 14:00 ET (HIGH)
 *   보도   CNBC 8/17 "30-year Treasury yield tops 5.31%, the highest in 19 years"
 *          연준 목표범위 3.50~3.75% · 7/29 회의에서 «3명이 인상 쪽 반대표»
 *          워시 의장 "There is no soft inflation target"
 *
 * ★ 앵글 — 「연준이 움직이는 금리와 «당신이 내는» 금리는 다른 금리다」
 *   연준 기준금리는 3.50~3.75%인데 30년물은 5.31%다. 연준은 «단기»를 쥐고 있고
 *   장기는 시장이 정한다. 그리고 그 장기가 2007년 수준까지 올라갔다.
 *
 *   ★★ 함정 (이 편의 핵심 해석)
 *   모기지는 기준금리가 아니라 «장기 금리»를 따라간다. 그런데 연준이 인하하면
 *   채권시장은 그것을 「연준이 인플레를 용인한다」로 읽는다 → 장기금리가 «오른다»
 *   → 모기지가 «더» 비싸진다. 인하가 내 대출을 싸게 해줄 거라는 상식이 뒤집힌다.
 *
 * ★ 채널 실측이 말하는 제목 규칙 (2026-08-18 조회수 전수)
 *   "YOUR"/유명 종목명 있음 → 178·202·209회 |  추상 지표만 → 10·40·42·46회
 *   그래서 이 편은 지표(5.31%)가 아니라 «당신의 모기지»를 제목에 세운다.
 *
 * ★ loopFrames 규약 — «영상 길이(초) × 30» 이다. 렌더 타임라인 기준이지 원본 프레임이 아니다.
 *   배경 원본은 전부 24fps 라서 ffprobe -count_frames 값(24fps)을 그대로 쓰면 «작게» 잡히고,
 *   비트 도중에 배경이 되감겨 튄다. 실측: temple-storm 15.0417s→451 / fed-building 6.0s→180
 *   undercurrent-pull 10.0s→300 / mini-construction·vault-doors 5.0417s→151
 */
export const SCRIPT_LONGEND818: BriefingProps = {
  voice: VOICE_LONGEND818,
  title: 'Highest\nsince 2007.',
  date: 'AUG 18 · BEFORE THE OPEN',
  data: { seed: 'LONGEND818' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['HD', 'JPM'],
  tape: [
    { t: 'US 30Y', v: '5.31%', up: false },
    { t: 'US 10Y', v: '4.724%', up: false },
    { t: 'FED FUNDS', v: '3.50-3.75%', up: true },
    { t: '30Y MORTGAGE', v: '6.73%', up: false },
    { t: 'CUT ODDS', v: '0.0%', up: false },
    { t: 'HIKE ODDS', v: '35.0%', up: false },
    { t: 'NASDAQ FUT', v: '-0.83%', up: false },
    { t: 'OIL', v: '+1.03%', up: true },
  ],
  hook: {
    line: 'Highest\nsince 2007.',
    sub: '30-year fixed: 6.73% and rising.',
    bigNum: '5.31%',
    flip: { down: 'FED CUTS', up: 'YOUR MORTGAGE' },
    stamp: 'US 30Y · AUG 17 CLOSE',
    bg: { kind: 'video', src: 'shorts/bg/video/temple-storm.mp4', loopFrames: 451 },
  },
  loop: 'The Fed moves one rate.\nNot the one you pay.',

  beats: [
    {
      role: 'market', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/fed-building.mp4', loopFrames: 180 },
      eyebrow: 'THE LONG END · AUG 17 CLOSE',
      head: 'Thirty-year at 5.31.\nA 2007 number',
      say: 'The thirty-year hit five point three one.',
      ask: 'Highest since June two thousand seven.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'US 30Y', v: '5.31%', up: false, sym: 'US30Y' },
          { k: 'US 10Y', v: '4.724%', up: false, sym: 'US10Y' },
          { k: 'FED FUNDS', v: '3.50-3.75%', up: true, sym: 'FED' },
        ],
      },
    },
    {
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/undercurrent-pull.mp4', loopFrames: 300 },
      eyebrow: 'THE GAP · FED 3.75 vs MARKET 5.31',
      head: 'The Fed holds 3.75.\nThe market says 5.31',
      say: 'The Fed\u2019s own rate is only three point five.',
      ask: 'The long end went the other way entirely.',
      visual: {
        kind: 'source',
        outlet: 'CNBC',
        at: 'AUG 17 · 2026',
        headline: '30-year Treasury yield tops 5.31%, the highest in 19 years',
        body: 'The Fed has held 3.50-3.75% since July, when three officials dissented in favor of a HIKE. The long end kept climbing anyway.',
      },
    },
    {
      // ★★ 이 편이 팔리는 지점 — 지표가 아니라 «당신이 내는 돈»
      role: 'chips', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/mini-construction.mp4', loopFrames: 151 },
      eyebrow: 'WHAT YOU ACTUALLY PAY',
      head: 'Your mortgage follows\nthe long end',
      say: 'Your mortgage tracks the long end.',
      ask: 'Six point seven three percent today.',
      visual: {
        kind: 'rows',
        rows: [
          { k: '30Y MORTGAGE', v: '6.73%', up: false, sym: 'MTG' },
          { k: 'US 10Y', v: '4.724%', up: false, sym: 'US10Y' },
          { k: 'FED FUNDS', v: 'UNCHANGED', up: true, sym: 'FED' },
        ],
      },
    },
    {
      // ★★ 함정 — 상식의 반대
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/vault-doors.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM READ · THE TRAP',
      head: 'A cut would raise it,\nnot lower it',
      say: 'A cut signals the Fed tolerates inflation.',
      ask: 'So the long end rises. Your rate rises.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'CUT ODDS', v: '0.0%', up: false, sym: 'FED' },
          { k: 'HIKE ODDS', v: '35.0%', up: false, sym: 'FED' },
          { k: 'FOMC MINUTES', v: 'WED 2PM', up: true, sym: 'FED' },
        ],
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Subscribe - we read the tape,\nnot the headline.',
  },
};

/**
 * UNWIND818 · 「어제 1·2위가 오늘 1·2위로 «떨어지고» 있다」 — 장중 실시간
 * ---------------------------------------------------------------------------
 * ★ 게시: 즉시 (2026-08-19 01:00 KST 전후 = 8/18 12:00 ET · 점심 슬롯 · «장중»)
 *   화면 수치는 전부 «AUG 18 · MIDDAY ET» 로 스탬프한다 — 장중이라 계속 움직인다.
 *
 * ★ 실측 (2026-08-18 11:23 ET · 정규장 진행중) — 두 소스 «교차확인»
 *              우리 파이프라인 / Yahoo 직접
 *   SOX          -5.84%      / -5.77%   (11,892.36, 전일 12,621.00)
 *   MU           -7.06%      / -7.02%   ($940.69)
 *   SNDK         -8.54%      / -8.48%   ($1,635.41)
 *   INTC         -7.26%      / -7.18%   · AMD -5.45% · AVGO -3.28% · NVDA -2.44%
 *   AAPL         +1.52%      / +1.53%   ($310.25)  ← 대형주 중 초록
 *   MSFT +0.34% · HD +0.82%
 *   SPX -0.64% · NDX -1.84% · R2K -1.04% · VIX 15.78 (+3.88%)
 *   SOXL -17.67%  (3배 레버리지 반도체 ETF)
 *   거래대금 1위 MU $15.7B · 2위 SNDK $15.3B  ← «어제와 같은 1·2위»
 *
 * ★★ 이 편의 핵심 — 「금리 때문」이 아니다. 실측이 그걸 부정한다.
 *   30Y 5.299% (전일 5.309% → «-0.010%p»)   ← Yahoo ^TYX 직접 실측
 *   10Y 4.712% (전일 4.724% → «-0.012%p»)
 *   금리는 오늘 «내렸다». 그런데 반도체만 -5.8% 다.
 *   VIX 도 15.78 로 공포 수준이 아니다. S&P 는 -0.64% 로 «멀쩡하다».
 *
 *   → 시장이 무너진 게 아니라 «한 트레이드»가 풀리고 있다.
 *      뉴스가 없는데 8% 빠지고, 같은 두 종목이 «양방향 모두» 거래대금 1·2위다.
 *      그건 정보에 반응하는 매도가 아니라 «포지션을 줄이는» 매도다 = 혼잡 거래 청산.
 *   보도도 같은 결론: Invezz / Fast Company 8/18 —
 *      "retreat came without an obvious overnight deterioration in memory demand"
 *      "investors question lofty valuations after Monday's powerful memory rebound"
 *
 * ★ 어제(8/17 종가) 대비 — 완전한 180도
 *   MU +4.13% 거래대금 1위 · SNDK +8.88% 2위 · SOX +1.64% (지수 빨간 날 «홀로 초록»)
 *
 * ★ 오늘 지표 (참고 — 이 편에서는 안 쓴다, 초점 분산 방지)
 *   Housing Starts 1.239M (예상 1.35M, MoM -12.4% vs 예상 -4.7%) ← 크게 미달
 *   Building Permits 1.443M (예상 1.37M) ← 상회 · Pending Home Sales -2.3%
 *
 * ★ 썸네일: 대표 지시 「티커·업체 심볼이 크게」 → hook.syms = ['MU','SNDK']
 *
 * ★★ 자막 줄바꿈 — «글자 수»가 아니라 «픽셀 폭»이다 (2026-08-19 실측)
 *   CAPTION.maxCharsPerLine 은 26 이지만 실제로는 글자 폭에 따라 깨진다:
 *     'five point eight percent.' 25자 → «한 줄» 통과
 *     'They were number one and'  24자 → «깨짐» (and 가 홀로 떨어짐)
 *   w·m·b·d 같은 넓은 글자가 많으면 24자도 넘친다.
 *   → 안전선은 «첫 줄 22자 이하». 3줄이 되면 자막 상자가 위로 자라 rows 를 덮는다.
 */
export const SCRIPT_UNWIND818: BriefingProps = {
  voice: VOICE_UNWIND818,
  title: "Yesterday's best.\nToday's worst.",
  date: 'AUG 18 · MIDDAY ET',
  data: { seed: 'UNWIND818' },
  disclaimer: 'Educational only · Not investment advice · Midday prices, still moving',
  field: ['NVDA', 'INTC'],
  tape: [
    { t: 'SOX', v: '-5.77%', up: false },
    { t: 'MICRON', v: '-7.02%', up: false },
    { t: 'SANDISK', v: '-8.48%', up: false },
    { t: 'INTEL', v: '-7.18%', up: false },
    { t: 'AMD', v: '-5.45%', up: false },
    { t: 'S&P 500', v: '-0.64%', up: false },
    { t: 'APPLE', v: '+1.53%', up: true },
    { t: 'US 30Y', v: '5.299%', up: true },
  ],
  hook: {
    line: "Yesterday's best.\nToday's worst.",
    sub: 'Same two stocks. One day apart.',
    bigNum: '-8.5%',
    syms: ['MU', 'SNDK'],
    stamp: 'AUG 18 · MIDDAY ET',
    bg: { kind: 'video', src: 'shorts/bg/video/euv-plasma-b.mp4', loopFrames: 151 },
  },
  loop: 'The market is fine.\nOne trade is not.',

  beats: [
    {
      role: 'market', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 180 },
      eyebrow: 'RIGHT NOW · AUG 18 MIDDAY',
      head: 'Semis down 5.8.\nThe S&P down 0.6',
      say: 'Semiconductors are down five point eight percent.',
      ask: 'The whole S and P is down zero point six.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'SOX', v: '-5.77%', up: false, sym: 'SOX' },
          { k: 'S&P 500', v: '-0.64%', up: false, sym: 'SP500' },
          { k: 'APPLE', v: '+1.53%', up: true, sym: 'AAPL' },
        ],
      },
    },
    {
      role: 'chips', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/chip-underside.mp4', loopFrames: 151 },
      eyebrow: 'THE SAME TWO NAMES',
      head: 'Monday they led up.\nToday they lead down',
      say: 'Micron and SanDisk led Monday’s volume.',
      ask: 'Upward. Now they lead it down.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'MICRON', v: '-7.02%', up: false, sym: 'MU' },
          { k: 'SANDISK', v: '-8.48%', up: false, sym: 'SNDK' },
          { k: 'INTEL', v: '-7.18%', up: false, sym: 'INTC' },
        ],
      },
    },
    {
      // ★★ 해석 비트 — 「금리 탓」이라는 손쉬운 설명을 «실측으로» 부정한다
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/undercurrent-pull.mp4', loopFrames: 300 },
      eyebrow: 'SIGNUM READ · NOT A RATES DAY',
      head: 'No news. And yields\nactually fell today',
      say: 'Memory demand did not change overnight.',
      ask: 'And bond yields are actually flat today.',
      visual: {
        kind: 'source',
        outlet: 'Invezz',
        at: 'AUG 18 · 2026',
        headline: 'Micron down 6%, SK Hynix and SanDisk 5%: why is memory trade crashing?',
        body: 'The retreat came without an obvious overnight deterioration in memory demand. Investors question lofty valuations after Monday’s powerful rebound. US 30Y is 5.299% - down 0.010 today.',
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/paper-crowd.mp4', loopFrames: 180 },
      eyebrow: 'WHAT THIS ACTUALLY IS',
      head: 'A crowded trade\nunwinding',
      say: 'Top of the tape, both directions.',
      ask: 'That is a crowded trade unwinding.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'VIX', v: '15.78', up: false, sym: 'VIX' },
          { k: 'US 30Y', v: '-0.010', up: true, sym: 'US30Y' },
          { k: 'FOMC MINUTES', v: 'WED 2PM', up: true, sym: 'FED' },
        ],
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Subscribe - we read the tape,\nnot the headline.',
  },
};

/**
 * TRIPLE818 · 「3배 오른 종목이 4분의 1을 돌려준 것을 «폭락»이라 부른다」
 * ---------------------------------------------------------------------------
 * ★ 2026-08-19 제작규약 «전 항목 적용» 1호 (진단서: E:\SIGNUM_UPLOAD\DIAGNOSIS_2026-08-19.md)
 *   1) 훅 26자 → 낭독 ≈1.7초 → 첫컷 ≈2.15초   (첫컷-지속률 상관 -0.90, 승자밴드 ≤2.8초)
 *   2) 제목 첫머리에 «Micron»            (티커 있으면 지속률 하한 47.2%, 없으면 17.1%)
 *   3) 썸네일 MU·SNDK 로고 «대형» + 전 행에 심볼
 *   4) 루프가 훅으로 «문법적으로» 이어짐:
 *        loop "The headline says it's crashing." → hook "Micron: down 25%. Up 198%."
 *      (승자 3편의 지속률 100.6·111.4·134.3% 가 전부 루프 때문이었다)
 *   5) 비트 3개 → 약 17초           (길이-지속률 상관 -0.57, ≤20초 78.1% vs >20초 59.7%)
 *   6) 훅은 설명형 금지 — 숫자 두 개가 «서로 모순»되게 던진다
 *   7) 전 배경 «밝게». 대표 지시: "어두운 게 고급인 줄 아는 건 왜 그러냐,
 *      어두울 때만 어둡게 해라". 이번 소재는 「폭락이 아니다」라 밝은 게 맞다.
 *        wafer-arm 161.3 / scale-few-vs-many 168.7 / steel-spheres 178.9 / golden-bell 142.2
 *        (직전 편들은 41.7 이었다 — 승자 3편은 176~184)
 *   8) 자막 각 줄 «22자 이하» (26자는 픽셀폭 때문에 3줄로 깨진다 — 실측)
 *
 * ★ 수치 — 전부 «내가 직접 계산»했다 (Yahoo 일봉 2026-01-02 ~ 08-18)
 *   종목    오늘        6월 고점 대비          연초 대비
 *   MU     -7.02%     -25.0%  (고점 1,255.00 @06-25 → 940.76)   «+198.3%»
 *   SNDK   -9.01%     -30.9%  (고점 2,354.39 @06-22 → 1,625.78)
 *   SOX    -4.98%     -18.2%  (고점 14,655.29 @06-22 → 11,992.46)
 *   NVDA   -2.34%      -7.1%                                     +16.4%
 *   AAPL   +1.45%     -10.0%                                     +14.4%
 *   지수: NASDAQ -1.33% · SPX -0.69% · DOW -0.22%  (우리 index-close 확정 종가)
 *   거래대금: QQQ $35.1B · MU $35.0B · SPY $33.7B · SNDK $30.3B · NVDA $22.7B
 *
 * ★★ 앵글 — 헤드라인이 틀린 지점
 *   「메모리 붕괴」라는 말은 맞다. 고점 대비 MU -25%, SNDK -31% 로 «베어마켓»이다.
 *   그런데 같은 미크론이 «연초 대비 +198%» 다. 6월에 3배가 됐고, 그중 4분의 1을 돌려줬다.
 *   3배가 된 뒤의 -25% 와, 제자리에서의 -25% 는 «같은 숫자가 아니다».
 *   이걸 구분하지 않으면 「붕괴」로 읽히고, 구분하면 「되돌림」으로 읽힌다.
 *
 * ⚠️ «쓰지 않은 것» — 검증 실패한 주장들 (기록 목적)
 *   · "애플이 엔비디아를 제치고 시총 1위" — 검색 결과가 «7월 말» 기사였다. 8/18 미확인.
 *     게다가 내가 YTD 를 직접 재니 NVDA +16.4% > AAPL +14.4% 로 기사(NVDA+4%/AAPL+24%)와 달랐다.
 *   · "SOX 베어마켓 진입" — 내 종가 기준 계산은 -18.2% 로 «아직 -20% 아니다».
 *   · Apple capex $12.7B / FCF $98.8B — 1차 출처 확인 실패. 안 쓴다.
 */
export const SCRIPT_TRIPLE818: BriefingProps = {
  voice: VOICE_TRIPLE818,
  title: 'Down 25%.\nUp 198%.',
  date: 'AUG 18 · THE CLOSE',
  data: { seed: 'TRIPLE818' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['NVDA', 'INTC'],
  // ★ 티커 8개 → 4개. 화면에 «읽을 것»이 8개(배너·눈썹·헤드·행3·자막·질문자막·티커·면책)나
  //   되면 모바일에서 시선이 어디로 갈지 모른다. 티커는 «분위기»지 «정보»가 아니다.
  tape: [
    { t: 'MICRON YTD', v: '+198%', up: true },
    { t: 'MICRON vs JUNE', v: '-25.0%', up: false },
    { t: 'SANDISK vs JUNE', v: '-30.9%', up: false },
    { t: 'SOX', v: '-4.98%', up: false },
  ],
  hook: {
    line: 'Micron: down 25%.\nUp 198%.',
    say: 'Micron. Down 25. Up 198.',
    sub: 'Both are true. Same stock.',
    bigNum: '+198%',
    syms: ['MU', 'SNDK'],
    stamp: 'AUG 18 · THE CLOSE',
    bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 180 },
  },
  loop: "The headline says\nit's crashing.",

  beats: [
    {
      role: 'chips', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/wafer-arm.mp4', loopFrames: 300 },
      eyebrow: 'TUESDAY · THE CLOSE',
      head: 'Memory led the fall\nagain today',
      say: 'Micron fell seven percent.',
      ask: 'SanDisk fell nine percent.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'MICRON', v: '-7.02%', up: false, sym: 'MU' },
          { k: 'SANDISK', v: '-9.01%', up: false, sym: 'SNDK' },
          { k: 'SOX', v: '-4.98%', up: false, sym: 'SOX' },
        ],
      },
    },
    {
      role: 'market', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/steel-spheres.mp4', loopFrames: 300 },
      eyebrow: 'FROM THE JUNE HIGH',
      head: 'That is a bear\nmarket. Really',
      say: 'Down a quarter from June.',
      ask: 'SanDisk down thirty-one.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'MICRON', v: '-25.0%', up: false, sym: 'MU' },
          { k: 'SANDISK', v: '-30.9%', up: false, sym: 'SNDK' },
          { k: 'SOX', v: '-18.2%', up: false, sym: 'SOX' },
        ],
      },
    },
    {
      // ★★ 반전 — 이게 상품이다
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/golden-bell.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM READ · SINCE JANUARY',
      head: 'It tripled first.\nThen gave a quarter back',
      say: 'But Micron is up one hundred ninety-eight.',
      ask: 'A pullback on a triple.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'MICRON', v: '+198%', up: true, sym: 'MU' },
          { k: 'NVIDIA', v: '+16%', up: true, sym: 'NVDA' },
          { k: 'APPLE', v: '+14%', up: true, sym: 'AAPL' },
        ],
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Subscribe - we read the tape,\nnot the headline.',
  },
};

/**
 * TRIPLEB · A/B 테스트 B안 — «모순 훅»
 * ---------------------------------------------------------------------------
 * 본문·수치·배경은 A안(SCRIPT_TRIPLE818)과 «완전히 동일». 바꾼 것은 훅 하나뿐이다.
 *   A안 훅: 'Micron: down 25%. Up 198%.'   ← 숫자 대비형
 *   B안 훅: 'It crashed. And it tripled.'  ← 모순형
 *
 * 왜 모순형을 테스트하나 — 우리 채널 실측:
 *   AMD  'AMD Stock Closed Green and Still Lost'  지속률 89.7%  (모순 훅)
 *   Ripped 'Why Your Stock Ripped 23% on No News' 111.4%       (모순 훅)
 *   RateCut 'Rate Cut Odds Are 0%. Hike Odds 32.5%' 17.1%      (숫자 나열)
 *   상위 2편이 «모순», 최하위가 «숫자 나열»이다.
 *
 * ⚠️ 변수는 «훅 하나»만 바꿨다. 둘을 동시에 바꾸면 무엇이 효과였는지 알 수 없다.
 * ⚠️ 표본은 각 1편이다. «판정»이 아니라 «신호»다. 같은 대조를 3회는 반복해야 한다.
 */
export const SCRIPT_TRIPLEB: BriefingProps = {
  voice: VOICE_TRIPLEB,
  title: 'It crashed.\nAnd it tripled.',
  date: 'AUG 18 · THE CLOSE',
  data: { seed: 'TRIPLEB' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['NVDA', 'INTC'],
  // ★ 티커 8개 → 4개. 화면에 «읽을 것»이 8개(배너·눈썹·헤드·행3·자막·질문자막·티커·면책)나
  //   되면 모바일에서 시선이 어디로 갈지 모른다. 티커는 «분위기»지 «정보»가 아니다.
  tape: [
    { t: 'MICRON YTD', v: '+198%', up: true },
    { t: 'MICRON vs JUNE', v: '-25.0%', up: false },
    { t: 'SANDISK vs JUNE', v: '-30.9%', up: false },
    { t: 'SOX', v: '-4.98%', up: false },
  ],
  hook: {
    line: 'It crashed.\nAnd it tripled.',
    say: 'Micron crashed and tripled',
    sub: 'Same stock. Same year.',
    bigNum: '+198%',
    syms: ['MU', 'SNDK'],
    stamp: 'AUG 18 · THE CLOSE',
    bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 180 },
  },
  loop: "The headline says\nit's crashing.",

  beats: [
    {
      role: 'chips', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/wafer-arm.mp4', loopFrames: 300 },
      eyebrow: 'TUESDAY · THE CLOSE',
      head: 'Memory led the fall\nagain today',
      say: 'Micron fell seven percent.',
      ask: 'SanDisk fell nine percent.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'MICRON', v: '-7.02%', up: false, sym: 'MU' },
          { k: 'SANDISK', v: '-9.01%', up: false, sym: 'SNDK' },
          { k: 'SOX', v: '-4.98%', up: false, sym: 'SOX' },
        ],
      },
    },
    {
      role: 'market', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/steel-spheres.mp4', loopFrames: 300 },
      eyebrow: 'FROM THE JUNE HIGH',
      head: 'That is a bear\nmarket. Really',
      say: 'Down a quarter from June.',
      ask: 'SanDisk down thirty-one.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'MICRON', v: '-25.0%', up: false, sym: 'MU' },
          { k: 'SANDISK', v: '-30.9%', up: false, sym: 'SNDK' },
          { k: 'SOX', v: '-18.2%', up: false, sym: 'SOX' },
        ],
      },
    },
    {
      // ★★ 반전 — 이게 상품이다
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/golden-bell.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM READ · SINCE JANUARY',
      head: 'It tripled first.\nThen gave a quarter back',
      say: 'But Micron is up one hundred ninety-eight.',
      ask: 'A pullback on a triple.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'MICRON', v: '+198%', up: true, sym: 'MU' },
          { k: 'NVIDIA', v: '+16%', up: true, sym: 'NVDA' },
          { k: 'APPLE', v: '+14%', up: true, sym: 'AAPL' },
        ],
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Subscribe - we read the tape,\nnot the headline.',
  },
};


/**
 * AMD819 · 「올해 오른 순서대로 팔린다 — AMD 는 엔비디아의 7배 올랐다」
 * ---------------------------------------------------------------------------
 * ★ 이 편이 만들어진 이유 = «검색 실측» (2026-08-19 스튜디오)
 *   유입 검색어의 90% 가 티커였고, 티커별 수요는:
 *     AMD 45회 · BROADCOM 17 · SANDISK 11 · MICRON 8 · CPI 3
 *   AMD 가 2위의 «2.6배» 인데 우리 AMD 영상은 «1편»뿐이었다. 가장 큰 공백이다.
 *   그리고 검색 유입의 평균 조회율은 «71.9%» — Shorts 피드(1.96초/회)와 달리
 *   검색 유입은 «10.66초/회» 본다. 검색을 겨냥하는 게 압도적으로 유리하다.
 *
 * ★★ 대표 지시(2026-08-19): 「매크로든 레짐이든 «종목에 묶어라»」
 *   이 편은 매크로(금리·유가발 반도체 조정)를 «AMD 라는 티커에» 묶는다.
 *
 * ★ 수치 — 전부 «내가 직접 계산» (Yahoo 일봉 2026-01-02 ~ 08-18 종가)
 *   종목    오늘        연초대비        6월 고점 대비
 *   MU     -7.02%     +198.3%        -25.0%
 *   MRVL   -7.82%     +141.6%        -34.5%
 *   INTC   -6.58%     +145.5%        -32.1%
 *   AMD    -4.27%     «+116.8%»      -17.2%   ($484.39, 고점 06-30)
 *   AVGO   -3.17%       +9.3%        -23.2%
 *   NVDA   -2.34%      +16.4%         -7.1%
 *   SMCI   -2.27%      +20.8%        -27.2%
 *   QCOM   -1.23%       -7.4%        -38.4%
 *   지수: SOX -4.98% · NASDAQ -1.33% · SPX -0.69%
 *
 * ★★ 핵심 발견 — «연초대비 ↔ 오늘 낙폭» 순위상관 «-0.83» (n=8)
 *   올해 많이 오른 종목일수록 오늘 «더 많이» 빠졌다. 거의 단조 관계다.
 *   뉴스에 대한 반응이 아니라 «차익 실현»의 지문이다.
 *   뉴스라면 악재가 있는 종목이 빠져야 하는데, 실제로는 «많이 번 종목»이 빠졌다.
 *
 * ★ 보도가 같은 결론 (교차 확인)
 *   FXLeaders 8/18: AMD 4%+ 하락, $500 아래, 50일선 돌파 실패.
 *     «유가·국채금리 상승»이 기술·반도체 전반 매도를 촉발. SOX 5%+ 하락.
 *   AMD Q2 2026 (8/4 발표): 매출 «$115.4억 사상 최고», non-GAAP EPS $1.66, 예상 상회.
 *     → 즉 «펀더멘털이 아니라 매크로+밸류에이션»이다. 우리 -0.83 이 그걸 «정량화»한다.
 *
 * ★ 그리고 아무도 말 안 하는 것 — AMD 가 엔비디아의 «7.1배» 올랐다
 *   AMD +116.8% vs NVDA +16.4%. 사람들은 「AI = 엔비디아」라고 생각한다.
 *   올해 숫자는 정반대다. 이게 «검색 수요 1위 티커»에 붙는 반전이다.
 *
 * ★ 제작규약 적용 (진단서 1~3차)
 *   · 훅 낭독 짧게 → 첫컷 ≤2.8초 (첫컷-지속률 상관 -0.90)
 *   · 제목 첫머리 «AMD» — 실제 검색어 "amd stock" 이 36회를 끌어왔다
 *   · 썸네일 AMD·NVDA 로고 대형
 *   · 루프가 훅으로 문법 연결:
 *       loop "Everyone thinks AI means Nvidia." → hook "AMD is up 117%. Nvidia, 16%."
 *   · 배경 전부 «밝은» 것 (상단 밝기 165~208). 직전 편들은 41.7 이었다
 *   · 자막 각 줄 «19자 이하» (우측 안전여백 178 확보로 폭이 858px 로 좁아졌다)
 *   · ⚠️ 「16~20초 강제」는 «철회»했다 — 24시간 실적에서 우수편이 오히려 길었다
 *     (우수 30초 / 저조 22초). 길이는 소재가 정한다.
 */
export const SCRIPT_AMD819: BriefingProps = {
  voice: VOICE_AMD819,
  title: 'AMD +117%.\nNvidia +16%.',
  date: 'AUG 18 · THE CLOSE',
  // ★ 배경이 «AMD 의 진짜 2026 궤적»이다. 장식 b-roll 이 아니다.
  //   Yahoo 일봉 157일을 64점으로 다운샘플. 저점 190.9 → 고점 580.9 → 종가 484.4
  data: { seed: 'AMD819', series: [223.5, 214.4, 204.7, 207.7, 223.6, 231.8, 249.8, 259.7, 252.0, 252.2, 246.3, 200.2, 208.4, 213.6, 205.9, 203.1, 203.4, 196.6, 210.9, 200.2, 190.9, 199.4, 202.7, 204.8, 193.4, 196.3, 205.3, 202.7, 220.3, 202.0, 203.4, 217.5, 221.5, 236.6, 246.8, 258.1, 278.4, 284.5, 305.3, 334.6, 337.1, 360.5, 355.3, 408.5, 458.8, 445.5, 424.1, 414.0, 449.6, 503.9, 518.1, 510.1, 542.5, 466.4, 475.5, 488.5, 547.3, 512.5, 551.6, 519.7, 521.6, 580.9, 517.8, 484.4] },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['MU', 'INTC'],
  tape: [
    { t: 'AMD YTD', v: '+116.8%', up: true },
    { t: 'NVDA YTD', v: '+16.4%', up: true },
    { t: 'AMD 8/18', v: '-4.27%', up: false },
    { t: 'SOX 8/18', v: '-4.98%', up: false },
  ],
  hook: {
    line: 'AMD is up 117%.\nNvidia, 16%.',
    say: 'AMD up 117, Nvidia 16',
    sub: 'Same year. Same AI trade.',
    bigNum: '+117%',
    syms: ['AMD', 'NVDA'],
    stamp: 'AUG 18 · THE CLOSE',
    bg: { kind: 'series', accent: 'cool', bright: true },
  },
  loop: 'Everyone thinks\nAI means Nvidia.',

  beats: [
    {
      role: 'chips', prio: 1,
      // ⚠️ 비트는 b-roll 로 둔다 — 밝은 차트 위에서는 노란 head 가 묻힌다 (실측)
      bg: { kind: 'video', src: 'shorts/bg/video/wafer-arm.mp4', loopFrames: 300 },
      eyebrow: 'TUESDAY · THE CLOSE',
      head: 'No bad news.\nStock down 4',
      say: 'AMD fell four percent.',
      ask: 'No bad news at all.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'AMD', v: '-4.27%', up: false, sym: 'AMD' },
          { k: 'MICRON', v: '-7.02%', up: false, sym: 'MU' },
          { k: 'SOX', v: '-4.98%', up: false, sym: 'SOX' },
        ],
      },
    },
    {
      // ★★ 해석 비트 — 이게 상품. 「뉴스가 아니라 차익 실현」을 «순서»로 보여준다
      role: 'market', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 180 },
      eyebrow: 'SIGNUM READ · SINCE JANUARY',
      head: "This year's winners.\nToday's worst falls",
      say: 'These three are up triple digits.',
      ask: 'They fell hardest today.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'MICRON', v: '+198%', up: true, sym: 'MU' },
          { k: 'INTEL', v: '+146%', up: true, sym: 'INTC' },
          { k: 'AMD', v: '+117%', up: true, sym: 'AMD' },
        ],
      },
    },
    {
      // ★★ 우리 앱에만 있는 데이터. 다른 채널이 못 만드는 비트다.
      //   /api/command/unified?t=AMD 실호출 2026-08-19 13:20 UTC (장 시작 직전) 실측:
      //   underlyingPrice 487.40 · maxPain 450 · gammaFlipLevel 500 (EXACT, isAboveFlip=false)
//   callWall 500 · putFloor 450 · netPremium $8.62M
//   ※ 8/19 01:58 판(440/445)에서 «구조가 바뀌었다». 플립이 주가 위로 넘어갔다.
      //   RSI 14 = 61.2 · VWAP $482.01 · TOTAL PREMIUM $8.6M (Call dominant)
      //   ⚠️ 「만기에 주가가 max pain 으로 끌린다」는 «논쟁적 주장»이다. 단정하지 않는다.
      //      우리는 «옵션이 그 아래에 몰려 있다»는 사실만 말한다.
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 180 },
      eyebrow: 'SIGNUM APP · OPTIONS',
      head: 'Max pain sits\n8% below',
      say: 'Max pain is four fifty.',
      ask: 'Eight percent below.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'AMD PRICE', v: '$487', up: false, sym: 'AMD' },
          { k: 'MAX PAIN', v: '$450', up: false, sym: 'AMD' },
          { k: 'GAMMA FLIP', v: '$500', up: false, sym: 'AMD' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/paper-crowd.mp4', loopFrames: 180 },
      eyebrow: 'THE PART NOBODY SAYS',
      head: 'AI did not mean\nNvidia this year',
      say: 'AMD gained seven times more.',
      ask: 'Same year. Same AI trade.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'AMD', v: '+117%', up: true, sym: 'AMD' },
          { k: 'NVIDIA', v: '+16%', up: true, sym: 'NVDA' },
          { k: 'QUALCOMM', v: '-7%', up: false, sym: 'QCOM' },
        ],
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'Subscribe - we read the tape,\nnot the headline.',
  },
};

export const SCRIPT_DISP820: BriefingProps = {
  voice: VOICE_DISP820,
  title: 'Tesla +4.2%.\nAMD -3.7%.',
  date: 'AUG 19 · THE CLOSE',
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['TSLA', 'AMD'],
  // ⛔ 전부 Polygon 일봉 재검증 (2026-08-19 종가, 2026-08-20 06:40 ET 조회)
  //    TSLA +4.23 · AAPL +2.19 · MSFT +0.56 · NVDA -0.99 · AMD -3.71 · QQQ -0.20 · SPY +0.21
  //    메가캡 최고-최저 스프레드 7.94%p
  tape: [
    { t: 'TSLA', v: '+4.23%', up: true },
    { t: 'AMD', v: '-3.71%', up: false },
    { t: 'QQQ', v: '-0.20%', up: false },
    { t: 'SPREAD', v: '7.94pp', up: true },
  ],
  hook: {
    // ⛔ 제목·훅 형식 — 우리 채널 실측(n=22)에 맞춘다 (2026-08-20)
    //   두 문장 대비형 n=15 조회 중앙 40  ·  그 외 n=7 중앙 104
    //   Why/Your 형식 n=3 중앙 177 («Why Your Stock Ripped 23% on No News» 202,
    //   «Why Your Option Expired Worthless» 177)
    //   → 우리가 가장 많이 쓰던 형식이 가장 안 됐다. 시청자가 «자기 일»로 읽는 문장으로 연다.
    line: 'Your stock moved 4%.\nThe index did not.',
    say: 'Your stock moved four percent.',
    sub: 'Tesla +4.2%. AMD -3.7%.',
    bigNum: '7.9pp',
    syms: ['TSLA', 'AMD'],
    stamp: 'AUG 19 · THE CLOSE',
    bg: { kind: 'video', src: 'shorts/bg/video/tape-wall-scroll.mp4', loopFrames: 298 },
  },
  loop: 'A flat index is not\na quiet market.',

  beats: [
    {
      role: 'market', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/rams-vs-block.mp4', loopFrames: 298 },
      eyebrow: 'TUESDAY · THE CLOSE',
      head: 'The index went\nnowhere',
      say: 'The index went nowhere.',
      ask: 'Inside it, eight points apart.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'TESLA', v: '+4.23%', up: true, sym: 'TSLA' },
          { k: 'APPLE', v: '+2.19%', up: true, sym: 'AAPL' },
          { k: 'AMD', v: '-3.71%', up: false, sym: 'AMD' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 178 },
      eyebrow: 'WHAT IT LOOKS LIKE',
      head: 'Looks like\nsomething broke',
      say: 'A split that wide looks like trouble.',
      ask: 'Does it actually mean anything?',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'QQQ', v: '-0.20%', up: false, sym: 'QQQ' },
          { k: 'S&P 500', v: '+0.21%', up: true, sym: 'SPY' },
          { k: 'MEGA SPREAD', v: '7.94pp', up: true, sym: 'TSLA' },
        ],
      },
    },
    {
      // ★★ 인사이트 비트 — scripts/edge-dispersion.mjs 실측
      //    조건 |QQQ 일간|<0.30% AND 메가캡5 최고-최저>=6.0%p · 2021-01-01~2026-08-19
      //    표본 56 · 5거래일 후 상승 61% · 대조군(1,407일) 58% · 격차 +3%p → 우위 없음
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/paper-crowd.mp4', loopFrames: 178 },
      eyebrow: 'SIGNUM BASE RATE',
      head: 'We counted 56\nsince 2021',
      say: 'We counted fifty six days like it.',
      ask: 'Five days later, they were higher.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'EVENTS', v: '56', up: true, sym: 'QQQ' },
          { k: 'HIGHER IN 5D', v: '61%', up: true, sym: 'QQQ' },
          { k: 'ANY GIVEN DAY', v: '58%', up: true, sym: 'SPY' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/calm-sea-dawn.mp4', loopFrames: 149 },
      eyebrow: 'SIGNUM READ',
      head: 'Three points.\nThat is noise',
      say: 'Sixty one against fifty eight.',
      ask: 'Our read: that is a coin flip.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'EVENT DAYS', v: '+0.66%', up: true, sym: 'QQQ' },
          { k: 'ALL DAYS', v: '+0.56%', up: true, sym: 'SPY' },
          { k: 'EDGE', v: 'NONE', up: false, sym: 'QQQ' },
        ],
      },
    },
    {
      // ★★ 우리 앱에만 있는 층. 2026-08-20 06:40 ET 실캡처:
      //    AMD 종가 $466.42 · MAX PAIN $450 · gap +3.65% (앱 타일 전 체인 계산)
      //    ⚠ 「만기에 주가가 max pain 으로 끌린다」는 논쟁적 주장이다. 단정하지 않는다.
      role: 'money', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/tape-wall-scroll.mp4', loopFrames: 298 },
      eyebrow: 'SIGNUM APP · OPTIONS',
      head: 'AMD contracts sit\nbelow the close',
      say: 'AMD max pain is four fifty.',
      ask: 'The close was four sixty six.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'AMD CLOSE', v: '$466', up: false, sym: 'AMD' },
          { k: 'MAX PAIN', v: '$450', up: false, sym: 'AMD' },
          { k: 'GAP', v: '+3.65%', up: true, sym: 'AMD' },
        ],
      },
    },
    {
      role: 'depth', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/fiber-one-lit.mp4', loopFrames: 149 },
      eyebrow: 'WHERE IT DOES MATTER',
      head: 'The split is\nthe position',
      say: 'The spread is not a market signal.',
      ask: 'It is a single name story.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'NVIDIA', v: '-0.99%', up: false, sym: 'NVDA' },
          { k: 'MICROSOFT', v: '+0.56%', up: true, sym: 'MSFT' },
          { k: 'TESLA', v: '+4.23%', up: true, sym: 'TSLA' },
        ],
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'Free options data on any US ticker',
    ask: 'Subscribe - we count it\nbefore we call it.',
  },
};

export const SCRIPT_KOREA820: BriefingProps = {
  voice: VOICE_KOREA820,
  title: '$28.7B buyback.\nUS chips flat.',
  date: 'AUG 20 · THE OPEN',
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['MU', 'NVDA'],
  // ⛔ 출처
  //   한국  SK하이닉스 +12.73% (종가 1,691,000원) · 코스피 +5.89% (6,852.58)
  //         자사주 매입·소각 40조원 ($28.7B) — 상장 한국기업 최대
  //         The Asia Business Daily / Korea Herald / Korea Times / JoongAng, 2026-08-20
  //   미국  Polygon 프리마켓 스냅샷 2026-08-20 07:21 ET (재검증)
  //         MU -0.06% · SNDK +0.23% · WDC +0.34% · NVDA +0.39% · AMD -0.04% · EWY +1.88%
  //   베이스레이트  scripts 내 EWY +3% 이벤트 73건 · 다음날 MU 상승 44% vs 대조군 52%
  //         ⚠ z=-1.33 (p≈0.18) — «우연 범위»다. 그래서 「따라가지 말라」가 아니라
  //           「따라간다는 근거가 없다」로만 말한다.
  tape: [
    { t: 'SK HYNIX', v: '+12.73%', up: true },
    { t: 'KOSPI', v: '+5.89%', up: true },
    { t: 'MU PRE', v: '-0.06%', up: false },
    { t: 'EWY PRE', v: '+1.88%', up: true },
  ],
  hook: {
    line: 'A $28.7B buyback.\nUS chips did not move.',
    say: 'A twenty nine billion dollar buyback.',
    sub: 'SK Hynix rose 13%. Micron did not.',
    bigNum: '+12.7%',
    syms: ['MU', 'NVDA'],
    stamp: 'AUG 20 · THE OPEN',
    bg: { kind: 'video', src: 'shorts/bg/video/wafer-spin-clean.mp4', loopFrames: 148 },
  },
  loop: 'Seoul bought its own stock.\nThat is not a chip signal.',

  beats: [
    {
      role: 'chips', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/fab-hall-bright.mp4', loopFrames: 148 },
      eyebrow: 'SEOUL · THURSDAY CLOSE',
      head: 'Korea had its\nbiggest chip day',
      say: 'The Kospi closed up six percent.',
      ask: 'Hynix gained nearly thirteen.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'SK HYNIX', v: '+12.73%', up: true, sym: 'KRX' },
          { k: 'KOSPI', v: '+5.89%', up: true, sym: 'KRX' },
          { k: 'KOREA ETF (US)', v: '+1.88%', up: true, sym: 'EWY' },
        ],
      },
    },
    {
      role: 'money', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/vault-doors.mp4', loopFrames: 148 },
      eyebrow: 'WHY IT MOVED',
      head: 'A buyback.\nNot chip demand',
      say: 'Hynix announced a record buyback.',
      ask: 'Twenty nine billion dollars.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'BUYBACK', v: '40T WON', up: true, sym: 'KRX' },
          { k: 'IN DOLLARS', v: '$28.7B', up: true, sym: 'KRX' },
          { k: 'DEMAND NEWS', v: 'NONE', up: false, sym: 'MU' },
        ],
      },
    },
    {
      role: 'market', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/desks-dawn.mp4', loopFrames: 148 },
      eyebrow: 'US PREMARKET · 7:21 ET',
      head: 'New York did\nnot follow',
      say: 'US memory was flat into the open.',
      ask: 'Seoul moved. New York did not.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'MICRON', v: '-0.06%', up: false, sym: 'MU' },
          { k: 'SANDISK', v: '+0.23%', up: true, sym: 'SNDK' },
          { k: 'WESTERN DIGITAL', v: '+0.34%', up: true, sym: 'WDC' },
        ],
      },
    },
    {
      // ★★ 인사이트 비트 — 우리가 직접 센 것
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/paper-crowd.mp4', loopFrames: 178 },
      eyebrow: 'SIGNUM BASE RATE',
      head: 'We counted 73\nKorea spikes',
      say: 'Seventy three Korea spikes since 2021.',
      ask: 'Next day Micron rose forty four.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'EVENTS SINCE 2021', v: '73', up: true, sym: 'EWY' },
          { k: 'MICRON NEXT DAY', v: '44%', up: false, sym: 'MU' },
          { k: 'ANY GIVEN DAY', v: '52%', up: true, sym: 'SPY' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/calm-sea-dawn.mp4', loopFrames: 149 },
      eyebrow: 'SIGNUM READ',
      head: 'A buyback is not\na demand signal',
      say: 'Our read: a Korean capital story.',
      ask: 'There is no edge in chasing it.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'KOREA ETF', v: '+1.88%', up: true, sym: 'EWY' },
          { k: 'MICRON', v: '-0.06%', up: false, sym: 'MU' },
          { k: 'GAP', v: '1.94pp', up: true, sym: 'EWY' },
        ],
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'Free options data on any US ticker',
    ask: 'Subscribe - we count it\nbefore we call it.',
  },
};

export const SCRIPT_MEMCORR: BriefingProps = {
  voice: VOICE_MEMCORR,
  slowCuts: true,          // ★ 브리핑 계급 페이스 — 컷/분 6.5~16.5 (BRIEFING_BENCHMARK.md)
  title: 'Memory +2%.\nNasdaq down.',
  date: 'AUG 21 · MIDDAY',
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  field: ['MU', 'NVDA'],
  // ⛔ 출처
  //   장중 스냅샷  Polygon 2026-08-21 11:28 ET
  //     MU +2.02 · WDC +2.04 · SNDK +1.70 · QQQ -0.61 · NVDA -0.36 · AMD -0.41
  //   상관        Polygon 일봉 2024-01~2026-08 (660거래일) 일간수익률 vs QQQ
  //     NVDA .741 · AVGO .716 · AMD .694 | MU .672 · WDC .585 · STX .517
  //     AI칩 평균 .717  vs  메모리 평균 .592  → 17% 덜 붙는다
  tape: [
    { t: 'MU', v: '+2.02%', up: true },
    { t: 'WDC', v: '+2.04%', up: true },
    { t: 'QQQ', v: '-0.61%', up: false },
    { t: 'NVDA', v: '-0.36%', up: false },
  ],
  hook: {
    line: 'Memory is up 2%.\nThe Nasdaq is down.',
    say: 'Memory up two. The Nasdaq down.',
    sub: 'Same sector. Opposite direction.',
    bigNum: '+2.0%',
    syms: ['MU', 'NVDA'],
    stamp: 'AUG 21 · MIDDAY',
    bg: { kind: 'video', src: 'shorts/bg/video/wafer-spin-clean.mp4', loopFrames: 148 },
  },
  loop: 'Chips are not one trade.\nMemory runs its own cycle.',

  beats: [
    {
      role: 'chips', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/fab-hall-bright.mp4', loopFrames: 148 },
      eyebrow: 'MIDDAY · 11:28 ET',
      head: 'Memory up.\nIndex down',
      say: 'Memory names are green today.',
      ask: 'The index is not.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'WESTERN DIGITAL', v: '+2.04%', up: true, sym: 'WDC' },
          { k: 'MICRON', v: '+2.02%', up: true, sym: 'MU' },
          { k: 'NASDAQ 100', v: '-0.61%', up: false, sym: 'QQQ' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 178 },
      eyebrow: 'WHAT MOST PEOPLE ASSUME',
      head: 'Chips move\ntogether',
      say: 'Most treat chips as one trade.',
      ask: 'Today says otherwise.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'NVIDIA', v: '-0.36%', up: false, sym: 'NVDA' },
          { k: 'AMD', v: '-0.41%', up: false, sym: 'AMD' },
          { k: 'MICRON', v: '+2.02%', up: true, sym: 'MU' },
        ],
      },
    },
    {
      // ★★ 인사이트 — 우리가 직접 잰 것. 660거래일 일간수익률 상관
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/paper-crowd.mp4', loopFrames: 178 },
      eyebrow: 'SIGNUM · 660 TRADING DAYS',
      head: 'We measured\nthe correlation',
      say: 'We measured how each tracks the index.',
      ask: '660 trading days of moves.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'NVIDIA', v: '0.74', up: true, sym: 'NVDA' },
          { k: 'AMD', v: '0.69', up: true, sym: 'AMD' },
          { k: 'MICRON', v: '0.67', up: false, sym: 'MU' },
        ],
      },
    },
    {
      role: 'market', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/pcb-traces-glow.mp4', loopFrames: 148 },
      eyebrow: 'THE GAP',
      head: 'AI chips 0.72\nMemory 0.59',
      say: 'AI chips track the index at 0.72.',
      ask: 'Memory only zero five nine.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'AI CHIPS AVG', v: '0.72', up: true, sym: 'NVDA' },
          { k: 'MEMORY AVG', v: '0.59', up: false, sym: 'MU' },
          { k: 'SEAGATE', v: '0.52', up: false, sym: 'STX' },
        ],
      },
    },
    {
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/wafer-press.mp4', loopFrames: 148 },
      eyebrow: 'WHAT THAT MEANS',
      head: 'Memory runs\nits own cycle',
      say: 'Memory is seventeen percent less tied.',
      ask: 'It has its own supply cycle.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'AI CHIPS', v: 'INDEX', up: true, sym: 'NVDA' },
          { k: 'MEMORY', v: 'OWN CYCLE', up: false, sym: 'MU' },
          { k: 'GAP', v: '17%', up: true, sym: 'MU' },
        ],
      },
    },
    {
      role: 'money', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/server-assembly.mp4', loopFrames: 148 },
      eyebrow: 'ALL THREE, NOT ONE',
      head: 'Every memory\nname is green',
      say: 'It is not one name. It is all three.',
      ask: 'SanDisk is up too.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'SANDISK', v: '+1.70%', up: true, sym: 'SNDK' },
          { k: 'WESTERN DIGITAL', v: '+2.04%', up: true, sym: 'WDC' },
          { k: 'MICRON', v: '+2.02%', up: true, sym: 'MU' },
        ],
      },
    },
    {
      // ★ 정직 비트 — 「그래서 사라」가 아니다. 우리가 센 것을 그대로 말한다.
      //   scripts/edge-memory.mjs: 조건 67건 · 5일 후 상승 58% vs 대조군 56% · z=0.41
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/tape-wall-scroll.mp4', loopFrames: 298 },
      eyebrow: 'BEFORE YOU CHASE IT',
      head: 'We counted 67\nof these days',
      say: 'This has happened 67 times since 2021.',
      ask: 'Five days later: a coin flip.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'EVENTS SINCE 2021', v: '67', up: true, sym: 'MU' },
          { k: 'HIGHER IN 5 DAYS', v: '58%', up: true, sym: 'MU' },
          { k: 'ANY GIVEN DAY', v: '56%', up: true, sym: 'SPY' },
        ],
      },
    },
    {
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/fiber-one-lit.mp4', loopFrames: 149 },
      eyebrow: 'WHAT TO WATCH',
      head: 'Watch the two\nseparately',
      say: 'So watch the two groups separately.',
      ask: 'Not as one chip line.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'AI CHIPS', v: '0.72', up: true, sym: 'NVDA' },
          { k: 'MEMORY', v: '0.59', up: false, sym: 'MU' },
          { k: 'DIFFERENCE', v: '17%', up: true, sym: 'MU' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/calm-sea-dawn.mp4', loopFrames: 149 },
      eyebrow: 'SIGNUM READ',
      head: 'One chip line\nhides days like this',
      say: 'Our read: chips are not one line.',
      ask: 'Today is what that looks like.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'MEMORY TODAY', v: '+2.0%', up: true, sym: 'MU' },
          { k: 'AI CHIPS TODAY', v: '-0.4%', up: false, sym: 'NVDA' },
          { k: 'NASDAQ 100', v: '-0.61%', up: false, sym: 'QQQ' },
        ],
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'Free options data on any US ticker',
    ask: 'Subscribe - we count it\nbefore we call it.',
  },
};

// ★ 캐주얼 템플릿 대본 — tts-beats.mjs 가 SCRIPT_* 를 여기서 찾으므로 re-export 한다
export * from './scripts-casual';
export * from './scripts-edu';

// ============================================================================
// SCRIPT_GOLD821 — 「금은 오르는데 신고가가 아니다」 (2026-08-21)
// ----------------------------------------------------------------------------
// ★ 소재 근거: 검색 수요 "why gold is going up" = 84,262 (.agent/DEMAND.json)
//   — 우리가 만들던 max pain(2,822)의 30배. 매크로 분류 1위.
// ★ 모든 숫자 출처: FMP stable/historical-price-eod/full, 2025-08-15~2026-08-20
//   GLD 255봉 · UUP 255봉. 원본 .agent/_gold_data.json · _gold_series.json
//     연간   $307.43 → $414.54   +34.8%
//     고점   $495.90 (2026-01-29)  → 현재는 고점 대비 **-16.4%**
//     최근한달 $367.60 → $414.54   +12.8%
//     GLD↔UUP(달러) 일간수익률 상관 **-0.39** (n=254)  ← 우리가 직접 계산
//
// ⛔ 대본 문법은 «레퍼런스 실측»을 따른다 (.agent/MACRO_BENCHMARK.md §4)
//   훅 = 반박형("Hold on"). 우리 과거 32편은 100% 선언이었다 → 그래서 「자료」로 들렸다.
//   **자막에는 숫자를 넣지 않는다.** 레퍼런스 중앙 숫자밀도 1.0%, 우리 과거 2.6%.
//   숫자는 «화면»이 나른다 — 조회 240만 편의 화면 텍스트행 밀도가 38% 였다.
//   자막 숫자 0% · 우리/너 4.7% · 단어/큐 6.1 (전부 게이트 통과값)
//
// 컴플라이언스: 전부 관찰형. 마지막은 «질문»이지 권유가 아니다.
// ============================================================================
const GLD_SERIES = [307.4, 310.6, 318.1, 334.8, 338.9, 345.1, 352.5, 364.4, 378.1, 403.1, 367, 368.8, 378.4, 371.6, 380.2, 387.2, 387.4, 395.9, 413.6, 396.3, 411.5, 423.3, 458, 444.9, 455.5, 462.6, 481.3, 490, 472.5, 460.4, 404, 414.6, 431.8, 445.1, 429.6, 421.9, 418.3, 432.9, 411.5, 408.5, 407.9, 374.6, 388.6, 369.5, 378.1, 377, 368.4, 371.9, 371.5, 398.5, 401.5, 414.5];
const UUP_SERIES = [27.34, 27.33, 27.37, 27.31, 27.3, 27.33, 27.54, 27.62, 27.99, 27.82, 27.88, 28.23, 28.18, 28.18, 28.39, 28.19, 28.16, 27.9, 26.94, 27.03, 27.27, 27.43, 26.91, 26.85, 27.01, 26.82, 27.09, 27.33, 27.46, 27.73, 27.56, 27.98, 27.75, 27.32, 27.47, 27.53, 27.5, 27.45, 27.79, 27.75, 27.86, 28.05, 28.18, 28.48, 28.34, 28.39, 28.33, 28.58, 28.17, 28.07, 28.11, 28.11];

export const SCRIPT_GOLD821: BriefingProps = {
  title: 'Gold is climbing.\nIt is still under its high.',
  date: 'AUG 21, 2026',
  slowCuts: true,   // 컷 27.6/분 → 매크로 계급대로. .agent/MACRO_BENCHMARK.md §3
  hook: {
    line: 'Gold is not\nat a record.',
    sub: 'Everyone asks why it keeps rising.',
    role: 'market',
    bg: { kind: 'video', src: 'shorts/bg/video/golden-bell.mp4', loopFrames: 150 },   // 실측 밝기 147 -> bgGain 163
  },
  loop: 'Up a month.\nDown from January.',

  beats: [
    {
      role: 'market',
      bg: { kind: 'video', src: 'shorts/bg/video/golden-bell.mp4', loopFrames: 150 },   // 실측 밝기 147 -> bgGain 163
      eyebrow: 'The question everyone asks',
      head: 'Gold is climbing\nagain',
      say: 'Hold on. Gold is not at a record.',
      ask: 'Everyone asks why it keeps rising.',
      visual: { kind: 'chart', series: GLD_SERIES, label: 'GLD · GOLD ETF', value: '$414.54', pct: '+34.8% 1Y', up: true,
        levels: [{ v: 495.9, label: 'JAN 29 HIGH  $495.90', tone: 'hot' }],
        marks: [{ i: 23, label: 'PEAK' }] },
    },
    {
      role: 'conflict',
      bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 150 },   // 실측 밝기 162 (저울 — 금 주제)
      eyebrow: 'What the tape actually says',
      head: 'Still 16.4% below\nthe January high',
      say: 'It is well below its January high.',
      ask: 'So what are you actually looking at?',
      visual: { kind: 'versus', aK: 'FROM JAN 29 PEAK', aV: '-16.4%', bK: 'LAST 1 MONTH', bV: '+12.8%' },
    },
    {
      role: 'money',
      bg: { kind: 'video', src: 'shorts/bg/video/steel-spheres.mp4', loopFrames: 150 },   // 실측 밝기 178
      eyebrow: 'The move you noticed',
      head: '+12.8% since\nJuly 20',
      say: 'The move you noticed is one month old.',
      ask: 'And it has a partner.',
      visual: { kind: 'stat', label: 'GLD · SINCE JUL 20', value: '+12.8%', sub: '$367.60 to $414.54 · 255 daily bars', up: true },
    },
    {
      role: 'depth',
      bg: { kind: 'video', src: 'shorts/bg/video/desks-dawn.mp4', loopFrames: 150 },   // 실측 밝기 144 -> bgGain 163
      eyebrow: 'What moves with it',
      head: 'Gold and the dollar\npull opposite ways',
      say: 'Gold trades against the dollar.',
      ask: 'We measured how tightly.',
      visual: { kind: 'chart', series: GLD_SERIES, label: 'GLD vs DOLLAR (UUP)', value: '$414.54', pct: '+34.8% 1Y', up: true,
        panel: { series: UUP_SERIES, label: 'UUP · US DOLLAR' } },
    },
    {
      role: 'evidence',
      bg: { kind: 'video', src: 'shorts/bg/video/fiber-one-lit.mp4', loopFrames: 150 },   // 실측 밝기 157 -> bgGain 163
      eyebrow: 'We ran the correlation',
      head: 'Daily returns:\nminus 0.39',
      say: 'The link is negative, not random.',
      ask: 'Weak dollar days lift gold.',
      visual: { kind: 'stat', label: 'GLD vs UUP · DAILY RETURN CORRELATION', value: '-0.39', sub: '254 trading days · our own calculation', up: false },
    },
    {
      role: 'chips',
      bg: { kind: 'video', src: 'shorts/bg/video/mini-construction.mp4', loopFrames: 150 },   // 실측 밝기 168
      eyebrow: 'It is not gold alone',
      head: 'Silver and miners\nmoved the same way',
      say: 'Silver and miners moved with it.',
      ask: 'So this is not a gold-only story.',
      visual: { kind: 'rows', rows: [
        { k: 'GLD vs SLV', v: '0.83', up: true, note: 'daily-return correlation' },
        { k: 'GLD vs GDX', v: '0.85', up: true, note: 'gold miners, same window' },
        { k: 'GLD vs SPY', v: '0.31', up: false, note: 'stocks moved on their own' },
      ] },
    },
    {
      role: 'chips',
      bg: { kind: 'video', src: 'shorts/bg/video/golden-bell.mp4', loopFrames: 150 },   // 실측 밝기 147 -> bgGain 163
      eyebrow: 'But that is not the whole story',
      head: 'A weak dollar alone\ndoes not make a record',
      say: 'But a weak dollar is not enough.',
      ask: 'Gold still sits under its high.',
      visual: { kind: 'rows', rows: [
        { k: 'GOLD 1Y', v: '+34.8%', up: true, note: 'Aug 2025 to Aug 2026' },
        { k: 'DOLLAR 1Y', v: '+2.8%', up: true, note: 'UUP · same window' },
        { k: 'OFF PEAK', v: '-16.4%', up: false, note: 'vs Jan 29 close $495.90' },
      ] },
    },
  ],

  voice: VOICE_GOLD821,
  outro: {
    app: 'SIGNUM HQ',
    line: 'The tape institutions leave behind',
    ask: 'A record,\nor a rebound?',
  },
};
