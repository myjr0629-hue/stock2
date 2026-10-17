#!/usr/bin/env node
/* ============================================================================
 * 관제 콘솔 «자동 갱신» — RevenueCat(설치)·애플 광고 콘솔·App Store Connect 분석을 모델 없이 시각표대로 읽어 관제의 원천 파일을 새로 쓴다.
 *
 * 왜 (대표 2026-10-10 08:5x «관제 기준이 10/8 이야? 며칠 늦는 것이야?» · 10/9 «관제 링크는 정확하게 실시간으로»):
 *   관제는 rc.log·ads-periods-*.log 를 «읽기만» 한다. 그 파일은 운영 세션이 손으로 판독할 때만 새로 생겼고, 마지막 판독이 멈추면 관제도 그 날짜에 멈췄다.
 *
 * 쓰는 법 (전부 한 파일, 의존성 0, Node 18+)
 *   node scripts/hud/refresh.js run rc|ads|asc|all   지금 한 번 읽는다(시각표 무시 · 수동 시험용)
 *   node scripts/hud/refresh.js auto             launchd 가 부른다 — 시각표를 보고 «제때 안 된 것만» 읽는다(재시도 포함)
 *   node scripts/hud/refresh.js install          ~/Library/LaunchAgents/com.signumhq.hud-refresh.plist 를 만들고 등록한다(시각표를 바꾸면 다시)
 *   node scripts/hud/refresh.js uninstall | status | plist
 *
 * 원칙
 *   · 읽기 전용: 로그인·비밀번호·광고 설정 변경을 «하지 않는다». 로그인 화면이면 SIGNIN / SESSION_EXPIRED 로 기록만 하고 끝낸다(관제가 «재로그인 필요» 를 띄운다).
 *   · ego 는 scripts/ego-run.sh 로만 돌린다 — ego 잠금·대기열·하드 타임아웃을 지킨다. 대표가 브라우저를 쥐고 있으면(SPACE_BUSY) 되찾지 않고 건너뛴다.
 *   · ★애플 광고 판독은 «API 먼저»(2026-10-11 대표 «로그인이 자꾸 풀리니까 api로 하도록해»): ~/Documents/signum-work/ads/api/asa-read.mjs 가 로그인 없이 읽는다.
 *     API 자격(~/.signum-secrets/apple-ads/ids.json·private-key.pem)이 없거나 API 가 실패하면 «기존 ego 콘솔 판독»으로 내려간다. 비밀값은 이 파일이 읽지도 싣지도 않는다(경로 존재만 본다).
 *   · ★App Store 분석(asc, 하루 2회 09:40·17:40 — 대표 10/14 «전방위적으로 설치를 늘려줘라»): scripts/hud/asc-read.mjs 가 ego(로그인된 ASC 세션)로 소스별·국가별 첫 다운로드·캠페인·오퍼·CPP·PPO 를 읽어 ~/signum-ego-io/hud-asc.json 에 쓴다.
 *     세션이 만료되면 SIGNIN 으로 기록만 하고 끝낸다(관제가 «로그인 필요»를 빨갛게 띄운다 — 비밀번호·2단계 인증은 입력하지 않는다). 읽기 전용.
 *   · 실패해도 다음 회차(재시도 포함)에 다시 돈다. 결과는 ~/signum-ego-io/hud-refresh-state.json 에 적고, 관제가 «다음 갱신 HH:MM»·실패를 보여 준다.
 *   · 판독이 «정상일 때만» 원천 파일을 쓴다(RevenueCat: 마지막 열이 오늘(UTC) 이고 iOS·안드 행이 있을 때) — 실패 출력이 옛 정상 파일을 덮지 않는다.
 *   · RC 판독기는 scripts/hud/rc-auto.mjs 에서 관리한다. launchd 아래에서 Apple 기본 도구(ls·cat)는 문서 폴더가 막히지만
 *     node 는 열린다(2026-10-10 실측) → 문서 폴더 읽기·쓰기는 전부 이 node 프로세스가 한다.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const S = require('./sources');

const HOME = os.homedir();
const ROOT = path.resolve(__dirname, '..', '..');
const IO = process.env.HUD_EGO_IO || path.join(HOME, 'signum-ego-io');
const WORK = process.env.HUD_WORK || path.join(HOME, 'Documents', 'signum-work');
const STATE_FILE = S.DIRS.refreshState;
const RC_SCRIPT = process.env.HUD_RC_SCRIPT || path.join(__dirname, 'rc-auto.mjs');
const ADS_SCRIPT = path.join(ROOT, 'scripts', 'ego', 'ads-periods.mjs');
const ASC_SCRIPT = process.env.HUD_ASC_SCRIPT || path.join(ROOT, 'scripts', 'hud', 'asc-read.mjs');             // App Store Connect 분석 판독(ego · 읽기 전용)
const ASC_FILE = S.DIRS.asc;                                                                                    // 관제가 읽는 원천(~/signum-ego-io/hud-asc.json)
const ASA_API_SCRIPT = process.env.HUD_ASA_API_SCRIPT || path.join(WORK, 'ads', 'api', 'asa-read.mjs');          // 저장소 밖(비밀 경로를 아는 판독기) — 값은 여기 없다
const ASA_SECRETS = process.env.ASA_SECRETS_DIR || path.join(HOME, '.signum-secrets', 'apple-ads');                // 경로만 안다 — 파일 내용은 읽지 않는다
const ASA_API_LIMIT = Number(process.env.HUD_ASA_API_LIMIT || 150);                                                // API 판독 제한(초) — 보통 10초 안
const EGO_RUN = process.env.HUD_EGO_RUN || path.join(ROOT, 'scripts', 'ego-run.sh');                               // 시험(verify-ads-api.js)만 바꾼다
const LABEL = 'com.signumhq.hud-refresh';
const PLIST = path.join(HOME, 'Library', 'LaunchAgents', LABEL + '.plist');
const LOG = path.join(HOME, 'Library', 'Logs', 'signum-hud-refresh.log');
const ADS_PERIODS = ['어제', '오늘', '최근 7일'];
const LOCK_WAIT = Number(process.env.HUD_EGO_LOCK_WAIT || 600);      // ego 잠금 대기(초) — 기본 ego-run 은 900. 무인 실행이 오래 줄 서지 않게 줄인다.

const now = () => Date.now();
const kstHM = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(11, 16);
const ts = (ms = now()) => new Date(ms + 9 * 3600e3).toISOString().replace('T', ' ').slice(0, 19) + ' KST';
const log = (...a) => console.log(`[${ts()}]`, ...a);
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const mkdirp = (d) => { try { fs.mkdirSync(d, { recursive: true }); } catch { /* 아래 쓰기에서 드러난다 */ } };

// ── 상태 파일 ──────────────────────────────────────────────────────────────
function readState() { return readJson(STATE_FILE, {}) || {}; }
function patchState(job, patch) {                       // 읽고-바꾸고-쓰기를 짧게 — 다른 작업이 쓴 최신 파일 위에 얹는다(원자적 교체)
    const st = readState(); const cur = st[job] || {};
    st[job] = Object.assign(cur, patch);
    mkdirp(path.dirname(STATE_FILE));
    const tmp = STATE_FILE + '.tmp' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(st, null, 1)); fs.renameSync(tmp, STATE_FILE);
    return st[job];
}
function patchTop(patch) {
    const st = Object.assign(readState(), patch);
    mkdirp(path.dirname(STATE_FILE));
    const tmp = STATE_FILE + '.tmp' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(st, null, 1)); fs.renameSync(tmp, STATE_FILE);
}

// ── 같은 작업이 겹쳐 돌지 않게 하는 잠금(수동 실행과 launchd 실행이 겹칠 때) ──
function takeLock(job) {
    const f = path.join(IO, '.hud-auto', `lock-${job}`);
    mkdirp(path.dirname(f));
    const old = parseInt((() => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } })(), 10);
    if (Number.isFinite(old) && old !== process.pid) { try { process.kill(old, 0); const age = now() - fs.statSync(f).mtimeMs; if (age < 40 * 60e3) return null; } catch { /* 주인이 죽었다 */ } }
    fs.writeFileSync(f, String(process.pid));
    return () => { try { if (fs.readFileSync(f, 'utf8') === String(process.pid)) fs.unlinkSync(f); } catch { /* 이미 없다 */ } };
}

// ── ego 스크립트 실행 (ego-run.sh 만 거친다) ───────────────────────────────
function egoRun(label, scriptText, limitSec) {
    const dir = path.join(IO, '.hud-auto'); mkdirp(dir);
    const f = path.join(dir, `${label}-${process.pid}.mjs`);
    fs.writeFileSync(f, scriptText);
    return new Promise((resolve) => {
        let out = '', done = false;
        const child = spawn('/bin/bash', [EGO_RUN, f, String(limitSec)], { env: Object.assign({}, process.env, { EGO_LOCK_WAIT: String(LOCK_WAIT) }), stdio: ['ignore', 'pipe', 'pipe'] });
        const cap = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* 이미 끝남 */ } }, (limitSec + LOCK_WAIT + 120) * 1000);   // 줄 서기 + 실행 + 여유 — ego-run 의 -9 는 «스크립트»만 끊는다
        const take = (c) => { out = (out + c).slice(-400000); };
        child.stdout.on('data', take); child.stderr.on('data', take);
        const fin = (code) => { if (done) return; done = true; clearTimeout(cap); try { fs.unlinkSync(f); } catch { /* 없다 */ } resolve({ code, out }); };
        child.on('close', (code) => fin(code == null ? 137 : code));
        child.on('error', (e) => { out += '\nspawn 실패: ' + e.message; fin(127); });
    });
}
const codeKind = (code, out) => code === 124 ? { kind: 'timeout', msg: '제한 시간 초과(강제 종료)' }
    : code === 75 ? { kind: 'lock', msg: '다른 ego 작업이 오래 점유 — 이번 회차 포기' }
    : /ego: Profile 1 공간이 모두 사용자 제어|^SPACE_BUSY/m.test(out) ? { kind: 'busy', msg: '대표가 브라우저(ego)를 쓰고 있어 건너뜀 — 되찾지 않는다' }
    : null;

// ── ① RevenueCat ───────────────────────────────────────────────────────────
const JSON_AFTER = (line) => { const i = line.indexOf('{'); if (i < 0) return null; try { return JSON.parse(line.slice(i)); } catch { return null; } };
function judgeRc(out, readAtMs) {
    if (/^SIGNIN/m.test(out)) return { status: 'fail', kind: 'signin', msg: 'RevenueCat 로그인 필요(세션 만료) — 대표 재로그인' };
    const lines = out.split('\n');
    const plat = lines.find((l) => /^플랫폼별\(ok\):/.test(l)), all = lines.find((l) => /^전체:/.test(l));
    const jp = plat ? JSON_AFTER(plat) : null, ja = all ? JSON_AFTER(all) : null;
    const j = jp || ja;
    if (!j || !Array.isArray(j.dates) || !Array.isArray(j.rows) || !j.rows.length) return { status: 'fail', kind: 'parse', msg: '표를 못 읽음(전체·플랫폼별 모두)' };
    const dates = j.dates.map(S.rcDate).filter(Boolean);
    const want = new Date(readAtMs).toISOString().slice(0, 10);
    if (!dates.length || dates[dates.length - 1] !== want) return { status: 'fail', kind: 'range', msg: `마지막 열이 ${dates[dates.length - 1] || '없음'} — 오늘(UTC ${want}) 이어야 한다` };
    if (dates.length < 8) return { status: 'fail', kind: 'range', msg: `날짜 열 ${dates.length}개 — 8개(완결 7 + 오늘) 필요` };
    const n = dates.length;
    let warn = '';
    if (jp) {                                                // 합계 = iOS + 안드 인가 (어긋나면 경고만 — 값은 원천 그대로)
        const lab = (jp.labels || []).map((x) => String(x).trim().toLowerCase());
        const g = (name) => jp.rows[lab.indexOf(name) - (lab[0] === 'segments' ? 1 : 0)] || null;
        const tot = g('total'), ios = g('ios'), and = g('android');
        if (tot && ios && and) { const bad = []; for (let k = 0; k < n; k++) if (Number(String(tot[k]).replace(/,/g, '')) !== Number(String(ios[k]).replace(/,/g, '')) + Number(String(and[k]).replace(/,/g, ''))) bad.push(dates[k]); if (bad.length) warn = ` · ⚠ 합계≠iOS+안드: ${bad.join(',')}`; }
    }
    const row = (jp ? jp.rows[0] : j.rows[0]) || [];
    const lastDone = row[n - 2], today = row[n - 1];
    return { status: jp ? 'ok' : 'partial', kind: jp ? '' : 'platform', msg: `${dates[0]}~${dates[n - 1]} · 완결 ${dates[n - 2]} 신규 ${lastDone} · 오늘(부분) ${today}` + (jp ? '' : ' · ⚠ 플랫폼 분리 실패(전체만)') + warn };
}
async function runRc() {
    const t0 = now();
    let src; try { src = fs.readFileSync(RC_SCRIPT, 'utf8'); } catch (e) { return { status: 'fail', kind: 'script', msg: 'rc-auto.mjs 를 못 읽음: ' + e.code + ' ' + RC_SCRIPT }; }
    const { code, out } = await egoRun('rc-auto', src, 240);
    const ck = codeKind(code, out); if (ck) return Object.assign({ status: ck.kind === 'busy' ? 'busy' : 'fail' }, ck);
    const readLine = out.split('\n').find((l) => /^읽음:/.test(l)); const parsedAt = readLine ? Date.parse(readLine.replace(/^읽음:\s*/, '').trim()) : t0;
    const readAt = Number.isFinite(parsedAt) ? parsedAt : t0;
    const v = judgeRc(out, readAt);
    // Overview is independent of chart readiness and the platform-log fallback below.
    const overviewLine = out.split('\n').find((l) => /^RC_OVERVIEW /.test(l));
    const overview = overviewLine ? JSON_AFTER(overviewLine) : null;
    if (code === 0 && overview && overview.schemaVersion === 1 && overview.metrics && !overview.signin) {
        const dir = path.join(WORK, S.kstDay(readAt), 'report'); mkdirp(dir);
        const file = path.join(dir, 'rc-overview.json'), tmp = file + '.tmp' + process.pid;
        try {
            fs.writeFileSync(tmp, JSON.stringify(overview, null, 2) + '\n'); fs.renameSync(tmp, file);
            v.overviewFile = file.replace(HOME, '~');
        } catch (e) { return { status: 'fail', kind: 'write', msg: 'rc-overview.json 쓰기 실패: ' + e.code }; }
    }
    if (v.status === 'ok' || v.status === 'partial') {
        // 정상 판독만 원천 파일을 쓴다. 날짜 폴더 = 읽은 때의 KST 오늘(관제는 가장 최근 날짜 폴더의 rc.log 를 읽는다).
        const dir = path.join(WORK, S.kstDay(readAt), 'report'); mkdirp(dir);
        // ★10/13: 플랫폼 분리만 실패한 판독(partial)이 직전 정상본을 덮어 관제 아이폰·안드 칸이 «–»가 됐다(대표 캡처 23:17). 같은 UTC 하루의 정상본이 있으면 덮지 않는다.
        if (v.status === 'partial') {
            try {
                const prev = fs.readFileSync(path.join(dir, 'rc.log'), 'utf8');
                const prevRead = Date.parse(((prev.split('\n').find((l) => /^읽음:/.test(l)) || '').replace(/^읽음:\s*/, '')).trim());
                const utcD = (ms) => new Date(ms).toISOString().slice(0, 10);
                const sameDay = Number.isFinite(prevRead) && utcD(prevRead) === utcD(readAt);
                if (/^플랫폼별\(ok\)/m.test(prev) && sameDay) {
                    v.file = path.join(dir, 'rc.log').replace(HOME, '~'); v.msg += ' · 직전 정상본(플랫폼 분리 있음) 유지';
                    return v;
                }
            } catch { /* 직전 파일이 없으면 이번 판독을 쓴다 */ }
        }
        const body = out.split('\n').filter((l) => /^(읽음|범위|전체|플랫폼|신규체험)/.test(l)).join('\n') + `\n# 자동 갱신(scripts/hud/refresh.js) ${ts()}\n`;
        const tmp = path.join(dir, `.rc.log.tmp${process.pid}`);
        try { fs.writeFileSync(tmp, body); fs.renameSync(tmp, path.join(dir, 'rc.log')); v.file = path.join(dir, 'rc.log').replace(HOME, '~'); }
        catch (e) { return { status: 'fail', kind: 'write', msg: 'rc.log 쓰기 실패: ' + e.code + ' ' + dir.replace(HOME, '~') }; }
    }
    return v;
}

// ── ② 애플 광고 ────────────────────────────────────────────────────────────
function judgeAds(out) {
    const got = S.parseAdsText(out).filter((p) => p.rows.length && p.total);
    const names = got.map((p) => p.period);
    const missing = ADS_PERIODS.filter((p) => !names.includes(p));
    const sess = /SESSION_EXPIRED/.test(out);
    if (!got.length) {
        if (sess) return { status: 'fail', kind: 'session', msg: '애플 광고 로그인 세션 만료(SESSION_EXPIRED) — 대표 재로그인 필요', got };
        return { status: 'fail', kind: /기간 항목을 못 찾았다/.test(out) ? 'picker' : 'parse', msg: '읽은 기간 0 — ' + (/기간 항목을 못 찾았다/.test(out) ? '기간 선택기를 못 찾음' : '표를 못 읽음'), got };
    }
    const tot = (per) => { const p = got.find((x) => x.period === per); return p ? `${per} $${p.total.spend.toFixed(2)}·설치 ${p.total.installs}` : null; };
    const msg = ADS_PERIODS.map(tot).filter(Boolean).join(' · ');
    if (missing.length) return { status: 'partial', kind: sess ? 'session' : 'partial', msg: `${msg} · ⚠ 못 읽음: ${missing.join(',')}${sess ? ' (로그인 세션 만료)' : ''}`, got };
    return { status: 'ok', kind: '', msg, got };
}
// ── ② -1 애플 광고 API 판독(로그인 불필요) ───────────────────────────────
/** API 자격이 «있는가» — 파일 존재만 본다(내용은 읽지 않는다). 없으면 API 를 시도하지 않고 ego 로 간다. */
function asaApiReady() {
    try { return fs.existsSync(path.join(ASA_SECRETS, 'ids.json')) && fs.existsSync(path.join(ASA_SECRETS, 'private-key.pem')) && fs.existsSync(ASA_API_SCRIPT); } catch { return false; }
}
/** asa-read.mjs ads 를 돌린다 — 종료 코드: 0 정상 · 10 자격 없음 · 11 인증 거부 · 12 HTTP·네트워크 · 13 읽은 기간 0. 출력은 ego 판독과 «같은 줄 모양»이라 judgeAds 가 그대로 읽는다. */
function apiRun(limitSec) {
    return new Promise((resolve) => {
        let out = '', done = false;
        const child = spawn(process.execPath, [ASA_API_SCRIPT, 'ads', '--periods', ADS_PERIODS.join(',')], { env: Object.assign({}, process.env, { HUD_EGO_IO: IO }), stdio: ['ignore', 'pipe', 'pipe'] });
        const cap = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* 이미 끝남 */ } }, limitSec * 1000);
        const take = (c) => { out = (out + c).slice(-400000); };
        child.stdout.on('data', take); child.stderr.on('data', take);
        const fin = (code) => { if (done) return; done = true; clearTimeout(cap); resolve({ code, out }); };
        child.on('close', (code) => fin(code == null ? 137 : code));
        child.on('error', (e) => { out += '\nspawn 실패: ' + e.message; fin(127); });
    });
}
const API_FAIL_KIND = { 10: 'nocreds', 11: 'auth', 12: 'http', 13: 'empty', 127: 'spawn', 137: 'timeout' };
/** 같은 분의 파일이 있으면 다음 분 이름으로 — 관제는 ~/signum-ego-io/<KST 날짜>/ads-periods-HHMM.log 의 «읽은 시각»(수정 시각)을 쓴다. */
function writeAdsLog(out) {
    const t = now(); const dir = path.join(IO, S.kstDay(t)); mkdirp(dir);
    let hh = kstHM(t).replace(':', ''), n = 0; while (fs.existsSync(path.join(dir, `ads-periods-${hh}.log`)) && n++ < 30) { const m = (Number(hh.slice(0, 2)) * 60 + Number(hh.slice(2)) + 1) % 1440; hh = String(Math.floor(m / 60)).padStart(2, '0') + String(m % 60).padStart(2, '0'); }
    const f = path.join(dir, `ads-periods-${hh}.log`);
    fs.writeFileSync(f, out.split('\n').filter((l) => !/^\(무시\)/.test(l)).join('\n'));
    return f.replace(HOME, '~');
}
async function runAdsApi() {
    const { code, out } = await apiRun(ASA_API_LIMIT);
    if (code !== 0) return { fail: { kind: API_FAIL_KIND[code] || 'exit' + code, msg: (out.split('\n').filter((l) => /^⛔/.test(l)).pop() || out.trim().split('\n').pop() || '').slice(0, 160) } };
    const v = judgeAds(out);
    if (!v.got.length) return { fail: { kind: 'parse', msg: 'API 출력에서 읽은 기간 0' } };
    v.file = writeAdsLog(out); v.source = 'api'; v.msg = '광고(API) ' + v.msg; delete v.got;
    return { v };
}

async function runAds() {
    // ① API 먼저 — 로그인이 필요 없다. 성공하면 ego 를 건드리지 않는다(대표 브라우저·ego 잠금과 무관).
    let apiNote = '';
    if (!process.env.HUD_ADS_FORCE_EGO && asaApiReady()) {          // HUD_ADS_FORCE_EGO=1 → API 를 건너뛰고 콘솔만(API 판독과 콘솔 판독을 대조할 때 — asa-compare.mjs)
        const r = await runAdsApi();
        if (r.v) return r.v;
        apiNote = `API 실패(${r.fail.kind}${r.fail.msg ? ': ' + r.fail.msg : ''}) → ego 콘솔 판독으로 하강`;
        log('ads: ' + apiNote);
    }
    // ② 기존 ego 콘솔 판독(로그인 세션 필요) — API 자격이 없거나 API 가 실패했을 때
    let src; try { src = fs.readFileSync(ADS_SCRIPT, 'utf8'); } catch (e) { return { status: 'fail', kind: 'script', msg: 'ads-periods.mjs 를 못 읽음: ' + e.code }; }
    // ads-periods.mjs 는 작업 파일(ads-periods-task.json)을 읽는다 — 운영 세션과 겹치지 않게 기간을 스크립트 앞에 «직접» 박아 넣는다(작업 파일 경쟁 없음).
    const { code, out } = await egoRun('ads-auto', `globalThis.__ADS_PERIODS = ${JSON.stringify(ADS_PERIODS)};\n` + src, 420);
    const ck = codeKind(code, out); if (ck) return Object.assign({ status: ck.kind === 'busy' ? 'busy' : 'fail', source: 'ego' }, ck, apiNote ? { msg: ck.msg + ' · ' + apiNote } : {});
    const v = judgeAds(out);
    if (v.got.length) v.file = writeAdsLog(out);
    delete v.got;
    v.source = 'ego'; if (apiNote) v.msg = (v.msg ? v.msg + ' · ' : '') + apiNote;
    return v;
}

// ── ③ App Store Connect 분석 ──────────────────────────────────────────────
const SRC_KO = { WebRef: '웹', Other: '탐색', Search: '검색', AppRef: '앱', 'Volume Purchase': '기관', Unknown: '불명' };
/** asc-read.mjs 출력 → 판정. 마지막 «ASC_DATA {json}» 줄이 본체. 로그인 화면(SIGNIN)·공간 점유(busy)·파싱 실패·소스 비어 있음을 가린다. 값은 지어내지 않는다. */
function judgeAsc(out) {
    if (/^SIGNIN/m.test(out)) return { status: 'fail', kind: 'signin', msg: 'App Store Connect 로그인 필요(세션 만료) — 대표 재로그인' };
    const line = out.split('\n').reverse().find((l) => l.startsWith('ASC_DATA '));
    if (!line) return { status: 'fail', kind: 'parse', msg: 'ASC_DATA 줄이 없다(스크립트가 중간에 멈춤)' };
    let j; try { j = JSON.parse(line.slice(9)); } catch { return { status: 'fail', kind: 'parse', msg: 'ASC_DATA JSON 이 깨졌다' }; }
    if (j.error === 'SIGNIN') return { status: 'fail', kind: 'signin', msg: 'App Store Connect 로그인 필요(세션 만료) — 대표 재로그인' };
    if (j.error === 'SPACE_BUSY') return { status: 'busy', kind: 'busy', msg: '대표가 브라우저(ego)를 쓰고 있어 건너뜀 — 되찾지 않는다' };
    if (!j.ok) return { status: 'fail', kind: /NO_HEADERS|NOT_LOADED/.test(String(j.error)) ? 'page' : 'parse', msg: String(j.error || '소스 판독 실패').slice(0, 160) };
    const i = Array.isArray(j.days) ? j.days.indexOf(j.latestDay) : -1;
    const at = (g) => (i >= 0 ? Number(g.v[i]) || 0 : 0);
    const srcs = (j.bySource.units || []).map((g) => [SRC_KO[g.key] || g.title, at(g)]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
    const tot = j.total && j.total.units && i >= 0 ? Number(j.total.units[i]) || 0 : srcs.reduce((a, x) => a + x[1], 0);
    const msg = `UTC ${j.latestDay ? j.latestDay.slice(5) : '?'} 첫 다운로드 ${tot}` + (srcs.length ? ` (${srcs.map((x) => x[0] + ' ' + x[1]).join('·')})` : '') + (j.fails && j.fails.length ? ` · ⚠ 일부 호출 실패 ${j.fails.length}건` : '');
    return { status: j.fails && j.fails.length ? 'partial' : 'ok', kind: j.fails && j.fails.length ? 'partial' : '', msg, data: j };
}
function writeAsc(j) {
    const t = now(); const body = Object.assign({}, j, { readAt: t });
    mkdirp(path.dirname(ASC_FILE));
    const tmp = ASC_FILE + '.tmp' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(body)); fs.renameSync(tmp, ASC_FILE);                         // 원자적 교체 — 관제가 반쪽 파일을 읽지 않게
    try { const dir = path.join(IO, S.kstDay(t)); mkdirp(dir); fs.writeFileSync(path.join(dir, `asc-analytics-${kstHM(t).replace(':', '')}.json`), JSON.stringify(body)); } catch { /* 보관 사본 실패는 무시 */ }
    return ASC_FILE.replace(HOME, '~');
}
async function runAsc() {
    let src; try { src = fs.readFileSync(ASC_SCRIPT, 'utf8'); } catch (e) { return { status: 'fail', kind: 'script', msg: 'asc-read.mjs 를 못 읽음: ' + e.code }; }
    const { code, out } = await egoRun('asc-auto', src, 300);
    const ck = codeKind(code, out); if (ck) return Object.assign({ status: ck.kind === 'busy' ? 'busy' : 'fail' }, ck);
    const v = judgeAsc(out);
    if (v.status === 'ok' || v.status === 'partial') {                                              // 정상 판독만 원천 파일을 쓴다 — 실패 출력이 옛 정상 파일을 덮지 않는다
        try { v.file = writeAsc(v.data); } catch (e) { return { status: 'fail', kind: 'write', msg: 'hud-asc.json 쓰기 실패: ' + e.code }; }
    }
    delete v.data;
    return v;
}

// 리딤 집계는 로컬 --count만 실행한다. 자식 출력은 버려 코드·장부 본문을 보관하지 않는다.
function runRedeem() {
    return new Promise(resolve => {
        let child, timer, done = false;
        const finish = code => {
            if (done) return; done = true; clearTimeout(timer);
            resolve(code === 0 ? { status: 'ok', msg: '리딤 장부 집계 갱신', file: S.DIRS.redeemSummary }
                : { status: 'fail', kind: 'count', msg: '리딤 집계 실패 · 다른 판독은 계속' });
        };
        try { child = spawn(process.execPath, [path.join(__dirname, 'redeem-summary.js')], { stdio: 'ignore' }); }
        catch { finish(1); return; }
        timer = setTimeout(() => { child.kill('SIGKILL'); finish(1); }, 35000);
        child.once('error', () => finish(1)); child.once('close', finish);
    });
}

// ── 한 작업 실행 + 상태 기록 ───────────────────────────────────────────────
async function runJob(job, { slot = null } = {}) {
    const unlock = takeLock(job);
    if (!unlock) { log(`${job}: 다른 refresh 가 이미 돌고 있다 — 건너뜀`); return { status: 'busy', kind: 'self', msg: '다른 refresh 실행 중' }; }
    const st0 = readState()[job] || {};
    const t0 = now();
    patchState(job, { lastStartAt: t0, runningSince: t0, slotAt: slot != null ? slot : (st0.slotAt || null), slotTries: slot != null ? (st0.slotAt === slot ? (st0.slotTries || 0) + 1 : 1) : (st0.slotTries || 0) });
    log(`${job}: 시작${slot != null ? ` (슬롯 ${kstHM(slot)} · ${st0.slotAt === slot ? (st0.slotTries || 0) + 1 : 1}번째)` : ' (수동)'}`);
    let v;
    try { v = job === 'redeem' ? await runRedeem() : job === 'rc' ? await runRc() : job === 'asc' ? await runAsc() : await runAds(); }
    catch (e) { v = { status: 'fail', kind: 'exception', msg: String(e && e.stack || e).split('\n').slice(0, 2).join(' | ').slice(0, 200) }; }
    finally { unlock(); }
    const t1 = now(); const ok = v.status === 'ok';
    const prev = readState()[job] || {};
    patchState(job, {
        lastEndAt: t1, runningSince: null, status: v.status, kind: v.kind || '', msg: v.msg || '', file: v.file || prev.file || '', source: v.source || prev.source || null,
        lastOkAt: ok || v.status === 'partial' ? t1 : (prev.lastOkAt || null),       // partial = 일부 읽음(원천 파일은 새로 써졌다)
        lastFailAt: ok || v.status === 'partial' || v.status === 'busy' ? (prev.lastFailAt || null) : t1,
        streak: ok || v.status === 'partial' ? 0 : (v.status === 'busy' ? (prev.streak || 0) : (prev.streak || 0) + 1),
    });
    log(`${job}: ${v.status}${v.kind ? '(' + v.kind + ')' : ''}${v.source ? ' [' + v.source + ']' : ''} · ${v.msg || ''}${v.file ? ' → ' + v.file : ''} · ${Math.round((t1 - t0) / 1000)}초`);
    return v;
}

// ── 시각표를 보고 «제때 안 된 것만» (launchd 가 부른다) ──────────────────────
async function auto({ schedule = S.loadSchedule(), run = runJob, getState = readState, at = now(), logger = log } = {}) {
    const sch = schedule; if (!sch) { logger('refresh-schedule.json 을 못 읽음'); return 1; }
    const t = at; let fails = 0, ran = 0;
    // 기존 launchd 시각표의 매 호출(재시도 포함)에 1회. 공급사 판독의 성공·로그인 상태와 독립적이다.
    try { const v = await run('redeem'); if (v.status === 'fail') fails++; }
    catch { fails++; logger('리딤 집계 실패 · 다른 판독은 계속'); }
    for (const job of ['rc', 'ads', 'asc']) {
        if (!(sch[job] || []).length) continue;                                                      // 시각표에 없는 작업(옛 표)은 건너뛴다
        const due = S.prevSlot(sch[job], t);
        if (due == null || t - due > sch.windowMin * 60e3) { logger(`${job}: 지금 할 슬롯 없음(마지막 ${due ? kstHM(due) : '-'} · ${due ? Math.round((t - due) / 60000) : '-'}분 전)`); continue; }
        const js = getState()[job] || {};
        if ((js.lastOkAt || 0) >= due) { logger(`${job}: ${kstHM(due)} 슬롯은 이미 정상(${ts(js.lastOkAt)}) — 건너뜀`); continue; }
        const tries = js.slotAt === due ? (js.slotTries || 0) : 0;
        const noRetry = js.slotAt === due && (js.kind === 'session' || js.kind === 'signin');           // 로그인 만료는 재시도해도 같다 — 다음 슬롯에 한 번만 본다
        if (tries >= 2 || (tries >= 1 && noRetry)) { logger(`${job}: ${kstHM(due)} 슬롯 ${tries}번 시도했다${noRetry ? '(로그인 필요 — 재시도 안 함)' : ''} — 다음 슬롯까지 기다림`); continue; }
        if (tries >= 1 && js.lastStartAt && t - js.lastStartAt < (sch.retryAfterMin - 2) * 60e3) { logger(`${job}: 재시도는 ${sch.retryAfterMin}분 뒤`); continue; }
        ran++;
        const v = await run(job, { slot: due });
        if (v.status === 'fail') fails++;
    }
    if (!ran) logger('공급사 판독 슬롯 없음 · 리딤 집계 회차 완료');
    return fails ? 1 : 0;
}

// ── launchd 등록 ──────────────────────────────────────────────────────────
function plistXml() {
    const sch = S.loadSchedule(); if (!sch) throw new Error('refresh-schedule.json 없음');
    const times = new Set();
    for (const k of ['rc', 'ads', 'asc']) for (const t of (sch[k] || [])) {
        times.add(t);
        const [h, m] = t.split(':').map(Number); const r = (h * 60 + m + sch.retryAfterMin) % 1440;           // 재시도 호출(슬롯 + retryAfterMin)
        times.add(String(Math.floor(r / 60)).padStart(2, '0') + ':' + String(r % 60).padStart(2, '0'));
    }
    const ent = [...times].sort().map((t) => { const [h, m] = t.split(':').map(Number); return `    <dict><key>Hour</key><integer>${h}</integer><key>Minute</key><integer>${m}</integer></dict>`; }).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>${path.join(ROOT, 'scripts', 'hud', 'refresh.sh')}</string><string>auto</string></array>
  <key>StartCalendarInterval</key>
  <array>
${ent}
  </array>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${LOG}</string>
  <key>StandardErrorPath</key><string>${LOG}</string>
</dict>
</plist>
`;
}
const uid = () => process.getuid();
const sh = (cmd, args) => { try { return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { ok: false, out: String((e.stderr || '') + (e.stdout || '') || e.message).trim() }; } };
function install() {
    const xml = plistXml();
    mkdirp(path.dirname(PLIST)); mkdirp(path.dirname(LOG));
    fs.writeFileSync(PLIST, xml);
    const lint = sh('/usr/bin/plutil', ['-lint', PLIST]); if (!lint.ok) { console.log('plist 문법 오류:', lint.out); return 1; }
    patchTop({ installedAt: now() });
    sh('/bin/launchctl', ['bootout', `gui/${uid()}/${LABEL}`]);                                  // 이미 있으면 내린다(없으면 오류 — 무시)
    const r = sh('/bin/launchctl', ['bootstrap', `gui/${uid()}`, PLIST]);
    console.log(r.ok ? `등록 완료: ${PLIST.replace(HOME, '~')}` : `등록 실패: ${r.out}`);
    console.log(sh('/bin/launchctl', ['list']).out.split('\n').filter((l) => l.includes('hud-refresh')).join('\n') || '(launchctl list 에 없음)');
    return r.ok ? 0 : 1;
}
function uninstall() { const r = sh('/bin/launchctl', ['bootout', `gui/${uid()}/${LABEL}`]); console.log(r.ok ? '내림' : r.out); try { fs.unlinkSync(PLIST); console.log('plist 삭제'); } catch { /* 없다 */ } return 0; }
function status() {
    const R = S.loadRefresh(); if (!R) { console.log('시각표를 못 읽음'); return 1; }
    for (const [k, j] of Object.entries(R.jobs)) {
        console.log(`${j.name.padEnd(10)} 시각 ${j.times.join(' ')} · 다음 ${j.next ? ts(j.next) : '-'} · 마지막 시도 ${j.lastStartAt ? ts(j.lastStartAt) : '없음'} · 결과 ${j.status || '-'}${j.kind ? '(' + j.kind + ')' : ''}${j.running ? ' · 실행 중' : ''}${j.overdue ? ' · ⚠ 예정 시각이 지났는데 시도 없음' : ''}`);
        if (j.msg) console.log(`           ${j.msg}`);
    }
    const l = sh('/bin/launchctl', ['list']).out.split('\n').filter((x) => x.includes('hud-refresh'));
    console.log('launchd: ' + (l.length ? l.join(' ') : '등록 안 됨'));
    return 0;
}

function trimLog() { try { const st = fs.statSync(LOG); if (st.size > 1.5e6) { const b = fs.readFileSync(LOG); fs.writeFileSync(LOG, b.slice(b.length - 300000)); } } catch { /* 로그가 없다 */ } }

module.exports = { judgeRc, judgeAds, judgeAsc, plistXml, codeKind, asaApiReady, API_FAIL_KIND, auto };       // 시험(verify.js)용 — 명령줄로 부를 때만 아래가 돈다

if (require.main === module) (async () => {
    const [cmd, arg] = process.argv.slice(2);
    trimLog();
    if (cmd === 'auto') process.exit(await auto());
    if (cmd === 'run') {
        const jobs = arg === 'all' ? ['rc', 'ads', 'asc'] : (arg === 'rc' || arg === 'ads' || arg === 'asc') ? [arg] : null;
        if (!jobs) { console.log('사용: refresh.js run rc|ads|asc|all'); process.exit(2); }
        let bad = 0; for (const j of jobs) { const v = await runJob(j); if (v.status === 'fail') bad++; }
        process.exit(bad ? 1 : 0);
    }
    if (cmd === 'install') process.exit(install());
    if (cmd === 'uninstall') process.exit(uninstall());
    if (cmd === 'status') process.exit(status());
    if (cmd === 'plist') { process.stdout.write(plistXml()); process.exit(0); }
    console.log('사용: node scripts/hud/refresh.js run rc|ads|asc|all | auto | install | uninstall | status | plist');
    process.exit(2);
})();
