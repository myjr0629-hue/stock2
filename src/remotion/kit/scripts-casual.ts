// ============================================================================
// kit/scripts-casual ???�캐주얼???�플릿용 ?��?// ----------------------------------------------------------------------------
// ?�??지??2026-08-13):
//   ??"?�무 ?�큐가 ?�닌, 캐주?�하지�?깊이?�고 ?�림???�는 ?�플�?
//   ??"종목 ?� 종목 구도, ?�짜?� ?��??�는 교육?�료 ??짧�?�??�확??
//   ???�퍼?�스(경제?�냥�? ?��?반영: ??고정 ?�목 ??· 주제 번호 · ?�막 ?�강�?//        · ?�려??개념??«??�?비유» · CTA ???��? ?�도
//
// ?�️ ?�막 ??«*별표*»�?감싼 구간???�광?�으�?칠해진다 (kit/Casual CasualSay).
//    ElevenLabs ??별표�??��? ?�는????tts-beats 가 flat() ?�며 그�?�??�기지�?//    발음???�향???�는 문자????��?� ?�일?�다.
//
// ?�★???��????�칙 (?�??지??2026-08-13) ?�★??//   ?�사?�의 기본?� ?�석?�기 ?�어?�다??것이 가?????�구?��?//
//   ??**?�을 먼�? 말하�? ?�자???�면???�다.** ?��? 반�?�??��? ?�는??
//        ??"Nvidia closed at 79% of its daily range."      (79%�??�청?��? ?�석?�야 ??
//        ??"Nvidia finished near the top of its own day."  (?�면??79%)
//   ??**?�문?�어???�오??즉시 ??�?비유�?붙인??** ?�외 ?�다.
//        ??"sits above our gamma flip"
//        ??"the line where dealers stop cushioning and start amplifying"
//   ??**duel ??name 칸에??«지???�름»???�니??«?�»을 ?�다.**
//        ??ABOVE VWAP        ??BUYERS IN PROFIT
//   ?�퍼?�스 ?�증: "MSCI 지?�는 ?�게 말해??«글로벌 ?�?�의 주식 ?�핑 리스?�»라�?보면 ??"
// ============================================================================

// ?�️ ???�일?� scripts.ts �?«import ?��? ?�는?��???scripts.ts 가 ???�일??re-export
//    ?��?�?(tts-beats.mjs 가 SCRIPT_* �?거기??찾는?? ?�로 부르면 ?�환???�다.
//    A/B ?�조판(CASUAL_CLOSE812)?� Root.tsx ?�서 조립?�다.
import type { CasualProps } from './Casual';
import { VOICE_DUEL813 } from './voice-duel813';
import { VOICE_DUELB } from './voice-duelb';
import { VOICE_MAXPAIN } from './voice-maxpain';
import { VOICE_PRE813 } from './voice-pre813';
import { VOICE_REGIME813 } from './voice-regime813';
import { VOICE_PRE814 } from './voice-pre814';

// ============================================================================
// ??종목 ?� 종목 ??NVDA vs AMD (2026-08-12 ?�규??종료 ??
// ----------------------------------------------------------------------------
// ?�숫??출처 ???��? ?�측??//  · 종�?·?�인지·VWAP·20??: Polygon ?�봉 직접 계산 (scratchpad/vsverify.mjs)
//      NVDA $224.09 +3.03% | �?$225.10 ?� $220.20 ???�인지 ?�치 79%
//                            VWAP $223.34 ?��?+0.33% | 20??+5.45%
//      AMD  $482.93 +1.82% | �?$491.69 ?� $480.88 ???�인지 ?�치 19%
//                            VWAP $485.90 ?��?-0.61% | 20??-8.73%
//  · 감마 ?�립·?�션 ?�리미엄 : ?�리 ?�진 (app-view/cmd 캡처 2026-08-12 21:37 ET)
//      NVDA ?�립 $207.50 (??+8.00%) · ?�리미엄 $91.9M
//      AMD  ?�립 $485.00 (?�래 -0.43%) · ?�리미엄 $20.7M
//
// ?�기각한 각도??//  · RSI 비교 ?????�시�?54.3 / 36.9)�????�그모어 ?�는 직접 계산(61.4 / 40.4)??//    ?�랐?? 계산 방식 차이지�?«?�느 쪽이 맞다»�?증명 �??��?�??�면?????�다.
//  · ?��?총액 ?��??�리미엄 비율 ?????�사 ?�통주식???�측??�???기각.
// ============================================================================
export const SCRIPT_DUEL813: CasualProps = {
  voice: VOICE_DUEL813,
  track: 'duel',
  title: 'Both chips closed green.\nOnly one closed strong.',
  date: 'AUG 12 · AFTER THE CLOSE',
  data: { seed: 'DUEL813' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  hook: {
    line: 'Both chips closed green.',
    sub: 'Only one of them actually won.',
    bigNum: '79 vs 19',
    stamp: 'AUG 12',
    // ??로고 2�?= ?�무??종목 ?�기?��??��? 0초에 «?�석 ?�이» ?�달?�다
    syms: ['NVDA', 'AMD'],
    bg: { kind: 'video', src: 'shorts/bg/video/paper-crowd.mp4', loopFrames: 180 },
  },
  loop: 'A green close and a strong\nclose are different things.',

  beats: [
    {
      role: 'chips', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/chip-macro-grey.mp4', loopFrames: 120 },
      eyebrow: 'The headline',
      head: 'Both green.\nSame sector, same day.',
      say: 'Nvidia closed up three percent. AMD up one point eight. Both green.',
      ask: 'So they had the same day?',
      cv: {
        kind: 'duel',
        a: { sym: 'NVDA', name: 'NVIDIA', value: '+3.03%', note: '$224.09' },
        b: { sym: 'AMD', name: 'AMD', value: '+1.82%', note: '$482.93' },
        mark: 'none',
      },
    },
    {
      role: 'conflict', prio: 1,
      // scale-few-vs-many ???�면?�서 «강철 구슬»�??��? 기각 (?�??지?? 증시?�
      // 무�????�틸 ?�재 금�?). ?�벽 ?�레?�딩 ?�스?�로 교체 ??밝고, ?�중???�한??
      bg: { kind: 'video', src: 'shorts/bg/video/desks-dawn.mp4', loopFrames: 151 },
      eyebrow: 'Where they finished',
      head: 'One finished high.\nOne finished low.',
      say: 'Nvidia finished near the top of its own day. *AMD finished near the bottom.*',
      ask: 'AMD handed the whole day back.',
      cv: {
        kind: 'duel',
        a: { sym: 'NVDA', name: 'FINISHED HIGH', value: '79%', note: 'up in the day range' },
        b: { sym: 'AMD', name: 'FINISHED LOW', value: '19%', note: 'hit $491.69\nsettled $482.93' },
        mark: 'b',
      },
    },
    {
      role: 'money', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/fab-hall-bright.mp4', loopFrames: 151 },
      eyebrow: 'The average buyer',
      head: 'Green day.\nBuyers still losing.',
      say: 'Take everyone who bought AMD today, at every price. *On average, they are already down.*',
      ask: 'On a day the stock closed green.',
      cv: {
        kind: 'duel',
        a: { sym: 'NVDA', name: 'BUYERS IN PROFIT', value: '+0.33%', note: 'vs the day average' },
        b: { sym: 'AMD', name: 'BUYERS UNDERWATER', value: '-0.61%', note: 'vs the day average' },
        mark: 'b',
      },
    },
    {
      // ?�★ ?�리�?보여�????�는 �???공개 ?�세???�다
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/fiber-one-lit.mp4', loopFrames: 151 },
      eyebrow: 'Our gamma flip',
      head: 'One gets a push.\nOne gets a shove.',
      say: 'Below a certain line, the big desks soften every move. *Above it, they feed the move instead.*',
      ask: 'Nvidia is above. AMD is under.',
      cv: {
        kind: 'duel',
        a: { sym: 'NVDA', name: 'MOVES GET FED UP', value: '+8.0%', note: 'above the line\n$207.50' },
        b: { sym: 'AMD', name: 'MOVES GET FED DOWN', value: '-0.4%', note: 'under the line\n$485.00' },
        mark: 'a',
      },
    },
    {
      role: 'money', prio: 3,
      bg: { kind: 'video', src: 'shorts/bg/video/quantum-fridge.mp4', loopFrames: 151 },
      eyebrow: 'Where the bets went',
      head: 'The option crowd\nis not split evenly',
      say: 'Traders spent ninety one million on Nvidia options. *Twenty million on AMD.*',
      ask: 'That is where the attention is.',
      cv: {
        kind: 'duel',
        a: { sym: 'NVDA', name: 'SPENT ON OPTIONS', value: '$91.9M', note: 'in one session' },
        b: { sym: 'AMD', name: 'SPENT ON OPTIONS', value: '$20.7M', note: 'in one session' },
        mark: 'a',
      },
    },
    {
      role: 'evidence', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/chip-underside.mp4', loopFrames: 151 },
      eyebrow: 'Zoom out a month',
      head: 'Today was noise.\nThis is the trend.',
      say: 'Step back one month. Nvidia is up. *AMD is down almost nine percent.*',
      ask: 'One green day did not fix that.',
      cv: {
        kind: 'duel',
        a: { sym: 'NVDA', name: 'LAST 20 SESSIONS', value: '+5.45%', note: 'still climbing' },
        b: { sym: 'AMD', name: 'LAST 20 SESSIONS', value: '-8.73%', note: 'still falling' },
        mark: 'b',
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/columns-goldenhour.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM READ',
      head: 'Green is not\nthe same as strong',
      say: 'So here is the takeaway. *Do not stop at the plus sign.* Where it finishes inside its day tells you more.',
      cv: {
        kind: 'punch', value: '79 / 19', label: 'WHERE THEY FINISHED',
        sub: 'Same green day. Two different stories.', sym: 'NVDA',
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'We read the option book so you do not have to',
    ask: 'Which one would you\nrather hold? Tell us below.',
  },
};

// ============================================================================
// ??B ??A/B ?�험 ??본문·??��?� «?�전???�일», ?�만 ?�르??// ----------------------------------------------------------------------------
// ?�왜??2026-08-13 ?�측: 모바??108명이 34�??�상??«?�균 13초�?38%) 봤다.
//   기�?치는 70% ?�상. 그리�?132???�출 �??�효??~28??21%) ??79%가 즉시 ?��??�프.
//   (그동?�의 ?�평�?0:47?��? PC 6명의 반복 ?�생??만든 ?�수?�?????�청?�간??76.7%)
//
// ?�A?�이 무엇???�못?�나 ???�유??�?4�??�측??//   · 1.1~1.8�?«?�전 무음» (????�� 1.5초인???�퀀?��? 3.0�?고정)
//   · 0·0.4·0.8·1.2�??�레?�이 «?�실???�일» ??�?컷이 1.6�?//   · ?�목(Oil Spiked 5%)�?�??�면(THE RALLY JUST BLINKED)??«?�른 말�?//   · ?�두??�??�레??· ?�스??3블록
//
// ?�B?�이 바꾸??�????�직 ?��?//   ??hookTight ??무음 0, �?컷이 ??�� ?�에 바로 붙는??//   ???�스??3블록 ??2블록 (sub ?�거)
//   ???�목 = �??�면 문구 «?�전???�일»
//   ??배경???�이브러리에??가???�극?�인 ?�립?�로 (rams-vs-block)
//   ????문장??«짧�? 2문장»?�로 ???�정 구간???�리�?채운??//
// ?�판?��?조회?��? ?�니??**?�청??참여????계속 ?�청 %**.
//   지�?16.9% ??35% ?�으�?B 채택. ????25% 미만?�면 ?�이 ?�니???�용·?�어가 문제.
// ?�️ ?�성 ?�일?� duel813 ?�더�?그�?�??�다(본문 ?�일 보장). ?�만 ?�로 굽는??
// ============================================================================
export const SCRIPT_DUELB: CasualProps = {
  ...SCRIPT_DUEL813,
  voice: VOICE_DUELB,
  hookTight: true,
  title: 'AMD closed green\nand still lost.',
  hook: {
    line: 'AMD closed green\nand still lost.',
    sub: '',                                   // ???�스??블록 ?�나�??�어?�다
    bigNum: '19%',
    stamp: 'AUG 12',
    syms: ['AMD', 'NVDA'],
    bg: { kind: 'video', src: 'shorts/bg/video/rams-vs-block.mp4', loopFrames: 300 },
  },
};

// ============================================================================
// ??개장 ??브리????2026-08-13 ET 08:03 (개장 87�???
// ----------------------------------------------------------------------------
// ?�이 ?�이 ???�션??«모든 ?�습»???�용???�본?�다??//   · hookTight ????무음 0 (?�유??1.7�?무음 ???�효조회 16%??주범)
//   · ?�목 = �??�면 문구 «??글?�도 ?�르지 ?�게»
//   · ???�스??2블록 (sub ?�거)
//   · 강한 모션 배경 (?�압 ??+ 불꽃)
//   · ?�을 먼�? 말하�??�자???�면??(?�석?�기 ?�어?�다 ?�칙)
//   · ??문장 ??2?????�막 카드가 문장 경계?�서�??�긴??//   · 주제 번호 · ?�광??강조 · ?��? ?�도 CTA
//
// ?�숫??출처 ???��? ?�측??//  ???�리 ?�진 (app-view/dash 캡처, ET 08:03 ?�시�?:
//      SQUEEZE RISK  Extreme 70%   ???�제 High 65% ?�서 «?�급» ?�향
//      DARK POOL     55.3%         ??8/11 42.7% ??8/12 54.1% ??8/13 55.3% (3???�속)
//      RISK 64 (?�제 63) · ROTATION 96
//  ???�제 종�? (Polygon ?�측?? 캡처?� ?��? ?�치):
//      MSFT -2.26% $492.43 · AAPL -0.87% $302.25
//      NVDA +3.03% $224.09 · SOXX +2.32% $546.61 · SPY +0.25% $772.49
//
// ?�기각한 것�?//  · SOX 지??+2.49%) ???�리 ?�리�??�랜?�로 지??검�?불�? ??검증되??SOXX �??��?//  · ?�리마켓 개별가 ???�측???�단???�어 ?�면???��? ?�는??(?�물??마찬가지)
//  · TOP MOVERS ??마이??종목 ?�주???��? ?�는??(?�??지??2026-08-12)
// ============================================================================
export const SCRIPT_PRE813: CasualProps = {
  voice: VOICE_PRE813,
  track: 'macro',
  hookTight: true,
  title: 'Squeeze pressure\njust hit extreme.',
  date: 'AUG 13 · BEFORE THE OPEN',
  data: { seed: 'PRE813' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  hook: {
    line: 'Squeeze pressure\njust hit extreme.',
    sub: '',
    bigNum: '70%',
    stamp: 'AUG 13',
    bg: { kind: 'video', src: 'shorts/bg/video/rams-vs-block.mp4', loopFrames: 300 },
  },
  loop: 'The board looks calm.\nThe pressure under it is not.',

  beats: [
    {
      role: 'conflict', prio: 1,
      // wafer-press ???��???맞�?�??�무 ?�둡??밝기 103까�? ?�어?�림). crack-star ??      // «무언가 깨졌?��????�급 변?��???맞고 ?�색 면이??밝다.
      bg: { kind: 'video', src: 'shorts/bg/video/crack-star.mp4', loopFrames: 151 },
      eyebrow: 'Our squeeze gauge',
      head: 'It changed grade.\nNot just a number.',
      // ⚠️ 한 문장 ≤45자 — 53자였을 때 「Our squeeze gauge went / from high to…」로 끊겼다
      say: 'Our gauge went from high to extreme. *That is a grade change.*',
      ask: 'It reads how loaded the short side is.',
      cv: {
        kind: 'punch', value: '70%', label: 'SIGNUM SQUEEZE RISK · LIVE',
        sub: 'Yesterday it read High, at 65%',
      },
    },
    {
      // ★★ 우리만 보여줄 수 있는 층 — 공개 시세로는 안 보인다
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/undercurrent-pull.mp4', loopFrames: 300 },
      eyebrow: 'Money is hiding',
      head: 'Three days.\nThree steps up.',
      // ⚠️ 50자면 3줄이 된다 — 26자/줄 기준으로 «한 문장 ≤45자»가 안전선
      say: 'Tuesday, hidden volume was forty three percent. *Today it is fifty five.*',
      ask: 'It has climbed every single day.',
      // rows ??Briefing 계열?�라 `visual` ?�롯?�다 (`cv` ??캐주???�용 4�?
      visual: {
        kind: 'rows',
        rows: [
          { k: 'AUG 11', v: '42.7%', up: false, sym: 'RISK' },
          { k: 'AUG 12', v: '54.1%', up: true, sym: 'RISK' },
          { k: 'TODAY', v: '55.3%', up: true, sym: 'RISK' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/paper-crowd.mp4', loopFrames: 180 },
      eyebrow: 'The split nobody names',
      head: 'Big tech fell.\nThe index still rose.',
      say: 'Microsoft fell over two percent. Apple fell too. *The index still closed green.*',
      ask: 'So something else carried it.',
      cv: {
        kind: 'duel',
        a: { sym: 'MSFT', name: 'BIGGEST NAMES FELL', value: '-2.26%', note: 'Microsoft' },
        b: { sym: 'SPY', name: 'INDEX STILL ROSE', value: '+0.25%', note: 'S&P 500' },
        mark: 'none',
      },
    },
    {
      role: 'chips', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/chip-macro-grey.mp4', loopFrames: 120 },
      eyebrow: 'What carried it',
      head: 'One shelf did\nall the lifting.',
      say: 'Nvidia rose three percent. Chips rose two. *Everything else leaned on them.*',
      ask: 'That is a very narrow market.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'NVDA', v: '+3.03%', up: true, sym: 'NVDA' },
          { k: 'SOXX', v: '+2.32%', up: true, sym: 'SEMIS' },
          { k: 'MSFT', v: '-2.26%', up: false, sym: 'MSFT' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/columns-goldenhour.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM READ',
      head: 'Calm tape.\nLoaded spring.',
      say: 'So here is our read. *The tape looks calm.* The pressure under it does not.',
      cv: {
        kind: 'punch', value: '55.3%', label: 'HIDDEN VOLUME · THIRD DAY UP',
        sub: 'Squeeze extreme · rotation running at 96',
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'We read the hidden tape so you do not have to',
    ask: 'What are you watching\nat the open? Tell us.',
  },
};

// ============================================================================
// ???�짐 브리????2026-08-13 ET 12:00 ?�중 (?��?�??�장??뭐냐?�에 ?�하???�랙)
// ----------------------------------------------------------------------------
// ?�??지??2026-08-13): "?�스 ?�짐 매크�?분석??매우 ?�요?�다. ?�람?��? 지�??�장
//   ?�황???�고 ?�어?�다. ?�리 ?�원�??�의 ?�찰???�어가???�다.
//   ?�람?��? 고�??�기 ?�어?�고 ?�먹??주는 것을 좋아?�다."
//
// ?�처???�는 ?�원 ??GUARDIAN 중력 게이지??//   지금까지 dash(?�크?�·?�퀴즈)?� cmd(?�션�?�??�다. guardian ?� «매크�??�짐»
//   ?�용 ?�면?�데 ??번도 ???�다. 5�??�수가 ?�나???�야기�? 만든??
//
// ?�숫??출처 ???�리 ?�진, ET 12:00 ?�중 ?�시간�?//   GRAVITY GAUGE : MOMENTUM 90 · PARTICIPATION 59 · PRICE TREND 90
//                   ROTATION 100 · SENTIMENT 65  (Bullish ×4)
//   ??교차 검�? dash ??ROTATION INTENSITY ??«Rotation 100» ?????�면???�치.
//     그리�?dash ??방향까�? 준?? **Defensive Tilt** (개장 ?�엔 Neutral Tilt)
//   MARKET STATE  : 개장 ??Risk-On Tilt ???�중 **Mixed Tape**
//   RLSI 52 (개장 ??47) · F&G 65 GREED · VIX 14.7
//
// ?�통�????�게 ???�의 값이?��?//   5�?�?4축이 Robust/Healthy �??�라갔는??**참여?�만 59** ??
//   그리�?로테?�션?� 100(최�?)?�데 방향??**방어**??
//   ???��?격�? ?�르?�데 ???�이 ?�어?�는 �??�니?? ?�던 ?�이 방어�??�리�???��??것이????//   ?�자 5개�? ?��?�??�석??맡기지 ?�는?? ?�을 말해준??
//
// ?�기각�??�물 ?�치(NDX +0.94% ?? ???�측???�단???�어 ?�면?????�다.
// ============================================================================
export const SCRIPT_REGIME813: CasualProps = {
  voice: VOICE_REGIME813,
  track: 'macro',
  hookTight: true,
  title: 'Rotation maxed out.\nAnd it went defensive.',
  date: 'AUG 13 · MID-SESSION',
  data: { seed: 'REGIME813' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  hook: {
    line: 'Rotation maxed out.\nAnd it went defensive.',
    sub: '',
    bigNum: '100',
    stamp: 'AUG 13',
    bg: { kind: 'video', src: 'shorts/bg/video/paper-crowd.mp4', loopFrames: 180 },
  },
  loop: 'Money is moving fast.\nJust not into risk.',

  beats: [
    {
      role: 'money', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/datacenter-aisle.mp4', loopFrames: 180 },
      eyebrow: 'What just maxed',
      head: 'Money is moving\nat full speed.',
      say: 'Our rotation gauge just hit one hundred.',
      ask: 'And it is pointing defensive.',
      cv: {
        kind: 'punch', value: '100', label: 'SIGNUM ROTATION · LIVE',
        sub: 'Top of the scale ??reading defensive',
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/fiber-one-lit.mp4', loopFrames: 151 },
      eyebrow: 'Four soared, one did not',
      head: 'The crowd did not\ncome with it.',
      say: 'Momentum ninety. Price trend ninety. *Participation, fifty nine.*',
      ask: 'Rising prices, but not more buyers.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'MOMENTUM', v: '90', up: true, sym: 'RISK' },
          { k: 'PRICE TREND', v: '90', up: true, sym: 'RISK' },
          { k: 'PARTICIPATION', v: '59', up: false, sym: 'RISK' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/vault-doors.mp4', loopFrames: 151 },
      eyebrow: 'SIGNUM READ',
      head: 'Same money.\nNew seats.',
      say: 'So this is not new money arriving. *It is the same money changing seats.*',
      cv: {
        kind: 'punch', value: '59', label: 'PARTICIPATION · THE ONE THAT STALLED',
        sub: 'Four gauges robust. This one stable.',
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'We read the regime so you do not have to',
    ask: 'Risk-on or defensive?\nWhat do you see?',
  },
};

// ============================================================================
// ??개장 ??브리????2026-08-14 ET 06:27 (??5�?규칙 1??
// ----------------------------------------------------------------------------
// ?�Studio ?�측?�서 ?�온 5�?규칙 ??2026-08-14 ?�정??//   ???�목 첫머리에 «검?�되?��?종목�?   ??`amd stock` ?�입 ?�측
//   ???�에 추상 지??금�? (rotation·squeeze) ??59.5% vs 21.6% (2.75�?
//   ???�웃?�로???�구?��?명시             ???�환 0.26% (387조회??+1)
//   ???�그 1?�위 `<종목> stock` ?�태
//   ???�작?��? ?�기 ?�상??보�? ?�는??    ??채널?�이지 13.4% ?�염
//
//   ?�의 근거: 같�? ?�·같?� 문법·같�? 길이·모바??86%?????�에??//     `Both Chips Closed Green`(구체) ?�주??59.5%
//     `Rotation Maxed Out`(추상)   ?�주??21.6%  ??19�?�??�균 4초만 �?//   ???�리 고유 지?�는 «본문??근거»로만 ?�다. ?��? 종목·?�자�??�다.
//
// ?�숫??출처 ???��? ?�측??//  ??Polygon 3???�익�?(8/10 종�? ??8/13 종�?):
//      SNDK +23.44%  MU +10.32%  NVDA +3.56%  TSM +2.87%  AVGO -1.08%
//      (8/13 종�?: SNDK $1,528.11 +13.67% · MU $949.83 +4.23% · NVDA $225.30 +0.54%)
//  ???�리 ?�진 ?�퀴즈 3??(캡처 3�?:
//      8/12 High 65% ??8/13 Extreme 70% ??8/14 Extreme 75%
//
// ?�기각�??�리마켓 개별가(MU $974.20 ?? ???�측???�단???�어 ?�면?????�다.
// ============================================================================
export const SCRIPT_PRE814: CasualProps = {
  voice: VOICE_PRE814,
  track: 'stock',
  hookTight: true,
  title: 'SanDisk ran 23%.\nNvidia barely moved.',
  date: 'AUG 14 · BEFORE THE OPEN',
  data: { seed: 'PRE814' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  hook: {
    line: 'SanDisk ran 23%.\nNvidia barely moved.',
    sub: '',
    bigNum: '23%',
    stamp: 'AUG 14',
    syms: ['SNDK', 'NVDA'],
    bg: { kind: 'video', src: 'shorts/bg/video/rocket-ignition.mp4', loopFrames: 151 },
  },
  loop: 'Memory is squeezing.\nThe rest of the shelf is not.',

  beats: [
    {
      role: 'chips', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/chip-underside.mp4', loopFrames: 151 },
      eyebrow: 'Memory went vertical',
      head: 'Three days.\nTwenty three percent.',
      say: 'SanDisk ran twenty three percent in three days. *Micron ten.*',
      ask: 'That is memory, not chips in general.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'SNDK', v: '+23.4%', up: true, sym: 'SNDK', note: '3 sessions' },
          { k: 'MU', v: '+10.3%', up: true, sym: 'MU', note: '3 sessions' },
        ],
      },
    },
    {
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/fiber-one-lit.mp4', loopFrames: 151 },
      eyebrow: 'The rest did not move',
      head: 'Nvidia sat still.\nBroadcom went red.',
      say: 'Over the same three days Nvidia added three. *Broadcom lost one.*',
      ask: 'Same sector, completely different tape.',
      visual: {
        kind: 'rows',
        rows: [
          { k: 'NVDA', v: '+3.6%', up: true, sym: 'NVDA' },
          { k: 'TSM', v: '+2.9%', up: true, sym: 'TSM' },
          { k: 'AVGO', v: '-1.1%', up: false, sym: 'AVGO' },
        ],
      },
    },
    {
      // ???�리 지?�는 «?�기»???�다 ???�이 ?�니??근거 ?�리 (규칙 ??
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/rams-vs-block.mp4', loopFrames: 300 },
      eyebrow: 'SIGNUM READ',
      head: 'A squeeze, not\na sector move.',
      say: 'Our squeeze gauge climbed three days straight. *Sixty five, seventy, seventy five.*',
      cv: {
        kind: 'punch', value: '75%', label: 'SIGNUM SQUEEZE RISK · EXTREME',
        sub: 'Third straight day higher',
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'Options flow and dark pool, every morning',
    ask: 'Subscribe for the\nmorning read.',   // ← 규칙 ③ (구독 명시)
  },
};

// ============================================================================
// ??교육????맥스?�인??뭔�? (?�짜 무�? «?�고» ?�산)
// ----------------------------------------------------------------------------
// ???�걸 먼�? 만드?? ?�스??48?�간?�면 ?�입???�긴?? 교육?� «검?�»으�?계속 ?�어?�다.
// "what is max pain in options" ??매일 검?�되??질문?�다.
// 그리�??�리 ???�면??�?개념??«증거»가 ?�다 ??교육?�면???�품 ?�모??
//
// ?�숫??출처??2026-08-12 종�? 기�?, ?�리 ?�진 캡처 + Polygon 종�?
//   NVDA 맥스?�인 $213 · 종�? $224.09 ??�?+5.45%   (???�기 +5.45%?� ?�치)
//   AMD  맥스?�인 $480 · 종�? $482.93 ??�?+0.61%   (???�기 +0.61%?� ?�치)
//
// ?�의?�적?�로 ?��? 것�?§5 "?�측???�니?? ???�부분의 채널??맥스?�인??«가�?목표»�?//   말한?? 그건 ?�?�고, ?�?�다�?말하??�??�체가 ?�리 ?�뢰??근거가 ?�다.
// ============================================================================
export const SCRIPT_MAXPAIN: CasualProps = {
  voice: VOICE_MAXPAIN,
  track: 'edu',
  title: 'Why your option\nexpired worthless.',
  date: 'OPTIONS BASICS',
  data: { seed: 'MAXPAIN' },
  disclaimer: 'Educational only · Not investment advice · Our read, not a forecast',
  hook: {
    line: 'Every option chain has\none price like this.',
    // ?�️ sub ??bigNum �?«?�른 말»을 ?�야 ?�다. ?�판?� ?????�max pain?�이??    //    같�? ?�보�???�??�다 ??????칸을 버린 ??
    sub: 'Most traders read it backwards.',
    bigNum: 'MAX PAIN',
    stamp: 'OPTIONS BASICS',
    bg: { kind: 'video', src: 'shorts/bg/video/fiber-one-lit.mp4', loopFrames: 151 },
  },
  loop: 'Max pain shows where the pull is.\nNot where price goes.',

  beats: [
    {
      role: 'evidence', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/pcb-one-chip-lit.mp4', loopFrames: 151 },
      eyebrow: 'The idea',
      head: 'The price that costs\noption sellers the least',
      say: 'Picture every option as a bet waiting to be paid. *Now find the price that pays out the least.*',
      ask: 'That one price has a name.',
      cv: {
        kind: 'steps',
        items: [
          { n: '1', t: 'Every option is a bet with a payout' },
          { n: '2', t: 'Add up all payouts at each price' },
          { n: '3', t: 'Find where the total is smallest' },
        ],
      },
    },
    {
      role: 'depth', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/quantum-fridge.mp4', loopFrames: 151 },
      eyebrow: 'It is called max pain',
      head: 'Nvidia, yesterday',
      say: 'It is called max pain. It hurts option buyers most. *For Nvidia it was two thirteen.*',
      ask: 'The stock finished eleven dollars above it.',
      cv: {
        kind: 'punch', value: '$213', label: 'NVDA MAX PAIN · AUG 12',
        sub: 'Stock finished at $224.09 ??5.4% above it', sym: 'NVDA',
      },
    },
    {
      role: 'money', prio: 2,
      // ?�옵?�을 ???�?�들?�이 주어?��?�?기�? 건물. (scale-few-vs-many ??강철 구슬�?      // ?��? 기각 ??DUEL813 �?같�? ?�유)
      bg: { kind: 'video', src: 'shorts/bg/video/fed-building.mp4', loopFrames: 180 },
      eyebrow: 'Why it moves anything',
      head: 'Think of it as\ngravity, not a target',
      say: 'The sellers have to protect themselves. *That protection quietly tugs price toward it.*',
      ask: 'It is a tug. Not a rule.',
      cv: {
        kind: 'steps',
        items: [
          { n: '→', t: 'Sellers must protect themselves' },
          { n: '→', t: 'Protecting tugs price toward max pain' },
          { n: '→', t: 'The tug is strongest near expiry' },
        ],
      },
    },
    {
      role: 'conflict', prio: 2,
      bg: { kind: 'video', src: 'shorts/bg/video/paper-crowd.mp4', loopFrames: 180 },
      eyebrow: 'Two names, same day',
      head: 'One was stuck to it.\nOne was free of it.',
      say: 'AMD was sitting almost exactly on its max pain. *Nvidia was nowhere near it.*',
      ask: 'So the tug did very different things.',
      cv: {
        kind: 'duel',
        a: { sym: 'NVDA', name: 'BARELY FEELS IT', value: '5.4%', note: 'away from max pain' },
        b: { sym: 'AMD', name: 'STUCK TO IT', value: '0.6%', note: 'away from max pain' },
        mark: 'b',
      },
    },
    {
      // ????비트가 ???�상??«차별?�»이?? ?�부분의 채널???�기???��?말을 ?�다.
      role: 'conflict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/crack-star.mp4', loopFrames: 151 },
      eyebrow: 'What it is NOT',
      head: 'Almost everyone\ngets this part wrong',
      say: 'Now the part almost everyone gets wrong. *It does not tell you where price is going.* It changes every day.',
      ask: 'It is a reading, not a destination.',
      cv: {
        kind: 'steps',
        items: [
          { n: '✕', t: 'Not a price target' },
          { n: '✕', t: 'Not a forecast for tomorrow' },
          { n: '✓', t: 'A daily reading of where the tug is' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/columns-birds.mp4', loopFrames: 180 },
      eyebrow: 'SIGNUM READ',
      head: 'Far away, ignore it.\nSitting on it, watch it.',
      say: 'So use it like this. Far from it, the tug barely matters. *Sitting on it, expect price to stay sticky.*',
      cv: {
        kind: 'meter', label: 'AMD ??HOW STUCK IT WAS', value: 11, display: '0.6%',
        zones: ['STUCK', 'DRIFTING', 'FREE'],
      },
    },
  ],

  outro: {
    app: 'SIGNUM HQ',
    line: 'We read the option book so you do not have to',
    ask: 'What should we explain\nnext? Drop it below.',
  },
};

// ============================================================================
// ??A/B ?�조판 ??같�? ?�본·같?� ??��??«캐주?��??�플릿에 그�?�?꽂는??// ----------------------------------------------------------------------------
// 목적: ?�플릿만???�과�?분리?�서 본다. ?�용·?�성·길이가 ?�일?��?�?//       ???�상??차이??«?�플�?100%»?? TTS 추�? 비용 0.
// 조립?� Root.tsx ?�서 ?�다 (?�환 import ?�피 ???�일 머리 주석 참조).
// ============================================================================

