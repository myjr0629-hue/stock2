#!/usr/bin/env node
// 기본은 로컬 검증만. 비밀값은 이미 주입된 환경에서만 읽으며 .env 파일은 열지 않는다.
import { readFile, realpath, access, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, basename, isAbsolute, dirname } from 'node:path';
import { Redis } from '@upstash/redis';
import { LOAD_LUA } from '../src/lib/giftShare/atomic.cjs';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const allowed = new Set(['--os', '--file', '--metadata', '--target', '--apply']);
  for (const arg of args.filter(s => s.startsWith('--'))) if (!allowed.has(arg)) throw new Error();
  const value = key => args[args.indexOf(key) + 1];
  if (!args.includes('--os') || !args.includes('--file') || !args.includes('--metadata')) throw new Error();
  const os = value('--os');
  if (os !== 'ios' && os !== 'android') throw new Error();
  const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
  const readPrivate = async path => {
    const p = await realpath(resolve(path));
    const rel = relative(root, p);
    if ((!rel.startsWith('..') && !isAbsolute(rel)) || basename(p).startsWith('.env')) throw new Error();
    // 다른 공개 체크아웃도 포함해 Git 저장소 안의 입력은 거부한다.
    for (let dir = dirname(p); ; dir = dirname(dir)) {
      let tracked = false;
      try { await access(resolve(dir, '.git')); tracked = true; } catch { /* 저장소 표지 없음 */ }
      if (tracked) throw new Error();
      if (dirname(dir) === dir) break;
    }
    if ((await stat(p)).size > 1024 * 1024) throw new Error();
    return readFile(p, 'utf8');
  };
  const meta = JSON.parse(await readPrivate(value('--metadata')));
  const expiresAt = Date.parse(meta.expiresAt);
  if (!/^[a-z0-9_-]{1,64}$/.test(meta.batch || '') || meta.app !== 'signum' || meta.os !== os ||
      meta.exclusive !== true || meta.campaign !== 'gift-v1' || meta.freePeriod !== (os === 'ios' ? 'P1M' : 'P30D') ||
      !['product', 'offer', 'eligibility'].every(k => typeof meta[k] === 'string' && meta[k].length > 0 && meta[k].length <= 200) ||
      !Array.isArray(meta.regions) || !meta.regions.length || !meta.regions.every(r => /^[A-Z]{2}$/.test(r)) ||
      meta.autoRenew !== true || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error();
  const codes = (await readPrivate(value('--file'))).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const re = os === 'ios' ? /^[A-Z0-9]{18}$/ : /^[A-Z0-9]{23}$/;
  if (!codes.length || codes.length > 1000 || codes.some(c => !re.test(c)) || new Set(codes).size !== codes.length) throw new Error();
  if (!apply) { console.log(`드라이런 완료: ${os}, ${codes.length}장, 외부 접근·쓰기 없음`); return; }
  const target = args.includes('--target') ? value('--target') : '';
  if (target !== 'production' && target !== 'preview') throw new Error();
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error();
  const r = new Redis({ url, token, automaticDeserialization: false, enableTelemetry: false,
    retry: { retries: 0 }, signal: () => AbortSignal.timeout(3000) });
  const p = target === 'production' ? 'promo:gift:v1' : 'promo:pv:gift:v1';
  const old = target === 'production' ? 'promo:' : 'promo:pv:';
  const result = await r.eval(LOAD_LUA, [`${p}:batch:${meta.batch}`, `${p}:batches:${os}`,
    `${p}:pool:${os}:${meta.batch}`, `${p}:loaded`, `${old}play:pool`, `${old}inv:pool:ios`, `${old}play:claims`],
  [JSON.stringify({ ...meta, expiresAt }), expiresAt, meta.batch, ...codes]);
  if (result !== 'loaded') throw new Error();
  console.log(`적재 완료: ${os}, ${codes.length}장`);
}
main().catch(() => { console.error('선물 재고 처리 실패: 인자·비공개 파일·묶음 중복·저장소 상태를 확인하세요. 값은 출력하지 않습니다.'); process.exitCode = 1; });
