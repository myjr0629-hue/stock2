'use client';

// ============================================================================
// 길게 누르기 시트(시안 06-E) — 랭킹·무버·실적 캘린더·오늘의 발견·동종 행에서 0.4초
//   첫 줄: 내 종목에 추가(«4/5 · 무료 한도 안») / 이미 담겼으면 «내 종목에서 빼기»
//          PRO 여부를 확인하기 전엔 개수만(«3종목») — PRO 에게 «5/5 · 무료 한도 도달»을 잠깐이라도 보이지 않는다
//          «언제든 다시 담을 수 있습니다»는 사실일 때만(무료 한도보다 많이 가진 목록은 빼면 다시 못 담는다 → 개수·한도를 보인다)
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
  // 개수 설명 — PRO 는 «N종목 · PRO», 무료(확인 끝)는 «N/5 · 무료 한도 …», 확인 전엔 개수만
  const countLine = wl.isPro ? c.lpPro(wl.count) : wl.proReady ? c.lpFree(wl.count, FREE_LIMIT) : c.lpCount(wl.count);
  // 빼도 다시 담을 수 있는가 — PRO 이거나 빼고 나면 무료 한도 안(개수 ≤ 5)일 때만 «언제든 다시 담을 수 있습니다»
  const canReAdd = wl.isPro || wl.count <= FREE_LIMIT;

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
          // 한도에 걸리면 addStar 가 이 시트를 «한도 시트»로 바로 바꾼다 — 닫았다 다시 여는 틈이 없어야
          // 네이티브 배너가 그 사이에 올라왔다 내려가지 않는다(시트 → 시트는 한 번에)
          const r = await addStar(ticker, 'longpress', trigger);
          if (r !== 'limit') onClose();
        }}
      >
        <span className={`${s.tile} ${on ? s.tileStarOn : `${s.tEv} ${s.tileStar}`}`}><WlIcon name="star" /></span>
        <span>
          <b>{on ? c.lpRemove : c.lpAdd}</b>
          <small>{on && canReAdd ? c.lpRemoveSub : countLine}</small>
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
