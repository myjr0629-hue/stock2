// ============================================================================
// scripts-jpmem — 일본 채널 · 메모리만 무너진 날 (2026-08-24 종가 확정)
// ----------------------------------------------------------------------------
// ★ 미국편 MEMSPLIT 의 «일본어판». 같은 측정, 다른 진입점.
//   ⛔ 번역이 아니다 — 일본 시청자에게 메모리는 남의 얘기가 아니다.
//     같은 사안을 한국 언론이 102건 쏟았고(삼성·하이닉스), 일본도 키옥시아로 바로 연결된다.
//     그래서 훅을 「왜 메모리만」 으로 연다.
//
// ── 우리가 잰 것 (FMP 종가 · 정규장 마감 후 확인하고 계산) ──────────────────
//   2026-08-24 종가 : MU 910.43 (-5.83%) · AAPL·MSFT·GOOGL 평균 +0.70% · SPY -0.17%
//   스프레드 -6.53pt · 표본 1,415일(2021-01~) · 중앙 +0.05pt · 백분위 2.0
//   이만큼 벌어진 날 30/1,415 = 2.12%
//   ⛔ 장중엔 MU 를 -6.38% 로 봤다. 확정 종가는 -5.83% — 0.55%p 차이가 났다.
//
//   원인(보도): 중국 메모리 업체의 상하이 IPO 신청. «보도된 사실» 까지만 말한다.
//
// ⛔ 인과 단정 금지 · 예측 금지 · 「수혜주」 금지
// ★ 일본어 규격: 자막 18자 · 훅은 「ますか / のか / ですか」로 끝나야 질문형
// ★ 목소리는 tts-beats 가 대본 언어를 보고 kenzo 를 고른다
// ============================================================================
import type { BriefingProps } from './Briefing';
import { VOICE_JPMEM } from './voice-jpmem';

const V = (src: string) =>
  ({ kind: 'video', src: `shorts/bg/video/${src}`, loopFrames: 150 }) as const;

export const SCRIPT_JPMEM: BriefingProps = {
  title: 'マイクロン−5.83%。\nアップルとマイクロソフトは上げました。',
  date: '8月24日 · メモリ',
  slowCuts: true,
  disclaimer: '情報提供のみ。投資助言ではありません。因果は測っていません。',
  field: ['MU', 'AAPL', 'MSFT', 'SPY'],

  hook: {
    line: 'メモリだけが\n六%近く下げました。\nなぜですか。',
    sub: '同じ日です。差を測りました。',
    say: 'なぜメモリだけ下げたのですか',
    role: 'conflict',
    syms: ['MU'],
    bigNum: '2%',
    bg: V('ani-chip-pull.mp4'),
  },
  loop: '指数は無事でした。\n棚が一つだけ違いました。',

  beats: [
    {
      role: 'conflict', prio: 1, bg: V('tape-wall-scroll.mp4'),
      eyebrow: '表面は静かだった',
      head: '指数はほとんど\n動いていません。',
      say: '指数はほぼ動いていません',
      ask: '〇.一七%の下げです',
      visual: {
        kind: 'stat', label: '見出しの数字', value: 'S&P500 · -0.17%',
        sub: '表面だけ見れば静かな一日', up: false,
      },
    },
    {
      role: 'evidence', prio: 1, bg: V('ani-chip-conveyor.mp4'),
      eyebrow: 'その下では',
      head: 'メモリだけが\n崩れました。',
      say: 'ですがメモリだけ崩れました',
      ask: 'マイクロンは五.八三%安',
      visual: {
        kind: 'rows', rows: [
          { k: 'マイクロン終値', v: '910.43', up: false, note: '八月二十四日' },
          { k: 'その日の下げ', v: '-5.83%', up: false, note: '前日終値から' },
          { k: '指数', v: '-0.17%', up: false, note: '同じ日' },
        ],
      },
    },
    {
      role: 'evidence', prio: 1, bg: V('ani-mem-seesaw.mp4'),
      eyebrow: '一方で巨大企業は',
      head: '大型テックは\n上げました。',
      say: '大型テックは上げています',
      ask: 'アップルもマイクロソフトも',
      visual: {
        kind: 'rows', rows: [
          { k: '大型テック三社', v: '+0.70%', up: true, note: '三社の平均' },
          { k: 'マイクロン', v: '-5.83%', up: false, note: '同じ日' },
          { k: '差', v: '6.53pt', up: false, note: '一日で' },
        ],
      },
    },
    {
      role: 'evidence', prio: 1, bg: V('ani-arrows-flow.mp4'),
      eyebrow: 'そこで数えた',
      head: '五年分の\n同じ差を。',
      say: '五年分を測りました',
      ask: '終値だけで測ります',
      visual: {
        kind: 'stat', label: '数えた日数', value: '1,415',
        sub: '二〇二一年一月以降のすべての日', up: true,
      },
    },
    {
      role: 'verdict', prio: 1, bg: V('scale-few-vs-many.mp4'),
      eyebrow: '答えです',
      head: '五年で\n下位二%。',
      say: '五年の中で下位二%です',
      ask: '千四百日で三十日だけです',
      visual: {
        kind: 'rows', rows: [
          { k: '普段の一日', v: '+0.05pt', up: true, note: '差の中央値' },
          { k: 'この日', v: '-6.53pt', up: false, note: '第二パーセンタイル' },
          { k: 'これだけ開いた日', v: '30 / 1,415', up: false, note: '二.一二%' },
        ],
      },
    },
    {
      role: 'chips', prio: 1, bg: V('ani-china-us.mp4'),
      eyebrow: '報じられたこと',
      head: '中国勢が\n上場を申請。',
      say: '中国勢が上場を申請しました',
      ask: '上海での報道です',
      visual: {
        kind: 'stat', label: '通信社が伝えたこと', value: '新しい供給の話',
        sub: '報じられた事実まで。因果は測っていません', up: false,
      },
    },
    {
      role: 'verdict', prio: 1, bg: V('ani-chip-carry.mp4'),
      eyebrow: '分かれ方を読む',
      head: '値がついたのは\n供給の側です。',
      say: '値がついたのは供給の側です',
      ask: '買う側は無事でした',
      visual: {
        kind: 'stat', label: 'この差が示すもの', value: '棚一つ。店ではない',
        sub: 'メモリを買う企業は上げて終わった', up: true,
      },
    },
    {
      role: 'chips', prio: 1, bg: V('floor-empty-night.mp4'),
      eyebrow: '測っていないこと',
      head: '差を測り、\n理由は測らず。',
      say: '差を測り理由は測っていません',
      ask: '今夜はマイクロンを見ます',
      visual: {
        kind: 'rows', rows: [
          { k: '今夜の基準', v: 'MU 910.43', up: false, note: '八月二十四日終値' },
          { k: '言えること', v: 'どれだけ開き、珍しいか', up: true, note: '一日を1,415日と比べた' },
          { k: '言わないこと', v: 'なぜか、次はどこか', up: false, note: '因果は測っていない' },
        ],
      },
    },
  ],

  voice: VOICE_JPMEM,
};
