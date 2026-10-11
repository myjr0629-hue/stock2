#!/usr/bin/env node
/* 관제 광고 «API 먼저 → ego 하강» 끝에서 끝까지 시험 — `node scripts/hud/verify-ads-api.js` (서버·네트워크·진짜 비밀 없이)
 *  가짜 판독기(asa-read.mjs 대역)와 가짜 ego-run 으로 refresh.js 의 `run ads` 를 실제로 돌려 확인한다:
 *   ① API 정상 → 상태 source=api · msg «광고(API)…» · ads-periods-HHMM.log 저장 · ego 호출 0
 *   ② API 자격 파일 없음 → API 시도 없이 ego 로(자격 없는 지금 상태 = 기존 동작 그대로)
 *   ③ API 가 인증 거부(11)·읽은 기간 0(13) → ego 로 하강하고 msg 에 사유가 남는다
 *   ④ 관제 loadRefresh: source=api 면 작업 이름이 «광고(API)»
 *   ⑤ HUD_ADS_FORCE_EGO=1 이면 API 를 건너뛰고 ego 만 */
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
let fail = 0; const ok = (n, c, d = '') => { console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : ' ← ' + d)); if (!c) fail++; };
const REFRESH = path.join(__dirname, 'refresh.js');
const GOOD = `\n[어제] 기간 표시=[]\n  SIGNUM JP - Search Results - Exact 실행 중    지출 $4.81    노출 792     탭 3   설치 1  CPA $4.81 · CPT $1.60\n  합계=합계 | $4.81 | $4.81 | $1.60 | $6.07 | 792 | 3 | 1 | 0.38% | x`
    + `\n\n[오늘] 기간 표시=[]\n  SIGNUM JP - Search Results - Exact 실행 중    지출 $1.00    노출 90      탭 1   설치 0  CPA $0.00 · CPT $1.00\n  합계=합계 | $1.00 | $0.00 | $1.00 | $11.11 | 90 | 1 | 0 | 1.1% | x`
    + `\n\n[최근 7일] 기간 표시=[]\n  SIGNUM JP - Search Results - Exact 실행 중    지출 $20.00    노출 3,000   탭 12  설치 2  CPA $10.00 · CPT $1.67\n  합계=합계 | $20.00 | $10.00 | $1.67 | $6.67 | 3,000 | 12 | 2 | 0.4% | x\n`;
function run(env) {
    return new Promise((resolve) => {
        let out = ''; const c = spawn(process.execPath, [REFRESH, 'run', 'ads'], { env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
        c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (out += d)); c.on('close', (code) => resolve({ code, out }));
    });
}
(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-ads-api-'));
    const sec = path.join(tmp, 'secrets'), io = path.join(tmp, 'io'), work = path.join(tmp, 'work'); fs.mkdirSync(sec); fs.mkdirSync(io);
    const marker = path.join(tmp, 'ego-called');
    const fakeEgo = path.join(tmp, 'fake-ego-run.sh');
    fs.writeFileSync(fakeEgo, `#!/bin/bash\ntouch "${marker}"\ncat <<'X'\n[어제] 기간 표시=[]\n  SIGNUM KR - Search Results - Exact 실행 중    지출 $1.00    노출 10      탭 1   설치 0  CPA $0.00 · CPT $1.00\n  합계=합계 | $1.00 | $0.00 | $1.00 | $100.00 | 10 | 1 | 0 | 1% | x\n[오늘] 기간 표시=[]\n  SIGNUM KR - Search Results - Exact 실행 중    지출 $0.50    노출 5       탭 1   설치 0  CPA $0.00 · CPT $0.50\n  합계=합계 | $0.50 | $0.00 | $0.50 | $100.00 | 5 | 1 | 0 | 1% | x\n[최근 7일] 기간 표시=[]\n  SIGNUM KR - Search Results - Exact 실행 중    지출 $9.00    노출 90      탭 9   설치 1  CPA $9.00 · CPT $1.00\n  합계=합계 | $9.00 | $9.00 | $1.00 | $100.00 | 90 | 9 | 1 | 1% | x\nX\n`, { mode: 0o755 });
    const fakeApi = (code, body) => { const f = path.join(tmp, 'fake-asa-read.mjs'); fs.writeFileSync(f, `console.log(${JSON.stringify(body)}); ${code ? `console.error('⛔ API 판독 실패(test): 시험 오류'); process.exit(${code});` : ''}`); return f; };
    const base = (apiScript) => ({ HUD_EGO_IO: io, HUD_WORK: work, HUD_REFRESH_STATE: path.join(io, 'hud-refresh-state.json'), ASA_SECRETS_DIR: sec, HUD_ASA_API_SCRIPT: apiScript, HUD_EGO_RUN: fakeEgo, HUD_EGO_LOCK_WAIT: '5' });
    const state = () => { try { return JSON.parse(fs.readFileSync(path.join(io, 'hud-refresh-state.json'), 'utf8')).ads || {}; } catch { return {}; } };
    const logs = () => { const out = []; for (const d of fs.readdirSync(io)) { const dp = path.join(io, d); try { for (const f of fs.readdirSync(dp)) if (/^ads-periods-\d{4}\.log$/.test(f)) out.push(path.join(dp, f)); } catch { /* 파일 */ } } return out; };

    // ② 자격 파일 없음 → API 시도 없이 ego
    let r = await run(base(fakeApi(0, GOOD)));
    ok('② 자격 파일 없음 → ego 로(API 시도 없음)', fs.existsSync(marker) && state().source === 'ego' && !/API 실패/.test(state().msg || ''), r.out.slice(-300) + JSON.stringify(state()));
    fs.rmSync(marker, { force: true });
    // ① 자격 있음 + API 정상
    fs.writeFileSync(path.join(sec, 'ids.json'), '{}'); fs.writeFileSync(path.join(sec, 'private-key.pem'), 'x');
    r = await run(base(fakeApi(0, GOOD)));
    const st = state();
    ok('① API 정상 → source=api · 상태 ok · msg «광고(API)» · ego 호출 0', st.source === 'api' && st.status === 'ok' && /^광고\(API\)/.test(st.msg) && !fs.existsSync(marker), r.out.slice(-300) + JSON.stringify(st));
    ok('① 로그 파일 저장(ads-periods-HHMM.log)이 관제 파서로 3기간 읽힌다', (() => { const S = require('./sources'); const l = logs().sort().pop(); return !!l && S.parseAdsText(fs.readFileSync(l, 'utf8')).length === 3; })());
    // ⑤ HUD_ADS_FORCE_EGO=1 → API 가 멀쩡해도 콘솔만(대조용)
    fs.rmSync(marker, { force: true });
    r = await run(Object.assign(base(fakeApi(0, GOOD)), { HUD_ADS_FORCE_EGO: '1' }));
    ok('⑤ HUD_ADS_FORCE_EGO=1 → API 를 건너뛰고 ego 로(대조용)', fs.existsSync(marker) && state().source === 'ego' && !/API 실패/.test(state().msg || ''), r.out.slice(-300) + JSON.stringify(state()));
    // ③ 인증 거부 → ego 하강
    for (const [code, kind] of [[11, 'auth'], [13, 'empty'], [12, 'http']]) {
        fs.rmSync(marker, { force: true });
        r = await run(base(fakeApi(code, '')));
        const s2 = state();
        ok(`③ API 종료 코드 ${code} → ego 로 하강 · 사유 ${kind} 가 msg 에`, fs.existsSync(marker) && s2.source === 'ego' && new RegExp('API 실패\\(' + kind).test(s2.msg || ''), r.out.slice(-300) + JSON.stringify(s2));
    }
    // ④ 관제 이름
    const S = require('./sources');
    const sch = { rc: ['09:12'], ads: ['09:20'], retryAfterMin: 25, windowMin: 120 };
    const stf = path.join(tmp, 's.json'); fs.writeFileSync(stf, JSON.stringify({ installedAt: 1, ads: { source: 'api', status: 'ok', lastOkAt: Date.now() } }));
    ok('④ loadRefresh: source=api → 작업 이름 «광고(API)»', S.loadRefresh({ file: stf, now: Date.now(), schedule: sch }).jobs.ads.name === '광고(API)');
    fs.writeFileSync(stf, JSON.stringify({ installedAt: 1, ads: { source: 'ego', status: 'ok', lastOkAt: Date.now() } }));
    ok('④ loadRefresh: source=ego → 기존 이름 «애플 광고»', S.loadRefresh({ file: stf, now: Date.now(), schedule: sch }).jobs.ads.name === '애플 광고');
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(fail ? `\n실패 ${fail}` : '\n전부 통과'); process.exit(fail ? 1 : 0);
})();
