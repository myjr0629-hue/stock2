'use client';

// ============================================================================
// 실적 SEO 페이지(/[locale]/earnings · /[locale]/earnings/[symbol]) 폰 전용 하단 고정 «앱 받기» 띠 (2026-11-17)
//   · 왜: 9일간 iOS 사람 착지 약 132 → 설치 단추 클릭 0. 본문 CTA 는 스크롤 중간·끝에만 있고,
//     구글 앱·네이버·카카오톡 등 앱 안 브라우저에는 사파리 스마트 앱 배너가 뜨지 않는다.
//   · 링크는 기존 스마트링크 /app?from=seo_<ticker>_sticky&l=<loc> — 기기별 스토어 이동·집계(mkt:attr:hit)는 /app 이 그대로 한다.
//   · 서버 렌더·첫 그리기(하이드레이션)는 null — PC 는 마크업·배치가 글자 하나 안 바뀐다. 폰 UA 일 때만 마운트 뒤 그린다.
//   · 우리 앱(네이티브 셸) 안에서는 그리지 않는다 — StickyFoundingBar·PromoCodeChip 과 같은 판정(Capacitor 우선, sig_native 쿠키·html 클래스 폴백).
//   · 닫기(×)는 localStorage 에 시각을 적어 7일 숨긴다(저장소가 막힌 브라우저는 이번 화면에서만 숨김 — try/catch).
//   · 본문을 가리지 않게: 보이는 동안 body 아래 여백을 띠 높이만큼 더하고, 사라지면 원래 값으로 되돌린다.
//   · 폰 레이아웃의 하단 탭바(.native-bottom-nav, fixed)가 있으면 그 위에 띄운다(높이 실측).
// ============================================================================
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

export const APP_BAR_DISMISS_KEY = 'signumhq.seo.appbar.dismissedAt';
export const APP_BAR_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/** 폰(아이폰·아이패드·안드로이드)인가 — [locale]/layout 의 서버 판정(isMobileDevice)과 같은 정규식. */
export function isPhoneUa(ua: string): boolean {
  return /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
}

/** 우리 앱 안인가 — 쿠키·html 클래스(순수 판정, 시험용). Capacitor 확인은 detectNative 에서 먼저 한다. */
export function isNativeMarker(cookie: string, classes: string[]): boolean {
  return /(?:^|;\s*)sig_native=1(?:;|$)/.test(cookie)
    || classes.includes('native-app') || classes.includes('native-android') || classes.includes('native-ios')
    || classes.includes('is-app-view');
}

/** 닫은 지 7일이 안 됐으면 true. 값이 없거나 깨졌으면 false(보인다). */
export function isSnoozed(raw: string | null, nowMs: number): boolean {
  const at = Number(raw);
  return Number.isFinite(at) && at > 0 && nowMs - at >= 0 && nowMs - at < APP_BAR_SNOOZE_MS;
}

function detectNative(): boolean {
  try {
    if (require('@capacitor/core').Capacitor.isNativePlatform()) return true;
  } catch { /* 웹 */ }
  try {
    if (typeof document === 'undefined') return false;
    if (document.querySelector('.is-app-view')) return true;
    return isNativeMarker(document.cookie || '', Array.from(document.documentElement.classList));
  } catch { return false; }
}

function readSnoozed(): boolean {
  try { return isSnoozed(window.localStorage.getItem(APP_BAR_DISMISS_KEY), Date.now()); } catch { return false; }
}

const noSubscribe = () => () => {};
const getFalse = () => false;
const getShow = () => {
  try { return isPhoneUa(navigator.userAgent) && !detectNative() && !readSnoozed(); } catch { return false; }
};

const CSS = `
.ep-appbar{position:fixed;left:0;right:0;z-index:90;transform:translateY(120%);transition:transform .35s ease-out;font-family:Pretendard,system-ui,-apple-system,'Segoe UI',sans-serif}
.ep-appbar[data-in="1"]{transform:translateY(0)}
.ep-appbar-in{display:flex;align-items:center;gap:10px;background:#17191E;color:#fff;border-top:1px solid rgba(255,255,255,.08);box-shadow:0 -6px 18px rgba(0,0,0,.18);padding:10px 8px 10px 16px}
.ep-appbar img{flex:0 0 auto;width:36px;height:36px;border-radius:9px;display:block}
.ep-appbar-t{flex:1 1 auto;min-width:0;line-height:1.3}
.ep-appbar-t b{display:block;font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ep-appbar-t span{display:block;font-size:11px;line-height:1.3;color:#B5BCC6}
.ep-appbar-go{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border-radius:10px;background:#C2410C;color:#fff !important;text-decoration:none;font-size:14px;font-weight:900;white-space:nowrap}
.ep-appbar-x{flex:0 0 auto;width:32px;height:40px;display:inline-flex;align-items:center;justify-content:center;background:none;border:0;color:#8A939E;font-size:20px;line-height:1;cursor:pointer;padding:0}
`;

type Props = { href: string; line: string; sub: string; button: string; closeLabel: string };

export default function EarningsAppBar({ href, line, sub, button, closeLabel }: Props) {
  // 서버·하이드레이션 스냅샷은 false(아무것도 안 그림) — 그 뒤 실제 UA·쿠키·저장값
  const eligible = useSyncExternalStore(noSubscribe, getShow, getFalse);
  const [closed, setClosed] = useState(false);
  const [shown, setShown] = useState(false);
  const [navOffset, setNavOffset] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const show = eligible && !closed;

  useEffect(() => {
    if (!show) return;
    // setTimeout(rAF 아님) — 배경 탭·느린 기기에서 rAF 가 멈춰 띠가 화면 밖(translateY)에 남지 않게
    const id = window.setTimeout(() => {
      try {
        const nav = document.querySelector('.native-bottom-nav');
        setNavOffset(nav ? Math.round(nav.getBoundingClientRect().height) : 0);
      } catch { /* 0 = 바닥 */ }
      setShown(true);
    }, 50);
    return () => window.clearTimeout(id);
  }, [show]);

  // 본문을 가리지 않게 — 보이는 동안 body 아래 여백 += 띠 높이, 사라지면 원래 값
  useEffect(() => {
    if (!show) return;
    const body = document.body;
    const prev = body.style.paddingBottom;
    const base = parseFloat(window.getComputedStyle(body).paddingBottom) || 0;
    const apply = () => {
      const h = ref.current ? Math.ceil(ref.current.getBoundingClientRect().height) : 0;
      body.style.paddingBottom = `${base + h}px`;
    };
    apply();
    let ro: ResizeObserver | null = null;
    try { if (typeof ResizeObserver !== 'undefined' && ref.current) { ro = new ResizeObserver(apply); ro.observe(ref.current); } } catch { /* 첫 측정값 유지 */ }
    return () => { try { ro?.disconnect(); } catch { /* */ } body.style.paddingBottom = prev; };
  }, [show]);

  if (!show) return null;

  const dismiss = () => {
    try { window.localStorage.setItem(APP_BAR_DISMISS_KEY, String(Date.now())); } catch { /* 저장 불가 — 이번 화면에서만 숨김 */ }
    setClosed(true);
  };

  return (
    <div ref={ref} className="ep-appbar" data-in={shown ? '1' : '0'} data-app-bar="earnings" style={{ bottom: navOffset }} role="region" aria-label={button}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ep-appbar-in" style={{ paddingBottom: navOffset ? 10 : 'max(10px, env(safe-area-inset-bottom, 10px))' }}>
        <img src="/app-icons/signum-72.png" alt="" width={36} height={36} />
        <div className="ep-appbar-t">
          <b>{line}</b>
          <span>{sub}</span>
        </div>
        <a className="ep-appbar-go" href={href} rel="nofollow">{button}</a>
        <button type="button" className="ep-appbar-x" onClick={dismiss} aria-label={closeLabel}>×</button>
      </div>
    </div>
  );
}
