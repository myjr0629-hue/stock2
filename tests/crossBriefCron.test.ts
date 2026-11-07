/**
 * 장마감 리포트 크론 판정 — src/lib/ai/crossBriefCron.ts
 * 실행: node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/crossBriefCron.test.ts
 * 고정하는 것(2026-11-06, 11/5 대폭락 날 리포트 누락): ① 정시(mode 없음)는 예전 그대로 생성 ② retry 는 서빙 가능한 판본이 없을 때만 생성
 *   ③ check 는 없을 때 경보 ④ 휴장·주말엔 재시도·경보 없음 ⑤ 모르는 mode 거부 ⑥ 경보 본문에 저장본의 제공자·탈락 사유
 *   ⑦ vercel.json 에 22:04Z(11/7 T51c 이동, 예전 21:50Z)·22:20Z retry·22:35Z check 세 줄(평일)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { crossBriefCronMode, decideCrossBriefCron, crossBriefMissingAlert } from '@/lib/ai/crossBriefCron';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

t('mode 해석: 없음/빈값 = run · retry · check · 그 밖은 null', () => {
    assert.equal(crossBriefCronMode(null), 'run');
    assert.equal(crossBriefCronMode(''), 'run');
    assert.equal(crossBriefCronMode('retry'), 'retry');
    assert.equal(crossBriefCronMode('check'), 'check');
    assert.equal(crossBriefCronMode('force'), null);
});
t('정시 run 은 서빙 여부·휴장과 무관하게 생성(예전 동작 그대로)', () => {
    assert.deepEqual(decideCrossBriefCron('run', '2026-11-05', true), { action: 'generate' });
    assert.deepEqual(decideCrossBriefCron('run', '2026-11-07', false), { action: 'generate' });
});
t('retry: 그 거래일 서빙 가능한 판본이 없으면 생성, 있으면 건너뜀', () => {
    assert.deepEqual(decideCrossBriefCron('retry', '2026-11-05', false), { action: 'generate' });
    assert.deepEqual(decideCrossBriefCron('retry', '2026-11-05', true), { action: 'skip', why: 'served' });
});
t('check: 없으면 경보, 있으면 건너뜀', () => {
    assert.deepEqual(decideCrossBriefCron('check', '2026-11-05', false), { action: 'alert' });
    assert.deepEqual(decideCrossBriefCron('check', '2026-11-05', true), { action: 'skip', why: 'served' });
});
t('휴장(11/26 추수감사절)·주말엔 retry·check 모두 건너뜀', () => {
    assert.deepEqual(decideCrossBriefCron('check', '2026-11-26', false), { action: 'skip', why: 'closed-day' });
    assert.deepEqual(decideCrossBriefCron('retry', '2026-11-07', false), { action: 'skip', why: 'closed-day' });
});
t('경보 본문: 날짜·제공자·탈락 사유(11/5 실측 저장본 모양) · 저장본 없음 문구', () => {
    const a = crossBriefMissingAlert('2026-11-05', { generatedAt: '2026-11-05T21:51:41.680Z', guard: { provider: 'legacy', model: 'claude-haiku-4.5', reasons: ['provider:legacy', 'numbers:3>2'] } });
    assert.match(a.subject, /2026-11-05/);
    assert.match(a.message, /legacy\/claude-haiku-4\.5/);
    assert.match(a.message, /provider:legacy, numbers:3>2/);
    assert.match(crossBriefMissingAlert('2026-11-05', null).message, /저장된 v4: 없음/);
    assert.ok(a.subject.length < 100);
});
t('vercel.json: 정시 22:04Z(T51c 11/7, 예전 21:50Z) + 22:20Z retry + 22:35Z check (평일)', () => {
    const v = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'));
    const rows = v.crons.filter((c: any) => c.path.startsWith('/api/cron/cross-sector-brief')).map((c: any) => `${c.path} ${c.schedule}`);
    assert.deepEqual(rows, [
        '/api/cron/cross-sector-brief 4 22 * * 1-5',
        '/api/cron/cross-sector-brief?mode=retry 20 22 * * 1-5',
        '/api/cron/cross-sector-brief?mode=check 35 22 * * 1-5',
    ]);
});
t('관문 11060907: retry 는 엄격 읽기로 판정하고, 생성 본체는 retry=1 이면 가드 탈락본을 저장하지 않는다(기존 정상본 보존)', () => {
    const cron = fs.readFileSync(path.join(process.cwd(), 'src/app/api/cron/cross-sector-brief/route.ts'), 'utf8');
    const gen = fs.readFileSync(path.join(process.cwd(), 'src/app/api/intel/cross-sector-brief/route.ts'), 'utf8');
    assert.match(cron, /if \(!ec\.ok \|\| !upstash\.ok\) throw new Error/);
    assert.match(cron, /ec\.values\[i\] \?\? \(shouldFallbackToUpstash\(k, true\) \? upstash\.values\[i\] \?\? null : null\)/);
    assert.match(cron, /판정 불가\(저장소 읽기 실패\) — 건너뜀/);
    assert.match(cron, /mode === 'retry' \? '\?retry=1' : ''/);
    assert.match(gen, /const keepExisting = retryOnly && !briefData\.guard\.ok;/);
    assert.match(gen, /if \(!dryRun && !keepExisting\) await setInCache\(getCacheKey\(today\)/);
    assert.match(cron, /NextToken/);
});
t('판정 키는 화면과 같은 폴백 규칙(postmarket:cross-brief-* 는 EC2 없음 → Upstash 사본)', () => {
    const { shouldFallbackToUpstash } = require('@/services/redisClient');
    for (const v of ['v4', 'v3', 'v2']) assert.equal(shouldFallbackToUpstash(`postmarket:cross-brief-${v}:2026-11-05`, true), true);
});
console.log(`\n${n} passed`);
