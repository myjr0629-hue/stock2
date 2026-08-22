// ============================================================================
// scripts-longform — 롱폼(8분) 대본  ★ 2판 (2026-08-22 재작성)
// ----------------------------------------------------------------------------
// ⛔ 1판이 왜 딱딱했나 — 측정된 원인 (scripts/_script-compare.mjs)
//
//   | 항목            | MonkeyExplains 99.6만 | 1판  | 2판 목표 |
//   |-----------------|----------------------|------|---------|
//   | 축약형          | 5.13/분              | 0.00 | 4~6     |
//   | 캐릭터 대명사   | 3.33/분              | 0.00 | 2+      |
//   | 물음표          | 1.41/분              | 0.27 | 1.3~1.6 |
//   | 평균 문장       | 13.7단어             | 7.4  | 11~14   |
//   | 3음절+ 어려운말 | 12.7%                | 6.3  | 13 이하 |
//
//   ⛔ 축약형 0 의 진짜 원인: 아포스트로피가 bash 히어독을 깨뜨려서 «의도적으로 피했다».
//     도구의 제약이 창작물을 오염시켰다. 이 파일은 Write 로만 쓴다 — 히어독 금지.
//
// ★ 차용한 골격 (.agent/LONGFORM_RESEARCH.md)
//   경제사냥꾼: 콜드오픈 → 인사 0:35 → 「딱 세 가지」 → 중간반전 → 예외 → 리스크
//               → 「볼 것 3개」 → 면책 → 댓글을 다음 소재로
//   MonkeyExplains: 대리인 캐릭터를 «따라간다» (Charlie) → 우리는 Sam
//   제목: 「~ Is Worse Than You Think」 = 채널크기 통제 후 1.57배
//
// ★ 우리 색 — 남이 «분위기»로 하는 것을 우리는 «세어서» 한다
//   사전등록 · 표본크기 병기 · 「증명 못 한 것」 구간 · 판단 보류의 명시
//
// ★ 데이터 (scripts/edge-earnings.mjs 사전등록 후 계산 · .agent/_edge_earnings.json)
//   10종목 228회 · 2021-01-01~2026-08-20 · 실적 다음 거래일 종가 수익률
//   폭   6.39% vs 평상 1.85% = 3.45배 · 10/10 종목 · 부호검정 p=0.00195
//   방향 108/228 = 47.4% · z=-0.79 → 동전과 «구분되지 않는다»
//   NVDA 22회 · 6.20% vs 2.31% = 2.69배 · 상승 11/22 = 정확히 50.0%
//   AVGO 16/22 = 72.7% (유일한 쏠림) · META 6.11배(최대) · AAPL 2.39배(최소)
//
// ⛔ 「방향은 랜덤이다」로 쓰지 않는다. z=-0.79 는 «동전과 구분 안 됨»이지 «랜덤 증명»이 아니다.
// ⛔ 매수·매도 권유 금지.
//
// ★ 배경 — 지금은 «있는 클립»으로 렌더한다. ax- 는 발주 중인 ani 16:9 클립이고
//   (references/clip-briefs-169.md) 도착하면 각 비트의 // ax: 주석대로 갈아끼운다.
// ============================================================================
import type { BriefingProps } from './Briefing';
import { VOICE_LFEARN } from './voice-lfearn';

const V = (src: string) =>
  ({ kind: 'video', src: `shorts/bg/video/${src}`, loopFrames: 150 }) as const;

export const SCRIPT_LFEARN: BriefingProps = {
  title: 'The earnings trade is\nworse than you think.',
  date: 'AUG 26 · EARNINGS',
  longform: true,
  slowCuts: true,
  noOutro: true,

  hook: {
    line: 'Everyone calls\nthe direction.',
    sub: 'We counted 228 of them.',
    say: 'Meet Sam. On Tuesday night, Sam has a decision to make.',
    role: 'conflict',
    syms: ['NVDA'],
    bg: V('pcb-traces-glow.mp4'),   // ax: ax-lean-in
  },
  loop: 'The size is knowable.\nThe direction is not.',

  beats: [
    // ── 01 콜드 오픈 · Sam 을 따라간다 ───────────────────────────────────────
    {
      role: 'conflict', prio: 1, bg: V('nyse-flags.mp4'),   // ax: ax-calendar-grid
      eyebrow: 'Tuesday night',
      head: 'Nvidia reports\nafter the bell',
      say: 'Nvidia reports after the bell, and Sam wants in before it does.',
      ask: 'So they do what everyone does. They go looking for an answer.',
      visual: { kind: 'rows', rows: [
        { k: 'Report date', v: 'Aug 26', up: true, note: 'after the closing bell' },
        { k: 'Consensus EPS', v: '$2.09', up: true, note: 'what the street expects' },
        { k: 'Consensus revenue', v: '$92.0B', up: true, note: 'same' },
      ] },
    },
    {
      role: 'conflict', prio: 1, bg: V('tape-wall-scroll.mp4'),   // ax: ax-crowd-of-copies
      eyebrow: 'And there is no shortage',
      head: 'Everybody already\nhas a take',
      say: "And there's no shortage of takes. Everybody already has one.",
      ask: "Half of them say it rips. The other half say it's priced in.",
      visual: { kind: 'stat', label: 'WHAT SAM FINDS', value: 'TWO CAMPS',
        sub: 'confident, loud, and pointing opposite ways', up: false },
    },
    {
      role: 'conflict', prio: 1, bg: V('desks-dawn.mp4'),   // ax: ax-double-take
      eyebrow: 'Then Sam notices',
      head: 'Nobody ever\nchecks back',
      say: 'Then Sam notices something. Nobody ever checks back.',
      ask: 'The calls get made. Nobody counts how they turned out.',
      visual: { kind: 'stat', label: 'WHAT IS MISSING', value: 'THE SCORECARD',
        sub: 'the calls are loud, the follow-up is silent', up: false },
    },
    {
      role: 'conflict', prio: 1, bg: V('exchange-storm.mp4'),   // ax: ax-ledger-open
      eyebrow: 'So we did',
      head: 'So we went\nand counted',
      say: 'So we went and counted. Every earnings print since 2021.',
      ask: 'This is SIGNUM, and counting is basically the whole channel.',
      visual: { kind: 'stat', label: 'HOW WE WORK', value: 'COUNT FIRST',
        sub: 'the test gets written down before the data gets pulled', up: true },
    },
    {
      role: 'conflict', prio: 1, bg: V('golden-bell.mp4'),   // ax: ax-clipboard-check
      eyebrow: 'Three things',
      head: 'Three things,\nthen one number',
      say: "Here's what you're getting. Three things, then one number.",
      ask: 'And that last number is one you can check yourself on Wednesday.',
      visual: { kind: 'rows', rows: [
        { k: 'One', v: 'The size', up: true, note: 'how far it moves' },
        { k: 'Two', v: 'The direction', up: false, note: 'which way it goes' },
        { k: 'Three', v: 'The exceptions', up: true, note: 'the names that break it' },
      ] },
    },
    {
      role: 'conflict', prio: 1, bg: V('scale-few-vs-many.mp4'),   // ax: ax-two-doors
      eyebrow: 'The split',
      head: 'Two questions\nhiding in one',
      say: 'Because there are really two questions hiding inside that one.',
      ask: 'How far does it move? And which way does it go?',
      visual: { kind: 'versus', aK: 'How far', aV: 'SIZE', bK: 'Which way', bV: 'DIRECTION' },
    },
    {
      role: 'conflict', prio: 1, bg: V('steel-spheres.mp4'),   // ax: ax-shrug-both
      eyebrow: 'Spoiler',
      head: 'One of them\nis answerable',
      say: "One of those is answerable. The other one really isn't.",
      ask: "And the market charges you for both like they're the same thing.",
      visual: { kind: 'stat', label: 'THE SPLIT', value: 'ONE OF TWO',
        sub: "and the answerable half isn't the profitable one", up: false },
    },

    // ── 02 정의 · 비유 ──────────────────────────────────────────────────────
    {
      role: 'evidence', prio: 1, bg: V('geo-radar-dusk.mp4'),   // ax: ax-storm-window
      eyebrow: 'A quick picture',
      head: 'A storm warning\nis a good model',
      say: "Think about a storm warning for a second. It's a good model.",
      ask: "The forecast tells you it will be bad. It's usually right.",
      visual: { kind: 'versus', aK: 'Forecast gets', aV: 'SEVERITY', bK: 'Nobody gets', bV: 'THE STRIKE' },
    },
    {
      role: 'evidence', prio: 1, bg: V('temple-storm.mp4'),   // ax: ax-umbrella-wait
      eyebrow: 'But not that',
      head: "It can't tell you\nwhere lightning lands",
      say: "What it can't tell you is which street the lightning hits.",
      ask: 'Earnings are exactly that shape, and the market knows it.',
      visual: { kind: 'stat', label: 'WHAT GETS SOLD TO YOU', value: 'SEVERITY',
        sub: "the strike isn't for sale, because nobody has it", up: false },
    },
    {
      role: 'evidence', prio: 1, bg: V('paper-crowd.mp4'),   // ax: ax-podium-empty
      eyebrow: 'One word first',
      head: 'Consensus is not\na prediction',
      say: 'One word first, because everything hangs on it. Consensus.',
      ask: "It sounds like a prediction. It's closer to a poll of analysts.",
      visual: { kind: 'stat', label: 'CONSENSUS', value: 'A POLL',
        sub: 'the average of whoever chose to publish a number', up: true },
    },
    {
      role: 'evidence', prio: 1, bg: V('glass-tube-array.mp4'),   // ax: ax-price-tag
      eyebrow: 'And here is the catch',
      head: 'The stock is already\nbought at that poll',
      say: "And here's the catch. The stock is already bought at that poll.",
      ask: "So beating it doesn't mean the quarter was good. Think about that.",
      visual: { kind: 'stat', label: 'WHAT A BEAT ACTUALLY MEANS', value: 'THE POLL WAS LOW',
        sub: 'not that the business had a strong quarter', up: false },
    },

    // ── 03 세는 과정 ────────────────────────────────────────────────────────
    {
      role: 'evidence', prio: 1, bg: V('server-assembly.mp4'),   // ax: ax-two-piles
      eyebrow: 'What we took',
      head: 'Ten names\npeople actually own',
      say: 'We took ten names people actually own, not a clever screen.',
      ask: 'Nvidia, AMD, Micron, Broadcom, Apple, and five more like them.',
      visual: { kind: 'rows', rows: [
        { k: 'Chips', v: 'NVDA AMD MU AVGO', up: true, note: 'four' },
        { k: 'Platforms', v: 'AAPL MSFT GOOGL', up: true, note: 'three' },
        { k: 'The rest', v: 'AMZN META TSLA', up: true, note: 'three' },
      ] },
    },
    {
      role: 'evidence', prio: 1, bg: V('chip-city.mp4'),   // ax: ax-long-corridor-count
      eyebrow: 'How many',
      head: 'Two hundred\ntwenty eight prints',
      say: "Every print since January 2021. That's 228 of them.",
      ask: "We didn't drop the ugly ones. That's the whole point.",
      visual: { kind: 'rows', rows: [
        { k: 'From', v: '2021-01-01', up: true, note: 'fixed before we looked' },
        { k: 'To', v: '2026-08-20', up: true, note: 'last full session' },
        { k: 'Prints', v: '228', up: true, note: 'all of them, nothing dropped' },
      ] },
    },
    {
      role: 'evidence', prio: 1, bg: V('datacenter-aisle.mp4'),   // ax: ax-measure-tape
      eyebrow: 'What we measured',
      head: 'Close to close,\nthe next session',
      say: 'We measured the close to close move on the session after.',
      ask: 'Not the after hours spike. The day the whole market gets a vote.',
      visual: { kind: 'stat', label: 'WHAT WE MEASURED', value: 'NEXT CLOSE',
        sub: 'the session everybody can actually trade', up: true },
    },
    {
      role: 'evidence', prio: 1, bg: V('vault-doors.mp4'),   // ax: ax-notebook-write
      eyebrow: 'And this part matters',
      head: 'We wrote the test\ndown first',
      say: 'And this part matters more than it sounds. We wrote it down first.',
      ask: 'Names, window, definition, test. All fixed before we ran anything.',
      visual: { kind: 'rows', rows: [
        { k: 'Fixed first', v: 'the names', up: true, note: 'no adding winners later' },
        { k: 'Fixed first', v: 'the window', up: true, note: 'no moving the start date' },
        { k: 'Fixed first', v: 'the test', up: true, note: 'a Welch t and a binomial' },
      ] },
    },
    {
      role: 'evidence', prio: 1, bg: V('mirror-city.mp4'),   // ax: ax-magnifier
      eyebrow: 'Why bother',
      head: 'Any number moves\nif you pick after',
      say: 'Why bother? Because any number moves if you pick the years after.',
      ask: "Choose the window once you've seen the answer and you've nothing.",
      visual: { kind: 'stat', label: 'THE RULE WE PUT ON OURSELVES', value: 'DECIDE FIRST',
        sub: "the sample can't be edited by the result", up: true },
    },

    // ── 04 폭은 진짜다 ──────────────────────────────────────────────────────
    {
      role: 'money', prio: 1, bg: V('euv-plasma-a.mp4'),   // ax: ax-stack-blocks
      eyebrow: 'The size',
      head: 'Six point three\nnine percent',
      say: "So here's what came back. The day after averages 6.4 percent.",
      ask: "That's the move itself, whichever way it went.",
      visual: { kind: 'stat', label: 'AVERAGE MOVE - EARNINGS DAY', value: '6.39%',
        sub: 'across 228 prints', up: true },
    },
    {
      role: 'money', prio: 1, bg: V('calm-sea-dawn.mp4'),   // ax: ax-scale-watch
      eyebrow: 'And a normal day',
      head: 'A normal day\nis one point eight',
      say: 'A normal day for those same names? One point eight five.',
      ask: 'Same stocks, same years. Wildly different afternoon.',
      visual: { kind: 'versus', aK: 'Normal day', aV: '1.85%', bK: 'Earnings day', bV: '6.39%' },
    },
    {
      role: 'money', prio: 1, bg: V('steel-balls.mp4'),   // ax: ax-tiny-vs-huge
      eyebrow: 'Which is',
      head: 'Three and a half\ntimes bigger',
      say: "Three and a half times bigger. That's not a rounding error.",
      ask: "And it's not one weird stock dragging the average around.",
      visual: { kind: 'stat', label: 'EARNINGS DAY vs NORMAL DAY', value: '3.45x',
        sub: "the size isn't subtle", up: true },
    },
    {
      role: 'money', prio: 1, bg: V('columns-goldenhour.mp4'),   // ax: ax-count-tally
      eyebrow: 'Ten out of ten',
      head: 'Every single\nname showed it',
      say: 'Every single one of the ten showed it. Ten out of ten.',
      ask: 'By sign test that lands at p equals zero point zero zero two.',
      visual: { kind: 'rows', rows: [
        { k: 'Names wider', v: '10 / 10', up: true, note: 'no counterexample' },
        { k: 'Sign test', v: 'p = 0.002', up: true, note: 'two sided' },
        { k: 'Per-name t', v: '3.10 - 5.85', up: true, note: 'all significant' },
      ] },
    },
    {
      role: 'money', prio: 1, bg: V('wafer-spin-clean.mp4'),   // ax: ax-earnings-stage
      eyebrow: 'The widest',
      head: 'Meta moves\nsix times',
      say: 'Meta is the wild one. Six times its normal day, on average.',
      ask: 'Ten percent, the day after, over and over again.',
      visual: { kind: 'rows', rows: [
        { k: 'META earnings day', v: '10.09%', up: true, note: 'widest in the set' },
        { k: 'META normal day', v: '1.65%', up: false, note: 'unusually calm otherwise' },
        { k: 'Multiple', v: '6.11x', up: true, note: 'the biggest gap we found' },
      ] },
    },
    {
      role: 'money', prio: 1, bg: V('device-assembly-bright.mp4'),   // ax: ax-window-city
      eyebrow: 'And the calmest',
      head: 'Even Apple\nstill doubles',
      say: 'Even Apple, the calmest of the ten, still more than doubles.',
      ask: 'So the size holds up everywhere. Good. Now the other half.',
      visual: { kind: 'rows', rows: [
        { k: 'AAPL earnings day', v: '2.93%', up: true, note: 'smallest move in the set' },
        { k: 'AAPL normal day', v: '1.22%', up: false, note: 'also the calmest normally' },
        { k: 'Multiple', v: '2.39x', up: true, note: 'still more than double' },
      ] },
    },

    // ── 05 방향은 동전이다 ──────────────────────────────────────────────────
    {
      role: 'verdict', prio: 1, bg: V('crack-star.mp4'),   // ax: ax-coin-spin
      eyebrow: 'But here is the thing',
      head: "Knowing how far\ndoesn't pay",
      say: "But here's the thing. Knowing how far doesn't pay Sam anything.",
      ask: 'Only knowing which way does. So how often does anyone get that?',
      visual: { kind: 'versus', aK: 'We proved', aV: 'HOW FAR', bK: 'Sam needs', bV: 'WHICH WAY' },
    },
    {
      role: 'verdict', prio: 1, bg: V('scale-few-vs-many.mp4'),   // ax: ax-two-piles
      eyebrow: 'Out of 228',
      head: 'One hundred\nand eight',
      say: 'Out of those 228 prints, 108 of them closed green.',
      ask: "You can count that yourself. It's not a private number.",
      visual: { kind: 'rows', rows: [
        { k: 'Closed higher', v: '108', up: true, note: 'of 228' },
        { k: 'Closed lower', v: '120', up: false, note: 'the rest' },
        { k: 'Share up', v: '47.4%', up: false, note: 'just under half' },
      ] },
    },
    {
      role: 'verdict', prio: 1, bg: V('steel-balls.mp4'),   // ax: ax-coin-hard
      eyebrow: 'Which is',
      head: 'Forty seven\npoint four',
      say: 'Forty seven point four percent. A coin lands on fifty.',
      ask: 'So all those confident takes landed slightly below a coin.',
      visual: { kind: 'stat', label: 'WENT UP - 108 OF 228', value: '47.4%',
        sub: 'a coin would have given you 50', up: false },
    },
    {
      role: 'verdict', prio: 1, bg: V('undercurrent-pull.mp4'),   // ax: ax-shrug-both
      eyebrow: 'Is that a real gap',
      head: 'z equals minus\nzero point eight',
      say: 'Is that gap real? The distance from a coin is minus 0.79.',
      ask: "In plain English, we can't tell this apart from a coin.",
      visual: { kind: 'stat', label: 'DISTANCE FROM A COIN FLIP', value: 'z = -0.79',
        sub: 'not distinguishable at any usual threshold', up: false },
    },
    {
      role: 'verdict', prio: 1, bg: V('paper-crowd.mp4'),   // ax: ax-lean-in
      eyebrow: 'Read that carefully',
      head: "We didn't prove\nit's random",
      say: "Now read that carefully, because it's not what people hear.",
      ask: "We didn't prove it's random. Nobody here beat a coin. Different claim.",
      visual: { kind: 'stat', label: 'WHAT THE NUMBER SAYS', value: 'NOBODY BEAT IT',
        sub: "we failed to find skill, which isn't the same as proving luck", up: false },
    },

    // ── 06 왜 그런가 — 비유 두 개 ───────────────────────────────────────────
    {
      role: 'verdict', prio: 1, bg: V('rise-stairs-light.mp4'),   // ax: ax-high-jump
      eyebrow: 'So why',
      head: 'Picture a\nhigh jump bar',
      say: 'So why does this happen? Picture a high jump for a second.',
      ask: 'The company has to clear a bar. But whose bar is it?',
      visual: { kind: 'versus', aK: 'Not the bar', aV: 'LAST QUARTER', bK: 'The bar', bV: 'EXPECTATION' },
    },
    {
      role: 'verdict', prio: 1, bg: V('rise-glass-tower.mp4'),   // ax: ax-bar-rises
      eyebrow: 'And it keeps moving',
      head: 'Every clear\nraises it',
      say: "It's not last quarter. It's whatever people expect right now.",
      ask: 'And every quarter they clear it, somebody quietly raises it.',
      visual: { kind: 'stat', label: 'WHY BEATING LAST QUARTER IS NOT ENOUGH', value: 'THE BAR RISES',
        sub: "you're scored against expectation, not history", up: false },
    },
    {
      role: 'verdict', prio: 1, bg: V('gold-bars.mp4'),   // ax: ax-auction-gavel
      eyebrow: 'One more way',
      head: 'The auction closed\nbefore the print',
      say: 'One more way to see it. The auction closed before the print.',
      ask: 'Everyone already bid what they thought the number would be.',
      visual: { kind: 'stat', label: 'WHEN THE BIDDING HAPPENED', value: 'BEFORE',
        sub: 'the price you see already contains the guess', up: false },
    },
    {
      role: 'verdict', prio: 1, bg: V('steel-spheres.mp4'),   // ax: ax-magnifier
      eyebrow: 'So what is left',
      head: 'Only the part\nnobody guessed',
      say: 'So what is left to move it? Only the part nobody guessed.',
      ask: 'And nobody knows the sign of a thing nobody guessed.',
      visual: { kind: 'versus', aK: 'Already priced', aV: 'THE GUESS', bK: 'Moves it', bV: 'THE MISS' },
    },
    {
      role: 'verdict', prio: 1, bg: V('fiber-one-lit.mp4'),   // ax: ax-price-tag
      eyebrow: 'And it is on sale',
      head: 'The size has\na price tag',
      say: "And the size isn't a secret. It's a price tag on it.",
      ask: 'Options quote it out loud, like an insurance premium on a house.',
      visual: { kind: 'stat', label: 'THE IMPLIED MOVE', value: 'PUBLISHED',
        sub: 'the market quotes how far it expects the stock to travel', up: true },
    },
    {
      role: 'verdict', prio: 1, bg: V('vault-doors.mp4'),   // ax: ax-vault-door
      eyebrow: 'Which means',
      head: 'A premium tells you\nrisk, not fire',
      say: 'A premium tells you the risk. It never tells you about the fire.',
      ask: "So if Sam buys the size, they're paying for what they expect.",
      visual: { kind: 'stat', label: 'WHY 3.45x IS NOT AN EDGE BY ITSELF', value: 'IT IS PRICED',
        sub: 'the expected move is baked into what you pay', up: false },
    },
    {
      role: 'verdict', prio: 1, bg: V('glass-tube-array.mp4'),   // ax: ax-sit-down-think
      eyebrow: 'A fair question',
      head: 'So what is the\ncount even for?',
      say: "So what is the count even for, if you can't trade it directly?",
      ask: 'It gives you a definition of normal. That turns out to be useful.',
      visual: { kind: 'stat', label: 'WHAT 228 PRINTS BUY YOU', value: 'A YARDSTICK',
        sub: 'a number to hold Wednesday up against', up: true },
    },

    // ── 07 예외 ─────────────────────────────────────────────────────────────
    {
      role: 'chips', prio: 1, bg: V('pcb-one-chip-lit.mp4'),   // ax: ax-coin-spin
      eyebrow: 'Nvidia itself',
      head: 'Eleven up.\nEleven down',
      say: 'And Nvidia itself? Twenty two prints. Eleven up, eleven down.',
      ask: 'Not roughly half. Exactly half. Which is almost funny.',
      visual: { kind: 'rows', rows: [
        { k: 'NVDA prints', v: '22', up: true, note: 'since 2021' },
        { k: 'Closed higher', v: '11', up: true, note: 'exactly half' },
        { k: 'Share up', v: '50.0%', up: false, note: 'a literal coin' },
      ] },
    },
    {
      role: 'chips', prio: 1, bg: V('chip-macro-grey.mp4'),   // ax: ax-trading-desk
      eyebrow: 'Through everything',
      head: 'The boom did not\nmove the split',
      say: 'That held through the boom and through the drawdown.',
      ask: "The story changed completely. The coin didn't notice.",
      visual: { kind: 'rows', rows: [
        { k: 'NVDA normal day', v: '2.31%', up: false, note: 'already a volatile stock' },
        { k: 'NVDA earnings day', v: '6.20%', up: true, note: 'the day after' },
        { k: 'Multiple', v: '2.69x', up: true, note: 'Welch t = 3.10' },
      ] },
    },
    {
      role: 'chips', prio: 1, bg: V('wafer-arm.mp4'),   // ax: ax-point-off
      eyebrow: 'One name did lean',
      head: 'Broadcom went up\nsixteen times',
      say: 'One name did lean, though. Broadcom closed green sixteen times.',
      ask: "Sixteen out of twenty two. That's seventy three percent.",
      visual: { kind: 'rows', rows: [
        { k: 'AVGO prints', v: '22', up: true, note: 'same window' },
        { k: 'Closed higher', v: '16', up: true, note: 'the only real lean' },
        { k: 'Share up', v: '72.7%', up: true, note: 'well above the group' },
      ] },
    },
    {
      role: 'chips', prio: 1, bg: V('quantum-fridge.mp4'),   // ax: ax-double-take
      eyebrow: 'So is that the trade?',
      head: 'Hold on.\nCheck the n',
      say: 'So is that the trade? Hold on. Look at how many prints that is.',
      ask: 'Twenty two. Toss ten coins twenty two times each and watch.',
      visual: { kind: 'stat', label: 'BEFORE YOU ACT ON IT', value: 'n = 22',
        sub: 'with ten names, chance manufactures a leader', up: false },
    },
    {
      role: 'chips', prio: 1, bg: V('humanoid-robot.mp4'),   // ax: ax-crowd-of-copies
      eyebrow: 'And the other way',
      head: 'Four names leaned\nthe other way',
      say: 'Four names leaned the other way, all at thirty nine percent.',
      ask: 'Tesla, AMD, Micron, Apple. The exact same count, four times over.',
      visual: { kind: 'rows', rows: [
        { k: 'TSLA AMD MU AAPL', v: '39.1%', up: false, note: 'nine of twenty three each' },
        { k: 'AVGO', v: '72.7%', up: true, note: 'leaning the other way' },
        { k: 'Pooled', v: '47.4%', up: false, note: 'the leans cancel out' },
      ] },
    },
    {
      role: 'chips', prio: 1, bg: V('gold-vault-bars.mp4'),   // ax: ax-shrug-both
      eyebrow: 'So we log it',
      head: "We aren't calling\nthat an edge",
      say: "So we aren't calling Broadcom an edge. We're logging it.",
      ask: "If it survives another twenty prints, we'll come back and say so.",
      visual: { kind: 'rows', rows: [
        { k: 'AVGO today', v: '16 / 22', up: true, note: 'logged, not claimed' },
        { k: 'What would convince us', v: 'n = 42', up: true, note: 'the lean holding up' },
        { k: 'What we say now', v: 'UNPROVEN', up: false, note: 'and we keep counting' },
      ] },
    },

    // ── 08 한계 ─────────────────────────────────────────────────────────────
    {
      role: 'verdict', prio: 1, bg: V('temple-storm.mp4'),   // ax: ax-sit-down-think
      eyebrow: 'The honest part',
      head: "Here's what this\ndoesn't prove",
      say: "Now here's the part most videos skip. What this doesn't prove.",
      ask: 'You should want this from anyone showing you a number.',
      visual: { kind: 'stat', label: 'THE PART MOST VIDEOS SKIP', value: 'THE LIMITS',
        sub: "a number is only as good as what it can't say", up: false },
    },
    {
      role: 'verdict', prio: 1, bg: V('geo-corridor-light.mp4'),   // ax: ax-tiny-vs-huge
      eyebrow: 'Limit one',
      head: 'Ten names is not\nthe market',
      say: "One. Ten megacaps isn't the market. It's ten megacaps.",
      ask: 'Small caps and thin names could behave completely differently.',
      visual: { kind: 'stat', label: 'LIMIT 1', value: 'TEN NAMES',
        sub: "megacap only - don't stretch it", up: false },
    },
    {
      role: 'verdict', prio: 1, bg: V('skyline-sunrise-fog.mp4'),   // ax: ax-calendar-grid
      eyebrow: 'Limit two',
      head: 'Six years is\none regime',
      say: 'Two. Six years is basically one interest rate regime.',
      ask: 'A different decade might hand you a different answer entirely.',
      visual: { kind: 'stat', label: 'LIMIT 2', value: 'ONE REGIME',
        sub: '2021 to 2026 - not a century of evidence', up: false },
    },
    {
      role: 'verdict', prio: 1, bg: V('geo-radar-dusk.mp4'),   // ax: ax-price-tag
      eyebrow: 'Limit three',
      head: 'A coin flip is not\na free trade',
      say: "Three. A coin flip in direction doesn't make anything free.",
      ask: 'Buying the size costs you the premium, every single time.',
      visual: { kind: 'stat', label: 'LIMIT 3', value: 'IT IS PRICED',
        sub: 'the expected move is in what you pay', up: false },
    },

    // ── 09 볼 것 3개 ────────────────────────────────────────────────────────
    {
      role: 'verdict', prio: 1, bg: V('golden-bell.mp4'),   // ax: ax-clipboard-check
      eyebrow: 'So, Wednesday',
      head: 'Three numbers,\nWednesday',
      say: 'So back to Sam. Wednesday, here are three numbers to watch.',
      ask: "All three are public. You don't need us for any of them.",
      visual: { kind: 'stat', label: 'THE CHECKLIST', value: 'THREE',
        sub: 'every one of them is a public number', up: true },
    },
    {
      role: 'verdict', prio: 1, bg: V('pcb-one-chip-lit.mp4'),   // ax: ax-measure-tape
      eyebrow: 'Number one',
      head: 'Six point\ntwo percent',
      say: 'One. The size of the move, held up against six point two.',
      ask: 'Land near it and Wednesday was ordinary. Miss it badly and it was not.',
      visual: { kind: 'rows', rows: [
        { k: 'NVDA earnings day average', v: '6.20%', up: true, note: 'the yardstick' },
        { k: 'Its normal day', v: '2.31%', up: false, note: 'for reference' },
        { k: 'Wednesday', v: '?', up: true, note: 'near 6% means nothing unusual' },
      ] },
    },
    {
      role: 'verdict', prio: 1, bg: V('tape-wall-scroll.mp4'),   // ax: ax-count-tally
      eyebrow: 'Number two',
      head: 'Eleven of\ntwenty two',
      say: 'Two. The running count. It sits at eleven of twenty two today.',
      ask: "Thursday it's out of twenty three. One print won't settle it.",
      visual: { kind: 'rows', rows: [
        { k: 'NVDA up-count now', v: '11 / 22', up: false, note: 'exactly 50.0%' },
        { k: 'After Wednesday', v: '? / 23', up: true, note: 'the count moves one step' },
        { k: 'Watch for', v: 'drift', up: true, note: 'not one result, a direction' },
      ] },
    },
    {
      role: 'verdict', prio: 1, bg: V('scale-few-vs-many.mp4'),   // ax: ax-scale-watch
      eyebrow: 'Number three',
      head: 'Forty seven\npoint four',
      say: 'Three. The pooled share across all ten names. Forty seven four.',
      ask: 'If that ever climbs out of the forties, something actually changed.',
      visual: { kind: 'stat', label: 'POOLED SHARE UP - ALL TEN NAMES', value: '47.4%',
        sub: 'this is the number that would have to move', up: false },
    },

    // ── 10 마무리 ───────────────────────────────────────────────────────────
    {
      role: 'verdict', prio: 1, bg: V('desks-dawn.mp4'),   // ax: ax-ledger-open
      eyebrow: 'Do it yourself',
      head: 'Three steps,\nabout ten minutes',
      say: "And if you want to redo all of this yourself, it's three steps.",
      ask: 'Earnings dates, next-day closes, compare against every other day.',
      visual: { kind: 'rows', rows: [
        { k: 'Step one', v: 'earnings dates', up: true, note: 'public calendar' },
        { k: 'Step two', v: 'next-day close', up: true, note: 'daily bars' },
        { k: 'Step three', v: 'compare', up: true, note: 'against ordinary days' },
      ] },
    },
    {
      role: 'verdict', prio: 1, bg: V('glass-tube-array.mp4'),   // ax: ax-notebook-write
      eyebrow: 'One rule though',
      head: 'Fix the window\nbefore you look',
      say: 'One rule though. Fix the window before you look at anything.',
      ask: "Pick the years after seeing the answer and you've not found a thing.",
      visual: { kind: 'stat', label: 'THE ONLY RULE THAT MATTERS', value: 'DECIDE FIRST',
        sub: "otherwise you're just describing the past", up: true },
    },
    {
      role: 'verdict', prio: 1, bg: V('columns-goldenhour.mp4'),   // ax: ax-lights-on
      eyebrow: 'To recap',
      head: 'Size is real.\nDirection is not',
      say: 'So, to recap. The size is real, and it repeats, and you can lean on it.',
      ask: 'The direction, across 228 prints, is a coin wearing a suit.',
      visual: { kind: 'versus', aK: 'Size', aV: '3.45x REAL', bK: 'Direction', bV: '47.4% COIN' },
    },
    {
      role: 'verdict', prio: 1, bg: V('rise-glass-tower.mp4'),   // ax: ax-walk-away-turn
      eyebrow: 'And Sam?',
      head: 'Sam still has\na decision',
      say: "And Sam still has a decision to make. We can't make it for them.",
      ask: "None of this is advice. It's a count, and counts can be checked.",
      visual: { kind: 'stat', label: 'WHAT THIS IS', value: 'A COUNT',
        sub: 'educational only - not investment advice', up: true },
    },
    {
      role: 'verdict', prio: 1, bg: V('nyse-flags.mp4'),   // ax: ax-lean-in
      eyebrow: 'Your turn',
      head: 'Tell us what\nto count next',
      say: 'So what is the claim you keep hearing? Put it in the comments.',
      ask: "We'll go count it, and bring the number back. That's the deal.",
      visual: { kind: 'stat', label: 'WHAT GOES IN THE COMMENTS', value: 'A CLAIM',
        sub: 'we pick one and run the same test on it', up: true },
    },
  ],

  voice: VOICE_LFEARN,
};
