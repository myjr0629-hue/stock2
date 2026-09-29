'use client';

// ============================================================================
// 길게 누르기 시트(시안 06-E) — 랭킹·무버·실적 캘린더·오늘의 발견·동종 행에서 0.4초
//   첫 줄: 내 종목에 추가(«4/5 · 무료 한도 안») / 이미 담겼으면 «내 종목에서 빼기»
//   다음: 플로우 보기 · 커맨드 보기
// 시트: 반경 28 · 떠 있는 섬 · 행 높이 56 · 반경 14 · 간격 6
// ============================================================================

import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import { FREE_LIMIT, useAppWatchlist } from '@/lib/app/watchlist';
import type { RowMeta } from '@/lib/app/watchlistUI';
import { fmtPrice, fmtSignedPct, type WlLocale } from '@/lib/app/watchlistInsights';
import { tickerName } from '@/lib/app/tickerNames';
import { wlCopy } from './copy';
import { WlIcon } from './icons';
import { addStar, removeStar } from './starActions';
import s from './watchlist.module.css';

export function LongPressSheet({ loc, ticker, meta, titleId, onClose, onNavigate }: {
  loc: WlLocale;
  ticker: string;
  meta?: RowMeta;
  titleId: string;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const c = wlCopy(loc);
  const wl = useAppWatchlist();
  const on = wl.has(ticker);
  const name = tickerName(ticker, loc, meta?.name);
  const px = typeof meta?.price === 'number' && meta.price > 0 ? meta.price : null;
  const ch = typeof meta?.changePct === 'number' && Number.isFinite(meta.changePct) ? meta.changePct : null;
  const dir = ch == null ? s.flat : ch > 0 ? s.up : ch < 0 ? s.dn : s.flat;

  return (
    <div className={s.lpBody}>
      <div className={s.lpH}>
        <AppTickerLogo symbol={ticker} size={30} />
        <div>
          <b id={titleId} tabIndex={-1}>{name ? `${ticker} · ${name}` : ticker}</b>
          {(px != null || ch != null) && (
            <small>
              {px != null ? fmtPrice(px) : ''}
              {px != null && ch != null ? ' · ' : ''}
              {ch != null && <span className={dir}><i className={s.tri} />{fmtSignedPct(ch, 2)}</span>}
            </small>
          )}
        </div>
      </div>

      <button
        type="button"
        className={s.lpA}
        onClick={async (e) => {
          const trigger = e.currentTarget;
          if (on) { removeStar(ticker, 'longpress'); onClose(); return; }
          onClose();
          await addStar(ticker, 'longpress', trigger);
        }}
      >
        <span className={`${s.tile} ${on ? s.tileStarOn : `${s.tEv} ${s.tileStar}`}`}><WlIcon name="star" /></span>
        <span>
          <b>{on ? c.lpRemove : c.lpAdd}</b>
          <small>{on ? c.lpRemoveSub : wl.isPro ? c.lpPro(wl.count) : c.lpFree(wl.count, FREE_LIMIT)}</small>
        </span>
      </button>
      <button type="button" className={s.lpA} onClick={() => { onClose(); onNavigate(`flow?t=${encodeURIComponent(ticker)}`); }}>
        <span className={`${s.tile} ${s.tCy}`}><WlIcon name="flow" /></span>
        <span><b>{c.lpFlow}</b><small>{c.lpFlowSub}</small></span>
      </button>
      <button type="button" className={s.lpA} onClick={() => { onClose(); onNavigate(`cmd?t=${encodeURIComponent(ticker)}`); }}>
        <span className={`${s.tile} ${s.tCy}`}><WlIcon name="term" /></span>
        <span><b>{c.lpCmd}</b><small>{c.lpCmdSub}</small></span>
      </button>
    </div>
  );
}
