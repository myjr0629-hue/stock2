'use client';

// ============================================================================
// «내 종목» 검색해서 담기 — 가운데 팝업(커맨드 검색과 같은 문법: 대표 지시 «중간에 팝업으로»)
//   빈 입력: 자주 보는 종목(최근 본 + 인기) — 누르면 담기/빼기
//   입력 뒤: 티커·회사명 후보(/api/tickers/search) — 행 = 담기/빼기, 오른쪽 ☆ 는 형제 버튼
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { useAppWatchlist } from '@/lib/app/watchlist';
import type { WlLocale } from '@/lib/app/watchlistInsights';
import { StarButton, starAria } from './StarButton';
import { useBackToClose } from './BottomSheet';
import { toggleStar } from './starActions';
import { WlIcon } from './icons';
import s from './watchlist.module.css';

const POPULAR = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ', 'MU', 'AMD', 'PLTR'];

const T = {
  ko: { ph: '종목명 또는 티커', cancel: '닫기', freq: '자주 보는 종목 · 눌러서 담기', busy: '찾는 중…', none: '결과가 없습니다. 종목명이나 티커를 다시 확인해 주세요.' },
  en: { ph: 'Company or ticker', cancel: 'Close', freq: 'Frequently viewed · tap to add', busy: 'Searching…', none: 'No matches. Check the company name or ticker.' },
  ja: { ph: '銘柄名またはティッカー', cancel: '閉じる', freq: 'よく見る銘柄 · タップで追加', busy: '検索中…', none: '結果がありません。銘柄名かティッカーをご確認ください。' },
} as const;

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem('app-recent-tickers') || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function TickerSearchOverlay({ loc, onClose }: { loc: WlLocale; onClose: () => void }) {
  const t = T[loc];
  const wl = useAppWatchlist();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ symbol: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [recent] = useState<string[]>(() => (typeof window === 'undefined' ? [] : readRecent()));
  useBackToClose(true, onClose);   // 안드로이드 뒤로가기 = 닫기
  useBannerSuppression(true);      // 네이티브 하단 배너가 팝업(결과 목록) 아래를 덮지 않게 — 열린 동안만

  const freq = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const x of [...recent, ...POPULAR]) {
      const u = x.toUpperCase();
      if (!seen.has(u)) { seen.add(u); out.push(u); }
    }
    return out.slice(0, 12);
  }, [recent]);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 1) return;
    let dead = false;
    const id = window.setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/tickers/search?q=${encodeURIComponent(query)}`).then((x) => x.json());
        if (!dead) setHits(Array.isArray(r?.results) ? r.results : []);
      } catch {
        if (!dead) setHits([]);
      } finally {
        if (!dead) setBusy(false);
      }
    }, 180);
    return () => { dead = true; window.clearTimeout(id); };
  }, [q]);

  // Esc 로 닫기 · 열리면 입력칸
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => { document.removeEventListener('keydown', onKey); window.clearTimeout(id); };
  }, [onClose]);

  const query = q.trim();

  return (
    <div className={s.srOverlay} onClick={onClose} role="presentation">
      <div className={s.srSheet} role="dialog" aria-modal="true" aria-label={t.ph} onClick={(e) => e.stopPropagation()}>
        <form className={s.srBar} onSubmit={(e) => { e.preventDefault(); if (hits[0]) void toggleStar(hits[0].symbol, 'search'); }}>
          <WlIcon name="search" />
          <input
            ref={inputRef}
            className={s.srInput}
            value={q}
            onChange={(e) => { setQ(e.target.value); if (!e.target.value.trim()) setHits([]); }}
            placeholder={t.ph}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-label={t.ph}
          />
          <button type="button" className={s.srCancel} onClick={onClose}>{t.cancel}</button>
        </form>

        {!query && (
          <div className={s.srSec}>
            <div className={s.srSecT}><span>{t.freq}</span></div>
            <div className={s.srChips}>
              {freq.map((sym) => {
                const on = wl.has(sym);
                return (
                  <button key={sym} type="button" className={`${s.srChip} ${on ? s.srChipOn : ''}`}
                    aria-pressed={on} aria-label={starAria(sym, on, loc)}
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
          <div className={s.srSec}>
            {hits.length > 0 ? hits.map((r) => (
              <div key={r.symbol} className={s.srItem}>
                <button type="button" className={s.srRow} onClick={(e) => { void toggleStar(r.symbol, 'search', e.currentTarget); }}>
                  <AppTickerLogo symbol={r.symbol} size={22} />
                  <span className={s.srSym}>{r.symbol}</span>
                  {r.name && <span className={s.srName}>{r.name}</span>}
                </button>
                <StarButton ticker={r.symbol} src="search" variant="row" />
              </div>
            )) : (
              <div className={s.srEmpty}>{busy ? t.busy : t.none}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
