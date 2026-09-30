/**
 * 비로그인 가입 권유 창 — 근거 없는 사용자 수 문구 제거 (2026-09-30, 대표 «웹은 웹 앱은 앱이다» — 웹 결함 (b))
 * 실행: node_modules/.bin/ts-node --transpile-only -O '{"module":"commonjs"}' tests/guestWallNoFakeCount.test.ts
 *
 * 지키는 것:
 *  1) 창(GuestWall)이 사용자 수 문구(옛 guestWallSocialProof)를 쓰지 않는다
 *  2) 세 언어 사전에서도 키와 «2,400» 숫자가 사라졌다 — 사전은 클라이언트로 실려 모든 페이지 HTML 에 들어가므로
 *  3) 웹 요금 정책 문구(Founding 가격 권유)와 가입 버튼은 그대로다 — 이번 수리의 범위 밖
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

t('창이 사용자 수 문구를 쓰지 않는다', () => {
  const src = read('src/components/gate/GuestWall.tsx');
  assert.equal(src.includes("t('guestWallSocialProof')"), false);
  assert.equal(/\bUsers\b/.test(src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')), false, '아이콘 import 도 정리');
});

t('세 언어 사전에 키·숫자가 없다', () => {
  for (const l of ['ko', 'en', 'ja']) {
    const raw = read(`src/messages/${l}.json`);
    assert.equal(raw.includes('guestWallSocialProof'), false, l);
    assert.equal(/2[,.]?400\s*(\+|명|人)/.test(raw), false, `${l}: 2,400 사용자 수`);
    JSON.parse(raw);
  }
});

t('Founding 가격 권유·가입 버튼은 그대로(웹 요금 정책 문구 무수정)', () => {
  const src = read('src/components/gate/GuestWall.tsx');
  for (const k of ["t('foundingBadge')", "t('foundingDesc')", "t('guestWallCta')", "t('guestWallGoogleSignup')"]) assert.ok(src.includes(k), k);
  for (const l of ['ko', 'en', 'ja']) {
    const all = JSON.parse(read(`src/messages/${l}.json`));
    const found = (obj: any, key: string): boolean => Object.entries(obj).some(([k, v]) => k === key || (v && typeof v === 'object' && found(v, key)));
    for (const key of ['foundingBadge', 'foundingDesc', 'guestWallCta', 'guestWallTitle']) assert.ok(found(all, key), `${l}.${key}`);
  }
});

console.log(`\n✅ guestWallNoFakeCount: ${n}건 통과`);
