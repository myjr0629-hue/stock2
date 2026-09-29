'use client';

// ============================================================================
// 인사이트 칩 줄 — 칩 문장은 두 벌(긴·짧은). 폭에 맞춰 고르고 숫자는 절대 자르지 않는다(시안 규칙).
//   0: 전부 긴 문장 → 1: 전부 짧은 문장 → 2: 첫 칩(짧은) + «+1» → 3: 첫 칩(짧은)만
// 실제 그려진 DOM 으로 넘침을 잰다 — 글꼴이 늦게 오거나 안드로이드 글자 확대(textZoom)여도 맞다.
// 부모가 key 로 칩 내용을 넘기므로 내용이 바뀌면 단계가 처음부터 다시 시작한다.
// ============================================================================

import { useLayoutEffect, useRef, useState } from 'react';
import { segText, type InsightChip, type Seg } from '@/lib/app/watchlistInsights';
import { WlIcon } from './icons';
import s from './watchlist.module.css';

const TONE: Record<InsightChip['tone'], string> = { ev: s.cEv, gam: s.cGam, lvl: s.cLvl, flow: s.cFlow, mp: s.cMp };

function Segs({ segs }: { segs: Seg[] }) {
  return <>{segs.map((x, i) => (typeof x === 'string' ? <span key={i}>{x}</span> : <b key={i}>{x.b}</b>))}</>;
}

export function ChipLine({ chips }: { chips: InsightChip[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  const lastW = useRef(0);
  const [level, setLevel] = useState(0);
  const [width, setWidth] = useState(0);

  // 폭이 바뀌면(회전·글자 확대) 처음 단계부터 다시 잰다
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (lastW.current && lastW.current !== w) setLevel(0);
      lastW.current = w;
      setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 그리기 «전에» 넘침을 재서 맞는 문장을 고른다(한 프레임이라도 «±7.…» 가 보이면 안 된다)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || level >= 3) return;
    const texts = Array.from(el.querySelectorAll<HTMLElement>('[data-chip-t]'));
    const overflow = texts.some((t) => t.scrollWidth > t.clientWidth + 1);
    const rowOverflow = el.scrollWidth > el.clientWidth + 1;
    if (!overflow && !rowOverflow) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 레이아웃 측정: 칠하기 전에 맞는 문장으로 바꾼다
    setLevel(level === 1 && chips.length < 2 ? 3 : level + 1);
  }, [level, width, chips.length]);

  if (!chips.length) return null;
  const useShort = level >= 1;
  const shown = level >= 2 ? chips.slice(0, 1) : chips;
  const more = level === 2 ? chips.length - 1 : 0;

  return (
    <span ref={ref} className={s.chips}>
      {shown.map((c) => (
        <span key={c.kind} className={s.chip} aria-label={segText(useShort ? c.short : c.long)}>
          <WlIcon name={c.icon} className={`${s.ci} ${TONE[c.tone]} ${c.icon === 'diamond' ? s.ciFill : ''}`} />
          <span className={s.chipT} data-chip-t="1" aria-hidden="true"><Segs segs={useShort ? c.short : c.long} /></span>
        </span>
      ))}
      {more > 0 && <span className={`${s.chip} ${s.chipMore}`} aria-hidden="true">+{more}</span>}
    </span>
  );
}
