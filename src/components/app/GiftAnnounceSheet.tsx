'use client';

// ============================================================================
// GiftAnnounceSheet — «🎁 친구에게 PRO 1개월 선물» 1회 안내 카드 (2026-10-08)
// ----------------------------------------------------------------------------
// 틀은 ProPaywall 과 같은 유리 카드(ProPaywall.module.css) — 앱 안 시트가 한 모양이게. 담는 것은 다섯 줄뿐:
//   새 기능 · 제목 · 부제(자동 갱신 고지 포함 — GIFT_COPY 그대로) · [선물 링크 보내기] · «설정에서 언제든»
// [선물 링크 보내기] = 설정 카드·대시보드 단추와 같은 공유(useGiftShare, 표면 gift_pop) — 클릭 핸들러에서 곧바로 부른다(iOS 제스처).
//   보냄 → 닫는다 · 링크 복사(안드로이드 셸) → «복사했어요» 한 줄 뒤 닫는다 · 취소 → 그대로 둔다(다시 누를 수 있게).
// 앱 동작은 쿠폰 안내 시트와 같은 공용 훅: 뒤로가기 = 닫기 · 네이티브 배너 내리기(광고 위에 겹치지 않게) · 맨 위 층만 Esc·Tab.
// ============================================================================

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import p from './ProPaywall.module.css';
import s from './GiftAnnounceSheet.module.css';
import { GiftIcon } from './GiftIcon';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { useBackToClose, useLayer } from '@/components/app/watchlist/BottomSheet';
import { GIFT_COPY, toGiftLang } from '@/lib/gift/gift';
import { useGiftShare } from '@/lib/gift/useGift';
import { GIFT_ANNOUNCE_COPY } from '@/lib/gift/giftAnnounce';

export function GiftAnnounceSheet({ locale, onClose }: { locale: string; onClose: () => void }) {
  const lang = toGiftLang(locale);
  const c = GIFT_COPY[lang];
  const a = GIFT_ANNOUNCE_COPY[lang];
  const { cfg, share } = useGiftShare(locale, 'gift_pop');
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useBackToClose(true, onClose);
  useBannerSuppression(true);
  const isTop = useLayer(true, onClose, sheetRef);

  useEffect(() => {
    const id = window.setTimeout(() => closeBtnRef.current?.focus({ preventScroll: true }), 40);
    return () => { window.clearTimeout(id); window.clearTimeout(timer.current); };
  }, []);

  const trapTab = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !isTop()) return;
    const f = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [href]'))
      .filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, [isTop]);

  const onSend = async () => {
    const out = await share();
    if (out === 'shared') { onClose(); return; }
    if (out === 'copied') {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(onClose, 2600);
    }
  };

  return (
    <div
      className={p.overlay}
      style={{ zIndex: 10045 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-gift-announce=""
    >
      <div ref={sheetRef} className={`${p.sheet} ${s.box}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapTab}>
        <button ref={closeBtnRef} type="button" className={p.close} onClick={onClose} aria-label={a.close}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className={p.head}>
          <span className={`${p.eyebrow} ${s.eyebrow}`}><GiftIcon size={13} />{a.eyebrow}</span>
          <h1 className={p.title} id={titleId}>{c.title}</h1>
          <p className={p.lede}>{cfg && !cfg.android ? c.subIosOnly : c.sub}</p>
        </div>

        <button type="button" className={`${p.cta} ${s.cta}`} onClick={() => { void onSend(); }} disabled={!cfg}>
          {a.cta}
        </button>

        {copied
          ? <p className={p.note} role="status">{c.copied}</p>
          : <p className={`${p.fine} ${s.later}`}>{a.later}</p>}
      </div>
    </div>
  );
}
