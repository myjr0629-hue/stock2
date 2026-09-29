'use client';

// ============================================================================
// 포지셔닝 지도 — 풋플로어(왼끝) ─ ◆맥스페인 ─ ●가격 ─ 콜월(오른끝)  (시안 01·02 .pm)
//   정의 검사를 통과한 레벨만 그린다(checkLevels). 아니면 «레벨 갱신 대기» 점선.
//   맥스페인 숫자가 끝 숫자와 겹치면 숫자만 숨기고 ◆ 는 남긴다(시안 규칙 · 375폭 지도 99px).
//   겹침은 «그려진 글자 폭»으로 잰다 — 글꼴이 늦게 오거나 안드로이드 글자 확대여도 맞다.
// ============================================================================

import { useLayoutEffect, useRef, useState } from 'react';
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
  const aRef = useRef<HTMLSpanElement>(null);
  const mRef = useRef<HTMLSpanElement>(null);
  const bRef = useRef<HTMLSpanElement>(null);
  // null = 아직 안 잼(첫 그림은 추정으로), true/false = 잰 결과
  const [fit, setFit] = useState<{ mid: boolean; ends: boolean } | null>(null);
  const [w, setW] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => setW(Math.round(entries[0]?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [levels.ok]);

  const g = levels.ok ? mapGeometry(levels) : null;

  useLayoutEffect(() => {
    if (!levels.ok || !g) return;
    // 첫 그림 전에 바로 잰다(ResizeObserver 는 한 박자 늦다) — 그 뒤 폭이 바뀌면 w 가 다시 부른다
    const width = w || Math.round(ref.current?.getBoundingClientRect().width ?? 0);
    if (!width) return;
    const aw = aRef.current?.offsetWidth ?? 0;
    const bw = bRef.current?.offsetWidth ?? 0;
    const mw = mRef.current?.offsetWidth ?? 0;
    const gap = 4;
    const ends = aw + bw + gap <= width;
    const x = g.mp * width;
    const mid = ends && !g.mpClamped && x - mw / 2 >= aw + gap && x + mw / 2 <= width - bw - gap;
    if (fit?.mid !== mid || fit?.ends !== ends) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 레이아웃 측정: 칠하기 전에 겹치는 숫자를 숨긴다
      setFit({ mid, ends });
    }
  }, [levels, g, w, fit]);

  if (!levels.ok || !g) {
    return (
      <span ref={ref} className={`${s.pm} ${s.pmNa}`} role="img" aria-label={labels.waitAria}>
        <i className={s.pmTk} />
        <span className={s.pmNaL}><WlIcon name="clock" />{labels.wait}</span>
      </span>
    );
  }

  const a = fmtLevel(levels.pf), m = fmtLevel(levels.mp), b = fmtLevel(levels.cw);
  // 재기 전(서버 렌더·첫 그림)에는 10px 글자 추정으로 판단한다
  const showMid = fit ? fit.mid : (!g.mpClamped && maxPainLabelFits(w, g.mp, a, m, b));
  const showEnds = fit ? fit.ends : true;
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
      <span ref={aRef} className={`${s.pmL} ${s.pmLa}`} aria-hidden="true" style={showEnds ? undefined : { visibility: 'hidden' }}>{a}</span>
      <span ref={mRef} className={`${s.pmL} ${s.pmLm}`} style={{ left: pct(g.mp), visibility: showMid ? undefined : 'hidden' }} aria-hidden="true">{m}</span>
      <span ref={bRef} className={`${s.pmL} ${s.pmLb}`} aria-hidden="true" style={showEnds ? undefined : { visibility: 'hidden' }}>{b}</span>
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
