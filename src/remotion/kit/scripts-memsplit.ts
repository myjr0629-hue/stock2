// ============================================================================
// scripts-memsplit — 미국 채널 · 메모리만 무너진 날 (2026-08-24 종가 확정)
// ----------------------------------------------------------------------------
// ★ 소재 경로 — topic-scan 스킬의 4칸
//   관심   Massive 뉴스 다수 + 한국 언론 102건(삼성전자·하이닉스) · 최신 0.4h
//   가격   MU -5.83% · 메가캡3 +0.70% (같은 날)
//   원인   중국 메모리 업체의 상하이 IPO 신청 보도 — 경쟁 우려 (Massive 뉴스에서 확인)
//   희소성 스프레드 -6.53pt · 1,415일 중 30일 = 2.12% · 백분위 2.0
//
// ── 우리가 잰 것 (FMP 종가로 «직접» 계산, 정규장 마감 후) ──────────────────
//   ⛔ 장중 수치로 쓰지 않는다. marketstatus 가 extended-hours 인 것을 확인하고 다시 쟀다.
//     (장중에 MU 를 -6.38% 로 봤는데 확정 종가는 -5.83% 였다 — 0.55%p 차이가 났다)
//
//   2026-08-24 종가 : MU 910.43 (-5.83%) · AAPL·MSFT·GOOGL 평균 +0.70% · SPY -0.17%
//   스프레드(MU 빼기 메가캡3) = -6.53pt
//   표본 1,415일(2021-01 이후) · 중앙 +0.05pt · 표준편차 3.18pt · 백분위 2.0
//   이만큼 벌어진 날 30/1,415 = 2.12%
//
// ── 내 해석 (사실과 «구분해서» 말한다) ──────────────────────────────────────
//   같은 「기술」 안에서 값이 갈렸다. 지수도, 메가캡도 멀쩡한데 메모리만 빠졌다.
//   ⇒ 시장이 이날 다시 값을 매긴 것은 «기술 수요» 가 아니라 «메모리 공급» 쪽이었다.
//   ⛔ 이건 해석이다. 인과를 잰 것이 아니고, 중국 IPO 가 원인이라고 단정하지도 않는다.
//     기사가 그렇게 보도했다는 사실까지만 말한다.
//
// ⛔ 예측 금지 · 인과 단정 금지 · 매수매도 권유 금지 · 「수혜주」 금지
// ★ 영어 규격: 자막 38자 · 훅은 질문 또는 반박 · 숫자는 «말로» 쓴다
// ============================================================================
import type { BriefingProps } from './Briefing';
import { VOICE_MEMSPLIT } from './voice-memsplit';

const V = (src: string) =>
  ({ kind: 'video', src: `shorts/bg/video/${src}`, loopFrames: 150 }) as const;

export const SCRIPT_MEMSPLIT: BriefingProps = {
  title: 'Micron fell 5.83%. Apple, Microsoft and Google rose. Same day.',
  date: 'AUG 24 · MEMORY',
  slowCuts: true,
  // ⛔ noOutro 를 켜지 않는다 — 앱 광고는 기본이다 (2026-08-25 규칙)
  disclaimer: 'Informational only. Not investment advice. Causation not measured.',
  field: ['MU', 'AAPL', 'MSFT', 'SPY'],

  hook: {
    // ⛔ 훅에서 답을 감춘다 — 「어느 쪽이 올랐는지」를 말하지 않는다
    line: 'Memory fell\nnearly six percent.\nBig tech closed green.',
    sub: 'Same session. We measured the gap.',
    say: 'Memory crashed. Why was big tech fine?',
    role: 'conflict',
    syms: ['MU'],
    bigNum: '2%',
    bg: V('ani-chip-pull.mp4'),
  },
  loop: 'The index was fine.\nOne shelf of it was not.',

  beats: [
    {
      role: 'conflict', prio: 1, bg: V('tape-wall-scroll.mp4'),
      eyebrow: 'The tape looked calm',
      head: 'The index barely\nmoved at all.',
      say: 'The index barely moved at all.',
      ask: 'Down a fifth of a percent.',
      visual: {
        kind: 'stat', label: 'What the headline number said', value: 'S&P 500 · -0.17%',
        sub: 'a quiet session on the surface', up: false,
      },
    },
    {
      role: 'evidence', prio: 1, bg: V('ani-chip-conveyor.mp4'),
      eyebrow: 'Underneath it',
      head: 'Memory broke\nby itself.',
      say: 'But memory broke by itself.',
      ask: 'You saw Micron down five point eight.',
      visual: {
        kind: 'rows', rows: [
          { k: 'Micron close', v: '910.43', up: false, note: 'August 24' },
          { k: 'Move on the day', v: '-5.83%', up: false, note: 'from the prior close' },
          { k: 'The index', v: '-0.17%', up: false, note: 'same session' },
        ],
      },
    },
    {
      role: 'evidence', prio: 1, bg: V('ani-mem-seesaw.mp4'),
      eyebrow: 'And the giants',
      head: 'The megacaps\nclosed green.',
      say: 'And the megacaps closed green.',
      ask: 'Apple, Microsoft and Google.',
      visual: {
        kind: 'rows', rows: [
          { k: 'Apple, Microsoft, Google', v: '+0.70%', up: true, note: 'average of the three' },
          { k: 'Micron', v: '-5.83%', up: false, note: 'same day' },
          { k: 'Gap between them', v: '6.53pt', up: false, note: 'in one session' },
        ],
      },
    },
    {
      role: 'evidence', prio: 1, bg: V('ani-arrows-flow.mp4'),
      eyebrow: 'So we counted',
      head: 'Five years\nof the same gap.',
      say: 'So we measured five years of it.',
      ask: 'Closing prices only.',
      visual: {
        kind: 'stat', label: 'Days measured', value: '1,415',
        sub: 'every session since January 2021', up: true,
      },
    },
    {
      // ★ 반전 = 훅의 답
      role: 'verdict', prio: 1, bg: V('scale-few-vs-many.mp4'),
      eyebrow: 'The answer',
      head: 'Bottom two percent\nof five years.',
      say: 'It sits in the bottom two percent.',
      ask: 'Thirty days out of fifteen hundred.',
      visual: {
        kind: 'rows', rows: [
          { k: 'A normal day', v: '+0.05pt', up: true, note: 'median gap, Micron minus megacaps' },
          { k: 'This day', v: '-6.53pt', up: false, note: '2nd percentile' },
          { k: 'Days this wide', v: '30 of 1,415', up: false, note: '2.12 percent of them' },
        ],
      },
    },
    {
      role: 'chips', prio: 1, bg: V('ani-china-us.mp4'),
      eyebrow: 'What was reported',
      head: 'A Chinese memory\nmaker filed to list.',
      say: 'A Chinese rival filed to list.',
      ask: 'Reported in Shanghai.',
      visual: {
        kind: 'stat', label: 'What the wires carried', value: 'New supply, not new demand',
        sub: 'we report what was written; we did not measure cause', up: false,
      },
    },
    {
      // ⛔ 해석 한 문장. 인과가 아니라 «어디에 값이 매겨졌는가» 를 말한다.
      role: 'verdict', prio: 1, bg: V('ani-chip-carry.mp4'),
      eyebrow: 'Read the split',
      head: 'The market repriced\nsupply, not demand.',
      say: 'The split was priced into supply.',
      ask: 'The buyers of chips were fine.',
      visual: {
        kind: 'stat', label: 'What the spread says', value: 'One shelf, not the store',
        sub: 'the companies that buy memory closed higher', up: true,
      },
    },
    {
      role: 'chips', prio: 1, bg: V('floor-empty-night.mp4'),
      eyebrow: 'What we did not measure',
      head: 'We measured the gap,\nnot the reason.',
      say: 'We measured the gap, not the reason.',
      ask: 'Watch Micron at nine hundred ten.',
      visual: {
        kind: 'rows', rows: [
          { k: 'Anchor', v: 'MU 910.43', up: false, note: 'close on August 24' },
          { k: 'What we claim', v: 'How wide, and how rare', up: true, note: 'one session, 1,415 compared' },
          { k: 'What we do not', v: 'Why, or what comes next', up: false, note: 'cause was not measured' },
        ],
      },
    },
  ],

  voice: VOICE_MEMSPLIT,
};
