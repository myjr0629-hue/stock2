// shim 먼저, 실제 Capacitor core 다음에 평가한다. 외부 SDK/통신 없음.
(globalThis as any).CapacitorCustomPlatform = {
  name: process.argv.includes('--android') ? 'android' : 'ios', plugins: {},
};
export {};
