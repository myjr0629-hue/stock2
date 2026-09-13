#!/usr/bin/env node
/**
 * 네이티브 설정 감사기 — «소스를 고쳤다»와 «기기에 반영됐다»의 간극을 잡는다.
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 존재하는가]  2026-09-13 사고.
 *   대표 보고: 앱을 켜둔 채 시간이 지난 뒤 «전환»해 돌아오거나 전면광고를 닫으면,
 *   앱은 그대로인데 크롬 창이 따로 뜨고 거기 앱이 «처음 실행된 것처럼» 보인다.
 *
 *   원인(Capacitor iOS 소스 실측):
 *     WebViewDelegationHandler.decidePolicyFor 는
 *       1) config.shouldAllowNavigation(host)          ← allowNavigation 목록
 *       2) navURL.starts(with: config.serverURL «전체 문자열»)
 *     둘 중 하나라도 통과해야 앱 안에서 처리한다. 아니면 UIApplication.open() 이다.
 *     allowNavigation 이 비어 있으면 1)은 항상 false 이고, serverURL 이
 *     `https://www.signumhq.com/en/app-view/dash` 처럼 «경로까지» 들어 있으면
 *     **같은 도메인의 다른 경로도 전부 시스템 브라우저로 나간다.**
 *
 *   그런데 이 사고는 정상적인 테스트로는 잡히지 않는다:
 *     · 기기에 들어가는 capacitor.config.json 은 **gitignore** 라 커밋 검토로 못 본다
 *     · 이 판정은 «전체 페이지 로드»에서만 발동하는데, 앱을 쓰는 동안엔 Next 가
 *       pushState 로만 움직여 발동조차 안 한다
 *     · 발동하려면 WebView 가 메모리 압박으로 폐기될 만큼 시간이 지나야 한다
 *   → 5분 테스트는 100% 통과하고 실사용에서만 터진다. 그래서 «기계»가 잡아야 한다.
 *
 *   덧붙여 그날의 진짜 실수는 설정을 고치고 **cap sync 를 안 돌린 것**이었다.
 *   소스는 맞는데 기기는 틀린 상태가 조용히 유지됐다. 이 검사기는 그것도 잡는다.
 *
 * 사용:  node scripts/audit-native-config.js
 * 종료코드: 위반이 있으면 1
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const problems = [];
const notes = [];

const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return null; } };
const readJson = (p) => { const t = read(p); if (!t) return null; try { return JSON.parse(t); } catch { return null; } };

// ── 1. 소스: 프로덕션 분기에 allowNavigation 이 있는가 ──────────────────
const src = read('capacitor.config.ts');
if (!src) {
  problems.push('capacitor.config.ts 를 읽을 수 없다.');
} else {
  // server 블록이 3개(라이브리로드/프리뷰/프로덕션)인데 예전엔 프로덕션에만 빠져 있었다.
  const allowCount = (src.match(/allowNavigation\s*:/g) || []).length;
  const urlCount = (src.match(/url\s*:\s*['"`]/g) || []).length;
  if (allowCount < urlCount) {
    problems.push(
      `capacitor.config.ts: server 분기 ${urlCount}개 중 allowNavigation 은 ${allowCount}개뿐이다. ` +
      '«실제로 배포되는» 프로덕션 분기가 빠져 있으면 개발 중엔 절대 안 걸린다.'
    );
  }
}

// ── 2. 생성물: 동기화가 실제로 됐는가 + 값이 맞는가 ─────────────────────
const TARGETS = [
  { label: 'iOS',     file: 'ios/App/App/capacitor.config.json' },
  { label: 'Android', file: 'android/app/src/main/assets/capacitor.config.json' },
];

// 빌드 산출물까지 본다 — 여기 낡은 값이 남아 있으면 «빌드가 낡은» 것이다.
const BUILT = [
  'android/app/build/intermediates/assets/release/mergeReleaseAssets/capacitor.config.json',
  'ios/App/build-device/Build/Products/Debug-iphoneos/App.app/capacitor.config.json',
];

const hostOf = (u) => { try { return new URL(u).hostname; } catch { return null; } };
const matchesPattern = (host, pattern) => {
  if (pattern === '*') return true;
  const h = host.toLowerCase().split('.');
  const p = pattern.toLowerCase().split('.');
  if (h.length !== p.length) return false;          // Capacitor 와 같은 규칙
  return p.every((seg, i) => seg === '*' || seg === h[i]);
};

function checkGenerated(label, file, { fatal }) {
  const cfg = readJson(file);
  if (!cfg) {
    (fatal ? problems : notes).push(`${label}: ${file} 없음 — cap copy 를 돌린 적이 없다.`);
    return;
  }
  const server = cfg.server || {};
  const url = server.url;
  if (!url) { notes.push(`${label}: server.url 없음(로컬 자산 앱) — 건너뜀`); return; }

  const host = hostOf(url);
  const allow = server.allowNavigation;

  if (!Array.isArray(allow) || allow.length === 0) {
    (fatal ? problems : notes).push(
      `${label}: server.allowNavigation 이 비어 있다 (${file}).\n` +
      `      → allowNavigation 이 없으면 Capacitor 는 «${url}» 로 시작하지 않는\n` +
      `        모든 전체 페이지 로드를 시스템 브라우저로 넘긴다.\n` +
      `        같은 도메인의 다른 경로도 포함된다. 이게 «크롬 창이 따로 뜨는» 버그다.`
    );
    return;
  }
  if (host && !allow.some((p) => matchesPattern(host, p))) {
    (fatal ? problems : notes).push(
      `${label}: allowNavigation 이 server.url 의 호스트(${host})를 덮지 못한다 → ${JSON.stringify(allow)}`
    );
    return;
  }

  // 경로까지 들어간 server.url 은 그 자체로 위험 신호다(접두사 비교라서).
  try {
    const p = new URL(url).pathname;
    if (p && p !== '/') {
      notes.push(`${label}: server.url 에 경로가 들어 있다(${p}). allowNavigation 이 있어 지금은 안전하지만, ` +
                 '이 값이 비면 같은 도메인의 다른 경로가 전부 밖으로 나간다.');
    }
  } catch { /* ignore */ }
}

TARGETS.forEach(({ label, file }) => checkGenerated(label, file, { fatal: true }));

// 빌드 산출물은 «지금 기기에 깔려 있는 것»의 증거다.
// 여기 allowNavigation 이 없으면 → 마지막 빌드가 수정 이전이고, 대표 폰의 앱엔 수정이 없다.
let staleBuild = 0;
BUILT.forEach((file) => {
  const cfg = readJson(file);
  if (!cfg) return;                                   // 그 플랫폼을 아직 빌드 안 했을 뿐
  const allow = cfg?.server?.allowNavigation;
  if (!Array.isArray(allow) || allow.length === 0) {
    staleBuild++;
    notes.push(
      `빌드산출물이 «수정 이전»이다 → ${file}\n` +
      '      이 파일에는 allowNavigation 이 없다. 즉 마지막으로 실제 빌드된 바이너리는\n' +
      '      고치기 전 설정으로 만들어졌다. **기기에 깔린 앱에는 수정이 없다.**\n' +
      '      소스와 생성 JSON 이 맞아도 «리빌드+재설치» 전까지 증상은 그대로다.'
    );
  }
});
if (staleBuild) {
  notes.push('→ 남은 일: 네이티브 리빌드 1회. 그때까지 이 버그는 «고쳤지만 안 나간» 상태다.');
}

// ── 3. 소스와 생성물이 «같은» allowNavigation 인가 (동기화 누락 탐지) ────
if (src) {
  const srcAllow = [...src.matchAll(/allowNavigation\s*:\s*\[([^\]]*)\]/g)]
    .map((m) => m[1].match(/['"`]([^'"`]+)['"`]/g) || [])
    .map((arr) => arr.map((s) => s.replace(/['"`]/g, '')));
  const prodAllow = srcAllow[srcAllow.length - 1] || [];   // 마지막 분기 = 프로덕션
  TARGETS.forEach(({ label, file }) => {
    const cfg = readJson(file);
    const gen = cfg?.server?.allowNavigation;
    if (!Array.isArray(gen) || prodAllow.length === 0) return;
    const same = gen.length === prodAllow.length && gen.every((v, i) => v === prodAllow[i]);
    if (!same) {
      problems.push(
        `${label}: 소스와 생성물의 allowNavigation 이 다르다 — **동기화가 안 됐다**.\n` +
        `      소스   ${JSON.stringify(prodAllow)}\n` +
        `      생성물 ${JSON.stringify(gen)}`
      );
    }
  });
}

// ── 출력 ────────────────────────────────────────────────────────────────
console.log('\n=== 네이티브 설정 감사 ===\n');
notes.forEach((n) => console.log(`  · ${n}`));
if (notes.length) console.log('');

if (problems.length === 0) {
  console.log('  ✅ 통과 — 소스와 기기에 들어갈 설정이 일치하고, allowNavigation 이 호스트를 덮는다.\n');
  process.exit(0);
}

console.log('  ❌ 위반:\n');
problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}\n`));
console.log('  고치는 법 (Capacitor CLI 는 Node>=22 를 요구한다 — 기본이 v20 이면 실패한다):');
console.log('    PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH" npx cap copy ios');
console.log('    PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH" npx cap copy android');
console.log('  그리고 생성된 JSON 을 «열어서 눈으로» 확인할 것. 소스 수정 ≠ 기기 반영.\n');
process.exit(1);
