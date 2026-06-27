// ============================================================================
// NativePullToRefresh — DISABLED
// 네이티브 앱에서는 당겨서 새로고침이 "웹처럼 리로드되는" 느낌을 주어 제거함.
// 웹(브라우저)에서는 원래도 children만 통과시켰으므로 웹 동작은 100% 동일(영향 0).
// 동일 export 시그니처를 유지해 호출부(layout.tsx)는 변경 불필요.
// ============================================================================

'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
  onRefresh?: () => Promise<void>;
  threshold?: number;
}

export function NativePullToRefresh({ children }: Props) {
  return <>{children}</>;
}
