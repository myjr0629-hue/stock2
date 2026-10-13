/**
 * 수집 Lambda(signum-harvest) 어댑터의 토큰 버킷 — 가득 찬 채 시작하면 첫 60초에 RATE×2 가 나간다 (2026-10-13)
 * 실행: NODE_PATH=$PWD/node_modules node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/harvestBurstCap.test.ts
 *
 * 운영 실측(10/12~13 CloudWatch): 어댑터 기본 RATE_PER_MIN=1200 · 버킷이 가득 찬 채 시작 → 매 실행 «Intrinio 최근60초 최대 2,3xx~2,399회»(계약 분당 2,000 초과),
 *   수집기 자신의 FlowWarm 20~35% 실패와 같은 시각 화면·예열 호출의 429 가 같은 뿌리. 용량(BURST)을 RATE 의 25% 로 줄여 어떤 60초 창에도 RATE×1.25 이하로.
 * 이 시험은 RATE 를 6,000/분(100/s)으로 올려 1~3초 안에 같은 모양을 잰다(산술이 비례한다).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.INTRINIO_API_KEY = 'test';
process.env.INTRINIO_RATE_PER_MIN = '6000';
delete process.env.INTRINIO_BURST;
const adapterPath = path.join(__dirname, '..', 'harvest_lambda', 'intrinio-adapter.js');
const a = require(adapterPath);
const t0 = Date.now(); const stamps: number[] = [];
(globalThis as any).fetch = async () => { stamps.push(Date.now() - t0); return { ok: true, status: 200, json: async () => ({}) }; };

(async () => {
    let pass = 0;
    const t = async (name: string, fn: () => void | Promise<void>) => {
        try { await fn(); pass++; console.log(`  ✓ ${name}`); } catch (e: any) { console.error(`  ✗ ${name}\n    ${e?.stack || e}`); process.exitCode = 1; }
    };
    for (let i = 0; i < 2500; i++) a.callIntrinio('securities/AAPL/prices').catch(() => undefined);
    await new Promise((r) => setTimeout(r, 3300));
    const n = (ms: number) => stamps.filter((s) => s <= ms).length;
    await t('시작 직후 한꺼번에 나가는 호출 = 버킷 용량 RATE×25% (예전: 가득 = RATE 전부)', () => {
        const first = n(300);
        assert.ok(first >= 1400 && first <= 1700, `0.3초 안 ${first}`);   // 1,500(= 6,000×25%) + 0.3초분 보충 30
    });
    await t('그 뒤는 RATE 속도(초당 100)로만 — 3초 안 총량 ≤ 용량 + 3초분(300) + 여유', () => {
        const three = n(3200);
        assert.ok(three <= 1500 + 3.2 * 100 + 60, `3.2초 안 ${three}`);
        assert.ok(three >= 1500 + 2 * 100, `보충이 멈췄다: ${three}`);
    });
    await t('60초 창 최대치 산술: 용량 + RATE = RATE×1.25 (예전 RATE×2)', () => {
        const rate = 1200, cap = Math.floor(rate * 0.25);
        assert.equal(cap + rate, 1500);
        assert.ok(cap + rate < 2000, '계약 한도 2,000 아래');
    });
    await t('구조: 용량 상수가 있고 버킷은 그 용량으로 시작·보충한다 / INTRINIO_RATE_PER_MIN 환경변수 의미는 그대로', () => {
        const src = fs.readFileSync(adapterPath, 'utf8');
        assert.ok(src.includes('const BURST = Number(process.env.INTRINIO_BURST || Math.floor(RATE_PER_MIN * 0.25));'));
        assert.ok(src.includes('let _tokens = BURST;'));
        assert.ok(src.includes('_tokens = Math.min(BURST, _tokens + (elapsed / 60000) * RATE_PER_MIN);'));
        assert.ok(src.includes("const RATE_PER_MIN = Number(process.env.INTRINIO_RATE_PER_MIN || 1200);"));
    });
    console.log(`\n${process.exitCode ? '실패 있음' : '전부 통과'} — ${pass}건`);
    process.exit(process.exitCode || 0);
})();
