import { FakeAdMob, env } from '../scripts/test-fullscreen-ads.shim';
import './androidInterstitial.platform';
// Match the proxy shape on a phone, including its thenable trap.
// @ts-expect-error -- untyped dist file, as in adShowRestore.capacitor.ts.
import { registerPlugin } from '../node_modules/@capacitor/core/dist/index.js';

export * from '../scripts/test-fullscreen-ads.shim';
env.platform = 'android';
export const fake = new FakeAdMob();
export const AdMob: any = registerPlugin('AdMob', { android: fake });
(globalThis as any).Capacitor.Plugins.AdMob = AdMob;
