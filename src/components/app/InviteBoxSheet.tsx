'use client';

// ============================================================================
// InviteBoxSheet — «🎁 선물함» (2026-10-14, 브랜치 feat/viral-loop)
// ----------------------------------------------------------------------------
// 초대 링크로 «친구가 앱을 설치»하면 초대자에게 PRO 1개월 코드(애플 일회용·Play 일회용 — 기존 오퍼만)가 온다. 이 시트가 그 번호를 보여 준다.
//   notice=true : 새 번호가 왔을 때 대시보드에서 한 번 뜨는 «친구가 설치했어요» 알림(앱 안 알림 — 푸시가 아니다: 애플 4.5.4 는 홍보 푸시에 따로 받은 동의를 요구한다)
//   notice=false: 설정 › 선물함 행이 여는 목록
// [코드 사용하기] = 번호를 클립보드에 복사하고 «기존 코드 입력 창»을 연다(아이폰: 애플 코드 사용 시트 · 안드로이드: 구독 결제 창 안내) — lib/app/redeem.openRedeem.
//   틀은 ProPaywall 과 같은 유리 카드(앱 안 시트가 한 모양이게). 앱 동작은 선물 안내 시트와 같은 공용 훅(뒤로가기=닫기 · 배너 내리기 · 맨 위 층만 Esc·Tab).
// ============================================================================

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import p from './ProPaywall.module.css';
import s from './InviteBoxSheet.module.css';
import { GiftIcon } from './GiftIcon';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { useBackToClose, useLayer } from '@/components/app/watchlist/BottomSheet';
import { INVITE_COPY } from '@/lib/invite/copy';
import { toInviteLang } from '@/lib/invite/kinds';
import { openRedeem } from '@/lib/app/redeem';
import type { BoxState, BoxItemView } from '@/lib/invite/inboxClient';

async function copyText(v: string): Promise<boolean> {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(v); return true; } } catch { /* 아래 */ }
  try {
    const a = document.createElement('textarea');
    a.value = v; a.setAttribute('readonly', ''); a.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(a); a.select(); a.setSelectionRange(0, v.length);
    const ok = document.execCommand('copy'); a.remove(); return ok;
  } catch { return false; }
}

export function InviteBoxSheet({ locale, box, notice, onClose }: { locale: string; box: BoxState | null; notice: boolean; onClose: () => void }) {
  const lang = toInviteLang(locale);
  const c = INVITE_COPY[lang].box;
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [hint, setHint] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
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
    const f = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [href]')).filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, [isTop]);

  const items = box?.items ?? [];
  const friends = box?.friends ?? 0;
  const waiting = box?.waiting ?? 0;
  const anyIos = items.some((i) => i.os === 'ios');
  const anyAndroid = items.some((i) => i.os === 'android');

  const flash = (code: string) => {
    setCopiedCode(code);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopiedCode(null), 1600);
  };
  const onCopy = async (it: BoxItemView) => { if (await copyText(it.code)) flash(it.code); };
  const onUse = async (it: BoxItemView) => {
    const ok = await copyText(it.code);
    if (ok) { flash(it.code); setHint(true); }
    void openRedeem('settings', locale);
  };

  const title = notice ? c.noticeTitle : c.title;
  const lede = notice ? c.noticeSub : items.length === 0 ? c.empty : friends > 0 ? c.friends(friends) : '';

  return (
    <div className={p.overlay} style={{ zIndex: 10045 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} data-invite-box="">
      <div ref={sheetRef} className={`${p.sheet} ${s.box}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapTab}>
        <button ref={closeBtnRef} type="button" className={p.close} onClick={onClose} aria-label={c.close}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </button>

        <div className={p.head}>
          <span className={`${p.eyebrow} ${s.eyebrow}`}><GiftIcon size={13} />{c.title}</span>
          <h1 className={p.title} id={titleId}>{title}</h1>
          {lede && <p className={`${p.lede} ${s.lede}`}>{lede}</p>}
        </div>

        {items.length > 0 && (
          <ul className={s.list}>
            {items.map((it) => (
              <li key={it.code} className={s.item}>
                <p className={s.label}>{c.itemLabel}</p>
                <div className={s.row}>
                  <p className={s.code}>{it.code}</p>
                  <button type="button" className={s.copy} onClick={() => { void onCopy(it); }}>{copiedCode === it.code ? c.copiedBtn : c.copy}</button>
                </div>
                <button type="button" className={`${p.cta} ${s.use}`} onClick={() => { void onUse(it); }}>{c.use}</button>
              </li>
            ))}
          </ul>
        )}

        {hint && <p className={s.hint} role="status">{c.pasteHint}</p>}
        {waiting > 0 && <p className={s.waiting}>{c.waiting(waiting)}</p>}
        {(anyIos || anyAndroid) && (
          <p className={`${p.fine} ${s.fine}`}>{anyAndroid && !anyIos ? c.fineAndroid : c.fineIos}</p>
        )}
      </div>
    </div>
  );
}
