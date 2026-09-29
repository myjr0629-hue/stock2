'use client';

// ============================================================================
// 편집 모드 — 끌어서 순서 바꾸기(손잡이) · ⊖ 로 빼기(되돌리기 4초)
// 순서는 칩 줄(★ 내 종목 맨 앞)·대시보드 3줄·한도 시트의 담긴 종목에 그대로 쓰인다.
// 손잡이는 touch-action:none 이라 세로 스크롤과 다투지 않는다. 키보드: 손잡이에 초점 → 스페이스 → 화살표.
// ============================================================================

import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import { WlIcon } from '@/components/app/watchlist/icons';
import { removeStar } from '@/components/app/watchlist/starActions';
import { useAppWatchlist } from '@/lib/app/watchlist';
import { trackWatchlist } from '@/lib/app/watchlistAnalytics';
import { tickerName } from '@/lib/app/tickerNames';
import type { WlLocale } from '@/lib/app/watchlistInsights';
import p from './watchlist.module.css';

const T = {
  ko: { remove: (t: string) => `${t} 빼기`, drag: (t: string) => `${t} 순서 바꾸기`, hint: '손잡이를 끌어 순서를 바꿉니다 · 이 순서가 칩 줄과 대시보드에 그대로 쓰입니다' },
  en: { remove: (t: string) => `Remove ${t}`, drag: (t: string) => `Reorder ${t}`, hint: 'Drag the handle to reorder · this order is used in the chip rail and on the Dashboard' },
  ja: { remove: (t: string) => `${t}を外す`, drag: (t: string) => `${t}の順序を変更`, hint: 'ハンドルをドラッグして並べ替え · この順序がチップ列とダッシュボードに使われます' },
} as const;

function Row({ t, loc, name }: { t: string; loc: WlLocale; name: string }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: t });
  const c = T[loc];
  return (
    <div
      ref={setNodeRef}
      className={`${p.eRow} ${isDragging ? p.eDrag : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button type="button" className={p.eDel} aria-label={c.remove(t)} onClick={() => removeStar(t, 'list')}>
        <WlIcon name="minusCircle" />
      </button>
      <span className={p.eId}>
        <AppTickerLogo symbol={t} size={28} />
        <b>{t}</b>
        {name && <small>{name}</small>}
      </span>
      <button type="button" ref={setActivatorNodeRef} className={p.eGrip} aria-label={c.drag(t)} {...attributes} {...listeners}>
        <WlIcon name="grip" />
      </button>
    </div>
  );
}

export default function EditList({ loc }: { loc: WlLocale }) {
  const wl = useAppWatchlist();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const from = wl.tickers.indexOf(String(e.active.id));
    const to = e.over ? wl.tickers.indexOf(String(e.over.id)) : -1;
    if (from >= 0 && to >= 0 && from !== to && wl.move(from, to)) trackWatchlist('wl_reorder', { count: wl.count });
  };
  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={wl.tickers} strategy={verticalListSortingStrategy}>
          <div className={p.eList}>
            {wl.tickers.map((t) => <Row key={t} t={t} loc={loc} name={tickerName(t, loc)} />)}
          </div>
        </SortableContext>
      </DndContext>
      <p className={p.eHint}>{T[loc].hint}</p>
    </>
  );
}
