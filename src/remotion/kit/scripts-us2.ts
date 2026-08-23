// ============================================================================
// scripts-us2 — 미국 채널 · 금리 편 (2026-08-24)
// ----------------------------------------------------------------------------
// ★ 왜 이 소재인가
//   미국 수요 실측 (.agent/DEMAND.json): interest rates 48,195 · bond yields 64,208
//   우리가 오늘 잰 것이 정확히 «미 10년물 금리» 다 — 소재와 데이터가 처음으로 일치한다.
//
// ⛔ 기존 채권편과 겹치는가 — 확인하고 각도를 바꿨다
//   ZcMnT7fEf-M 「Bond Yields Explained: Your Hedge Died In 2022」 는 같은 질문을
//   «60/40 헤지» 프레임으로 물었고 «12회» 에 그쳤다. 그 문은 우리 채널에서 약하다.
//   이 편은 문을 「interest rates」 로 바꾸고, 결론도 다르다:
//     헤지가 죽었다(상태)  →  통념이 15.3% 의 기간에만 맞았다(적중률) + 지금이 최극단(위치)
//
// ── 근거 (2026-08-24 실호출) ─────────────────────────────────────────────────
//   scripts/edge-jp-rate-fx.mjs · .agent/_jp_ratefx.json
//     FRED DGS10 × SPY · 2006-10-06 ~ 2026-08-20 · 4,924거래일
//     전체 상관 +0.284 (t=20.75)
//     252일 롤링 4,673창: 중앙 +0.348 · 지금 -0.306 · 백분위 0.1 · 음(-) 창 15.3%
//   scripts/_jp-extra.mjs · .agent/_jp_extra.json
//     최고 +0.712 (2012-08-15) · 최저 -0.312 (2024-07-08) · +0.5 초과 18.2%
//
// ⛔ 인과 금지. 「rates drive stocks」 로 쓰지 않는다 — 우리는 방향의 일치만 쟀다.
// ⛔ 「the rule is wrong」 으로 쓰지 않는다. 맞는 기간이 15.3% 있고, 지금이 그 안이다.
// ⛔ 매수·매도 권유 금지.
//
// ★ 영어 대본 규격 (scripts/script-check.mjs)
//   훅 = 반박형 · 12단어 이내 · 단어/큐 5~7.6 · 숫자밀도 3.2% 이하 · you/we 비율 2.5% 이상
//   ⇒ 숫자는 «말로» 쓴다 (fifteen percent). 자릿수를 그대로 쓰면 밀도가 터진다.
// ============================================================================
import type { BriefingProps } from './Briefing';
import { VOICE_USRATE } from './voice-usrate';

const V = (src: string) =>
  ({ kind: 'video', src: `shorts/bg/video/${src}`, loopFrames: 150 }) as const;

export const SCRIPT_USRATE: BriefingProps = {
  title: 'Rates up, stocks down.\nIt held fifteen percent of the time.',
  date: 'AUG 24 · INTEREST RATES',
  slowCuts: true,
  noOutro: true,
  disclaimer: 'Informational only. Not investment advice. Causation not measured.',
  field: ['SPY', 'TLT', 'IEF', 'QQQ'],

  hook: {
    line: 'Rates up, stocks down.\nTrue fifteen percent\nof the time.',
    sub: 'We counted every session since 2006.',
    say: 'Hold on. You have this backwards.',
    role: 'conflict',
    syms: ['SPY'],
    bigNum: '15.3%',
    bg: V('tape-wall-scroll.mp4'),
  },
  loop: 'The rule is not wrong.\nIt is conditional.',

  beats: [
    {
      role: 'conflict', prio: 1, bg: V('fed-building.mp4'),
      eyebrow: 'You hear it daily',
      head: 'Rates go up,\nstocks go down.',
      say: 'You hear this every single day.',
      ask: 'Has anyone counted it for you?',
      visual: {
        kind: 'stat', label: 'The rule everyone repeats', value: 'Rates up = stocks down',
        sub: 'Repeated constantly. Never counted.', up: false,
      },
    },
    {
      role: 'evidence', prio: 1, bg: V('desks-dawn.mp4'),
      eyebrow: 'So we counted',
      head: 'Twenty years,\none day at a time.',
      say: 'We counted twenty years of sessions.',
      ask: 'Yields against the index, daily.',
      visual: {
        kind: 'rows', rows: [
          { k: 'Span', v: '2006 - 2026', up: true, note: '4,924 trading sessions' },
          { k: 'Rates', v: 'US 10-year yield', up: true, note: 'FRED DGS10 · daily change' },
          { k: 'Stocks', v: 'S&P 500', up: true, note: 'SPY closes' },
        ],
      },
    },
    {
      role: 'money', prio: 1, bg: V('ani-arrows-flow.mp4'),
      eyebrow: 'What came back',
      head: 'The correlation\nis positive.',
      say: 'The correlation came back positive.',
      ask: 'On average, they rose together.',
      visual: {
        kind: 'stat', label: '2006-2026 · correlation', value: '+0.284',
        sub: 't = 20.75 — when yields rose, stocks rose too', up: true,
      },
    },
    {
      role: 'verdict', prio: 1, bg: V('scale-few-vs-many.mp4'),
      eyebrow: 'Window by window',
      head: 'The rule held\nfifteen percent.',
      say: 'The rule held fifteen percent.',
      ask: 'Most windows ran the other way.',
      visual: {
        kind: 'rows', rows: [
          { k: 'Rule held (negative)', v: '15.3%', up: false, note: 'of 4,673 one-year windows' },
          { k: 'Opposite (positive)', v: '84.7%', up: true, note: 'yields and stocks moved together' },
          { k: 'Median window', v: '+0.348', up: true, note: 'normal is strongly positive' },
        ],
      },
    },
    {
      role: 'evidence', prio: 1, bg: V('ani-data-pillars.mp4'),
      eyebrow: 'The other extreme',
      head: 'Nearly one in five\nran hard the other way.',
      say: 'Nearly one in five ran hard positive.',
      ask: 'The strongest one was back in 2012.',
      visual: {
        kind: 'rows', rows: [
          { k: 'Windows above +0.5', v: '18.2%', up: true, note: 'more common than the rule itself' },
          { k: 'Strongest window', v: '+0.712', up: true, note: 'August 15, 2012' },
          { k: 'Weakest window', v: '-0.312', up: false, note: 'July 8, 2024' },
        ],
      },
    },
    {
      role: 'chips', prio: 1, bg: V('vault-doors.mp4'),
      eyebrow: 'But right now',
      head: 'Today sits at\nminus point three one.',
      say: 'But today reads deeply negative.',
      ask: 'Bottom tenth of one percent.',
      visual: {
        kind: 'rows', rows: [
          { k: 'Today', v: '-0.306', up: false, note: 'as of August 20, 2026' },
          { k: 'Where that sits', v: 'bottom 0.1%', up: false, note: 'of 4,673 windows' },
          { k: 'All-time low', v: '-0.312', up: false, note: 'July 2024 — nearly level with today' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1, bg: V('ani-door-open.mp4'),
      eyebrow: 'So what is it',
      head: 'The rule is not wrong.\nIt is conditional.',
      say: 'The rule is not wrong.',
      ask: 'It is conditional. Today qualifies.',
      visual: {
        kind: 'stat', label: 'The verdict', value: 'Conditional, not false',
        sub: 'it fits 15.3% of the record — and today is inside it', up: false,
      },
    },
    {
      role: 'chips', prio: 1, bg: V('floor-empty-night.mp4'),
      eyebrow: 'What we did not measure',
      head: 'We measured\ndirection only.',
      say: 'We measured direction, not cause.',
      ask: 'You are in that fifteen percent.',
      visual: {
        kind: 'stat', label: 'What we can say', value: 'Position, not cause',
        sub: 'why the sign flips is not something we measured', up: false,
      },
    },
  ],

  voice: VOICE_USRATE,
};
