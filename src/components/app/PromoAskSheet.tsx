'use client';

// ============================================================================
// PromoAskSheet — 혜택·할인 알림(광고성 푸시) 동의 한 번 묻기 카드 (판정기 PromoAskGate 가 기록을 마친 뒤에만 그린다)
// ----------------------------------------------------------------------------
// 틀은 ProPaywall 유리 카드(선물 안내와 같은 모양). 담는 것: 광고성 정보 수신 동의(선택) · 제목 · 무엇을 받는지(광고성) ·
//   (블프 기간이면) 블프 종료 전 안내 · 끄는 곳(설정 › 알림 › 혜택·할인 알림) · 선택 고지 · [받기]·[괜찮아요] 같은 무게.
// [받기] = 설정 토글과 같은 저장(lib/push/promoSave) → 답 기록 → 닫고 동의 일자 토스트(promoToast).
// [괜찮아요]·닫기·뒤로·바깥 = 거절(30일 뒤 한 번 더). 떠 있는 동안 네이티브 배너를 내린다.
// ============================================================================

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import p from './ProPaywall.module.css';
import s from './PromoAskSheet.module.css';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { useBackToClose, useLayer } from '@/components/app/watchlist/BottomSheet';
import { trackFunnel } from '@/lib/app/funnelBeacon';
import { bfLive } from '@/lib/app/blackFriday';
import { promoAskCopy, recordAnswer, type MiniStore, type PromoAskSrc } from '@/lib/app/promoAsk';
import { savePromoConsent } from '@/lib/push/promoSave';

function localStore(): MiniStore | null {
  try { return window.localStorage; } catch { return null; }
}

export function PromoAskSheet({ loc, src, onDone }: { loc: string; src: PromoAskSrc; onDone: (ans: 'yes' | 'no', saved: boolean) => void }) {
  const c = promoAskCopy(loc);
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  // 처음 초점은 닫기 단추(선물 안내와 같다) — 두 답 단추 중 하나에 초점 테두리가 생겨 «같은 무게»가 깨지지 않게
  const closeRef = useRef<HTMLButtonElement>(null);
  const answered = useRef(false);
  // 블프 기간 줄 — 처음 그릴 때 한 번만 판정(그리는 도중 바뀌지 않게)
  const [bf] = useState(() => { try { return bfLive(Date.now()); } catch { return false; } });

  const decline = useCallback(() => {
    if (answered.current) return;
    answered.current = true;
    recordAnswer(localStore(), 'no');
    trackFunnel('promo_ask_no', { src });
    onDone('no', false);
  }, [onDone, src]);

  useBackToClose(true, decline);
  useBannerSuppression(true);
  const isTop = useLayer(true, decline, sheetRef);

  useEffect(() => {
    const id = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 40);
    return () => window.clearTimeout(id);
  }, []);

  const trapTab = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !isTop()) return;
    const f = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled])')).filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, [isTop]);

  const accept = async () => {
    if (busy || answered.current) return;
    setBusy(true);
    answered.current = true;
    const r = await savePromoConsent(true);
    if (r === 'fail') {
      // 기기 저장도 못 했다 — 동의로 치지 않는다(거절과 같이 30일 뒤 다시)
      recordAnswer(localStore(), 'no');
      trackFunnel('promo_ask_no', { src });
      onDone('no', false);
      return;
    }
    recordAnswer(localStore(), 'yes');
    trackFunnel('promo_ask_yes', { src });
    onDone('yes', true);
  };

  return (
    <div
      className={p.overlay}
      style={{ zIndex: 10045 }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) decline(); }}
      data-promo-ask=""
    >
      <div ref={sheetRef} className={`${p.sheet} ${s.box}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapTab}>
        <button ref={closeRef} type="button" className={p.close} onClick={() => { if (!busy) decline(); }} aria-label={c.close}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className={p.head}>
          <span className={p.eyebrow}>{c.eyebrow}</span>
          <h1 className={p.title} id={titleId}>{c.title}</h1>
          <p className={s.body}>{c.body}</p>
          {bf ? <p className={s.body}>{c.bf}</p> : null}
          <p className={s.body}>{c.off}</p>
        </div>

        <div className={s.row}>
          <button type="button" className={s.btn} onClick={decline} disabled={busy}>{c.no}</button>
          <button type="button" className={s.btn} onClick={() => { void accept(); }} disabled={busy}>{c.yes}</button>
        </div>

        <p className={p.fine}>{c.fine}</p>
      </div>
    </div>
  );
}
