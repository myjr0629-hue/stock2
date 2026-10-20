// Evaluated before the real Capacitor core; no native SDK or network is used.
(globalThis as any).CapacitorCustomPlatform = { name: 'android', plugins: {} };
export {};
