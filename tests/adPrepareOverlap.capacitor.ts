import { FakeAdMob, env } from '../scripts/test-fullscreen-ads.shim';
import './adPrepareOverlap.platform';
import './interstitialFrequency.clock';
// @ts-expect-error -- 실제 기기와 같은 thenable Capacitor 프록시.
import { registerPlugin } from '../node_modules/@capacitor/core/dist/index.js';
export * from '../scripts/test-fullscreen-ads.shim';
env.platform = process.argv.includes('--android') ? 'android' : 'ios';
export const fake = new FakeAdMob();
export const AdMob: any = registerPlugin('AdMob', { [env.platform]: fake });
(globalThis as any).Capacitor.Plugins.AdMob = AdMob;
