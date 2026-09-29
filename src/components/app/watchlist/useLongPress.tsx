'use client';

// ============================================================================
// 목록 행 길게 누르기(0.4초) — 행 전체가 이미 버튼이라 «버튼 속 버튼»을 만들지 않는다(시안 06-D/E)
// ----------------------------------------------------------------------------
// · 0.4초 누르면 Medium 진동 1회 + 콜백(아래 시트)
// · 10px 넘게 움직이거나 스크롤이 시작되면(브라우저가 pointercancel) 취소
// · 길게 누른 뒤 손을 떼도 행의 원래 «탭 이동»이 일어나지 않게:
//     touchend 에서 preventDefault → 합성 click 자체가 안 생긴다(레이아웃·NativeAppProvider 의
//     문서 click 리스너까지 조용해진다). 마우스(웹 확인용)는 click 캡처에서 막는다.
// · iOS 콜아웃·글자 선택은 행에 붙는 lpRow 클래스(-webkit-touch-callout:none)가 막는다
// 한 목록에 훅 하나 — 동시에 눌리는 행은 하나뿐이라 상태를 나눠 쓴다.
// ============================================================================

import { useCallback, useEffect, useRef } from 'react';
import { hapticImpact } from '@/lib/native/capacitorBridge';
import { wlUI, type RowMeta } from '@/lib/app/watchlistUI';
import { useAppWatchlist } from '@/lib/app/watchlist';
import s from './watchlist.module.css';

const DELAY_MS = 400;
const MOVE_TOL = 10;

/** 길게 누르는 행에 붙일 클래스(콜아웃·선택 끄기) — 행의 원래 className 과 합쳐 쓴다 */
export const lpRowClass = s.lpRow;

export function useLongPress<P>(onLongPress: (payload: P, el: HTMLElement) => void) {
  const cb = useRef(onLongPress);
  useEffect(() => { cb.current = onLongPress; }, [onLongPress]);
  const st = useRef<{ timer: number | null; x: number; y: number; fired: boolean; pointerType: string } | null>(null);

  const cancel = useCallback(() => {
    const cur = st.current;
    if (cur?.timer) window.clearTimeout(cur.timer);
    if (cur) cur.timer = null;
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return useCallback((payload: P) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      cancel();
      if (e.pointerType === 'mouse' && e.button !== 0) { st.current = null; return; }
      const el = e.currentTarget;
      st.current = { timer: null, x: e.clientX, y: e.clientY, fired: false, pointerType: e.pointerType };
      const cur = st.current;
      cur.timer = window.setTimeout(() => {
        cur.timer = null;
        cur.fired = true;
        void hapticImpact('medium');
        cb.current(payload, el);
      }, DELAY_MS);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const cur = st.current;
      if (!cur?.timer) return;
      if (Math.abs(e.clientX - cur.x) > MOVE_TOL || Math.abs(e.clientY - cur.y) > MOVE_TOL) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onTouchEnd: (e: React.TouchEvent<HTMLElement>) => {
      if (st.current?.fired) e.preventDefault();
    },
    onClickCapture: (e: React.MouseEvent<HTMLElement>) => {
      if (st.current?.fired) {
        e.preventDefault();
        e.stopPropagation();
        st.current.fired = false;
      }
    },
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
      // 안드로이드 길게 누르기 메뉴 · 길게 누른 뒤의 우클릭 메뉴를 막는다
      const cur = st.current;
      if (cur && (cur.pointerType !== 'mouse' || cur.fired)) e.preventDefault();
    },
  }), [cancel]);
}

/**
 * 목록 화면용 — 행을 길게 누르면 «내 종목에 추가/빼기 · 플로우 보기 · 커맨드 보기» 시트.
 * 사용: const lp = useStarLongPress();  <a {...lp('NVDA', { price, changePct })} className={`${row} ${lpRowClass}`}>
 */
export function useStarLongPress() {
  const bind = useLongPress<{ t: string; meta?: RowMeta }>((p, el) => {
    wlUI.openSheet({ kind: 'longpress', ticker: p.t, src: 'longpress', meta: p.meta }, el);
  });
  return useCallback((t: string, meta?: RowMeta) => bind({ t, meta }), [bind]);
}

/**
 * 웹과 함께 쓰는 공용 컴포넌트(예: 가디언 모바일 흐름)에서 «앱일 때만» 훅을 부르기 위한 자리.
 * 부모가 앱 화면에서만 이 컴포넌트를 그리므로, 웹 렌더에는 훅이 아예 돌지 않는다.
 */
export function StarRowScope({ children }: {
  children: (tools: { bind: ReturnType<typeof useStarLongPress>; has: (t: string) => boolean; rowClass: string }) => React.ReactNode;
}) {
  const bind = useStarLongPress();
  const wl = useAppWatchlist();
  return <>{children({ bind, has: wl.has, rowClass: lpRowClass })}</>;
}
