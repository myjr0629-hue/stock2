// ============================================================================
// scripts-nvstreak — 미국 채널 · 엔비디아 7일 연속 하락 편 (2026-08-24 종가 확정)
// ----------------------------------------------------------------------------
// ★ 소재 경로 — topic-scan 스킬의 4칸
//   관심   실적 8/26 · Massive 뉴스 8건 · 레퍼런스 채널들이 이미 트는 중
//   가격   7일 연속 하락 «직접 확인» (2026-08-14 ~ 08-24), 마지막 날 -2.91%
//   원인   실적 앞 관망 + 메모리 동반 약세 (중국 메모리사 상하이 IPO 신청 보도)
//   희소성 롤링 7일창 2,920개 중 5개 = 0.171% → 백분위 99.83
//
// ── 우리가 잰 것 (FMP 종가로 «직접» 계산, 2026-08-24 정규장 마감 후) ─────────
//   ⛔ 장중에 재면 안 된다. 이 편은 「7일 연속」이 전부라 종가가 확정돼야 성립한다.
//     실제로 확인: marketstatus = extended-hours / afterHours=true 인 뒤에 다시 쟀다.
//
//   NVDA 종가  08-14 225.16 → 08-17 225.01 → 08-18 219.74 → 08-19 217.56
//              → 08-20 216.85 → 08-21 214.72 → 08-24 208.48
//   7일 누적 -7.47% · 같은 7일창 중앙 +1.69% · 백분위 10.0 (하위 10%)
//
//   희소성: 2015-01 이후 롤링 7일창 2,920개 중 «7일 연속 하락» 은 5개 (0.171%)
//   7일 이상 연속은 11.6년간 «네 번» — 2015-08-25 / 2019-06-03(8일) / 2022-09-06 / 오늘
//
//   같은 날 메모리: MU -5.83% · 메가캡3(AAPL·MSFT·GOOGL) 평균 +0.70%
//
// ── 내 해석 (사실과 «구분해서» 말한다) ──────────────────────────────────────
//   이 하락은 실적에 «대한 반응이 아니다». 실적은 아직 나오지 않았다.
//   ⛔ 그래서 「실적 때문에 빠졌다」로 쓰지 않는다. 순서상 불가능하다는 것만 말한다.
//   ⛔ 「그러니 반등한다」도 쓰지 않는다 — 표본 4회로는 다음을 말할 수 없다.
//
// ⛔ 예측 금지 · 인과 금지 · 매수매도 권유 금지
// ★ 영어 규격: 자막 38자 · 훅은 질문 또는 반박 · 숫자는 «말로» 쓴다
// ============================================================================
import type { BriefingProps } from './Briefing';
import { VOICE_NVSTREAK } from './voice-nvstreak';

const V = (src: string) =>
  ({ kind: 'video', src: `shorts/bg/video/${src}`, loopFrames: 150 }) as const;

export const SCRIPT_NVSTREAK: BriefingProps = {
  title: 'Nvidia fell seven days straight.\nThat is five times out of 2,920.',
  date: 'AUG 24 · NVDA',
  slowCuts: true,
  // ⛔ noOutro 를 켜지 않는다 — 앱 광고는 기본이다 (2026-08-25 규칙)
  disclaimer: 'Informational only. Not investment advice. Causation not measured.',
  field: ['NVDA', 'MU', 'SMH', 'SPY'],

  hook: {
    // ⛔ 훅에서 답을 감춘다 — 「얼마나 드문지」를 말하지 않는다
    line: 'Nvidia fell\nseven days straight.\nIs that rare?',
    sub: 'We counted every seven-day window since 2015.',
    say: 'Nvidia fell seven days. Is that rare?',
    role: 'conflict',
    syms: ['NVDA'],
    bigNum: '5',
    bg: V('ani-chip-stairs-down.mp4'),
  },
  loop: 'The report has not happened.\nThe selling already did.',

  beats: [
    {
      role: 'conflict', prio: 1, bg: V('desks-dawn.mp4'),
      eyebrow: 'Everyone is watching',
      head: 'Everyone is waiting\nfor Wednesday.',
      say: 'Everyone is waiting for Wednesday.',
      ask: 'Nvidia reports in two days.',
      visual: {
        kind: 'stat', label: 'What the calendar says', value: 'Earnings, August 26',
        sub: 'the date every desk has circled', up: true,
      },
    },
    {
      role: 'evidence', prio: 1, bg: V('ani-bear-escalator.mp4'),
      eyebrow: 'But look behind it',
      head: 'It already fell\nseven days.',
      say: 'But it already fell seven days.',
      ask: 'Before the report. Not after.',
      visual: {
        kind: 'rows', rows: [
          { k: 'Last close before the run', v: '225.16', up: true, note: 'August 14' },
          { k: 'Latest close', v: '208.48', up: false, note: 'August 24' },
          { k: 'Consecutive lower closes', v: 'Seven', up: false, note: 'no green day in between' },
        ],
      },
    },
    {
      role: 'evidence', prio: 1, bg: V('tape-wall-scroll.mp4'),
      eyebrow: 'So we counted',
      head: 'Every seven-day\nwindow since 2015.',
      say: 'So we counted every seven days.',
      ask: 'Closing prices only. No estimates.',
      visual: {
        kind: 'stat', label: 'Windows measured', value: '2,920',
        sub: 'every rolling seven-session stretch since January 2015', up: true,
      },
    },
    {
      // ★ 반전 = 훅의 답. role:'verdict' 라 컷에서 안 버려진다.
      role: 'verdict', prio: 1, bg: V('scale-few-vs-many.mp4'),
      eyebrow: 'The answer',
      head: 'Five times\nout of 2,920.',
      say: 'Five times out of two thousand.',
      ask: 'You are looking at one in six hundred.',
      visual: {
        kind: 'rows', rows: [
          { k: 'All seven-day windows', v: '2,920', up: true, note: 'since January 2015' },
          { k: 'All seven closed lower', v: '5', up: false, note: '0.171 percent of them' },
          { k: 'Where that sits', v: '99.8th pct', up: false, note: 'rarer than ninety-nine in a hundred' },
        ],
      },
    },
    {
      role: 'money', prio: 1, bg: V('ani-chip-carry.mp4'),
      eyebrow: 'And the size',
      head: 'The streak took\nseven percent.',
      say: 'The streak took seven percent.',
      ask: 'Bottom tenth of every week.',
      visual: {
        kind: 'rows', rows: [
          { k: 'This seven-day run', v: '-7.47%', up: false, note: 'August 14 to August 24' },
          { k: 'A normal seven days', v: '+1.69%', up: true, note: 'median of all 2,920 windows' },
          { k: 'Where this one ranks', v: 'bottom 10%', up: false, note: 'of the same 2,920' },
        ],
      },
    },
    {
      // ⛔ 해석 한 문장. 인과가 아니라 «순서» 를 말한다 — 이건 반박 불가능한 사실이다.
      role: 'verdict', prio: 1, bg: V('vault-doors.mp4'),
      eyebrow: 'Read the order',
      head: 'This is not\na reaction.',
      say: 'So this is not a reaction.',
      ask: 'The report has not happened yet.',
      visual: {
        kind: 'stat', label: 'What the sequence says', value: 'Selling came first',
        sub: 'whatever the report says, it did not cause this', up: false,
      },
    },
    {
      role: 'chips', prio: 1, bg: V('ani-chip-conveyor.mp4'),
      // ⛔ 원래 여기에 메모리 수치(MU -5.83% · 메가캡 +0.70% · 6.53pt)를 넣었는데,
      //   그건 같은 날 올라가는 MEMSPLIT 편의 «알맹이» 다. _dupe-check 가 잡아냈다.
      //   dupeOk 로 넘기지 않고 이 편의 «자기 재료» 로 바꾼다 — 앞선 세 번이 언제였나.
      eyebrow: 'The other three',
      head: 'Twice before,\nand once in 2022.',
      say: 'It happened three times before.',
      ask: 'You have to go back to 2022.',
      visual: {
        kind: 'rows', rows: [
          { k: 'First', v: 'Aug 2015', up: false, note: 'seven sessions' },
          { k: 'Longest', v: 'Jun 2019', up: false, note: 'eight sessions' },
          { k: 'Most recent', v: 'Sep 2022', up: false, note: 'seven sessions, four years ago' },
        ],
      },
    },
    {
      role: 'chips', prio: 1, bg: V('floor-empty-night.mp4'),
      eyebrow: 'What we did not do',
      head: 'We counted.\nWe do not predict.',
      say: 'We counted. We do not predict.',
      ask: 'Four cases cannot tell you the fifth.',
      visual: {
        kind: 'rows', rows: [
          { k: 'Anchor', v: 'NVDA 208.48', up: false, note: 'close on August 24' },
          { k: 'What we claim', v: 'How rare, and how deep', up: true, note: 'measured in one window' },
          { k: 'What we do not', v: 'What happens next', up: false, note: 'seven-plus streaks have four cases' },
        ],
      },
    },
  ],

  voice: VOICE_NVSTREAK,
};
