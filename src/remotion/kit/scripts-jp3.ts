// ============================================================================
// scripts-jp3 — 일본 «수요 1·2위» 를 처음 건드리는 두 편 (2026-08-24)
// ----------------------------------------------------------------------------
// ⛔ 왜 이 두 소재인가
//   일본 실측 수요:  米国金利 83,743 (1위) · ドル円 45,359 (2위)
//   우리가 지금까지 올린 8편 중 이 둘을 다룬 것은 «0편» 이다.
//   가장 큰 문 앞에서 다른 문만 두드리고 있었다.
//
// ⛔ 수요가 크다고 만들지 않는다 — 두 편 다 사전등록 판정을 «먼저» 통과했다.
//   (scripts/edge-jp-rate-fx.mjs · .agent/_jp_ratefx.json)
//   같은 세션에서 円安 각도는 백분위 86.6 으로 «탈락»시켰다. 기준은 실제로 작동한다.
// ============================================================================
import type { BriefingProps } from './Briefing';
import { VOICE_JPRATE } from './voice-jprate';
import { VOICE_JPFX } from './voice-jpfx';

// ============================================================================
// SCRIPT_JPRATE — 「金利が上がると株は下がる」は二十年で15%だけ (米国金利)
// ----------------------------------------------------------------------------
// ★ 근거: scripts/edge-jp-rate-fx.mjs · .agent/_jp_ratefx.json (2026-08-24 실호출)
//   자료  FRED DGS10 (10년 국채금리) × SPY 종가 · 2006-10-06 ~ 2026-08-20 · 4,924일
//   전체 기간 상관  +0.284  (t=20.75)   ← 평시에는 «같이» 오른다
//   1년 롤링 상관   지금 -0.306 (2026-08-20) · 중앙 +0.348 · 범위 -0.312 ~ +0.712
//                  백분위 0.1 — 4,673개 창 중 사실상 최저
//   음의 상관이었던 창의 비율  15.3%
//
// ⛔ 「금리가 오르면 주가가 내린다」를 «틀렸다»고 말하지 않는다.
//   맞는 기간이 있고(15.3%), 지금이 그중에서도 가장 깊은 지점이다.
//   말할 수 있는 것은 「통념은 조건부였다」까지다.
// ⛔ 인과 금지. 상관이 음이라는 것과 «금리가 주가를 끌어내린다»는 다른 말이다.
// ⛔ 「だから債券を買え」같은 조언으로 쓰지 않는다.
// ============================================================================
export const SCRIPT_JPRATE: BriefingProps = {
  title: '「金利が上がると株は下がる」\n二十年で15%の期間だけ。',
  date: 'AUG 24 · 米国金利と株',
  slowCuts: true,
  noOutro: true,
  disclaimer: '教育目的のみ。投資助言ではありません。因果は測っていません。',
  field: ['SPY', 'TLT', 'QQQ', 'IEF'],

  hook: {
    line: '金利が上がると株は下がる。\n二十年で15%だけ。',
    sub: '四千九百二十四日、全部並べた。',
    say: '本当にそうでしょうか。',
    role: 'conflict',
    syms: ['SPY'],
    bigNum: '15.3%',
    bg: { kind: 'video', src: 'shorts/bg/video/tape-wall-scroll.mp4', loopFrames: 150 },
  },
  loop: '通念が効いたのは、\n二十年のうち十五%だけ。',

  beats: [
    {
      role: 'conflict',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/fed-building.mp4', loopFrames: 150 },
      eyebrow: 'よく聞く話',
      head: '金利が上がると\n株は下がる。',
      say: '金利が上がると株は下がる。',
      ask: 'よく聞く話です。',
      visual: {
        kind: 'stat', label: 'よく聞く話', value: '金利↑ = 株↓',
        sub: 'くり返される — 数えられたことはない', up: false,
      },
    },
    {
      role: 'evidence',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/desks-dawn.mp4', loopFrames: 150 },
      eyebrow: 'だから並べた',
      head: '二十年を\n一日ずつ。',
      say: '二十年分を一日ずつ測りました。',
      ask: '四千九百二十四日です。',
      visual: {
        kind: 'rows', rows: [
          { k: '期間', v: '2006 - 2026', up: true, note: '約20年 · 4,924営業日' },
          { k: '金利', v: '米10年債', up: true, note: 'FRED DGS10 · 日次' },
          { k: '株', v: 'S&P500', up: true, note: 'SPY 終値' },
        ],
      },
    },
    {
      role: 'money',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/nyse-flags.mp4', loopFrames: 150 },
      eyebrow: '返ってきた答え',
      head: '全期間では\nプラスだった。',
      say: '全期間の相関はプラスでした。',
      ask: '一緒に上がっていたのです。',
      visual: {
        kind: 'stat', label: '2006-2026 · 相関', value: '+0.284',
        sub: '金利が上がった日は、株も上がっていた', up: true,
      },
    },
    {
      role: 'verdict',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/columns-goldenhour.mp4', loopFrames: 150 },
      eyebrow: '通念どおりの期間',
      head: '十五%だけ\nだった。',
      say: '通念どおりは十五%の期間だけ。',
      ask: '残りは逆でした。',
      visual: {
        kind: 'rows', rows: [
          { k: '通念どおり(マイナス)', v: '15.3%', up: false, note: '1年窓 4,673個のうち' },
          { k: '逆(プラス)', v: '84.7%', up: true, note: '金利と株が一緒に動いた' },
          { k: '中央値', v: '+0.348', up: true, note: '平時はむしろ強いプラス' },
        ],
      },
    },
    {
      role: 'evidence',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/columns-birds.mp4', loopFrames: 150 },
      eyebrow: '一番高かった時',
      head: '二〇一二年は\n＋〇・七一二。',
      say: '一番高かったのは〇・七一二。',
      ask: '二〇一二年八月です。',
      visual: {
        kind: 'rows', rows: [
          { k: '最高', v: '+0.712', up: true, note: '2012年8月15日 — ほぼ一緒に動いた' },
          { k: '+0.5を超えた窓', v: '18.2%', up: true, note: '4,673個のうち' },
          { k: '最低', v: '-0.312', up: false, note: '2024年7月8日' },
        ],
      },
    },
    {
      role: 'chips',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/vault-doors.mp4', loopFrames: 150 },
      eyebrow: 'ところが今は',
      head: '二十年で\n下位0.1%。',
      say: '今はマイナス〇・三〇六。',
      ask: '二十年で下位〇・一%です。',
      visual: {
        kind: 'rows', rows: [
          { k: '今(2026年8月20日)', v: '-0.306', up: false, note: '1年窓の相関' },
          { k: '20年での位置', v: '下位0.1%', up: false, note: '最低は2024年7月の-0.312' },
          { k: 'つまり', v: '今がその15%', up: false, note: 'しかもその中で一番深い' },
        ],
      },
    },
  ],

  voice: VOICE_JPRATE,
};

// ============================================================================
// SCRIPT_JPFX — 「円で持つと、値動きは18%荒くなる」 (ドル円)
// ----------------------------------------------------------------------------
// ★ 근거: scripts/edge-jp-rate-fx.mjs · .agent/_jp_ratefx.json (2026-08-24 실호출)
//   SPY × USDJPY 겹치는 2,528거래일 (2016-08-01 ~ 2026-08-21)
//   연율 변동성  ドル건 17.98%  vs  円건 21.24%   (円건이 18.1% 더 크다)
//   USDJPY 일간변화 ↔ SPY 일간수익 상관  +0.149  (t=7.60 · 유의)
//   SPY -1% 이하 하락일 278일 → 그날 평균 ドル円 -0.133% (엔고)
//   SPY +1% 이상 상승일 325일 → 그날 평균 ドル円 +0.075% (엔저)
//
// ⛔ 「円建ての方がリスクが高い」로 단정하지 않는다. 우리가 잰 것은 «변동성» 하나다.
//   같은 세션의 다른 계산에서 円건 10년 수익은 오히려 더 컸다 (5.552배 vs 3.504배).
//   변동성이 크다는 것과 결과가 나쁘다는 것은 다른 말이다 — 둘 다 보여준다.
// ⛔ 「だからヘッジしろ」금지. 헤지 비용을 우리는 재지 않았다.
// ============================================================================
export const SCRIPT_JPFX: BriefingProps = {
  title: '円で持つS&P500は、\n18%荒くなる。',
  date: 'AUG 24 · ドル円と米国株',
  slowCuts: true,
  noOutro: true,
  disclaimer: '教育目的のみ。投資助言ではありません。',
  field: ['SPY', 'QQQ', 'AAPL'],

  hook: {
    line: '同じS&P500。\n円で持つと18%荒い。',
    sub: '二千五百二十八日、円で計算し直した。',
    say: '実は、同じ商品ではありません。',
    role: 'conflict',
    syms: ['SPY'],
    bigNum: '18%',
    bg: { kind: 'video', src: 'shorts/bg/video/exchange-flags.mp4', loopFrames: 150 },
  },
  loop: '株が下がる日に、\n円はむしろ強くなる。',

  beats: [
    {
      role: 'conflict',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/rise-glass-tower.mp4', loopFrames: 150 },
      eyebrow: '同じ商品のはず',
      head: '同じS&P500を\n買っている。',
      say: '同じ商品を買っています。',
      ask: 'でも、通貨が違います。',
      visual: {
        kind: 'stat', label: '前提', value: '同じS&P500',
        sub: 'ドルで持つか、円で持つか — それだけの違い', up: true, sym: 'SPY',
      },
    },
    {
      role: 'evidence',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/desks-dawn.mp4', loopFrames: 150 },
      eyebrow: 'だから測った',
      head: '十年分を\n一日ずつ。',
      say: '十年分を一日ずつ測りました。',
      ask: '二千五百二十八日です。',
      visual: {
        kind: 'rows', rows: [
          { k: '期間', v: '2016 - 2026', up: true, note: '2,528営業日' },
          { k: '測るもの', v: '年率ボラティリティ', up: true, note: '日次変化の標準偏差' },
          { k: '比べるもの', v: 'ドル建て / 円建て', up: true, note: '同じSPY · 通貨だけ違う' },
        ],
      },
    },
    {
      role: 'money',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/ani-scale-tip.mp4', loopFrames: 150 },
      eyebrow: '返ってきた答え',
      head: '円建ての方が\n荒かった。',
      say: '円建ての方が荒かった。',
      ask: '一八%も違います。',
      visual: { kind: 'versus', aK: 'ドル建て', aV: '17.98%', bK: '円建て', bV: '21.24%' },
    },
    {
      role: 'verdict',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/exchange-storm.mp4', loopFrames: 150 },
      eyebrow: '理由が数字に出た',
      head: '下がる日に\n円が強くなる。',
      say: '下がる日に円が強くなります。',
      ask: '損が二重になるのです。',
      visual: {
        kind: 'rows', rows: [
          { k: 'S&P500が-1%以下の日', v: '278日', up: false, note: 'その日の平均ドル円 -0.133%' },
          { k: 'S&P500が+1%以上の日', v: '325日', up: true, note: 'その日の平均ドル円 +0.075%' },
          { k: '相関', v: '+0.149', up: true, note: 't=7.60 — 偶然では説明しにくい' },
        ],
      },
    },
    {
      role: 'evidence',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/tape-wall-scroll.mp4', loopFrames: 150 },
      eyebrow: '回数ではない',
      head: '下がる日数は\nほぼ同じ。',
      say: '下がる日数はほぼ同じです。',
      ask: '違うのは大きさでした。',
      visual: {
        kind: 'rows', rows: [
          { k: '下落した日', v: '1,130 対 1,109', up: false, note: 'ドル建て44.7% / 円建て43.9%' },
          { k: '-2%以上の急落', v: '88 対 121', up: false, note: '円建ての方が37%多い' },
          { k: 'つまり', v: '頻度ではなく幅', up: false, note: '同じ日数で、より大きく振れる' },
        ],
      },
    },
    {
      role: 'chips',
      prio: 1,
      bg: { kind: 'video', src: 'shorts/bg/video/ax-two-piles.mp4', loopFrames: 150 },
      eyebrow: 'ただし',
      head: '荒い＝悪い、\nではない。',
      say: '荒いから悪い、ではありません。',
      ask: '十年の結果は円建てが上でした。',
      visual: {
        kind: 'rows', rows: [
          { k: '10年リターン · 円建て', v: '5.552倍', up: true, note: '円安が乗った分' },
          { k: '10年リターン · ドル建て', v: '3.504倍', up: true, note: '同じ期間' },
          { k: '測ったのは', v: '値動きだけ', up: false, note: '良し悪しは測っていない' },
        ],
      },
    },
  ],

  voice: VOICE_JPFX,
};
