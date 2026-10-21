// 실제 Capacitor 프록시를 불러오기 전에 모의 네이티브 플랫폼을 정한다.
import { env } from '../scripts/test-fullscreen-ads.shim';
env.platform = process.env.SIGNUM_BANNER_TEST_PLATFORM || 'android';
(globalThis as any).CapacitorCustomPlatform = { name: env.platform, plugins: {} };
