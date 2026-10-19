// AdMob module for tests/adShowRestore.test.ts (selected by scripts/test-fullscreen-ads.cjs --entry).
// Unlike scripts/test-fullscreen-ads.shim.ts (a plain object), `AdMob` here is the REAL
// @capacitor/core registerPlugin proxy over the fake — the same object shape the app gets
// on a phone. That proxy answers `then` (and any other name) with a bridge wrapper, which
// is what made `async () => AdMob` hang in production (10/15~ full-screen impressions 0).
// Import order matters: base shim (globals, clock) → platform flag → real core.
import { FakeAdMob } from '../scripts/test-fullscreen-ads.shim';
import './adShowRestore.platform';
// Relative path on purpose: the runner aliases the bare '@capacitor/core' to the plain shim.
// @ts-expect-error -- untyped dist file; the typed signature is applied below.
import { registerPlugin as realRegisterPlugin } from '../node_modules/@capacitor/core/dist/index.js';
import type { registerPlugin as RegisterPlugin } from '@capacitor/core';
const registerPlugin = realRegisterPlugin as typeof RegisterPlugin;

export * from '../scripts/test-fullscreen-ads.shim';
export const fake = new FakeAdMob();
export const AdMob: any = registerPlugin<any>('AdMob', { ios: fake });
// UC / WIM read window.Capacitor.Plugins.AdMob — on device that is the same proxy.
(globalThis as any).Capacitor.Plugins.AdMob = AdMob;
