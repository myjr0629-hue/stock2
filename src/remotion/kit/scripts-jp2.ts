// ============================================================================
// scripts-jp2 — 일본 채널 «터진 소재 3갈래» 확장판 (2026-08-23)
// ----------------------------------------------------------------------------
// ⛔ 왜 새 파일인가
//   scripts-jp.ts 는 «개시 4편» 이다. 그 4편은 노출 0 구간에서 나갔고, 채널이
//   깨어난 뒤 실제로 달린 것은 아래 3갈래다. 두 묶음을 섞으면 무엇이 이겼는지
//   다시 못 가른다. 그래서 «검증된 갈래» 만 여기 모은다.
//
// ── 무엇이 실제로 달렸나 (Studio 실측, 2026-08-23) ───────────────────────────
//   S&P500が静かな理由…            813회   ← 지수 갈래
//   【米国株】10年前に100万円…      775회   ← 10년 복리 갈래
//   ガンマが外れた翌週…             453회   ← 만기·감마 갈래
//   マックスペイン…                   7회   ← 같은 포맷인데 107배 차이. «소재» 가 갈랐다
//
// ── 이번 3편이 «원판과 다른 점» (연구에서 남긴 것만 얹는다) ──────────────────
//   ① 태그 0개    — 급상승 신규채널 중앙값 0. 우리 구판 일본 영상은 79~80개였다
//   ② 카테고리 27 — 필드 표준 22/27. 우리 구판은 25였다
//   ③ 제목·훅을 «반전» 으로 — 세 편 모두 통념을 3초 안에 꺾는다
//   ④ 자료는 «오늘 잰 것» — 아래 세 편의 숫자는 전부 2026-08-23 실호출이다
//   ⛔ 「상단 고정 띠」는 얹지 않는다. 우리 813회 승자가 상단정지 0% 였다 —
//     그 규칙은 레퍼런스에서만 성립하고 우리 승자가 반증한다.
// ============================================================================
import type { BriefingProps } from './Briefing';
import { VOICE_JPYEN } from './voice-jpyen';
import { VOICE_JPPOST } from './voice-jppost';

// ============================================================================
// SCRIPT_JPYEN — 「その2.5倍、4割は株じゃない」 (지수 갈래 확장)
// ----------------------------------------------------------------------------
// ★ 근거: scripts/edge-jp-yen.mjs · .agent/_jp_yen.json (2026-08-23 실호출)
//   SPY × USDJPY 겹치는 2,529거래일. 기준일 2026-08-21 · 158.97円
//     10년  ドル 3.504배 / 円 5.552배 / 환율만 1.585배 → 엔약세 기여 26.9%
//     5년   ドル 1.712배 / 円 2.481배 / 환율만 1.449배 → 엔약세 기여 40.8%
//     3년   ドル 1.743배 / 円 1.895배 / 환율만 1.087배 → 엔약세 기여 13.1%
//   기여분은 «로그» 로 가른다. 곱셈 분해라 로그가 정직하다.
//
// ⛔ 원래 쓰려던 각도는 «탈락»했다 — 그대로 적어 둔다
//   「지수는 조용한데 안은 갈라졌다」의 새 증거로 SPY-RSP 1년 격차를 쟀는데
//   1.15%pt = 4,748개 창 중 상위 51.0% (정중앙). 사전등록 기준(상위 10%) 미달.
//   억지로 쓰면 그 순간 이 채널의 알맹이가 없어진다. 버리고 각도를 바꿨다.
//
// ⛔ 「だから円で持て」로 쓰지 않는다. 분해만 보여준다. 조언이 되는 순간 거짓이 된다.
// ⛔ 3년이 13.1% 인 것을 «숨기지 않는다». 오히려 그게 반전이다 —
//   「최근에는 환율 덕이 아니었다」가 이 영상에서 가장 새로운 한 줄이다.
// ============================================================================
export const SCRIPT_JPYEN: BriefingProps = {
  title: 'S&P500で5年2.5倍。\nでも4割は株じゃない。',
  date: 'AUG 23 · 円で見る米国株',
  slowCuts: true,
  noOutro: true,
  disclaimer: '教育目的のみ。投資助言ではありません。',
  field: ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA'],

  hook: {
    // ⛔ 반전을 3초 안에. 「2.5배」에 안심한 순간 「4할은 주식이 아니다」로 꺾는다
    line: 'その2.5倍、\n4割は株じゃない。',
    sub: '五年分、円で計算し直した。',
    say: 'その二・五倍、四割は株じゃない。',
    role: 'conflict',
    syms: ['SPY'],
    bigNum: '40.8%',
    bg: { kind: 'video', src: 'shorts/bg/video/exchange-flags.mp4', loopFrames: 150 },
  },
  loop: '円建ての数字は、\n二つの力でできている。',

  beats: [
    {
      role: 'conflict',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/rise-glass-tower.mp4', loopFrames: 150 },
      eyebrow: '五年前に100万円',
      head: '円建てなら\n248万円。',
      say: '五年前の百万円が、二百四十八万円です。',
      ask: 'いい数字に見えます。',
      visual: {
        kind: 'stat', label: 'S&P500 · 円建て 5年', value: '2.481倍',
        sub: '100万円 → 248万円', up: true, sym: 'SPY',
      },
    },
    {
      role: 'evidence',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/ax-two-piles.mp4', loopFrames: 150 },
      eyebrow: 'ドルで見ると',
      head: '同じ五年が\n1.71倍。',
      say: 'ところが、ドルで見ると一・七一倍。',
      ask: '同じ商品、同じ期間です。',
      visual: { kind: 'versus', aK: '円建て', aV: '2.481倍', bK: 'ドル建て', bV: '1.712倍' },
    },
    {
      role: 'money',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/ani-scale-tip.mp4', loopFrames: 150 },
      eyebrow: '差の正体',
      head: '109円が\n158円になった。',
      say: '差は為替です。百九円が、百五十八円。',
      ask: '為替だけで一・四五倍。',
      visual: {
        kind: 'rows', rows: [
          { k: '2021年8月', v: '109.70円', up: false, note: '五年前のドル円' },
          { k: '2026年8月', v: '158.97円', up: true, note: '2026-08-21 終値' },
          { k: '為替だけで', v: '1.449倍', up: true, note: '株を一株も持たなくても' },
        ],
      },
    },
    {
      role: 'verdict',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/ax-measure-tape.mp4', loopFrames: 150 },
      eyebrow: '寄与を分けた',
      head: '五年は40.8%。\n十年は26.9%。',
      say: '五年の四割は、円安の分でした。',
      ask: '十年なら、二割七分。',
      visual: {
        kind: 'rows', rows: [
          { k: '10年', v: '26.9%', up: true, note: '円建て5.552倍 / ドル建て3.504倍' },
          { k: '5年', v: '40.8%', up: true, note: '円建て2.481倍 / ドル建て1.712倍' },
          { k: '3年', v: '13.1%', up: false, note: '円建て1.895倍 / ドル建て1.743倍' },
        ],
      },
    },
    {
      role: 'chips',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/ax-double-take.mp4', loopFrames: 150 },
      eyebrow: 'ここが意外',
      head: '直近三年は\n13%だけ。',
      say: 'でも直近三年は、一割三分だけです。',
      ask: '最近の伸びは、円安ではありません。',
      visual: {
        kind: 'stat', label: '直近3年 · 円安の寄与', value: '13.1%',
        sub: '146.21円 → 158.97円 — 為替はもう効いていない', up: false,
      },
    },
  ],

  voice: VOICE_JPYEN,
};

// ============================================================================
// SCRIPT_JP10D — 「137倍の正体は、10日だった」 (10년 복리 갈래 확장)
// ----------------------------------------------------------------------------
// ★ 근거: scripts/edge-jp3.mjs · .agent/_jp3.json (2026-08-23 실호출)
//   NVDA 2016-08-22 → 2026-08-21 · 2,513거래일
//     그대로 137.64배 / 상위10일 제외 27.05배 / 20일 10.77배 / 30일 5.02배
//     상위 10일이 지운 몫 80.3% (전체 일수의 0.40%)
//     최대 낙폭 -66.4% (2022-10-14)
//   SPY 같은 기간 3.50배 → 상위10일 제외 1.85배 (47.1% 소멸) · 최대 낙폭 -34.1%
//
// ⛔ 이건 «검정» 이 아니라 «분해» 다. p값을 붙이지 않는다. 붙이면 거짓이 된다.
// ⛔ 「だから売るな」로 쓰지 않는다. 그건 조언이다. 우리는 분해만 보여준다.
// ⛔ 10일을 «맞출 수 있다»는 뉘앙스도 금지. 위치만 말한다.
// ============================================================================
export const SCRIPT_JP10D: BriefingProps = {
  title: '10年で137倍。\n10日抜くと27倍。',
  date: 'AUG 23 · 2,513営業日の分解',
  slowCuts: true,
  noOutro: true,
  disclaimer: '教育目的のみ。投資助言ではありません。',
  field: ['NVDA', 'SPY', 'AMD', 'INTC'],

  hook: {
    line: '137倍のうち、\n8割は10日で出た。',
    sub: '二千五百十三営業日、全部並べた。',
    say: '百三十七倍のうち、八割は十日で出ました。',
    role: 'conflict',
    syms: ['NVDA'],
    bigNum: '10日',
    bg: { kind: 'video', src: 'shorts/bg/video/ax-long-corridor-count.mp4', loopFrames: 150 },
  },
  loop: '十年を作ったのは、\n十日だった。',

  beats: [
    {
      role: 'conflict',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/ani-vault-open.mp4', loopFrames: 150 },
      eyebrow: '十年前に100万円',
      head: '今は\n1億3,764万円。',
      say: '十年前の百万円が、一億三千七百万円です。',
      ask: 'エヌビディア、百三十七倍。',
      visual: {
        kind: 'stat', label: 'NVDA · 10年', value: '137.64倍',
        sub: '2016年8月22日 → 2026年8月21日', up: true, sym: 'NVDA',
      },
    },
    {
      role: 'evidence',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/ax-count-tally.mp4', loopFrames: 150 },
      eyebrow: 'だから並べた',
      head: '2,513日を\n一日ずつ。',
      say: '二千五百十三営業日を、一日ずつ並べました。',
      ask: '上がった日の上位十日を抜きます。',
      visual: {
        kind: 'rows', rows: [
          { k: '対象', v: '2,513営業日', up: true, note: '2016年8月 - 2026年8月' },
          { k: '抜くのは', v: '上位10日', up: false, note: '全体のわずか0.40%' },
          { k: '残りは', v: '2,503日', up: true, note: '他は一日も触らない' },
        ],
      },
    },
    {
      role: 'money',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/ani-vault-drain.mp4', loopFrames: 150 },
      eyebrow: '結果',
      head: '137倍が\n27倍になった。',
      say: '百三十七倍が、二十七倍になりました。',
      ask: '十日で、八割が消えます。',
      visual: { kind: 'versus', aK: '全2,513日', aV: '137.64倍', bK: '10日を除く', bV: '27.05倍' },
    },
    {
      role: 'verdict',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/ax-stack-blocks.mp4', loopFrames: 150 },
      eyebrow: 'もっと抜くと',
      head: '30日抜けば\n5倍まで落ちる。',
      say: '二十日で十・七倍。三十日で、五倍です。',
      ask: '十年が、ほぼ消えます。',
      visual: {
        kind: 'rows', rows: [
          { k: 'そのまま', v: '137.64倍', up: true, note: '2,513日すべて' },
          { k: '上位20日を除く', v: '10.77倍', up: false, note: '全体の0.80%' },
          { k: '上位30日を除く', v: '5.02倍', up: false, note: '全体の1.19%' },
        ],
      },
    },
    {
      role: 'chips',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/ani-storm-part.mp4', loopFrames: 150 },
      eyebrow: 'その十年の途中',
      head: '一度、\n66%下げている。',
      say: 'そしてその途中、六十六%下げた時期があります。',
      ask: 'S&P500も同じ形でした。',
      visual: {
        kind: 'rows', rows: [
          { k: 'NVDA 最大下落', v: '-66.4%', up: false, note: '2022年10月14日 · 終値ベース' },
          { k: 'S&P500 10年', v: '3.50倍', up: true, note: '10日を除くと1.85倍' },
          { k: 'S&P500 最大下落', v: '-34.1%', up: false, note: '2020年3月23日' },
        ],
      },
    },
  ],
};

// ============================================================================
// SCRIPT_JPPOST — 「満期明けは荒れる、は逆だった」 (감마·만기 갈래 확장)
// ----------------------------------------------------------------------------
// ★ 근거: scripts/edge-jp3.mjs · .agent/_jp3.json (2026-08-23 실호출)
//   기간 2021-01-01 ~ 2026-08-21 · 12종목 (edge-opex 와 동일 집합)
//   정의 «만기 다음 주» = 월간 만기(셋째 금요일) 다음 거래일부터 5거래일 (320일)
//        «평상 주»     = 만기 주와 다음 주를 «둘 다» 뺀 나머지 (770일)
//   결과 12종목 중 11종목이 «다음 주가 더 조용했다» — 부호검정 p=0.0063
//        유일한 예외 NVDA 3.813 vs 3.774 (차이 0.039%p — 사실상 동률)
//        SPY 1.124 vs 1.220 · QQQ 1.530 vs 1.664
//
// ⛔ 이건 «통념의 반대» 다. 그래서 더 조심한다.
//   말할 수 있는 것: 「만기 다음 주의 일중 변동폭이 평상 주보다 작았다」까지.
//   말하면 안 되는 것: 「감마가 풀려서/마켓메이커가 …」 — 우리는 원인을 재지 않았다.
//   달력 위치 효과(FOMC·CPI·실적이 다른 주에 몰린다)일 수 있다. 그 가능성을 지운 적 없다.
// ⛔ 「だから翌週は安全」 도 금지. 평균이 작다는 것과 안전은 다른 말이다.
// ============================================================================
export const SCRIPT_JPPOST: BriefingProps = {
  title: '「満期明けは荒れる」\n12銘柄中11銘柄で逆。',
  date: 'AUG 23 · 満期明けの週',
  slowCuts: true,
  noOutro: true,
  disclaimer: '教育目的のみ。投資助言ではありません。因果は測っていません。',
  field: ['SPY', 'QQQ', 'NVDA', 'TSLA', 'AMD'],

  hook: {
    line: '満期が明けたら荒れる。\n逆でした。',
    sub: '五年分、一日ずつ測った。',
    say: 'そう言われています。でも、逆でした。',
    role: 'conflict',
    syms: ['SPY'],
    bigNum: '11/12',
    bg: { kind: 'video', src: 'shorts/bg/video/exchange-flags.mp4', loopFrames: 150 },
  },
  loop: '荒れるはずの週が、\n一番静かだった。',

  beats: [
    {
      role: 'conflict',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/exchange-storm.mp4', loopFrames: 150 },
      eyebrow: 'よく聞く話',
      head: '押さえる力が\n外れる週。',
      say: '満期明けは荒れる、と。',
      ask: 'よく聞く話です。',
      visual: {
        kind: 'stat', label: 'よく聞く話', value: '満期明け＝荒れる',
        sub: 'くり返される — 検証はされない', up: false,
      },
    },
    {
      role: 'evidence',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/desks-dawn.mp4', loopFrames: 150 },
      eyebrow: 'だから測った',
      head: '12銘柄、\n五年分。',
      say: '十二銘柄、五年分測りました。',
      ask: '満期の翌週、五日間です。',
      visual: {
        kind: 'rows', rows: [
          { k: '期間', v: '2021 - 2026', up: true, note: '月次満期 · 第三金曜日' },
          { k: '満期明けの週', v: '320日', up: true, note: '翌営業日から5営業日' },
          { k: '平常の週', v: '770日', up: true, note: '満期週は両方から除外' },
        ],
      },
    },
    {
      role: 'money',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/floor-empty-night.mp4', loopFrames: 150 },
      eyebrow: '返ってきた答え',
      head: 'むしろ\n静かだった。',
      say: 'むしろ静かでした。',
      ask: '数字は下がっていました。',
      visual: { kind: 'versus', aK: 'SPY · 満期明け', aV: '1.124%', bK: 'SPY · 平常', bV: '1.220%' },
    },
    {
      role: 'verdict',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/tape-wall-scroll.mp4', loopFrames: 150 },
      eyebrow: '12銘柄のうち',
      head: '11銘柄で\n同じ向き。',
      say: '十二銘柄のうち十一銘柄が同じ向き。',
      ask: '偶然なら千回に六回です。',
      visual: {
        kind: 'rows', rows: [
          { k: '静かだった', v: '11銘柄', up: true, note: 'SPY QQQ AAPL AMD TSLA ほか' },
          { k: '符号検定', v: 'p=0.0063', up: true, note: '偶然では説明しにくい' },
          { k: '例外', v: 'NVDA 1銘柄', up: false, note: '3.813 対 3.774 — ほぼ同じ' },
        ],
      },
    },
    {
      role: 'chips',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/floor-empty-night.mp4', loopFrames: 150 },
      eyebrow: 'ただし',
      head: '理由までは\n測っていない。',
      say: '理由までは測っていません。',
      ask: 'わかったのは位置だけです。',
      visual: {
        kind: 'stat', label: 'わかったこと', value: '位置だけ',
        sub: 'FOMCや決算が別の週に寄っている可能性は消していない', up: false,
      },
    },
  ],

  voice: VOICE_JPPOST,
};
