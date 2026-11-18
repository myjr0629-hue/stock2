'use client';

// ============================================================================
// TrialPushOptInHost — 체험자 알림 권한 다시 묻기 자리 (2026-11-18) · 앱 레이아웃에 «하나만»
// ----------------------------------------------------------------------------
// 판정·기록·문구는 lib/app/trialPushOptIn 머리말. 여기는 가벼운 문(네이티브·저장소 읽힘·아직 안 봄)만 보고,
// 통과한 기기만 판정기(TrialPushOptInGate — 결제 SDK·푸시 플러그인)를 불러온다. 이미 본 기기·웹은 한 바이트도 더 받지 않는다.
// 첫 실행을 «이번 실행에» 마치는 새 사용자(나중에 → 체험 → 내 종목)도 대상이라 첫 실행 완료는 여기서 보지 않는다(판정기가 트리거 때 본다).
// ============================================================================

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { isNativeShell } from '@/lib/app/onboardingConfig';
import { readShown, type MiniStore } from '@/lib/app/trialPushOptIn';

const TrialPushOptInGate = dynamic(() => import('./TrialPushOptInGate').then((m) => m.TrialPushOptInGate), { ssr: false, loading: () => null });

function localStore(): MiniStore | null {
  try { return window.localStorage; } catch { return null; }
}

export function TrialPushOptInHost() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // 설정 알림 OFF 는 여기서 보지 않는다 — 같은 실행에서 다시 켤 수 있어 판정기가 박자마다 본다(관문 8차)
    const pass = () => isNativeShell() && !readShown(localStore());
    // 첫 판정은 다음 틱에 · 네이티브 브리지 주입이 늦는 기기 대비 2초 뒤 한 번 더(TrialAnnounceHost 와 같다)
    let t2 = 0;
    const t1 = window.setTimeout(() => {
      if (pass()) { setOn(true); return; }
      t2 = window.setTimeout(() => { if (pass()) setOn(true); }, 2_000);
    }, 0);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, []);
  return on ? <TrialPushOptInGate /> : null;
}
