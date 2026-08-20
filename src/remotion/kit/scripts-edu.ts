// ============================================================================
// kit/scripts-edu — 「교육형 재고」. 날짜가 없어 언제든 꺼내 쓴다.
// ----------------------------------------------------------------------------
// 대표 지시(2026-08-14): "교육형 재고를 만들어 두면 소재 걱정이 사라진다. 그것부터."
//
// 【왜 이게 필요한가】
//  · 뉴스형은 48시간이면 유입이 끊긴다. 교육형은 «검색»으로 계속 들어온다.
//  · 실측(2026-08-14): 우리 검색 유입은 `amd stock` 하나뿐이었다 — 즉 검색 설계를
//    한 적이 없다. 교육형은 제목 자체가 사람이 치는 질문이라 검색이 붙는다.
//  · 그리고 하루 4번째 슬롯을 «소재 고갈 없이» 채운다.
//
// 【5개 규칙 준수 (2026-08-14 Studio 실측에서 확정)】
//  ① 제목 첫머리에 «검색되는 말» — 교육형에선 개념 이름 자체가 그것이다
//  ② 훅에 추상 지표 금지 — 개념을 «뜻»으로 연다 (rotation·squeeze 같은 우리 용어 금지)
//  ③ 아웃트로에 「구독」 명시
//  ④ 태그 1순위 `what is <개념>` 형태
//  ⑤ 제작자가 자기 영상을 보지 않는다
//
// 【구조 — 6편 공통】
//   훅(개념+숫자) → ① 그게 뭔가 → ② 우리 실데이터 예시 → ③ SIGNUM READ(오해 바로잡기)
//   ③이 핵심이다. 대부분의 채널이 여기서 틀린 말을 하고, 우리는 «아니라고» 말한다.
//
// 【숫자 출처 — 전부 실측 (2026-08-12~14 우리 캡처 + Polygon 재측정)】
//   다크풀 5일: 42.7 → 54.1 → 55.3 → 53.7 → 57.2 (%)
//   스퀴즈 3일: High 65 → Extreme 70 → Extreme 75 (%)
//   감마 플립 : NVDA $207.50 (주가 +8.0% 위) · AMD $485.00 (주가 0.4% 아래)
//   VWAP     : AMD 8/12 평균체결 $485.90, 종가 $482.93 (아래 -0.61%)
//   옵션 프리미엄: NVDA $91.9M vs AMD $20.7M (8/12 하루)
//   P/C      : MU 8/12 — 프리미엄은 58% 콜, 건수 P/C 1.38
// ============================================================================

import type { CasualProps } from './Casual';
import { VOICE_EDUDARK } from './voice-edudark';
import { VOICE_EDUSQZ } from './voice-edusqz';
import { VOICE_EDUGAMMA } from './voice-edugamma';
import { VOICE_EDUPCR } from './voice-edupcr';
import { VOICE_EDUVWAP } from './voice-eduvwap';
import { VOICE_EDUFLOW } from './voice-eduflow';

const BASE = {
  track: 'edu' as const,
  hookTight: true,
  date: 'MARKET BASICS',
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  outro: {
    app: 'SIGNUM HQ',
    line: 'Options flow and dark pool, every morning',
    ask: 'Subscribe — one market\nterm a day.',        // ← 규칙 ③
  },
};

// ── ① 다크풀 ─────────────────────────────────────────────────────────────────
export const SCRIPT_EDUDARK: CasualProps = {
  ...BASE,
  voice: VOICE_EDUDARK,
  title: 'Dark Pool: where half\nthe volume hides.',
  data: { seed: 'EDUDARK' },
  hook: {
    line: 'Dark Pool: where half\nthe volume hides.',
    sub: '',
    bigNum: '57%',
    stamp: 'MARKET BASICS',
    bg: { kind: 'video', src: 'shorts/bg/video/mirror-city.mp4', loopFrames: 151 },
  },
  loop: 'The public tape is not\nthe whole tape.',
  beats: [
    {
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/undercurrent-pull.mp4', loopFrames: 300 },
      eyebrow: 'What it is',
      head: 'Trades that never\nprint in public.',
      say: 'Big funds trade away from the public exchange. *So you never see the order.*',
      ask: 'It only shows up after the fact.',
      cv: {
        kind: 'steps',
        items: [
          { n: '1', t: 'A fund wants to move size' },
          { n: '2', t: 'A public order would move price' },
          { n: '3', t: 'So they match it off-exchange' },
        ],
      },
    },
    {
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/glass-tube-array.mp4', loopFrames: 151 },
      eyebrow: 'How big is it really',
      head: 'More than half\nof all volume.',
      say: 'Over five sessions we measured it climb. *From forty three to fifty seven.*',
      ask: 'That is most of the market, unseen.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'AUG 11', v: '42.7%', up: false, sym: 'RISK' },
          { k: 'AUG 13', v: '55.3%', up: true, sym: 'RISK' },
          { k: 'AUG 14', v: '57.2%', up: true, sym: 'RISK' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/vault-doors.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM READ',
      head: 'High is not bearish.\nIt is just hidden.',
      say: 'Here is what people get wrong. *A high reading is not bullish or bearish.*',
      cv: {
        kind: 'punch', value: '57.2%', label: 'DARK POOL SHARE · AUG 14',
        sub: 'It tells you who is trading, not which way',
      },
    },
  ],
};

// ── ② 숏 스퀴즈 ──────────────────────────────────────────────────────────────
export const SCRIPT_EDUSQZ: CasualProps = {
  ...BASE,
  voice: VOICE_EDUSQZ,
  title: 'Short Squeeze: why a\nstock rips for no news.',
  data: { seed: 'EDUSQZ' },
  hook: {
    line: 'Short Squeeze: why a\nstock rips for no news.',
    sub: '',
    bigNum: '23%',
    stamp: 'MARKET BASICS',
    bg: { kind: 'video', src: 'shorts/bg/video/rams-vs-block.mp4', loopFrames: 300 },
  },
  loop: 'No news needed.\nJust people buying back.',
  beats: [
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/wafer-press.mp4', loopFrames: 180 },
      eyebrow: 'What it is',
      head: 'Sellers forced\nto become buyers.',
      say: 'People who bet against a stock must buy it back to get out. *That buying lifts it more.*',
      ask: 'Which forces the next one out.',
      cv: {
        kind: 'steps',
        items: [
          { n: '1', t: 'Traders borrow and sell a stock' },
          { n: '2', t: 'Price rises, their losses grow' },
          { n: '3', t: 'They buy back — price rises again' },
        ],
      },
    },
    {
      role: 'chips', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/chip-underside.mp4', loopFrames: 151 },
      eyebrow: 'What it looks like',
      head: 'One name runs.\nIts peers do not.',
      say: 'SanDisk ran twenty three percent in three days. *Nvidia added three.*',
      ask: 'Same sector. That gap is the tell.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'SNDK', v: '+23.4%', up: true, sym: 'SNDK' },
          { k: 'NVDA', v: '+3.6%', up: true, sym: 'NVDA' },
          { k: 'AVGO', v: '-1.1%', up: false, sym: 'AVGO' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/crack-star.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM READ',
      head: 'A squeeze ends\nwhen sellers run out.',
      say: 'So it is not demand. *It is people closing a losing bet.*',
      cv: {
        kind: 'punch', value: '75%', label: 'OUR SQUEEZE GAUGE · AUG 14',
        sub: 'Third straight day higher — extreme',
      },
    },
  ],
};

// ── ③ 감마 플립 ──────────────────────────────────────────────────────────────
export const SCRIPT_EDUGAMMA: CasualProps = {
  ...BASE,
  voice: VOICE_EDUGAMMA,
  title: 'Gamma Flip: the line\nthat feeds every move.',
  data: { seed: 'EDUGAMMA' },
  hook: {
    line: 'Gamma Flip: the line\nthat feeds every move.',
    sub: '',
    bigNum: '$207',
    stamp: 'MARKET BASICS',
    bg: { kind: 'video', src: 'shorts/bg/video/fiber-one-lit.mp4', loopFrames: 151 },
  },
  loop: 'Above the line, moves grow.\nBelow it, they fade.',
  beats: [
    {
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/pcb-one-chip-lit.mp4', loopFrames: 151 },
      eyebrow: 'What it is',
      head: 'One price flips\nthe dealers around.',
      say: 'Option dealers hedge every day. *Below one price they soften moves.*',
      ask: 'Above it, they feed them instead.',
      cv: {
        kind: 'steps',
        items: [
          { n: '↓', t: 'Below the line: moves get damped' },
          { n: '=', t: 'At the line: dealers flip sides' },
          { n: '↑', t: 'Above the line: moves get fed' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/paper-crowd.mp4', loopFrames: 180 },
      eyebrow: 'Two names, one day',
      head: 'Same line.\nOpposite sides.',
      say: 'On August twelfth Nvidia sat well above its line. *AMD sat just under its own.*',
      ask: 'So their moves behaved differently.',
      cv: {
        kind: 'duel',
        a: { sym: 'NVDA', name: 'MOVES GET FED', value: '+8.0%', note: 'above $207.50' },
        b: { sym: 'AMD', name: 'MOVES GET DAMPED', value: '-0.4%', note: 'under $485.00' },
        mark: 'a',
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/columns-goldenhour.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM READ',
      head: 'It is not a target.\nIt is a switch.',
      say: 'It does not say where price goes. *It says how hard the move will land.*',
      cv: {
        kind: 'punch', value: '$207.50', label: 'NVDA GAMMA FLIP · AUG 12',
        sub: 'Price sat 8% above it that day',
      },
    },
  ],
};

// ── ④ 풋콜 비율 ──────────────────────────────────────────────────────────────
export const SCRIPT_EDUPCR: CasualProps = {
  ...BASE,
  voice: VOICE_EDUPCR,
  title: 'Put Call Ratio: the\nnumber that lies twice.',
  data: { seed: 'EDUPCR' },
  hook: {
    line: 'Put Call Ratio: the\nnumber that lies twice.',
    sub: '',
    bigNum: '1.38',
    stamp: 'MARKET BASICS',
    bg: { kind: 'video', src: 'shorts/bg/video/paper-crowd.mp4', loopFrames: 180 },
  },
  loop: 'Count says one thing.\nMoney says another.',
  beats: [
    {
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/glass-tube-array.mp4', loopFrames: 151 },
      eyebrow: 'What it is',
      head: 'Bets down, divided\nby bets up.',
      say: 'Put contracts divided by call contracts. *Above one means more downside bets.*',
      ask: 'That is the version everyone quotes.',
      cv: {
        kind: 'steps',
        items: [
          { n: '1', t: 'Count the put contracts' },
          { n: '2', t: 'Divide by the call contracts' },
          { n: '3', t: 'Above 1.0 reads bearish' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 180 },
      eyebrow: 'Why it lies',
      head: 'Contracts are not\ndollars.',
      say: 'On Micron the count read bearish. *But most of the money was in calls.*',
      ask: 'A few big calls beat many small puts.',
      cv: {
        kind: 'duel',
        a: { sym: 'MU', name: 'BY CONTRACT COUNT', value: '1.38', note: 'reads bearish' },
        b: { sym: 'MU', name: 'BY DOLLARS SPENT', value: '58%', note: 'was calls' },
        mark: 'b',
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/gold-bars.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM READ',
      head: 'Always ask which\none you are seeing.',
      say: 'So read both. *The count tells you how many. The premium tells you how much.*',
      cv: {
        kind: 'punch', value: '1.38', label: 'MU PUT CALL · BY COUNT',
        sub: 'Same day, 58% of dollars went to calls',
      },
    },
  ],
};

// ── ⑤ VWAP ──────────────────────────────────────────────────────────────────
export const SCRIPT_EDUVWAP: CasualProps = {
  ...BASE,
  voice: VOICE_EDUVWAP,
  title: 'VWAP: the price the\naverage buyer paid.',
  data: { seed: 'EDUVWAP' },
  hook: {
    line: 'VWAP: the price the\naverage buyer paid.',
    sub: '',
    bigNum: 'VWAP',
    stamp: 'MARKET BASICS',
    bg: { kind: 'video', src: 'shorts/bg/video/desks-dawn.mp4', loopFrames: 151 },
  },
  loop: 'Green close, red buyers.\nIt happens more than you think.',
  beats: [
    {
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/fab-hall-bright.mp4', loopFrames: 151 },
      eyebrow: 'What it is',
      head: 'One number for\nthe whole day.',
      say: 'Take every trade of the day, weighted by size. *That average is the VWAP.*',
      ask: 'It is what the crowd actually paid.',
      cv: {
        kind: 'steps',
        items: [
          { n: '1', t: 'Every trade, at every price' },
          { n: '2', t: 'Weighted by how big it was' },
          { n: '3', t: 'The result is one day average' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/chip-macro-grey.mp4', loopFrames: 120 },
      eyebrow: 'Why it matters',
      head: 'A green day where\nbuyers still lost.',
      say: 'AMD closed up on August twelfth. *But it closed below its own day average.*',
      ask: 'So the average buyer was underwater.',
      cv: {
        kind: 'duel',
        a: { sym: 'AMD', name: 'CLOSED UP', value: '+1.82%', note: '$482.93' },
        b: { sym: 'AMD', name: 'BELOW DAY AVERAGE', value: '-0.61%', note: 'VWAP $485.90' },
        mark: 'b',
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/columns-birds.mp4', loopFrames: 180 },
      eyebrow: 'SIGNUM READ',
      head: 'The sign lies.\nThe average does not.',
      say: 'So stop at the plus sign and you miss it. *Check where it closed versus VWAP.*',
      cv: {
        kind: 'punch', value: '-0.61%', label: 'AMD VS ITS DAY AVERAGE', up: false,
        sub: 'On a day the stock closed green',
      },
    },
  ],
};

// ── ⑥ 옵션 플로우 ────────────────────────────────────────────────────────────
export const SCRIPT_EDUFLOW: CasualProps = {
  ...BASE,
  voice: VOICE_EDUFLOW,
  title: 'Options Flow: follow\nthe money, not the count.',
  data: { seed: 'EDUFLOW' },
  hook: {
    line: 'Options Flow: follow\nthe money, not the count.',
    sub: '',
    bigNum: '$91M',
    stamp: 'MARKET BASICS',
    bg: { kind: 'video', src: 'shorts/bg/video/quantum-fridge.mp4', loopFrames: 151 },
  },
  loop: 'Attention shows up in\ndollars before it shows in price.',
  beats: [
    {
      role: 'money', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/datacenter-aisle.mp4', loopFrames: 180 },
      eyebrow: 'What it is',
      head: 'Total dollars spent\non options today.',
      say: 'Not how many contracts. *How much money actually changed hands.*',
      ask: 'That is what premium measures.',
      cv: {
        kind: 'steps',
        items: [
          { n: '1', t: 'Every option trade has a price' },
          { n: '2', t: 'Add up what was paid, not counted' },
          { n: '3', t: 'That total is the premium' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 180 },
      eyebrow: 'What it shows',
      head: 'Where attention is,\nbefore price moves.',
      say: 'On one session traders spent ninety one million on Nvidia options. *Twenty on AMD.*',
      ask: 'Four and a half times the money.',
      cv: {
        kind: 'duel',
        a: { sym: 'NVDA', name: 'SPENT ON OPTIONS', value: '$91.9M', note: 'one session' },
        b: { sym: 'AMD', name: 'SPENT ON OPTIONS', value: '$20.7M', note: 'one session' },
        mark: 'a',
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/gold-bars.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM READ',
      head: 'Big premium is not\na direction.',
      say: 'It does not say up or down. *It says this is where the crowd is looking.*',
      cv: {
        kind: 'punch', value: '4.4x', label: 'NVDA VS AMD PREMIUM · AUG 12',
        sub: 'Attention, not direction',
      },
    },
  ],
};
