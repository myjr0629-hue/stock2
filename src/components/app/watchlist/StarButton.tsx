'use client';

// ============================================================================
// 하트 버튼(«내 종목» 담기 토글) — 시안 06-A/B 규격. 모양은 별(★)에서 하트로 바꿨다(대표 9/29).
//   이름(StarButton·StarBadge·starActions·분석 이벤트 wl_star_*)은 그대로 둔다 — 호출부·이벤트 이력이 끊기지 않게.
//   기본: 빈 하트 선 #94A3B8 1.8px · 담김: 채움 #FBBF24 + 선 #F59E0B · 누르는 중: scale .92 120ms
//   한도 도달: 채우지 않고 한도 시트 · 터치 48×48 · 색만이 아니라 모양(선 → 채움)도 바뀐다
//   스크린리더: 레이블은 상태와 무관하게 고정(«NVDA, 내 종목») — 담김/안 담김은 aria-pressed 만 말한다
//   (예전 «내 종목에서 빼기, 선택됨»은 레이블과 상태가 같은 말을 두 번, 서로 다르게 했다)
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { useAppWatchlist, type WatchlistSource } from '@/lib/app/watchlist';
import { toggleStar } from './starActions';
import { WlIcon } from './icons';
import s from './watchlist.module.css';

/** «담기»·«빼기» 한 가지만 하는 버튼(원탭 담기 칩 등 — 토글이 아니다)의 레이블 */
export function starAria(t: string, on: boolean, locale: string): string {
  if (locale === 'ko') return on ? `${t} 내 종목에서 빼기` : `${t} 내 종목에 담기`;
  if (locale === 'ja') return on ? `${t} をマイ銘柄から外す` : `${t} をマイ銘柄に追加`;
  return on ? `Remove ${t} from My Watchlist` : `Add ${t} to My Watchlist`;
}

/** 토글(하트 · aria-pressed)의 레이블 — 상태와 무관하게 고정. 담겼는지는 aria-pressed(«선택됨»)가 말한다 */
export function starToggleAria(t: string, locale: string, name?: string | null): string {
  const who = name ? `${t} ${name}` : t;
  if (locale === 'ko') return `${who}, 내 종목`;
  if (locale === 'ja') return `${who}、マイ銘柄`;
  return `${who}, My Watchlist`;
}

export function StarButton({
  ticker,
  src,
  variant = 'row',
  className,
  decorative = false,
}: {
  ticker: string;
  src: WatchlistSource;
  /** header: 커맨드 상단 바(검색 버튼과 같은 상자) · bare: 플로우 상단 바 · row: 검색 결과 행 */
  variant?: 'header' | 'bare' | 'row';
  className?: string;
  /** 같은 행에 같은 동작의 버튼(행 자체)이 이미 있을 때 — 손가락으로는 그대로 누르되 스크린리더·Tab 에서는 한 번만 읽히게 */
  decorative?: boolean;
}) {
  const locale = useLocale();
  const wl = useAppWatchlist();
  const on = wl.has(ticker);
  const [pop, setPop] = useState(false);
  const popTimer = useRef<number | null>(null);
  useEffect(() => () => { if (popTimer.current) window.clearTimeout(popTimer.current); }, []);

  // 스토어 평점 요청은 여기서 부르지 않는다 — 담기 성공은 starActions.addStar 한 곳에서 세고(모든 담기 경로가 거친다)
  //   ReviewPromptMoments(앱 레이아웃)가 받아 요청한다. 예전 하트 전용 카운터 signum.wlAdds [3,12] 는 그리로 합쳤다(lib/app/reviewMoments.ts).

  const variantClass = variant === 'header' ? s.starHeader : variant === 'bare' ? s.starBare : s.starRow;

  return (
    <button
      type="button"
      className={`${className ?? ''} ${s.star} ${variantClass} ${on ? s.on : ''}`}
      aria-pressed={on}
      aria-label={starToggleAria(ticker, locale)}
      aria-hidden={decorative || undefined}
      tabIndex={decorative ? -1 : undefined}
      onClick={async (e) => {
        e.stopPropagation();
        // 숨긴(decorative) 하트로 한도 시트가 열리면, 닫힐 때 초점은 같은 행의 «보이는» 버튼으로 돌아간다
        const el = e.currentTarget;
        const trigger = decorative
          ? el.parentElement?.querySelector<HTMLElement>('button:not([aria-hidden="true"])') ?? el
          : el;
        const r = await toggleStar(ticker, src, trigger);
        // 이 버튼이 담은 순간에만 팝(1→1.18→1). 움직임 줄이기는 CSS 가 끈다.
        if (r === 'added') {
          setPop(true);
          if (popTimer.current) window.clearTimeout(popTimer.current);
          popTimer.current = window.setTimeout(() => setPop(false), 280);
        }
      }}
    >
      <WlIcon name="heart" className={pop ? s.pop : undefined} />
    </button>
  );
}

/** 로고 모서리 금색 하트 — 담긴 종목 표시(버튼 아님) */
export function StarBadge({ variant = 'row', style }: { variant?: 'row' | 'chip' | 'mini'; style?: React.CSSProperties }) {
  const cls = variant === 'chip' ? s.badgeChip : variant === 'mini' ? s.badgeMini : s.badgeRow;
  return (
    <i className={`${s.badge} ${cls}`} style={style} aria-hidden="true">
      <WlIcon name="heart" />
    </i>
  );
}

/** 목록 행의 로고 + (담겼으면) 하트 배지 */
export function LogoWithBadge({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className={s.logoWrap}>
      {children}
      {on && <StarBadge variant="row" />}
    </span>
  );
}
