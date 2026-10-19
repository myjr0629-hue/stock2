// Evaluated before @capacitor/core: make the REAL core think it runs on a native
// platform ('ios'), with this test's fake as that platform's implementation.
(globalThis as any).CapacitorCustomPlatform = { name: 'ios', plugins: {} };
export {};
