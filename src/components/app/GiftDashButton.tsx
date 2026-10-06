'use client';

// ============================================================================
// GiftDashButton — 대시보드 맨 아래 «친구에게 PRO 1개월 선물» 작은 단추 1개 (2026-10-06, 브랜치 feat/gift-pro)
// ----------------------------------------------------------------------------
// · 서버가 선물 코드를 켠 때만(GIFT_PROMO_CODE → /api/gift/config) 그려진다 — 꺼져 있으면 null 이라 화면은 예전 그대로.
// · 눌림 = 선물 링크 공유(iOS 시스템 공유 시트 · 안드로이드 셸은 링크 복사 + «복사했어요» 토스트). 규칙·집계는 lib/gift 한 곳.
// · 토스트는 body 로 포털한다(ShareButton 과 같은 모양) — 대시보드의 transform·overflow 안에서 position:fixed 가 갇히지 않게.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GIFT_COPY, toGiftLang } from '@/lib/gift/gift';
import { useGiftShare } from '@/lib/gift/useGift';
import { GiftIcon } from './GiftIcon';
import s from './GiftDashButton.module.css';

export function GiftDashButton({ locale }: { locale: string }) {
  const { cfg, share } = useGiftShare(locale, 'gift_dash');
  const [toast, setToast] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!cfg) return null;
  const c = GIFT_COPY[toGiftLang(locale)];
  const onClick = async () => {
    const out = await share();
    if (out === 'copied') {
      setToast(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setToast(false), 2600);
    }
  };
  return (
    <div className={s.wrap} data-gift-dash="">
      <button type="button" className={s.btn} onClick={() => { void onClick(); }}>
        <GiftIcon size={16} />
        <span>{c.dashLabel}</span>
      </button>
      {toast && typeof document !== 'undefined' && createPortal(
        <div role="status" aria-live="polite" style={{
          position: 'fixed', left: '50%', top: '46%', transform: 'translate(-50%, -50%)', zIndex: 2147483000,
          width: 'max-content', maxWidth: 'calc(100vw - 32px)', padding: '11px 18px', borderRadius: 999,
          background: 'rgba(15,23,42,0.94)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
          font: "700 13px/1.35 -apple-system, 'SF Pro Text', 'Segoe UI', Pretendard, sans-serif",
          textAlign: 'center', pointerEvents: 'none',
        }}>
          {c.copied}
        </div>,
        document.body,
      )}
    </div>
  );
}

export default GiftDashButton;
