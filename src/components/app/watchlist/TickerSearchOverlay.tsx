'use client';

// ============================================================================
// «내 종목» 검색해서 담기 — 가운데 팝업(커맨드 검색과 같은 문법: 대표 지시 «중간에 팝업으로»)
//   빈 입력: 자주 보는 종목(최근 본 + 인기) — 누르면 담기/빼기
//   입력 뒤: 티커·회사명 후보(/api/tickers/search) — 행 = 담기/빼기(상태는 aria-pressed), 오른쪽 ☆ 는 같은 동작의 형제 버튼
//   Enter  : 첫 후보(티커가 검색어와 같으면 그것)를 «담기만» — 이미 담긴 종목은 빼지 않는다.
//            지금 검색어의 결과가 오기 전(디바운스·응답 대기)에 누르면 그 결과가 온 뒤에 담는다.
//   상태   : 결과가 오기 전엔 «찾는 중…»(이전 결과가 있으면 흐리게 둔다), 검색 실패는 «결과 없음»과 따로(다시 시도)
//   초점   : 열릴 때 한 번만 입력칸으로 — 위에 한도 시트가 뜨면 이 팝업은 inert(키보드가 시트 위로 올라오지 않는다)
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { useAppWatchlist } from '@/lib/app/watchlist';
import type { WlLocale } from '@/lib/app/watchlistInsights';
import { StarButton, starToggleAria } from './StarButton';
import { useBackToClose, useLayer } from './BottomSheet';
import { addStar, toggleStar } from './starActions';
import { wlCopy } from './copy';
import { WlIcon } from './icons';
import s from './watchlist.module.css';

const POPULAR = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ', 'MU', 'AMD', 'PLTR'];

const T = {
  ko: { ph: '종목명 또는 티커', cancel: '닫기', freq: '자주 보는 종목 · 눌러서 담기', busy: '찾는 중…', none: '결과가 없습니다. 종목명이나 티커를 다시 확인해 주세요.' },
  en: { ph: 'Company or ticker', cancel: 'Close', freq: 'Frequently viewed · tap to add', busy: 'Searching…', none: 'No matches. Check the company name or ticker.' },
  ja: { ph: '銘柄名またはティッカー', cancel: '閉じる', freq: 'よく見る銘柄 · タップで追加', busy: '検索中…', none: '結果がありません。銘柄名かティッカーをご確認ください。' },
} as const;

type Hit = { symbol: string; name: string };
/** 검색 결과 — «어느 검색어의 결과인지»를 함께 둔다(늦게 온 응답·디바운스 중의 이전 결과를 지금 것으로 쓰지 않게) */
type Result = { q: string; hits: Hit[]; failed: boolean };

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem('app-recent-tickers') || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function toHits(raw: unknown): Hit[] {
  if (!Array.isArray(raw)) return [];
  const out: Hit[] = [];
  for (const x of raw) {
    const o = x as { symbol?: unknown; name?: unknown } | null;
    if (!o || typeof o.symbol !== 'string' || !o.symbol) continue;
    out.push({ symbol: o.symbol, name: typeof o.name === 'string' ? o.name : '' });
  }
  return out;
}

/** Enter = 첫 후보 «담기만»(티커가 검색어와 똑같은 후보가 있으면 그것). 이미 담긴 종목이면 addStar 가 아무것도 하지 않는다. */
function addTopHit(r: Result) {
  if (r.failed) return;
  const want = r.q.toUpperCase();
  const top = r.hits.find((h) => h.symbol.toUpperCase() === want) ?? r.hits[0];
  if (top) void addStar(top.symbol, 'search');
}

export function TickerSearchOverlay({ loc, onClose }: { loc: WlLocale; onClose: () => void }) {
  const t = T[loc];
  const c = wlCopy(loc);
  const wl = useAppWatchlist();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  /** Enter 를 눌렀는데 그 검색어의 결과가 아직 없다 — 결과가 오면 담는다(검색어가 바뀌면 취소) */
  const pendingEnter = useRef<string | null>(null);
  const [recent] = useState<string[]>(() => (typeof window === 'undefined' ? [] : readRecent()));

  // 부모가 다시 그려질 때마다 onClose 가 새 함수여도(60초 시계·30초 폴링·별 토글) 효과를 다시 돌리지 않는다
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const close = useCallback(() => onCloseRef.current(), []);

  useBackToClose(true, close);     // 안드로이드 뒤로가기 = 닫기
  useBannerSuppression(true);      // 네이티브 하단 배너가 팝업(결과 목록) 아래를 덮지 않게 — 열린 동안만
  useLayer(true, close, overlayRef);   // Esc 는 맨 위 층만 — 위에 한도 시트가 떠 있으면 그 시트만 닫힌다

  const freq = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const x of [...recent, ...POPULAR]) {
      const u = x.toUpperCase();
      if (!seen.has(u)) { seen.add(u); out.push(u); }
    }
    return out.slice(0, 12);
  }, [recent]);

  const query = q.trim();

  useEffect(() => {
    if (!query) return;
    let dead = false;
    const id = window.setTimeout(async () => {
      let next: Result;
      try {
        const r = await fetch(`/api/tickers/search?q=${encodeURIComponent(query)}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        next = { q: query, hits: toHits(j?.results), failed: false };
      } catch {
        next = { q: query, hits: [], failed: true };   // 오프라인·서버 오류는 «결과 없음»이 아니다
      }
      if (!dead) setRes(next);
    }, 180);
    return () => { dead = true; window.clearTimeout(id); };
  }, [query, attempt]);

  // 초점은 열릴 때 한 번만 — 다시 그릴 때마다 입력칸을 잡으면 한도 시트 위로 키보드가 다시 올라온다
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, []);

  /** 지금 검색어의 결과(없으면 아직 찾는 중) */
  const cur = res && res.q === query ? res : null;
  /** 찾는 동안 흐리게 남겨 둘 이전 결과 */
  const stale = !cur && res && !res.failed && res.hits.length > 0 ? res : null;

  // Enter 를 먼저 누른 경우 — 그 검색어의 결과가 오면 담는다
  useEffect(() => {
    if (!cur || pendingEnter.current !== cur.q) return;
    pendingEnter.current = null;
    addTopHit(cur);
  }, [cur]);

  const retry = () => { setRes(null); setAttempt((n) => n + 1); };

  const list = cur ?? stale;

  return (
    <div ref={overlayRef} className={s.srOverlay} onClick={close} role="presentation">
      <div className={s.srSheet} role="dialog" aria-modal="true" aria-label={t.ph} onClick={(e) => e.stopPropagation()}>
        <form className={s.srBar} onSubmit={(e) => {
          e.preventDefault();
          if (!query) return;
          if (!cur) { pendingEnter.current = query; return; }
          pendingEnter.current = null;
          addTopHit(cur);
        }}>
          <WlIcon name="search" />
          <input
            ref={inputRef}
            className={s.srInput}
            value={q}
            onChange={(e) => {
              const v = e.target.value;
              pendingEnter.current = null;
              setQ(v);
              if (!v.trim()) setRes(null);
            }}
            placeholder={t.ph}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-label={t.ph}
          />
          <button type="button" className={s.srCancel} onClick={close}>{t.cancel}</button>
        </form>

        {!query && (
          <div className={s.srSec}>
            <div className={s.srSecT}><span>{t.freq}</span></div>
            <div className={s.srChips}>
              {freq.map((sym) => {
                const on = wl.has(sym);
                return (
                  <button key={sym} type="button" className={`${s.srChip} ${on ? s.srChipOn : ''}`}
                    aria-pressed={on} aria-label={starToggleAria(sym, loc)}
                    onClick={(e) => { void toggleStar(sym, 'search', e.currentTarget); }}>
                    <AppTickerLogo symbol={sym} size={22} />
                    <span>{sym}</span>
                    <WlIcon name="star" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!!query && (
          <div className={`${s.srSec} ${!cur && stale ? s.dStale : ''}`} aria-busy={!cur}>
            {list && list.hits.length > 0 ? list.hits.map((r) => {
              const on = wl.has(r.symbol);
              return (
                <div key={r.symbol} className={s.srItem}>
                  <button type="button" className={s.srRow} aria-pressed={on} aria-label={starToggleAria(r.symbol, loc, r.name)}
                    onClick={(e) => { void toggleStar(r.symbol, 'search', e.currentTarget); }}>
                    <AppTickerLogo symbol={r.symbol} size={22} />
                    <span className={s.srSym}>{r.symbol}</span>
                    {r.name && <span className={s.srName}>{r.name}</span>}
                  </button>
                  {/* 행과 같은 동작 — 스크린리더에는 행 하나만 읽힌다 */}
                  <StarButton ticker={r.symbol} src="search" variant="row" decorative />
                </div>
              );
            }) : (
              <div className={s.srEmpty} role="status">
                {!cur ? t.busy : cur.failed ? (
                  <>
                    {c.searchFail} · <button type="button" className={s.srCancel} onClick={retry}>{c.retry}</button>
                  </>
                ) : t.none}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
