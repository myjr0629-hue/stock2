// ============================================================================
// kit/insight — «인사이트 비트» 슬롯. 대본에 반드시 하나 들어간다
// ----------------------------------------------------------------------------
// 왜 이 파일이 있나 (2026-08-12 검토):
//   T2B 의 「SIGNUM READ」 비트 두 개는 앞에서 이미 보여준 사실을 말로 바꿔 반복했다.
//     "Our read: price and capital spending are pointing opposite ways."
//     "Our read: this is a divergence, not a verdict."
//   틀렸다는 게 아니라 **계산이 없다.** 그건 관찰이지 인사이트가 아니다.
//
//   채널의 상품은 뉴스가 아니라 «우리가 세어봤다»다. 그래서 모든 대본은
//   숫자가 든 인사이트 비트를 «최소 하나» 갖는다. 숫자는 지어내지 않는다 —
//   `node scripts/morning-edge.mjs` 가 뱉은 값을 그대로 옮긴다.
//
// 컴플라이언스: 과거 빈도의 «서술»만 한다. 미래형 동사(will·expect·should·watch for)
//   금지. 마무리는 판단을 유보하는 문장으로 닫는다. (VIDEO_PRODUCTION_HANDOVER §2-4)
// ============================================================================

import type { Beat } from './Briefing';

export interface BaseRate {
  /** 조건 문구 — 화면 eyebrow 아래 head 로 간다. 예: 'Oil jumped 4% or more' */
  condition: string;
  /** 사건 수. 40 미만이면 만들지 않는다 — 잡음이다 */
  events: number;
  /** 조건이 맞았을 때 이후 상승 비율 (%) */
  hitPct: number;
  /** 아무 날이나 골랐을 때의 상승 비율 (%) — 이게 없으면 hitPct 는 의미가 없다 */
  controlPct: number;
  /** 이후 며칠 기준인지 */
  forwardDays: number;
  /** 표본 시작 연도 */
  sinceYear: number;
  /** 무엇의 수익률인지 — 화면 라벨. 예: 'ENERGY (XLE)' */
  subject: string;
  /** 조건군 중앙 수익률 (%) — 있으면 한 줄 더 붙는다 */
  hitMedian?: number;
}

/** 표본이 얇으면 인사이트로 쓰지 않는다. 규율을 코드로 강제한다. */
export const MIN_EVENTS = 40;

/**
 * 베이스레이트 → 인사이트 비트 1개.
 * `prio: 1` 고정 — 짧은 판(틱톡)에서도 절대 잘리지 않는다. 이게 상품이다.
 */
export function baseRateBeat(br: BaseRate): Beat {
  if (br.events < MIN_EVENTS) {
    throw new Error(
      `표본 ${br.events}건 < ${MIN_EVENTS} — 인사이트 비트로 쓸 수 없다. ` +
      '조건을 넓히거나, «우위가 없었다»를 결론으로 쓴다.',
    );
  }
  const edge = br.hitPct - br.controlPct;
  const dir = edge >= 0 ? 'higher' : 'lower';

  return {
    role: 'evidence',
    prio: 1,
    eyebrow: 'SIGNUM BASE RATE',
    head: `We counted\n${br.events} of them`,
    // say = 자막 = 낭독. 숫자는 말로 풀어 읽되 화면 표기와 어긋나지 않게 한다.
    say: `We checked every one since ${br.sinceYear}. ${br.events} of them. `
      + `${Math.round(br.hitPct)} percent were ${dir} ${br.forwardDays} days later.`,
    ask: `Against ${Math.round(br.controlPct)} percent on any given day.`,
    visual: {
      kind: 'rows',
      rows: [
        { k: 'EVENTS SINCE ' + br.sinceYear, v: String(br.events), up: true },
        { k: `${dir.toUpperCase()} IN ${br.forwardDays} DAYS`, v: `${Math.round(br.hitPct)}%`, up: edge >= 0 },
        { k: 'ANY GIVEN DAY', v: `${Math.round(br.controlPct)}%`, up: false },
      ],
    },
  } as Beat;
}

/**
 * 우위가 «없었을» 때의 비트. 이것도 정직한 소재다 — 통념을 깨는 쪽이라 오히려 훅이 강하다.
 * 예: 반도체 -3% 118건 → 58% vs 대조군 56%. "급락은 매수 기회"라는 통념이 무너진다.
 */
export function noEdgeBeat(br: BaseRate): Beat {
  return {
    role: 'verdict',
    prio: 1,
    eyebrow: 'SIGNUM BASE RATE',
    head: `${br.events} times.\nNo edge.`,
    say: `We counted ${br.events} since ${br.sinceYear}. `
      + `${Math.round(br.hitPct)} percent, against ${Math.round(br.controlPct)} on any day.`,
    ask: 'The pattern everyone quotes is a coin flip.',
    visual: {
      kind: 'versus',
      aK: 'AFTER THE EVENT', aV: `${Math.round(br.hitPct)}%`,
      bK: 'ANY GIVEN DAY', bV: `${Math.round(br.controlPct)}%`,
    },
  } as Beat;
}

/** 대본 검사 — 인사이트 비트가 하나라도 있는지. 없으면 «요약 영상»이다. */
export function hasInsight(beats: Beat[]): boolean {
  return beats.some((b) => b.eyebrow === 'SIGNUM BASE RATE');
}
