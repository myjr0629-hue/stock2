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

/** 플랫폼별 목표 창 (초) */
export const WINDOW: Record<Platform, { target: number; min: number; max: number }> = {
  yt: { target: 54, min: 48, max: 58 },     // 시청 시간 최적
  tt: { target: 34, min: 28, max: 38 },     // 완주율 최적
  reels: { target: 38, min: 30, max: 45 },  // 교육형 루프 최적
};

/** 대본 전체 길이(초) — 음성 실측이 있으면 그걸 따른다 */
export function totalSecOf(p: BriefingProps): number {
  const t = timingOf(p);
  return t.hookSec + t.beatSecs.reduce((a, b) => a + b, 0) + t.ctaSec + t.loopSec;
}

const prioOf = (b: Beat) => b.prio ?? 2;

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
