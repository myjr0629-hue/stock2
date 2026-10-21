/**
 * 로컬 프록시·가상 시계 시험. 네이티브 SDK·네트워크 호출 없음.
 * 실행: node scripts/test-fullscreen-ads.cjs --entry=tests/bannerRetry.test.ts
 * iOS: SIGNUM_BANNER_TEST_PLATFORM=ios 로 같은 명령 실행.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fake, AdMob, App, env, advance, flush, deferred, storage } from './bannerRetry.capacitor';
import { adManager } from '../src/services/adManager';

const loaded = 'bannerAdLoaded';
const failed = 'bannerAdFailedToLoad';
const requests: number[] = [];
const options: unknown[] = [];
let resumes = 0;
let hides = 0;
let appState: ((state: { isActive: boolean }) => void) | undefined;
let onRequest: () => Promise<void> = async () => {};
fake.showBanner = async (...args: unknown[]) => {
  requests.push(Date.now()); options.push(args[0]);
  await onRequest();
};
fake.resumeBanner = async () => { resumes++; };
fake.hideBanner = async () => { hides++; };
App.addListener = (async (_event: string, callback: typeof appState) => {
  appState = callback;
  return { remove: async () => {} };
}) as typeof App.addListener;

async function settle<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  void promise.then(() => { done = true; });
  await flush(); await flush();
  assert.equal(done, true, '프록시 then 오인 없이 호출이 완료되어야 한다');
  return promise;
}
async function ready() {
  storage.set('signum_app_first_run_at', '1');
  await adManager.setPro(false);
  await settle(adManager.init()); await flush();
  assert.ok(appState, '복귀 리스너 등록');
  assert.equal(typeof AdMob.then, 'function', '실제 Capacitor 프록시 사용');
}
async function resumeBurst() {
  for (let i = 0; i < 20; i++) appState!({ isActive: true });
  await flush(); await flush();
}
const cases: Record<string, () => Promise<void>> = {
  '연속 실패 간격과 10분 상한': async () => {
    onRequest = async () => { fake.emit(failed); };
    await ready();
    for (const delay of [30_000, 60_000, 120_000, 240_000, 480_000, 600_000, 600_000]) {
      const before = requests.length;
      await resumeBurst();
      advance(delay - 1); await flush(); await resumeBurst();
      assert.equal(requests.length, before, '만료 전 복귀로 백오프를 우회할 수 없음');
      advance(1); await resumeBurst();
      assert.equal(requests.length, before + 1, '타이머와 복귀가 겹쳐도 요청 1회');
      assert.equal(requests.at(-1)! - requests.at(-2)!, delay);
    }
  },
  '성공 이벤트 후 실패 간격 초기화': async () => {
    onRequest = async () => { fake.emit(failed); };
    await ready(); advance(30_000); await flush();
    onRequest = async () => {};
    advance(60_000); await flush();
    // showBanner Promise 완료는 로드 성공이 아니다.
    fake.emit(failed); await flush();
    const count = requests.length;
    advance(119_999); await flush(); assert.equal(requests.length, count);
    advance(1); await flush();
    fake.emit(loaded); await flush();
    fake.emit(failed); await flush(); // SDK 자동 새로고침 실패도 다시 30초부터
    advance(29_999); await resumeBurst(); assert.equal(requests.length, count + 1);
    advance(1); await flush(); assert.equal(requests.length, count + 2);
    fake.emit(loaded); await flush();
    advance(600_000); await flush(); assert.equal(requests.length, count + 2, '성공 후 재시도 예약 없음');
  },
  '자동 재시도는 6회까지이고 이후 복귀도 상한 간격 유지': async () => {
    onRequest = async () => { fake.emit(failed); };
    await ready();
    for (const delay of [30_000, 60_000, 120_000, 240_000, 480_000, 600_000]) {
      advance(delay); await flush();
    }
    assert.equal(requests.length, 7, '최초 1회와 자동 재시도 6회');
    advance(599_999); await resumeBurst(); assert.equal(requests.length, 7);
    advance(1); await flush(); assert.equal(requests.length, 7, '자동 재시도 중단');
    await resumeBurst(); assert.equal(requests.length, 8, '백오프 만료 후 복귀 시 한 번');
    advance(3_600_000); await flush(); assert.equal(requests.length, 8, '성공 전까지 자동 요청은 다시 늘어나지 않음');
  },
  '동시 복귀와 로드 완료 전 요청 합치기': async () => {
    await ready(); fake.emit(failed); await flush();
    const pending = deferred(); onRequest = () => pending.promise;
    advance(30_000); await resumeBurst();
    assert.equal(requests.length, 2);
    await resumeBurst(); assert.equal(requests.length, 2, '호출 Promise 대기 중 중복 없음');
    pending.resolve(); await flush();
    await resumeBurst(); assert.equal(requests.length, 2, 'Promise 완료 후 Loaded 대기 중 중복 없음');
    fake.emit(loaded); await flush();
    await resumeBurst(); assert.equal(requests.length, 2, '살아 있는 배너는 resume만 호출');
  },
  '이벤트와 Promise 거부를 한 실패로 처리': async () => {
    onRequest = async () => { fake.emit(failed); throw new Error('모의 로드 실패'); };
    await ready(); advance(30_000); await flush();
    assert.equal(requests.length, 2);
    advance(59_999); await resumeBurst(); assert.equal(requests.length, 2);
    advance(1); await flush(); assert.equal(requests.length, 3);
  },
  '이벤트 없는 Promise 거부도 백오프': async () => {
    onRequest = async () => { throw new Error('모의 브리지 실패'); };
    await ready();
    advance(29_999); await resumeBurst(); assert.equal(requests.length, 1);
    advance(1); await flush(); assert.equal(requests.length, 2);
    advance(59_999); await flush(); assert.equal(requests.length, 2);
    advance(1); await flush(); assert.equal(requests.length, 3);
  },
  '이전 요청의 늦은 거부는 새 로드를 훼손하지 않음': async () => {
    const old = deferred(); onRequest = () => old.promise;
    await adManager.setPro(false);
    void adManager.init(); await flush(); await flush();
    fake.emit(failed); await flush();
    onRequest = async () => {};
    advance(30_000); await flush(); assert.equal(requests.length, 2);
    old.reject(new Error('이전 모의 요청의 늦은 거부')); await flush();
    await resumeBurst(); assert.equal(requests.length, 2, '새 요청의 loading 유지');
    fake.emit(loaded); await flush();
    advance(600_000); await resumeBurst(); assert.equal(requests.length, 2, '이전 거부로 예약이 생기지 않음');
  },
  '팝업과 동일 Pro 판정은 백오프 유지': async () => {
    onRequest = async () => { fake.emit(failed); };
    await ready();
    for (let i = 0; i < 5; i++) {
      await adManager.setBannerSuppressed(true);
      await adManager.setBannerSuppressed(false);
      await adManager.setPro(false);
    }
    advance(29_999); await resumeBurst(); assert.equal(requests.length, 1);
    advance(1); await flush(); assert.equal(requests.length, 2);
  },
  '팝업 억제 중 예약 취소와 해제 후 남은 시간': async () => {
    onRequest = async () => { fake.emit(failed); };
    await ready(); advance(10_000);
    await adManager.setBannerSuppressed(true);
    advance(10_000); await flush();
    await adManager.setBannerSuppressed(false);
    advance(9_999); await flush(); assert.equal(requests.length, 1);
    advance(1); await flush(); assert.equal(requests.length, 2);
    await adManager.setBannerSuppressed(true);
    advance(600_000); await resumeBurst(); assert.equal(requests.length, 2);
    await adManager.setBannerSuppressed(false); await flush();
    assert.equal(requests.length, 3, '억제 중 만료됐으면 해제 시 한 번 요청');
    advance(119_999); await flush(); assert.equal(requests.length, 3, '실패 횟수도 유지');
  },
  'Pro 전환 중 취소와 만료 전 구독 해제': async () => {
    onRequest = async () => { fake.emit(failed); };
    await ready(); advance(10_000); await adManager.setPro(true);
    advance(10_000); await adManager.setPro(false);
    advance(9_999); await resumeBurst(); assert.equal(requests.length, 1);
    advance(1); await flush(); assert.equal(requests.length, 2);
    await adManager.setPro(true); advance(600_000); await resumeBurst();
    assert.equal(requests.length, 2, '구독 중 재요청 없음');
  },
  '정상 표시 옵션과 복귀 및 팝업 동작 유지': async () => {
    const heights: string[] = [];
    (document.documentElement.style as any).setProperty = (key: string, value: string) => {
      if (key === '--app-anchor-ad-height') heights.push(value);
    };
    await ready(); fake.emit(loaded); await flush();
    const first = options[0] as Record<string, unknown>;
    assert.equal(first.adSize, 'ADAPTIVE_BANNER');
    assert.equal(first.position, 'BOTTOM_CENTER');
    assert.equal(first.margin, 80, `${env.platform} 기존 기본 여백`);
    assert.ok(first.adId); assert.equal(first.isTesting, false);
    fake.emit('bannerAdSizeChanged', { height: 64 }); await flush();
    const before = resumes;
    await adManager.resumeBanner();
    await adManager.setBannerSuppressed(true);
    await adManager.setBannerSuppressed(false);
    assert.equal(requests.length, 1); assert.equal(hides, 1);
    assert.equal(resumes, before + 2);
    assert.equal(heights.at(-1), '64px', '성공 후 실측 높이와 슬롯 유지');
    const stats = Object.values(JSON.parse(storage.get('signum_ad_stats')!))[0] as Record<string, number>;
    assert.equal(stats.banner, 1, '기존 성공 통계 동작 유지');
    advance(600_000); await flush(); assert.equal(requests.length, 1);
  },
  '호출 Promise 미완료여도 복귀 등록과 실패 재시도': async () => {
    await adManager.setPro(false);
    onRequest = () => new Promise(() => {});
    let initialized = false; void adManager.init().then(() => { initialized = true; });
    await flush(); await flush();
    assert.equal(initialized, false, 'Android 기존 뷰의 미완료 Promise 모형');
    assert.ok(appState, '배너 호출 완료와 별개로 복귀 등록');
    fake.emit(failed); await flush();
    advance(29_999); await resumeBurst(); assert.equal(requests.length, 1);
    advance(1); await resumeBurst(); assert.equal(requests.length, 2);
  },
  '요청 준비 중 억제가 생기면 네이티브 요청 취소': async () => {
    await adManager.init(); await flush();
    const showing = adManager.setPro(false);
    const suppressing = adManager.setBannerSuppressed(true);
    await settle(showing); await settle(suppressing);
    assert.equal(requests.length, 0);
    await adManager.setBannerSuppressed(false); await flush();
    assert.equal(requests.length, 1, '억제 해제 후 다시 요청 가능');
  },
};

const selected = process.argv[2];
if (selected) {
  let completed = false;
  void cases[selected]().then(() => { completed = true; console.log(`✓ ${selected}`); })
    .catch(error => { completed = true; console.error(`✗ ${selected}`, error); process.exitCode = 1; });
  // 가상 타이머 때문에 영구 대기도 Node가 정상 종료할 수 있어 반드시 검출한다.
  process.on('beforeExit', () => {
    if (!completed) { console.error(`✗ ${selected}: 완료되지 않은 Promise`); process.exitCode = 1; }
  });
} else {
  let failures = 0;
  for (const name of Object.keys(cases)) {
    const result = spawnSync(process.execPath, [__filename, name], { encoding: 'utf8', timeout: 10_000 });
    process.stdout.write(result.stdout.split('\n').filter(line => /^[✓✗]/.test(line)).join('\n') + '\n');
    if (result.status !== 0) { failures++; process.stdout.write(result.stderr); }
  }
  console.log(`배너 재시도 (${env.platform} 실제 프록시): ${Object.keys(cases).length - failures} 통과, ${failures} 실패`);
  process.exitCode = failures ? 1 : 0;
}
