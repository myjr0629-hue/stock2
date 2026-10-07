/**
 * 앱 잠금 벽의 가짜 «오늘 14.2K 잠금해제» 삭제 (2026-10-07, 앱 강화 0단계 T4)
 *
 * 신규 설치 하루 약 5명인 앱에서 코드에 박힌 «오늘 14.2K 잠금해제»(및 ja·en)는 사실이 아니다(실제 집계값 없음) — 기만·신뢰 위험,
 * 리딤 방침의 «가짜 희소성 금지» 교리와도 충돌. 17곳(cmd 3 · dash 4 · flow 7 · MobileGuardianShield 3)을 지웠다.
 * 실제 집계값이 생기기 전까지는 빈칸이다 — 벽(ValueWall)은 socialProof 가 있을 때만 줄을 채우고, 없어도 레이아웃(줄 자리)은 그대로다.
 *
 * 실행: node_modules/.bin/ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/appNoFakeSocialProof.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

/** src 아래 모든 소스·사전 파일(.ts .tsx .json .js) */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|json|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

const APP_FILES = [
  'src/app/[locale]/app-view/cmd/page.tsx',
  'src/app/[locale]/app-view/dash/page.tsx',
  'src/app/[locale]/app-view/flow/page.tsx',
  'src/components/guardian/mobile/MobileGuardianShield.tsx',
];

t('src 전체에 «14.2K» 가 0건 (세 언어 공통)', () => {
  const hits: string[] = [];
  for (const f of walk(path.join(root, 'src'))) {
    if (/14\.2K/i.test(fs.readFileSync(f, 'utf8'))) hits.push(path.relative(root, f));
  }
  assert.deepEqual(hits, [], `남은 곳: ${hits.join(', ')}`);
});

t('앱 4개 파일에 «오늘 N잠금해제 · N unlocked today · 本日N件解除» 꼴의 박힌 수치 문구가 없다', () => {
  const FAKE = /(오늘\s*[\d.,]+\s*[KkMm만천]?\s*(?:명|건)?\s*잠금\s*해제|[\d.,]+\s*[KkMm]?\s*unlocked\s+today|本日\s*[\d.,]+\s*[KkMm]?\s*(?:件|が)?\s*(?:ロック)?解除)/;
  for (const f of APP_FILES) assert.equal(FAKE.test(read(f)), false, f);
});

t('앱 4개 파일이 ValueWall·게이트에 socialProof 리터럴을 넘기지 않는다(키·필드·변수 모두 제거)', () => {
  for (const f of APP_FILES) {
    const src = read(f);
    assert.equal(/\bsocialProof\s*[:=]/.test(src), false, `${f}: socialProof 지정`);
    assert.equal(/\bsocial\s*:\s*['"`]/.test(src), false, `${f}: social 문구 키`);
    assert.equal(/appGateCopy\.social|whaleCopy\.socialProof|ui\.social/.test(src), false, `${f}: 옛 필드 참조`);
  }
});

t('MobileGuardianShield 의 웹 경로(ProGate)와 앱 경로(ValueWall) 모두 그대로다 — 앱 게이트 문구·티저·CTA 유지', () => {
  const src = read('src/components/guardian/mobile/MobileGuardianShield.tsx');
  for (const k of ['title={appGateCopy.title}', 'previewChipLabel={appGateCopy.previewChip}', 'ctaLabel={appGateCopy.cta}', 'useAppValueWall ?', '<ProGate title="Gamma Shield"']) {
    assert.ok(src.includes(k), k);
  }
});

t('ValueWall 은 socialProof 가 있을 때만 줄을 채운다 — 값이 없어도 줄 자리(.metaRow)는 남아 레이아웃이 그대로다', () => {
  const src = read('src/components/app/ValueWall.tsx');
  assert.ok(/<div className=\{styles\.metaRow\}>\s*\{socialProof && <span><b>\{socialProof\}<\/b><\/span>\}\s*<\/div>/.test(src), 'metaRow 구조');
  const css = read('src/components/app/ValueWall.module.css');
  assert.ok(/\.metaRow\s*\{[^}]*display:\s*flex/.test(css), '.metaRow 는 flex(내용 없으면 높이 0)');
});

t('세 언어 게이트의 나머지 문구(CTA·부제·무료 미리보기)는 지워지지 않았다', () => {
  const dash = read('src/app/[locale]/app-view/dash/page.tsx');
  for (const k of ["cta: '광고 보고 1시간 해제'", "cta: 'Watch ad to unlock 1HR'", "cta: '広告視聴で1時間解除'", "teaserUnit: '4개 중 1개'", "teaserUnit: '1 of 4'", "teaserUnit: '4つ中1つ'"]) assert.ok(dash.includes(k), k);
  const flow = read('src/app/[locale]/app-view/flow/page.tsx');
  for (const k of ["unlockCta: '광고 보고 1시간 해제'", "unlockCta: 'Watch ad to unlock 1HR'", "unlockCta: '広告視聴で1時間解除'", "watchCta: '광고 보고 1시간 해제'"]) assert.ok(flow.includes(k), k);
});

console.log(`\n✅ appNoFakeSocialProof: ${n}건 통과`);
