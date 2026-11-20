/**
 * ★11/20 flow 맥스페인 줄 — PRO(구독·코드)면 광고 없이 항상 열린다.
 *   결함: 맥스페인 줄의 흐림이 광고 해제 키(flow_chain 범위)만 보고 PRO 권한(ValueWall isUnlocked = unlocked || gatePro)을 안 봤다.
 *     → 돈을 낸 PRO 구독자도 광고를 안 보면 바로 위 체인 잠금은 열렸는데 맥스페인 줄만 흐리게 남았다(운영 웹 375 재현 11/20 15:5x).
 *   수리: 체인 잠금(ValueWall 'flow_chain')이 자기 판정(isUnlocked)을 onOpenChange 로 알리고, 맥스페인 줄은 그 값으로도 연다.
 *     비PRO 는 그대로 — 체인 범위 광고 해제만 연다(다른 잠금의 광고로는 안 열린다 · 11/20 «누른 잠금 하나만 1시간»).
 * 실행: ts-node(--transpile-only, commonjs) — 소스 계약 + 판정 표. 네트워크·실결제 없음.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

/** 맥스페인 줄 흐림 판정(flow/page.tsx 와 같은 식) — isLocked = 체인 범위 광고 해제 없음, chainOpen = 체인 ValueWall isUnlocked(광고 해제 또는 PRO) */
const maxPainBlurred = (isLocked: boolean, chainOpen: boolean) => isLocked && !chainOpen;
/** ValueWall 의 열림 판정(useAdUnlockGate) */
const wallOpen = (adScopeUnlocked: boolean, gatePro: boolean) => adScopeUnlocked || gatePro;

test('① 판정 표 — PRO 면 광고 없이 열림 · 비PRO 는 체인 범위 광고 해제만', () => {
  // [체인 범위 광고 해제, PRO] → 맥스페인 흐림
  const rows: Array<[boolean, boolean, boolean]> = [
    [false, false, true],  // 무료·광고 안 봄 → 흐림(기존 그대로)
    [true, false, false],  // 무료·체인 잠금 광고 봄 → 열림(기존 그대로)
    [false, true, false],  // PRO·광고 안 봄 → 열림(이번 수리 — 전에는 흐림)
    [true, true, false],   // PRO·광고도 봄 → 열림
  ];
  for (const [ad, pro, blurred] of rows) assert.equal(maxPainBlurred(!ad, wallOpen(ad, pro)), blurred, `ad=${ad} pro=${pro}`);
});

test('② 소스 계약 — ValueWall 은 isUnlocked(광고 해제 또는 PRO)를 onOpenChange 로 알린다', () => {
  const v = read('src/components/app/ValueWall.tsx');
  assert.match(v, /const isUnlocked = unlocked \|\| gatePro;/, 'PRO 판정은 그대로');
  assert.match(v, /onOpenChange\?: \(open: boolean\) => void;/);
  assert.match(v, /useEffect\(\(\) => \{ onOpenChange\?\.\(isUnlocked\); \}, \[isUnlocked, onOpenChange\]\);/);
  // 알림 effect 는 첫 return(if (isUnlocked)) 앞 — 훅 순서가 열림/잠김에 따라 바뀌지 않게
  const fx = v.indexOf('onOpenChange?.(isUnlocked)');
  const early = v.indexOf('  if (isUnlocked) {\n    return (');
  assert.ok(fx > 0 && early > fx, '훅은 조건부 return 앞');
});

test('③ 소스 계약 — flow 맥스페인 줄은 체인 잠금과 같은 판정(PRO 포함) · 비PRO 경로는 그대로', () => {
  const f = read('src/app/[locale]/app-view/flow/page.tsx');
  assert.match(f, /const \[chainOpen, setChainOpen\] = useState\(false\);/);
  assert.equal((f.match(/onOpenChange=\{setChainOpen\}/g) || []).length, 1, '알림은 체인 잠금 하나에서만');
  const chainAt = f.indexOf('unlockScope="flow_chain"');
  assert.ok(chainAt > 0 && f.slice(chainAt, chainAt + 200).includes('onOpenChange={setChainOpen}'), '체인 잠금(flow_chain)이 알린다');
  assert.match(f, /filter: isLocked && !chainOpen \? 'blur\(5px\)' : 'none',/);
  assert.match(f, /opacity: isLocked && !chainOpen \? 0\.25 : 1,/);
  assert.doesNotMatch(f, /filter: isLocked \? 'blur\(5px\)'/, '광고 해제 키만 보는 흐림이 남지 않는다');
  // 비PRO 의 광고 해제 판정(11/20 범위 축소)은 그대로
  assert.match(f, /setIsLocked\(!adScopeUnlockedNow\('flow_chain'\)\);/);
});
