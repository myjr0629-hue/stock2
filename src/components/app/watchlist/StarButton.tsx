'use client';

// ============================================================================
// 별(★) 버튼 — 시안 06-A/B 규격
//   기본: 선 #94A3B8 1.8px · 담김: 채움 #FBBF24 + 선 #F59E0B · 누르는 중: scale .92 120ms
//   한도 도달: 채우지 않고 한도 시트 · 터치 48×48 · 스크린리더 «내 종목에 추가, 버튼» /
//   담긴 뒤 «내 종목에서 빼기, 선택됨»(aria-pressed) · 색만이 아니라 모양(선 → 채움)도 바뀐다
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { useAppWatchlist, type WatchlistSource } from '@/lib/app/watchlist';
import { toggleStar } from './starActions';
import { WlIcon } from './icons';
import s from './watchlist.module.css';

export function starAria(t: string, on: boolean, locale: string): string {
  if (locale === 'ko') return on ? `${t} 내 종목에서 빼기` : `${t} 내 종목에 추가`;
  if (locale === 'ja') return on ? `${t} をマイ銘柄から外す` : `${t} をマイ銘柄に追加`;
  return on ? `Remove ${t} from My Watchlist` : `Add ${t} to My Watchlist`;
}

export function StarButton({
  ticker,
  src,
  variant = 'row',
  className,
}: {
  ticker: string;
  src: WatchlistSource;
  /** header: 커맨드 상단 바(검색 버튼과 같은 상자) · bare: 플로우 상단 바 · row: 검색 결과 행 */
  variant?: 'header' | 'bare' | 'row';
  className?: string;
}) {
  const locale = useLocale();
  const wl = useAppWatchlist();
  const on = wl.has(ticker);
  const [pop, setPop] = useState(false);
  const popTimer = useRef<number | null>(null);
  useEffect(() => () => { if (popTimer.current) window.clearTimeout(popTimer.current); }, []);

  const variantClass = variant === 'header' ? s.starHeader : variant === 'bare' ? s.starBare : s.starRow;

  return (
    <button
      type="button"
      className={`${className ?? ''} ${s.star} ${variantClass} ${on ? s.on : ''}`}
      aria-pressed={on}
      aria-label={starAria(ticker, on, locale)}
      onClick={async (e) => {
        e.stopPropagation();
        const r = await toggleStar(ticker, src, e.currentTarget);
        // 이 버튼이 담은 순간에만 팝(1→1.18→1). 움직임 줄이기는 CSS 가 끈다.
        if (r === 'added') {
          setPop(true);
          if (popTimer.current) window.clearTimeout(popTimer.current);
          popTimer.current = window.setTimeout(() => setPop(false), 280);
        }
      }}
    >
      <WlIcon name="star" className={pop ? s.pop : undefined} />
    </button>
  );
}

/** 로고 모서리 ★ — 담긴 종목 표시(버튼 아님) */
export function StarBadge({ variant = 'row', style }: { variant?: 'row' | 'chip' | 'mini'; style?: React.CSSProperties }) {
  const cls = variant === 'chip' ? s.badgeChip : variant === 'mini' ? s.badgeMini : s.badgeRow;
  return (
    <i className={`${s.badge} ${cls}`} style={style} aria-hidden="true">
      <WlIcon name="star" />
    </i>
  );
}

/** 목록 행의 로고 + (담겼으면) ★ 배지 */
export function LogoWithBadge({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className={s.logoWrap}>
      {children}
      {on && <StarBadge variant="row" />}
    </span>
  );
}
