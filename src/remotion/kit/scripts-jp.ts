// ============================================================================
// scripts-jp — 일본 채널(@signum_jp) 대본
// ----------------------------------------------------------------------------
// ⛔ 왜 파일을 나누는가
//   영어 채널 대본(scripts.ts)과 «섞지 않는다». 언어가 다르면 자막 상한(ja 18자)도,
//   수요 어휘도, 낭독 속도도 다르다. 한 파일에 두면 반드시 서로를 오염시킨다.
//
// ⛔ 일본판은 «번역»이 아니다
//   실측: マックスペイン 소형중앙 15,560 · 여지 70%  /  エヌビディア 14,658 · 여지 20%
//         (미국은 반대다 — max pain 532 · options trading 37,547)
//   같은 내용이라도 «문»이 다르므로 제목과 훅을 각각 짠다.
// ============================================================================
import type { BriefingProps } from './Briefing';
import { VOICE_JPOPEX } from './voice-jpopex';
import { VOICE_JPGAMMA } from './voice-jpgamma';
import { VOICE_JPEARN } from './voice-jpearn';
import { VOICE_JPCONS } from './voice-jpcons';

// ============================================================================
// SCRIPT_JPOPEX — 「핀은 진짜다. 단 엔비디아만 예외다」 (2026-08-21 · 일본 1호)
// ----------------------------------------------------------------------------
// ★ 소재 = 문 × 이상값
//   문    : マックスペイン — 소형채널 조회 중앙 15,560 · 여지 70% (일본 실측 1위)
//           エヌビディア 14,658 이지만 여지 20% ⇒ «단독으로 앞에 세우지 않는다»
//   이상값: scripts/edge-opex.mjs 사전등록 검정 (2021-01 ~ 2026-08)
//           만기 금요일 768일 일중폭 2.672% vs 나머지 금요일 2,628일 2.783%
//           12종목 중 10종목 동일 방향 → 부호검정 p=0.019 (유의)
//           ⇒ **NVDA 는 그 10에 «없다»** — 64회 vs 219회, +1.9%, t=0.25
//   오늘  : 2026-08-21 이 8월 셋째 금요일(월간 만기). 계산으로 확인함.
//
// ⛔ 「엔비디아는 오히려 더 움직인다」로 쓰지 않는다.
//   t=0.25 는 «어느 방향으로도 유의하지 않다»는 뜻이다. 말할 수 있는 것은
//   「핀 효과가 나타나지 않았다」까지다. 한 발 더 나가면 그 순간 거짓이 된다.
// ⛔ 「기관이 함정을 팠다」 같은 인과 단정을 하지 않는다. 위치와 분포만 보여준다.
// ⛔ 자막에 숫자를 넣지 않는다. 숫자는 화면 카드가 나른다.
// ⛔ 실시간 값(2026-08-20 종가 기준): NVDA $216.85 · 맥스페인 $210 · 감마플립 $220
//   ⇒ 주가가 «두 선 사이»에 있다. 이건 오늘만 성립한다 — 날짜 지나면 다시 재야 한다.
// ============================================================================
export const SCRIPT_JPOPEX: BriefingProps = {
  title: 'マックスペインは効く。\nエヌビディアを除いて。',
  date: 'AUG 21 · 月間満期日',
  slowCuts: true,

  hook: {
    // ⛔ 반전을 «앞으로» 당긴다. 쇼츠에서 반전을 아껴두면 그 전에 나간다.
    //   3초 안에 「어? 엔비디아만?」이 걸려야 나머지 24초를 본다.
    line: 'エヌビディアだけ、\nピンが効かない。',
    // ⛔ 화면 문구는 «숫자»로 쓴다. 한자 표기(七百六十八)는 «낭독용»이다.
    //   썸네일은 이 영상에서 가장 중요한 한 장인데, 거기서 숫자가 한자로 나가면
    //   한눈에 안 읽힌다. 숫자는 언어와 무관하게 즉시 읽힌다. (2026-08-21 첫 렌더에서 확인)
    sub: '満期日768回、全部調べた。',
    // ⛔ 낭독은 «반박»으로 연다 (script-check 훅 유형). 선언형은 우리 32편 전부가 그랬고,
    //   레퍼런스는 7편 중 3편이 질문·반박으로 연다.
    say: 'ちょっと待って。エヌビディアは違う。',
    role: 'conflict',
    // ⛔ 종목 영상이면 «심볼»을 크게 박는다 (대표 상시 지시).
    //   일반 시청자는 글자보다 심볼을 먼저 본다. 폰 썸네일 폭 210px 에서
    //   「エヌビディア」 가나 6자는 뭉개지지만, NVDA 로고는 그 크기에서도 살아남는다.
    syms: ['NVDA'],
    // 훅: 멈춘 도미노 = 가격이 묶인다
    bg: { kind: 'video', src: 'shorts/bg/video/ani-dominoes.mp4', loopFrames: 150 },
  },
  loop: 'ピンは本物。\nただし例外あり。',

  beats: [
    {
      role: 'conflict',
      prio: 1,
      // 다들 같은 말을 한다
      bg: { kind: 'video', src: 'shorts/bg/video/ani-two-smile.mp4', loopFrames: 150 },
      eyebrow: 'よく聞く話',
      head: 'みんなが言う。\n満期日は動かない。',
      say: 'そう言われています。',
      ask: '誰も確かめていない。',
      visual: {
        kind: 'stat', label: 'よく聞く話', value: 'ピン留め',
        sub: '毎月くり返される — 検証はされない', up: false,
      },
    },
    {
      role: 'evidence',
      prio: 1,
      // 둘로 가른다
      bg: { kind: 'video', src: 'shorts/bg/video/ani-scale-tip.mp4', loopFrames: 150 },
      eyebrow: 'だから調べた',
      head: '三千を超える\n金曜日を、二つに。',
      say: '二〇二一年からの金曜日。',
      ask: '満期日と、それ以外に分けた。',
      visual: {
        kind: 'rows', rows: [
          { k: '満期の金曜日', v: '768', up: true, note: '毎月 第三金曜日' },
          { k: 'ほかの金曜日', v: '2,628', up: false, note: '同じ曜日・同じ銘柄' },
          { k: '銘柄', v: '12', up: true, note: 'SPY QQQ と大型十銘柄' },
        ],
      },
    },
    {
      role: 'money',
      prio: 1,
      // 조용해진다 — 상자에 갇힘
      bg: { kind: 'video', src: 'shorts/bg/video/ani-trapped-box.mp4', loopFrames: 150 },
      eyebrow: '返ってきた答え',
      head: '満期日は、\n値幅が静かになる。',
      say: '満期日、値幅は静かになります。',
      ask: '十二のうち、十でそうだった。',
      visual: { kind: 'versus', aK: 'ほかの金曜日', aV: '2.78%', bK: '満期の金曜日', bV: '2.67%' },
    },
    {
      // ★ 여기가 «너도 몰랐지»다. role: 'verdict' 는 cutFor 가 «절대 안 버린다»(prio 1).
      role: 'verdict',
      prio: 1,
      // 하나만 문을 열고 빠져나간다
      bg: { kind: 'video', src: 'shorts/bg/video/ani-door-open.mp4', loopFrames: 150 },
      eyebrow: 'その十に入らない一つ',
      head: 'エヌビディアだけ、\n効いていない。',
      say: 'ただし、例外があります。',
      ask: 'エヌビディアには効かない。',
      visual: {
        kind: 'stat', label: 'NVDA · 満期64回 vs ほか219回', value: '効果なし',
        sub: 't = 0.25 — 差は出なかった', up: false,
      },
    },
    {
      role: 'chips',
      prio: 1,
      // 두 선 사이에서 당겨져 있다
      bg: { kind: 'video', src: 'shorts/bg/video/ani-rubber-band.mp4', loopFrames: 150 },
      eyebrow: '今夜の位置',
      head: '二つの線の\n間にいる。',
      say: '今夜、その株はここにいます。',
      ask: 'ニュースではなく、板を見る。',
      visual: {
        kind: 'rows', rows: [
          { k: 'ガンマフリップ', v: '$220', up: true, note: '株価より上' },
          { k: 'NVDA', v: '$216.85', up: true, note: '二つの線の間' },
          { k: 'マックスペイン', v: '$210', up: false, note: '株価より下' },
        ],
      },
    },
  ],

  voice: VOICE_JPOPEX,
  outro: {
    app: 'SIGNUM',
    line: '機関が残す、板の跡',
    ask: 'ニュースの前に、\n数字を見ろ。',
  },
};

// ============================================================================
// SCRIPT_JPGAMMA — 「만기가 끝나면 출렁인다」가 정반대였다 (2026-08-22 · 일본 C슬롯)
// ----------------------------------------------------------------------------
// ★ 소재 = 네 칸 (.agent/CHANNEL_PLAN.md §1-B)
//   ① 사건    2026-08-21 이 8월 월간 만기일. 이 영상이 나가는 8/22 부터가 «만기 다음 주».
//   ② 영향경로 만기 전에는 마켓메이커 헤지가 가격을 누른다 → 만기가 지나면 그 포지션이
//             사라지므로 눌러주던 힘이 풀려 출렁인다. 레퍼런스 채널도 어제 그렇게 말했다.
//   ③ 우리수치 scripts/edge-gamma-reset.mjs 사전등록 검정 (2021-01 ~ 2026-08)
//             만기 다음 주 3,840일 2.704% vs 평상 9,288일 2.901% — 6.8% «더 조용»
//             12종목 중 11종목이 조용해짐 → 부호검정 p=0.0063 (유의)
//             ⇒ 통념과 «반대» 방향이 유의하다
//   ④ 기준선   NVDA 일중 변동폭 3.8% — 이번 주 이걸 넘는지 본다 (유일한 예외 종목이었다)
//
//   문: 🇯🇵 ガンマ 소형중앙 19,480 · 여지 68% — 일본 검색어 «1위»
//
// ⛔ 「감마가 사라져서 조용해진다」로 쓰지 않는다. 우리가 잰 것은 «변동폭»이지 감마가 아니다.
//   인과를 단정하는 순간 거짓이 된다. 우리는 «통념과 반대였다»까지만 말한다.
// ⛔ NVDA 는 «유일한 예외»다 (+1.3%, t=0.38 — 유의하지는 않다). 「더 출렁였다」로 쓰지 않는다.
// ⛔ 1호(JPOPEX)와 배경 클립이 겹치지 않게 골랐다.
// ============================================================================
export const SCRIPT_JPGAMMA: BriefingProps = {
  title: 'ガンマが外れた翌週。\n荒れる、は逆だった。',
  date: 'AUG 22 · 満期の翌週',
  slowCuts: true,
  noOutro: true,
  disclaimer: '教育目的のみ。投資助言ではありません。',

  hook: {
    line: '満期が終わった。\n荒れるはずだった。',
    sub: '12銘柄で数えたら、逆でした。',
    say: 'ちょっと待って。逆になりました。',
    role: 'conflict',
    syms: ['NVDA'],
    // ⛔ 이 편은 «시장 전체» 이야기다 (12종목 중 11종목). 그래서 프레임0은 SPY 다.
    //   NVDA 는 마지막 «예외»로 나온다 — 거기서 쓴다.
    // 훅 배경은 «루프백에서 한 번 더» 쓰인다. sunrise 는 잔잔한 수면이라
    // 마지막 2.5초가 통째로 «빈 화면»으로 잡혔다 (게이트 상한 0.8초).
    // ⇒ 밝으면서 «화면이 찬» 것으로 바꾼다. 종을 친다 = 만기 종료 신호로 뜻도 맞다.
    bg: { kind: 'video', src: 'shorts/bg/video/golden-bell.mp4', loopFrames: 150 },
  },
  loop: '荒れるはずが、\n静かだった。',

  beats: [
    {
      role: 'conflict',
      prio: 1,
      // 다들 같은 곳을 가리킨다
      bg: { kind: 'video', src: 'shorts/bg/video/exchange-flags.mp4', loopFrames: 150 },
      eyebrow: 'よく聞く話',
      head: '満期が過ぎると\n荒れる、と言う。',
      say: 'そう言われています。',
      // ★ 레퍼런스 흐름: «개수를 먼저 말한다» — 듣는 사람이 진도를 안다
      ask: '理由は一つ。ヘッジが外れるから。',
      visual: {
        kind: 'stat', label: 'よく聞く話', value: '荒れる',
        sub: 'ヘッジが外れるから — 検証はされない', up: false,
      },
    },
    {
      role: 'evidence',
      prio: 1,
      // 둘로 가른다
      bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 150 },
      eyebrow: 'だから数えた',
      head: '一万三千日を\n二つに分けた。',
      say: '二〇二一年からの全営業日。',
      ask: '満期の翌週と、それ以外。',
      visual: {
        kind: 'rows', rows: [
          { k: '満期の翌週', v: '3,840', up: true, note: '満期の翌営業日から5日' },
          { k: 'それ以外', v: '9,288', up: false, note: '満期の週は除外' },
          { k: '銘柄', v: '12', up: true, note: 'SPY QQQ と大型十銘柄' },
        ],
      },
    },
    {
      role: 'money',
      prio: 1,
      // 폭풍이 갈라진다 = 예상과 달리 잠잠해짐
      bg: { kind: 'video', src: 'shorts/bg/video/desks-dawn.mp4', loopFrames: 150 },
      eyebrow: '返ってきた答え',
      head: '逆だった。\n翌週は静かになる。',
      // ★ 레퍼런스 흐름: «중반 재훅» — 「그런데 여기가 이상하다」를 명시적으로 신호한다
      say: 'ところが、ここが変です。',
      ask: '荒れるどころか、静かでした。',
      visual: { kind: 'versus', aK: 'それ以外', aV: '2.90%', bK: '満期の翌週', bV: '2.70%' },
    },
    {
      role: 'verdict',
      prio: 1,
      // 표정이 뒤집힌다
      bg: { kind: 'video', src: 'shorts/bg/video/tape-wall-scroll.mp4', loopFrames: 150 },
      eyebrow: '十二のうち十一',
      head: '十一銘柄で\n静かになった。',
      say: '十二のうち十一が、そうでした。',
      ask: '偶然では、ありません。',
      visual: {
        kind: 'stat', label: '符号検定 · 12銘柄中11', value: 'p = 0.0063',
        sub: '通説と«逆»方向で有意', up: true,
      },
    },
    {
      role: 'chips',
      prio: 1,
      // 마켓메이커가 저글링 — 하나만 계속 움직인다
      bg: { kind: 'video', src: 'shorts/bg/video/pcb-one-chip-lit.mp4', loopFrames: 150 },
      eyebrow: 'ただ一つの例外',
      head: 'エヌビディアだけ、\n静かにならない。',
      say: '例外は、一つだけでした。',
      ask: 'ニュースではなく、数字を見る。',
      visual: {
        kind: 'rows', rows: [
          { k: 'NVDA 満期の翌週', v: '3.81%', up: true, note: '唯一 静かにならなかった' },
          { k: 'ほか11銘柄', v: '-5%〜-11%', up: false, note: 'すべて静かになった' },
          { k: '全体', v: '-6.8%', up: false, note: '満期の翌週のほうが静か' },
        ],
      },
    },
  ],

  voice: VOICE_JPGAMMA,
  outro: {
    app: 'SIGNUM',
    line: '機関が残す、板の跡',
    ask: 'ニュースの前に、\n数字を見ろ。',
  },
};

// ============================================================================
// SCRIPT_JPEARN — 「幅は読める。方向は読めない」 (2026-08-22 · 일본 3호)
// ----------------------------------------------------------------------------
// ★ 소재 = 문 × 이상값 × 시의성
//   문    : エヌビディア — 일본 소형채널 조회 중앙 14,658 (실측 2위)
//           決算 은 실적 시즌마다 반복되는 상시 검색어
//   시의성: 2026-08-26 엔비디아 실적. FMP 캘린더로 «실호출» 확인 —
//           컨센 EPS 2.09 · 매출 920.4억달러 (조회일 2026-08-22)
//   이상값: scripts/edge-earnings.mjs 사전등록 검정 (2021-01 ~ 2026-08)
//           10종목 228회 실적 다음날: 평균 절대수익 6.39% vs 평상 1.85% = 3.45배
//           그런데 «상승 비율»은 108/228 = 47.4% (z=-0.79) — 동전 던지기와 구분 안 됨
//           NVDA 단독: 22회 중 11회 상승 = «정확히» 50.0%
//
// ⛔ 「방향은 랜덤이다」로 단정하지 않는다. z=-0.79 는 «동전과 구분되지 않는다»는 뜻이지
//   «랜덤임이 증명됐다»가 아니다. 우리가 말할 수 있는 것은 「당해내지 못했다」까지다.
// ⛔ 「그러니 사라/팔라」로 가지 않는다. 우리는 위치와 분포만 보여준다.
// ⛔ 배경은 전부 «실사»다 (2026-08-22 실측: 일본 인기 쇼츠 12편에 캐릭터 애니 0편).
// ============================================================================
export const SCRIPT_JPEARN: BriefingProps = {
  title: 'エヌビディア決算。\n幅は読める、方向は読めない。',
  date: 'AUG 26 · 決算',
  slowCuts: true,
  noOutro: true,
  disclaimer: '教育目的のみ。投資助言ではありません。',

  hook: {
    line: '幅は読める。\n方向は読めない。',
    sub: '決算二百二十八回、全部数えた。',
    say: 'ちょっと待って。方向は当たりません。',
    role: 'conflict',
    syms: ['NVDA'],
    bg: { kind: 'video', src: 'shorts/bg/video/pcb-traces-glow.mp4', loopFrames: 150 },
  },
  loop: '当たるのは幅だけ。\n方向ではない。',

  beats: [
    {
      role: 'conflict',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/nyse-flags.mp4', loopFrames: 150 },
      eyebrow: 'よく聞く話',
      head: '決算の前は\nみんな方向を語る。',
      say: 'みんな、上か下かを言います。',
      ask: '上がるか、下がるか。',
      visual: {
        kind: 'stat', label: 'よく聞く話', value: '上か下か',
        sub: '毎回くり返される — 検証はされない', up: false,
      },
    },
    {
      role: 'evidence',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/tape-wall-scroll.mp4', loopFrames: 150 },
      eyebrow: 'だから数えた',
      head: '十社の決算\n二百二十八回。',
      say: '二〇二一年からの全決算です。',
      ask: '翌営業日の終値です。',
      visual: {
        kind: 'rows', rows: [
          { k: '決算の回数', v: '228', up: true, note: '大型十銘柄 · 2021年から' },
          { k: '数えた値', v: '翌日終値', up: true, note: '発表の次の営業日' },
          { k: '比べた相手', v: '普段の日', up: false, note: '同じ期間の全営業日' },
        ],
      },
    },
    {
      role: 'money',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/datacenter-aisle.mp4', loopFrames: 150 },
      eyebrow: '返ってきた答え',
      head: '幅は、\n三・四五倍。',
      say: '幅のほうは、きれいに出ました。',
      ask: '普段の三倍以上、動きます。',
      visual: { kind: 'versus', aK: '普段の日', aV: '1.85%', bK: '決算の翌日', bV: '6.39%' },
    },
    {
      role: 'verdict',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 150 },
      eyebrow: 'ところが方向は',
      head: '四十七・四%。\nコインと同じ。',
      say: 'ところが、ここが変です。',
      ask: '方向は、当たっていません。',
      visual: {
        kind: 'stat', label: '上昇した割合 · 228回中108回', value: '47.4%',
        sub: 'コイン投げと区別がつかない', up: false,
      },
    },
    {
      role: 'chips',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/pcb-one-chip-lit.mp4', loopFrames: 150 },
      eyebrow: 'エヌビディアは',
      head: '二十二回中十一回。\nちょうど半分。',
      say: 'エヌビディアは、ちょうど半分でした。',
      ask: '見るのは方向ではなく、幅です。',
      visual: {
        kind: 'rows', rows: [
          { k: 'NVDA 普段の日', v: '2.31%', up: false, note: '同じ期間の平均的な一日' },
          { k: 'NVDA 決算の翌日', v: '6.20%', up: true, note: '二・六九倍' },
          { k: '上がった回数', v: '11 / 22', up: false, note: 'ちょうど五十%' },
        ],
      },
    },
  ],

  voice: VOICE_JPEARN,
};


// ============================================================================
// SCRIPT_JPCONS — 「指数は静かでも、中は割れている」 (2026-08-22 · 일본 4호)
// ----------------------------------------------------------------------------
// ★ 소재 = 문 × 이상값
//   문    : S&P500 — 일본 소형채널 조회 중앙 20,926 (실측 4위)
//           ⛔ 「AIバブル」는 83, 「AI株」는 26 이다. 일본에서 AI 프레임은 «문이 아니다».
//             그래서 같은 데이터를 «지수가 왜 조용한가»로 연다.
//   이상값: scripts/edge-consumer-ai.mjs 사전등록 후 FRED 원자료로 계산
//           RSAFS(소매판매) vs A34SNO(컴퓨터·전자 신규주문) 공통 401개월 (1993-02~2026-06)
//           최근: 소매 +6.75% · 컴퓨터 신규주문 +16.76% → 격차 +10.01%p
//           401개월 분포에서 백분위 95.3 — 이보다 큰 달은 19번뿐
//
// ⛔ 「소비가 죽는다」가 «틀렸다»고 단정하지 않는다. 우리가 잰 것은 «증가율»이고,
//   증가율이 플러스라는 것은 「감소하지 않았다」까지다. 체감·물가 조정은 다른 이야기다.
// ⛔ 인과를 단정하지 않는다 — 두 계열이 지수 안에서 상쇄된다는 것은 «구조 설명»이지
//   검정된 인과가 아니다. 검정된 것은 «격차의 크기»뿐이다.
// ⛔ 배경은 전부 실사 (2026-08-22 실측: 일본 인기 쇼츠 12편에 캐릭터 애니 0편)
// ============================================================================
export const SCRIPT_JPCONS: BriefingProps = {
  title: 'S&P500が静かな理由。\n中では二つに割れている。',
  date: 'AUG 22 · 米国の実体',
  slowCuts: true,
  noOutro: true,
  disclaimer: '教育目的のみ。投資助言ではありません。',

  hook: {
    line: 'S&P500は静かだ。\n中は割れている。',
    sub: '四百一か月、全部並べた。',
    say: 'ちょっと待って。消費は死んでいない。',
    role: 'conflict',
    syms: ['SPY'],
    bg: { kind: 'video', src: 'shorts/bg/video/exchange-flags.mp4', loopFrames: 150 },
  },
  loop: '指数は静かでも、\n中は割れている。',

  beats: [
    {
      role: 'conflict',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/nyse-flags.mp4', loopFrames: 150 },
      eyebrow: 'よく聞く話',
      head: '消費が死ぬ、と\n言われている。',
      say: 'そう言われています。',
      ask: 'ウォルマート以降、ずっとです。',
      visual: {
        kind: 'stat', label: 'よく聞く話', value: '消費が死ぬ',
        sub: 'くり返される — 検証はされない', up: false,
      },
    },
    {
      role: 'evidence',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/desks-dawn.mp4', loopFrames: 150 },
      eyebrow: 'だから並べた',
      head: '四百一か月の\n二つの数字。',
      say: '一九九三年からの全月です。',
      ask: '小売と、コンピュータ受注。',
      visual: {
        kind: 'rows', rows: [
          { k: '期間', v: '401か月', up: true, note: '1993年2月から2026年6月' },
          { k: '一つ目', v: '小売販売', up: true, note: 'FRED RSAFS · 季節調整済み' },
          { k: '二つ目', v: '新規受注', up: true, note: 'FRED A34SNO · コンピュータ電子' },
        ],
      },
    },
    {
      role: 'money',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/retail-warehouse-aisle.mp4', loopFrames: 150 },
      eyebrow: '返ってきた答え',
      head: '小売は\n伸びていた。',
      say: '小売は、伸びていました。',
      ask: '死んでは、いません。',
      visual: {
        kind: 'stat', label: '小売販売 · 前年同月比', value: '+6.75%',
        sub: '減速ではなく、加速していた', up: true,
      },
    },
    {
      role: 'verdict',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/chip-city.mp4', loopFrames: 150 },
      eyebrow: 'ところが',
      head: '異常なのは\nAI側だった。',
      say: 'ところが、ここが変です。',
      ask: '二・五倍の速さです。',
      visual: { kind: 'versus', aK: '小売販売', aV: '+6.75%', bK: 'コンピュータ受注', bV: '+16.76%' },
    },
    {
      role: 'chips',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/scale-few-vs-many.mp4', loopFrames: 150 },
      eyebrow: '四百一か月で',
      head: '上位五%。\n十九回だけ。',
      say: 'これより大きい月は、十九回だけ。',
      ask: '見るのは指数ではなく、この差。',
      visual: {
        kind: 'rows', rows: [
          { k: '二つの差', v: '+10.01%pt', up: true, note: '受注の伸び - 小売の伸び' },
          { k: '401か月での位置', v: '上位4.7%', up: true, note: '中央値は -2.6%pt' },
          { k: 'これより大きい月', v: '19回', up: false, note: '1993年からで十九回だけ' },
        ],
      },
    },
  ],

  voice: VOICE_JPCONS,
};
