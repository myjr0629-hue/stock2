'use client';

// ============================================================================
// 편집 모드 — 끌어서 순서 바꾸기(손잡이) · ⊖ 로 빼기(되돌리기 4초)
// 순서는 Command·Flow 상단 종목 칩(하트 배지 · 내 종목 맨 앞)·Dashboard 3줄·한도 시트의 담긴 종목에 그대로 쓰인다.
// 손잡이는 touch-action:none 이라 세로 스크롤과 다투지 않는다. 키보드: 손잡이에 초점 → 스페이스 → 화살표.
// 스크린리더 안내(집음·옮김·놓음·취소)와 사용법은 앱 언어로 읽힌다(dnd-kit 기본값은 영어뿐이다).
// ============================================================================

import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import { WlIcon } from '@/components/app/watchlist/icons';
import { removeStar, warnIfNotSaved } from '@/components/app/watchlist/starActions';
import { wlCopy } from '@/components/app/watchlist/copy';
import { wlTickerName } from '@/components/app/watchlist/useWatchlistData';
import { useAppWatchlist } from '@/lib/app/watchlist';
import { trackWatchlist } from '@/lib/app/watchlistAnalytics';
import type { WlLocale } from '@/lib/app/watchlistInsights';
import p from './watchlist.module.css';

// «칩 줄»이 어디인지 모호했다 → 화면 이름(탭바처럼 영문)으로 밝힌다(C11·C12)
const T = {
  ko: { remove: (t: string) => `${t} 빼기`, drag: (t: string) => `${t} 순서 바꾸기`, hint: '손잡이를 끌어 순서를 바꿉니다 · 이 순서가 Dashboard와 Command·Flow 상단 종목 칩에 그대로 쓰입니다' },
  en: { remove: (t: string) => `Remove ${t}`, drag: (t: string) => `Reorder ${t}`, hint: 'Drag the handle to reorder · this order is used on the Dashboard and in the ticker chips on Command and Flow' },
  ja: { remove: (t: string) => `${t}を外す`, drag: (t: string) => `${t}の順序を変更`, hint: 'ハンドルをドラッグして並べ替え · この順序がDashboardと、Command・Flow上部の銘柄チップに使われます' },
} as const;

function Row({ t, loc, name }: { t: string; loc: WlLocale; name: string }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: t,
    attributes: { roleDescription: wlCopy(loc).dnd.role },
  });
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
    if (from >= 0 && to >= 0 && from !== to && wl.move(from, to)) {
      trackWatchlist('wl_reorder', { count: wl.count });
      warnIfNotSaved();   // 사생활 모드·용량 초과 — 바꾼 순서가 기기에 남지 않으면 알린다
    }
  };
  // 스크린리더 안내 — «NVDA, 5개 중 2번째 자리로 옮겼습니다»(자리 = 지금 목록 순서 기준 1부터)
  const d = wlCopy(loc).dnd;
  const n = wl.tickers.length;
  const pos = (id: string | number) => wl.tickers.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => d.start(String(active.id), pos(active.id), n),
    onDragOver: ({ active, over }) => (over ? d.over(String(active.id), pos(over.id), n) : d.out(String(active.id))),
    onDragEnd: ({ active, over }) => (over ? d.end(String(active.id), pos(over.id), n) : d.cancel(String(active.id))),
    onDragCancel: ({ active }) => d.cancel(String(active.id)),
  };
  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
        accessibility={{ announcements, screenReaderInstructions: { draggable: d.help } }}>
        <SortableContext items={wl.tickers} strategy={verticalListSortingStrategy}>
          <div className={p.eList}>
            {/* 이름 공급원은 목록·Dashboard 와 같다(이름표 → 실적 브리프 이름 · A14) */}
            {wl.tickers.map((t) => <Row key={t} t={t} loc={loc} name={wlTickerName(t, loc)} />)}
          </div>
        </SortableContext>
      </DndContext>
      <p className={p.eHint}>{T[loc].hint}</p>
    </>
  );
}
