'use client';

// ============================================================================
// 포지셔닝 지도 — 풋플로어(왼끝) ─ ◆맥스페인 ─ ●가격 ─ 콜월(오른끝)  (시안 01·02 .pm)
//   정의 검사를 통과한 레벨만 그린다(checkLevels). 아니면 «레벨 갱신 대기» 점선.
//   맥스페인 숫자가 끝 숫자와 겹치면 숫자만 숨기고 ◆ 는 남긴다(시안 규칙 · 375폭 지도 99px).
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { fmtLevel, mapGeometry, maxPainLabelFits, type LevelsVerdict } from '@/lib/app/watchlistInsights';
import { WlIcon } from './icons';
import s from './watchlist.module.css';

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

export function PositionMap({ levels, basisShort, labels }: {
  levels: LevelsVerdict;
  /** ● 의 이름(«9/28 종가» · «현재가») — 스크린리더용 */
  basisShort: string;
  labels: { putFloor: string; callWall: string; maxPain: string; wait: string; waitAria: string };
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(el.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [levels.ok]);

  if (!levels.ok) {
    return (
      <span ref={ref} className={`${s.pm} ${s.pmNa}`} role="img" aria-label={labels.waitAria}>
        <i className={s.pmTk} />
        <span className={s.pmNaL}><WlIcon name="clock" />{labels.wait}</span>
      </span>
    );
  }

  const g = mapGeometry(levels);
  const a = fmtLevel(levels.pf), m = fmtLevel(levels.mp), b = fmtLevel(levels.cw);
  const showMid = !g.mpClamped && maxPainLabelFits(w, g.mp, a, m, b);
  const aria = `${labels.putFloor} ${a}, ${labels.maxPain} ${m}, ${basisShort} ${fmtLevel(Number(levels.S.toFixed(2)))}, ${labels.callWall} ${b}`;

  return (
    <span ref={ref} className={s.pm} role="img" aria-label={aria}>
      <i className={s.pmTk} />
      <i
        className={s.pmSg}
        style={{
          left: pct(g.segLeft),
          width: pct(g.segWidth),
          background: `linear-gradient(${g.segFrom === 'left' ? 90 : 270}deg, rgba(251,191,36,.38), rgba(251,191,36,.06))`,
        }}
      />
      <i className={s.pmMp} style={{ left: pct(g.mp) }} />
      <i className={s.pmPx} style={{ left: pct(g.px) }} />
      <span className={`${s.pmL} ${s.pmLa}`} aria-hidden="true">{a}</span>
      {showMid && <span className={`${s.pmL} ${s.pmLm}`} style={{ left: pct(g.mp) }} aria-hidden="true">{m}</span>}
      <span className={`${s.pmL} ${s.pmLb}`} aria-hidden="true">{b}</span>
    </span>
  );
}

/** 범례의 작은 지도 */
export function MiniMap() {
  return (
    <span className={`${s.pm} ${s.pmMini}`} aria-hidden="true">
      <i className={s.pmTk} />
      <i className={s.pmMp} style={{ left: '30%' }} />
      <i className={s.pmPx} style={{ left: '66%' }} />
    </span>
  );
}
