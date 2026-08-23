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
import { VOICE_JP10D } from './voice-jp10d';

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
// SCRIPT_JP10D — 「エヌビディアは十日に頼っていなかった」 (10년 복리 갈래 확장)
// ----------------------------------------------------------------------------
// ★ 근거: scripts/edge-jp-rare.mjs · .agent/_jp_rare.json (2026-08-24 실호출)
//   대형주 29종 · 2016-08-22 ~ 2026-08-21 (2,513거래일)
//   지표: 10년 로그수익 중 «상위 10일» 이 차지하는 몫
//     WFC 188.9%  INTC 164.1%  QCOM 142.7%  CVX 140.6%  XOM 130.4%  ORCL 114.0%
//     중앙 65.0%
//     AAPL 37.9%  MU 35.3%  NVDA 33.0%  ← 29종 중 «최하위», 백분위 3.4
//
// ⛔ 처음에 쓰려던 각도를 «버렸다». 그대로 적어 둔다 —
//   초안은 「137배의 8할이 10일에서 나왔다」였다 (상위10일 제외 시 137.64배→27.05배).
//   틀린 수치는 아니지만 «배수»로 말하면 극적으로 들리고 «로그»로 종목끼리 비교하면
//   NVDA 는 오히려 가장 덜 몰려 있다. 두 수치는 같은 사실이다:
//     log(137.64)=4.925 · 상위10일 몫 33% → exp(4.925×0.67)=27.1 ✓
//   ⇒ 「8할」만 보여주면 시청자는 «NVDA 가 유난히 운 좋은 열흘» 이라고 오해한다.
//     비교군을 재고 나서야 반대라는 것을 알았다. 재지 않았으면 거짓을 내보낼 뻔했다.
//
// ⛔ 「だから長期保有せよ」로 쓰지 않는다. 조언이 되는 순간 거짓이 된다.
// ⛔ 「NVDA 가 더 안전하다」도 금지. 우리가 잰 것은 «수익의 집중도» 하나뿐이다.
//   최대 낙폭은 NVDA 가 -66.4% 로 훨씬 컸다 (.agent/_jp3.json).
// ============================================================================
export const SCRIPT_JP10D: BriefingProps = {
  // ⛔ 초안은 「29銘柄中28銘柄が沈む」이었다 — «틀린 말»이다. 중앙값이 65% 라는 것은
  //   상위 10일을 빼도 대부분은 여전히 플러스라는 뜻이다. 실제로 원금 아래로 내려가는 것은
  //   몫이 100% 를 넘는 8종목뿐이다 (WFC INTC QCOM CVX XOM ORCL CRM ADBE).
  title: '上位10日を抜くと、\n8銘柄が元本割れ。',
  date: 'AUG 24 · 大型株29銘柄',
  slowCuts: true,
  noOutro: true,
  disclaimer: '教育目的のみ。投資助言ではありません。',
  field: ['NVDA', 'WFC', 'INTC', 'AAPL', 'MU'],

  hook: {
    line: '上位10日を抜いたら、\n元本割れした銘柄がある。',
    sub: '大型株二十九銘柄、全部並べた。',
    say: 'ちょっと待って。逆でした。',
    role: 'conflict',
    syms: ['NVDA'],
    bigNum: '10日',
    bg: { kind: 'video', src: 'shorts/bg/video/tape-wall-scroll.mp4', loopFrames: 150 },
  },
  loop: '百三十七倍は、\n毎日積み上がった。',

  beats: [
    {
      role: 'conflict',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/exchange-flags.mp4', loopFrames: 150 },
      eyebrow: 'よく聞く話',
      head: '上がるのは\n十日だけ、と言う。',
      say: '上がるのは十日だけ、と言う。',
      ask: 'よく聞く話です。',
      visual: {
        kind: 'stat', label: 'よく聞く話', value: '上位10日',
        sub: 'くり返される — 比べられたことはない', up: false,
      },
    },
    {
      role: 'evidence',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/desks-dawn.mp4', loopFrames: 150 },
      eyebrow: 'だから並べた',
      head: '大型株\n二十九銘柄。',
      say: '大型株二十九銘柄で測りました。',
      ask: '十年を一日ずつです。',
      visual: {
        kind: 'rows', rows: [
          { k: '対象', v: '29銘柄', up: true, note: '米国大型株 · 2016年8月から' },
          { k: '日数', v: '2,513日', up: true, note: '一銘柄あたり' },
          { k: '測るもの', v: '上位10日の寄与', up: true, note: '対数リターンでの割合' },
        ],
      },
    },
    {
      role: 'money',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/nyse-flags.mp4', loopFrames: 150 },
      eyebrow: '返ってきた答え',
      head: '中央値は\n六十五%。',
      say: '中央値は六十五%でした。',
      ask: '半分以上が十日で決まる。',
      visual: {
        kind: 'stat', label: '29銘柄の中央値', value: '65.0%',
        sub: '十年の伸びの半分以上が、十日に集まっていた', up: false,
      },
    },
    {
      role: 'verdict',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/vault-doors.mp4', loopFrames: 150 },
      eyebrow: '一番きつい銘柄',
      head: '十日を抜くと\n元本割れ。',
      say: '十日を抜くと元本割れです。',
      ask: 'ウェルズ・ファーゴの話です。',
      visual: {
        kind: 'rows', rows: [
          { k: 'ウェルズ・ファーゴ', v: '188.9%', up: false, note: '10年で1.7倍 — 10日を抜くと1倍未満' },
          { k: 'インテル', v: '164.1%', up: false, note: '10年で2.5倍' },
          { k: 'クアルコム', v: '142.7%', up: false, note: '10年で2.6倍' },
        ],
      },
    },
    {
      role: 'evidence',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/columns-goldenhour.mp4', loopFrames: 150 },
      eyebrow: '分布で見ると',
      head: '二十九のうち\n二十一。',
      say: '五十%を超えたのが二十一銘柄。',
      ask: '元本割れは八銘柄でした。',
      visual: {
        kind: 'rows', rows: [
          { k: '50%超', v: '21銘柄', up: false, note: '29銘柄中 — 伸びの半分が10日に' },
          { k: '100%超', v: '8銘柄', up: false, note: '10日を抜くと元本割れ' },
          { k: '40%未満', v: '3銘柄', up: true, note: 'AAPL · MU · NVDA' },
        ],
      },
    },
    {
      role: 'chips',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/chip-city.mp4', loopFrames: 150 },
      eyebrow: 'ところが',
      head: 'エヌビディアが\n一番低い。',
      say: 'エヌビディアは二十九銘柄中最下位。',
      ask: '十日には頼っていません。',
      visual: {
        kind: 'rows', rows: [
          { k: 'エヌビディア', v: '33.0%', up: true, note: '29銘柄で最も低い · 下位3.4%' },
          { k: '10年の倍率', v: '137.6倍', up: true, note: '同じ期間で最大' },
          { k: 'ただし最大下落', v: '-66.4%', up: false, note: '2022年10月 — 楽な道ではない' },
        ],
      },
    },
  ],

  voice: VOICE_JP10D,
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
