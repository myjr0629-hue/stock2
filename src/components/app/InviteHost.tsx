'use client';

// ============================================================================
// InviteHost — 추천 보상의 «앱 쪽 한 자리» (2026-10-14, 브랜치 feat/viral-loop) · 앱 레이아웃에 «하나만»
// ----------------------------------------------------------------------------
// ① 도착: 앱을 «새로 설치해 처음 실행»했을 때만 서버에 한 번 알린다(/api/invite/arrive). 서버가 같은 IP·기기 종류의 «초대 링크 열림»과 맞춰 초대자에게 보상을 적립한다.
//    새 설치인지는 «이번 실행이 시작될 때 첫 안내(AppFirstRunOnboarding)를 아직 안 마쳤나»로 정한다 — 기존 사용자는 이 기능이 들어온 날 'skip' 표식만 남긴다
//    (이미 설치한 사람이 «친구가 설치했다»로 세지 않게). 보내기 전에 앱을 닫았으면 'pending' 으로 남겨 72시간 안의 다음 실행이 다시 시도한다.
//    네이티브 앱에서만(웹·프리뷰는 아무것도 안 한다). 화면에는 아무것도 그리지 않는다.
// ② 선물함 알림: 공유를 한 번이라도 한 기기만 선물함을 읽는다(서버 호출을 아낀다 — 20분에 한 번 이하). 아직 안 보여 준 새 번호가 있으면 대시보드에서
//    «친구가 설치했어요» 시트를 «번호마다 한 번» 띄운다(다른 시트·결제 창이 떠 있으면 5초 뒤 한 번 더 보고 포기 — 다음 실행에 다시).
//    ※ 푸시가 아니라 «앱 안 알림»이다 — 애플 4.5.4 는 홍보 푸시에 따로 받은 동의를 요구한다(선물 1회 안내와 같은 이유).
// 시트는 띄울 때만 불러온다(레이아웃 번들은 가볍게 — GiftAnnounceHost 와 같은 방식).
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { isDashPath, localeFromPath, readOnboarded, type StoreLike } from '@/lib/gift/giftAnnounce';
import {
  ARRIVED_KEY, INBOX_MIN_GAP_MS, arrivalDecision, fetchInbox, markSeen, newItems, readBoxCache, readSeen, sendArrive, shouldCheckInbox,
  type BoxState,
} from '@/lib/invite/inboxClient';

const InviteBoxSheet = dynamic(() => import('./InviteBoxSheet').then((m) => m.InviteBoxSheet), { ssr: false });

function localStore(): StoreLike | null {
  try { return window.localStorage; } catch { return null; }
}
function isNativeApp(): boolean {
  try { return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.(); } catch { return false; }
}
const dialogOpen = () => !!document.querySelector('[aria-modal="true"]');

let boxCheckedAt = 0;

export function InviteHost() {
  const pathname = usePathname();
  const onboarded = useRef<boolean | null>(null);
  const arrivalRan = useRef(false);
  const [notice, setNotice] = useState<{ box: BoxState; locale: string } | null>(null);
  const pending = useRef<BoxState | null>(null);

  // 첫 안내를 «이번 실행이 시작될 때» 마쳤나 — 이번 실행 중에 마치는 새 설치는 여전히 «새 설치»다
  if (onboarded.current === null && typeof window !== 'undefined') onboarded.current = readOnboarded(localStore());

  // ① 도착 — 마운트 직후 한 번(네트워크가 같은 동안 맞출수록 정확하다)
  useEffect(() => {
    if (arrivalRan.current || !isNativeApp()) return;
    arrivalRan.current = true;
    const store = localStore();
    if (!store) return;
    let stored: string | null = null;
    try { stored = store.getItem(ARRIVED_KEY); } catch { return; }
    const d = arrivalDecision(stored, onboarded.current === true);
    if (d === 'wait') return;
    try {
      if (d === 'skip') { store.setItem(ARRIVED_KEY, 'skip'); return; }
      if (!stored) store.setItem(ARRIVED_KEY, `pending:${Date.now()}`);
    } catch { return; }
    void sendArrive().then((ok) => { if (ok) { try { store.setItem(ARRIVED_KEY, 'done'); } catch { /* 저장소 막힘 */ } } });
  }, []);

  // ② 선물함 — 대시보드에서(다른 화면에서 하던 일을 끊지 않는다)
  useEffect(() => {
    if (!isNativeApp() || notice || !isDashPath(window.location.pathname)) return;
    let t = 0;
    let dead = false;
    const show = (retried: boolean) => {
      const box = pending.current;
      if (dead || !box) return;
      if (dialogOpen()) { if (!retried) t = window.setTimeout(() => show(true), 5000); return; }
      const fresh = newItems(box.items, readSeen());
      if (!fresh.length) return;
      markSeen(fresh.map((i) => i.code));
      pending.current = null;
      setNotice({ box, locale: localeFromPath(window.location.pathname) });
    };
    const run = async () => {
      if (!shouldCheckInbox() || Date.now() - boxCheckedAt < INBOX_MIN_GAP_MS) {
        // 지난 조회 값(캐시)에 안 보여 준 번호가 있으면 그것으로
        const c = readBoxCache();
        if (c && newItems(c.items, readSeen()).length) { pending.current = c; t = window.setTimeout(() => show(false), 3500); }
        return;
      }
      boxCheckedAt = Date.now();
      const box = await fetchInbox();
      if (dead || !box) return;
      if (newItems(box.items, readSeen()).length) { pending.current = box; t = window.setTimeout(() => show(false), 3500); }
    };
    void run();
    return () => { dead = true; window.clearTimeout(t); };
  }, [pathname, notice]);

  // 화면을 옮기면(탭 이동·알림 딥링크) 떠 있던 알림은 닫는다 — 같은 번호는 다시 알리지 않는다(이미 «봤다» 표식)
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setNotice(null);
  }, [pathname]);

  if (!notice) return null;
  return <InviteBoxSheet locale={notice.locale} box={notice.box} notice onClose={() => setNotice(null)} />;
}
