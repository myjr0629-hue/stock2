// ============================================================================
// scripts-jpnv — 일본 채널 · 엔비디아 7일 연속 하락 (2026-08-24 종가 확정)
// ----------------------------------------------------------------------------
// ★ 미국편 NVSTREAK 의 «일본어판» 이다. 같은 측정, 다른 진입점.
//   ⛔ 번역이 아니다 — 일본 시청자는 「決算」 자체가 관심사라 훅을 실적 쪽에서 연다.
//
// ★ 일본어는 제목 사정이 다르다 (2026-08-25 실측)
//   영어 : nvidia 수요 713 → 하한 미달이라 「chip stocks」(8,724) 를 빌려야 했다
//   일본어: エヌビディア «14,658» → 종목명 자체가 검색어다. 빌릴 필요가 없다
//
// ── 우리가 잰 것 (FMP 종가 · 정규장 마감 후 확인하고 계산) ──────────────────
//   NVDA 종가  08-14 225.16 → 225.01 → 219.74 → 217.56 → 216.85 → 214.72 → 208.48
//   7일 연속 하락 · 7일 누적 -7.47% (같은 7일창 중앙 +1.69%, 백분위 10.0)
//   희소성: 2015-01 이후 롤링 7일창 2,920개 중 5개 = 0.171% → 백분위 99.83
//   과거 사례: 2015-08-25(7일) · 2019-06-03(8일) · 2022-09-06(7일)
//
// ⛔ 예측 금지 — 「그러니 반등한다」를 말하지 않는다. 표본 4회로는 다음을 말할 수 없다.
// ⛔ 인과 금지 — 실적 «때문에» 빠졌다고 쓰지 않는다. 순서상 불가능하다는 것만 말한다.
// ★ 일본어 규격: 자막 18자 · 훅은 「ますか / のか / ですか」로 끝나야 질문형
// ★ 목소리는 tts-beats 가 대본 언어를 보고 kenzo 를 고른다 (환경변수 불필요)
// ============================================================================
import type { BriefingProps } from './Briefing';
import { VOICE_JPSTREAK } from './voice-jpstreak';

const V = (src: string) =>
  ({ kind: 'video', src: `shorts/bg/video/${src}`, loopFrames: 150 }) as const;

export const SCRIPT_JPSTREAK: BriefingProps = {
  title: 'エヌビディア七日続落。\n二千九百二十回中、五回です。',
  date: '8月24日 · エヌビディア',
  slowCuts: true,
  disclaimer: '情報提供のみ。投資助言ではありません。因果は測っていません。',
  field: ['NVDA', 'MU', 'SMH', 'SPY'],

  hook: {
    line: 'エヌビディアが\n七日続けて下げました。\n珍しいのですか。',
    sub: '二〇一五年以降の七日間を全部数えました。',
    say: '七日続落は珍しいのですか',
    role: 'conflict',
    syms: ['NVDA'],
    bigNum: '5',
    bg: V('ani-chip-stairs-down.mp4'),
  },
  loop: '決算はまだ出ていません。\n下げは先に起きました。',

  beats: [
    {
      role: 'conflict', prio: 1, bg: V('desks-dawn.mp4'),
      eyebrow: 'みんな水曜を見ている',
      head: '決算は\n二日後です。',
      say: '決算は二日後です',
      ask: '皆そこだけ見ています',
      visual: {
        kind: 'stat', label: 'カレンダーが言うこと', value: '決算・八月二十六日',
        sub: 'market が丸をつけている日', up: true,
      },
    },
    {
      role: 'evidence', prio: 1, bg: V('ani-bear-escalator.mp4'),
      eyebrow: 'でもその前に',
      head: 'すでに七日\n下げています。',
      say: 'ですが既に七日下げました',
      ask: '決算の前です。後ではなく',
      visual: {
        kind: 'rows', rows: [
          { k: '下げ始める前', v: '225.16', up: true, note: '八月十四日' },
          { k: '直近の終値', v: '208.48', up: false, note: '八月二十四日' },
          { k: '連続で下げた日数', v: '七日', up: false, note: '間に上げた日はない' },
        ],
      },
    },
    {
      role: 'evidence', prio: 1, bg: V('tape-wall-scroll.mp4'),
      eyebrow: 'そこで数えた',
      head: '二〇一五年以降の\n七日間を全部。',
      say: '二〇一五年以降を数えました',
      ask: '終値だけで測ります',
      visual: {
        kind: 'stat', label: '数えた窓', value: '2,920',
        sub: '二〇一五年一月以降のすべての七日間', up: true,
      },
    },
    {
      role: 'verdict', prio: 1, bg: V('scale-few-vs-many.mp4'),
      eyebrow: '答えです',
      head: '五回。\n二千九百二十回中。',
      say: '五回。二千九百二十回中',
      ask: '六百回に一回です',
      visual: {
        kind: 'rows', rows: [
          { k: '七日間の窓', v: '2,920', up: true, note: '二〇一五年一月から' },
          { k: '七日とも下げた', v: '5', up: false, note: '〇.一七一%' },
          { k: '位置', v: '上位0.2%', up: false, note: '百回に一回より珍しい' },
        ],
      },
    },
    {
      role: 'money', prio: 1, bg: V('ani-chip-carry.mp4'),
      eyebrow: '下げ幅は',
      head: '七日で\n七.四七%。',
      say: '七日で七.四七%下げました',
      ask: '普段の七日は上げています',
      visual: {
        kind: 'rows', rows: [
          { k: '今回の七日', v: '-7.47%', up: false, note: '八月十四日から二十四日' },
          { k: '普段の七日', v: '+1.69%', up: true, note: '2,920窓の中央値' },
          { k: '位置', v: '下位10%', up: false, note: '同じ2,920窓の中で' },
        ],
      },
    },
    {
      role: 'verdict', prio: 1, bg: V('vault-doors.mp4'),
      eyebrow: '順番を見る',
      head: 'これは\n反応ではない。',
      say: 'これは反応ではありません',
      ask: '決算はまだ出ていません',
      visual: {
        kind: 'stat', label: '順番が示すこと', value: '売りが先に来た',
        sub: '決算が何であれ、これの原因ではない', up: false,
      },
    },
    {
      role: 'chips', prio: 1, bg: V('ani-chip-conveyor.mp4'),
      eyebrow: '過去の三回',
      head: '前は二〇二二年\n九月でした。',
      say: '前は二〇二二年九月でした',
      ask: '四年前まで遡ります',
      visual: {
        kind: 'rows', rows: [
          { k: '最初', v: '2015年8月', up: false, note: '七日' },
          { k: '最長', v: '2019年6月', up: false, note: '八日' },
          { k: '直近', v: '2022年9月', up: false, note: '七日・四年前' },
        ],
      },
    },
    {
      role: 'chips', prio: 1, bg: V('floor-empty-night.mp4'),
      eyebrow: '測っていないこと',
      head: '数えました。\n予測はしません。',
      say: '数えました。予測はしません',
      ask: '四回では次を語れません',
      visual: {
        kind: 'rows', rows: [
          { k: '今夜の基準', v: 'NVDA 208.48', up: false, note: '八月二十四日終値' },
          { k: '言えること', v: 'どれだけ珍しく、深いか', up: true, note: '一つの窓の中で' },
          { k: '言わないこと', v: '次に何が起きるか', up: false, note: '七日以上は四例しかない' },
        ],
      },
    },
  ],

  voice: VOICE_JPSTREAK,
};
