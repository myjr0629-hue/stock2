'use client';

// ============================================================================
// TrialAnnounceHost — 기존 무료 사용자에게 «새로 생긴 PRO 7일 무료 체험» 1회 안내 자리 (2026-11-16 밤) · 앱 레이아웃에 «하나만»
// ----------------------------------------------------------------------------
// 판정·우선순위·기록은 lib/app/trialAnnounce 머리말. 여기는 가벼운 문(네이티브·첫 실행 마침·아직 안 봄)만 보고,
// 통과한 기기만 판정기(TrialAnnounceGate — 결제 SDK·페이월)를 불러온다. 이미 본 기기·웹·새 설치는 한 바이트도 더 받지 않는다.
// ============================================================================

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { isNativeShell } from '@/lib/app/onboardingConfig';
import { readOnboardedAt, trialAnnouncePreGate, type MiniStore } from '@/lib/app/trialAnnounce';

const TrialAnnounceGate = dynamic(() => import('./TrialAnnounceGate').then((m) => m.TrialAnnounceGate), { ssr: false, loading: () => null });

function localStore(): MiniStore | null {
  try { return window.localStorage; } catch { return null; }
}

// «이번 실행이 시작될 때» 첫 안내를 마쳤나 — 이번 실행 중에 첫 안내를 마친 새 사용자는 first_run 몫(재마운트돼도 처음 읽은 값)
let onboardedAtStart: boolean | null = null;

export function TrialAnnounceHost() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const store = localStore();
    if (onboardedAtStart === null) onboardedAtStart = readOnboardedAt(store);
    const pass = () => trialAnnouncePreGate({ native: isNativeShell(), onboardedAtStart: !!onboardedAtStart, store });
    // 첫 판정은 다음 틱에 · 네이티브 브리지 주입이 늦는 기기 대비 2초 뒤 한 번 더(그래도 아니면 이번 실행 끝)
    let t2 = 0;
    const t1 = window.setTimeout(() => {
      if (pass()) { setOn(true); return; }
      t2 = window.setTimeout(() => { if (pass()) setOn(true); }, 2_000);
    }, 0);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, []);
  return on ? <TrialAnnounceGate /> : null;
}
