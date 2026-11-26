'use client';

// ============================================================================
// AndroidBfHost — 안드로이드 블프 «진짜 할인» 자리 (2026-11-24 오후) · 앱 레이아웃에 «하나만» · 규칙은 lib/app/androidBf 머리말
// ----------------------------------------------------------------------------
// 두 입구: ① 자동(안드로이드 앱·이번 실행 시작 때 첫 실행 마침·블프 기간·시트 아직 안 봄 또는 웜 차례 — 가벼운 문만 여기서 보고 통과한 기기만 판정기를 싣는다)
//          ② 페이월의 블프 줄(BlackFridayLine)이 쏘는 창 이벤트(BF_OPEN_EVENT — iOS 와 같은 이벤트, iOS 쪽 BlackFridayHost 는 안드로이드에서 듣지 않는다).
// 웹·iOS·기간 밖은 판정기·시트를 한 바이트도 받지 않는다.
// ============================================================================

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { previewFlag } from '@/lib/app/proEntitlement';
import { readOnboardedAt } from '@/lib/app/trialAnnounce';
import { BF_OPEN_EVENT, bfLive, type MiniStore } from '@/lib/app/blackFriday';
import { ANDROID_BF_PREVIEW_FLAG, androidBfPreGate } from '@/lib/app/androidBf';
import { BF_PUSH_OPEN_EVENT } from '@/lib/app/bfPushTap';

const AndroidBfGate = dynamic(() => import('./AndroidBfGate').then((m) => m.AndroidBfGate), { ssr: false, loading: () => null });

function localStore(): MiniStore | null {
  try { return window.localStorage; } catch { return null; }
}

/** 안드로이드 앱인가(프리뷰 호스트의 확인 모드 ?sgbfa=1 · ?sgbfaw=1 포함 — 운영 도메인에선 previewFlag 가 항상 false) */
export function bfAndroidHere(): boolean {
  try {
    const cap = (globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
    if (cap?.isNativePlatform?.()) return cap.getPlatform?.() === 'android';
  } catch { /* 웹 */ }
  return previewFlag(ANDROID_BF_PREVIEW_FLAG) || previewFlag('sgbfaw');
}

let onboardedAtStart: boolean | null = null;

export function AndroidBfHost() {
  const [auto, setAuto] = useState(false);
  const [req, setReq] = useState(0);
  const [pushReq, setPushReq] = useState(0);

  useEffect(() => {
    const store = localStore();
    if (onboardedAtStart === null) onboardedAtStart = readOnboardedAt(store);
    const pass = () => androidBfPreGate({ android: bfAndroidHere(), onboardedAtStart: !!onboardedAtStart, store, now: Date.now() });
    // 네이티브 브리지 주입이 늦는 기기 대비 2초 뒤 한 번 더 · 날짜가 바뀐 뒤 앱이 다시 앞으로 오면 다시 본다(웜 이틀 간격)
    let t2 = 0;
    const t1 = window.setTimeout(() => {
      if (pass()) { setAuto(true); return; }
      t2 = window.setTimeout(() => { if (pass()) setAuto(true); }, 2_000);
    }, 0);
    const again = () => { if (document.visibilityState === 'visible' && pass()) setAuto(true); };
    document.addEventListener('visibilitychange', again);
    document.addEventListener('app:resume', again);
    const onOpen = () => { if (bfAndroidHere() && bfLive(Date.now())) setReq((n) => n + 1); };
    window.addEventListener(BF_OPEN_EVENT, onOpen);
    // ★11/26 블프 안내 푸시 탭(lib/app/bfPushTap)
    const onPush = () => { if (bfAndroidHere() && bfLive(Date.now())) setPushReq((n) => n + 1); };
    window.addEventListener(BF_PUSH_OPEN_EVENT, onPush);
    return () => {
      window.removeEventListener(BF_PUSH_OPEN_EVENT, onPush);
      window.clearTimeout(t1); window.clearTimeout(t2);
      document.removeEventListener('visibilitychange', again);
      document.removeEventListener('app:resume', again);
      window.removeEventListener(BF_OPEN_EVENT, onOpen);
    };
  }, []);

  return auto || req > 0 || pushReq > 0 ? <AndroidBfGate auto={auto} request={req} pushRequest={pushReq} /> : null;
}
