// ============================================================================
// kit/variants — 하나의 대본에서 «플랫폼별 길이»를 자동으로 뽑는다
// ----------------------------------------------------------------------------
// 대표 지시(2026-08-11): "최적의 시간으로 잡고, 내용 대응 시간에 따라 능동적으로"
//
// 조사 결과 — 최적 길이는 «하나»가 아니라 플랫폼마다 다르다:
//   YouTube Shorts  50~58초   알고리즘이 «시청 시간»을 본다
//   TikTok 바이럴   24~38초   알고리즘이 «완주율»을 본다   ← 대표가 말한 34초
//   Reels 교육형    30~45초   루프 반복이 리텐션으로 잡힌다
//   RPM 은 길이와 «무관»하다 (15초든 3분이든 동일). 길이는 조회수로만 수익에 닿는다.
//   출처: joyspace.ai/ideal-video-length-social-platform-2026,
//         air.io Shorts RPM 2026, autofaceless.ai 2026 통계
//
// 그래서 길이를 고정하지 않는다. 대본은 «길게» 쓰고, 여기서 잘라낸다.
// 자르는 기준은 시간이 아니라 **beat.prio** — 뼈대(1)를 남기고 보너스(3)부터 버린다.
// 시간으로 자르면 문장 중간이 잘리지만, 우선순위로 자르면 «짧은 완성본»이 된다.
// ============================================================================

import type { BriefingProps, Beat } from './Briefing';
import { timingOf } from './Briefing';

export type Platform = 'yt' | 'tt' | 'reels';

/**
 * 플랫폼별 목표 창 (초)
 *
 * ★ 2026-08-12 개정 — 조사값을 «우리 실측»으로 덮었다.
 *   원래 yt 는 48~58 이었다(외부 조사: 유튜브는 «시청 시간»을 본다).
 *   그런데 우리 채널 첫 실측이 정반대였다:
 *     34초 영상 → 157회 · 54초 영상 → 6회   (같은 날, 같은 채널)
 *   그 조사값은 «이미 시청자가 있는 채널» 기준으로 보인다.
 *   구독자 0인 채널은 시청 «시간»을 벌기 전에 **완주율로 신뢰부터 얻어야** 한다.
 *   완주율이 올라 노출이 붙은 뒤에 다시 길게 가는 건 그때 판단한다.
 *
 *   ⚠️ 이 값을 되돌리려면 «실측 근거»를 같이 바꿀 것. 조사 문서만 보고 되돌리지 말 것.
 */
/**
 * ⛔ 2026-08-21 개정 — 대표 지시:
 *   "시간을 30초 이내로 잡는것이 좋을것같다 구독자가 좀더 늘어나면 그때 시간을 길게"
 *
 * 우리 채널 실측 (n=21, 7/1~8/21):
 *   ~25초 6편 조회중앙 104 · 26~35초 8편 40 · 36초~ 7편 16 (36초+ 가 «가장 오래됐는데» 최저)
 *   조회 ↔ 평균시청률 r=0.48 · 나이 통제 조회↔길이 부분상관 r=-0.39 (t=-1.77, 유의 아님)
 *   ⇒ 방향은 일관되나 n=21 이라 «판정»이 아닌 «관찰». 구독자가 늘면 재측정해서 되돌린다.
 *
 * ⛔ 매크로 레퍼런스 계급의 39~58초를 우리 채널에 적용하지 않는다.
 *   레퍼런스 채널은 시청자가 있고 우리는 구독자 2명이다 — 완주율로 배포를 벌어야 한다.
 */
export const WINDOW: Record<Platform, { target: number; min: number; max: number }> = {
  // ⛔ 2026-08-21 우리 19편 시뮬레이션으로 바꿨다.
  //   업계 자료: 확장 게이트가 «30초 미만 65% · 30~60초 50%» 다.
  //   우리 실측이 그걸 그대로 뒷받침한다 —
  //     30초 미만  게이트 통과 4/10 (40%)
  //     30초 이상  게이트 통과 7/9  (78%)
  //   그리고 «20~30초»가 완청률 골짜기다 (중앙 33.1%). 20초 미만 89.7% · 30~45초 68.3%.
  //   상한이 30초였다는 건 «가장 불리한 구간»에 갇혀 있었다는 뜻이다.
  //   ⇒ 30초를 «넘겨서» 쉬운 게이트(50%)로 간다.
  //   ⛔ 다만 이걸로 조회가 늘 거라고 말하지 않는다 —
  //     게이트 통과 11편 조회 중앙 46 vs 실패 8편 42. 거의 차이가 없었다.
  yt: { target: 34, min: 31, max: 38 },
  tt: { target: 27, min: 22, max: 30 },
  reels: { target: 28, min: 22, max: 32 },
};

/** 대본 전체 길이(초) — 음성 실측이 있으면 그걸 따른다 */
export function totalSecOf(p: BriefingProps): number {
  const t = timingOf(p);
  return t.hookSec + t.beatSecs.reduce((a, b) => a + b, 0) + t.ctaSec + t.loopSec;
}

/**
 * ⛔ 2026-08-21: cutFor 가 GOLD821 의 «결론» 비트를 통째로 잘라먹었다.
 *   뒤에서부터 버리는 규칙 + 결론이 마지막 = 가장 중요한 한 마디가 사라진다.
 *   게이트는 «영상»을 재므로 이걸 잡지 못했다 (렌더는 정상, 내용만 없음).
 *   ⇒ role 'verdict' 와 insight 를 나르는 비트는 prio 1 로 본다. 절대 안 버린다.
 */
const prioOf = (b: Beat) => (b.role === 'verdict' ? 1 : (b.prio ?? 2));

/**
 * 플랫폼 목표 창에 맞게 «비트를 골라» 짧은 판을 만든다.
 *
 * 규칙:
 *  · prio 1 은 절대 버리지 않는다 (버리면 이야기가 끊긴다)
 *  · 3 → 2 순으로, 뒤에서부터 버린다 (앞 비트가 훅에 가깝다)
 *  · voice 트랙도 «같은 인덱스»로 함께 잘라낸다 — 안 자르면 낭독이 어긋난다
 *  · 창 안에 못 들어가면 «가장 가까운 상태»로 멈춘다. 억지로 자르지 않는다
 */
export function cutFor(p: BriefingProps, platform: Platform): BriefingProps {
  // ⛔ 롱폼은 자르지 않는다 (2026-08-22). cutFor 는 «쇼츠 길이창»에 맞추는 도구다 —
  //   12분 대본을 태우면 38초로 만들려고 비트를 거의 전부 버린다.
  if (p.longform) return p;
  const win = WINDOW[platform];
  const keep = p.beats.map((_, i) => i);

  const secOf = (idx: number[]) => totalSecOf(withBeats(p, idx));

  // 이미 창 안이면 그대로
  if (secOf(keep) <= win.max) return withBeats(p, keep);

  for (const level of [3, 2] as const) {
    // 뒤에서부터 — 앞쪽 비트가 훅에 가까워 리텐션 기여가 크다
    for (let i = p.beats.length - 1; i >= 0; i--) {
      if (secOf(keep) <= win.max) break;
      if (prioOf(p.beats[i]) !== level) continue;
      const idx = keep.indexOf(i);
      if (idx === -1) continue;
      keep.splice(idx, 1);
      // 너무 짧아졌으면 되돌린다
      if (secOf(keep) < win.min) { keep.splice(idx, 0, i); }
    }
  }
  return withBeats(p, keep);
}

/**
 * ★ leanCut — 「완주율 사냥」용 초단축 판 (2026-08-13)
 * ─────────────────────────────────────────────────────────────────────────────
 * 【왜 cutFor 로는 안 되나】
 *   cutFor 는 prio 1 을 «절대» 안 버린다 — 이야기를 지키려는 규칙이다.
 *   그런데 PRE813 은 prio 1 이 4개라 아무리 잘라도 23초가 하한이다.
 *   확대 관문(완주율 70%)에 닿으려면 실측 시청 13초 기준 **18.6초 이하**여야 한다.
 *
 * 【그래서 규칙을 바꾼다】
 *   여기서는 «이야기의 완결»보다 «관문 통과»가 목적이다. 앞에서부터 채우다가
 *   창을 넘으면 멈춘다. 뒤 비트는 버린다 — 어차피 13초에서 시청자가 나간다면
 *   뒤 비트는 «아무도 못 본 채로 완주율만 깎는» 무게추다.
 *
 * 【최소 보장】 훅 + 비트 2개. 그 아래로는 이야기가 아니라 토막이 된다.
 * ⚠️ CTA 제거·루프 단축은 Casual 의 `lean` 이 맡는다. 여기서는 «비트 선택»만.
 */
export function leanCut(p: BriefingProps, maxSec = 19, minBeats = 2): BriefingProps {
  const t = timingOf(p);
  // ⚠️ hookTight 를 여기서도 반영해야 한다. 안 하면 훅을 3.0초로 잡아 «실제보다 길게»
  //    계산하고, 그 0.6초 때문에 마지막 비트가 억울하게 잘린다 (2026-08-13 실측).
  const tight = (p as { hookTight?: boolean }).hookTight && p.voice?.hook;
  const hookSec = tight ? p.voice!.hook!.sec + 0.25 : t.hookSec;
  const fixed = hookSec + 1.4;                   // lean 루프 1.4초, CTA 0 (Casual.casualTiming)
  const keep: number[] = [];
  let sec = fixed;
  for (let i = 0; i < p.beats.length; i++) {
    const next = sec + t.beatSecs[i];
    if (keep.length >= minBeats && next > maxSec) break;
    keep.push(i);
    sec = next;
  }
  return withBeats(p, keep);
}

/** 고른 인덱스만 남긴 대본 (voice.beats 도 같이 자른다) */
function withBeats(p: BriefingProps, idx: number[]): BriefingProps {
  return {
    ...p,
    beats: idx.map((i) => p.beats[i]),
    voice: p.voice ? { ...p.voice, beats: idx.map((i) => p.voice!.beats[i] ?? null) } : undefined,
  };
}

/** 렌더 전 점검용 — 어떤 판이 몇 초인지 한눈에 */
export function variantReport(p: BriefingProps) {
  return (Object.keys(WINDOW) as Platform[]).map((k) => {
    const c = cutFor(p, k);
    const sec = totalSecOf(c);
    const w = WINDOW[k];
    return {
      platform: k,
      sec: +sec.toFixed(1),
      beats: c.beats.length,
      window: `${w.min}~${w.max}`,
      ok: sec >= w.min && sec <= w.max,
    };
  });
}
