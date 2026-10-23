// 실행: node --test tests/giftLoadCodes.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('적재 도구: 기본 드라이런·수량만 출력·입력/중복/만료 차단, 외부 접속 없음', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'signum-step3-loader-'));
  try {
    const guard = join(dir, 'guard.cjs');
    await writeFile(guard, `globalThis.fetch = () => { throw new Error('외부 접근 금지'); };
      for (const name of ['node:http','node:https']) require(name).request = () => { throw new Error('외부 접근 금지'); };
      require('node:net').Socket.prototype.connect = () => { throw new Error('외부 접근 금지'); };`);
    const codeFile = join(dir, 'input.txt'); const metadata = join(dir, 'metadata.json');
    const run = (args) => spawnSync(process.execPath, ['--require', guard, resolve('scripts/gift-load-codes.mjs'), ...args], {
      encoding: 'utf8', env: { PATH: process.env.PATH },
    });
    let checked = 0;
    for (const os of ['ios', 'android']) {
      const code = randomBytes(16).toString('hex').slice(0, os === 'ios' ? 18 : 23).toUpperCase();
      const meta = { batch: `test-${os}`, app: 'signum', os, exclusive: true, campaign: 'gift-v1',
        freePeriod: os === 'ios' ? 'P1M' : 'P30D', product: '시험 상품', offer: '시험 오퍼', eligibility: '시험 대상',
        regions: ['KR'], autoRenew: true, expiresAt: new Date(Date.now() + 86400_000).toISOString() };
      await writeFile(codeFile, `${code}\n`); await writeFile(metadata, JSON.stringify(meta));
      const args = ['--os', os, '--file', codeFile, '--metadata', metadata];
      const success = run(args);
      assert.equal(success.status, 0); assert.equal(success.stdout.trim(), `드라이런 완료: ${os}, 1장, 외부 접근·쓰기 없음`);
      assert.ok(!success.stdout.includes(code)); checked++;
      assert.equal(run([...args, '--apply']).status, 1); checked++;
      await writeFile(codeFile, `${code}\n${code}\n`); assert.equal(run(args).status, 1); checked++;
      await writeFile(codeFile, `${code}\n`);
      await writeFile(metadata, JSON.stringify({ ...meta, expiresAt: new Date(Date.now() - 1000).toISOString() }));
      assert.equal(run(args).status, 1); checked++;
      await writeFile(metadata, JSON.stringify(meta));
      const repository = join(dir, os); await mkdir(join(repository, '.git'), { recursive: true });
      const tracked = join(repository, 'input.txt'); await writeFile(tracked, code);
      const link = join(dir, `${os}-link.txt`); await symlink(tracked, link);
      for (const input of [tracked, link, resolve('scripts/gift-load-codes.mjs')]) {
        const r = run(['--os', os, '--file', input, '--metadata', metadata]);
        assert.equal(r.status, 1); assert.ok(!r.stderr.includes(code)); checked++;
      }
    }
    console.log(`적재 도구 ${checked}개 검사 통과: 실제 코드·Redis 사용 없음`);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
