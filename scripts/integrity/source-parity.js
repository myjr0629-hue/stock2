'use strict';
// Independent EquitiesEdge comparison. Budget includes initial AND confirmation
// reads; no retries, redirects, or substitution of the hub for the source.
const clock = require('./clock');
const targets = require('./source-parity-target');
const MAX_SYMBOLS = 41;
const MAX_SOURCE_CALLS = 82; // One initial read + at most one confirmation per symbol.
const WINDOW_MS = 2000;
const CONFIRM_MS = 20000;
const STALE_MS = 60000;
const positive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const time = (v) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : NaN;
    return positive(n) ? n : null;
};
const key = (f) => `${f.code}|${f.sym}|${f.door}|${f.field}`;
const issue = (code, sym, door, field, msg, extra = {}) => ({ sev: 'warn', code, sym, door, field, msg, ...extra });

function environmentWarnings(symbols) {
    return symbols.map((sym) => issue('SOURCE_PARITY_ENVIRONMENT', sym, 'source', 'target', '감시 대상 설정 혼합·불일치 또는 조회 대상 증거 누락 — 원천 대조 판정 보류'));
}

function judge(snapshot, symbols, target = targets.resolve()) {
    const out = [];
    if (!target || snapshot?.environmentMismatch) return environmentWarnings(symbols);
    if (snapshot?.sessionAborted) return symbols.map((sym) => issue('SOURCE_PARITY_SESSION_ABORTED', sym, 'source', 'timing', 'REG 종료로 장외 중단 — 원천 대조 판정 보류'));
    if (!snapshot || snapshot.failure) return symbols.map((sym) => issue('SOURCE_UNAVAILABLE', sym, 'source', 'coverage', '독립 원천 조회 실패 — 시세 일치 미확인'));
    if (!targets.matches(snapshot.target, target)) return environmentWarnings(symbols);
    if (!time(snapshot.at) || clock.sessionAt(snapshot.at).session !== 'regular') return symbols.map((sym) => issue('SOURCE_UNAVAILABLE', sym, 'source', 'timing', '독립 원천 수집 시각이 REG가 아님 — 대조 불가'));
    for (const sym of symbols) {
        const r = snapshot.rows?.[sym];
        if (!r || !positive(r.source?.p) || !time(r.source?.t)) {
            out.push(issue('SOURCE_UNAVAILABLE', sym, 'source', 'coverage', 'EquitiesEdge 가격·체결 시각 없음 — 대조 불가'));
            continue;
        }
        if (!positive(r.started) || !positive(r.ended) || r.ended < r.started || r.ended - r.started > WINDOW_MS || clock.sessionAt(r.ended).session !== 'regular') {
            out.push(issue('SOURCE_PARITY_WINDOW', sym, 'source', 'timing', '세 경로 수집이 REG 2초 창을 벗어남 — 대조 불가'));
            continue;
        }
        for (const door of ['app', 'hub']) {
            const v = r[door];
            if (!positive(v?.p) || (door === 'hub' && snapshot.live !== true)) {
                out.push(issue('SOURCE_UNAVAILABLE', sym, door, 'coverage', `${door} 실시간 가격 없음 — 대조 불가`));
                continue;
            }
            const deltaPct = 100 * (v.p - r.source.p) / r.source.p;
            // App timestamps must be the conveyed source last_time, never lastUpdate.
            const valueTime = time(door === 'app' ? v.last_time : v.t);
            if (Math.abs(deltaPct) > 0.10 + 1e-10) out.push({
                sev: 'error', code: 'SOURCE_PARITY', sym, door, field: 'price', app: v.p, ref: r.source.p,
                deltaPct, appTime: valueTime, sourceTime: time(r.source.t),
                msg: `${door} ${v.p} ≠ EquitiesEdge ${r.source.p} (${deltaPct.toFixed(4)}%) · ${door} 체결 ${valueTime ?? '미제공'} · 원천 체결 ${time(r.source.t)}`,
            });
        }
        if (positive(r.app?.p)) {
            const appTime = time(r.app.last_time), sourceTime = time(r.source.t);
            if (!appTime) out.push(issue('SOURCE_PARITY_APP_TIME', sym, 'app', 'last_time', '앱 값의 원천 last_time 미제공 — STALE_APP 대조 불가', { sourceTime, appTime: null }));
            else if (sourceTime - appTime > STALE_MS) out.push({
                sev: 'error', code: 'STALE_APP', sym, door: 'app', field: 'last_time', app: appTime, ref: sourceTime,
                appTime, sourceTime, msg: `앱 값의 원천 last_time이 최신 원천 체결보다 ${((sourceTime - appTime) / 1000).toFixed(1)}초 낡음 · 앱 원천 ${appTime} · 최신 원천 ${sourceTime}`,
            });
        }
    }
    return out;
}

async function monitor({ symbols, target = targets.resolve({ base: process.env.INTEGRITY_BASE, hub: process.env.INTEGRITY_HUB }), collect = collectRemote, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, noConfirm = false }) {
    if (clock.sessionAt(now()).session !== 'regular') return { skipped: true, calls: 0, findings: [] };
    const list = [...new Set(symbols)];
    if (!targets.matches(target, targets.resolve(target || {}))) return { calls: 0, target: null, findings: environmentWarnings(list) };
    // Freeze a copy for both reads; a collector cannot change the round target.
    target = Object.freeze({ ...target });
    if (list.length > MAX_SYMBOLS || list.some((s) => !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(s))) {
        return { calls: 0, findings: list.map((sym) => issue('SOURCE_UNAVAILABLE', sym, 'source', 'symbols', '감시 대상은 유효한 41종목 이하이어야 함')) };
    }
    let calls = list.length; // Reserve before dispatch, including failed/timed-out attempts.
    const initial = sanitize(await collect(list, target).catch(() => ({ failure: true })), list, target);
    let findings = judge(initial, list, target);
    const candidates = findings.filter((f) => f.sev === 'error');
    const retry = [...new Set(candidates.map((f) => f.sym))];
    let confirmation = null;
    if (retry.length) {
        if (noConfirm || calls + retry.length > MAX_SOURCE_CALLS) {
            findings = findings.map((f) => f.sev === 'error' ? { ...f, sev: 'warn', code: `UNCONFIRMED_${f.code}`, msg: `${noConfirm ? '재확인 비활성' : '회차 원천 82회 상한으로 재확인 불가'} — ${f.msg}` } : f);
        } else {
            await sleep(CONFIRM_MS);
            if (clock.sessionAt(now()).session !== 'regular') confirmation = { failure: true };
            else { calls += retry.length; confirmation = sanitize(await collect(retry, target).catch(() => ({ failure: true })), retry, target); }
            const second = judge(confirmation, retry, target), byKey = new Map(second.map((f) => [key(f), f]));
            findings = findings.filter((f) => f.sev !== 'error');
            for (const f of candidates) {
                const again = byKey.get(key(f));
                if (again?.sev === 'error') findings.push({ ...again, confirmed: true, msg: `${again.msg} [20초 뒤 재확인에도 남음]` });
                else {
                    const unavailable = !confirmation || confirmation.failure || !Object.keys(confirmation.rows || {}).length || second.some((x) => x.sev === 'warn' && (x.sym === f.sym || !x.sym) && (x.door === f.door || x.door === 'source') && (x.code !== 'SOURCE_PARITY_APP_TIME' || f.code === 'STALE_APP')) || clock.sessionAt(confirmation.at).session !== 'regular';
                    findings.push({ ...f, sev: 'warn', code: `${unavailable ? 'UNCONFIRMED' : 'TRANSIENT'}_${f.code}`, msg: `${unavailable ? '재확인 자료 부족' : '20초 뒤 사라짐'} — ${f.msg}` });
                }
            }
            findings.push(...second.filter((f) => f.sev === 'warn'));
        }
    }
    return { skipped: false, target, calls, maxCalls: MAX_SOURCE_CALLS, windowMs: WINDOW_MS, initial, confirmation, findings };
}

async function collectRemote(symbols, target = targets.resolve({ base: process.env.INTEGRITY_BASE, hub: process.env.INTEGRITY_HUB })) {
    if (!targets.matches(target, targets.resolve(target || {}))) return { environmentMismatch: true };
    // ec2-ssm.js normally loads .env.local. Explicitly suppress that read.
    const prior = process.env.ENV_FILE;
    let ssm;
    try { process.env.ENV_FILE = '/dev/null'; ssm = require('../ec2-ssm'); }
    finally { if (prior === undefined) delete process.env.ENV_FILE; else process.env.ENV_FILE = prior; }
    const fs = require('node:fs');
    const path = require('node:path');
    const clockCode = fs.readFileSync(path.join(__dirname, 'clock.js'), 'utf8');
    const workerCode = fs.readFileSync(path.join(__dirname, 'source-parity-worker.js'), 'utf8');
    const targetCode = fs.readFileSync(path.join(__dirname, 'source-parity-target.js'), 'utf8');
    const config = JSON.stringify({ symbols, target });
    // Public code/config only. Secrets remain inside the remote PM2 environment.
    const program = `const clock=(()=>{const module={exports:{}};${clockCode}\nreturn module.exports;})();const targetConfig=(()=>{const module={exports:{}};${targetCode}\nreturn module.exports;})();const module={exports:{}};${workerCode}\nmodule.exports.run(${config}, {clock,targetConfig}).then(r=>process.stdout.write(JSON.stringify(r))).catch(()=>process.stdout.write('{"failure":true}'));`;
    const encoded = Buffer.from(program).toString('base64');
    const command = `node -e 'eval(Buffer.from("${encoded}","base64").toString())'`;
    const result = await ssm.run([command], { timeout: 15 });
    if (result.status !== 'Success') return { failure: true };
    // Never surface raw SSM stdout/stderr or exception messages.
    return sanitize(JSON.parse(result.stdout), symbols, target);
}

function sanitize(snapshot, symbols, target = targets.resolve()) {
    if (snapshot?.environmentMismatch || !target) return { environmentMismatch: true };
    if (snapshot?.sessionAborted) return { sessionAborted: true };
    if (!snapshot || snapshot.failure) return { failure: true };
    if (!targets.matches(snapshot.target, target)) return { environmentMismatch: true };
    const rows = {};
    for (const sym of symbols) {
        const r = snapshot.rows?.[sym]; if (!r) continue;
        const pick = (v) => ({ p: positive(v?.p) ? v.p : null, t: time(v?.t) });
        rows[sym] = { app: { p: positive(r.app?.p) ? r.app.p : null, last_time: time(r.app?.last_time) }, hub: pick(r.hub), source: pick(r.source), started: time(r.started), ended: time(r.ended) };
    }
    return { at: time(snapshot.at), target: { ...target }, live: snapshot.live === true, rows };
}
module.exports = { monitor, judge, sanitize, collectRemote, environmentWarnings, MAX_SYMBOLS, MAX_SOURCE_CALLS, WINDOW_MS, CONFIRM_MS, STALE_MS };
