'use client';

// ============================================================================
// BlackFridayHost — 블랙프라이데이 할인 안내 자리 (2026-11-22) · 앱 레이아웃에 «하나만» · 판정은 lib/app/blackFriday 머리말
// ----------------------------------------------------------------------------
// 두 입구: ① 자동 1회(iOS 앱·첫 실행 마침·기간 안·아직 안 봄 — 가벼운 문만 여기서 보고, 통과한 기기만 판정기를 싣는다)
//          ② 페이월·설정의 블프 줄(BlackFridayLine)이 쏘는 창 이벤트 — 언제든 같은 시트.
// 웹·안드로이드·이미 본 기기는 판정기·시트를 한 바이트도 받지 않는다(줄도 iOS 에서만 보인다).
// ============================================================================

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { previewFlag } from '@/lib/app/proEntitlement';
import { readOnboardedAt } from '@/lib/app/trialAnnounce';
import { BF_OPEN_EVENT, bfLive, bfPreGate, type MiniStore } from '@/lib/app/blackFriday';

const BlackFridayGate = dynamic(() => import('./BlackFridayGate').then((m) => m.BlackFridayGate), { ssr: false, loading: () => null });

function localStore(): MiniStore | null {
  try { return window.localStorage; } catch { return null; }
}

/** iOS 앱인가(프리뷰 호스트의 확인 모드 ?sgbf=1 포함 — 운영 도메인에선 previewFlag 가 항상 false) */
export function bfIosHere(): boolean {
  try {
    const cap = (globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
    if (cap?.isNativePlatform?.()) return cap.getPlatform?.() === 'ios';
  } catch { /* 웹 */ }
  return previewFlag('sgbf');
}

let onboardedAtStart: boolean | null = null;

export function BlackFridayHost() {
  const [auto, setAuto] = useState(false);
  const [req, setReq] = useState(0);

  useEffect(() => {
    const store = localStore();
    if (onboardedAtStart === null) onboardedAtStart = readOnboardedAt(store);
    const pass = () => bfPreGate({ ios: bfIosHere(), onboardedAtStart: !!onboardedAtStart, store, now: Date.now() });
    // 네이티브 브리지 주입이 늦는 기기 대비 2초 뒤 한 번 더(체험 안내와 같다)
    let t2 = 0;
    const t1 = window.setTimeout(() => {
      if (pass()) { setAuto(true); return; }
      t2 = window.setTimeout(() => { if (pass()) setAuto(true); }, 2_000);
    }, 0);
    const onOpen = () => { if (bfIosHere() && bfLive(Date.now())) setReq((n) => n + 1); };
    window.addEventListener(BF_OPEN_EVENT, onOpen);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.removeEventListener(BF_OPEN_EVENT, onOpen); };
  }, []);

  return auto || req > 0 ? <BlackFridayGate auto={auto} request={req} /> : null;
}
