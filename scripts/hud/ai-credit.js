#!/usr/bin/env node
/* ============================================================================
 * 관제 «AI 크레딧» 칸의 원천 — 운영 /api/admin/ai-ladder 의 숫자만 ~/signum-ego-io/hud-ai-credit.json 에 적는다.
 *
 *   node scripts/hud/ai-credit.js                  운영에서 한 번 읽어 쓴다(비밀은 환경변수/파일에서 — 아래)
 *   node scripts/hud/ai-credit.js --from <json>    이미 받아 둔 응답 파일에서 만든다(오프라인 시험·재생성)
 *   node scripts/hud/ai-credit.js --print          쓰지 않고 화면에만 (숫자만 — 비밀값은 어디에도 찍지 않는다)
 *
 * 비밀(CRON_SECRET): 환경변수 HUD_CRON_SECRET, 또는 HUD_CRON_SECRET_FILE(기본 ~/.config/signum/cron-secret, 권한 600 이어야 한다)에서 읽는다.
 *   저장소에는 비밀이 없다. 응답에서 키·토큰 모양 필드는 애초에 고르지 않는다(숫자·상태 문자열만 골라 쓴다).
 * 원칙: 읽기 전용(GET) · 실패하면 옛 파일을 덮지 않는다(화면이 «N분 전»을 보여 준다).
 * ========================================================================== */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = process.env.HUD_AI_CREDIT || path.join(os.homedir(), 'signum-ego-io', 'hud-ai-credit.json');
const BASE = process.env.HUD_SITE || 'https://www.signumhq.com';
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };

function secret() {
    if (process.env.HUD_CRON_SECRET) return process.env.HUD_CRON_SECRET.trim();
    const f = process.env.HUD_CRON_SECRET_FILE || path.join(os.homedir(), '.config', 'signum', 'cron-secret');
    try {
        if ((fs.statSync(f).mode & 0o077) !== 0) throw new Error('비밀 파일 권한이 600 이 아니다: ' + f);
        return fs.readFileSync(f, 'utf8').trim();
    } catch (e) { throw new Error('CRON_SECRET 을 못 읽음(HUD_CRON_SECRET 또는 ' + f + '): ' + e.message); }
}

/** /api/admin/ai-ladder 응답 → 관제용 숫자 묶음 (숫자·상태 문자열만 고른다) */
function pick(j, at = Date.now()) {
    const p = j && j.pacing, st = j && j.status;
    if (!p || typeof p.spentUsd !== 'number') throw new Error('응답에 pacing 이 없다(배포 전이거나 인증 실패)');
    const d = p.decision || {};
    return {
        at, spentUsd: p.spentUsd, targetUsd: p.targetUsd, capUsd: p.capUsd,
        todayTargetUsd: d.todayTargetUsd ?? null, last24hUsd: d.last24hUsd ?? null,
        level: p.level, mode: p.mode, ratio: d.ratio ?? null,
        projectedEndUsd: d.projectedEndUsd ?? null, projectedUsedPct: d.projectedUsedPct ?? null,
        renewsAt: p.renewsAt, daysLeft: d.daysLeft ?? null,
        killSwitch: st ? !!st.killSwitch : null,
    };
}

async function main() {
    let j;
    const from = arg('--from');
    if (from) j = JSON.parse(fs.readFileSync(from, 'utf8'));
    else {
        const r = await fetch(BASE + '/api/admin/ai-ladder?hours=1', { headers: { authorization: 'Bearer ' + secret() }, signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        j = await r.json();
    }
    const snap = pick(j, from ? (fs.statSync(from).mtimeMs | 0) : Date.now());
    if (process.argv.includes('--print')) { console.log(JSON.stringify(snap, null, 1)); return; }
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    const tmp = OUT + '.tmp' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(snap, null, 1)); fs.renameSync(tmp, OUT);
    console.log(`AI 크레딧: 누적 $${snap.spentUsd.toFixed(2)} / $${snap.targetUsd} · 단계 ${snap.level} (${snap.mode}) → ${OUT.replace(os.homedir(), '~')}`);
}
if (require.main === module) main().catch((e) => { console.error('ai-credit 실패:', e.message); process.exit(1); });
module.exports = { pick };
