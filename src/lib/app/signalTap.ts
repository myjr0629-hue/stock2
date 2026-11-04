/**
 * «내 종목 이상 신호» 푸시 탭 — 목적지·계측 출처 검증 (순수 함수, 2026-10-13). app-view/layout.tsx 가 쓴다.
 * 서버가 준 값을 그대로 믿지 않는다: 모양이 정확히 맞을 때만 쓴다.
 */
import { isFunnelSrc, type FunnelSrc } from '@/lib/app/funnelSchema';

/** 서버(lib/signals/copy.tapPathOf)가 싣는 /app-view/flow?t=NVDA&from=sig — 그 종목의 Flow 화면 하나뿐 */
export function signalTapPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  return /^\/app-view\/flow\?t=[A-Z][A-Z0-9.\-]{0,9}&from=sig$/.test(raw) ? raw : null;
}

/** 푸시 데이터의 계측 출처 — 닫힌 목록의 push_sig_* 일 때만. 아니면 null(계측 생략) */
export function signalFunnelSrc(raw: unknown): FunnelSrc | null {
  return typeof raw === 'string' && raw.startsWith('push_sig_') && isFunnelSrc(raw) ? raw : null;
}
