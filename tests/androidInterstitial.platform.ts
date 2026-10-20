// 일일 상한 시험 중 실제 자정을 넘지 않도록 관리자 생성 전에 시계를 정오로 고정한다.
import './interstitialFrequency.clock';
// Evaluated before the real Capacitor core; no native SDK or network is used.
(globalThis as any).CapacitorCustomPlatform = { name: 'android', plugins: {} };
export {};
