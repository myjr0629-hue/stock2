'use client';

// ============================================================================
// 인사이트 칩 줄 — 칩 문장은 두 벌(긴·짧은). 폭에 맞춰 고르고 숫자는 절대 자르지 않는다(시안 규칙).
//   0: 긴 문장 한 줄 → 1: 짧은 문장 한 줄 → 2: 두 줄(칩마다 한 줄 — 자리가 생기니 다시 긴 문장부터)
//   → 3: 두 줄 + 짧은 문장 → 4: 칩 하나가 줄보다 넓을 때(큰 글자 확대 등) 칩 안에서 줄바꿈
// 예전엔 2단계가 «첫 칩 + "+1"»이라 두 번째 칩을 볼 방법이 없었다(9/29 검토 C4) — 이제 숨기지 않고 두 줄로 선다.
// 한 줄로 들어가면 늘 한 줄이 먼저다(행 높이를 늘리지 않는다). 칩이 하나면 두 줄로 나눌 것이 없어 1 → 4.
// 몇 줄이 될지는 칠하기 «전에» 잰다(useLayoutEffect) — 한 줄로 그렸다가 두 줄로 바뀌며 행이 들썩이는 틈이 없다.
// 무료 행의 잠긴 두 번째 칩(locked — 종류 이름 + PRO, 숫자·문장 없음)은 첫 칩보다 «먼저» 물러난다:
//   0단계에서 한 줄에 온전히 들어갈 때만 서고(말줄임 없이), 조금이라도 넘치면 통째로 숨긴 뒤 위 단계를 그대로 밟는다.
//   그래서 첫 칩은 잠금 칩 때문에 짧아지거나 잘리지 않는다. 두 번째 칩이 없는 행엔 부모가 locked 를 주지 않는다.
// 실제 그려진 DOM 으로 넘침을 잰다 — 폭이 바뀌거나(회전·글자 확대) 글꼴이 늦게 와도 처음 단계부터 다시 잰다.
// 부모가 key 로 칩 내용을 넘기므로 내용이 바뀌면 단계가 처음부터 다시 시작한다.
// ============================================================================

import { useLayoutEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { segText, toWlLocale, type InsightChip, type LockedChip, type Seg } from '@/lib/app/watchlistInsights';
import { wlCopy } from './copy';
import { WlIcon } from './icons';
import s from './watchlist.module.css';

const TONE: Record<InsightChip['tone'], string> = { ev: s.cEv, gam: s.cGam, lvl: s.cLvl, flow: s.cFlow, mp: s.cMp };

function Segs({ segs }: { segs: Seg[] }) {
  return <>{segs.map((x, i) => (typeof x === 'string' ? <span key={i}>{x}</span> : <b key={i}>{x.b}</b>))}</>;
}

export function ChipLine({ chips, locked = null, onLockTap }: {
  chips: InsightChip[];
  /** 무료 행에 «실제로 있는» 두 번째 칩의 종류(없으면 null — 아무것도 더하지 않는다) */
  locked?: LockedChip | null;
  /** 잠금 칩을 눌렀다(PRO 안내 시트). 행 누르기(종목 화면 이동)로 번지지 않게 여기서 전파를 끊는다 */
  onLockTap?: (el: HTMLElement) => void;
}) {
  const loc = toWlLocale(useLocale());
  const ref = useRef<HTMLSpanElement>(null);
  const lastW = useRef(0);
  const [level, setLevel] = useState(0);
  const [lockOff, setLockOff] = useState(false);
  const [width, setWidth] = useState(0);
  const [fontsTick, setFontsTick] = useState(0);

  // 폭이 바뀌면(회전·글자 확대) · 글꼴이 늦게 와서 글자 폭이 바뀌면 처음 단계부터 다시 잰다
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const restart = () => { setLevel(0); setLockOff(false); };
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        const w = Math.round(entries[0]?.contentRect.width ?? 0);
        if (lastW.current && lastW.current !== w) restart();
        lastW.current = w;
        setWidth(w);
      });
      ro.observe(el);
    }
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    const onFonts = () => { restart(); setFontsTick((x) => x + 1); };
    fonts?.addEventListener?.('loadingdone', onFonts);
    return () => {
      ro?.disconnect();
      fonts?.removeEventListener?.('loadingdone', onFonts);
    };
  }, []);

  const showLock = !!locked && !lockOff && level === 0;

  // 그리기 «전에» 넘침을 재서 맞는 모양을 고른다(한 프레임이라도 잘린 숫자·들썩이는 줄이 보이면 안 된다)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const texts = Array.from(el.querySelectorAll<HTMLElement>('[data-chip-t]'));
    const overflow = texts.some((t) => t.scrollWidth > t.clientWidth + 1);
    const rowOverflow = el.scrollWidth > el.clientWidth + 1;
    if (!overflow && !rowOverflow) return;
    if (showLock) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 레이아웃 측정: 잠금 칩이 먼저 물러난다(첫 칩은 긴 문장 그대로)
      setLockOff(true);
      return;
    }
    if (level >= 4) return;
    // 레이아웃 측정: 칠하기 전에 맞는 모양으로 바꾼다. 칩이 하나면 두 줄로 나눌 것이 없다 → 칩 안 줄바꿈(4)
    setLevel(level === 1 && chips.length < 2 ? 4 : level + 1);
  }, [level, width, chips.length, showLock, fontsTick]);

  if (!chips.length) return null;
  // ★2026-09-29 20시 — 화면 문구는 «늘 짧은 문장» 하나(행마다 긴/짧은 문장이 섞이면 같은 목록에서 «콜 월 345까지 +1.9%»와
  //   «콜 월 360 · +0.7%»가 나란히 보여 조잡하다 — 대표 원칙 «조잡하지 않게»). 긴 문장은 스크린리더(aria-label)가 읽는다.
  //   넘침 단계(두 줄·칩 안 줄바꿈)는 그대로 — 단계 1·3 은 짧은 문장이 이미 쓰여 바로 다음 단계로 넘어간다.
  const useShort = true;
  const cls = [s.chips, showLock ? s.chipsLk : '', level >= 2 ? s.chipsWrap : '', level >= 4 ? s.chipsFlow : ''].filter(Boolean).join(' ');

  return (
    <span ref={ref} className={cls}>
      {chips.map((c) => (
        <span key={c.kind} className={s.chip} aria-label={segText(c.long)}>
          <WlIcon name={c.icon} className={`${s.ci} ${TONE[c.tone]} ${c.icon === 'diamond' ? s.ciFill : ''}`} />
          <span className={s.chipT} data-chip-t="1" aria-hidden="true"><Segs segs={useShort ? c.short : c.long} /></span>
        </span>
      ))}
      {showLock && locked && (
        <button
          type="button"
          className={`${s.chip} ${s.chipLock}`}
          aria-label={wlCopy(loc).chipLockAria(locked.label)}
          onClick={(e) => { e.stopPropagation(); onLockTap?.(e.currentTarget); }}
        >
          <WlIcon name="lock" className={s.ci} />
          <span className={s.chipT} data-chip-t="1" aria-hidden="true">{locked.label}</span>
          <span className={s.chipPro} aria-hidden="true">PRO</span>
        </button>
      )}
    </span>
  );
}
