// ============================================================================
// scripts-nvda — 엔비디아 실적(2026-08-26) · 미국/일본 동시 (2026-08-24)
// ----------------------------------------------------------------------------
// ★ 왜 이 각도인가
//   이미 다룬 것은 「방향은 못 맞춘다」 (SCRIPT_JPEARN 일본 312회 · SCRIPT_LFEARN 미국).
//   그건 끝났다. 새로 잰 네 각도 중 «통념을 정면으로 반증하는 것» 을 쓴다.
//
// ── 근거 (scripts/edge-nvda-earn.mjs · edge-nvda-band.mjs · 2026-08-24 실호출) ──
//   실적 59회 중 가격이 붙는 46회 (2015~2026-05)
//   A) 「엔비디아 실적은 시장을 흔든다」  ⛔ 반증
//      실적 다음날 SPY 일중폭 1.172% vs 평상 1.125% — 1.04배 · t=0.38 (유의하지 않다)
//   B) 「커질수록 덜 움직인다」            ✅ rho=-0.305 · t=-2.12
//      초기 5회 평균 9.88% → 최근 5회 2.88% · 역대 최대 30.2% (2016-11-10)
//   C) 「첫날이 그 주를 정한다」          ✅ r=0.303 · t=2.11 · 같은 방향 29/46
//   D) 「반도체가 같이 간다」             ✅ 88/138 = 63.8% · 부호검정 p=0.00154
//      AMD 67.4% · AVGO 63.0% · MU 60.9%
//   최근 8회 실적 다음날 절대변동: 중앙 3.25% · 최소 0.53% · 최대 8.48%
//
// ⛔ 「이번엔 얼마 움직인다」로 쓰지 않는다. 과거 분포의 «위치» 만 말한다.
// ⛔ 방향은 이 편에서 다루지 않는다 — JPEARN 과 중복이 된다.
// ⛔ 인과 금지 · 매수매도 권유 금지.
// ============================================================================
import type { BriefingProps } from './Briefing';
import { VOICE_USNVDA } from './voice-usnvda';
import { VOICE_JPNVDA } from './voice-jpnvda';

const V = (src: string) =>
  ({ kind: 'video', src: `shorts/bg/video/${src}`, loopFrames: 150 }) as const;

// ============================================================================
// SCRIPT_USNVDA — 미국판
// ⛔ 영어 규격: 훅 반박형·12단어 이내 · 자막 38자 이내 · 단어/큐 5~7.6 · 숫자는 «말로»
// ============================================================================
export const SCRIPT_USNVDA: BriefingProps = {
  title: 'Nvidia reports Wednesday.\nThe market barely notices.',
  date: 'AUG 24 · NVDA EARNINGS',
  slowCuts: true,
  noOutro: true,
  disclaimer: 'Informational only. Not investment advice. Causation not measured.',
  field: ['NVDA', 'AMD', 'AVGO', 'MU'],

  hook: {
    line: 'Nvidia reports\nWednesday.\nThe market shrugs.',
    sub: 'We counted forty-six of them.',
    say: 'Hold on. The market barely reacts.',
    role: 'conflict',
    syms: ['NVDA'],
    bigNum: '1.04x',
    bg: V('tape-wall-scroll.mp4'),
  },
  loop: 'The whole market moves.\nIt just does not move for this.',

  beats: [
    {
      role: 'conflict', prio: 1, bg: V('nyse-flags.mp4'),
      eyebrow: 'What everyone says',
      head: 'The whole market\nwaits on Nvidia.',
      say: 'Everyone says the market waits.',
      ask: 'Four trillion dollars. Of course.',
      visual: {
        kind: 'stat', label: 'The claim', value: 'The market waits',
        sub: 'Repeated every quarter. Never counted.', up: false,
      },
    },
    {
      role: 'evidence', prio: 1, bg: V('desks-dawn.mp4'),
      eyebrow: 'So we counted',
      head: 'Forty-six reports,\nback to 2015.',
      say: 'So we counted forty-six of them.',
      ask: 'What the index did the next day.',
      visual: {
        kind: 'rows', rows: [
          { k: 'Reports counted', v: '46', up: true, note: '2015 to May 2026' },
          { k: 'Measured', v: 'S&P 500 next day', up: true, note: 'intraday high-low range' },
          { k: 'Compared with', v: 'every other day', up: true, note: 'same period' },
        ],
      },
    },
    {
      role: 'money', prio: 1, bg: V('scale-few-vs-many.mp4'),
      eyebrow: 'The answer',
      head: 'Four percent\nwider. That is all.',
      say: 'The index moved four percent wider.',
      ask: 'That is inside the noise.',
      visual: {
        kind: 'versus', aK: 'Earnings day', aV: '1.172%', bK: 'Every other day', bV: '1.125%',
      },
    },
    {
      role: 'verdict', prio: 1, bg: V('ani-data-pillars.mp4'),
      eyebrow: 'Statistically',
      head: 'We cannot tell\nthem apart.',
      say: 'We cannot tell the two apart.',
      ask: 'The market does not wait on this.',
      visual: {
        kind: 'rows', rows: [
          { k: 'Ratio', v: '1.04x', up: false, note: 'earnings day vs normal day' },
          { k: 't-statistic', v: '0.38', up: false, note: 'far below the 1.96 threshold' },
          { k: 'Meaning', v: 'indistinguishable', up: false, note: 'from an ordinary session' },
        ],
      },
    },
    {
      role: 'chips', prio: 1, bg: V('ani-arrows-flow.mp4'),
      eyebrow: 'And Nvidia itself',
      head: 'It moves less\nevery year.',
      say: 'And Nvidia moves less every year.',
      ask: 'Ten percent then. Three now.',
      visual: {
        kind: 'rows', rows: [
          { k: 'First five reports', v: '9.88%', up: true, note: 'average next-day move' },
          { k: 'Last five reports', v: '2.88%', up: false, note: 'same measure' },
          { k: 'Trend', v: 'rho -0.305', up: false, note: 't = -2.12 across 46 reports' },
        ],
      },
    },
    {
      role: 'evidence', prio: 1, bg: V('chip-city.mp4'),
      eyebrow: 'One thing does move',
      head: 'The rest of the\nchips follow.',
      say: 'One thing does move. The other chips.',
      ask: 'They matched two times in three.',
      visual: {
        kind: 'rows', rows: [
          { k: 'AMD', v: '67.4%', up: true, note: 'same direction as NVDA, 46 reports' },
          { k: 'Broadcom', v: '63.0%', up: true, note: 'same measure' },
          { k: 'Sign test', v: 'p = 0.0015', up: true, note: '88 of 138 — not chance' },
        ],
      },
    },
    {
      role: 'chips', prio: 1, bg: V('floor-empty-night.mp4'),
      eyebrow: 'What we did not measure',
      head: 'We counted\nsize, not cause.',
      say: 'We counted size, not cause.',
      ask: 'And we say nothing about direction.',
      visual: {
        kind: 'stat', label: 'What we can say', value: 'Size only',
        sub: 'why it shrank is not something we measured', up: false,
      },
    },
  ],

  voice: VOICE_USNVDA,
};

// ============================================================================
// SCRIPT_JPNVDA — 일본판
// ⛔ 번역이 아니다. 일본 수요는 «エヌビディア» 14,658 로 이미 크고, 우리 일본 채널의
//   실적편(Bbk8r-o4nYw)은 312회였다 — 방향 각도는 거기서 끝났으므로 여기선 쓰지 않는다.
// ⛔ 일본어 규격: 자막 18자 · 글자/큐 8~16 · 훅 반박형
// ============================================================================
export const SCRIPT_JPNVDA: BriefingProps = {
  title: 'エヌビディア決算。\n市場はほとんど動きません。',
  date: 'AUG 24 · 決算は8月26日',
  slowCuts: true,
  noOutro: true,
  disclaimer: '教育目的のみ。投資助言ではありません。因果は測っていません。',
  field: ['NVDA', 'AMD', 'AVGO', 'MU'],

  hook: {
    line: '決算で市場が動く。\n四十六回、数えました。',
    sub: '指数はほとんど動いていない。',
    say: 'そう言われています。でも逆でした。',
    role: 'conflict',
    syms: ['NVDA'],
    bigNum: '1.04倍',
    bg: V('tape-wall-scroll.mp4'),
  },
  loop: '市場は動く。\nただ、これでは動かない。',

  beats: [
    {
      role: 'conflict', prio: 1, bg: V('nyse-flags.mp4'),
      eyebrow: 'よく聞く話',
      head: '市場全体が\n決算を待つ。',
      say: '市場全体が決算を待つ、と言います。',
      ask: '四兆ドルの会社ですから。',
      visual: {
        kind: 'stat', label: 'よく聞く話', value: '市場が待つ',
        sub: '毎四半期くり返される — 数えられたことはない', up: false,
      },
    },
    {
      role: 'evidence', prio: 1, bg: V('desks-dawn.mp4'),
      eyebrow: 'だから数えました',
      head: '四十六回、\n二〇一五年から。',
      say: '四十六回、二千十五年から数えました。',
      ask: '翌日の指数がどう動いたかです。',
      visual: {
        kind: 'rows', rows: [
          { k: '対象', v: '46回', up: true, note: '2015年 - 2026年5月' },
          { k: '測るもの', v: '翌日のS&P500', up: true, note: '日中の高値安値の幅' },
          { k: '比べるもの', v: 'それ以外の全日', up: true, note: '同じ期間' },
        ],
      },
    },
    {
      role: 'money', prio: 1, bg: V('scale-few-vs-many.mp4'),
      eyebrow: '返ってきた答え',
      head: '四%広いだけ\nでした。',
      say: '四%広いだけでした。',
      ask: 'これは誤差の中です。',
      visual: {
        kind: 'versus', aK: '決算の翌日', aV: '1.172%', bK: 'それ以外', bV: '1.125%',
      },
    },
    {
      role: 'verdict', prio: 1, bg: V('ani-data-pillars.mp4'),
      eyebrow: '統計的には',
      head: '区別が\nつきません。',
      say: '統計的に区別がつきません。',
      ask: '市場は、これを待っていません。',
      visual: {
        kind: 'rows', rows: [
          { k: '比', v: '1.04倍', up: false, note: '決算翌日 対 平常日' },
          { k: 't値', v: '0.38', up: false, note: '1.96 にまるで届かない' },
          { k: 'つまり', v: '普通の日と同じ', up: false, note: '見分けがつかない' },
        ],
      },
    },
    {
      role: 'chips', prio: 1, bg: V('ani-arrows-flow.mp4'),
      eyebrow: 'エヌビディア自身も',
      head: '毎年、\n動かなくなった。',
      say: 'エヌビディア自身も動きません。',
      ask: '昔は一割、今は三%未満です。',
      visual: {
        kind: 'rows', rows: [
          { k: '最初の5回', v: '9.88%', up: true, note: '翌日の平均変動' },
          { k: '直近の5回', v: '2.88%', up: false, note: '同じ測り方' },
          { k: '傾向', v: 'rho -0.305', up: false, note: 't = -2.12 · 46回で' },
        ],
      },
    },
    {
      role: 'chips', prio: 1, bg: V('floor-empty-night.mp4'),
      eyebrow: 'ただし',
      head: '幅を測りました。\n理由ではなく。',
      say: '測ったのは幅で、理由ではありません。',
      ask: '方向についても何も言いません。',
      visual: {
        kind: 'stat', label: '言えること', value: '幅だけ',
        sub: 'なぜ縮んだのかは測っていない', up: false,
      },
    },
  ],

  voice: VOICE_JPNVDA,
};
