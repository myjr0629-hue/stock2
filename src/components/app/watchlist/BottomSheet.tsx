'use client';

// ============================================================================
// BottomSheet — 떠 있는 섬(좌우·아래 8px) 아래 시트 원형
// ----------------------------------------------------------------------------
// · 열리면 초점은 제목으로, 닫히면 누른 곳(트리거)으로 돌아간다(시안 06-G)
// · 안드로이드 뒤로가기 = 시트 닫기:
//     NativeAppProvider 가 이미 App 'backButton' 을 잡고 «canGoBack 이면 history.back()»을 한다.
//     여기서 backButton 리스너를 하나 더 걸면 «둘 다» 불려 시트도 닫히고 페이지도 뒤로 간다.
//     그래서 히스토리 한 칸을 얹고(popstate 로 닫힘) 그 경로를 그대로 탄다.
//     Next 15 는 window.history.pushState 를 감싸 내부 상태(__NA·트리)를 복사해 넣으므로
//     popstate 때 페이지가 다시 불리지 않는다(같은 URL 로 «복원»만 한다).
//     칸은 «얹은 순서»를 기억한다 — 두 층(시트 + 페이월)이 한꺼번에 닫히거나, 닫히면서 다른 화면으로
//     옮겨 가도 남은 칸을 차례로 걷는다(뒤로가기가 헛돌지 않게).
// · 겹친 층(검색 팝업 · 시트 · 페이월): 맨 위 층만 Esc·Tab 을 받고, 아래 층은 inert(초점·스크린리더가 닿지 않는다)
// · 아래로 밀어 닫기(손잡이·머리 영역) · 닫기 X(44×44) · 배경 누르면 닫기
// · 네이티브 광고 배너는 OS 가 웹뷰 «위»에 그려 시트를 덮는다 → 열린 동안 내린다
//   공용 훅 useBannerSuppression(열린 개수를 센다 — 겹쳐 열려도 마지막 하나가 닫힐 때만 돌아온다).
//   이 원형에서 부르므로 이 원형을 쓰는 시트는 전부 물려받는다.
// ============================================================================

import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import s from './watchlist.module.css';
import { WlIcon } from './icons';

const SHEET_STATE_KEY = '__sgSheet';

type Props = {
  open: boolean;
  onClose: () => void;
  /** 제목 요소 id 를 받아 aria-labelledby 로 건다 — 제목 요소에 tabIndex={-1} 과 id 를 달 것 */
  children: (ids: { titleId: string }) => ReactNode;
  variant?: 'pro' | 'cy' | 'plain';
  /** 닫기 X 를 그릴지(구독 시트는 Play 요건상 필수) */
  closeButton?: boolean;
  closeLabel: string;
  /** 닫힐 때 초점을 돌려줄 요소 */
  returnFocusTo?: HTMLElement | null;
  bodyClassName?: string;
};

/** 닫힌 층이 걷는 history.back() 이 끝나기를 기다리는 약속(없으면 null) */
let pendingBack: Promise<void> | null = null;
/** 칸을 얹은 순서(아래 → 위) — 뒤로가기가 «내 칸보다 아래로» 내려갔을 때만 그 층이 닫힌다 */
const tokenOrder = new Map<string, number>();
let tokenSeq = 0;
/** 층은 닫혔는데 칸이 아직 남아 있는 토큰 — 맨 위에 올라오면 걷는다 */
const closedTokens = new Set<string>();
let popWatchOn = false;

function currentToken(): string | null {
  try {
    const st = window.history.state as Record<string, unknown> | null;
    const v = st ? st[SHEET_STATE_KEY] : null;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

/** history.back() 한 번 — popstate 가 오거나(보통 수 ms) 450ms 가 지나면 끝 */
function backOnce(): Promise<void> {
  return new Promise<void>((resolve) => {
    let tid = 0;
    const done = () => {
      window.removeEventListener('popstate', done);
      window.clearTimeout(tid);
      resolve();
    };
    tid = window.setTimeout(done, 450);
    window.addEventListener('popstate', done);
    try { window.history.back(); } catch { done(); }
  });
}

/**
 * 맨 위 칸이 «닫힌 층»의 것이면 걷는다 — 여러 칸이 남았으면(시트 위 페이월이 함께 닫힘) 차례로 전부.
 * 앞선 걷기가 끝난 뒤에 이어 붙인다(한 번에 한 칸).
 */
function unwindClosed(): Promise<void> {
  const run: Promise<void> = (pendingBack ?? Promise.resolve())
    .then(async () => {
      for (let i = 0; i < 8; i += 1) {
        const tok = currentToken();
        if (!tok || !closedTokens.has(tok)) return;
        closedTokens.delete(tok);
        await backOnce();
      }
    })
    .catch(() => { /* 히스토리를 못 쓰면 칸이 남을 뿐 — 다음 뒤로가기에서 다시 걷는다 */ })
    .then(() => { if (pendingBack === run) pendingBack = null; });
  pendingBack = run;
  return run;
}

/**
 * 층이 닫히며 다른 화면으로 옮겨 가면(약관 링크·탭 이동) 그 칸은 새 화면 «아래»에 깔린다.
 * 뒤로가기로 그 칸에 내려앉는 순간 곧장 한 번 더 걷는다 — 같은 화면이 두세 번 되풀이되지 않게.
 */
function watchPops() {
  if (popWatchOn || typeof window === 'undefined') return;
  popWatchOn = true;
  window.addEventListener('popstate', () => {
    const tok = currentToken();
    if (tok && closedTokens.has(tok)) void unwindClosed();
  });
}

/**
 * 시트를 닫고 화면을 옮길 때 — 걷기(history.back)가 끝난 뒤에 이동해야 새 화면이 되돌려지지 않는다.
 * 닫기(setState) 직후에 불리므로, 한 번 양보해 시트의 정리(effect cleanup → pendingBack)가 돈 뒤에 본다.
 */
export function afterSheetHistory(): Promise<void> {
  return new Promise<void>((resolve) => {
    window.setTimeout(() => { void (pendingBack ?? Promise.resolve()).then(() => resolve()); }, 0);
  });
}
/**
 * 안드로이드 뒤로가기(=NativeAppProvider 의 history.back())·브라우저 뒤로가기로 닫히게 히스토리 한 칸을 얹는다.
 * 시트·검색 팝업·페이월이 같이 쓴다.
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  // ── 히스토리 한 칸(안드로이드 뒤로가기·브라우저 뒤로가기 = 닫기) ──
  //   닫힐 때 걷는 history.back() 은 비동기다. 곧바로 다른 시트가 열리면(길게 누르기 → 한도 시트)
  //   늦게 도착한 popstate 가 «새 시트»를 닫는다 → 걷기가 끝날 때까지 다음 한 칸을 미룬다.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    watchPops();
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const order = ++tokenSeq;
    tokenOrder.set(token, order);
    let alive = true;
    let pushed = false;
    let closedByPop = false;
    const onPop = () => {
      // 내 칸이거나 내 위의 칸(위 층의 칸을 걷는 중)이면 열린 채로 둔다 — 내 칸보다 아래로 내려갔을 때만 닫힌다
      const cur = currentToken();
      const at = cur ? tokenOrder.get(cur) ?? -1 : -1;
      if (at >= order) return;
      closedByPop = true;
      closeRef.current();
    };
    (async () => {
      if (pendingBack) await pendingBack;
      if (!alive) return;
      try {
        window.history.pushState({ ...(window.history.state || {}), [SHEET_STATE_KEY]: token }, '');
        pushed = true;
        window.addEventListener('popstate', onPop);
      } catch { /* 히스토리를 못 쓰면 X·배경·밀기로만 닫는다 */ }
    })();
    return () => {
      alive = false;
      window.removeEventListener('popstate', onPop);
      if (!pushed) return;
      // 이 칸은 이제 «닫힌 층»의 칸이다 — 맨 위에 있으면 지금 걷고(X·배경·밀기로 닫힘),
      // 다른 화면 아래에 깔렸으면 뒤로가기로 내려앉을 때 걷는다(watchPops).
      // 뒤로가기로 닫혔으면 칸은 이미 지나왔다 — 앞으로 가기로 되돌아오면 곧장 다시 걷도록 표시만 한다.
      closedTokens.add(token);
      if (closedByPop) return;
      void unwindClosed();
    };
  }, [open]);

}

// ── 겹친 층(검색 팝업 · 시트 · 페이월) ────────────────────────────────────
//   맨 위 층만 Esc 로 닫히고 Tab 을 가둔다. 아래 층은 inert — 페이월 아래 시트로 초점·스크린리더가 새지 않고,
//   Esc 한 번에 두 층이 같이 닫히지 않는다.
type Layer = { el: () => HTMLElement | null };
const layers: Layer[] = [];

function syncInert() {
  const top = layers[layers.length - 1];
  for (const l of layers) {
    const el = l.el();
    if (!el) continue;
    if (l === top) { el.removeAttribute('inert'); continue; }
    // 아래로 깔리는 층에 초점(입력칸)이 남아 있으면 놓는다 — 위 시트 위로 키보드가 다시 올라오지 않게
    const active = document.activeElement as HTMLElement | null;
    if (active && el.contains(active)) { try { active.blur(); } catch { /* noop */ } }
    el.setAttribute('inert', '');
  }
}

/**
 * 열린 동안 층 하나를 쌓는다. onEscape 는 이 층이 맨 위일 때만 불린다.
 * ref 를 주면 위에 다른 층이 뜬 동안 그 요소를 inert 로 둔다.
 * 돌려주는 isTop() 으로 자기 키보드 처리(Tab 가두기 등)를 맨 위일 때만 한다.
 */
export function useLayer(open: boolean, onEscape: () => void, ref?: RefObject<HTMLElement | null>): () => boolean {
  const escRef = useRef(onEscape);
  useEffect(() => { escRef.current = onEscape; }, [onEscape]);
  const mine = useRef<Layer | null>(null);
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const layer: Layer = { el: () => ref?.current ?? null };
    mine.current = layer;
    layers.push(layer);
    syncInert();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || layers[layers.length - 1] !== layer) return;
      e.preventDefault();
      escRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
      layer.el()?.removeAttribute('inert');
      if (mine.current === layer) mine.current = null;
      syncInert();
    };
  }, [open, ref]);
  return useCallback(() => mine.current !== null && layers[layers.length - 1] === mine.current, []);
}

export function BottomSheet({ open, onClose, children, variant = 'pro', closeButton = true, closeLabel, returnFocusTo, bodyClassName }: Props) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ y0: number; x0: number; t0: number; active: boolean; moved: boolean; dead: boolean } | null>(null);

  useBackToClose(open, onClose);
  // ── 네이티브 하단 배너 내리기(열린 동안) — 공용 훅, 겹쳐 열린 수를 센다 ──
  useBannerSuppression(open);
  // ── 층: 맨 위일 때만 Esc·Tab. 위에 페이월이 뜨면 이 시트는 inert ──
  //   초점 되돌리기(아래)보다 «먼저» 둔다 — 닫힐 때 아래 층(검색 팝업)의 inert 가 먼저 풀려야 트리거로 초점이 돌아간다
  const closeByKey = useCallback(() => onCloseRef.current(), []);
  const isTop = useLayer(open, closeByKey, sheetRef);

  // ── 초점: 열리면 제목, 닫히면 트리거 ──
  useEffect(() => {
    if (!open) return;
    const back = returnFocusTo ?? null;
    const id = window.setTimeout(() => {
      const title = document.getElementById(titleId);
      (title ?? sheetRef.current)?.focus({ preventScroll: true });
    }, 40);
    return () => {
      window.clearTimeout(id);
      if (back && document.contains(back)) {
        try { back.focus({ preventScroll: true }); } catch { /* noop */ }
      }
    };
  }, [open, titleId, returnFocusTo]);

  // ── Tab 가두기(맨 위 층일 때만 — Esc 는 useLayer 가 맡는다) ──
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !sheetRef.current || !isTop()) return;
      const f = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])',
      )).filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isTop]);

  // ── 아래로 밀어 닫기 — 본문이 맨 위에 있을 때 아래로 끄는 손짓만(iOS 시트와 같은 규칙) ──
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    const target = e.target as HTMLElement | null;
    const atTop = (bodyRef.current?.scrollTop ?? 0) <= 0;
    const noDrag = !!target?.closest('input, textarea, [data-nodrag]');
    drag.current = { y0: t.clientY, x0: t.clientX, t0: Date.now(), active: false, moved: false, dead: !atTop || noDrag };
  }, []);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const d = drag.current;
    if (!d || d.dead) return;
    const dy = e.touches[0].clientY - d.y0;
    const dx = Math.abs(e.touches[0].clientX - d.x0);
    if (!d.active) {
      if (dy < -4 || dx > 10) { d.dead = true; return; }   // 위로 스크롤·옆으로 → 끌기 아님
      if (dy > 8 && dy > dx) d.active = true;
    }
    if (d.active) { d.moved = true; setDragY(Math.max(0, dy)); }
  }, []);
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.active) return;
    const dy = dragY;
    const v = dy / Math.max(1, Date.now() - d.t0);
    if (d.moved) e.preventDefault();      // 끌기가 끝난 자리의 버튼이 눌리지 않게
    if (dy > 90 || v > 0.6) { setDragY(0); onCloseRef.current(); }
    else setDragY(0);
  }, [dragY]);

  if (!open) return null;

  const variantClass = variant === 'cy' ? s.sheetCy : variant === 'plain' ? s.sheetPlain : '';
  const dragHandlers = { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: () => { drag.current = null; setDragY(0); } };

  return (
    <>
      <div className={s.dim} onClick={() => onCloseRef.current()} aria-hidden="true" />
      <div
        ref={sheetRef}
        className={`${s.sheet} ${variantClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
        {...dragHandlers}
      >
        <div className={s.grabZone} aria-hidden="true"><span className={s.grab} /></div>
        {closeButton && (
          <button type="button" className={s.xbtn} onClick={() => onCloseRef.current()} aria-label={closeLabel}>
            <WlIcon name="x" />
          </button>
        )}
        <div ref={bodyRef} className={`${s.sheetBody} ${bodyClassName ?? ''}`}>
          {children({ titleId })}
        </div>
      </div>
    </>
  );
}
