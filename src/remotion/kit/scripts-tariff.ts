// ============================================================================
// scripts-tariff — 미국 채널 · 캐나다 50% 관세 편 (2026-08-24)
// ----------------------------------------------------------------------------
// ★ 왜 이 소재인가 — 처음으로 «시의성» 으로 고른 편이다
//   기존엔 .agent/DEMAND.json(며칠 전 얼어붙은 «누적» 조회수 중앙값)으로 골랐다.
//   대표 지적: "낙후된 노후화된 검색어를 가지고 접근한다는것이 문제이다"
//   ⇒ scripts/topic-scan.mjs 로 «지금 말이 나오는 것» 에서 골랐다.
//      관세 주제 3개국 헤드라인 190건 · 최신 0.6시간 · KR 91 / JP 67 / US 32
//
//   ⛔ 수요표엔 tariffs 1,094 뿐이라 하한 5,000 에 못 미친다.
//     하한을 낮추지 않고 topic-check 에 «시의성 차선» 을 냈다 (story.timely 로 관심을 실측 제출).
//
// ── 사실관계 (3개국 원문 시간순, 2026-08-24 수집) ───────────────────────────
//   약 102h 전  미·캐나다 관세 «인하» 합의 — 자동차 15% · 철강/알루미늄 25%
//               일본 언론이 이를 「日本勢追い風」(일본 기업에 순풍) 으로 보도
//   약  17h 전  협상 결렬. 캐나다산 전 품목 «50%»
//   약   9h 전  카니 총리 보복 예고
//
// ── 우리가 잰 것 (FMP 종가로 «직접» 계산) ───────────────────────────────────
//   ⛔ FMP 의 changePercent 필드가 종가와 어긋난다 (TM 을 +0.37% 로 주는데 종가는 +2.66%).
//     필드를 쓰지 않고 종가비로 계산했다. 이 함정은 topic-scan SKILL.md 에도 적어뒀다.
//
//   합의 보도(8/20) 직후 이틀 누적 — 8/19 종가 → 8/21 종가
//     TM  (도요타)  +4.54%      EWC (캐나다)  +0.86%
//     HMC (혼다)    +4.58%      EWJ (일본)    +0.42%
//     EWY (한국)    +2.24%      SPY           -0.43%
//   ⇒ 캐나다 관세 뉴스에 가장 크게 움직인 건 «캐나다가 아니었다». 캐나다 ETF 의 5.3배.
//
// ── 내 해석 (사실과 «구분해서» 말한다) ──────────────────────────────────────
//   시장은 이 사안을 «국가» 가 아니라 «공장» 으로 값을 매겼다.
//   국기가 붙은 지수(EWC)는 거의 안 움직였고, 그 나라에 라인을 둔 제조사가 움직였다.
//   ⇒ 그래서 되돌림의 위험도 헤드라인에 이름이 적힌 나라 «밖» 에 있다.
//   ⛔ 이건 «해석» 이다. 인과를 잰 것이 아니다. 대본에서도 그렇게 말한다.
//
// ⛔ 인과 금지 — 관세가 주가를 움직였다고 쓰지 않는다. 같은 창에서 무엇이 얼마나 움직였는지만 잰다.
// ⛔ 예측 금지 — 「다음은 어디」를 말하지 않는다. 정책 예측은 우리 영역이 아니다.
// ⛔ 매수·매도 권유 금지. 「수혜주」로 쓰지 않는다.
//
// ★ 영어 대본 규격 (scripts/script-check.mjs)
//   훅 = 반박형 · 12단어 이내 · 숫자는 «말로» 쓴다 (fifty, five) — 자릿수는 밀도를 터뜨린다
// ============================================================================
import type { BriefingProps } from './Briefing';
import { VOICE_TARIFF } from './voice-tariff';

const V = (src: string) =>
  ({ kind: 'video', src: `shorts/bg/video/${src}`, loopFrames: 150 }) as const;

export const SCRIPT_TARIFF: BriefingProps = {
  title: 'Canada got fifty percent.\nThe biggest move was not Canadian.',
  date: 'AUG 24 · TARIFFS',
  slowCuts: true,
  noOutro: true,
  disclaimer: 'Informational only. Not investment advice. Causation not measured.',
  field: ['EWC', 'TM', 'HMC', 'SPY'],

  hook: {
    // ⛔ 훅에서 답을 주지 않는다 (레퍼런스 설계 원리 ①). 「어느 나라」인지 감춘다.
    line: 'Canada got fifty percent.\nThe biggest move\nwas not Canadian.',
    sub: 'We measured the two days before it collapsed.',
    // ⛔ 훅을 두 번 고쳤다. 경위를 남긴다 — 자수만 보고 «유형» 을 놓치면 이 왕복이 또 난다.
    //   ① 'Everyone is watching the wrong country.' → 39자 (en 상한 38). 반박형은 통과.
    //   ② 'You are watching the wrong country.'     → 35자로 줄였더니 «선언» 으로 잡혔다.
    //      훅 유형은 script-check 가 「? 가 있으면 질문 / 여는말 사전에 걸리면 반박」으로 본다.
    //   ③ 물음표를 달아 «질문형» 으로 끝냈다 — 35자, 유형 통과, 대표가 요구한 의문형이기도 하다.
    say: 'Are you watching the wrong country?',
    role: 'conflict',
    syms: ['EWC'],
    bigNum: '5x',
    bg: V('tape-wall-scroll.mp4'),
  },
  loop: 'The flag was on the headline.\nThe factories were somewhere else.',

  beats: [
    {
      role: 'conflict', prio: 1, bg: V('ani-canada-moose.mp4'),
      eyebrow: 'Since yesterday',
      head: 'Fifty percent,\non everything.',
      say: 'Fifty percent, on everything Canadian.',
      ask: 'And every headline points north.',
      visual: {
        kind: 'stat', label: 'What everyone is reading', value: 'Canada · fifty percent',
        sub: 'talks collapsed, retaliation announced', up: false,
      },
    },
    {
      role: 'evidence', prio: 1, bg: V('retail-warehouse-aisle.mp4'),
      eyebrow: 'But four days ago',
      head: 'The same table\nagreed to cut them.',
      say: 'Four days earlier they agreed to cut.',
      ask: 'Cars to fifteen. Steel to twenty-five.',
      visual: {
        kind: 'rows', rows: [
          { k: 'Four days ago', v: 'Cars to fifteen percent', up: true, note: 'steel and aluminum to twenty-five' },
          { k: 'Yesterday', v: 'Fifty percent, all goods', up: false, note: 'talks collapsed' },
          { k: 'Gap between them', v: 'Four days', up: false, note: 'same table, opposite outcome' },
        ],
      },
    },
    {
      role: 'evidence', prio: 1, bg: V('desks-dawn.mp4'),
      eyebrow: 'So we measured',
      head: 'The two days\nafter the deal.',
      say: 'So we measured the two days after.',
      ask: 'Closing prices only. No estimates.',
      visual: {
        kind: 'stat', label: 'Window measured', value: 'Aug 19 close to Aug 21 close',
        sub: 'the market had the deal, not the collapse', up: true,
      },
    },
    {
      // ★ 반전 = 훅의 답 공개. role:'verdict' 라 컷에서 절대 안 버려진다.
      role: 'verdict', prio: 1, bg: V('ani-arrows-flow.mp4'),
      eyebrow: 'The answer',
      head: 'Japanese carmakers,\nfive times more.',
      say: 'We found the carmakers moved most.',
      ask: 'Canada itself barely moved at all.',
      visual: {
        kind: 'rows', rows: [
          { k: 'Toyota', v: '+4.54%', up: true, note: 'two-day move' },
          { k: 'Honda', v: '+4.58%', up: true, note: 'two-day move' },
          { k: 'Canada ETF', v: '+0.86%', up: false, note: 'the country in the headline' },
        ],
      },
    },
    {
      role: 'money', prio: 1, bg: V('scale-few-vs-many.mp4'),
      // ★ 여기가 이 편의 «베이스레이트» 다 (2026-08-24 교체).
      //   원래는 「지수는 빠졌는데 이들은 올랐다」로 이틀·6종목만 보여줬는데,
      //   게이트가 «소표본» 으로 정당하게 막았다 (표본 >= 20 · 백분위 <=10/>=90 요구).
      //   ⇒ 2021-01 이후 «2일창 1,413개» 로 다시 쟀다. 도요타-캐나다 스프레드:
      //     중앙 -0.12pt · 이번 +3.68pt · 백분위 95.8 (상위 4.2%)
      eyebrow: 'How rare is that',
      head: 'Top four percent\nof five years.',
      say: 'We ranked it against five years.',
      ask: 'You are in the top four percent.',
      visual: {
        kind: 'rows', rows: [
          { k: 'Two-day windows measured', v: '1,413', up: true, note: 'since January 2021' },
          { k: 'Normal gap', v: '-0.12pt', up: false, note: 'median Toyota minus Canada' },
          { k: 'This one', v: '+3.68pt', up: true, note: '95.8th percentile' },
        ],
      },
    },
    {
      // ⛔ 사실 뒤엔 반드시 해석 한 문장 (레퍼런스 설계 원리 ③).
      //   여기가 이 편의 «해석» 이고, 인과 주장이 아니라 값매김의 «위치» 를 말한다.
      role: 'verdict', prio: 1, bg: V('ani-factory-line.mp4'),
      eyebrow: 'Read that again',
      head: 'It was priced\nthrough factories.',
      say: 'This was priced through factories.',
      ask: 'Not through flags.',
      visual: {
        kind: 'stat', label: 'What the spread says', value: 'Plants, not passports',
        sub: 'the country index sat still; the manufacturers did not', up: true,
      },
    },
    {
      role: 'chips', prio: 1, bg: V('vault-doors.mp4'),
      eyebrow: 'And now',
      head: 'That deal\nis gone.',
      say: 'And that deal is now gone.',
      ask: 'You paid for terms that are gone.',
      visual: {
        kind: 'stat', label: 'Status', value: 'Agreement withdrawn',
        sub: 'the two-day repricing rested on terms that no longer exist', up: false,
      },
    },
    {
      role: 'chips', prio: 1, bg: V('floor-empty-night.mp4'),
      eyebrow: 'What we did not measure',
      head: 'We measured moves,\nnot causes.',
      say: 'We measured moves, not causes.',
      ask: 'Watch the Canada ETF at sixty-two.',
      visual: {
        kind: 'rows', rows: [
          { k: 'Anchor for tonight', v: 'EWC 62.36', up: false, note: 'last close before the fifty percent' },
          { k: 'What we claim', v: 'What moved, and how much', up: true, note: 'in one measured window' },
          { k: 'What we do not', v: 'Why — or what comes next', up: false, note: 'we do not forecast policy' },
        ],
      },
    },
  ],

  voice: VOICE_TARIFF,
};
