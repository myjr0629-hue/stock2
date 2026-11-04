import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const Module = require('node:module');
const original = Module._load;
let current = 'ios';
let href = '';
const listeners: Record<string, () => void> = {};
(globalThis as any).window = { location: { set href(value: string) { href = value; } }, setTimeout: () => 0 };
(globalThis as any).document = { visibilityState: 'visible', addEventListener: (name: string, fn: () => void) => { listeners[name] = fn; }, removeEventListener: () => {} };
Module._load = function (name: string, ...args: unknown[]) {
  if (name === '@capacitor/core') return { Capacitor: { isNativePlatform: () => true, getPlatform: () => current } };
  return original.call(this, name, ...args);
};
async function run() {
  try {
    const path = require.resolve('../src/lib/native/capacitorBridge');
    for (const [platform, expected] of [['ios', 'itms-apps://apps.apple.com/app/id6783130444?action=write-review'], ['android', 'market://details?id=com.signumhq.app']]) {
      current = platform; delete require.cache[path];
      await require(path).openStoreReview();
      assert.equal(href, expected);
    }
    const src = fs.readFileSync('src/lib/native/capacitorBridge.ts', 'utf8');
    assert.match(src, /https:\/\/apps\.apple\.com\/app\/id\$\{id\.ios\}\?action=write-review/);

    // ④ 설정 — 평가 행은 이미 있다: 한 줄만, 자리 이동 없이(관문 11050112 ④)
    const settings = fs.readFileSync('src/app/[locale]/app-view/settings/page.tsx', 'utf8');
    assert.equal(settings.match(/openStoreReview\(\);/g)?.length, 1, '평가 행은 정확히 하나');
    const rate = settings.indexOf('openStoreReview();');
    const terms = settings.indexOf('app-view/terms`');
    assert.ok(rate > 0 && terms > rate, '평가 행은 기존 자리(약관 행 위)에 그대로');
    try {
      const main = execFileSync('git', ['show', 'origin/main:src/app/[locale]/app-view/settings/page.tsx'], { encoding: 'utf8' });
      assert.equal(settings, main, '설정 화면은 main 과 동일(순서·라벨 변경 없음)');
    } catch (e) {
      if ((e as { code?: string }).code !== 'ENOENT' && !String(e).includes('fatal')) throw e;
    }
    console.log('설정 스토어 링크 iOS·Android 분기 통과');
  } finally { Module._load = original; }
}
run().catch(e => { console.error(e); process.exit(1); });
