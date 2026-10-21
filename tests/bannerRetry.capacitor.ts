// 일반 객체 대신 실제 registerPlugin 프록시로 then 함정까지 시험한다.
import { FakeAdMob } from '../scripts/test-fullscreen-ads.shim';
import './bannerRetry.platform';
// @ts-expect-error -- 기존 프록시 시험과 같은 비타입 배포 파일.
import { registerPlugin } from '../node_modules/@capacitor/core/dist/index.js';

export * from '../scripts/test-fullscreen-ads.shim';
export const fake = new FakeAdMob();
export const AdMob: any = registerPlugin('AdMob', { ios: fake, android: fake });
(globalThis as any).Capacitor.Plugins.AdMob = AdMob;
